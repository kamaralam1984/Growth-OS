import { prisma } from "@/lib/prisma";

const DONE_STATUSES = new Set(["COMPLETED", "ARCHIVED"]);
const MAX_DAYS = 60;

export interface BurndownPoint {
  date: string;
  idealRemaining: number;
  /** null for days in the future — not yet observed, never fabricated. */
  actualRemaining: number | null;
}

export interface SprintBurndown {
  sprintId: string;
  totalTasks: number;
  completedTasks: number;
  /** Sum of estimatedHours for tasks that reached a done status — real, 0-valued for tasks with no estimate, never guessed. */
  velocityHours: number;
  points: BurndownPoint[];
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/**
 * Real ideal-vs-actual burndown for a sprint, computed from the sprint's
 * current task membership and the deterministic TaskStatusChange log —
 * simple linear ideal line only (no holiday/partial-capacity modeling), per
 * the documented v1 scope. Tasks that joined the sprint mid-flight only
 * count as "remaining" from the day their first status-change was logged.
 */
export async function computeSprintBurndown(sprintId: string): Promise<SprintBurndown | null> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { tasks: { select: { id: true, status: true, estimatedHours: true } } },
  });
  if (!sprint) return null;

  const taskIds = sprint.tasks.map((t) => t.id);
  const changes = taskIds.length
    ? await prisma.taskStatusChange.findMany({ where: { taskId: { in: taskIds } }, orderBy: { changedAt: "asc" } })
    : [];

  const changesByTask = new Map<string, Array<{ toStatus: string; changedAt: Date }>>();
  for (const change of changes) {
    const list = changesByTask.get(change.taskId) ?? [];
    list.push({ toStatus: change.toStatus, changedAt: change.changedAt });
    changesByTask.set(change.taskId, list);
  }

  const totalTasks = sprint.tasks.length;
  const completedTasks = sprint.tasks.filter((t) => DONE_STATUSES.has(t.status)).length;
  const velocityHours = sprint.tasks
    .filter((t) => DONE_STATUSES.has(t.status))
    .reduce((sum, t) => sum + (t.estimatedHours ?? 0), 0);

  const start = startOfDay(sprint.startDate);
  const end = startOfDay(sprint.endDate);
  const dayCount = Math.min(MAX_DAYS, Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1));
  const now = new Date();

  const points: BurndownPoint[] = [];
  for (let i = 0; i < dayCount; i++) {
    const day = new Date(start.getTime() + i * 86_400_000);
    const idealRemaining = totalTasks === 0 ? 0 : Math.round(totalTasks * (1 - i / (dayCount - 1 || 1)));

    const dayEnd = endOfDay(day);
    const isFuture = dayEnd.getTime() > now.getTime();
    let actualRemaining: number | null = null;

    if (!isFuture) {
      actualRemaining = 0;
      for (const task of sprint.tasks) {
        const history = changesByTask.get(task.id) ?? [];
        const applicable = history.filter((c) => c.changedAt <= dayEnd);
        if (applicable.length === 0) continue;
        const latestStatus = applicable[applicable.length - 1].toStatus;
        if (!DONE_STATUSES.has(latestStatus)) actualRemaining++;
      }
    }

    points.push({ date: day.toISOString(), idealRemaining, actualRemaining });
  }

  return { sprintId, totalTasks, completedTasks, velocityHours, points };
}
