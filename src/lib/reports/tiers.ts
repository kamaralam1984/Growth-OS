import { prisma } from "@/lib/prisma";
import type { ReportBlueprint } from "./report-blueprint";
import { computeCompanyHealth, computePipelineTotals } from "@/lib/company-health";
import { getPeriodReport, getAgentProductivity } from "@/lib/reports";
import { getRevenueTimeMetrics } from "@/app/dashboard/_lib/metrics";
import { getMRR, getARR, getMonthlyChurnRate } from "@/lib/revenue/subscriptions";
import { getCAC, getLTV, getLtvCacRatio } from "@/lib/revenue/cac-ltv";

export type ReportTier = "ceo" | "board" | "investor";

const TIER_LABEL: Record<ReportTier, string> = {
  ceo: "CEO Report",
  board: "Board Report",
  investor: "Investor Report",
};

function formatCurrency(value: number, currencyCode?: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode || "USD", maximumFractionDigits: 0 }).format(
      value,
    );
  } catch {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
  }
}

function healthSection(health: Awaited<ReturnType<typeof computeCompanyHealth>>) {
  return {
    heading: "Company Health Scores",
    table: {
      headers: ["Dimension", "Score"],
      rows: [
        ["Overall", `${health.overall}/100`],
        ["Business", `${health.business}/100`],
        ["Sales", `${health.sales}/100`],
        ["Marketing", `${health.marketing}/100`],
        ["CRM", `${health.crm}/100`],
        ["Automation", `${health.automation}/100`],
        ["Revenue", `${health.revenue}/100`],
        ["Security", `${health.security}/100`],
        ["AI", `${health.ai}/100`],
      ],
      alignRightColumns: [1],
    },
  };
}

async function riskRegisterSection(organizationId: string) {
  const alerts = await prisma.alert.findMany({
    where: { organizationId, status: { in: ["ACTIVE", "ACKNOWLEDGED"] } },
    orderBy: [{ severity: "desc" }, { triggeredAt: "desc" }],
    take: 25,
    select: { title: true, type: true, severity: true, status: true, message: true, triggeredAt: true },
  });

  if (alerts.length === 0) {
    return {
      heading: "Risk Register",
      body: "No active or acknowledged alerts — real-time rule-evaluated Alert rows, none currently open.",
    };
  }

  return {
    heading: "Risk Register",
    body: "Real, rule-evaluated Alert rows currently ACTIVE or ACKNOWLEDGED — no fabricated risks.",
    table: {
      headers: ["Alert", "Type", "Severity", "Status", "Triggered"],
      rows: alerts.map((a) => [a.title, a.type, a.severity, a.status, a.triggeredAt.toLocaleDateString()]),
    },
  };
}

/**
 * Assembles ONE ReportBlueprint per tier from real, already-existing data
 * functions — the tiers differ only in which sections are INCLUDED, never in
 * the underlying data source. CEO gets full operational detail, Board gets
 * health + revenue + risk (no day-to-day task detail), Investor gets a pure
 * MRR/ARR/growth/churn/CAC:LTV summary with no internal task/agent detail.
 */
