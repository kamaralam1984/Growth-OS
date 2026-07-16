import { prisma } from "@/lib/prisma";
import { computeCompanyHealth } from "@/lib/company-health";
import { getRevenueTimeMetrics } from "@/app/dashboard/_lib/metrics";
import { getMRR, getARR } from "@/lib/revenue/subscriptions";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Nothing else in this schema stores headline metrics over time, so trend
 * charts have no historical basis without this. Lazily upserts "today"'s
 * snapshot the first time Analytics is viewed each day — no cron/job runner
 * exists, so this is the honest way to build real history over time rather
 * than backfilling fake past data points.
 */
export async function ensureTodaySnapshot(organizationId: string, now: Date = new Date()): Promise<void> {
  const today = startOfDay(now);

  const existing = await prisma.metricSnapshot.findUnique({
    where: { organizationId_date: { organizationId, date: today } },
  });
  if (existing) return;

  const [health, revenueTime, leadsCount, dealsCount, mrr, arr] = await Promise.all([
    computeCompanyHealth(organizationId),
    getRevenueTimeMetrics(organizationId, now),
    prisma.lead.count({ where: { pipelineStage: { workspace: { organizationId } } } }),
    prisma.lead.count({
      where: { pipelineStage: { workspace: { organizationId }, name: "Won" } },
    }),
    getMRR(organizationId),
    getARR(organizationId),
  ]);

  const pipelineValue = revenueTime.dealsProgress.reduce((sum, s) => sum + s.count, 0);

  await prisma.metricSnapshot
    .upsert({
      where: { organizationId_date: { organizationId, date: today } },
      create: {
        organizationId,
        date: today,
        companyHealthScore: health.overall,
        revenueMonthToDate: revenueTime.monthlyRevenue,
        leadsCount,
        dealsCount,
        pipelineValue,
        mrr,
        arr,
      },
      update: { mrr, arr },
    })
    .catch(() => {
      // Benign race under concurrent requests — the unique constraint means
      // only one upsert wins, which is all we need.
    });
}

export interface SnapshotPoint {
  date: string;
  companyHealthScore: number;
  revenueMonthToDate: number;
  leadsCount: number;
  dealsCount: number;
  pipelineValue: number;
  mrr: number;
  arr: number;
}

export async function getSnapshotTrend(organizationId: string, days = 30): Promise<SnapshotPoint[]> {
  const since = startOfDay(new Date(Date.now() - days * DAY_MS));
  const snapshots = await prisma.metricSnapshot.findMany({
    where: { organizationId, date: { gte: since } },
    orderBy: { date: "asc" },
  });
  return snapshots.map((s) => ({
    date: s.date.toISOString(),
    companyHealthScore: s.companyHealthScore,
    revenueMonthToDate: s.revenueMonthToDate,
    leadsCount: s.leadsCount,
    dealsCount: s.dealsCount,
    pipelineValue: s.pipelineValue,
    mrr: s.mrr,
    arr: s.arr,
  }));
}

export interface TaskTrendPoint {
  label: string;
  completed: number;
}

/** Daily completed-task counts for the last N days, by Task.updatedAt (no completedAt field exists). */
export async function getTaskCompletionTrend(organizationId: string, days = 14): Promise<TaskTrendPoint[]> {
  const start = startOfDay(new Date(Date.now() - (days - 1) * DAY_MS));
  const tasks = await prisma.task.findMany({
    where: { organizationId, status: "COMPLETED", updatedAt: { gte: start } },
    select: { updatedAt: true },
  });

  const buckets: TaskTrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(start.getTime() + i * DAY_MS);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    buckets.push({
      label: dayStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      completed: tasks.filter((t) => t.updatedAt >= dayStart && t.updatedAt < dayEnd).length,
    });
  }
  return buckets;
}

export interface AgentLeaderboardEntry {
  id: string;
  name: string;
  type: string;
  completedTasksCount: number;
  confidenceScore: number | null;
}

export async function getAgentLeaderboard(organizationId: string): Promise<AgentLeaderboardEntry[]> {
  const agents = await prisma.aIAgentInstance.findMany({
    where: { organizationId, active: true },
    orderBy: { completedTasksCount: "desc" },
  });
  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    completedTasksCount: a.completedTasksCount,
    confidenceScore: a.confidenceScore,
  }));
}

export interface FunnelStage {
  stageName: string;
  count: number;
  value: number;
}

export async function getPipelineFunnel(organizationId: string): Promise<FunnelStage[]> {
  const stages = await prisma.pipelineStage.findMany({
    where: { workspace: { organizationId } },
    orderBy: { order: "asc" },
    include: { leads: { select: { estimatedValue: true } } },
  });
  return stages.map((s) => ({
    stageName: s.name,
    count: s.leads.length,
    value: s.leads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0),
  }));
}

/**
 * 7 (day-of-week) x 5 (week-of-current-month) grid of real completed-Task
 * counts, bucketed by Task.updatedAt — same updatedAt-as-completion-proxy
 * convention as getTaskCompletionTrend above (no completedAt field exists).
 * Scoped to the current calendar month so the grid reads as "this month's
 * activity" rather than an arbitrary rolling window.
 */
export async function getTaskActivityHeatmap(organizationId: string, now: Date = new Date()): Promise<number[][]> {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const tasks = await prisma.task.findMany({
    where: { organizationId, status: "COMPLETED", updatedAt: { gte: monthStart, lt: monthEnd } },
    select: { updatedAt: true },
  });

  const grid: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 5 }, () => 0));
  for (const task of tasks) {
    const dayOfWeek = task.updatedAt.getDay();
    const weekOfMonth = Math.min(4, Math.floor((task.updatedAt.getDate() - 1) / 7));
    grid[dayOfWeek][weekOfMonth] += 1;
  }
  return grid;
}

export interface CompanyRevenueSlice {
  companyId: string;
  companyName: string;
  value: number;
}

/** Real won-Deal value grouped by Company — $0-value/no-companyId deals are excluded, never fabricated. */
export async function getRevenueByCompany(organizationId: string): Promise<CompanyRevenueSlice[]> {
  const grouped = await prisma.deal.groupBy({
    by: ["companyId"],
    where: { organizationId, companyId: { not: null }, dealStage: { name: "Won" } },
    _sum: { value: true },
  });

  const companyIds = grouped.map((g) => g.companyId).filter((id): id is string => id !== null);
  if (companyIds.length === 0) return [];

  const companies = await prisma.company.findMany({
    where: { id: { in: companyIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(companies.map((c) => [c.id, c.name]));

  return grouped
    .filter((g) => g.companyId && (g._sum.value ?? 0) > 0)
    .map((g) => ({
      companyId: g.companyId as string,
      companyName: nameById.get(g.companyId as string) ?? "Unknown company",
      value: g._sum.value ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
}
