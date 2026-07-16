"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { notifyUser } from "@/lib/notifications";
import { createActionItemSchema, actionItemStatusSchema, type CreateActionItemInput } from "@/lib/validations/action-items";
import type { ActionItemStatus, MembershipRole } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Judgment call, mirroring board/tasks/actions.ts's TASK_CREATOR_ROLES:
// creating or promoting an action item decides what the organization's
// humans and AI agents spend time on, so it's restricted to OWNER/ADMIN.
// Marking your own assigned action item's status is a lighter-weight
// action available to the assignee too (checked per-action below).
const ACTION_ITEM_MANAGER_ROLES = new Set<MembershipRole>(["OWNER", "ADMIN"]);

/**
 * Creates a standalone ActionItem — the general-purpose counterpart to
 * convertMeetingActionItemToTracked (src/app/board/meetings/[id]/actions.ts),
 * which promotes one specific narrative sentence out of a meeting summary.
 * This one lets an owner/admin create a trackable action item directly,
 * optionally linked to a meeting/decision/project.
 */
export async function createActionItem(input: CreateActionItemInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createActionItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the action item details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!ACTION_ITEM_MANAGER_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can create action items." };
  }
  const organizationId = membership.organizationId;

  if (parsed.data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
    if (!project || project.organizationId !== organizationId) {
      return { ok: false, error: "Project not found." };
    }
  }
  if (parsed.data.meetingId) {
    const meeting = await prisma.meeting.findUnique({ where: { id: parsed.data.meetingId } });
    if (!meeting || meeting.organizationId !== organizationId) {
      return { ok: false, error: "Meeting not found." };
    }
  }
  if (parsed.data.decisionId) {
    const decision = await prisma.decision.findUnique({ where: { id: parsed.data.decisionId } });
    if (!decision || decision.organizationId !== organizationId) {
      return { ok: false, error: "Decision not found." };
    }
  }

  let assigneeUserId: string | null = null;
  if (parsed.data.assignedToUserId) {
    const assigneeMembership = await prisma.membership.findFirst({
      where: { userId: parsed.data.assignedToUserId, organizationId, status: "ACTIVE" },
      select: { userId: true },
    });
    if (!assigneeMembership) return { ok: false, error: "That team member could not be found." };
    assigneeUserId = assigneeMembership.userId;
  }

  let assigneeAgentId: string | null = null;
  if (parsed.data.assignedToAgentId) {
    const agent = await prisma.aIAgentInstance.findFirst({
      where: { id: parsed.data.assignedToAgentId, organizationId },
      select: { id: true },
    });
    if (!agent) return { ok: false, error: "That agent could not be found." };
    assigneeAgentId = agent.id;
  }

  try {
    const actionItem = await prisma.actionItem.create({
      data: {
        organizationId,
        projectId: parsed.data.projectId || null,
        meetingId: parsed.data.meetingId || null,
        decisionId: parsed.data.decisionId || null,
        title: parsed.data.title,
        description: parsed.data.description || null,
        assignedToUserId: assigneeUserId,
        assignedToAgentId: assigneeAgentId,
        dueDate: parsed.data.dueDate ?? null,
      },
    });

    await logActivity({
      organizationId,
      type: "TASK_UPDATE",
      description: `${session.user?.name ?? "A team member"} created action item "${actionItem.title}".`,
      actorUserId: userId,
      metadata: { actionItemId: actionItem.id },
    });
    await logAudit({
      userId,
      organizationId,
      action: "board.action_item_created",
      metadata: { actionItemId: actionItem.id },
    });

    if (assigneeUserId) {
      await notifyUser({
        userId: assigneeUserId,
        organizationId,
        type: "TASK_ASSIGNED",
        title: "New action item assigned to you",
        message: actionItem.title,
      });
    }
  } catch (error) {
    console.error("[board/action-items] createActionItem failed:", error);
    return { ok: false, error: "Something went wrong creating the action item. Please try again." };
  }

  revalidatePath("/board/action-items");
  if (parsed.data.projectId) revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  if (parsed.data.meetingId) revalidatePath(`/board/meetings/${parsed.data.meetingId}`);
  return { ok: true };
}

/**
 * Lets the assignee (or an owner/admin) set an action item's status — same
 * access rule as board/tasks/actions.ts's updateTaskStatus.
 */
