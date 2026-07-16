import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { prisma } from "@/lib/prisma";
import { AGENT_MODEL, AINotConnectedError, getAnthropicClient, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";

const FollowUpResponseSchema = z.object({
  conversationSummary: z.string().trim().min(1),
  recommendedNextStep: z.string().trim().min(1),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  suggestMeeting: z.boolean(),
});

export interface FollowUpSuggestion {
  conversationSummary: string;
  recommendedNextStep: string;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  suggestMeeting: boolean;
  bestFollowUpTime: string;
  bestFollowUpTimeIsReal: boolean;
}

/**
 * "Best follow-up time" — a documented heuristic. If this contact has real
 * historical open/reply timestamps, uses the real hour-of-day they engaged
 * at; otherwise falls back to a sensible fixed default, clearly labeled as
 * not measured. Never presents the default as if it were observed.
 */
async function computeBestFollowUpTime(contactId: string): Promise<{ text: string; isReal: boolean }> {
  const [openedDraft, reply] = await Promise.all([
    prisma.emailDraft.findFirst({ where: { contactId, firstOpenedAt: { not: null } }, orderBy: { firstOpenedAt: "desc" }, select: { firstOpenedAt: true } }),
    prisma.reply.findFirst({ where: { contactId }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
  ]);

  const realTimestamp = reply?.receivedAt ?? openedDraft?.firstOpenedAt;
  if (realTimestamp) {
    const hour = realTimestamp.getHours();
    const dayName = realTimestamp.toLocaleDateString(undefined, { weekday: "long" });
    return { text: `Around ${hour}:00 (based on when they previously ${reply ? "replied" : "opened an email"}, ${dayName})`, isReal: true };
  }
  return { text: "Tue–Thu, 10am recipient local time (no engagement history yet — a general best-practice default)", isReal: false };
}

/** One real AI call reasoning over the contact's real EmailDraft/Reply history — never fabricates history that isn't there. */
export async function suggestFollowUp(contactId: string): Promise<FollowUpSuggestion> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const contact = await prisma.contact.findUniqueOrThrow({
    where: { id: contactId },
    include: {
      emailDrafts: { where: { status: { in: ["SENT", "FAILED"] } }, orderBy: { createdAt: "desc" }, take: 10 },
      replies: { orderBy: { receivedAt: "desc" }, take: 10 },
    },
  });

  const bestFollowUpTime = await computeBestFollowUpTime(contactId);

  const historyLines = [
    ...contact.emailDrafts.map((d) => `[${d.status}] ${d.channel} — ${d.purpose} — sent ${d.sentAt?.toISOString() ?? "n/a"}${d.openCount > 0 ? `, opened ${d.openCount}x` : ""}${d.clickCount > 0 ? `, clicked ${d.clickCount}x` : ""}`),
    ...contact.replies.map((r) => `[REPLY, ${r.channel}] ${r.receivedAt.toISOString()}: ${r.content.slice(0, 300)}`),
  ];

  const persona = getPersona("OUTREACH");
  const client = getAnthropicClient();
  const outreachAgent = await prisma.aIAgentInstance.findFirst({ where: { organizationId: contact.organizationId, type: "OUTREACH" } });

  if (outreachAgent) {
    await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "ANALYZING", currentTask: `Planning follow-up for ${contact.firstName}` } });
  }

  try {
    const response = await client.messages.parse({
      model: AGENT_MODEL,
      max_tokens: 800,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(FollowUpResponseSchema) },
      system: `${persona.systemPrompt}\n\nYou're deciding what to do next with a real prospect based on their real outreach history below. If there's no history yet, say the honest next step is simply the first outreach. Never invent a reply or open event that isn't in the data.`,
      messages: [
        {
          role: "user",
          content:
            historyLines.length > 0
              ? `Real outreach history for ${contact.firstName} ${contact.lastName ?? ""}:\n${historyLines.join("\n")}\n\nSuggest the follow-up plan.`
              : `No outreach history exists yet for ${contact.firstName} ${contact.lastName ?? ""}. Suggest the honest first step.`,
        },
      ],
    });

    if (outreachAgent) {
      await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "COMPLETED" } });
    }
    if (!response.parsed_output) throw new Error("Follow-up suggestion failed schema validation.");

    return {
      ...response.parsed_output,
      bestFollowUpTime: bestFollowUpTime.text,
      bestFollowUpTimeIsReal: bestFollowUpTime.isReal,
    };
  } catch (error) {
    if (outreachAgent) {
      await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "IDLE" } }).catch(() => {});
    }
    throw error;
  }
}
