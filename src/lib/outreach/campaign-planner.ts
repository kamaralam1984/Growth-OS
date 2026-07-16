import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { AINotConnectedError, isAIConnected } from "@/lib/ai/client";
import { generateStructured } from "@/lib/ai/fallback";
import { getPersona } from "@/lib/ai/personas";

const PlanResponseSchema = z.object({
  narrative: z.string().trim().min(1),
  suggestedRefinements: z.array(z.string().trim().min(1)).max(5),
});

export interface CampaignPlanResult {
  aiPlanNotes: string;
  estimatedSuccessPotential: number;
  matchingContactsCount: number;
}

/**
 * Deterministic estimatedSuccessPotential — real matching-contact count ×
 * real average linked LeadScore in that segment, clamped 0-100. Same
 * documented-formula philosophy as lead-scoring.ts; never an AI-invented
 * number. The AI call below only produces the narrative/refinement text.
 */
async function computeSuccessPotential(organizationId: string, targetIndustry?: string, targetCountry?: string) {
  const contacts = await prisma.contact.findMany({
    where: {
      organizationId,
      ...(targetCountry ? { country: { equals: targetCountry, mode: "insensitive" } } : {}),
      ...(targetIndustry ? { company: { industry: { equals: targetIndustry, mode: "insensitive" } } } : {}),
    },
    select: { company: { select: { leadScore: { select: { overallScore: true } } } } },
  });

  const matchingContactsCount = contacts.length;
  const scores = contacts.map((c) => c.company?.leadScore?.overallScore).filter((s): s is number => s != null);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 50;

  // Volume component: capped so a huge but unscored list can't dominate the
  // score component; both halves are real, computed values.
  const volumeComponent = Math.min(matchingContactsCount, 50) / 50 * 100;
  const estimatedSuccessPotential = Math.max(0, Math.min(100, Math.round(avgScore * 0.7 + volumeComponent * 0.3)));

  return { matchingContactsCount, estimatedSuccessPotential };
}

/** One real AI call (MARKETING persona — campaign/content strategy is its established voice) reasoning over the real segment numbers computed above. */
export async function planCampaign(
  organizationId: string,
  input: { goal?: string; targetIndustry?: string; targetCountry?: string },
): Promise<CampaignPlanResult> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const { matchingContactsCount, estimatedSuccessPotential } = await computeSuccessPotential(organizationId, input.targetIndustry, input.targetCountry);

  const persona = getPersona("MARKETING");
  const marketingAgent = await prisma.aIAgentInstance.findFirst({ where: { organizationId, type: "MARKETING" } });

  if (marketingAgent) {
    await prisma.aIAgentInstance.update({ where: { id: marketingAgent.id }, data: { status: "ANALYZING", currentTask: "Planning an outreach campaign" } });
  }

  try {
    const result = await generateStructured({
      system: `${persona.systemPrompt}\n\nYou are the AI Campaign Planner. Ground everything in the real numbers given below — never invent a contact count or score. If the real matching audience is small, say so honestly and suggest broadening the target rather than pretending the campaign will reach more people than it will.`,
      userContent: `Campaign goal: ${input.goal || "not specified"}\nTarget industry: ${input.targetIndustry || "not specified"}\nTarget country: ${input.targetCountry || "not specified"}\nReal matching contacts in the CRM right now: ${matchingContactsCount}\nComputed success potential (deterministic, from real lead scores + audience size): ${estimatedSuccessPotential}/100\n\nWrite a short campaign plan narrative and up to 5 suggested refinements.`,
      maxTokens: 1200,
      effort: "low",
      schema: PlanResponseSchema,
    });

    if (marketingAgent) {
      await prisma.aIAgentInstance.update({ where: { id: marketingAgent.id }, data: { status: "COMPLETED" } });
    }

    const aiPlanNotes = [result.parsed.narrative, ...result.parsed.suggestedRefinements.map((r) => `• ${r}`)].join("\n");
    return { aiPlanNotes, estimatedSuccessPotential, matchingContactsCount };
  } catch (error) {
    if (marketingAgent) {
      await prisma.aIAgentInstance.update({ where: { id: marketingAgent.id }, data: { status: "IDLE" } }).catch(() => {});
    }
    throw error;
  }
}