export async function getTieredReport(organizationId: string, tier: ReportTier): Promise<ReportBlueprint> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, logo: true, gstNumber: true, registrationNumber: true, currency: true },
  });
  const currency = organization?.currency;
  const now = new Date();

  if (tier === "investor") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [mrr, arr, revenueTime, churn, cac, ltv] = await Promise.all([
      getMRR(organizationId),
      getARR(organizationId),
      getRevenueTimeMetrics(organizationId, now),
      getMonthlyChurnRate(organizationId, now),
      getCAC(organizationId, monthStart, now),
      getLTV(organizationId),
    ]);
    const { ratio } = getLtvCacRatio(ltv.ltv, cac.cac);

    const sections: ReportBlueprint["sections"] = [
      {
        heading: "Recurring Revenue",
        bullets: [
          `MRR: ${formatCurrency(mrr, currency)}`,
          `ARR: ${formatCurrency(arr, currency)}`,
          `Revenue this month (won-stage lead value): ${formatCurrency(revenueTime.monthlyRevenue, currency)}`,
          `Revenue this year (won-stage lead value): ${formatCurrency(revenueTime.yearlyRevenue, currency)}`,
        ],
      },
      {
        heading: "Growth & Churn",
        bullets: [
          revenueTime.growthPct != null
            ? `30-day pipeline value growth: ${revenueTime.growthPct.toFixed(1)}%`
            : "30-day pipeline value growth: not enough prior-period data yet",
          churn.ratePct != null
            ? `Monthly churn rate: ${churn.ratePct.toFixed(1)}% (${churn.cancelledCount} of ${churn.activeAtPeriodStart} subscriptions active at period start)`
            : "Monthly churn rate: no subscriptions were active at the start of this period",
          churn.formula,
        ],
      },
      {
        heading: "CAC : LTV",
        bullets: [
          cac.cac != null ? `CAC: ${formatCurrency(cac.cac, currency)}` : "CAC: not enough spend/customer data logged yet",
          ltv.ltv != null ? `LTV: ${formatCurrency(ltv.ltv, currency)}` : "LTV: no company revenue recorded yet",
          ratio != null ? `LTV : CAC ratio: ${ratio.toFixed(2)}x` : "LTV : CAC ratio: not computable yet",
          cac.formula,
          ltv.formula,
        ],
      },
    ];

    return {
      title: TIER_LABEL.investor,
      subtitle: `Generated ${now.toLocaleString()} — MRR/ARR/growth/churn/CAC:LTV summary only, no internal task or agent detail.`,
      brand: {
        organizationName: organization?.name ?? "Organization",
        logoUrl: organization?.logo,
        gstNumber: organization?.gstNumber,
        registrationNumber: organization?.registrationNumber,
      },
      generatedAt: now,
      sections,
      footerText: organization?.name ?? undefined,
    };
  }

  const [health, pipelineTotals, revenueTime, risk] = await Promise.all([
    computeCompanyHealth(organizationId),
    computePipelineTotals(organizationId),
    getRevenueTimeMetrics(organizationId, now),
    riskRegisterSection(organizationId),
  ]);

  const revenueSection = {
    heading: "Revenue",
    bullets: [
      `Open pipeline value: ${formatCurrency(pipelineTotals.pipelineValue, currency)}`,
      `Won value (all-time): ${formatCurrency(pipelineTotals.wonValue, currency)}`,
      `Revenue this month: ${formatCurrency(revenueTime.monthlyRevenue, currency)}`,
      `Revenue this year: ${formatCurrency(revenueTime.yearlyRevenue, currency)}`,
      revenueTime.growthPct != null
        ? `30-day pipeline value growth: ${revenueTime.growthPct.toFixed(1)}%`
        : "30-day pipeline value growth: not enough prior-period data yet",
    ],
  };

  if (tier === "board") {
    return {
      title: TIER_LABEL.board,
      subtitle: `Generated ${now.toLocaleString()} — health scores + revenue + risk register, no day-to-day task detail.`,
      brand: {
        organizationName: organization?.name ?? "Organization",
        logoUrl: organization?.logo,
        gstNumber: organization?.gstNumber,
        registrationNumber: organization?.registrationNumber,
      },
      generatedAt: now,
      sections: [healthSection(health), revenueSection, risk],
      footerText: organization?.name ?? undefined,
    };
  }

  // CEO tier — full operational detail.
  const [periodReport, agents] = await Promise.all([
    getPeriodReport(organizationId, "monthly"),
    getAgentProductivity(organizationId),
  ]);

  const productivitySection = {
    heading: "Tasks & Agent Productivity (this month)",
    bullets: [
      `Meetings held: ${periodReport.meetingsHeld}`,
      `Tasks completed: ${periodReport.tasksCompleted}`,
      `Decisions made: ${periodReport.decisionsMade}`,
      `Messages exchanged: ${periodReport.messagesExchanged}`,
    ],
    table:
      agents.length > 0
        ? {
            headers: ["Agent", "Type", "Status", "Completed Tasks", "Avg. Confidence"],
            rows: agents.map((agent) => [
              agent.name,
              agent.type,
              agent.active ? "Active" : "Paused",
              agent.completedTasksCount,
              agent.confidenceScore !== null ? `${Math.max(0, Math.min(100, Math.round(agent.confidenceScore)))}%` : "Not yet scored",
            ]),
            alignRightColumns: [3, 4],
          }
        : undefined,
  };

  return {
    title: TIER_LABEL.ceo,
    subtitle: `Generated ${now.toLocaleString()} — full operational detail: health scores + revenue + tasks/agent productivity + risks.`,
    brand: {
      organizationName: organization?.name ?? "Organization",
      logoUrl: organization?.logo,
      gstNumber: organization?.gstNumber,
      registrationNumber: organization?.registrationNumber,
    },
    generatedAt: now,
    sections: [healthSection(health), revenueSection, productivitySection, risk],
    footerText: organization?.name ?? undefined,
  };
}
