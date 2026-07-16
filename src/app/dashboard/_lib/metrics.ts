import { prisma } from "@/lib/prisma";

/**
 * Command Center dashboard metrics — every number here traces to a real
 * Prisma query against real rows. Where a metric the brief asks for has no
 * honest way to compute it from this schema (e.g. a true "time saved"
 * measurement, since there is no time-tracking model), it is either omitted
 * or clearly labeled as an estimate — see AI_HOURS_PER_COMPLETED_TASK below.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

/**
 * Time-bucketed revenue/growth numbers layered on top of
 * src/lib/company-health.ts's computePipelineTotals (which already gives
 * pipelineValue/wonValue/leadsWithValueCount/totalLeadsCount) — this only
 * adds the period-over-period figures that function doesn't compute.
 */
export interface RevenueTimeMetrics {
  /**
   * Won-stage deal value for leads created this calendar month/year. Lead
   * has no "wonAt" timestamp (only createdAt), so this is "value of deals
   * created in the period that are currently Won" — a real, traceable
   * number, but not literally "closed this month" since a lead created
   * earlier and won later would count in its creation month, not its win
   * month. Documented limitation of the schema, not fabricated data.
   */
  monthlyRevenue: number;
  yearlyRevenue: number;
  /**
   * Period-over-period growth in total lead value created (last 30 days vs
   * the 30 days before that), from real Lead.createdAt/estimatedValue rows.
   * Null when the prior period has zero value to compare against — shown
   * honestly as "Not enough data yet" rather than a fabricated percentage.
   */
  growthPct: number | null;
  dealsProgress: Array<{ stageName: string; count: number }>;
}

export async function getRevenueTimeMetrics(organizationId: string, now: Date = new Date()): Promise<RevenueTimeMetrics> {
  const leads = await prisma.lead.findMany({
    where: { pipelineStage: { workspace: { organizationId } } },
    select: {
      estimatedValue: true,
      createdAt: true,
      pipelineStage: { select: { name: true, order: true } },
    },
  });

  const isWon = (name: string) => name === "Won";

  const monthStart = startOfMonth(now);
  const yearStart = startOfYear(now);
  const monthlyRevenue = leads
    .filter((l) => isWon(l.pipelineStage.name) && l.createdAt >= monthStart)
    .reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);
  const yearlyRevenue = leads
    .filter((l) => isWon(l.pipelineStage.name) && l.createdAt >= yearStart)
    .reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);

  const period30Start = new Date(now.getTime() - 30 * DAY_MS);
  const period60Start = new Date(now.getTime() - 60 * DAY_MS);
  const currentPeriodValue = leads
    .filter((l) => l.createdAt >= period30Start)
    .reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);
  const previousPeriodValue = leads
    .filter((l) => l.createdAt >= period60Start && l.createdAt < period30Start)
    .reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);
  const growthPct = previousPeriodValue > 0 ? ((currentPeriodValue - previousPeriodValue) / previousPeriodValue) * 100 : null;

  const stageCounts = new Map<string, { order: number; count: number }>();
  for (const lead of leads) {
    const key = lead.pipelineStage.name;
    const existing = stageCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      stageCounts.set(key, { order: lead.pipelineStage.order, count: 1 });
    }
  }
  const dealsProgress = Array.from(stageCounts.entries())
    .map(([stageName, v]) => ({ stageName, count: v.count, order: v.order }))
    .sort((a, b) => a.order - b.order)
    .map(({ stageName, count }) => ({ stageName, count }));

  return {
    monthlyRevenue,
    yearlyRevenue,
    growthPct,
    dealsProgress,
  };
}

export interface ExecutiveCardMetrics {
  todaysLeads: number;
  todaysMeetings: number;
  aiDecisionsPending: number;
  proposalsReady: number;
  /**
   * Combined "Emails Ready / LinkedIn Tasks" into one honest card: Task has
   * no channel field, so completed Outreach-agent tasks can't be reliably
   * split into email vs. LinkedIn without guessing from free-text titles.
   * Documented choice — see AGENTS.md brief.
   */
  outreachReady: number;
  /**
   * Task has no priority field. "Urgent" = overdue and not yet resolved
   * (dueDate in the past, status not COMPLETED/CANCELLED). Documented
   * definition, not a fabricated priority signal.
   */
  urgentTasks: number;
  /** Same PENDING Decision count as aiDecisionsPending — intentional, documented in the brief. */
  approvalsPending: number;
}

