import { prisma } from "@/lib/prisma";
import { normalizeToMonthly } from "@/lib/revenue/subscriptions";

const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44; // average month length — no calendar assumed

function monthsBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / MS_PER_MONTH);
}

export interface CacResult {
  cac: number | null;
  totalSpend: number;
  newCustomerCount: number;
  formula: string;
}

/**
 * Real CAC from manually-logged spend — never a fabricated 0. Null when
 * there are no new customers in the period, or when no ExpenseEntry rows
 * have been logged for the period at all (i.e. spend isn't being tracked
 * yet, as distinct from a genuine $0 marketing/sales spend).
 */
export async function getCAC(organizationId: string, periodStart: Date, periodEnd: Date): Promise<CacResult> {
  const [expenseRowCount, spendRows, newCustomerCount] = await Promise.all([
    prisma.expenseEntry.count({
      where: { organizationId, incurredOn: { gte: periodStart, lte: periodEnd } },
    }),
    prisma.expenseEntry.findMany({
      where: { organizationId, category: { in: ["MARKETING", "SALES"] }, incurredOn: { gte: periodStart, lte: periodEnd } },
      select: { amount: true },
    }),
    prisma.client.count({
      where: { organizationId, createdAt: { gte: periodStart, lte: periodEnd } },
    }),
  ]);

  const totalSpend = spendRows.reduce((sum, row) => sum + row.amount, 0);
  const cac = newCustomerCount === 0 || expenseRowCount === 0 ? null : totalSpend / newCustomerCount;

  return {
    cac,
    totalSpend,
    newCustomerCount,
    formula: "CAC = Total Marketing + Sales spend (ExpenseEntry) ÷ New customers in period (Client.createdAt).",
  };
}

export interface LtvResult {
  ltv: number | null;
  sampleSize: number;
  formula: string;
}

/**
 * Real LTV from won-Deal value plus Subscription revenue collected to
 * date, averaged per-Company. Null when no company has any real revenue
 * yet — never a fabricated 0.
 */
export async function getLTV(organizationId: string): Promise<LtvResult> {
  const now = new Date();

  const [wonDeals, subscriptions] = await Promise.all([
    prisma.deal.findMany({
      where: { organizationId, companyId: { not: null }, value: { not: null }, dealStage: { name: "Won" } },
      select: { companyId: true, value: true },
    }),
    prisma.subscription.findMany({
      where: { organizationId, companyId: { not: null } },
      select: { companyId: true, amount: true, billingCycle: true, startDate: true, cancelledAt: true },
    }),
  ]);

  const revenueByCompany = new Map<string, number>();

  for (const deal of wonDeals) {
    if (!deal.companyId || deal.value == null) continue;
    revenueByCompany.set(deal.companyId, (revenueByCompany.get(deal.companyId) ?? 0) + deal.value);
  }

  for (const sub of subscriptions) {
    if (!sub.companyId) continue;
    const monthlyAmount = normalizeToMonthly(sub.amount, sub.billingCycle);
    const activeMonths = monthsBetween(sub.startDate, sub.cancelledAt && sub.cancelledAt < now ? sub.cancelledAt : now);
    const collected = monthlyAmount * activeMonths;
    revenueByCompany.set(sub.companyId, (revenueByCompany.get(sub.companyId) ?? 0) + collected);
  }

  const totalsWithRevenue = Array.from(revenueByCompany.values()).filter((total) => total > 0);
  const ltv =
    totalsWithRevenue.length === 0 ? null : totalsWithRevenue.reduce((sum, total) => sum + total, 0) / totalsWithRevenue.length;

  return {
    ltv,
    sampleSize: totalsWithRevenue.length,
    formula:
      "LTV = Average per-Company total of Won Deal value + Subscription revenue collected to date (monthly-normalized amount × months active), across companies with real revenue.",
  };
}

export function getLtvCacRatio(ltv: number | null, cac: number | null): { ratio: number | null } {
  if (ltv == null || cac == null || cac <= 0) return { ratio: null };
  return { ratio: ltv / cac };
}
