"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { logAudit } from "@/lib/audit";
import { scheduler } from "@/lib/scheduler/init";
import { bullmqProvider, getQueueStats, retryFailedJob, discardFailedJob, type QueueStats } from "@/lib/scheduler/providers/bullmq-provider";
import { updateJobCronExpressionSchema } from "@/lib/validations/scheduler";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

async function requirePrivileged(): Promise<ActionResult & { organizationId?: string; userId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!PRIVILEGED_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can manage background jobs." };
  return { ok: true, organizationId: membership.organizationId, userId };
}

export async function runJobNow(key: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok) return access;
  await scheduler.trigger(key);
  revalidatePath("/dashboard/settings/jobs");
  return { ok: true };
}

export async function pauseJob(key: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok) return access;
  await scheduler.pause(key);
  revalidatePath("/dashboard/settings/jobs");
  return { ok: true };
}

export async function resumeJob(key: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok) return access;
  await scheduler.resume(key);
  revalidatePath("/dashboard/settings/jobs");
  return { ok: true };
}

export async function updateJobCronExpressionAction(key: string, cronExpression: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok) return access;

  const parsed = updateJobCronExpressionSchema.safeParse({ key, cronExpression });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  try {
    await bullmqProvider.updateCronExpression(parsed.data.key, parsed.data.cronExpression);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not update the cron expression." };
  }

  await logAudit({
    userId: access.userId,
    organizationId: access.organizationId,
    action: "jobs.cron_expression_updated",
    metadata: { key: parsed.data.key, cronExpression: parsed.data.cronExpression },
  });
  revalidatePath("/dashboard/settings/jobs");
  return { ok: true };
}

export async function getQueueStatsAction(): Promise<ActionResult & { stats?: QueueStats }> {
  const access = await requirePrivileged();
  if (!access.ok) return access;
  const stats = await getQueueStats();
  return { ok: true, stats };
}

export async function retryFailedJobAction(jobId: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok) return access;
  await retryFailedJob(jobId);
  await logAudit({
    userId: access.userId,
    organizationId: access.organizationId,
    action: "jobs.dlq_job_retried",
    metadata: { jobId },
  });
  revalidatePath("/dashboard/settings/jobs");
  return { ok: true };
}

export async function discardFailedJobAction(jobId: string): Promise<ActionResult> {
  const access = await requirePrivileged();
  if (!access.ok) return access;
  await discardFailedJob(jobId);
  await logAudit({
    userId: access.userId,
    organizationId: access.organizationId,
    action: "jobs.dlq_job_discarded",
    metadata: { jobId },
  });
  revalidatePath("/dashboard/settings/jobs");
  return { ok: true };
}
