import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { AINotConnectedError, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { GrowthScoreSnapshot, GrowthImprovementPlan, Prisma } from "@/generated/prisma/client";

const RecommendationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1),
  axis: z.string(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

const ImprovementPlanSchema = z.object({
  narrativeSummary: z.string().trim().min(1),
  recommendations: z.array(RecommendationSchema).min(3).max(8),
});

const AXIS_LABELS: Record<string, string> = {
  salesScore: "Sales",
  marketingScore: "Marketing",
  customerSuccessScore: "Customer Success",
  operationsScore: "Operations",
  financeScore: "Finance",
  productivityScore: "Productivity",
  aiAdoptionScore: "AI Adoption",
  automationScore: "Automation",
  technologyScore: "Technology",
  customerSatisfactionScore: "Customer Satisfaction",
};

function buildAxisSummary(snapshot: GrowthScoreSnapshot): string {
  const axisConfidence = (snapshot.axisConfidence as unknown as Record<string, number>) ?? {};
  return Object.entries(AXIS_LABELS)
    .map(([field, label]) => {
      const score = (snapshot as unknown as Record<string, number>)[field];
      const confidence = axisConfidence[field] ?? 100;
      return `- ${label}: ${score}/100${confidence < 100 ? " (no real data yet for this axis — treat as unknown, don't over-index on it)" : ""}`;
    })
    .join("\n");
}

/**
 * One real AI call grounded strictly in one specific GrowthScoreSnapshot's
 * already-computed real axis values — never generated in a vacuum. Axes
 * flagged low-confidence (e.g. customerSatisfactionScore, which has no real
 * data source anywhere in this app) are explicitly called out in the prompt
 * so the model doesn't confidently prescribe action from a placeholder
 * number.
 */
export async function generateGrowthImprovementPlan(organizationId: string): Promise<GrowthImprovementPlan> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const snapshot = await prisma.growthScoreSnapshot.findFirst({
    where: { organizationId },
    orderBy: { date: "desc" },
  });
  if (!snapshot) {
    throw new Error("No GrowthScoreSnapshot exists yet for this organization — run the growth-score-snapshot job first.");
  }

  const persona = getPersona("CEO");
  const axisSummary = buildAxisSummary(snapshot);

  const result = await generateStructured({
    system: `${persona.systemPrompt}\n\nYou are generating a Growth Score Improvement Plan. Ground every recommendation strictly in the real axis scores given below — never invent a metric, competitor, or fact not present in this data. Where an axis is marked as having no real data, do not treat it as a confirmed weakness; instead you may note that it's simply unmeasured.`,
    userContent: `Today's real Growth Score axes (overall ${snapshot.overallScore}/100):\n\n${axisSummary}\n\nWrite a short narrative summary of overall growth health, then 3-8 concrete, prioritized recommendations tied to specific axes.`,
    maxTokens: 2048,
    effort: "medium",
    schema: ImprovementPlanSchema,
  });
  await recordAIUsage(organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "growth:improvement-plan");

  const confidenceScore = Math.round(
    Object.values((snapshot.axisConfidence as unknown as Record<string, number>) ?? {}).reduce((sum, c) => sum + c, 0) /
      Math.max(1, Object.keys(AXIS_LABELS).length),
  );

  return prisma.growthImprovementPlan.create({
    data: {
      organizationId,
      snapshotId: snapshot.id,
      recommendations: result.parsed.recommendations as unknown as Prisma.InputJsonValue,
      narrativeSummary: result.parsed.narrativeSummary,
      confidenceScore,
    },
  });
}
