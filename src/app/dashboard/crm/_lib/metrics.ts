import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface CrmDashboardMetrics {
  todaysLeads: number;
  todaysTasks: number;
  todaysMeetings: number;
  openDeals: number;
  dealsWon: number;
  dealsLost: number;
  /** Sum of value for deals currently in a "Won" stage — real revenue, no fabrication. */
  revenue: number;
  /** Sum of value for every deal not yet in a terminal (Won/Lost/Archived) stage. */
  pipelineValue: number;
  upcomingDeadlinesCount: number;
}

const TERMINAL_STAGE_NAMES = new Set(["Won", "Lost", "Archived"]);

/**
 * Real CRM Dashboard numbers — same "trace every number to a live query,
 * document any proxy" discipline as
 * src/app/dashboard/_lib/metrics.ts (the Command Center's own metrics
 * module, reused directly for todaysLeads/todaysMeetings below rather than
 * re-querying the same thing twice).
 */
export async function getCrmDashboardMetrics(organizationId: string, now: Date = new Date()): Promise<CrmDashboardMetrics> {
  const todayStart = startOfDay(now);
  const next7Days = new Date(now.getTime() + 7 * DAY_MS);

  const [todaysLeads, todaysTasks, todaysMeetings, deals, upcomingDeadlinesCount] = await Promise.all([
    prisma.lead.count({
      where: { pipelineStage: { workspace: { organizationId } }, createdAt: { gte: todayStart } },
    }),
    prisma.task.count({ where: { organizationId, createdAt: { gte: todayStart } } }),
    prisma.meeting.count({ where: { organizationId, createdAt: { gte: todayStart } } }),
    prisma.deal.findMany({
      where: { organizationId },
      select: { value: true, dealStage: { select: { name: true } } },
    }),
    prisma.task.count({
      where: {
        organizationId,
        dueDate: { gte: now, lte: next7Days },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
    }),
  ]);

  const wonDeals = deals.filter((d) => d.dealStage.name === "Won");
  const lostDeals = deals.filter((d) => d.dealStage.name === "Lost");
  const openDeals = deals.filter((d) => !TERMINAL_STAGE_NAMES.has(d.dealStage.name));

  return {
    todaysLeads,
    todaysTasks,
    todaysMeetings,
    openDeals: openDeals.length,
    dealsWon: wonDeals.length,
    dealsLost: lostDeals.length,
    revenue: wonDeals.reduce((sum, d) => sum + (d.value ?? 0), 0),
    pipelineValue: openDeals.reduce((sum, d) => sum + (d.value ?? 0), 0),
    upcomingDeadlinesCount,
  };
}

export interface UpcomingDeadline {
  id: string;
  title: string;
  dueDate: Date;
  kind: "task" | "deal";
}

/** Real upcoming-deadline list (next 7 days) — Task due dates and Deal expected close dates. */
export async function getUpcomingDeadlines(organizationId: string, now: Date = new Date(), days = 7): Promise<UpcomingDeadline[]> {
  const rangeEnd = new Date(now.getTime() + days * DAY_MS);

  const [tasks, deals] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId, dueDate: { gte: now, lte: rangeEnd }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      select: { id: true, title: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
    prisma.deal.findMany({
      where: { organizationId, expectedCloseDate: { gte: now, lte: rangeEnd } },
      select: { id: true, name: true, expectedCloseDate: true },
      orderBy: { expectedCloseDate: "asc" },
      take: 10,
    }),
  ]);

  const deadlines: UpcomingDeadline[] = [
    ...tasks.map((t) => ({ id: t.id, title: t.title, dueDate: t.dueDate as Date, kind: "task" as const })),
    ...deals.map((d) => ({ id: d.id, title: d.name, dueDate: d.expectedCloseDate as Date, kind: "deal" as const })),
  ];

  return deadlines.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime()).slice(0, 10);
}
