import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { computePipelineTotals } from "@/lib/company-health";
import { getRevenueForecast, type ForecastHorizon } from "@/lib/revenue/forecast";
import { getRecentInsights } from "@/lib/ai/insights-generator";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { AINotConnectedError, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { StrategicPlan, StrategicPlanHorizon, Prisma } from "@/generated/prisma/client";

/**
 * Strategic Planning — one real AI call, grounded strictly in real,
 * already-computed data: the latest Growth Score snapshot, real pipeline
 * totals, the matching revenue forecast, recent Executive Insights, and
 * currently-active Alerts. `groundedInSnapshot` denormalizes every real
 * number the plan was generated from — same precedent as ExecutiveBriefing
 * — so history stays accurate even as the live pipeline changes later.
 * Generated on-demand only (an owner clicks "Generate"), never on a cron —
 * a strategic plan shouldn't silently regenerate and go stale unattended.
 */

// StrategicPlanHorizon has no 1:1 with ForecastHorizon (no "half-year"
// bucket exists in revenue forecasting) — DAYS_180 uses the year forecast
// as the closest existing real projection rather than inventing a new one.
const HORIZON_TO_FORECAST: Record<StrategicPlanHorizon, ForecastHorizon> = {
  DAYS_30: "month",
  DAYS_90: "quarter",
  DAYS_180: "year",
  DAYS_365: "year",
};

const HORIZON_LABEL: Record<StrategicPlanHorizon, string> = {
  DAYS_30: "30-day",
  DAYS_90: "90-day",
  DAYS_180: "6-month",
  DAYS_365: "12-month",
};

const GoalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1),
  targetMetric: z.string().nullable(),
  targetValue: z.string().nullable(),
});

const StrategicPlanResponseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  narrativeSummary: z.string().trim().min(1),
  goals: z.array(GoalSchema).min(3).max(10),
});

export async function generateStrategicPlan(organizationId: string, horizon: StrategicPlanHorizon): Promise<StrategicPlan> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const [growthSnapshot, pipelineTotals, revenueForecast, recentInsights, activeAlerts] = await Promise.all([
    prisma.growthScoreSnapshot.findFirst({ where: { organizationId }, orderBy: { date: "desc" } }),
    computePipelineTotals(organizationId),
    getRevenueForecast(organizationId, HORIZON_TO_FORECAST[horizon]),
    getRecentInsights(organizationId, 7),
    prisma.alert.findMany({ where: { organizationId, status: "ACTIVE" }, select: { title: true, severity: true, type: true } }),
  ]);

  const groundedInSnapshot = {
    growthScore: growthSnapshot
      ? { overallScore: growthSnapshot.overallScore, date: growthSnapshot.date }
      : null,
    pipelineTotals,
    revenueForecast: { horizon: revenueForecast.horizon, total: revenueForecast.total, confidenceScore: revenueForecast.confidenceScore },
    recentInsights: recentInsights.map((i) => ({ type: i.type, title: i.title })),
    activeAlerts: activeAlerts.map((a) => ({ type: a.type, severity: a.severity, title: a.title })),
  };

  const persona = getPersona("CEO");
  const dataSummary = [
    growthSnapshot ? `Real Growth Score: ${growthSnapshot.overallScore}/100 (as of ${growthSnapshot.date.toISOString().slice(0, 10)}).` : "No Growth Score snapshot yet.",
    `Real pipeline: open value ${pipelineTotals.pipelineValue.toFixed(2)}, won value ${pipelineTotals.wonValue.toFixed(2)}, ${pipelineTotals.totalLeadsCount} total leads.`,
    `Real revenue forecast (${revenueForecast.horizon}): ${revenueForecast.total.toFixed(2)}, confidence ${revenueForecast.confidenceScore}/100.`,
    recentInsights.length > 0
      ? `Recent real Executive Insights:\n${recentInsights.map((i) => `- [${i.type}] ${i.title}`).join("\n")}`
      : "No recent Executive Insights.",
    activeAlerts.length > 0
      ? `Currently active real risk Alerts:\n${activeAlerts.map((a) => `- [${a.severity}] ${a.title}`).join("\n")}`
      : "No active risk Alerts.",
  ].join("\n\n");

  const result = await generateStructured({
    system: `${persona.systemPrompt}\n\nYou are writing a ${HORIZON_LABEL[horizon]} strategic growth plan. Ground every goal strictly in the real data given below — never invent a metric, competitor, or fact not present in this data. If a category has no real signal, say so honestly rather than fabricating one.`,
    userContent: `Real current business state:\n\n${dataSummary}\n\nWrite a ${HORIZON_LABEL[horizon]} strategic plan: a title, a short narrative summary, and 3-10 concrete goals.`,
    maxTokens: 3072,
    effort: "medium",
    schema: StrategicPlanResponseSchema,
  });
  await recordAIUsage(organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "strategy:plan-generation");

  const confidenceScore = growthSnapshot ? Math.round((revenueForecast.confidenceScore + growthSnapshot.overallScore) / 2) : revenueForecast.confidenceScore;

  return prisma.strategicPlan.create({
    data: {
      organizationId,
      horizon,
      title: result.parsed.title,
      narrativeSummary: result.parsed.narrativeSummary,
      goals: result.parsed.goals as unknown as Prisma.InputJsonValue,
      groundedInSnapshot: groundedInSnapshot as unknown as Prisma.InputJsonValue,
      confidenceScore,
    },
  });
}
