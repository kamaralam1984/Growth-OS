import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { ChurnRiskAssessment, ClientHealthSnapshot, RiskLevel, Prisma } from "@/generated/prisma/client";

const NARRATIVE_THRESHOLD = 60;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

// Judgment call, documented like every other threshold in this codebase:
// engagement recency and payment behavior are the strongest real predictors
// of an actual client leaving; contract/renewal status matters but is
// slower-moving; delivery health matters least directly to churn (a client
// can be unhappy with delivery pace and still stay, or happy and still not
// renew for budget reasons unrelated to delivery).
const FACTOR_WEIGHTS = { engagement: 0.35, payment: 0.3, contract: 0.25, delivery: 0.1 } as const;

export interface ChurnReason {
  factor: keyof typeof FACTOR_WEIGHTS;
  value: number;
  contribution: number;
}

export interface ChurnRiskComputation {
  probabilityScore: number;
  riskLevel: RiskLevel;
  reasons: ChurnReason[];
}

function classifyRiskLevel(probabilityScore: number): RiskLevel {
  if (probabilityScore >= 70) return "CRITICAL";
  if (probabilityScore >= 50) return "HIGH";
  if (probabilityScore >= 30) return "MEDIUM";
  return "LOW";
}

/**
 * Entirely deterministic — a weighted combination of the client's latest
 * ClientHealthSnapshot factors (Phase 1). Each factor's real score
 * contributes to churn probability inversely (low health = high churn
 * risk) and proportionally to its weight, so `reasons` is a transparent
 * breakdown a user can verify, not a black box.
 */
export function computeChurnRiskFromSnapshot(snapshot: ClientHealthSnapshot): ChurnRiskComputation {
  const factorScores: Record<keyof typeof FACTOR_WEIGHTS, number> = {
    engagement: snapshot.engagementScore,
    payment: snapshot.paymentScore,
    contract: snapshot.contractScore,
    delivery: snapshot.deliveryScore,
  };

  const reasons: ChurnReason[] = (Object.keys(FACTOR_WEIGHTS) as Array<keyof typeof FACTOR_WEIGHTS>).map((factor) => {
    const weight = FACTOR_WEIGHTS[factor];
    const value = factorScores[factor];
    return { factor, value, contribution: clamp((100 - value) * weight) };
  });

  const probabilityScore = clamp(reasons.reduce((sum, r) => sum + r.contribution, 0));

  return { probabilityScore, riskLevel: classifyRiskLevel(probabilityScore), reasons };
}

/** Fetches the client's latest health snapshot and computes churn risk from it. Null if no snapshot exists yet. */
export async function computeChurnRisk(clientId: string): Promise<ChurnRiskComputation | null> {
  const snapshot = await prisma.clientHealthSnapshot.findFirst({ where: { clientId }, orderBy: { date: "desc" } });
  if (!snapshot) return null;
  return computeChurnRiskFromSnapshot(snapshot);
}

const ChurnNarrativeSchema = z.object({
  narrative: z.string().trim().min(1),
  actions: z.array(z.string().trim().min(1)).min(1).max(6),
});

/**
 * One real AI call, grounded strictly in the deterministic reasons already
 * computed above — never invents a fact about the client. Kept in a
 * separate `aiNarrative` field from the deterministic `reasons`, so a user
 * can never mistake AI-generated prose for a real measurement.
 */
export async function generateChurnNarrative(
  clientName: string,
  computation: ChurnRiskComputation,
  organizationId: string,
): Promise<{ narrative: string; actions: string[] }> {
  const persona = getPersona("CEO");
  const reasonsText = computation.reasons
    .map((r) => `- ${r.factor}: real score ${r.value}/100, contributed ${r.contribution} points to churn probability`)
    .join("\n");

  const result = await generateStructured({
    system: `${persona.systemPrompt}\n\nYou are writing a short churn-risk narrative for an account manager. Ground every sentence strictly in the real, deterministic factor breakdown given below — never invent a fact, event, or number not present in that data.`,
    userContent: `Client "${clientName}" has a real churn probability of ${computation.probabilityScore}/100 (${computation.riskLevel}).\n\nReal factor breakdown:\n${reasonsText}\n\nWrite one short plain-English narrative explaining why, and 1-6 concrete retention recommendations.`,
    maxTokens: 1024,
    effort: "low",
    schema: ChurnNarrativeSchema,
  });
  await recordAIUsage(organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "clients:churn-narrative");

  return result.parsed;
}

/**
 * Upserts the @unique-per-client ChurnRiskAssessment row. Silently no-ops
 * if the client has no ClientHealthSnapshot yet (nothing to compute from —
 * honest skip, not a fabricated assessment). AI narrative generation is
 * best-effort: a failure there never blocks the deterministic assessment
 * from being saved.
 */
export async function ensureLatestChurnRiskAssessment(clientId: string, organizationId: string): Promise<void> {
  const snapshot = await prisma.clientHealthSnapshot.findFirst({ where: { clientId }, orderBy: { date: "desc" } });
  if (!snapshot) return;

  const computation = computeChurnRiskFromSnapshot(snapshot);

  let aiNarrative: string | null = null;
  let recommendedActions: string[] = [];
  if (computation.probabilityScore >= NARRATIVE_THRESHOLD && isAIConnected()) {
    try {
      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
      const generated = await generateChurnNarrative(client?.name ?? "this client", computation, organizationId);
      aiNarrative = generated.narrative;
      recommendedActions = generated.actions;
    } catch {
      // AI generation is an enrichment only — the deterministic assessment below still saves.
    }
  }

  await prisma.churnRiskAssessment.upsert({
    where: { clientId },
    create: {
      organizationId,
      clientId,
      probabilityScore: computation.probabilityScore,
      riskLevel: computation.riskLevel,
      reasons: computation.reasons as unknown as Prisma.InputJsonValue,
      aiNarrative,
      recommendedActions,
      confidenceScore: snapshot.dataConfidence,
    },
    update: {
      probabilityScore: computation.probabilityScore,
      riskLevel: computation.riskLevel,
      reasons: computation.reasons as unknown as Prisma.InputJsonValue,
      aiNarrative,
      recommendedActions,
      confidenceScore: snapshot.dataConfidence,
      computedAt: new Date(),
    },
  });
}

export type { ChurnRiskAssessment };
