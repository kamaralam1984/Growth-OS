import { prisma } from "@/lib/prisma";
import type { UsageMetricType } from "@/generated/prisma/client";

export interface DailyUsagePoint {
  date: string; // "YYYY-MM-DD"
  total: number;
}

interface DailyUsageRow {
  date: Date;
  total: string | number | null;
}

/**
 * Real day-by-day sum of UsageRecord.quantity for one metric, last `days`
 * days — same date_trunc('day', ...) grouping approach as
 * getUsageTimeSeries in src/lib/api-usage.ts, applied to UsageRecord instead
 * of APIUsage. Days with no UsageRecord row simply don't appear in the
 * result (no synthetic zero-filled point is fabricated here); the chart
 * component itself only needs the real points that exist.
 */
export async function getDailyUsageTotals(
  organizationId: string,
  metricType: UsageMetricType,
  days: number,
): Promise<DailyUsagePoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<DailyUsageRow[]>`
    SELECT
      date_trunc('day', "createdAt") AS date,
      SUM("quantity")::float AS total
    FROM "UsageRecord"
    WHERE "organizationId" = ${organizationId}
      AND "metricType" = ${metricType}::"UsageMetricType"
      AND "createdAt" >= ${since}
    GROUP BY date_trunc('day', "createdAt")
    ORDER BY date ASC
  `;

  return rows.map((row) => ({
    date: row.date.toISOString().slice(0, 10),
    total: Number(row.total ?? 0),
  }));
}
