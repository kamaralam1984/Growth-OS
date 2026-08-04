"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { notifyUser, notifyOrganizationOwners } from "@/lib/notifications";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { runAgentTurn, storeAgentMemory } from "@/lib/ai/agent-runtime";
import { EXECUTIVE_AGENT_TYPES, type ExecutiveAgentType } from "@/lib/ai/personas";
import { createTaskSchema, type CreateTaskInput } from "@/lib/validations/board";
import type { MembershipRole, TaskStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

// Judgment call, mirroring board/actions.ts: assigning work (creating a task)
// changes what the organization's humans and AI agents spend time on, so it
// is restricted to OWNER/ADMIN. Marking a task you personally own as
// done/cancelled, or running an agent task you assigned, is treated as a
// lighter-weight action available to any active member (checked per-action
// below).
const TASK_CREATOR_ROLES = new Set<MembershipRole>(["OWNER", "ADMIN"]);

function checkTaskAiRateLimit(userId: string): boolean {
  return checkRateLimit(`board-tasks-ai:${userId}`, { limit: 20, windowMs: 5 * 60_000 }).allowed;
}

function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return {
      ok: false,
      errorKind: "not_connected",
      error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment.",
    };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return {
      ok: false,
      errorKind: "billing",
      error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing.",
    };
  }
  console.error("[board/tasks] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong contacting the agent. Please try again." };
}

/**
 * Creates a Task assigned to exactly one agent or one human (schema-enforced
 * via createTaskSchema's refine). Restricted to OWNER/ADMIN, matching the
 * brief's default for task assignment.
 */
export async function createTask(input: CreateTaskInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createTaskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the task details." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!TASK_CREATOR_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can assign tasks." };
  }
  const organizationId = membership.organizationId;

  let assigneeAgentName: string | null = null;
  if (parsed.data.assignedToAgentId) {
    const agent = await prisma.aIAgentInstance.findFirst({
      where: { id: parsed.data.assignedToAgentId, organizationId },
      select: { name: true },
    });
    if (!agent) return { ok: false, error: "That agent could not be found." };
    assigneeAgentName = agent.name;
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

  if (parsed.data.companyId) {
    const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId } });
    if (!company || company.organizationId !== organizationId) {
      return { ok: false, error: "Company not found." };
    }
  }

  if (parsed.data.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: parsed.data.contactId } });
    if (!contact || contact.organizationId !== organizationId) {
      return { ok: false, error: "Contact not found." };
    }
  }

  try {
    const task = await prisma.task.create({
      data: {
        organizationId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        assignedByUserId: userId,
        assignedToAgentId: parsed.data.assignedToAgentId || null,
        assignedToUserId: assigneeUserId,
        dueDate: parsed.data.dueDate,
        projectId: parsed.data.projectId || null,
        meetingId: parsed.data.meetingId || null,
        companyId: parsed.data.companyId || null,
        contactId: parsed.data.contactId || null,
        priority: parsed.data.priority,
      },
    });

    await logActivity({
      organizationId,
      type: "TASK_UPDATE",
      description: `${session.user?.name ?? "A board member"} assigned "${task.title}" to ${
        assigneeAgentName ?? "a team member"
      }.`,
      actorUserId: userId,
      metadata: { taskId: task.id },
    });
    await logAudit({
      userId,
      organizationId,
      action: "board.task_created",
      metadata: { taskId: task.id, assignedToAgentId: parsed.data.assignedToAgentId ?? null, assignedToUserId: assigneeUserId },
    });

    if (assigneeUserId) {
      await notifyUser({
        userId: assigneeUserId,
        organizationId,
        type: "TASK_ASSIGNED",
        title: "New task assigned to you",
        message: task.title,
      });
    }
  } catch (error) {
    console.error("[board/tasks] createTask failed:", error);
    return { ok: false, errorKind: "generic", error: "Something went wrong creating the task. Please try again." };
  }

  revalidatePath("/board/tasks");
  if (parsed.data.projectId) revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  if (parsed.data.meetingId) revalidatePath(`/board/meetings/${parsed.data.meetingId}`);
  if (parsed.data.companyId) revalidatePath(`/dashboard/companies/${parsed.data.companyId}`);
  if (parsed.data.contactId) revalidatePath(`/dashboard/outreach/contacts/${parsed.data.contactId}`);
  return { ok: true };
}

