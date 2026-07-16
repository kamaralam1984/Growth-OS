"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { recomputeProjectMetrics } from "@/lib/projects/health";
import { startTimerSchema, manualTimeEntrySchema, type StartTimerInput, type ManualTimeEntryInput } from "@/lib/validations/time-entry";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveProjectInOrg(userId: string, projectId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.organizationId !== membership.organizationId) return null;
  return { membership, project };
}

/** Recomputes Task.actualHours from real TimeEntry rows — cached, never hand-typed. */
async function recomputeTaskActualHours(taskId: string): Promise<void> {
  const entries = await prisma.timeEntry.findMany({ where: { taskId }, select: { durationMinutes: true } });
  const totalHours = entries.reduce((sum, e) => sum + (e.durationMinutes ?? 0) / 60, 0);
  await prisma.task.update({ where: { id: taskId }, data: { actualHours: totalHours } });
}

export interface StartTimerResult extends ActionResult {
  entryId?: string;
}

/** Starts a running timer (endedAt: null) — blocks a second concurrent timer for the same user, across all projects, so "how much time did I spend today" always adds up. */
export async function startTimer(projectId: string, input: StartTimerInput): Promise<StartTimerResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = startTimerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid timer input." };

  const resolved = await resolveProjectInOrg(userId, projectId);
  if (!resolved) return { ok: false, error: "Project not found." };

  const running = await prisma.timeEntry.findFirst({ where: { userId, endedAt: null } });
  if (running) return { ok: false, error: "You already have a running timer. Stop it before starting another." };

  if (parsed.data.taskId) {
    const task = await prisma.task.findUnique({ where: { id: parsed.data.taskId } });
    if (!task || task.projectId !== projectId) return { ok: false, error: "Task not found on this project." };
  }

  const entry = await prisma.timeEntry.create({
    data: {
      organizationId: resolved.membership.organizationId,
      projectId,
      taskId: parsed.data.taskId || null,
      userId,
      startedAt: new Date(),
      billable: parsed.data.billable,
      source: "TIMER",
      note: parsed.data.note || null,
    },
  });

  revalidatePath(`/dashboard/projects/${projectId}/time`);
  return { ok: true, entryId: entry.id };
}

export async function stopTimer(entryId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.userId !== userId) return { ok: false, error: "Timer not found." };
  if (entry.endedAt) return { ok: true };

  const endedAt = new Date();
  const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - entry.startedAt.getTime()) / 60_000));

  await prisma.timeEntry.update({ where: { id: entryId }, data: { endedAt, durationMinutes } });
  if (entry.taskId) await recomputeTaskActualHours(entry.taskId);
  await recomputeProjectMetrics(entry.projectId);

  await logAudit({ userId, organizationId: entry.organizationId, action: "projects.timer_stopped", metadata: { entryId, projectId: entry.projectId, durationMinutes } });

  revalidatePath(`/dashboard/projects/${entry.projectId}/time`);
  revalidatePath(`/dashboard/projects/${entry.projectId}`);
  return { ok: true };
}

export async function createManualTimeEntry(projectId: string, input: ManualTimeEntryInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = manualTimeEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the entry details." };

  const resolved = await resolveProjectInOrg(userId, projectId);
  if (!resolved) return { ok: false, error: "Project not found." };

  if (parsed.data.taskId) {
    const task = await prisma.task.findUnique({ where: { id: parsed.data.taskId } });
    if (!task || task.projectId !== projectId) return { ok: false, error: "Task not found on this project." };
  }

  const durationMinutes = Math.max(1, Math.round((parsed.data.endedAt.getTime() - parsed.data.startedAt.getTime()) / 60_000));

  const entry = await prisma.timeEntry.create({
    data: {
      organizationId: resolved.membership.organizationId,
      projectId,
      taskId: parsed.data.taskId || null,
      userId,
      startedAt: parsed.data.startedAt,
      endedAt: parsed.data.endedAt,
      durationMinutes,
      billable: parsed.data.billable,
      source: "MANUAL",
      note: parsed.data.note || null,
    },
  });

  if (entry.taskId) await recomputeTaskActualHours(entry.taskId);
  await recomputeProjectMetrics(projectId);

  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "projects.time_entry_logged", metadata: { entryId: entry.id, projectId } });

  revalidatePath(`/dashboard/projects/${projectId}/time`);
  revalidatePath(`/dashboard/projects/${projectId}`);
  return { ok: true };
}

export interface SplitTimeEntryForIdleResult extends ActionResult {
  idleEntryId?: string;
}

