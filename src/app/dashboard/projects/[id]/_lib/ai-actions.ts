"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError } from "@/lib/ai/client";
import { runDailyProjectPlanning, generateProjectProgressReport, notifyOwnersOfNewRisks } from "@/lib/ai/project-manager-orchestrator";
import { detectProjectRisks } from "@/lib/projects/risk-detection";
import { recomputeProjectMetrics } from "@/lib/projects/health";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
  summary?: string;
  priorities?: string[];
  recommendations?: string[];
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

function checkProjectAiRateLimit(userId: string): boolean {
  return checkRateLimit(`project-ai:${userId}`, { limit: 20, windowMs: 5 * 60_000 }).allowed;
}

function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return { ok: false, errorKind: "not_connected", error: "AI Project Manager is unavailable until an LLM provider is connected." };
  }
  if (error instanceof AIBillingError) {
    return {
      ok: false,
      errorKind: "billing",
      error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing.",
    };
  }
  console.error("[projects] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong running the AI Project Manager. Please try again." };
}

async function requireProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
  if (!project) return { ok: false as const, error: "Project not found." };
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: project.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") return { ok: false as const, error: "You do not have access to this project." };
  if (!PRIVILEGED_ROLES.has(membership.role)) return { ok: false as const, error: "Only owners and admins can run the AI Project Manager." };
  return { ok: true as const, organizationId: project.organizationId };
}

/** Owner-triggered daily planning — real deterministic risk detection + one real Claude call. No cron exists in this app; this is always an explicit click. */
export async function runProjectDailyPlanning(projectId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireProjectAccess(projectId, userId);
  if (!access.ok) return access;

  if (!checkProjectAiRateLimit(userId)) {
    return { ok: false, errorKind: "generic", error: "Too many AI runs requested — wait a few minutes and try again." };
  }

  try {
    const findings = await detectProjectRisks(projectId);
    await notifyOwnersOfNewRisks(projectId, findings);
    const result = await runDailyProjectPlanning(projectId);

    await logAudit({ userId, organizationId: access.organizationId, action: "projects.daily_planning_run", metadata: { projectId } });
    revalidatePath(`/dashboard/projects/${projectId}`);
    return { ok: true, summary: result.summary, priorities: result.priorities, recommendations: result.recommendations };
  } catch (error) {
    return describeAIError(error);
  }
}

export async function runProjectProgressReport(projectId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireProjectAccess(projectId, userId);
  if (!access.ok) return access;

  if (!checkProjectAiRateLimit(userId)) {
    return { ok: false, errorKind: "generic", error: "Too many AI runs requested — wait a few minutes and try again." };
  }

  try {
    const summary = await generateProjectProgressReport(projectId);
    await logAudit({ userId, organizationId: access.organizationId, action: "projects.progress_report_generated", metadata: { projectId } });
    return { ok: true, summary };
  } catch (error) {
    return describeAIError(error);
  }
}

/** Deterministic-only refresh (no AI call) — recomputes progress/health and re-scans risks. Available to any active member, not gated to owners/admins, since it's not an AI spend. */
export async function refreshProjectMetrics(projectId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
  if (!project) return { ok: false, error: "Project not found." };
  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: project.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") return { ok: false, error: "You do not have access to this project." };

  await recomputeProjectMetrics(projectId);
  await detectProjectRisks(projectId);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}