/**
 * Lets a human directly set a task's status (e.g. marking their own
 * human-assigned task COMPLETED/CANCELLED, or an owner/admin unblocking one).
 * Never used for agent-assigned tasks reaching COMPLETED — that transition
 * only happens via a genuine runAgentTurn result in runAgentTask below.
 */
export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: task.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You do not have access to this task." };
  }
  const isPrivileged = membership.role === "OWNER" || membership.role === "ADMIN";
  const isAssignee = task.assignedToUserId === userId;
  if (!isPrivileged && !isAssignee) {
    return { ok: false, error: "Only the assignee, or an owner/admin, can update this task." };
  }

  try {
    await prisma.task.update({ where: { id: taskId }, data: { status } });

    await logActivity({
      organizationId: task.organizationId,
      type: "TASK_UPDATE",
      description: `${session.user?.name ?? "A team member"} marked "${task.title}" as ${status}.`,
      actorUserId: userId,
      metadata: { taskId },
    });
    await logAudit({
      userId,
      organizationId: task.organizationId,
      action: "board.task_status_updated",
      metadata: { taskId, status },
    });

    if (status === "COMPLETED") {
      if (task.assignedByUserId) {
        await notifyUser({
          userId: task.assignedByUserId,
          organizationId: task.organizationId,
          type: "TASK_COMPLETED",
          title: "Task completed",
          message: task.title,
        });
      }
      await evaluateAutomationRules(task.organizationId, "TASK_COMPLETED", { subject: task.title, taskId: task.id });
      await fireWorkflowTrigger(task.organizationId, "TASK_COMPLETED", { taskId: task.id, title: task.title, dealId: task.dealId, companyId: task.companyId });
    }
  } catch (error) {
    console.error("[board/tasks] updateTaskStatus failed:", error);
    return { ok: false, errorKind: "generic", error: "Something went wrong updating the task. Please try again." };
  }

  revalidatePath("/board/tasks");
  return { ok: true };
}

/**
 * Runs a real Claude call asking the assigned executive agent to actually do
 * the task, storing the genuine model output as Task.result. Never fakes
 * this — a failure (no key / no credits / rate-limited) leaves the task
 * PENDING and reports the exact error back, exactly like the meeting round
 * and chat-reply flows.
 */
