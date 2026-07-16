"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { AGENT_MODEL, getAnthropicClient, isAIConnected } from "@/lib/ai/client";
import type { DraftChannel, ReplySentiment } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

const SentimentSchema = z.object({ sentiment: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"]) });

/** Real AI sentiment classification over real, already-logged reply text — never runs on anything fabricated, and silently skipped (leaves sentiment null) if AI isn't connected. */
async function classifySentiment(content: string): Promise<ReplySentiment | null> {
  if (!isAIConnected()) return null;
  try {
    const client = getAnthropicClient();
    const response = await client.messages.parse({
      model: AGENT_MODEL,
      max_tokens: 100,
      output_config: { effort: "low", format: zodOutputFormat(SentimentSchema) },
      system: "Classify the sentiment of this real B2B cold-outreach reply as POSITIVE (interested), NEUTRAL (unclear/needs more info), or NEGATIVE (not interested/unsubscribe).",
      messages: [{ role: "user", content }],
    });
    return response.parsed_output?.sentiment ?? null;
  } catch (error) {
    console.error("[outreach] classifySentiment failed:", error);
    return null;
  }
}

export interface LogReplyResult extends ActionResult {
  replyId?: string;
  sentiment?: ReplySentiment | null;
}

/** The real, manual "I got a reply" entry point — a Reply row is only ever created from a real person's own account of what a prospect wrote back. */
export async function logReply(contactId: string, content: string, channel: DraftChannel, emailDraftId?: string): Promise<LogReplyResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!content.trim()) return { ok: false, error: "Enter what the prospect actually wrote back." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.organizationId !== membership.organizationId) return { ok: false, error: "Contact not found." };

  const sentiment = await classifySentiment(content);

  const reply = await prisma.reply.create({
    data: {
      organizationId: membership.organizationId,
      contactId,
      emailDraftId: emailDraftId || null,
      channel,
      content: content.trim(),
      sentiment,
      loggedByUserId: userId,
    },
  });

  const nextStatus = sentiment === "POSITIVE" ? "INTERESTED" : sentiment === "NEGATIVE" ? "NOT_INTERESTED" : "REPLIED";
  await prisma.contact.update({ where: { id: contactId }, data: { status: nextStatus } });

  // Sync back to the linked Company — a real reply is a real CRM-worthy
  // signal, same "sync status forward, never backward" rule as
  // addCompanyToCrm's PROSPECT->LEAD bump.
  if (contact.companyId && sentiment === "POSITIVE") {
    const company = await prisma.company.findUnique({ where: { id: contact.companyId } });
    if (company?.status === "PROSPECT") {
      await prisma.company.update({ where: { id: contact.companyId }, data: { status: "LEAD" } });
    }
  }

  await notifyUser({
    userId: contact.ownerUserId ?? userId,
    organizationId: membership.organizationId,
    type: "CRM_EVENT",
    title: "New reply logged",
    message: `${contact.firstName} replied${sentiment ? ` (${sentiment.toLowerCase()})` : ""}.`,
  });

  await logAudit({ userId, organizationId: membership.organizationId, action: "outreach.reply_logged", metadata: { contactId, replyId: reply.id, sentiment } });
  revalidatePath("/dashboard/outreach");
  revalidatePath(`/dashboard/outreach/contacts/${contactId}`);
  return { ok: true, replyId: reply.id, sentiment };
}
