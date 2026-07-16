"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyUser } from "@/lib/notifications";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateTaskSuggestions, type TaskEngineSuggestions } from "@/lib/ai/task-engine";
import { crmTaskSchema, checklistItemSchema, type CrmTaskInput } from "@/lib/validations/crm";
import type { TaskStatus } from "@/generated/prisma/client";

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

async function resolveTaskInOrg(userId: string, taskId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || task.organizationId !== membership.organizationId) return null;
  return { membership, task };
}

/**
 * Fires TASK_OVERDUE the moment a task that's already past its dueDate is
 * touched by a write — an immediate, real-time check for whoever's actively
 * editing the task. The real hourly `overdue-task-detection` Scheduler
 * Service job (src/lib/scheduler/registry.ts) now ALSO calls this same
 * function for every overdue task across every org, so detection no longer
 * depends on a page view/write ever happening — this on-write call is just
 * the low-latency path for the common case. `overdueNotifiedAt` is the
 * shared dedup guard between both triggers: once set, neither path re-fires
 * for the same task until it's cleared (dueDate/status change takes it out
 * of "overdue").
 */
export async function fireOverdueIfApplicable(organizationId: string, task: { id: string; title: string; dueDate: Date | null; status: TaskStatus; overdueNotifiedAt?: Date | null }) {
  if (!task.dueDate || task.dueDate >= new Date()) return;
  if (task.status === "COMPLETED" || task.status === "CANCELLED") return;
  if (task.overdueNotifiedAt) return;
  await evaluateAutomationRules(organizationId, "TASK_OVERDUE", { subject: task.title, taskId: task.id });
  await fireWorkflowTrigger(organizationId, "TASK_OVERDUE", { taskId: task.id, title: task.title, dueDate: task.dueDate });
  await prisma.task.update({ where: { id: task.id }, data: { overdueNotifiedAt: new Date() } }).catch(() => {});
}

export interface CreateCrmTaskResult extends ActionResult {
  taskId?: string;
}

export async function createCrmTask(input: CrmTaskInput): Promise<CreateCrmTaskResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = crmTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the task details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  let assignedToUserId = parsed.data.assignedToUserId || null;
  if (assignedToUserId) {
    const assigneeMembership = await prisma.membership.findFirst({ where: { userId: assignedToUserId, organizationId, status: "ACTIVE" } });
    if (!assigneeMembership) assignedToUserId = null;
  }

  try {
    const task = await prisma.task.create({
      data: {
        organizationId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        type: parsed.data.type,
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate ?? null,
        dealId: parsed.data.dealId || null,
        companyId: parsed.data.companyId || null,
        contactId: parsed.data.contactId || null,
        parentTaskId: parsed.data.parentTaskId || null,
        assignedByUserId: userId,
        assignedToUserId,
        labels: parsed.data.labels ?? [],
        isRecurring: parsed.data.isRecurring,
        recurrenceRule: parsed.data.isRecurring ? (parsed.data.recurrenceRule ?? null) : null,
        dependsOn: parsed.data.dependsOnTaskIds?.length
          ? { connect: parsed.data.dependsOnTaskIds.map((id) => ({ id })) }
          : undefined,
      },
    });

    if (assignedToUserId && assignedToUserId !== userId) {
      await notifyUser({
        userId: assignedToUserId,
        organizationId,
        type: "TASK_ASSIGNED",
        title: "New task assigned",
        message: `${session.user?.name ?? "A team member"} assigned you "${task.title}".`,
      });
    }

    await logActivity({
      organizationId,
      type: "TASK_UPDATE",
      description: `${session.user?.name ?? "A team member"} created task "${task.title}".`,
      actorUserId: userId,
      metadata: { taskId: task.id },
    });
    await logAudit({ userId, organizationId, action: "crm.task_created", metadata: { taskId: task.id } });

    revalidatePath("/dashboard/crm/tasks");
    revalidatePath("/dashboard/crm");
    return { ok: true, taskId: task.id };
  } catch (error) {
    console.error("[crm] createCrmTask failed:", error);
    return { ok: false, error: "Something went wrong creating the task. Please try again." };
  }
}

export async function updateCrmTask(taskId: string, input: CrmTaskInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = crmTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the task details." };
  }

  const resolved = await resolveTaskInOrg(userId, taskId);
  if (!resolved) return { ok: false, error: "Task not found." };
  const organizationId = resolved.membership.organizationId;

  let assignedToUserId = parsed.data.assignedToUserId || null;
  if (assignedToUserId) {
    const assigneeMembership = await prisma.membership.findFirst({ where: { userId: assignedToUserId, organizationId, status: "ACTIVE" } });
    if (!assigneeMembership) assignedToUserId = null;
  }

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        type: parsed.data.type,
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate ?? null,
        dealId: parsed.data.dealId || null,
        companyId: parsed.data.companyId || null,
        contactId: parsed.data.contactId || null,
        assignedToUserId,
        labels: parsed.data.labels ?? [],
        isRecurring: parsed.data.isRecurring,
        recurrenceRule: parsed.data.isRecurring ? (parsed.data.recurrenceRule ?? null) : null,
        dependsOn: { set: (parsed.data.dependsOnTaskIds ?? []).map((id) => ({ id })) },
        // A rescheduled due date re-enters the overdue-detection pool.
        overdueNotifiedAt: null,
      },
    });

    await fireOverdueIfApplicable(organizationId, task);
    await logAudit({ userId, organizationId, action: "crm.task_updated", metadata: { taskId } });

    revalidatePath("/dashboard/crm/tasks");
    revalidatePath("/dashboard/crm");
    return { ok: true };
  } catch (error) {
    console.error("[crm] updateCrmTask failed:", error);
    return { ok: false, error: "Something went wrong updating the task. Please try again." };
  }
}

