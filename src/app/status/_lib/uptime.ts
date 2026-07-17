import { prisma } from "@/lib/prisma";

/**
 * Real uptime math for the public status page — every number here comes
 * from actual `SystemHealthSnapshot` rows (written by the periodic
 * health-snapshot job and by every real request to `/api/health`; see
 * src/lib/monitoring/aggregate.ts's `persistHealthSnapshots`). Nothing here
 * is ever a fabricated "99.99%" — when a window has zero recorded rows,
 * `percent` is `null` and the page must render an honest "no data yet"
 * state instead of a made-up number.
 *
 * Granularity: one row = one component's health check at one point in
 * time. A row counts as "up" when its status is HEALTHY or DEGRADED, and
 * "down" only when status is DOWN — this mirrors `/api/health`'s own real
 * semantics (see src/app/api/health/route.ts: only DOWN returns HTTP 503;
 * DEGRADED still returns 200, same as this app treats "AI provider not
 * configured" as DEGRADED, not an outage, everywhere else). The percentage
 * is therefore "share of recorded component-checks across the whole
 * platform that were not DOWN," not a per-component figure.
 */
export interface UptimeWindow {
  label: string;
  days: number;
  totalChecks: number;
  downChecks: number;
  /** null when totalChecks === 0 — an honest "no data recorded in this window yet," never a fabricated percentage. */
  percent: number | null;
}

const WINDOW_DEFINITIONS: { label: string; days: number }[] = [
  { label: "Last 24 hours", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
];

export async function computeUptimeWindows(now: Date = new Date()): Promise<UptimeWindow[]> {
  return Promise.all(
    WINDOW_DEFINITIONS.map(async ({ label, days }) => {
      const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const [totalChecks, downChecks] = await Promise.all([
        prisma.systemHealthSnapshot.count({ where: { createdAt: { gte: since } } }),
        prisma.systemHealthSnapshot.count({ where: { createdAt: { gte: since }, status: "DOWN" } }),
      ]);
      return {
        label,
        days,
        totalChecks,
        downChecks,
        percent: totalChecks === 0 ? null : ((totalChecks - downChecks) / totalChecks) * 100,
      };
    }),
  );
}

/**
 * Whether ANY health-snapshot history exists at all, ever — distinct from a
 * single window having zero rows. A fresh deployment where the
 * health-snapshot job hasn't run yet should say "no historical data yet,"
 * not silently show three "no data" windows that look like a broken page.
 */
export async function hasAnyHealthHistory(): Promise<boolean> {
  const row = await prisma.systemHealthSnapshot.findFirst({ select: { id: true } });
  return row !== null;
}