export async function getExecutiveCardMetrics(organizationId: string, now: Date = new Date()): Promise<ExecutiveCardMetrics> {
  const todayStart = startOfDay(now);

  const [todaysLeads, todaysMeetings, pendingDecisions, proposalTasksReady, draftProposals, outreachReady, urgentTasks] =
    await Promise.all([
      prisma.lead.count({
        where: { pipelineStage: { workspace: { organizationId } }, createdAt: { gte: todayStart } },
      }),
      prisma.meeting.count({ where: { organizationId, createdAt: { gte: todayStart } } }),
      prisma.decision.count({ where: { organizationId, status: "PENDING" } }),
      prisma.task.count({
        where: { organizationId, status: "COMPLETED", assignedToAgent: { type: "PROPOSAL" } },
      }),
      // Now that the Proposal workspace exists (see src/app/dashboard/proposal),
      // a real Proposal{status: DRAFT} row is a more direct "ready" signal than
      // a completed agent task — additive with the older signal, not a
      // replacement, so nothing regresses for orgs still using ad-hoc agent tasks.
      prisma.proposal.count({ where: { organizationId, status: "DRAFT" } }),
      prisma.task.count({
        where: { organizationId, status: "COMPLETED", assignedToAgent: { type: "OUTREACH" } },
      }),
      prisma.task.count({
        where: {
          organizationId,
          dueDate: { lt: now },
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
      }),
    ]);

  return {
    todaysLeads,
    todaysMeetings,
    aiDecisionsPending: pendingDecisions,
    proposalsReady: proposalTasksReady + draftProposals,
    outreachReady,
    urgentTasks,
    approvalsPending: pendingDecisions,
  };
}

export interface AiProductivityMetrics {
  /** Average AIAgentInstance.confidenceScore across active agents that have one; null if none do. */
  avgConfidence: number | null;
  /** Sum of AIAgentInstance.completedTasksCount across all agents — a real, running counter. */
  totalAgentCompletedTasks: number;
  /** % of COMPLETED tasks assigned to an agent vs. to a human. Null if no completed tasks exist yet. */
  automationPct: number | null;
}

export async function getAiProductivityMetrics(organizationId: string): Promise<AiProductivityMetrics> {
  const [agents, agentCompleted, humanCompleted] = await Promise.all([
    prisma.aIAgentInstance.findMany({ where: { organizationId, active: true }, select: { confidenceScore: true, completedTasksCount: true } }),
    prisma.task.count({ where: { organizationId, status: "COMPLETED", assignedToAgentId: { not: null } } }),
    prisma.task.count({ where: { organizationId, status: "COMPLETED", assignedToUserId: { not: null } } }),
  ]);

  const withConfidence = agents.filter((a): a is typeof a & { confidenceScore: number } => a.confidenceScore != null);
  const avgConfidence = withConfidence.length > 0 ? withConfidence.reduce((sum, a) => sum + a.confidenceScore, 0) / withConfidence.length : null;
  const totalAgentCompletedTasks = agents.reduce((sum, a) => sum + a.completedTasksCount, 0);

  const completedTotal = agentCompleted + humanCompleted;
  const automationPct = completedTotal > 0 ? (agentCompleted / completedTotal) * 100 : null;

  return { avgConfidence, totalAgentCompletedTasks, automationPct };
}

/**
 * Documented estimate, not a measurement: this schema has no time-tracking
 * model, so there is no real "hours saved" to sum. Each agent-completed task
 * is credited with this many estimated hours of human work it stood in for.
 * Always rendered in the UI labeled "estimated", never as a precise fact.
 */
export const AI_HOURS_PER_COMPLETED_TASK = 0.5;

export interface ProductivityDashboardMetrics {
  tasksCompleted: number;
  meetingsHeld: number;
  /** completedTasksCount (agent-assigned, COMPLETED) x AI_HOURS_PER_COMPLETED_TASK — an estimate, not a measurement. */
  aiHoursSavedEstimate: number;
  /**
   * % of agent-assigned tasks that reached COMPLETED among those that
   * reached any terminal state (COMPLETED/BLOCKED/CANCELLED — this schema
   * has no explicit FAILED status, so BLOCKED/CANCELLED stand in for
   * "did not complete"). Null if no agent-assigned task has reached a
   * terminal state yet.
   */
  automationSuccessPct: number | null;
  /** Tasks completed per day for the last 7 days (oldest first), by Task.updatedAt (no completedAt field exists). */
  weeklyPerformance: Array<{ label: string; count: number }>;
}

export async function getProductivityDashboardMetrics(
  organizationId: string,
  now: Date = new Date(),
): Promise<ProductivityDashboardMetrics> {
  const weekStart = startOfDay(new Date(now.getTime() - 6 * DAY_MS));

  const [tasksCompleted, meetingsHeld, agentCompletedForEstimate, agentTerminalTasks, recentCompletedTasks] = await Promise.all([
    prisma.task.count({ where: { organizationId, status: "COMPLETED" } }),
    prisma.meeting.count({ where: { organizationId, status: "COMPLETED" } }),
    prisma.task.count({ where: { organizationId, status: "COMPLETED", assignedToAgentId: { not: null } } }),
    prisma.task.findMany({
      where: { organizationId, assignedToAgentId: { not: null }, status: { in: ["COMPLETED", "BLOCKED", "CANCELLED"] } },
      select: { status: true },
    }),
    prisma.task.findMany({
      where: { organizationId, status: "COMPLETED", updatedAt: { gte: weekStart } },
      select: { updatedAt: true },
    }),
  ]);

  const automationSuccessPct =
    agentTerminalTasks.length > 0
      ? (agentTerminalTasks.filter((t) => t.status === "COMPLETED").length / agentTerminalTasks.length) * 100
      : null;

  const dayBuckets: Array<{ start: Date; end: Date; label: string }> = [];
  for (let i = 0; i < 7; i++) {
    const start = new Date(weekStart.getTime() + i * DAY_MS);
    const end = new Date(start.getTime() + DAY_MS);
    dayBuckets.push({ start, end, label: start.toLocaleDateString(undefined, { weekday: "short" }) });
  }
  const weeklyPerformance = dayBuckets.map(({ start, end, label }) => ({
    label,
    count: recentCompletedTasks.filter((t) => t.updatedAt >= start && t.updatedAt < end).length,
  }));

  return {
    tasksCompleted,
    meetingsHeld,
    aiHoursSavedEstimate: agentCompletedForEstimate * AI_HOURS_PER_COMPLETED_TASK,
    automationSuccessPct,
    weeklyPerformance,
  };
}
