import { Queue, Worker } from "bullmq";

import { prisma } from "@/lib/prisma";
import { createRedisClient, type RedisLikeClient } from "@/lib/redis-client";
import { getNodeExecutor } from "./node-executors/registry";
import type { NodeExecutionContext } from "./node-executors/types";
import type { WorkflowStep } from "@/generated/prisma/client";

const QUEUE_NAME = "kvl-workflow-execution";

/**
 * The real DAG-walking execution engine. Every node's real business effect
 * happens inside a registered NodeExecutor (src/lib/workflows/node-executors/*)
 * — this file only sequences them: create a real WorkflowStepRun, call the
 * executor, record what genuinely happened, decide the next step.
 *
 * Runs asynchronously via a dedicated BullMQ queue (separate from the
 * Scheduler Service's cron queue — workflow runs are event-triggered, not
 * time-triggered) so a slow/failing step never blocks the request that
 * fired the trigger, and DELAY nodes suspend via a real delayed BullMQ job
 * rather than blocking a worker thread.
 */

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

const globalForWorkflowQueue = globalThis as unknown as {
  __workflowRedisConnection?: RedisLikeClient;
  __workflowWorkerConnection?: RedisLikeClient;
  __workflowQueue?: Queue;
  __workflowWorker?: Worker;
};

function getConnection(): RedisLikeClient {
  if (!globalForWorkflowQueue.__workflowRedisConnection) {
    globalForWorkflowQueue.__workflowRedisConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForWorkflowQueue.__workflowRedisConnection;
}

function getWorkerConnection(): RedisLikeClient {
  if (!globalForWorkflowQueue.__workflowWorkerConnection) {
    globalForWorkflowQueue.__workflowWorkerConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForWorkflowQueue.__workflowWorkerConnection;
}

function getQueue(): Queue {
  if (!globalForWorkflowQueue.__workflowQueue) {
    globalForWorkflowQueue.__workflowQueue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return globalForWorkflowQueue.__workflowQueue;
}

interface StepJobData {
  workflowRunId: string;
  stepId: string;
}

function ensureWorker(): void {
  if (globalForWorkflowQueue.__workflowWorker) return;
  globalForWorkflowQueue.__workflowWorker = new Worker<StepJobData>(
    QUEUE_NAME,
    (bullJob) => runStep(bullJob.data.workflowRunId, bullJob.data.stepId),
    { connection: getWorkerConnection(), concurrency: 5 },
  );
  globalForWorkflowQueue.__workflowWorker.on("failed", (bullJob, err) => {
    console.error(`[workflows:engine] step job failed (run ${bullJob?.data?.workflowRunId}, step ${bullJob?.data?.stepId}):`, err);
  });
}

/** Real entry point for any trigger — creates a genuine WorkflowRun row and enqueues execution from the trigger step's real next step. Only ever called for Workflow.status === "ACTIVE" (checked by callers, e.g. src/lib/workflows/triggers.ts). */
export async function startWorkflowRun(
  workflowId: string,
  organizationId: string,
  triggerPayload: Record<string, unknown>,
): Promise<string> {
  ensureWorker();

  const steps = await prisma.workflowStep.findMany({ where: { workflowId } });
  const triggerStep = steps.find((s) => s.nodeType === "TRIGGER");
  if (!triggerStep) throw new Error(`Workflow ${workflowId} has no TRIGGER step — cannot start a run.`);

  const run = await prisma.workflowRun.create({
    data: { workflowId, organizationId, status: "RUNNING", triggerPayload: triggerPayload as object, startedAt: new Date() },
  });
  await prisma.workflow.update({ where: { id: workflowId }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } });

  if (!triggerStep.nextStepId) {
    // A trigger with nothing wired after it is a real, valid (if pointless) workflow — finish immediately, honestly.
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date() } });
    return run.id;
  }

  const job = await getQueue().add(
    "step",
    { workflowRunId: run.id, stepId: triggerStep.nextStepId },
    { jobId: `run-${run.id}-step-${triggerStep.nextStepId}-${Date.now()}` },
  );
  await prisma.workflowRun.update({ where: { id: run.id }, data: { queueJobId: String(job.id) } });
  return run.id;
}

