"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { sprintSchema, type SprintInput } from "@/lib/validations/sprint";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

async function resolveProjectInOrg(userId: string, projectId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.organizationId !== membership.organizationId) return null;
  return { membership, project };
}

export interface CreateSprintResult extends ActionResult {
  sprintId?: string;
}

export async function createSprint(projectId: string, input: SprintInput): Promise<CreateSprintResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = sprintSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the sprint details." };

  const resolved = await resolveProjectInOrg(userId, projectId);
  if (!resolved) return { ok: false, error: "Project not found." };
  if (!PRIVILEGED_ROLES.has(resolved.membership.role)) return { ok: false, error: "Only owners and admins can manage sprints." };

  const sprint = await prisma.sprint.create({
    data: {
      projectId,
      organizationId: resolved.membership.organizationId,
      name: parsed.data.name,
      goal: parsed.data.goal || null,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      capacityHours: parsed.data.capacityHours ?? null,
    },
  });

  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "projects.sprint_created", metadata: { sprintId: sprint.id, projectId } });
  revalidatePath(`/dashboard/projects/${projectId}/sprints`);
  return { ok: true, sprintId: sprint.id };
}

export async function startSprint(sprintId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint) return { ok: false, error: "Sprint not found." };
  const resolved = await resolveProjectInOrg(userId, sprint.projectId);
  if (!resolved) return { ok: false, error: "Project not found." };
  if (!PRIVILEGED_ROLES.has(resolved.membership.role)) return { ok: false, error: "Only owners and admins can manage sprints." };

  await prisma.sprint.update({ where: { id: sprintId }, data: { status: "ACTIVE" } });
  await logActivity({
    organizationId: resolved.membership.organizationId,
    type: "SYSTEM_EVENT",
    description: `${session.user?.name ?? "A team member"} started sprint "${sprint.name}".`,
    actorUserId: userId,
    metadata: { sprintId, projectId: sprint.projectId },
  });

  revalidatePath(`/dashboard/projects/${sprint.projectId}/sprints`);
  return { ok: true };
}

export async function completeSprint(sprintId: string, retrospectiveNotes?: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint) return { ok: false, error: "Sprint not found." };
  const resolved = await resolveProjectInOrg(userId, sprint.projectId);
  if (!resolved) return { ok: false, error: "Project not found." };
  if (!PRIVILEGED_ROLES.has(resolved.membership.role)) return { ok: false, error: "Only owners and admins can manage sprints." };

  await prisma.sprint.update({
    where: { id: sprintId },
    data: { status: "COMPLETED", retrospectiveNotes: retrospectiveNotes?.trim() || null },
  });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "projects.sprint_completed", metadata: { sprintId, projectId: sprint.projectId } });

  revalidatePath(`/dashboard/projects/${sprint.projectId}/sprints`);
  return { ok: true };
}

export async function deleteSprint(sprintId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint) return { ok: false, error: "Sprint not found." };
  const resolved = await resolveProjectInOrg(userId, sprint.projectId);
  if (!resolved) return { ok: false, error: "Project not found." };
  if (!PRIVILEGED_ROLES.has(resolved.membership.role)) return { ok: false, error: "Only owners and admins can manage sprints." };

  await prisma.task.updateMany({ where: { sprintId }, data: { sprintId: null } });
  await prisma.sprint.delete({ where: { id: sprintId } });
  revalidatePath(`/dashboard/projects/${sprint.projectId}/sprints`);
  return { ok: true };
}

export async function assignTaskToSprint(taskId: string, sprintId: string | null): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== membership.organizationId || !task.projectId) return { ok: false, error: "Task not found." };

  if (sprintId) {
    const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!sprint || sprint.projectId !== task.projectId) return { ok: false, error: "Sprint not found on this project." };
  }

  await prisma.task.update({ where: { id: taskId }, data: { sprintId } });
  revalidatePath(`/dashboard/projects/${task.projectId}/sprints`);
  return { ok: true };
}
