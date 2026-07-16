import { prisma } from "@/lib/prisma";

export interface GanttTask {
  id: string;
  title: string;
  status: string;
  startDate: Date;
  dueDate: Date;
  durationDays: number;
  dependsOnIds: string[];
  isCriticalPath: boolean;
}

export interface ProjectGantt {
  scheduled: GanttTask[];
  /** Tasks missing a real startDate/dueDate — shown separately rather than given a fabricated date. */
  unscheduled: Array<{ id: string; title: string; status: string }>;
  rangeStart: Date | null;
  rangeEnd: Date | null;
}

const DAY_MS = 86_400_000;

/**
 * Real topological-sort + longest-path over the Task.dependsOn graph.
 * "Critical path" here means: the single dependency-linked chain whose real
 * (dueDate - startDate) durations sum to the largest total — a deterministic,
 * unambiguous definition, not a fabricated schedule projection.
 */
export async function buildProjectGantt(projectId: string): Promise<ProjectGantt> {
  const tasks = await prisma.task.findMany({
    where: { projectId },
    select: {
      id: true,
      title: true,
      status: true,
      startDate: true,
      dueDate: true,
      dependsOn: { select: { id: true } },
    },
  });

  const scheduledSource = tasks.filter((t) => t.startDate && t.dueDate);
  const scheduledIds = new Set(scheduledSource.map((t) => t.id));

  const durationDays = new Map<string, number>();
  const dependsOnByTask = new Map<string, string[]>();
  for (const t of scheduledSource) {
    const start = t.startDate as Date;
    const end = t.dueDate as Date;
    durationDays.set(t.id, Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS)));
    dependsOnByTask.set(
      t.id,
      t.dependsOn.map((d) => d.id).filter((id) => scheduledIds.has(id)),
    );
  }

  // Kahn's topological sort restricted to the scheduled subgraph.
  const inDegree = new Map<string, number>();
  for (const id of scheduledIds) inDegree.set(id, 0);
  for (const [id, deps] of dependsOnByTask) {
    inDegree.set(id, deps.length);
  }
  const queue = [...scheduledIds].filter((id) => (inDegree.get(id) ?? 0) === 0);
  const successorsByTask = new Map<string, string[]>();
  for (const id of scheduledIds) successorsByTask.set(id, []);
  for (const [id, deps] of dependsOnByTask) {
    for (const dep of deps) successorsByTask.get(dep)?.push(id);
  }

  const topoOrder: string[] = [];
  const remainingInDegree = new Map(inDegree);
  const localQueue = [...queue];
  while (localQueue.length > 0) {
    const id = localQueue.shift()!;
    topoOrder.push(id);
    for (const successor of successorsByTask.get(id) ?? []) {
      const next = (remainingInDegree.get(successor) ?? 0) - 1;
      remainingInDegree.set(successor, next);
      if (next === 0) localQueue.push(successor);
    }
  }
  // Any ids left out of topoOrder are part of a dependency cycle — treat them
  // as having no resolvable predecessors rather than looping forever.
  for (const id of scheduledIds) if (!topoOrder.includes(id)) topoOrder.push(id);

  const longestEndingAt = new Map<string, number>();
  const predecessor = new Map<string, string | null>();
  for (const id of topoOrder) {
    const deps = dependsOnByTask.get(id) ?? [];
    let best = 0;
    let bestDep: string | null = null;
    for (const dep of deps) {
      const depValue = longestEndingAt.get(dep) ?? 0;
      if (depValue > best) {
        best = depValue;
        bestDep = dep;
      }
    }
    longestEndingAt.set(id, best + (durationDays.get(id) ?? 1));
    predecessor.set(id, bestDep);
  }

  let criticalEnd: string | null = null;
  let criticalLength = 0;
  for (const [id, length] of longestEndingAt) {
    if (length > criticalLength) {
      criticalLength = length;
      criticalEnd = id;
    }
  }
  const criticalPathIds = new Set<string>();
  let cursor = criticalEnd;
  while (cursor) {
    criticalPathIds.add(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }

  const scheduled: GanttTask[] = scheduledSource.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    startDate: t.startDate as Date,
    dueDate: t.dueDate as Date,
    durationDays: durationDays.get(t.id) ?? 1,
    dependsOnIds: dependsOnByTask.get(t.id) ?? [],
    isCriticalPath: criticalPathIds.has(t.id),
  }));
  scheduled.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  const unscheduled = tasks
    .filter((t) => !scheduledIds.has(t.id))
    .map((t) => ({ id: t.id, title: t.title, status: t.status }));

  const rangeStart = scheduled.length > 0 ? scheduled.reduce((min, t) => (t.startDate < min ? t.startDate : min), scheduled[0].startDate) : null;
  const rangeEnd = scheduled.length > 0 ? scheduled.reduce((max, t) => (t.dueDate > max ? t.dueDate : max), scheduled[0].dueDate) : null;

  return { scheduled, unscheduled, rangeStart, rangeEnd };
}
