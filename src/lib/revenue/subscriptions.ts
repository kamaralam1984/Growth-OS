import { prisma } from "@/lib/prisma";
import type { SubscriptionBillingCycle } from "@/generated/prisma/client";

/**
 * Normalizes a subscription's amount to a monthly figure so mixed billing
 * cycles can be summed honestly — MONTHLY passes through as-is, QUARTERLY
 * divides by 3, YEARLY divides by 12.
 */
export function normalizeToMonthly(amount: number, cycle: SubscriptionBillingCycle): number {
  switch (cycle) {
    case "MONTHLY":
      return amount;
    case "QUARTERLY":
      return amount / 3;
    case "YEARLY":
      return amount / 12;
  }
}

/**
 * Monthly Recurring Revenue — sum of normalizeToMonthly() over ACTIVE
 * Subscription rows only. TRIALING is deliberately excluded: it isn't
 * committed revenue yet. Real 0 (never null) when no subscriptions exist.
 */
export async function getMRR(organizationId: string): Promise<number> {
  const subscriptions = await prisma.subscription.findMany({
    where: { organizationId, status: "ACTIVE" },
    select: { amount: true, billingCycle: true },
  });
  return subscriptions.reduce((sum, s) => sum + normalizeToMonthly(s.amount, s.billingCycle), 0);
}

/** Annual Recurring Revenue — MRR × 12, the standard SaaS-metrics convention. */
export async function getARR(organizationId: string): Promise<number> {
  const mrr = await getMRR(organizationId);
  return mrr * 12;
}

export interface ChurnRateResult {
  ratePct: number | null;
  cancelledCount: number;
  activeAtPeriodStart: number;
  formula: string;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

/**
 * Monthly churn rate = cancelled-during-the-month ÷ active-at-period-start.
 * `ratePct` is null (never a fabricated 0%) when there were no subscriptions
 * active at the start of the period — there is nothing to churn from.
 */
export async function getMonthlyChurnRate(organizationId: string, month: Date): Promise<ChurnRateResult> {
  const periodStart = startOfMonth(month);
  const periodEnd = startOfNextMonth(month);

  const [cancelledCount, activeAtPeriodStart] = await Promise.all([
    prisma.subscription.count({
      where: { organizationId, cancelledAt: { gte: periodStart, lt: periodEnd } },
    }),
    prisma.subscription.count({
      where: {
        organizationId,
        startDate: { lte: periodStart },
        OR: [{ cancelledAt: null }, { cancelledAt: { gt: periodStart } }],
      },
    }),
  ]);

  const ratePct = activeAtPeriodStart === 0 ? null : (cancelledCount / activeAtPeriodStart) * 100;

  return {
    ratePct,
    cancelledCount,
    activeAtPeriodStart,
    formula: "Monthly churn rate = (subscriptions cancelled during the month ÷ subscriptions active at the start of the month) × 100.",
  };
}
