import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getRevenueForecast, getCashFlowProjection } from "@/lib/revenue/forecast";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { ExecutiveBriefing, Prisma } from "@/generated/prisma/client";

/**
 * AI CEO Daily Brief — assembles real, deterministic data first (every
 * field below except narrativeSummary is a plain Prisma aggregate), then
 * makes exactly ONE AI call to write a CEO-voice paragraph that reformats
 * and prioritizes that already-real data. The model is never asked to
 * invent a number — it only narrates what's given to it, same discipline
 * as generateExecutiveInsights.
 */

const NarrativeSchema = z.object({ narrativeSummary: z.string().trim().min(1) });

const NEW_LEADS_WINDOW_DAYS = 1;

export async function generateDailyBrief(organizationId: string): Promise<ExecutiveBriefing> {
  const yesterday = new Date(Date.now() - NEW_LEADS_WINDOW_DAYS * 86_400_000);

  const [
    newLeadsCount,
    topOpportunityDeals,
    topClientOpportunities,
    topOpportunityInsights,
    pendingApprovalsCount,
    revenueForecastDay,
    cashFlow,
    topAlerts,
    recommendedInsights,
  ] = await Promise.all([
    prisma.lead.count({ where: { pipelineStage: { workspace: { organizationId } }, createdAt: { gte: yesterday } } }),
    prisma.deal.findMany({
      where: { organizationId, dealStage: { name: { notIn: ["Won", "Lost", "Archived"] } }, value: { not: null } },
      orderBy: { value: "desc" },
      take: 3,
      select: { name: true, value: true, probability: true },
    }),
    prisma.clientOpportunity.findMany({
      where: { organizationId, status: "SUGGESTED" },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { client: { select: { name: true } } },
    }),
    prisma.insight.findMany({ where: { organizationId, type: "TOP_OPPORTUNITY" }, orderBy: { createdAt: "desc" }, take: 1 }),
    prisma.approval.count({ where: { organizationId, decision: "PENDING" } }),
    getRevenueForecast(organizationId, "day"),
    getCashFlowProjection(organizationId, 4),
    prisma.alert.findMany({ where: { organizationId, status: "ACTIVE" }, orderBy: [{ severity: "desc" }, { triggeredAt: "desc" }], take: 5 }),
    prisma.insight.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const opportunities = [
    ...topOpportunityDeals.map((d) => ({ kind: "deal" as const, title: d.name, value: (d.value ?? 0) * ((d.probability ?? 0) / 100) })),
    ...topClientOpportunities.map((o) => ({ kind: o.kind.toLowerCase() as string, title: `${o.title} (${o.client.name})`, value: o.estimatedValue })),
    ...topOpportunityInsights.map((i) => ({ kind: "insight" as const, title: i.title, value: null })),
  ];

  const cashFlowNext4Weeks = cashFlow.reduce((sum, b) => sum + b.expectedInflow, 0);
  const risks = topAlerts.map((a) => `[${a.severity}] ${a.title}`);
  const recommendedActions = recommendedInsights.map((i) => i.title);

  let narrativeSummary: string | null = null;
  if (isAIConnected()) {
    try {
      const persona = getPersona("CEO");
      const dataSummary = [
        `Real new leads (last ${NEW_LEADS_WINDOW_DAYS} day): ${newLeadsCount}.`,
        `Real revenue forecast (today): ${revenueForecastDay.total.toFixed(2)}, confidence ${revenueForecastDay.confidenceScore}/100.`,
        `Real expected cash inflow (next 4 weeks): ${cashFlowNext4Weeks.toFixed(2)}.`,
        `Real pending approvals: ${pendingApprovalsCount}.`,
        opportunities.length > 0 ? `Real top opportunities:\n${opportunities.map((o) => `- ${o.title}${o.value != null ? ` (${o.value.toFixed(2)})` : ""}`).join("\n")}` : "No real opportunities on record.",
        risks.length > 0 ? `Real active risks:\n${risks.join("\n")}` : "No active risk alerts.",
        recommendedActions.length > 0 ? `Real recent recommendations:\n${recommendedActions.join("\n")}` : "No recent recommendations.",
      ].join("\n\n");

      const result = await generateStructured({
        system: `${persona.systemPrompt}\n\nYou are writing the AI CEO Daily Brief — a short executive-voice paragraph. Ground every sentence strictly in the real data given below — never invent a number, deal, or event not present in it. If a section has no real data, say so honestly.`,
        userContent: `Today's real business state:\n\n${dataSummary}\n\nWrite one short CEO-voice paragraph summarizing today's priorities.`,
        maxTokens: 1024,
        effort: "low",
        schema: NarrativeSchema,
      });
      await recordAIUsage(organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "ai:daily-brief-narrative");
      narrativeSummary = result.parsed.narrativeSummary;
    } catch {
      // Narrative is an enrichment only — the deterministic brief below still saves without it.
    }
  }

  return prisma.executiveBriefing.create({
    data: {
      organizationId,
      type: "DAILY",
      newLeadsCount,
      opportunities: opportunities as unknown as Prisma.InputJsonValue,
      pendingApprovalsCount,
      revenueForecast: { day: revenueForecastDay, cashFlowNext4Weeks } as unknown as Prisma.InputJsonValue,
      risks,
      recommendedActions,
      narrativeSummary,
    },
  });
}