/**
 * Called by <IdleTracker> the moment it decides the user went idle while a
 * timer was running. Closes the running entry at `lastActiveAt` (the real
 * moment activity stopped, not "now" — by the time this action runs, the
 * idle threshold has already elapsed) and opens a new IDLE-sourced entry
 * from that same instant, left running (endedAt: null) so the gap is
 * visible and resolved explicitly via resolveIdleTimeEntry, never silently
 * billed.
 */
export async function splitTimeEntryForIdle(runningTimeEntryId: string, lastActiveAt: string): Promise<SplitTimeEntryForIdleResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const entry = await prisma.timeEntry.findUnique({ where: { id: runningTimeEntryId } });
  if (!entry || entry.userId !== userId) return { ok: false, error: "Timer not found." };
  if (entry.endedAt) return { ok: true };

  const existingIdleEntry = await prisma.timeEntry.findFirst({ where: { userId, source: "IDLE", endedAt: null } });
  if (existingIdleEntry) return { ok: true, idleEntryId: existingIdleEntry.id };

  const splitAt = new Date(lastActiveAt);
  const endedAt = splitAt > entry.startedAt ? splitAt : entry.startedAt;
  const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - entry.startedAt.getTime()) / 60_000));

  const idleEntry = await prisma.$transaction(async (tx) => {
    await tx.timeEntry.update({ where: { id: entry.id }, data: { endedAt, durationMinutes } });
    return tx.timeEntry.create({
      data: {
        organizationId: entry.organizationId,
        projectId: entry.projectId,
        taskId: entry.taskId,
        userId: entry.userId,
        startedAt: endedAt,
        billable: false,
        source: "IDLE",
        note: entry.note,
      },
    });
  });

  if (entry.taskId) await recomputeTaskActualHours(entry.taskId);
  await recomputeProjectMetrics(entry.projectId);

  await logAudit({ userId, organizationId: entry.organizationId, action: "projects.timer_idle_split", metadata: { entryId: entry.id, idleEntryId: idleEntry.id, projectId: entry.projectId } });

  revalidatePath(`/dashboard/projects/${entry.projectId}/time`);
  return { ok: true, idleEntryId: idleEntry.id };
}

export interface ResolveIdleTimeEntryResult extends ActionResult {
  resumedEntryId?: string;
}

/**
 * Resolves an open IDLE entry once activity resumes: "keep" closes it as
 * real (billable) tracked time; "discard" deletes it outright since it was
 * never worked. Either way a fresh AUTO-sourced entry is opened from the
 * resume moment — AUTO (not TIMER) because tracking resumed automatically,
 * the user didn't click Start again.
 */
export async function resolveIdleTimeEntry(idleTimeEntryId: string, action: "keep" | "discard"): Promise<ResolveIdleTimeEntryResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const entry = await prisma.timeEntry.findUnique({ where: { id: idleTimeEntryId } });
  if (!entry || entry.userId !== userId) return { ok: false, error: "Idle entry not found." };
  if (entry.source !== "IDLE" || entry.endedAt) return { ok: true };

  const resumedAt = new Date();

  const resumedEntry = await prisma.$transaction(async (tx) => {
    if (action === "keep") {
      const durationMinutes = Math.max(1, Math.round((resumedAt.getTime() - entry.startedAt.getTime()) / 60_000));
      await tx.timeEntry.update({ where: { id: entry.id }, data: { endedAt: resumedAt, durationMinutes, billable: true } });
    } else {
      await tx.timeEntry.delete({ where: { id: entry.id } });
    }
    return tx.timeEntry.create({
      data: {
        organizationId: entry.organizationId,
        projectId: entry.projectId,
        taskId: entry.taskId,
        userId: entry.userId,
        startedAt: resumedAt,
        billable: true,
        source: "AUTO",
        note: entry.note,
      },
    });
  });

  if (entry.taskId) await recomputeTaskActualHours(entry.taskId);
  await recomputeProjectMetrics(entry.projectId);

  await logAudit({ userId, organizationId: entry.organizationId, action: "projects.timer_idle_resolved", metadata: { idleEntryId: entry.id, resumedEntryId: resumedEntry.id, resolution: action, projectId: entry.projectId } });

  revalidatePath(`/dashboard/projects/${entry.projectId}/time`);
  return { ok: true, resumedEntryId: resumedEntry.id };
}

export async function deleteTimeEntry(entryId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.userId !== userId) return { ok: false, error: "Time entry not found." };

  await prisma.timeEntry.delete({ where: { id: entryId } });
  if (entry.taskId) await recomputeTaskActualHours(entry.taskId);
  await recomputeProjectMetrics(entry.projectId);

  revalidatePath(`/dashboard/projects/${entry.projectId}/time`);
  revalidatePath(`/dashboard/projects/${entry.projectId}`);
  return { ok: true };
}
