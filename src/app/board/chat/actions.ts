"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { runAgentTurn } from "@/lib/ai/agent-runtime";
import { EXECUTIVE_AGENT_TYPES, type ExecutiveAgentType } from "@/lib/ai/personas";
import { sendAgentMessageSchema, type SendAgentMessageInput } from "@/lib/validations/board";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
  /** Set when the user's message posted fine but the agent's real-time reply failed. */
  replyError?: string;
  replyErrorKind?: "not_connected" | "billing" | "generic";
}

/**
 * Every real Claude call this route triggers costs real money — caps how
 * often one signed-in user can kick off an agent reply, independent of the
 * per-request auth checks below. Mirrors board/meetings/[id]/actions.ts.
 */
function checkChatAiRateLimit(userId: string): boolean {
  return checkRateLimit(`board-chat-ai:${userId}`, { limit: 20, windowMs: 5 * 60_000 }).allowed;
}

function describeAIError(error: unknown): { error: string; errorKind: "not_connected" | "billing" | "generic" } {
  if (error instanceof AINotConnectedError) {
    return {
      errorKind: "not_connected",
      error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment.",
    };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return {
      errorKind: "billing",
      error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing.",
    };
  }
  console.error("[board/chat] AI call failed:", error);
  return { errorKind: "generic", error: "Something went wrong contacting the agent. Please try again." };
}

/** Walks the parentId chain (bounded depth) to give the replying agent real conversational context. */
async function buildThreadContext(startId: string): Promise<string | undefined> {
  const lines: string[] = [];
  let currentId: string | null = startId;
  let hops = 0;
  while (currentId && hops < 10) {
    const node: { content: string; parentId: string | null; senderAgent: { name: string } } | null =
      await prisma.agentConversation.findUnique({
        where: { id: currentId },
        select: { content: true, parentId: true, senderAgent: { select: { name: true } } },
      });
    if (!node) break;
    lines.unshift(`${node.senderAgent.name}: ${node.content}`);
    currentId = node.parentId;
    hops += 1;
  }
  return lines.length ? lines.join("\n") : undefined;
}

/**
 * Posts a message into the inter-agent chat channel.
 *
 * Judgment call: AgentConversation.senderAgentId is a required (non-null)
 * field in the schema — there is no "senderUserId" on this model the way
 * there is on MeetingMessage/Task/Activity, so a human-composed message has
 * no agent-less representation available. This action attributes
 * human-sent messages to the organization's CEO agent (the board's natural
 * relay point per its persona: "assigning tasks... running and chairing
 * meetings"), while the acting human is recorded via Activity/AuditLog.
 *
 * If a specific receiverAgentId was given, this also fires a real Claude
 * call asking that agent to reply, storing the genuine response as a new
 * AgentConversation row (parentId = the just-created message). A failure
 * here (no key / no credits / rate-limited / unsupported agent type) is
 * reported back via replyError — the user's own message still posts.
 */
export async function sendAgentMessage(input: SendAgentMessageInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = sendAgentMessageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the message details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  const ceoAgent = await prisma.aIAgentInstance.findUnique({
    where: { organizationId_type: { organizationId, type: "CEO" } },
  });
  if (!ceoAgent) {
    return { ok: false, error: "Your organization's CEO agent hasn't been provisioned yet. Finish onboarding first." };
  }

  let receiverAgent: { id: string; type: string; name: string } | null = null;
  if (parsed.data.receiverAgentId) {
    const agent = await prisma.aIAgentInstance.findFirst({
      where: { id: parsed.data.receiverAgentId, organizationId },
      select: { id: true, type: true, name: true },
    });
    if (!agent) return { ok: false, error: "That agent could not be found." };
    receiverAgent = agent;
  }

  if (parsed.data.parentId) {
    const parent = await prisma.agentConversation.findFirst({
      where: { id: parsed.data.parentId, organizationId },
      select: { id: true },
    });
    if (!parent) return { ok: false, error: "The message you're replying to no longer exists." };
  }

  let messageId: string;
  try {
    const message = await prisma.agentConversation.create({
      data: {
        organizationId,
        senderAgentId: ceoAgent.id,
        receiverAgentId: receiverAgent?.id ?? null,
        reason: parsed.data.reason,
        priority: parsed.data.priority,
        content: parsed.data.content,
        parentId: parsed.data.parentId ?? null,
      },
    });
    messageId = message.id;

    await logActivity({
      organizationId,
      type: "AGENT_MESSAGE",
      description: `${session.user?.name ?? "A board member"} sent a message via ${ceoAgent.name} to ${
        receiverAgent ? receiverAgent.name : "the whole board"
      }.`,
      actorUserId: userId,
      metadata: { conversationId: message.id, receiverAgentId: receiverAgent?.id ?? null },
    });
    await logAudit({
      userId,
      organizationId,
      action: "board.chat_message_sent",
      metadata: { conversationId: message.id, receiverAgentId: receiverAgent?.id ?? null },
    });
  } catch (error) {
    console.error("[board/chat] sendAgentMessage failed to create message:", error);
    return { ok: false, errorKind: "generic", error: "Something went wrong sending your message. Please try again." };
  }

  revalidatePath("/board/chat");

  if (!receiverAgent) {
    return { ok: true };
  }

  if (!(EXECUTIVE_AGENT_TYPES as readonly string[]).includes(receiverAgent.type)) {
    return {
      ok: true,
      replyErrorKind: "generic",
      replyError: `${receiverAgent.name} isn't an executive agent capable of an AI reply yet.`,
    };
  }

  if (!checkChatAiRateLimit(userId)) {
    return {
      ok: true,
      replyErrorKind: "generic",
      replyError: "Too many AI messages requested — wait a few minutes and try again.",
    };
  }

  try {
    const conversationContext = await buildThreadContext(messageId);
    const result = await runAgentTurn({
      agentId: receiverAgent.id,
      agentType: receiverAgent.type as ExecutiveAgentType,
      agentName: receiverAgent.name,
      task: `You've received a direct message on the board's inter-agent channel (reason: "${parsed.data.reason}", priority: ${parsed.data.priority}): "${parsed.data.content}". Reply directly and specifically, as yourself.`,
      conversationContext,
      effort: "medium",
    });

    const reply = await prisma.agentConversation.create({
      data: {
        organizationId,
        senderAgentId: receiverAgent.id,
        receiverAgentId: ceoAgent.id,
        reason: `Reply to: ${parsed.data.reason}`,
        priority: parsed.data.priority,
        content: result.content,
        parentId: messageId,
      },
    });

    await logActivity({
      organizationId,
      type: "AGENT_MESSAGE",
      description: `${receiverAgent.name} replied on the inter-agent channel.`,
      actorAgentId: receiverAgent.id,
      metadata: { conversationId: reply.id, parentId: messageId },
    });
  } catch (error) {
    revalidatePath("/board/chat");
    const described = describeAIError(error);
    return { ok: true, replyErrorKind: described.errorKind, replyError: described.error };
  }

  revalidatePath("/board/chat");
  return { ok: true };
}
