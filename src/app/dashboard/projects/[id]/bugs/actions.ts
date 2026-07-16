"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { recomputeProjectMetrics } from "@/lib/projects/health";
import { createBugReportSchema, type CreateBugReportInput } from "@/lib/validations/bug-reports";
import type { BugStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveProjectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true, name: true } });
  if (!project) return null;
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: project.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") return null;
  return { membership, project };
}

export interface CreateBugReportResult extends ActionResult {
  bugReportId?: string;
}

/** Reports a real BugReport against a project — the QA-specific fields (severity, repro steps, environment) a bare Task.type === "BUG" row never had. Notifies org owners for HIGH/CRITICAL severity, same convention as notifyOwnersOfNewRisks. */
export async function createBugReport(projectId: string, input: CreateBugReportInput): Promise<CreateBugReportResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createBugReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the bug report details." };

  const access = await resolveProjectAccess(userId, projectId);
  if (!access) return { ok: false, error: "Project not found." };
  const organizationId = access.membership.organizationId;

  const bugReport = await prisma.bugReport.create({
    data: {
      organizationId,
      projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      severity: parsed.data.severity,
      reproSteps: parsed.data.reproSteps || null,
      environment: parsed.data.environment || null,
      reportedByUserId: userId,
    },
  });

  await logActivity({
    organizationId,
    type: "SYSTEM_EVENT",
    description: `${session.user?.name ?? "A team member"} reported a ${parsed.data.severity.toLowerCase()} bug: "${bugReport.title}" in "${access.project.name}".`,
    actorUserId: userId,
    metadata: { bugReportId: bugReport.id, projectId, severity: parsed.data.severity },
  });
  await logAudit({
    userId,
    organizationId,
    action: "projects.bug_reported",
    metadata: { bugReportId: bugReport.id, projectId, severity: parsed.data.severity },
  });

  if (parsed.data.severity === "HIGH" || parsed.data.severity === "CRITICAL") {
    await notifyOrganizationOwners({
      organizationId,
      type: "RISK_DETECTED",
      title: `${parsed.data.severity === "CRITICAL" ? "Critical" : "High-severity"} bug reported: ${bugReport.title}`,
      message: `${access.project.name}: ${bugReport.description}`.slice(0, 500),
    });
  }

  revalidatePath(`/dashboard/projects/${projectId}/bugs`);
  return { ok: true, bugReportId: bugReport.id };
}

/** Ownership-checked status transition — any active member of the bug's organization can update it (matches the risk register's updateRiskStatus access level; bug triage isn't restricted to owners/admins). */
export async function updateBugStatus(id: string, status: BugStatus): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const bugReport = await prisma.bugReport.findUnique({ where: { id } });
  if (!bugReport) return { ok: false, error: "Bug report not found." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: bugReport.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") return { ok: false, error: "You do not have access to this bug report." };

  await prisma.bugReport.update({ where: { id }, data: { status } });

  await logActivity({
    organizationId: bugReport.organizationId,
    type: "TASK_UPDATE",
    description: `${session.user?.name ?? "A team member"} marked bug "${bugReport.title}" as ${status.replace(/_/g, " ")}.`,
    actorUserId: userId,
    metadata: { bugReportId: id, status },
  });
  await logAudit({ userId, organizationId: bugReport.organizationId, action: "projects.bug_status_updated", metadata: { bugReportId: id, status } });

  revalidatePath(`/dashboard/projects/${bugReport.projectId}/bugs`);
  return { ok: true };
}

export interface PromoteBugToTaskResult extends ActionResult {
  taskId?: string;
}

/** Promotes a BugReport to a real Task (type BUG), setting BugReport.taskId so it's a genuine one-to-one link, not a duplicate row — same "promote to Task, set the link field, reuse Task infrastructure" pattern used across this app (e.g. Raise Tickets uses Task.clientRaised instead of a parallel Ticket model). */
export async function promoteBugToTask(id: string): Promise<PromoteBugToTaskResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const bugReport = await prisma.bugReport.findUnique({ where: { id } });
  if (!bugReport) return { ok: false, error: "Bug report not found." };
  if (bugReport.taskId) return { ok: false, error: "This bug has already been promoted to a task." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: bugReport.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") return { ok: false, error: "You do not have access to this bug report." };

  const priority = bugReport.severity === "CRITICAL" || bugReport.severity === "HIGH" ? "URGENT" : "NORMAL";
  const description = [
    bugReport.description,
    bugReport.reproSteps ? `Repro steps: ${bugReport.reproSteps}` : null,
    bugReport.environment ? `Environment: ${bugReport.environment}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const task = await prisma.task.create({
    data: {
      organizationId: bugReport.organizationId,
      projectId: bugReport.projectId,
      title: bugReport.title,
      description,
      type: "BUG",
      status: "BACKLOG",
      priority,
      assignedByUserId: userId,
      labels: ["bug", bugReport.severity.toLowerCase()],
    },
  });

  await prisma.bugReport.update({
    where: { id },
    data: { taskId: task.id, status: bugReport.status === "OPEN" ? "IN_PROGRESS" : bugReport.status },
  });
  await prisma.taskStatusChange.create({
    data: { taskId: task.id, organizationId: bugReport.organizationId, fromStatus: null, toStatus: task.status },
  });
  await recomputeProjectMetrics(bugReport.projectId);

  await logActivity({
    organizationId: bugReport.organizationId,
    type: "SYSTEM_EVENT",
    description: `${session.user?.name ?? "A team member"} promoted bug "${bugReport.title}" to a task.`,
    actorUserId: userId,
    metadata: { bugReportId: id, taskId: task.id },
  });
  await logAudit({ userId, organizationId: bugReport.organizationId, action: "projects.bug_promoted_to_task", metadata: { bugReportId: id, taskId: task.id } });

  revalidatePath(`/dashboard/projects/${bugReport.projectId}/bugs`);
  revalidatePath(`/dashboard/projects/${bugReport.projectId}/board`);
  return { ok: true, taskId: task.id };
}