/**
 * Updates status and, when the task is set to COMPLETED, both spawns the
 * next instance of a recurring task and fires the existing TASK_COMPLETED
 * automation trigger (already wired for board tasks in
 * src/app/board/tasks/actions.ts — reused here, not reinvented).
 */
export async function updateCrmTaskStatus(taskId: string, status: TaskStatus): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveTaskInOrg(userId, taskId);
  if (!resolved) return { ok: false, error: "Task not found." };
  const organizationId = resolved.membership.organizationId;

  try {
    const task = await prisma.task.update({ where: { id: taskId }, data: { status } });

    await logActivity({
      organizationId,
      type: "TASK_UPDATE",
      description: `${session.user?.name ?? "A team member"} marked "${task.title}" as ${status.toLowerCase()}.`,
      actorUserId: userId,
      metadata: { taskId },
    });

    if (status === "COMPLETED") {
      await evaluateAutomationRules(organizationId, "TASK_COMPLETED", { subject: task.title, taskId: task.id });
      await fireWorkflowTrigger(organizationId, "TASK_COMPLETED", { taskId: task.id, title: task.title, dealId: task.dealId, companyId: task.companyId });

      if (task.isRecurring && task.recurrenceRule) {
        const next = new Date(task.dueDate ?? new Date());
        if (task.recurrenceRule === "DAILY") next.setDate(next.getDate() + 1);
        else if (task.recurrenceRule === "WEEKLY") next.setDate(next.getDate() + 7);
        else if (task.recurrenceRule === "MONTHLY") next.setMonth(next.getMonth() + 1);
        else if (task.recurrenceRule === "YEARLY") next.setFullYear(next.getFullYear() + 1);

        await prisma.task.create({
          data: {
            organizationId,
            title: task.title,
            description: task.description,
            type: task.type,
            priority: task.priority,
            dueDate: next,
            dealId: task.dealId,
            companyId: task.companyId,
            contactId: task.contactId,
            assignedByUserId: task.assignedByUserId,
            assignedToUserId: task.assignedToUserId,
            labels: task.labels,
            isRecurring: true,
            recurrenceRule: task.recurrenceRule,
            recurrenceParentId: task.recurrenceParentId ?? task.id,
          },
        });
      }
    } else {
      await fireOverdueIfApplicable(organizationId, task);
    }

    revalidatePath("/dashboard/crm/tasks");
    revalidatePath("/dashboard/crm");
    return { ok: true };
  } catch (error) {
    console.error("[crm] updateCrmTaskStatus failed:", error);
    return { ok: false, error: "Something went wrong updating the task. Please try again." };
  }
}

export async function deleteCrmTask(taskId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveTaskInOrg(userId, taskId);
  if (!resolved) return { ok: false, error: "Task not found." };

  await prisma.task.delete({ where: { id: taskId } });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "crm.task_deleted", metadata: { taskId } });
  revalidatePath("/dashboard/crm/tasks");
  return { ok: true };
}

export interface AddChecklistItemResult extends ActionResult {
  itemId?: string;
}

export async function addChecklistItem(taskId: string, label: string): Promise<AddChecklistItemResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = checklistItemSchema.safeParse({ label });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Give the item a label." };

  const resolved = await resolveTaskInOrg(userId, taskId);
  if (!resolved) return { ok: false, error: "Task not found." };

  const count = await prisma.taskChecklistItem.count({ where: { taskId } });
  const item = await prisma.taskChecklistItem.create({
    data: { taskId, label: parsed.data.label, order: count },
  });

  revalidatePath("/dashboard/crm/tasks");
  return { ok: true, itemId: item.id };
}

export interface TaskSuggestionsResult extends ActionResult {
  errorKind?: "not_connected" | "billing" | "generic";
  suggestions?: TaskEngineSuggestions;
}

/** Real Claude call (rate-limited since it's billable) powering the Task Manager's "AI suggestions" panel. */
export async function refreshTaskSuggestions(): Promise<TaskSuggestionsResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const rate = checkRateLimit(`crm-task-engine:${userId}`, { limit: 10, windowMs: 5 * 60_000 });
  if (!rate.allowed) return { ok: false, errorKind: "generic", error: "Too many AI requests — please wait a few minutes and try again." };

  try {
    const suggestions = await generateTaskSuggestions(membership.organizationId);
    return { ok: true, suggestions };
  } catch (error) {
    if (error instanceof AINotConnectedError) {
      return { ok: false, errorKind: "not_connected", error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment." };
    }
    if (error instanceof AIBillingError || isAIBillingError(error)) {
      return { ok: false, errorKind: "billing", error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing." };
    }
    console.error("[crm] refreshTaskSuggestions failed:", error);
    return { ok: false, errorKind: "generic", error: "Something went wrong generating task suggestions. Please try again." };
  }
}

export async function toggleChecklistItem(itemId: string, done: boolean): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId }, include: { task: true } });
  if (!item) return { ok: false, error: "Checklist item not found." };
  const resolved = await resolveTaskInOrg(userId, item.taskId);
  if (!resolved) return { ok: false, error: "Task not found." };

  await prisma.taskChecklistItem.update({ where: { id: itemId }, data: { done } });
  revalidatePath("/dashboard/crm/tasks");
  return { ok: true };
}

export async function deleteChecklistItem(itemId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) return { ok: false, error: "Checklist item not found." };
  const resolved = await resolveTaskInOrg(userId, item.taskId);
  if (!resolved) return { ok: false, error: "Task not found." };

  await prisma.taskChecklistItem.delete({ where: { id: itemId } });
  revalidatePath("/dashboard/crm/tasks");
  return { ok: true };
}
