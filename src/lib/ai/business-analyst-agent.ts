import { prisma } from "@/lib/prisma";
import { computeGrowthScore, ensureTodayGrowthScoreSnapshot, type GrowthScoreResult } from "@/lib/growth/score";
import { generateGrowthImprovementPlan } from "@/lib/growth/improvement-plan";
import { getRevenueForecast, type RevenueForecast } from "@/lib/revenue/forecast";
import { getPipelineHealthScore, type PipelineHealthResult } from "@/lib/pipeline/intelligence";
import { getRecentInsights } from "@/lib/ai/insights-generator";
import { isAIConnected } from "@/lib/ai/client";
import type { GrowthImprovementPlan, Insight } from "@/generated/prisma/client";

export interface BusinessAnalystReport {
  growthScore: GrowthScoreResult;
  revenueForecastMonth: RevenueForecast;
  pipelineHealth: PipelineHealthResult;
  recentInsights: Insight[];
  /** Null when AI isn't connected or the one AI call failed — the deterministic KPIs above are always real regardless. */
  improvementPlan: GrowthImprovementPlan | null;
}

/**
 * Business Analyst Agent — a thin read-only synthesis over Phase 18's AI
 * Business Growth Engine. Every KPI is a live, already-real computation
 * (computeGrowthScore/getRevenueForecast/getPipelineHealthScore/
 * getRecentInsights, all unmodified); the one AI-authored piece is the
 * existing generateGrowthImprovementPlan() narrative, reused verbatim
 * rather than duplicated with a second AI call.
 */
export async function generateBusinessAnalystReport(organizationId: string): Promise<BusinessAnalystReport> {
  await ensureTodayGrowthScoreSnapshot(organizationId);

  const [growthScore, revenueForecastMonth, pipelineHealth, recentInsights] = await Promise.all([
    computeGrowthScore(organizationId),
    getRevenueForecast(organizationId, "month"),
    getPipelineHealthScore(organizationId),
    getRecentInsights(organizationId),
  ]);

  let improvementPlan: GrowthImprovementPlan | null = null;
  if (isAIConnected()) {
    try {
      improvementPlan = await generateGrowthImprovementPlan(organizationId);
    } catch (error) {
      console.error("[business-analyst-agent] generateGrowthImprovementPlan failed:", error);
    }
  }

  return { growthScore, revenueForecastMonth, pipelineHealth, recentInsights, improvementPlan };
}

export async function getLatestImprovementPlan(organizationId: string): Promise<GrowthImprovementPlan | null> {
  return prisma.growthImprovementPlan.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" } });
}
