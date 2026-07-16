import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { runProjectManagerTurn } from "@/lib/ai/agent-runtime";
import { getPersona } from "@/lib/ai/personas";
import { detectProjectRisks } from "@/lib/projects/risk-detection";
import { computeProjectSpend, recomputeProjectMetrics } from "@/lib/projects/health";

const OPEN_TASK_STATUSES = ["PENDING", "RUNNING", "BLOCKED", "BACKLOG", "REVIEW", "TESTING", "READY_FOR_CLIENT"] as const;

/**
 * Lazily upserts the org's single PROJECT_MANAGER AIAgentInstance — same
 * one-per-org-per-type pattern as every other agent (one Proposal agent
 * serves every proposal; one Project Manager agent serves every project,
 * scoped per call by the real project data passed into runProjectManagerTurn).
 * Called at project-creation time, not added to the onboarding wizard —
 * mirrors ensureReviewBoardAgentsProvisioned's fixed idempotency logic
 * exactly (safe under AIAgentInstance's @@unique([organizationId, type])
 * regardless of whether the org has completed onboarding or has a Workspace).
 */
export async function ensureProjectManagerAgentProvisioned(organizationId: string): Promise<void> {
  const existing = await prisma.aIAgentInstance.findUnique({
    where: { organizationId_type: { organizationId, type: "PROJECT_MANAGER" } },
  });
  if (existing) return;

  const persona = getPersona("PROJECT_MANAGER");
  await prisma.aIAgentInstance.upsert({
    where: { organizationId_type: { organizationId, type: "PROJECT_MANAGER" } },
    create: {
      organizationId,
      type: "PROJECT_MANAGER",
      name: persona.title,
      introMessage: `I'm your ${persona.title.replace(" Agent", "")} — ${persona.responsibilities.slice(0, 3).join(", ").toLowerCase()}.`,
    },
    update: {},
  });
}

/** Builds the real project-context text block every AI PM call is grounded in — real tasks, deadlines, budget, team, and already-detected risks, never a fabricated summary. Exported for reuse by the AI Delivery Board (Phase 5), which appends its own QA/DevOps-specific block rather than re-deriving this base data. */
export async function buildProjectContext(projectId: string): Promise<{ context: string; organizationId: string; projectName: string } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      members: { include: { user: { select: { id: true, name: true } } } },
      risks: { where: { status: "OPEN" }, orderBy: { severity: "desc" } },
      milestones: { orderBy: { order: "asc" } },
    },
  });
  if (!project) return null;

  const [openTasks, overdueTasks, unassignedTasks, spend] = await Promise.all([
    prisma.task.findMany({
      where: { projectId, status: { in: Array.from(OPEN_TASK_STATUSES) as never[] } },
      select: { id: true, title: true, status: true, priority: true, dueDate: true, assignedToUserId: true, estimatedHours: true },
      orderBy: { dueDate: "asc" },
      take: 40,
    }),
    prisma.task.count({ where: { projectId, status: { in: Array.from(OPEN_TASK_STATUSES) as never[] }, dueDate: { lt: new Date() } } }),
    prisma.task.count({ where: { projectId, status: { in: Array.from(OPEN_TASK_STATUSES) as never[] }, assignedToUserId: null } }),
    computeProjectSpend(projectId),
  ]);

  const lines: string[] = [
    `Project: ${project.name} (status: ${project.status}, health: ${project.healthStatus}, progress: ${project.progress}%)`,
    project.dueDate ? `Due date: ${project.dueDate.toISOString().slice(0, 10)}` : "Due date: not set",
    project.budget != null ? `Budget: ${project.budget}, real logged spend so far: ${Math.round(spend)}` : "Budget: not set",
    `Open tasks: ${openTasks.length} (${overdueTasks} overdue, ${unassignedTasks} unassigned)`,
    "",
    "Team:",
    ...project.members.map((m) => `- ${m.user.name ?? "Unnamed"} (${m.role}${m.capacityHoursPerWeek ? `, ${m.capacityHoursPerWeek}h/week capacity` : ""})`),
    "",
    "Open tasks (id: title, status, priority, due date, assignee, estimated hours):",
    ...openTasks.map(
      (t) =>
        `- ${t.id}: ${t.title} | ${t.status} | ${t.priority} | due ${t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "unset"} | assignee ${t.assignedToUserId ?? "unassigned"} | est ${t.estimatedHours ?? "unset"}h`,
    ),
    "",
    "Milestones:",
    ...project.milestones.map((m) => `- ${m.name}: ${m.status}${m.dueDate ? ` (due ${m.dueDate.toISOString().slice(0, 10)})` : ""}`),
    "",
    "Deterministically-detected open risks (real findings from real data — review and prioritize these, do not invent new ones):",
    ...(project.risks.length > 0
      ? project.risks.map((r) => `- [${r.severity}] ${r.category}: ${r.title} — ${r.description}`)
      : ["- None currently detected."]),
  ];

  return { context: lines.join("\n"), organizationId: project.organizationId, projectName: project.name };
}

