import { prisma } from "@/lib/prisma";
import { computeCompanyHealth } from "@/lib/company-health";
import { computeProjectHealthScore } from "@/lib/projects/health-score";
import { getMRR } from "@/lib/revenue/subscriptions";
import { withCache } from "@/lib/cache/redis-cache";
import type { Prisma } from "@/generated/prisma/client";

const GROWTH_SCORE_CACHE_TTL_SECONDS = 600;
const OPEN_PROJECT_STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD"] as const;

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export interface GrowthScoreResult {
  salesScore: number;
  marketingScore: number;
  customerSuccessScore: number;
  operationsScore: number;
  financeScore: number;
  productivityScore: number;
  aiAdoptionScore: number;
  automationScore: number;
  technologyScore: number;
  customerSatisfactionScore: number;
  overallScore: number;
  /** {axisName: 0-100} — how much of each axis is backed by real data. */
  axisConfidence: Record<string, number>;
}

/**
 * Composite of the 10 spec'd Growth Score axes. Reuses computeCompanyHealth
 * (src/lib/company-health.ts) verbatim for sales/marketing/automation/ai
 * rather than re-deriving them, and computeProjectHealthScore for the
 * operations axis. customerSuccessScore is derived from the latest
 * ClientHealthSnapshot per active client (Phase 1). customerSatisfactionScore
 * has NO real data source anywhere in this schema (no NPS/CSAT field
 * exists) — it is ALWAYS 50 with axisConfidence.customerSatisfactionScore
 * = 0, an honest "unknown" rather than an invented number. Same
 * TTL-cached-live-compute pattern as company-health.ts.
 */
