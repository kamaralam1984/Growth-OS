import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { prisma } from "@/lib/prisma";
import { AGENT_MODEL, AINotConnectedError, getAnthropicClient, isAIConnected } from "@/lib/ai/client";
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
  const client = getAnthropicClient();
  const outreachAgent = await prisma.aIAgentInstance.findFirst({ where: { organizationId: contact.organizationId, type: "OUTREACH" } });

  if (outreachAgent) {
    await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "THINKING", currentTask: `Drafting a meeting request for ${contact.firstName}` } });
  }

  try {
    const response = await client.messages.parse({
      model: AGENT_MODEL,
      max_tokens: 1200,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: zodOutputFormat(MeetingRequestSchema) },
      system: `${persona.systemPrompt}\n\nWrite a real meeting-request email plus a genuinely useful agenda and 2-5 discussion topics for that meeting — grounded strictly in the real context below, never invented. If proposed times are given, reference them naturally in the email.`,
      messages: [
        {
          role: "user",
          content: `Real context about this contact:\n\n${context}\n\n${proposedTimes.length > 0 ? `Proposed meeting times: ${proposedTimes.join(", ")}` : "No specific times proposed yet — ask for their availability."}\n\nWrite the meeting request now.`,
        },
      ],
    });

    if (outreachAgent) {
      await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "COMPLETED" } });
    }
    if (!response.parsed_output) throw new Error("Meeting request response failed schema validation.");

    return response.parsed_output;
  } catch (error) {
    if (outreachAgent) {
      await prisma.aIAgentInstance.update({ where: { id: outreachAgent.id }, data: { status: "IDLE" } }).catch(() => {});
    }
    throw error;
  }
}