export interface DailyPlanningResult {
  summary: string;
  priorities: string[];
  recommendations: string[];
}

/**
 * Owner-triggered (no cron/job-queue exists in this app) daily planning
 * round: real deterministic risk detection first (detectProjectRisks),
 * then one real Claude call reviewing/prioritizing/narrating those findings
 * plus the rest of the real project data. May suggest assignments for
 * unassigned tasks; does not silently apply them — see the action layer for
 * the explicit apply step.
 */
export async function runDailyProjectPlanning(projectId: string): Promise<DailyPlanningResult> {
  await detectProjectRisks(projectId);
  await recomputeProjectMetrics(projectId);

  const built = await buildProjectContext(projectId);
  if (!built) throw new Error("Project not found.");

  await ensureProjectManagerAgentProvisioned(built.organizationId);
  const agent = await prisma.aIAgentInstance.findUnique({
    where: { organizationId_type: { organizationId: built.organizationId, type: "PROJECT_MANAGER" } },
  });
  if (!agent) throw new Error("Project Manager agent could not be provisioned.");

  try {
    const turn = await runProjectManagerTurn({
      agentId: agent.id,
      agentName: agent.name,
      task: "Review today's priorities and risks for this project, and recommend next steps.",
      projectContext: built.context,
    });

    await prisma.aIAgentInstance.update({ where: { id: agent.id }, data: { completedTasksCount: { increment: 1 } } });
    await logActivity({
      organizationId: built.organizationId,
      type: "COMPLETED_WORK",
      description: `${agent.name} ran daily planning for "${built.projectName}".`,
      actorAgentId: agent.id,
      metadata: { projectId, prioritiesCount: turn.priorities.length, risksReviewed: turn.riskAssessments.length },
    });

    return { summary: turn.summary, priorities: turn.priorities, recommendations: turn.recommendations };
  } catch (error) {
    if (isAIBillingError(error)) {
      await logActivity({
        organizationId: built.organizationId,
        type: "SYSTEM_EVENT",
        description: `Daily planning failed: AI account has no usable credits ("${built.projectName}").`,
        actorAgentId: agent.id,
        metadata: { projectId },
      });
      throw new AIBillingError(error);
    }
    throw error;
  }
}

/** One real Claude call narrating real computed project metrics into a plain-English progress report. */
export async function generateProjectProgressReport(projectId: string): Promise<string> {
  const built = await buildProjectContext(projectId);
  if (!built) throw new Error("Project not found.");

  await ensureProjectManagerAgentProvisioned(built.organizationId);
  const agent = await prisma.aIAgentInstance.findUnique({
    where: { organizationId_type: { organizationId: built.organizationId, type: "PROJECT_MANAGER" } },
  });
  if (!agent) throw new Error("Project Manager agent could not be provisioned.");

  try {
    const turn = await runProjectManagerTurn({
      agentId: agent.id,
      agentName: agent.name,
      task: "Write a concise, honest progress report for this project suitable for the owner or the client, grounded only in the real data below.",
      projectContext: built.context,
    });

    await logActivity({
      organizationId: built.organizationId,
      type: "COMPLETED_WORK",
      description: `${agent.name} generated a progress report for "${built.projectName}".`,
      actorAgentId: agent.id,
      metadata: { projectId },
    });

    return turn.summary;
  } catch (error) {
    if (isAIBillingError(error)) {
      await logActivity({
        organizationId: built.organizationId,
        type: "SYSTEM_EVENT",
        description: `Progress report failed: AI account has no usable credits ("${built.projectName}").`,
        actorAgentId: agent.id,
        metadata: { projectId },
      });
      throw new AIBillingError(error);
    }
    throw error;
  }
}

/**
 * Notifies owners for any newly-CRITICAL/HIGH real risk finding — called
 * after detectProjectRisks by the action layer, not automatically (no
 * background scheduler exists in this app).
 */
export async function notifyOwnersOfNewRisks(projectId: string, findings: Array<{ severity: string; title: string }>): Promise<void> {
  const notable = findings.filter((f) => f.severity === "HIGH" || f.severity === "CRITICAL");
  if (notable.length === 0) return;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true, name: true } });
  if (!project) return;

  await notifyOrganizationOwners({
    organizationId: project.organizationId,
    type: "RISK_DETECTED",
    title: `Risk detected: ${project.name}`,
    message: notable.map((f) => f.title).join("; "),
  });
}