export async function computeGrowthScore(organizationId: string): Promise<GrowthScoreResult> {
  return withCache(`growth-score:${organizationId}`, GROWTH_SCORE_CACHE_TTL_SECONDS, async () => {
    const [companyHealth, activeClients, healthSnapshots, openProjects, mrr, orgInvoices, membersCount, connectedIntegrationsCount] = await Promise.all([
      computeCompanyHealth(organizationId),
      prisma.client.count({ where: { organizationId, status: "ACTIVE" } }),
      prisma.clientHealthSnapshot.findMany({
        where: { organizationId },
        orderBy: [{ clientId: "asc" }, { date: "desc" }],
        distinct: ["clientId"],
        select: { overallScore: true },
      }),
      prisma.project.findMany({ where: { organizationId, status: { in: Array.from(OPEN_PROJECT_STATUSES) as never[] } }, select: { id: true } }),
      getMRR(organizationId),
      prisma.invoice.findMany({ where: { organizationId, status: { in: ["PAID", "OVERDUE"] } }, select: { status: true, grandTotal: true, amountPaid: true } }),
      prisma.membership.count({ where: { organizationId, status: "ACTIVE" } }),
      prisma.integrationConnection.count({ where: { organizationId, status: "CONNECTED" } }),
    ]);

    // ---- Customer Success: real avg of the latest per-client health scores ----
    const customerSuccessScore =
      healthSnapshots.length > 0
        ? clamp(healthSnapshots.reduce((sum, s) => sum + s.overallScore, 0) / healthSnapshots.length)
        : 50;

    // ---- Operations: real avg project health across currently-open projects ----
    let operationsScore = 50;
    if (openProjects.length > 0) {
      const scores = await Promise.all(openProjects.map((p) => computeProjectHealthScore(p.id)));
      operationsScore = clamp(scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length);
    }

    // ---- Finance: real invoice-collection health + recurring-revenue presence ----
    const paidInvoices = orgInvoices.filter((i) => i.status === "PAID" && i.amountPaid >= i.grandTotal);
    const collectionRatio = orgInvoices.length > 0 ? paidInvoices.length / orgInvoices.length : null;
    const recurringComponent = mrr > 0 ? 70 : 30;
    const financeScore =
      collectionRatio === null ? recurringComponent : clamp(collectionRatio * 60 + (mrr > 0 ? 40 : 10));

    // ---- Technology: existing security axis blended with real connected-integration count ----
    const integrationComponent = clamp(Math.min(connectedIntegrationsCount, 5) * 20);
    const technologyScore = clamp((companyHealth.security + integrationComponent) / 2);

    // ---- Customer Satisfaction: NO backing data source exists in this schema ----
    const customerSatisfactionScore = 50;

    // Productivity has no independent real signal beyond task-completion
    // ratio, which is exactly what company-health.ts's `automation` axis
    // already measures — reused for both rather than fabricating a second,
    // different-looking number from the same underlying data.
    const overallScore = clamp(
      (companyHealth.sales +
        companyHealth.marketing +
        customerSuccessScore +
        operationsScore +
        financeScore +
        companyHealth.automation + // productivity
        companyHealth.ai + // aiAdoption
        companyHealth.automation + // automation
        technologyScore +
        customerSatisfactionScore) /
        10,
    );

    const axisConfidence: Record<string, number> = {
      salesScore: 100,
      marketingScore: 100,
      customerSuccessScore: activeClients > 0 ? 100 : 0,
      operationsScore: openProjects.length > 0 ? 100 : 0,
      financeScore: orgInvoices.length > 0 || mrr > 0 ? 100 : 0,
      productivityScore: 100,
      aiAdoptionScore: 100,
      automationScore: 100,
      technologyScore: membersCount > 0 ? 100 : 50,
      customerSatisfactionScore: 0,
    };

    return {
      salesScore: companyHealth.sales,
      marketingScore: companyHealth.marketing,
      customerSuccessScore,
      operationsScore,
      financeScore,
      productivityScore: companyHealth.automation,
      aiAdoptionScore: companyHealth.ai,
      automationScore: companyHealth.automation,
      technologyScore,
      customerSatisfactionScore,
      overallScore,
      axisConfidence,
    };
  });
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Idempotent daily upsert — same ensureTodaySnapshot precedent used
 * throughout this codebase. Depends on Phase 1's client-health-snapshot job
 * having already run for the day (customerSuccessScore reads its output),
 * so this job must be registered to run after it in the scheduler.
 */
export async function ensureTodayGrowthScoreSnapshot(organizationId: string, now: Date = new Date()): Promise<void> {
  const date = startOfDay(now);

  const existing = await prisma.growthScoreSnapshot.findUnique({ where: { organizationId_date: { organizationId, date } } });
  if (existing) return;

  const result = await computeGrowthScore(organizationId);

  await prisma.growthScoreSnapshot.upsert({
    where: { organizationId_date: { organizationId, date } },
    create: {
      organizationId,
      date,
      salesScore: result.salesScore,
      marketingScore: result.marketingScore,
      customerSuccessScore: result.customerSuccessScore,
      operationsScore: result.operationsScore,
      financeScore: result.financeScore,
      productivityScore: result.productivityScore,
      aiAdoptionScore: result.aiAdoptionScore,
      automationScore: result.automationScore,
      technologyScore: result.technologyScore,
      customerSatisfactionScore: result.customerSatisfactionScore,
      overallScore: result.overallScore,
      axisConfidence: result.axisConfidence as unknown as Prisma.InputJsonValue,
    },
    update: {
      salesScore: result.salesScore,
      marketingScore: result.marketingScore,
      customerSuccessScore: result.customerSuccessScore,
      operationsScore: result.operationsScore,
      financeScore: result.financeScore,
      productivityScore: result.productivityScore,
      aiAdoptionScore: result.aiAdoptionScore,
      automationScore: result.automationScore,
      technologyScore: result.technologyScore,
      customerSatisfactionScore: result.customerSatisfactionScore,
      overallScore: result.overallScore,
      axisConfidence: result.axisConfidence as unknown as Prisma.InputJsonValue,
    },
  });
}