export async function updateActionItemStatus(id: string, status: ActionItemStatus): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsedStatus = actionItemStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Invalid status." };

  const actionItem = await prisma.actionItem.findUnique({ where: { id } });
  if (!actionItem) return { ok: false, error: "Action item not found." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: actionItem.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You do not have access to this action item." };
  }
  const isPrivileged = ACTION_ITEM_MANAGER_ROLES.has(membership.role);
  const isAssignee = actionItem.assignedToUserId === userId;
  if (!isPrivileged && !isAssignee) {
    return { ok: false, error: "Only the assignee, or an owner/admin, can update this action item." };
  }

  try {
    await prisma.actionItem.update({ where: { id }, data: { status: parsedStatus.data } });

    await logActivity({
      organizationId: actionItem.organizationId,
      type: "TASK_UPDATE",
      description: `${session.user?.name ?? "A team member"} marked action item "${actionItem.title}" as ${parsedStatus.data}.`,
      actorUserId: userId,
      metadata: { actionItemId: id },
    });
    await logAudit({
      userId,
      organizationId: actionItem.organizationId,
      action: "board.action_item_status_updated",
      metadata: { actionItemId: id, status: parsedStatus.data },
    });
  } catch (error) {
    console.error("[board/action-items] updateActionItemStatus failed:", error);
    return { ok: false, error: "Something went wrong updating this action item. Please try again." };
  }

  revalidatePath("/board/action-items");
  if (actionItem.meetingId) revalidatePath(`/board/meetings/${actionItem.meetingId}`);
  if (actionItem.projectId) revalidatePath(`/dashboard/projects/${actionItem.projectId}`);
  return { ok: true };
}

/**
 * Promotes an ActionItem into a real, trackable Task (reusing the same
 * prisma.task.create shape every other Task-creation call site in this
 * codebase hand-writes — there is no shared helper to call into, checked
 * across board/tasks/actions.ts, dashboard/projects/[id]/board/_lib/
 * board-actions.ts, and dashboard/crm/_lib/task-actions.ts). Sets
 * ActionItem.taskId to link them and moves the ActionItem itself to
 * IN_PROGRESS, since it's now actively being worked via the new Task (which
 * starts at Task's own default status, PENDING).
 */
export async function promoteActionItemToTask(id: string): Promise<ActionResult & { taskId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const actionItem = await prisma.actionItem.findUnique({ where: { id } });
  if (!actionItem) return { ok: false, error: "Action item not found." };
  if (actionItem.taskId) return { ok: false, error: "This action item has already been promoted to a task." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: actionItem.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You do not have access to this action item." };
  }
  if (!ACTION_ITEM_MANAGER_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can promote an action item to a task." };
  }

  let taskId: string;
  try {
    const task = await prisma.$transaction(async (tx) => {
      const createdTask = await tx.task.create({
        data: {
          organizationId: actionItem.organizationId,
          projectId: actionItem.projectId,
          meetingId: actionItem.meetingId,
          title: actionItem.title,
          description: actionItem.description,
          assignedByUserId: userId,
          assignedToUserId: actionItem.assignedToUserId,
          assignedToAgentId: actionItem.assignedToAgentId,
          dueDate: actionItem.dueDate,
        },
      });
      await tx.actionItem.update({
        where: { id },
        data: { taskId: createdTask.id, status: "IN_PROGRESS" },
      });
      return createdTask;
    });
    taskId = task.id;

    await logActivity({
      organizationId: actionItem.organizationId,
      type: "TASK_UPDATE",
      description: `${session.user?.name ?? "A team member"} promoted action item "${actionItem.title}" to a task.`,
      actorUserId: userId,
      metadata: { actionItemId: id, taskId },
    });
    await logAudit({
      userId,
      organizationId: actionItem.organizationId,
      action: "board.action_item_promoted",
      metadata: { actionItemId: id, taskId },
    });

    if (actionItem.assignedToUserId) {
      await notifyUser({
        userId: actionItem.assignedToUserId,
        organizationId: actionItem.organizationId,
        type: "TASK_ASSIGNED",
        title: "Action item promoted to a task",
        message: actionItem.title,
      });
    }
  } catch (error) {
    console.error("[board/action-items] promoteActionItemToTask failed:", error);
    return { ok: false, error: "Something went wrong promoting this action item. Please try again." };
  }

  revalidatePath("/board/action-items");
  revalidatePath("/board/tasks");
  if (actionItem.projectId) revalidatePath(`/dashboard/projects/${actionItem.projectId}`);
  if (actionItem.meetingId) revalidatePath(`/board/meetings/${actionItem.meetingId}`);
  return { ok: true, taskId };
}
