"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { MembershipRole } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
}

export interface TeamMemberWorkload {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: MembershipRole;
  openDealsCount: number;
  openDealsValue: number;
  openTasksCount: number;
}

/**
 * Real per-member workload — Deal.ownerUserId and Task.assignedToUserId are
 * the only two "who owns this work" fields in the schema, so workload is
 * exactly those two counts, nothing estimated.
 */
export async function getTeamWorkspace(organizationId: string): Promise<TeamMemberWorkload[]> {
  const memberships = await prisma.membership.findMany({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  });

  const [dealsByOwner, tasksByAssignee] = await Promise.all([
    prisma.deal.groupBy({
      by: ["ownerUserId"],
      where: { organizationId, ownerUserId: { not: null }, dealStage: { name: { notIn: ["Won", "Lost", "Archived"] } } },
      _count: { _all: true },
      _sum: { value: true },
    }),
    prisma.task.groupBy({
      by: ["assignedToUserId"],
      where: { organizationId, assignedToUserId: { not: null }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      _count: { _all: true },
    }),
  ]);

  const dealMap = new Map(dealsByOwner.map((d) => [d.ownerUserId, d]));
  const taskMap = new Map(tasksByAssignee.map((t) => [t.assignedToUserId, t]));

  return memberships.map((m) => ({
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    image: m.user.image,
    role: m.role,
    openDealsCount: dealMap.get(m.user.id)?._count._all ?? 0,
    openDealsValue: dealMap.get(m.user.id)?._sum.value ?? 0,
    openTasksCount: taskMap.get(m.user.id)?._count._all ?? 0,
  }));
}

const ASSIGNABLE_ROLES: MembershipRole[] = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "SALES",
  "MARKETING",
  "DEVELOPER",
  "SUPPORT",
  "FINANCE",
  "HR",
  "VIEWER",
];

export async function updateMemberRole(targetUserId: string, role: MembershipRole): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  if (!ASSIGNABLE_ROLES.includes(role)) return { ok: false, error: "Not a valid role." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return { ok: false, error: "Only owners and admins can change team roles." };
  }

  const target = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: targetUserId, organizationId: membership.organizationId } },
  });
  if (!target) return { ok: false, error: "Team member not found." };
  if (target.role === "OWNER" && role !== "OWNER") {
    const ownerCount = await prisma.membership.count({ where: { organizationId: membership.organizationId, role: "OWNER", status: "ACTIVE" } });
    if (ownerCount <= 1) return { ok: false, error: "An organization needs at least one owner." };
  }

  await prisma.membership.update({
    where: { userId_organizationId: { userId: targetUserId, organizationId: membership.organizationId } },
    data: { role },
  });

  await logAudit({ userId, organizationId: membership.organizationId, action: "crm.member_role_updated", metadata: { targetUserId, role } });
  revalidatePath("/dashboard/crm/team");
  return { ok: true };
}
