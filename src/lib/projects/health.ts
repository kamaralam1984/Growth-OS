import { prisma } from "@/lib/prisma";

const DONE_STATUSES = new Set(["COMPLETED", "ARCHIVED"]);
const CLOSED_STATUSES = new Set(["COMPLETED", "ARCHIVED", "CANCELLED"]);

/**
 * Recomputes Project.progress (0-100, cached) from real Task rows —
 * completed-or-archived task count over total task count for this project.
 * Zero tasks means zero progress, never a fabricated 100%. Called after
 * every task create/status-change/delete within a project.
 */
export async function recomputeProjectProgress(projectId: string): Promise<number> {
  const [total, done] = await Promise.all([
    prisma.task.count({ where: { projectId } }),
    prisma.task.count({ where: { projectId, status: { in: Array.from(DONE_STATUSES) as never[] } } }),
  ]);
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);
  await prisma.project.update({ where: { id: projectId }, data: { progress } });
  return progress;
}

/**
 * Recomputes Project.healthStatus from real signals — overdue-task ratio
 * and budget burn — never hand-set to a fabricated value. Thresholds are a
 * documented judgment call, not a hidden magic number.
 */
export async function recomputeProjectHealth(projectId: string): Promise<"ON_TRACK" | "AT_RISK" | "OFF_TRACK"> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { budget: true } });
  if (!project) return "ON_TRACK";

  const now = new Date();
  const [totalOpen, overdueOpen, timeEntries, members] = await Promise.all([
    prisma.task.count({ where: { projectId, status: { notIn: Array.from(CLOSED_STATUSES) as never[] } } }),
    prisma.task.count({
      where: { projectId, status: { notIn: Array.from(CLOSED_STATUSES) as never[] }, dueDate: { lt: now } },
    }),
    prisma.timeEntry.findMany({ where: { projectId, billable: true }, select: { durationMinutes: true, userId: true } }),
    prisma.projectMember.findMany({ where: { projectId }, select: { userId: true, hourlyRate: true } }),
  ]);

  const overdueRatio = totalOpen === 0 ? 0 : overdueOpen / totalOpen;

  const rateByUser = new Map(members.map((m) => [m.userId, m.hourlyRate ?? 0]));
  const spent = timeEntries.reduce((sum, entry) => {
    const hours = (entry.durationMinutes ?? 0) / 60;
    return sum + hours * (rateByUser.get(entry.userId) ?? 0);
  }, 0);
  const budgetRatio = project.budget && project.budget > 0 ? spent / project.budget : null;

  let healthStatus: "ON_TRACK" | "AT_RISK" | "OFF_TRACK" = "ON_TRACK";
  if (overdueRatio > 0.3 || (budgetRatio != null && budgetRatio > 1)) {
    healthStatus = "OFF_TRACK";
  } else if (overdueRatio > 0.1 || (budgetRatio != null && budgetRatio > 0.85)) {
    healthStatus = "AT_RISK";
  }

  await prisma.project.update({ where: { id: projectId }, data: { healthStatus } });
  return healthStatus;
}

/** Convenience: recompute both after any task/time-entry mutation. */
export async function recomputeProjectMetrics(projectId: string): Promise<void> {
  await Promise.all([recomputeProjectProgress(projectId), recomputeProjectHealth(projectId)]);
}

/** Real spend total (hours × real per-member hourly rate) — never fabricated, null contributors treated as $0/hr, not guessed. */
export async function computeProjectSpend(projectId: string): Promise<number> {
  const spendByProjectId = await computeProjectSpendBatch([projectId]);
  return spendByProjectId.get(projectId) ?? 0;
}

/**
 * Batched real spend total for many projects at once — issues exactly 2
 * queries (scoped by `projectId: { in: projectIds }`) regardless of how many
 * project ids are passed in, instead of 2 queries per project. Used by
 * dashboard pages that need every active project's spend (previously a real
 * N+1: `activeProjects.map(p => computeProjectSpend(p.id))` fired 2×N
 * queries for N active projects). Same math as computeProjectSpend, just
 * grouped in memory by projectId after one round trip per table.
 */
export async function computeProjectSpendBatch(projectIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>(projectIds.map((id) => [id, 0]));
  if (projectIds.length === 0) return result;

  const [timeEntries, members] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { projectId: { in: projectIds }, billable: true },
      select: { projectId: true, durationMinutes: true, userId: true },
    }),
    prisma.projectMember.findMany({
      where: { projectId: { in: projectIds } },
      select: { projectId: true, userId: true, hourlyRate: true },
    }),
  ]);

  // rate lookups are per-project (a member's rate is specific to the project they're on)
  const rateByProjectUser = new Map<string, number>();
  for (const m of members) rateByProjectUser.set(`${m.projectId}:${m.userId}`, m.hourlyRate ?? 0);

  for (const entry of timeEntries) {
    const hours = (entry.durationMinutes ?? 0) / 60;
    const rate = rateByProjectUser.get(`${entry.projectId}:${entry.userId}`) ?? 0;
    result.set(entry.projectId, (result.get(entry.projectId) ?? 0) + hours * rate);
  }

  return result;
}
