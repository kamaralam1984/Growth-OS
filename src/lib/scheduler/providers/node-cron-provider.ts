import { schedule as cronSchedule, type ScheduledTask } from "node-cron";

import { prisma } from "@/lib/prisma";
import type { JobDefinition, JobRunLog, JobRunRecord, JobStatus, SchedulerProvider } from "../types";

const DEFAULT_RETRY = { maxAttempts: 1, backoffMs: 0 };

/**
 * In-process cron provider — the only SchedulerProvider implementation
 * today. Every run is persisted to ScheduledJob/ScheduledJobRun so the Job
 * Management Dashboard reflects real execution history, not an assumption.
 * A future BullMQ/Temporal provider implements the same interface and is
 * swapped in src/lib/scheduler/init.ts.
 */
class NodeCronProvider implements SchedulerProvider {
  private jobs = new Map<string, JobDefinition>();
  private tasks = new Map<string, ScheduledTask>();
  private running = new Set<string>();

  schedule(job: JobDefinition): void {
    if (this.jobs.has(job.key)) return; // already registered this process (Next dev hot-reload guard is handled in init.ts)
    this.jobs.set(job.key, job);

    const task = cronSchedule(
      job.cronExpression,
      () => {
        void this.runNow(job.key);
      },
      { name: job.key, noOverlap: true },
    );
    this.tasks.set(job.key, task);

    // Single atomic upsert (not two racing calls) — an earlier version fired
    // an upsert() and a separate update() concurrently, and since neither was
    // awaited, update() could reach Postgres before upsert()'s INSERT
    // committed, throw "record not found", and have that error silently
    // swallowed by .catch(() => {}) — nextRunAt then never got persisted.
    void this.registerJob(job, task);
  }

  private async registerJob(job: JobDefinition, task: ScheduledTask): Promise<void> {
    try {
      await prisma.scheduledJob.upsert({
        where: { key: job.key },
        update: { name: job.name, cronExpression: job.cronExpression, nextRunAt: task.getNextRun(), priority: job.priority ?? null },
        create: { key: job.key, name: job.name, cronExpression: job.cronExpression, nextRunAt: task.getNextRun(), priority: job.priority ?? null },
      });
    } catch (error) {
      console.error(`[scheduler] failed to register job "${job.key}":`, error);
    }
  }

  private async syncNextRun(key: string, task: ScheduledTask): Promise<void> {
    const nextRunAt = task.getNextRun();
    await prisma.scheduledJob.update({ where: { key }, data: { nextRunAt } }).catch(() => {});
  }

  async trigger(key: string): Promise<void> {
    await this.runNow(key, /* manual */ true);
  }

  async pause(key: string): Promise<void> {
    await this.tasks.get(key)?.stop();
    await prisma.scheduledJob.update({ where: { key }, data: { enabled: false } }).catch(() => {});
  }

  async resume(key: string): Promise<void> {
    await this.tasks.get(key)?.start();
    await prisma.scheduledJob.update({ where: { key }, data: { enabled: true } }).catch(() => {});
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

  /** Runs a job's handler with retry, persisting every attempt as its own ScheduledJobRun row. */
  private async runNow(key: string, manual = false): Promise<void> {
    const job = this.jobs.get(key);
    if (!job) return;
    if (this.running.has(key)) return; // noOverlap belt-and-braces for manual triggers racing the cron tick

    const jobRow = await prisma.scheduledJob.upsert({
      where: { key },
      update: {},
      create: { key, name: job.name, cronExpression: job.cronExpression },
    });
    if (!jobRow.enabled && !manual) return;

    this.running.add(key);
    const retry = job.retryPolicy ?? DEFAULT_RETRY;
    let attempt = 0;
    let lastError: unknown = null;

    try {
      while (attempt < retry.maxAttempts) {
        attempt += 1;
        const run = await prisma.scheduledJobRun.create({
          data: { jobId: jobRow.id, status: "RUNNING", attempt },
        });
        try {
          const logs = (await job.handler()) ?? [];
          await prisma.scheduledJobRun.update({
            where: { id: run.id },
            data: { status: "SUCCESS", finishedAt: new Date(), logs: logs as object },
          });
          await prisma.scheduledJob.update({ where: { key }, data: { lastRunAt: new Date() } });
          return;
        } catch (error) {
          lastError = error;
          const willRetry = attempt < retry.maxAttempts;
          await prisma.scheduledJobRun.update({
            where: { id: run.id },
            data: {
              status: willRetry ? "RETRYING" : "FAILED",
              finishedAt: new Date(),
              error: error instanceof Error ? error.message : String(error),
            },
          });
          await prisma.scheduledJob.update({ where: { key }, data: { lastRunAt: new Date() } });
          if (willRetry && retry.backoffMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, retry.backoffMs));
          }
        }
      }
      console.error(`[scheduler] job "${key}" failed after ${attempt} attempt(s):`, lastError);
    } finally {
      this.running.delete(key);
      const task = this.tasks.get(key);
      if (task) void this.syncNextRun(key, task);
    }
  }
}

export const nodeCronProvider = new NodeCronProvider();
