import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { AINotConnectedError, isAIConnected } from "@/lib/ai/client";
import { generateStructured } from "@/lib/ai/fallback";
import { getPersona } from "@/lib/ai/personas";
import { buildContactContext } from "./personalization";

const MeetingRequestSchema = z.object({
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1),
  agenda: z.string().trim().min(1),
  discussionTopics: z.array(z.string().trim().min(1)).min(1).max(6),
  personalizationNotes: z.array(z.string().trim().min(1)).max(6),
});

export interface MeetingRequestContent {
  subject: string;
  body: string;
  agenda: string;
  discussionTopics: string[];
  personalizationNotes: string[];
}

/** One real AI call producing a grounded meeting-request email + a real agenda/discussion-topics list — same pattern as draft-generator.ts. */
export async function generateMeetingRequest(contactId: string, proposedTimes: string[]): Promise<MeetingRequestContent> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const contact = await prisma.contact.findUniqueOrThrow({ where: { id: contactId } });
  const context = await buildContactContext(contactId);
  const persona = getPersona("OUTREACH");
  const outreachAgent = await prisma.aIAgentInstance.findFirst({ where: { organizationId: contact.organizationId, type: "OUTREACH" } });

  if (outreachAgent) {
    await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "THINKING", currentTask: `Drafting a meeting request for ${contact.firstName}` } });
  }

  try {
    const result = await generateStructured({
      system: `${persona.systemPrompt}\n\nWrite a real meeting-request email plus a genuinely useful agenda and 2-5 discussion topics for that meeting — grounded strictly in the real context below, never invented. If proposed times are given, reference them naturally in the email.`,
      userContent: `Real context about this contact:\n\n${context}\n\n${proposedTimes.length > 0 ? `Proposed meeting times: ${proposedTimes.join(", ")}` : "No specific times proposed yet — ask for their availability."}\n\nWrite the meeting request now.`,
      maxTokens: 1200,
      effort: "low",
      schema: MeetingRequestSchema,
    });

    if (outreachAgent) {
      await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "COMPLETED" } });
    }

    return result.parsed;
  } catch (error) {
    if (outreachAgent) {
      await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "IDLE" } }).catch(() => {});
    }
    throw error;
  }
}
