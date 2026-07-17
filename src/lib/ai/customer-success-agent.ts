import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getReferralAttribution } from "@/lib/clients/referral-attribution";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { ExecutiveBriefing, Prisma } from "@/generated/prisma/client";

/**
 * Customer Success Agent — a periodic portfolio digest, same shape as the
 * AI CEO Daily Brief (executive-briefing.ts) but scoped to client health/
 * churn/opportunities instead of company-wide leads/pipeline. Reuses the
 * EXISTING ExecutiveBriefing model via the CUSTOMER_SUCCESS BriefingType —
 * no new model. Every deterministic field below is a plain Prisma read of
 * already-computed data (ClientHealthSnapshot, ChurnRiskAssessment,
 * ClientOpportunity, getReferralAttribution) — nothing is recomputed live,
 * matching generateDailyBrief's own discipline of reading persisted
 * snapshots rather than re-running the scoring engines on every digest.
 *
 * Field repurposing (documented since the column names are DAILY-brief
 * flavored): newLeadsCount -> clients needing attention (NEEDS_ATTENTION +
 * HIGH_RISK), pendingApprovalsCount -> clients at high churn risk,
 * revenueForecast -> a small stats object (see CustomerSuccessStats) rather
 * than a forecast shape. The UI (board/brief) renders these under
 * type-aware labels rather than the DAILY-brief wording.
 */

const NarrativeSchema = z.object({ narrativeSummary: z.string().trim().min(1) });

const HIGH_CHURN_RISK_THRESHOLD = 60;
const TOP_CHURN_WATCHLIST_SIZE = 5;

export interface CustomerSuccessStats {
  activeClientsCount: number;
  healthyCount: number;
  needsAttentionCount: number;
  highRiskCount: number;
  totalReferred: number;
  totalConverted: number;
}

export async function generateCustomerSuccessDigest(organizationId: string): Promise<ExecutiveBriefing> {
  const [activeClientsCount, healthSnapshots, churnAssessments, opportunities, referralAttribution] = await Promise.all([
    prisma.client.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.clientHealthSnapshot.findMany({
      where: { organizationId },
      orderBy: [{ clientId: "asc" }, { date: "desc" }],
      distinct: ["clientId"],
      select: { classification: true },
    }),
    // ChurnRiskAssessment.clientId is @unique — one row per client, no distinct/ordering needed to dedupe.
    prisma.churnRiskAssessment.findMany({
      where: { organizationId },
      include: { client: { select: { name: true } } },
    }),
    prisma.clientOpportunity.findMany({
      where: { organizationId, status: "SUGGESTED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { client: { select: { name: true } } },
    }),
    getReferralAttribution(organizationId),
  ]);

  const healthyCount = healthSnapshots.filter((s) => s.classification === "HEALTHY").length;
  const needsAttentionCount = healthSnapshots.filter((s) => s.classification === "NEEDS_ATTENTION").length;
  const highRiskCount = healthSnapshots.filter((s) => s.classification === "HIGH_RISK").length;

  const churnWatchlist = churnAssessments
    .filter((c) => c.probabilityScore >= HIGH_CHURN_RISK_THRESHOLD)
    .sort((a, b) => b.probabilityScore - a.probabilityScore)
    .slice(0, TOP_CHURN_WATCHLIST_SIZE);

  const totalReferred = referralAttribution.reduce((sum, r) => sum + r.referredLeadsCount, 0);
  const totalConverted = referralAttribution.reduce((sum, r) => sum + r.convertedCount, 0);

  const risks = churnWatchlist.map((c) => `[${c.probabilityScore}%] ${c.client.name} at churn risk`);
  const recommendedActions = opportunities.map((o) => `${o.title} (${o.client.name})`);
  const opportunitiesJson = opportunities.map((o) => ({ kind: o.kind.toLowerCase(), title: `${o.title} (${o.client.name})`, value: o.estimatedValue }));

  const stats: CustomerSuccessStats = {
    activeClientsCount,
    healthyCount,
    needsAttentionCount,
    highRiskCount,
    totalReferred,
    totalConverted,
  };

  let narrativeSummary: string | null = null;
  if (isAIConnected()) {
    try {
      const persona = getPersona("CUSTOMER_SUCCESS");
      const dataSummary = [
        `Real active clients: ${activeClientsCount} (${healthyCount} healthy, ${needsAttentionCount} needs attention, ${highRiskCount} high risk).`,
        churnWatchlist.length > 0
          ? `Real high churn-risk clients:\n${risks.join("\n")}`
          : "No clients currently above the high churn-risk threshold.",
        opportunities.length > 0
          ? `Real suggested client opportunities:\n${recommendedActions.join("\n")}`
          : "No suggested opportunities on record.",
        `Real referral attribution: ${totalReferred} referred leads, ${totalConverted} converted.`,
      ].join("\n\n");

      const result = await generateStructured({
        system: `${persona.systemPrompt}\n\nYou are writing the Customer Success portfolio digest — a short executive-voice paragraph. Ground every sentence strictly in the real data given below — never invent a client name, score, or event not present in it. If a section has no real data, say so honestly.`,
        userContent: `Today's real client portfolio state:\n\n${dataSummary}\n\nWrite one short paragraph summarizing portfolio health and today's priorities.`,
        maxTokens: 1024,
        effort: "low",
        schema: NarrativeSchema,
      });
      await recordAIUsage(organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "ai:customer-success-digest-narrative");
      narrativeSummary = result.parsed.narrativeSummary;
    } catch {
      // Narrative is an enrichment only — the deterministic digest below still saves without it.
    }
  }

  return prisma.executiveBriefing.create({
    data: {
      organizationId,
      type: "CUSTOMER_SUCCESS",
      newLeadsCount: needsAttentionCount + highRiskCount,
      opportunities: opportunitiesJson as unknown as Prisma.InputJsonValue,
      pendingApprovalsCount: churnWatchlist.length,
      revenueForecast: stats as unknown as Prisma.InputJsonValue,
      risks,
      recommendedActions,
      narrativeSummary,
    },
  });
}