/** The Worker's processor — executes exactly one step, then either enqueues the next one, suspends for a DELAY, or finishes the run. */
async function runStep(workflowRunId: string, stepId: string): Promise<void> {
  const [run, step] = await Promise.all([
    prisma.workflowRun.findUnique({ where: { id: workflowRunId } }),
    prisma.workflowStep.findUnique({ where: { id: stepId } }),
  ]);
  if (!run) throw new Error(`WorkflowRun ${workflowRunId} not found.`);
  if (!step) throw new Error(`WorkflowStep ${stepId} not found.`);
  if (run.status === "CANCELLED") return; // honor a real cancellation, never resume a stopped run

  const priorRuns = await prisma.workflowStepRun.findMany({
    where: { workflowRunId },
    orderBy: { startedAt: "asc" },
  });
  const stepOutputs: Record<string, unknown> = {};
  for (const priorRun of priorRuns) {
    if (priorRun.output) stepOutputs[priorRun.workflowStepId] = priorRun.output;
  }

  const executor = getNodeExecutor(step.nodeType);
  if (!executor) {
    await failRun(workflowRunId, stepId, `No executor registered for node type "${step.nodeType}".`);
    return;
  }

  const context: NodeExecutionContext = {
    organizationId: run.organizationId,
    workflowRunId,
    workflowStepId: stepId,
    triggerPayload: (run.triggerPayload as Record<string, unknown>) ?? {},
    stepOutputs,
  };

  const stepRun = await prisma.workflowStepRun.create({
    data: { workflowRunId, workflowStepId: stepId, status: "RUNNING", input: (step.config as object) ?? {}, startedAt: new Date() },
  });

  let result;
  try {
    result = await executor((step.config as Record<string, unknown>) ?? {}, context);
  } catch (error) {
    await prisma.workflowStepRun.update({
      where: { id: stepRun.id },
      data: { status: "FAILED", finishedAt: new Date(), error: error instanceof Error ? error.message : String(error) },
    });
    await failRun(workflowRunId, stepId, error instanceof Error ? error.message : String(error));
    return;
  }

  await prisma.workflowStepRun.update({
    where: { id: stepRun.id },
    data: { status: "SUCCESS", finishedAt: new Date(), output: (result.output as object) ?? undefined },
  });

  if (result.resumeAt) {
    const nextStepId = step.nextStepId;
    if (!nextStepId) {
      await prisma.workflowRun.update({ where: { id: workflowRunId }, data: { status: "SUCCESS", finishedAt: new Date() } });
      return;
    }
    const delayMs = Math.max(0, result.resumeAt.getTime() - Date.now());
    await getQueue().add(
      "step",
      { workflowRunId, stepId: nextStepId },
      { jobId: `run-${workflowRunId}-step-${nextStepId}-${Date.now()}`, delay: delayMs },
    );
    return;
  }

  const nextStepId = step.nodeType === "CONDITION" ? (result.branch === "true" ? step.onTrueStepId : step.onFalseStepId) : step.nextStepId;

  if (!nextStepId) {
    await prisma.workflowRun.update({ where: { id: workflowRunId }, data: { status: "SUCCESS", finishedAt: new Date() } });
    return;
  }

  await getQueue().add(
    "step",
    { workflowRunId, stepId: nextStepId },
    { jobId: `run-${workflowRunId}-step-${nextStepId}-${Date.now()}` },
  );
}

async function failRun(workflowRunId: string, stepId: string, error: string): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: workflowRunId },
    data: { status: "FAILED", finishedAt: new Date(), error: `Step ${stepId}: ${error}` },
  });
}

/** Real, immediate cancel — the run stops advancing (checked at the top of runStep); any already-enqueued step job that fires after this will honor the CANCELLED status and no-op. */
export async function cancelWorkflowRun(workflowRunId: string): Promise<void> {
  await prisma.workflowRun.update({ where: { id: workflowRunId }, data: { status: "CANCELLED", finishedAt: new Date() } });
}

export interface WorkflowQueueStats {
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
}

/**
 * Real job counts straight from this queue's own BullMQ/Redis instance
 * ("kvl-workflow-execution") — added for the Production Dashboard's Queue
 * Health section (src/lib/monitoring/health.ts's checkQueueHealth expects
 * this exact { active, waiting, failed } shape at minimum), mirroring
 * bullmq-provider.ts's getQueueStats and recurring-billing-queue.ts's
 * getRecurringBillingQueueStats for this app's other two BullMQ queues.
 */
export async function getWorkflowQueueStats(): Promise<WorkflowQueueStats> {
  const counts = await getQueue().getJobCounts("active", "waiting", "delayed", "completed", "failed");
  return {
    active: counts.active ?? 0,
    waiting: counts.waiting ?? 0,
    delayed: counts.delayed ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
  };
}

export type { WorkflowStep };
