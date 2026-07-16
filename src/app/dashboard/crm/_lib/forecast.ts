import { prisma } from "@/lib/prisma";

const TERMINAL_STAGE_NAMES = new Set(["Won", "Lost", "Archived"]);

export interface SalesForecast {
  /** % of decided deals (Won + Lost) that were Won. Null if nothing decided yet. */
  winRate: number | null;
  /** Average value of Won deals with a real value set. Null if none. */
  avgDealSize: number | null;
  /** Classic (Open Deals × Win Rate × Avg Deal Size) ÷ Avg Sales Cycle formula. Null if inputs are missing. */
  salesVelocityPerDay: number | null;
  avgSalesCycleDays: number | null;
  openPipelineValue: number;
  weightedForecastValue: number;
  openDealsCount: number;
  formula: string;
}

/**
 * Real forecast computed from Deal rows — nothing here is AI-estimated or
 * fabricated. Deal has no explicit "wonAt" timestamp, so the sales-cycle
 * length uses updatedAt - createdAt for Won deals as the closest honest
 * proxy (same documented-limitation pattern as
 * src/app/dashboard/_lib/metrics.ts's weeklyPerformance using
 * Task.updatedAt in place of a non-existent completedAt).
 */
export async function getSalesForecast(organizationId: string): Promise<SalesForecast> {
  const deals = await prisma.deal.findMany({
    where: { organizationId },
    select: { value: true, probability: true, createdAt: true, updatedAt: true, dealStage: { select: { name: true } } },
  });

  const won = deals.filter((d) => d.dealStage.name === "Won");
  const lost = deals.filter((d) => d.dealStage.name === "Lost");
  const decided = won.length + lost.length;
  const winRate = decided > 0 ? (won.length / decided) * 100 : null;

  const wonWithValue = won.filter((d) => d.value != null);
  const avgDealSize = wonWithValue.length > 0 ? wonWithValue.reduce((sum, d) => sum + (d.value ?? 0), 0) / wonWithValue.length : null;

  const cycleDays = won
    .map((d) => (d.updatedAt.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    .filter((days) => days >= 0);
  const avgSalesCycleDays = cycleDays.length > 0 ? cycleDays.reduce((sum, d) => sum + d, 0) / cycleDays.length : null;

  const openDeals = deals.filter((d) => !TERMINAL_STAGE_NAMES.has(d.dealStage.name));
  const openPipelineValue = openDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const weightedForecastValue = openDeals.reduce((sum, d) => sum + (d.value ?? 0) * ((d.probability ?? 0) / 100), 0);

  let salesVelocityPerDay: number | null = null;
  if (winRate != null && avgDealSize != null && avgSalesCycleDays && avgSalesCycleDays > 0) {
    salesVelocityPerDay = (openDeals.length * (winRate / 100) * avgDealSize) / avgSalesCycleDays;
  }

  return {
    winRate,
    avgDealSize,
    salesVelocityPerDay,
    avgSalesCycleDays,
    openPipelineValue,
    weightedForecastValue,
    openDealsCount: openDeals.length,
    formula:
      "Sales Velocity = (Open Deals × Win Rate × Avg Deal Size) ÷ Avg Sales Cycle Length. Weighted Forecast = Σ (each open deal's value × its own probability).",
  };
}
