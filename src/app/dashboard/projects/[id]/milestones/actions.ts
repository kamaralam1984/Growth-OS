"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { milestoneSchema, type MilestoneInput } from "@/lib/validations/milestone";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

async function resolveProjectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true, name: true } });
  if (!project) return null;
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: project.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") return null;
  return { membership, project };
}

export interface CreateMilestoneResult extends ActionResult {
  milestoneId?: string;
}

export async function createMilestone(projectId: string, input: MilestoneInput): Promise<CreateMilestoneResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the milestone details." };

  const access = await resolveProjectAccess(userId, projectId);
  if (!access) return { ok: false, error: "Project not found." };
  if (!PRIVILEGED_ROLES.has(access.membership.role)) return { ok: false, error: "Only owners and admins can manage milestones." };

  const maxOrder = await prisma.milestone.aggregate({ where: { projectId }, _max: { order: true } });

  const milestone = await prisma.milestone.create({
    data: {
      projectId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      dueDate: parsed.data.dueDate ?? null,
      status: parsed.data.status,
      visibleToClient: parsed.data.visibleToClient,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });

  await logAudit({ userId, organizationId: access.membership.organizationId, action: "projects.milestone_created", metadata: { projectId, milestoneId: milestone.id } });
  revalidatePath(`/dashboard/projects/${projectId}/milestones`);
  return { ok: true, milestoneId: milestone.id };
}

export async function updateMilestone(milestoneId: string, input: MilestoneInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = milestoneSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the milestone details." };

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone) return { ok: false, error: "Milestone not found." };

  const access = await resolveProjectAccess(userId, milestone.projectId);
  if (!access) return { ok: false, error: "Project not found." };
  if (!PRIVILEGED_ROLES.has(access.membership.role)) return { ok: false, error: "Only owners and admins can manage milestones." };

  const wasCompleted = milestone.status === "COMPLETED";
  const nowCompleted = parsed.data.status === "COMPLETED";

  await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      name: parsed.data.name,
      description: parsed.data.description || null,
      dueDate: parsed.data.dueDate ?? null,
      status: parsed.data.status,
      visibleToClient: parsed.data.visibleToClient,
      completedAt: nowCompleted && !wasCompleted ? new Date() : nowCompleted ? milestone.completedAt : null,
    },
  });

  if (nowCompleted && !wasCompleted) {
    await notifyOrganizationOwners({
      organizationId: access.membership.organizationId,
      type: "MILESTONE_COMPLETED",
      title: "Milestone completed",
      message: `"${parsed.data.name}" was marked complete on "${access.project.name}".`,
    });
    await logActivity({
      organizationId: access.membership.organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} completed milestone "${parsed.data.name}".`,
      actorUserId: userId,
      metadata: { milestoneId, projectId: milestone.projectId },
    });
  }

  await logAudit({ userId, organizationId: access.membership.organizationId, action: "projects.milestone_updated", metadata: { milestoneId } });
  revalidatePath(`/dashboard/projects/${milestone.projectId}/milestones`);
  revalidatePath(`/dashboard/projects/${milestone.projectId}`);
  return { ok: true };
}

export async function deleteMilestone(milestoneId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
  if (!milestone) return { ok: false, error: "Milestone not found." };

  const access = await resolveProjectAccess(userId, milestone.projectId);
  if (!access) return { ok: false, error: "Project not found." };
  if (!PRIVILEGED_ROLES.has(access.membership.role)) return { ok: false, error: "Only owners and admins can manage milestones." };

  await prisma.milestone.delete({ where: { id: milestoneId } });
  await logAudit({ userId, organizationId: access.membership.organizationId, action: "projects.milestone_deleted", metadata: { milestoneId } });
  revalidatePath(`/dashboard/projects/${milestone.projectId}/milestones`);
  return { ok: true };
}
