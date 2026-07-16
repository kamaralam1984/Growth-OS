import { prisma } from "@/lib/prisma";
import { getMRR } from "@/lib/revenue/subscriptions";

/**
 * Org-wide revenue forecasting and cash-flow projection — a real, transparent
 * extension of the existing deal-only forecast in
 * src/app/dashboard/crm/_lib/forecast.ts (which stays as-is) and the
 * band-weighted pipeline forecast in src/lib/lead-analytics.ts. Every number
 * here is a grouped sum over real Deal/Subscription/Invoice rows — no ML
 * model, no invented growth curve. Recurring revenue reuses getMRR() from
 * src/lib/revenue/subscriptions.ts rather than reimplementing normalization.
 */

export type ForecastHorizon = "month" | "quarter" | "year";

// Same "open deal" definition as crm/_lib/forecast.ts's TERMINAL_STAGE_NAMES.
const TERMINAL_STAGE_NAMES = ["Won", "Lost", "Archived"];

const HORIZON_WINDOW_DAYS: Record<ForecastHorizon, number> = {
  month: 30,
  quarter: 90,
  year: 365,
};

const HORIZON_MONTHS: Record<ForecastHorizon, number> = {
  month: 1,
  quarter: 3,
  year: 12,
};

export interface RevenueForecast {
  horizon: ForecastHorizon;
  pipelineContribution: number;
  recurringContribution: number;
  total: number;
  formula: string;
  dataSufficient: boolean;
}

/**
 * pipelineContribution: Σ (each open deal's value × its own probability ÷
 * 100) for deals whose expectedCloseDate falls within the horizon window
 * from now. recurringContribution: current MRR (Σ each ACTIVE subscription's
 * amount, normalized to monthly) × the number of months in the horizon —
 * this deliberately does NOT discount for projected churn or apply any
 * growth curve, it's a flat "everything active today keeps renewing as-is"
 * projection, stated honestly in `formula` rather than faking precision.
 */
export async function getRevenueForecast(organizationId: string, horizon: ForecastHorizon): Promise<RevenueForecast> {
  const now = new Date();
  const windowDays = HORIZON_WINDOW_DAYS[horizon];
  const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const [openDealsInWindow, activeSubscriptionsCount, mrr] = await Promise.all([
    prisma.deal.findMany({
      where: {
        organizationId,
        expectedCloseDate: { gte: now, lte: windowEnd },
        dealStage: { name: { notIn: TERMINAL_STAGE_NAMES } },
      },
      select: { value: true, probability: true },
    }),
    prisma.subscription.count({ where: { organizationId, status: "ACTIVE" } }),
    getMRR(organizationId),
  ]);

  const pipelineContribution = openDealsInWindow.reduce(
    (sum, deal) => sum + (deal.value ?? 0) * ((deal.probability ?? 0) / 100),
    0,
  );

  const monthsInHorizon = HORIZON_MONTHS[horizon];
  const recurringContribution = mrr * monthsInHorizon;

  const dataSufficient = openDealsInWindow.length > 0 || activeSubscriptionsCount > 0;

  return {
    horizon,
    pipelineContribution,
    recurringContribution,
    total: pipelineContribution + recurringContribution,
    formula:
      `Pipeline contribution = Σ (each open deal's value × its own probability ÷ 100) for deals with an ` +
      `expectedCloseDate in the next ${windowDays} days. Recurring contribution = current MRR (Σ each ACTIVE ` +
      `subscription's amount, normalized to monthly — MONTHLY amount ÷ 1, QUARTERLY ÷ 3, YEARLY ÷ 12) × ` +
      `${monthsInHorizon} month(s) in this horizon. This recurring figure is NOT discounted for projected churn ` +
      `and applies no growth curve — it assumes every currently-active subscription renews unchanged for the ` +
      `full horizon, which will overstate revenue if any of them cancel.`,
    dataSufficient,
  };
}

export interface CashFlowBucket {
  periodLabel: string;
  expectedInflow: number;
  fromInvoices: number;
  fromSubscriptionRenewals: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Buckets real Invoice.dueDate (status SENT/OVERDUE, amount = grandTotal -
 * amountPaid) and Subscription.renewalDate (status ACTIVE, amount = its next
 * renewal amount) into weekly buckets over the next `weeks` weeks from now.
 * Returns an empty array — not zero-filled fake buckets — when there is
 * nothing real to project in that window.
 */
export async function getCashFlowProjection(organizationId: string, weeks = 8): Promise<CashFlowBucket[]> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + weeks * WEEK_MS);

  const [dueInvoices, renewingSubscriptions] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ["SENT", "OVERDUE"] },
        dueDate: { gte: now, lte: windowEnd },
      },
      select: { dueDate: true, grandTotal: true, amountPaid: true },
    }),
    prisma.subscription.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
        renewalDate: { gte: now, lte: windowEnd },
      },
      select: { renewalDate: true, amount: true },
    }),
  ]);

  if (dueInvoices.length === 0 && renewingSubscriptions.length === 0) return [];

  const buckets: CashFlowBucket[] = Array.from({ length: weeks }, (_, i) => {
    const bucketStart = new Date(now.getTime() + i * WEEK_MS);
    return {
      periodLabel: bucketStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      expectedInflow: 0,
      fromInvoices: 0,
      fromSubscriptionRenewals: 0,
    };
  });

  const bucketIndexFor = (date: Date) => Math.min(weeks - 1, Math.floor((date.getTime() - now.getTime()) / WEEK_MS));

  for (const invoice of dueInvoices) {
    if (!invoice.dueDate) continue;
    const amount = Math.max(0, invoice.grandTotal - invoice.amountPaid);
    const bucket = buckets[bucketIndexFor(invoice.dueDate)];
    bucket.fromInvoices += amount;
    bucket.expectedInflow += amount;
  }

  for (const subscription of renewingSubscriptions) {
    if (!subscription.renewalDate) continue;
    const bucket = buckets[bucketIndexFor(subscription.renewalDate)];
    bucket.fromSubscriptionRenewals += subscription.amount;
    bucket.expectedInflow += subscription.amount;
  }

  return buckets;
}
