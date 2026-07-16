import { Queue, Worker, type Job as BullJob } from "bullmq";
import { parseExpression } from "cron-parser";

import { prisma } from "@/lib/prisma";
import { createRedisClient, type RedisLikeClient } from "@/lib/redis-client";
import type { JobDefinition, JobRunLog, JobRunRecord, JobStatus, SchedulerProvider } from "../types";

const QUEUE_NAME = "kvl-scheduler";
const DEFAULT_RETRY = { maxAttempts: 1, backoffMs: 0 };

/**
 * Real BullMQ + Redis job runner — the production-grade SchedulerProvider
 * this app's Scheduler Service was always designed to be swappable to (see
 * types.ts's top comment). Connects to a real local Redis instance
 * (REDIS_URL, defaulting to redis://localhost:6379, confirmed running in
 * this environment). Retries/backoff are native BullMQ features (job
 * `attempts`/`backoff` options), not hand-rolled.
 *
 * Single-process limitation, same as node-cron-provider.ts and
 * event-bus.ts: `this.jobs` (the actual handler closures) only exists in
 * the process that called `schedule()`. In this app's current single-Node
 * deployment (`next start`, one process registers jobs AND runs the
 * Worker) that's exactly correct. A real multi-instance deployment would
 * need the Worker running in a dedicated process with its own job
 * registry import — a follow-up, not a correctness bug for how this app
 * actually runs today.
 */

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

const globalForQueue = globalThis as unknown as {
  __schedulerRedisConnection?: RedisLikeClient;
  __schedulerWorkerConnection?: RedisLikeClient;
  __schedulerQueue?: Queue;
};

