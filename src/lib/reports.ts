import { prisma } from "@/lib/prisma";
import { EXECUTIVE_AGENT_TYPES } from "@/lib/ai/personas";
import type { DecisionStatus } from "@/generated/prisma/client";

export type ReportPeriod = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

export interface ReportMeetingRow {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  durationMinutes: number | null;
  participantCount: number;
}

export interface ReportDecisionRow {
  id: string;
  topic: string;
  status: DecisionStatus;
  createdAt: Date;
  finalizedAt: Date | null;
}

export interface PeriodReport {
  period: ReportPeriod;
  rangeStart: Date;
  rangeEnd: Date;
  meetingsHeld: number;
  tasksCompleted: number;
  decisionsMade: number;
  messagesExchanged: number;
  meetings: ReportMeetingRow[];
  decisions: ReportDecisionRow[];
  decisionsByStatus: Record<DecisionStatus, number>;
}

export interface AgentProductivityRow {
  id: string;
  type: string;
  name: string;
  active: boolean;
  completedTasksCount: number;
  confidenceScore: number | null;
}

const DECISION_STATUSES: DecisionStatus[] = ["PENDING", "APPROVED", "REJECTED", "ESCALATED", "DELAYED", "DELEGATED"];

/**
 * Boundary rule (judgment call, documented since the brief left it open):
 *  - daily     = midnight today -> now
 *  - weekly    = Monday 00:00 of the current week -> now (matches the "meetings
 *    this week" stat already shown on the Executive Dashboard)
 *  - monthly   = the 1st of the current calendar month, 00:00 -> now
 *  - quarterly = the 1st of the current calendar quarter (Jan/Apr/Jul/Oct), 00:00 -> now
 *  - yearly    = January 1st of the current calendar year, 00:00 -> now
 * All ranges end at "now" rather than a fixed period end, since these are
 * "so far this period" reports, not closed historical periods.
 */
function getRange(period: ReportPeriod, now: Date): { start: Date; end: Date } {
  const end = now;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === "daily") {
    return { start, end };
  }
  if (period === "weekly") {
    const day = start.getDay(); // 0 = Sunday
    const diffToMonday = (day + 6) % 7;
    start.setDate(start.getDate() - diffToMonday);
    return { start, end };
  }
  if (period === "monthly") {
    start.setDate(1);
    return { start, end };
  }
  if (period === "quarterly") {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
    return { start, end };
  }
  // yearly
  start.setMonth(0, 1);
  return { start, end };
}

/**
 * Real Prisma count/groupBy queries for one reporting period — no fabricated
 * numbers. "Tasks completed" and "decisions made" are scoped to when the
 * status change actually happened (Task.updatedAt / Decision.finalizedAt)
 * rather than creation time, so a task created last month but finished today
 * correctly counts as completed "today".
 */
export async function getPeriodReport(organizationId: string, period: ReportPeriod): Promise<PeriodReport> {
  const { start, end } = getRange(period, new Date());
  const dateFilter = { gte: start, lte: end };

  const [meetingsHeld, tasksCompleted, decisionsMade, meetingMessagesCount, agentConversationsCount, meetingRows, decisionRows] =
    await Promise.all([
      prisma.meeting.count({ where: { organizationId, createdAt: dateFilter } }),
      prisma.task.count({ where: { organizationId, status: "COMPLETED", updatedAt: dateFilter } }),
      prisma.decision.count({ where: { organizationId, status: { not: "PENDING" }, finalizedAt: dateFilter } }),
      prisma.meetingMessage.count({ where: { meeting: { organizationId }, createdAt: dateFilter } }),
      prisma.agentConversation.count({ where: { organizationId, createdAt: dateFilter } }),
      prisma.meeting.findMany({
        where: { organizationId, createdAt: dateFilter },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          startedAt: true,
          endedAt: true,
          _count: { select: { participants: true } },
        },
      }),
      prisma.decision.findMany({
        where: { organizationId, OR: [{ createdAt: dateFilter }, { finalizedAt: dateFilter }] },
        orderBy: { createdAt: "desc" },
        select: { id: true, topic: true, status: true, createdAt: true, finalizedAt: true },
      }),
    ]);

  const decisionsByStatus = DECISION_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<DecisionStatus, number>,
  );
  for (const decision of decisionRows) {
    decisionsByStatus[decision.status] += 1;
  }

  return {
    period,
    rangeStart: start,
    rangeEnd: end,
    meetingsHeld,
    tasksCompleted,
    decisionsMade,
    messagesExchanged: meetingMessagesCount + agentConversationsCount,
    meetings: meetingRows.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      createdAt: m.createdAt,
      durationMinutes:
        m.startedAt && m.endedAt ? Math.max(1, Math.round((m.endedAt.getTime() - m.startedAt.getTime()) / 60000)) : null,
      participantCount: m._count.participants,
    })),
    decisions: decisionRows,
    decisionsByStatus,
  };
}

/**
 * Per-agent productivity — AIAgentInstance.completedTasksCount and
 * confidenceScore are cumulative/live fields the AI runtime updates directly
 * (see agent-runtime.ts, tasks/actions.ts runAgentTask), so this report is a
 * plain read of real state, not period-scoped.
 */
export async function getAgentProductivity(organizationId: string): Promise<AgentProductivityRow[]> {
  const agents = await prisma.aIAgentInstance.findMany({
    where: { organizationId, type: { in: EXECUTIVE_AGENT_TYPES } },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, name: true, active: true, completedTasksCount: true, confidenceScore: true },
  });
  return agents;
}