export async function runAgentTask(taskId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignedToAgent: true },
  });
  if (!task) return { ok: false, error: "Task not found." };
  if (!task.assignedToAgent) {
    return { ok: false, error: "This task isn't assigned to an AI agent." };
  }
  if (task.status === "COMPLETED" || task.status === "CANCELLED") {
    return { ok: false, error: "This task is already finished." };
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: task.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You do not have access to this task." };
  }
  if (!TASK_CREATOR_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can run an agent's task." };
  }

  const agentType = task.assignedToAgent.type;
  if (!(EXECUTIVE_AGENT_TYPES as readonly string[]).includes(agentType)) {
    return { ok: false, error: `${task.assignedToAgent.name} isn't an executive agent capable of running tasks.` };
  }

  if (!checkTaskAiRateLimit(userId)) {
    return { ok: false, errorKind: "generic", error: "Too many AI tasks requested — wait a few minutes and try again." };
  }

  try {
    await prisma.task.update({ where: { id: taskId }, data: { status: "RUNNING" } });

    const turn = await runAgentTurn({
      agentId: task.assignedToAgent.id,
      agentType: agentType as ExecutiveAgentType,
      agentName: task.assignedToAgent.name,
      task: `You have been assigned this task: "${task.title}".${
        task.description ? ` Details: ${task.description}` : ""
      } Complete it now and produce the actual deliverable (the draft, analysis, or plan itself) — not a description of what you would do.`,
      effort: "high",
      organizationId: task.organizationId,
      contextQuery: task.title,
    });

    await prisma.$transaction([
      prisma.task.update({
        where: { id: taskId },
        data: { status: "COMPLETED", result: turn.content },
      }),
      prisma.aIAgentInstance.update({
        where: { id: task.assignedToAgent.id },
        data: { completedTasksCount: { increment: 1 } },
      }),
    ]);

    await logActivity({
      organizationId: task.organizationId,
      type: "COMPLETED_WORK",
      description: `${task.assignedToAgent.name} completed "${task.title}".`,
      actorAgentId: task.assignedToAgent.id,
      metadata: { taskId },
    });
    await logAudit({
      userId,
      organizationId: task.organizationId,
      action: "board.agent_task_run",
      metadata: { taskId, agentId: task.assignedToAgent.id },
    });

    await notifyOrganizationOwners({
      organizationId: task.organizationId,
      type: "TASK_COMPLETED",
      title: `Task completed by ${task.assignedToAgent.name}`,
      message: task.title,
    });
    await evaluateAutomationRules(task.organizationId, "TASK_COMPLETED", { subject: task.title, taskId: task.id });
    await fireWorkflowTrigger(task.organizationId, "TASK_COMPLETED", { taskId: task.id, title: task.title, dealId: task.dealId, companyId: task.companyId });

    // Real memory write for the exact agent that did the work — unlike the
    // human-completed TASK_COMPLETED path in updateTaskStatus above, this one
    // has a single, unambiguous agent to attribute it to (task.assignedToAgent
    // is the same agent that just produced turn.content). Fire-and-forget,
    // same discipline as fireWorkflowTrigger above: a memory-store failure
    // must never break the task the agent just completed.
    try {
      await storeAgentMemory(
        task.assignedToAgent.id,
        task.organizationId,
        "TASK",
        `Completed task "${task.title}".${task.description ? ` Details: ${task.description}` : ""}`,
        "TASK",
        task.id,
      );
    } catch (memoryError) {
      console.error("[board/tasks] storeAgentMemory for TASK_COMPLETED failed:", memoryError);
    }
  } catch (error) {
    await prisma.task.update({ where: { id: taskId }, data: { status: "PENDING" } }).catch(() => {});
    revalidatePath("/board/tasks");
    return describeAIError(error);
  }

  revalidatePath("/board/tasks");
  return { ok: true };
}

/**
 * Lets the assignee (or an owner/admin) set a real 0-100 progress value —
 * powers the War Room Task Board's progress bar. Same access rule as
 * updateTaskStatus: stored, owner-editable, never auto-derived from
 * something that doesn't exist (no sub-task/checklist model).
 */
export async function updateTaskProgress(taskId: string, progress: number): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const clamped = Math.max(0, Math.min(100, Math.round(progress)));

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return { ok: false, error: "Task not found." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: task.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You do not have access to this task." };
  }
  const isPrivileged = membership.role === "OWNER" || membership.role === "ADMIN";
  const isAssignee = task.assignedToUserId === userId;
  if (!isPrivileged && !isAssignee) {
    return { ok: false, error: "Only the assignee, or an owner/admin, can update this task." };
  }

  try {
    await prisma.task.update({ where: { id: taskId }, data: { progress: clamped } });
  } catch (error) {
    console.error("[board/tasks] updateTaskProgress failed:", error);
    return { ok: false, error: "Something went wrong updating progress. Please try again." };
  }

  revalidatePath("/board/tasks");
  if (task.meetingId) revalidatePath(`/board/meetings/${task.meetingId}`);
  return { ok: true };
}
