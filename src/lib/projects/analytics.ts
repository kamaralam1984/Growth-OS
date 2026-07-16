import { prisma } from "@/lib/prisma";

const OPEN_TASK_STATUSES = ["PENDING", "RUNNING", "BLOCKED", "BACKLOG", "REVIEW", "TESTING", "READY_FOR_CLIENT"] as const;

export interface MemberUtilization {
  userId: string;
  name: string;
  /** Real capacity summed across every project this member is on (or the one project, when scoped) — never a fabricated default. */
  totalCapacityHoursPerWeek: number;
  /** Real estimated hours of currently-open tasks assigned to them. */
  assignedOpenHours: number;
  /** assignedOpenHours / totalCapacityHoursPerWeek, null when no capacity is set for this member. */
  utilizationPercent: number | null;
  projectCount: number;
}

/**
 * Shared resource-utilization query — one real aggregation reused by the
 * Owner Dashboard's org-wide resource view and any per-project team panel,
 * rather than three separate ad-hoc versions of the same math.
 */
export async function computeResourceUtilization(organizationId: string, opts?: { projectId?: string }): Promise<MemberUtilization[]> {
  const projectFilter = opts?.projectId ? { projectId: opts.projectId } : {};

  const members = await prisma.projectMember.findMany({
    where: { organizationId, ...projectFilter },
    select: { userId: true, capacityHoursPerWeek: true, projectId: true, user: { select: { name: true, email: true } } },
  });

  const capacityByUser = new Map<string, { name: string; totalCapacity: number; projectIds: Set<string> }>();
  for (const m of members) {
    const entry = capacityByUser.get(m.userId) ?? { name: m.user.name ?? m.user.email ?? "Team member", totalCapacity: 0, projectIds: new Set<string>() };
    entry.totalCapacity += m.capacityHoursPerWeek ?? 0;
    entry.projectIds.add(m.projectId);
    capacityByUser.set(m.userId, entry);
  }

  const assignedAgg = await prisma.task.groupBy({
    by: ["assignedToUserId"],
    where: {
      organizationId,
      projectId: opts?.projectId ? opts.projectId : { not: null },
      assignedToUserId: { in: [...capacityByUser.keys()] },
      status: { in: Array.from(OPEN_TASK_STATUSES) as never[] },
    },
    _sum: { estimatedHours: true },
  });
  const assignedByUser = new Map(assignedAgg.map((a) => [a.assignedToUserId as string, a._sum.estimatedHours ?? 0]));

  return [...capacityByUser.entries()].map(([userId, info]) => {
    const assignedOpenHours = assignedByUser.get(userId) ?? 0;
    return {
      userId,
      name: info.name,
      totalCapacityHoursPerWeek: info.totalCapacity,
      assignedOpenHours,
      utilizationPercent: info.totalCapacity > 0 ? Math.round((assignedOpenHours / info.totalCapacity) * 100) : null,
      projectCount: info.projectIds.size,
    };
  });
}
