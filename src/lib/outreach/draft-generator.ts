import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { prisma } from "@/lib/prisma";
import { AGENT_MODEL, AINotConnectedError, getAnthropicClient, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import { buildContactContext } from "./personalization";
import type { DraftChannel, DraftPurpose, EmailTone, EmailDraft } from "@/generated/prisma/client";

const DraftResponseSchema = z.object({
  subject: z.string().trim().max(150).optional(),
  body: z.string().trim().min(1),
  // Which real facts from the context were actually woven in — powers
  // "Highlight personalization" in the preview UI, recorded honestly by the
  // model itself rather than guessed after the fact.
  personalizationNotes: z.array(z.string().trim().min(1)).max(6),
});

const PURPOSE_LABEL: Record<DraftPurpose, string> = {
  INTRODUCTION: "a first-touch introduction email",
  FOLLOW_UP: "a follow-up email to a prospect who hasn't replied yet",
  MEETING_REQUEST: "a meeting request email",
  PRODUCT_INTRODUCTION: "an email introducing a specific product/service",
  PROPOSAL_REQUEST: "an email asking to send over a proposal",
  CASE_STUDY: "an email sharing a relevant case study",
  THANK_YOU: "a thank-you email",
  REMINDER: "a gentle reminder email",
  RE_ENGAGEMENT: "a re-engagement email to a cold/inactive prospect",
  CONNECTION_REQUEST: "a LinkedIn connection request note",
  CONVERSATION_SUMMARY: "a short LinkedIn message summarizing the conversation so far",
};

const TONE_LABEL: Record<EmailTone, string> = {
  PROFESSIONAL: "professional",
  ENTERPRISE: "enterprise-formal",
  FRIENDLY: "friendly and warm",
  FORMAL: "formal",
  CONSULTATIVE: "consultative, advisory",
};

export interface GenerateDraftParams {
  contactId: string;
  purpose: DraftPurpose;
  tone: EmailTone;
  channel: DraftChannel;
  campaignId?: string;
  sequenceId?: string;
  sequenceStepIndex?: number;
  abVariant?: string;
  abTestGroupId?: string;
}

/**
 * Generates one real AI email/LinkedIn draft — a single client.messages.parse
 * call (no web_search — grounded purely in buildContactContext's real data),
 * mirrors src/lib/scanner/ai-report-generator.ts's pattern exactly. The same
 * function serves both channels: LinkedIn omits the subject and uses a
 * tighter character budget in the prompt. Persists the EmailDraft itself
 * (status: DRAFT), same "generate-and-persist" convention as
 * generateCompanyIntelligence.
 */
export async function generateEmailDraft(params: GenerateDraftParams): Promise<EmailDraft> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: params.contactId } });
  const persona = getPersona("OUTREACH");
  const client = getAnthropicClient();
  const outreachAgent = await prisma.aIAgentInstance.findFirst({ where: { organizationId: contact.organizationId, type: "OUTREACH" } });
  const context = await buildContactContext(params.contactId);

  if (outreachAgent) {
    await prisma.aIAgentInstance.update({
      where: { id: outreachAgent.id },
      data: { status: "THINKING", currentTask: `Drafting ${params.channel === "LINKEDIN" ? "a LinkedIn message" : "an email"} for ${contact.firstName}` },
    });
  }

  const channelInstructions =
    params.channel === "LINKEDIN"
      ? "This is a LinkedIn message, not an email — do NOT include a subject line. Keep it under 300 characters, conversational, no email-style greeting/signature block."
      : "This is a real cold email. Include a short, specific subject line (never generic like 'Quick question').";

  try {
    const response = await client.messages.parse({
      model: AGENT_MODEL,
      max_tokens: 1500,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(DraftResponseSchema) },
      system: `${persona.systemPrompt}\n\nWrite ${PURPOSE_LABEL[params.purpose]}, in a ${TONE_LABEL[params.tone]} tone. ${channelInstructions} Only reference facts present in the context below — if there's no real researched pain point or tech-stack detail, write a genuinely short, honest, generic-but-still-personal intro rather than inventing a fact. List in personalizationNotes exactly which real facts you actually used (e.g. "mentioned their industry", "referenced a real researched pain point") — if you used none, return an empty array, never a fabricated note.`,
      messages: [{ role: "user", content: `Real context about this contact:\n\n${context}\n\nWrite the ${params.channel === "LINKEDIN" ? "LinkedIn message" : "email"} now.` }],
    });

    if (outreachAgent) {
      await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "COMPLETED" } });
    }

    if (!response.parsed_output) {
      throw new Error("Draft response failed schema validation.");
    }

    const parsed = response.parsed_output;
    const draft = await prisma.emailDraft.create({
      data: {
        organizationId: contact.organizationId,
        campaignId: params.campaignId ?? null,
        contactId: contact.id,
        sequenceId: params.sequenceId ?? null,
        sequenceStepIndex: params.sequenceStepIndex ?? null,
        channel: params.channel,
        purpose: params.purpose,
        tone: params.tone,
        subject: params.channel === "LINKEDIN" ? null : parsed.subject || null,
        body: parsed.body,
        personalizationNotes: parsed.personalizationNotes,
        status: "DRAFT",
        generatedByAgentId: outreachAgent?.id,
        trackingToken: params.channel === "EMAIL" ? crypto.randomUUID() : null,
        abVariant: params.abVariant ?? null,
        abTestGroupId: params.abTestGroupId ?? null,
      },
    });

    return draft;
  } catch (error) {
    if (outreachAgent) {
      await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "IDLE" } }).catch(() => {});
    }
    throw error;
  }
}
