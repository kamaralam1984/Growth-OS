"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { recomputeProjectMetrics } from "@/lib/projects/health";
import { createProjectTaskSchema, taskStatusSchema, type CreateProjectTaskInput, type TaskStatusInput } from "@/lib/validations/project";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

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

export interface CreateProjectTaskResult extends ActionResult {
  taskId?: string;
}

export async function createProjectTask(projectId: string, input: CreateProjectTaskInput): Promise<CreateProjectTaskResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createProjectTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the task details." };

  const resolved = await resolveProjectInOrg(userId, projectId);
  if (!resolved) return { ok: false, error: "Project not found." };
  const organizationId = resolved.membership.organizationId;

  try {
    const task = await prisma.task.create({
      data: {
        organizationId,
        projectId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        assignedToUserId: parsed.data.assignedToUserId || null,
        assignedByUserId: userId,
        priority: parsed.data.priority,
        status: parsed.data.status,
        type: parsed.data.type,
        milestoneId: parsed.data.milestoneId || null,
        sprintId: parsed.data.sprintId || null,
        startDate: parsed.data.startDate ?? null,
        dueDate: parsed.data.dueDate ?? null,
        estimatedHours: parsed.data.estimatedHours ?? null,
        labels: parsed.data.labels,
        visibleToClient: parsed.data.visibleToClient,
      },
    });

    await prisma.taskStatusChange.create({
      data: { taskId: task.id, organizationId, fromStatus: null, toStatus: task.status },
    });
    await recomputeProjectMetrics(projectId);

    if (parsed.data.assignedToUserId) {
      await notifyUser({
        userId: parsed.data.assignedToUserId,
        organizationId,
        type: "TASK_ASSIGNED",
        title: "New task assigned",
        message: `You were assigned "${task.title}".`,
      });
    }

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} created task "${task.title}".`,
      actorUserId: userId,
      metadata: { taskId: task.id, projectId },
    });
    await logAudit({ userId, organizationId, action: "projects.task_created", metadata: { taskId: task.id, projectId } });

    revalidatePath(`/dashboard/projects/${projectId}/board`);
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, taskId: task.id };
  } catch (error) {
    console.error("[projects/board] createProjectTask failed:", error);
    return { ok: false, error: "Something went wrong creating the task. Please try again." };
  }
}

export async function moveTaskStatus(taskId: string, status: TaskStatusInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsedStatus = taskStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Invalid status." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== membership.organizationId || !task.projectId) {
    return { ok: false, error: "Task not found." };
  }
  if (task.status === parsedStatus.data) return { ok: true };

  try {
    await prisma.task.update({ where: { id: taskId }, data: { status: parsedStatus.data } });
    await prisma.taskStatusChange.create({
      data: { taskId, organizationId: membership.organizationId, fromStatus: task.status, toStatus: parsedStatus.data },
    });
    await recomputeProjectMetrics(task.projectId);

    await logActivity({
      organizationId: membership.organizationId,
      type: "TASK_UPDATE",
      description: `${session.user?.name ?? "A team member"} moved "${task.title}" to ${parsedStatus.data.replace(/_/g, " ")}.`,
      actorUserId: userId,
      metadata: { taskId, projectId: task.projectId, fromStatus: task.status, toStatus: parsedStatus.data },
    });

    revalidatePath(`/dashboard/projects/${task.projectId}/board`);
    revalidatePath(`/dashboard/projects/${task.projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("[projects/board] moveTaskStatus failed:", error);
    return { ok: false, error: "Something went wrong moving that task. Please try again." };
  }
}

export async function updateProjectTask(taskId: string, input: CreateProjectTaskInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createProjectTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the task details." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== membership.organizationId || !task.projectId) {
    return { ok: false, error: "Task not found." };
  }

  try {
    const statusChanged = task.status !== parsed.data.status;
    await prisma.task.update({
      where: { id: taskId },
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        assignedToUserId: parsed.data.assignedToUserId || null,
        priority: parsed.data.priority,
        status: parsed.data.status,
        type: parsed.data.type,
        milestoneId: parsed.data.milestoneId || null,
        sprintId: parsed.data.sprintId || null,
        startDate: parsed.data.startDate ?? null,
        dueDate: parsed.data.dueDate ?? null,
        estimatedHours: parsed.data.estimatedHours ?? null,
        labels: parsed.data.labels,
        visibleToClient: parsed.data.visibleToClient,
      },
    });

    if (statusChanged) {
      await prisma.taskStatusChange.create({
        data: { taskId, organizationId: membership.organizationId, fromStatus: task.status, toStatus: parsed.data.status },
      });
    }
    await recomputeProjectMetrics(task.projectId);

    await logAudit({ userId, organizationId: membership.organizationId, action: "projects.task_updated", metadata: { taskId } });

    revalidatePath(`/dashboard/projects/${task.projectId}/board`);
    revalidatePath(`/dashboard/projects/${task.projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("[projects/board] updateProjectTask failed:", error);
    return { ok: false, error: "Something went wrong updating the task. Please try again." };
  }
}

export async function deleteProjectTask(taskId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== membership.organizationId || !task.projectId) {
    return { ok: false, error: "Task not found." };
  }

  const projectId = task.projectId;
  await prisma.task.delete({ where: { id: taskId } });
  await recomputeProjectMetrics(projectId);
  await logAudit({ userId, organizationId: membership.organizationId, action: "projects.task_deleted", metadata: { taskId, projectId } });

  revalidatePath(`/dashboard/projects/${projectId}/board`);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