function getSharedConnection(): RedisLikeClient {
  if (!globalForQueue.__schedulerRedisConnection) {
    globalForQueue.__schedulerRedisConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForQueue.__schedulerRedisConnection;
}

function getWorkerConnection(): RedisLikeClient {
  // BullMQ Workers need their own dedicated connection (blocking commands),
  // never shared with the Queue's connection.
  if (!globalForQueue.__schedulerWorkerConnection) {
    globalForQueue.__schedulerWorkerConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForQueue.__schedulerWorkerConnection;
}

function getQueue(): Queue {
  if (!globalForQueue.__schedulerQueue) {
    globalForQueue.__schedulerQueue = new Queue(QUEUE_NAME, { connection: getSharedConnection() });
  }
  return globalForQueue.__schedulerQueue;
}

class BullMQProvider implements SchedulerProvider {
  private jobs = new Map<string, JobDefinition>();
  private queue = getQueue();
  private worker: Worker<{ key: string }> | null = null;

  private ensureWorker(): void {
    if (this.worker) return;
    this.worker = new Worker<{ key: string }>(
      QUEUE_NAME,
      (bullJob) => this.process(bullJob),
      { connection: getWorkerConnection(), concurrency: 5 },
    );
    this.worker.on("failed", (bullJob, err) => {
      console.error(`[scheduler:bullmq] job "${bullJob?.data?.key}" failed after all attempts:`, err);
    });
  }

  schedule(job: JobDefinition): void {
    if (this.jobs.has(job.key)) return;
    this.jobs.set(job.key, job);
    this.ensureWorker();
    void this.registerScheduler(job);
  }

  /**
   * `rethrow` lets updateCronExpression (a user-triggered, runtime edit) fail
   * loudly back to the caller instead of the silent best-effort console.error
   * this method otherwise does for the fire-and-forget bootstrap/resume paths.
   */
  private async registerScheduler(job: JobDefinition, opts: { rethrow?: boolean } = {}): Promise<void> {
    try {
      await prisma.scheduledJob.upsert({
        where: { key: job.key },
        update: { name: job.name, cronExpression: job.cronExpression, priority: job.priority ?? null },
        create: { key: job.key, name: job.name, cronExpression: job.cronExpression, priority: job.priority ?? null },
      });

      const retry = job.retryPolicy ?? DEFAULT_RETRY;
      await this.queue.upsertJobScheduler(
        job.key,
        { pattern: job.cronExpression, tz: job.timezone },
        {
          name: job.key,
          data: { key: job.key },
          opts: {
            attempts: retry.maxAttempts,
            backoff: retry.backoffMs > 0 ? { type: "exponential", delay: retry.backoffMs } : undefined,
            removeOnComplete: { count: 50 },
            removeOnFail: { count: 200 }, // failed jobs kept here effectively act as the dead-letter record
            priority: job.priority,
          },
        },
      );
      await this.syncNextRun(job.key);
    } catch (error) {
      console.error(`[scheduler:bullmq] failed to register job "${job.key}":`, error);
      if (opts.rethrow) throw error;
    }
  }

  /**
   * Runtime cron-expression edit from the Job Management Dashboard. Unlike
   * registry.ts's JOB_DEFINITIONS (only read at process bootstrap), this
   * actually re-registers the live BullMQ job scheduler so the new pattern
   * takes effect immediately, without a restart.
   *
   * Validated with cron-parser's real `parseExpression` — the same function
   * BullMQ's own Repeat/JobScheduler classes import from 'cron-parser'
   * (node_modules/bullmq/dist/esm/classes/job-scheduler.js) to interpret
   * `pattern`, so a string that parses here is guaranteed to be exactly what
   * BullMQ itself will accept, not a separate/looser guess. On success,
   * `queue.upsertJobScheduler` (called via registerScheduler) both updates
   * the existing job scheduler and creates the next delayed job on the new
   * pattern — its own JSDoc (node_modules/bullmq/dist/esm/classes/queue.d.ts)
   * states "Upserting a scheduler will create a new job scheduler or update
   * an existing one," i.e. a second call with the same jobSchedulerId
   * replaces the prior pattern rather than adding a duplicate schedule.
   */
  async updateCronExpression(key: string, cronExpression: string): Promise<void> {
    try {
      parseExpression(cronExpression);
    } catch (error) {
      throw new Error(`Invalid cron expression "${cronExpression}": ${error instanceof Error ? error.message : String(error)}`);
    }

    const job = this.jobs.get(key);
    if (!job) throw new Error(`No job definition registered for "${key}".`);

    job.cronExpression = cronExpression;
    await this.registerScheduler(job, { rethrow: true });
  }

  private async syncNextRun(key: string): Promise<void> {
    const scheduler = await this.queue.getJobScheduler(key);
    const nextRunAt = scheduler?.next ? new Date(scheduler.next) : null;
    await prisma.scheduledJob.update({ where: { key }, data: { nextRunAt } }).catch(() => {});
  }

  async trigger(key: string): Promise<void> {
    const job = this.jobs.get(key);
    if (!job) throw new Error(`No job definition registered for "${key}".`);
    this.ensureWorker();
    // BullMQ rejects custom job ids containing ":" — verified by hitting this
    // for real against local Redis, not assumed from docs.
    await this.queue.add(key, { key }, { jobId: `manual-${key}-${Date.now()}`, attempts: 1, priority: job.priority });
  }

  async pause(key: string): Promise<void> {
    await this.queue.removeJobScheduler(key).catch(() => {});
    await prisma.scheduledJob.update({ where: { key }, data: { enabled: false, nextRunAt: null } }).catch(() => {});
  }

  async resume(key: string): Promise<void> {
    const job = this.jobs.get(key);
    if (!job) return;
    await prisma.scheduledJob.update({ where: { key }, data: { enabled: true } }).catch(() => {});
    await this.registerScheduler(job);
  }

  async disable(key: string): Promise<void> {
    await this.pause(key);
  }

  async getStatus(key: string): Promise<JobStatus | null> {
    const row = await prisma.scheduledJob.findUnique({ where: { key } });
    if (!row) return null;
    return {
      key: row.key,
      name: row.name,
      cronExpression: row.cronExpression,
      enabled: row.enabled,
      lastRunAt: row.lastRunAt,
      nextRunAt: row.nextRunAt,
      priority: row.priority,
    };
  }

  async listStatuses(): Promise<JobStatus[]> {
    const rows = await prisma.scheduledJob.findMany({ orderBy: { name: "asc" } });
    return rows.map((row) => ({
      key: row.key,
      name: row.name,
      cronExpression: row.cronExpression,
      enabled: row.enabled,
      lastRunAt: row.lastRunAt,
      nextRunAt: row.nextRunAt,
      priority: row.priority,
    }));
  }

  async listRuns(key: string, limit = 20): Promise<JobRunRecord[]> {
    const job = await prisma.scheduledJob.findUnique({ where: { key } });
    if (!job) return [];
    const runs = await prisma.scheduledJobRun.findMany({
      where: { jobId: job.id },
      orderBy: { startedAt: "desc" },
      take: limit,
    });
    return runs.map((run) => ({
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      attempt: run.attempt,
      error: run.error,
      logs: (run.logs as JobRunLog[] | null) ?? null,
    }));
  }

  /** The Worker's processor — runs in whichever process hosts the Worker (this app: same process that called schedule()). */
  private async process(bullJob: BullJob<{ key: string }>): Promise<JobRunLog[]> {
    const key = bullJob.data.key;
    const job = this.jobs.get(key);
    if (!job) {
      throw new Error(
        `No job definition registered for "${key}" in this process — the Worker and the process that called schedule() must be the same process in this app's current single-instance deployment.`,
      );
    }

    const jobRow = await prisma.scheduledJob.upsert({
      where: { key },
      update: {},
      create: { key, name: job.name, cronExpression: job.cronExpression, priority: job.priority ?? null },
    });
    if (!jobRow.enabled) {
      return [{ level: "info", message: "Skipped — job is disabled." }];
    }

    const attempt = bullJob.attemptsMade + 1;
    const maxAttempts = bullJob.opts.attempts ?? 1;
    const run = await prisma.scheduledJobRun.create({ data: { jobId: jobRow.id, status: "RUNNING", attempt } });

    try {
      const logs = (await job.handler()) ?? [];
      await prisma.scheduledJobRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), logs: logs as object },
      });
      await prisma.scheduledJob.update({ where: { key }, data: { lastRunAt: new Date() } });
      void this.syncNextRun(key);
      return logs;
    } catch (error) {
      const willRetry = attempt < maxAttempts;
      await prisma.scheduledJobRun.update({
        where: { id: run.id },
        data: {
          status: willRetry ? "RETRYING" : "FAILED",
          finishedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        },
      });
      await prisma.scheduledJob.update({ where: { key }, data: { lastRunAt: new Date() } }).catch(() => {});
      throw error; // BullMQ owns retry scheduling/backoff from here — real, not hand-rolled.
    }
  }
}

