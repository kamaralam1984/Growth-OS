import { prisma } from "@/lib/prisma";
import { computeProjectSpend } from "./health";

const DONE_STATUSES = new Set(["COMPLETED", "ARCHIVED"]);
const OPEN_STATUSES = ["PENDING", "RUNNING", "BLOCKED", "BACKLOG", "REVIEW", "TESTING", "READY_FOR_CLIENT"] as const;
const VELOCITY_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;

export interface CompletionPrediction {
  estimatedCompletionDate: Date | null;
  remainingTasks: number;
  tasksPerDay: number | null;
  basis: string;
}

export interface BudgetRisk {
  spent: number;
  budget: number | null;
  ratio: number | null;
  trend: "increasing" | "stable" | "decreasing" | null;
}

export interface ResourceShortage {
  totalCapacityHoursPerWeek: number;
  assignedOpenHours: number;
  shortfallHours: number;
}

export interface MemberProductivity {
  userId: string;
  name: string;
  completedTasks: number;
  estimatedHours: number;
  actualHours: number;
  /** actualHours / estimatedHours for completed tasks with both real values — null when not enough data, never guessed. */
  ratio: number | null;
}

export interface ClientSatisfaction {
  average: number;
  count: number;
}

export interface ProjectInsights {
  completion: CompletionPrediction;
  budgetRisk: BudgetRisk;
  resourceShortage: ResourceShortage | null;
  productivity: MemberProductivity[];
  clientSatisfaction: ClientSatisfaction | null;
}

/** Remaining open tasks ÷ recent real velocity (tasks completed per day over the trailing window) from TaskStatusChange — never a fabricated date. */
async function predictCompletion(projectId: string): Promise<CompletionPrediction> {
  const windowStart = new Date(Date.now() - VELOCITY_WINDOW_DAYS * DAY_MS);
  const [remainingTasks, completions] = await Promise.all([
    prisma.task.count({ where: { projectId, status: { in: Array.from(OPEN_STATUSES) as never[] } } }),
    prisma.taskStatusChange.count({
      where: { task: { projectId }, toStatus: { in: ["COMPLETED", "ARCHIVED"] as never[] }, changedAt: { gte: windowStart } },
    }),
  ]);

  if (completions === 0) {
    return { estimatedCompletionDate: null, remainingTasks, tasksPerDay: null, basis: "Not enough recent completion history to predict a date." };
  }

  const tasksPerDay = completions / VELOCITY_WINDOW_DAYS;
  const daysNeeded = remainingTasks / tasksPerDay;
  const estimatedCompletionDate = new Date(Date.now() + daysNeeded * DAY_MS);
  return {
    estimatedCompletionDate,
    remainingTasks,
    tasksPerDay,
    basis: `${completions} task(s) completed in the last ${VELOCITY_WINDOW_DAYS} days (${tasksPerDay.toFixed(2)}/day) against ${remainingTasks} remaining.`,
  };
}

async function computeBudgetRisk(projectId: string): Promise<BudgetRisk> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { budget: true } });
  const spent = await computeProjectSpend(projectId);
  const budget = project?.budget ?? null;
  const ratio = budget && budget > 0 ? spent / budget : null;

  const members = await prisma.projectMember.findMany({ where: { projectId }, select: { userId: true, hourlyRate: true } });
  const rateByUser = new Map(members.map((m) => [m.userId, m.hourlyRate ?? 0]));

  const windowStart = new Date(Date.now() - VELOCITY_WINDOW_DAYS * DAY_MS);
  const priorWindowStart = new Date(Date.now() - VELOCITY_WINDOW_DAYS * 2 * DAY_MS);
  const [recentEntries, priorEntries] = await Promise.all([
    prisma.timeEntry.findMany({ where: { projectId, billable: true, startedAt: { gte: windowStart } }, select: { durationMinutes: true, userId: true } }),
    prisma.timeEntry.findMany({
      where: { projectId, billable: true, startedAt: { gte: priorWindowStart, lt: windowStart } },
      select: { durationMinutes: true, userId: true },
    }),
  ]);
  const spendOf = (entries: typeof recentEntries) =>
    entries.reduce((sum, e) => sum + ((e.durationMinutes ?? 0) / 60) * (rateByUser.get(e.userId) ?? 0), 0);
  const recentSpend = spendOf(recentEntries);
  const priorSpend = spendOf(priorEntries);

  let trend: BudgetRisk["trend"] = null;
  if (priorSpend > 0 || recentSpend > 0) {
    if (priorSpend === 0) trend = recentSpend > 0 ? "increasing" : "stable";
    else if (recentSpend > priorSpend * 1.1) trend = "increasing";
    else if (recentSpend < priorSpend * 0.9) trend = "decreasing";
    else trend = "stable";
  }

  return { spent, budget, ratio, trend };
}

async function computeResourceShortage(projectId: string): Promise<ResourceShortage | null> {
  const members = await prisma.projectMember.findMany({ where: { projectId }, select: { capacityHoursPerWeek: true } });
  if (members.length === 0) return null;
  const totalCapacityHoursPerWeek = members.reduce((sum, m) => sum + (m.capacityHoursPerWeek ?? 0), 0);
  if (totalCapacityHoursPerWeek === 0) return null;

  const assignedHoursAgg = await prisma.task.aggregate({
    where: { projectId, status: { in: Array.from(OPEN_STATUSES) as never[] } },
    _sum: { estimatedHours: true },
  });
  const assignedOpenHours = assignedHoursAgg._sum.estimatedHours ?? 0;
  return { totalCapacityHoursPerWeek, assignedOpenHours, shortfallHours: Math.max(0, assignedOpenHours - totalCapacityHoursPerWeek) };
}

async function computeProductivity(projectId: string): Promise<MemberProductivity[]> {
  const members = await prisma.projectMember.findMany({ where: { projectId }, include: { user: { select: { id: true, name: true, email: true } } } });
  const results: MemberProductivity[] = [];
  for (const member of members) {
    const tasks = await prisma.task.findMany({
      where: { projectId, assignedToUserId: member.userId, status: { in: Array.from(DONE_STATUSES) as never[] } },
      select: { estimatedHours: true, actualHours: true },
    });
    const completedTasks = tasks.length;
    const estimatedHours = tasks.reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);
    const actualHours = tasks.reduce((sum, t) => sum + (t.actualHours ?? 0), 0);
    results.push({
      userId: member.userId,
      name: member.user.name ?? member.user.email ?? "Team member",
      completedTasks,
      estimatedHours,
      actualHours,
      ratio: estimatedHours > 0 && actualHours > 0 ? actualHours / estimatedHours : null,
    });
  }
  return results;
}

/** Real average of submitted client ratings — never a fabricated score when no ratings exist yet. */
async function computeClientSatisfaction(projectId: string): Promise<ClientSatisfaction | null> {
  const milestones = await prisma.milestone.findMany({ where: { projectId, clientSatisfactionRating: { not: null } }, select: { clientSatisfactionRating: true } });
  if (milestones.length === 0) return null;
  const sum = milestones.reduce((s, m) => s + (m.clientSatisfactionRating ?? 0), 0);
  return { average: sum / milestones.length, count: milestones.length };
}

export async function computeProjectInsights(projectId: string): Promise<ProjectInsights> {
  const [completion, budgetRisk, resourceShortage, productivity, clientSatisfaction] = await Promise.all([
    predictCompletion(projectId),
    computeBudgetRisk(projectId),
    computeResourceShortage(projectId),
    computeProductivity(projectId),
    computeClientSatisfaction(projectId),
  ]);
  return { completion, budgetRisk, resourceShortage, productivity, clientSatisfaction };
}
