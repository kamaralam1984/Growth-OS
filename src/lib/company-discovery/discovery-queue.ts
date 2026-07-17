import { Queue, Worker } from "bullmq";

import { createRedisClient, type RedisLikeClient } from "@/lib/redis-client";

/**
 * Dedicated BullMQ queue for the AI Company Understanding Engine — same
 * globalThis-cached-connection, separate-Queue/Worker-connection pattern as
 * src/lib/ai/fallback-queue.ts and src/lib/rag/embedding-queue.ts, not a new
 * convention. One-off jobs only (never recurring/cron) — each enqueue is a
 * fresh CompanyDiscoveryRun, triggered once after onboarding completes or
 * once per manual "Re-analyze" click; never blocks the caller.
 */

const QUEUE_NAME = "kvl-company-discovery";

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

const globalForDiscoveryQueue = globalThis as unknown as {
  __companyDiscoveryRedisConnection?: RedisLikeClient;
  __companyDiscoveryWorkerConnection?: RedisLikeClient;
  __companyDiscoveryQueue?: Queue;
  __companyDiscoveryWorker?: Worker;
};

function getConnection(): RedisLikeClient {
  if (!globalForDiscoveryQueue.__companyDiscoveryRedisConnection) {
    globalForDiscoveryQueue.__companyDiscoveryRedisConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForDiscoveryQueue.__companyDiscoveryRedisConnection;
}

function getWorkerConnection(): RedisLikeClient {
  if (!globalForDiscoveryQueue.__companyDiscoveryWorkerConnection) {
    globalForDiscoveryQueue.__companyDiscoveryWorkerConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForDiscoveryQueue.__companyDiscoveryWorkerConnection;
}

function getQueue(): Queue {
  if (!globalForDiscoveryQueue.__companyDiscoveryQueue) {
    globalForDiscoveryQueue.__companyDiscoveryQueue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return globalForDiscoveryQueue.__companyDiscoveryQueue;
}

export interface CompanyDiscoveryJobData {
  runId: string;
}

function ensureWorker(): void {
  if (globalForDiscoveryQueue.__companyDiscoveryWorker) return;
  globalForDiscoveryQueue.__companyDiscoveryWorker = new Worker<CompanyDiscoveryJobData>(
    QUEUE_NAME,
    async (job) => {
      // Dynamic import: pipeline.ts pulls in the full AI/meeting/scanner
      // stack — deferring the import to job-execution time keeps this
      // queue module cheap to import from request-handling code paths
      // (e.g. the onboarding Server Action that only needs to enqueue).
      const { runCompanyDiscovery } = await import("./pipeline");
      await runCompanyDiscovery(job.data.runId);
    },
    { connection: getWorkerConnection(), concurrency: 2 },
  );
  globalForDiscoveryQueue.__companyDiscoveryWorker.on("failed", (job, err) => {
    console.error(`[company-discovery/discovery-queue] job ${job?.id} (run ${job?.data.runId}) failed:`, err);
  });
}

/** Enqueues one company-discovery pipeline run. Never blocks the caller — returns as soon as the job is queued. */
export async function enqueueCompanyDiscoveryRun(runId: string): Promise<void> {
  ensureWorker();
  await getQueue().add(
    "run_discovery",
    { runId },
    {
      attempts: 2,
      backoff: { type: "exponential", delay: 30_000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  );
}

export interface CompanyDiscoveryQueueStats {
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
}

/** Mirrors getAIFallbackQueueStats()/getRagQueueStats() — real job counts for the Production Dashboard's Queue Health section. */
export async function getCompanyDiscoveryQueueStats(): Promise<CompanyDiscoveryQueueStats> {
  const counts = await getQueue().getJobCounts("active", "waiting", "delayed", "completed", "failed");
  return {
    active: counts.active ?? 0,
    waiting: counts.waiting ?? 0,
    delayed: counts.delayed ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
  };
}