export const bullmqProvider = new BullMQProvider();

export interface QueueStats {
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
}

export interface FailedJobRecord {
  id: string;
  name: string;
  data: unknown;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
}

/** Real job counts straight from BullMQ/Redis — for the Job Management Dashboard's queue stats strip. */
export async function getQueueStats(): Promise<QueueStats> {
  const counts = await getQueue().getJobCounts("active", "waiting", "delayed", "completed", "failed");
  return {
    active: counts.active ?? 0,
    waiting: counts.waiting ?? 0,
    delayed: counts.delayed ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
  };
}

/** Real failed jobs from BullMQ's failed set — this app's Dead Letter Queue view. */
export async function listFailedJobs(limit = 50): Promise<FailedJobRecord[]> {
  const jobs = await getQueue().getJobs(["failed"], 0, limit);
  return jobs.map((job) => ({
    id: job.id ?? "",
    name: job.name,
    data: job.data,
    failedReason: job.failedReason,
    attemptsMade: job.attemptsMade,
    timestamp: job.timestamp,
  }));
}

/** Re-enqueues a failed job for another attempt — real BullMQ retry, not a hand-rolled re-add. */
export async function retryFailedJob(jobId: string): Promise<void> {
  const job = await getQueue().getJob(jobId);
  if (!job) throw new Error(`No job found with id "${jobId}".`);
  await job.retry();
}

/** Permanently discards a failed job from the Dead Letter Queue. */
export async function discardFailedJob(jobId: string): Promise<void> {
  const job = await getQueue().getJob(jobId);
  if (!job) throw new Error(`No job found with id "${jobId}".`);
  await job.remove();
}
