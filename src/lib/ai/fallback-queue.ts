import { Queue, Worker } from "bullmq";

import { prisma } from "@/lib/prisma";
import { createRedisClient, type RedisLikeClient } from "@/lib/redis-client";
import { publishRealtimeEvent } from "@/lib/realtime/event-bus";

/**
 * The durable last resort when EVERY provider in the fallback chain
 * (Anthropic → Groq → Gemini → OpenRouter, see fallback.ts) fails on a given
 * call — "backend takes control" means the request is queued for automatic,
 * backed-off retry instead of just erroring out to whoever called it.
 *
 * Scope, honestly stated: this queue retries the raw generation (system +
 * user prompt through the same provider chain) with backoff, and — for
 * agent-attributed calls — restores the agent's live status and fires the
 * same realtime event a normal successful turn would, so the Live AI Panel
 * reflects real recovery. It does NOT re-run the specific caller's own
 * side effects (e.g. re-writing a Decision/Vote row a War Room vote would
 * have written) — reconstructing every call site's persistence from a queued
 * retry is out of scope here. What you get is genuine resilience against a
 * full-chain outage (all 4 providers down/rate-limited at once) recovering
 * on its own once at least one provider comes back, with the same
 * globalThis-cached-connection, separate-Queue/Worker-connection pattern as
 * this app's other BullMQ queues (src/lib/rag/embedding-queue.ts,
 * src/lib/scheduler/providers/bullmq-provider.ts) — not a new convention.
 *
 * Uses a dynamic import of ./fallback inside the worker processor (rather
 * than a static top-level import) specifically to avoid a circular import:
 * fallback.ts imports enqueueAIFallbackRetry from this file to queue on
 * total failure, so this file cannot statically import back from
 * fallback.ts.
 */

const QUEUE_NAME = "kvl-ai-fallback";

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

const globalForAIFallbackQueue = globalThis as unknown as {
  __aiFallbackRedisConnection?: RedisLikeClient;
  __aiFallbackWorkerConnection?: RedisLikeClient;
  __aiFallbackQueue?: Queue;
  __aiFallbackWorker?: Worker;
};

function getConnection(): RedisLikeClient {
  if (!globalForAIFallbackQueue.__aiFallbackRedisConnection) {
    globalForAIFallbackQueue.__aiFallbackRedisConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForAIFallbackQueue.__aiFallbackRedisConnection;
}

function getWorkerConnection(): RedisLikeClient {
  if (!globalForAIFallbackQueue.__aiFallbackWorkerConnection) {
    globalForAIFallbackQueue.__aiFallbackWorkerConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForAIFallbackQueue.__aiFallbackWorkerConnection;
}

function getQueue(): Queue {
  if (!globalForAIFallbackQueue.__aiFallbackQueue) {
    globalForAIFallbackQueue.__aiFallbackQueue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return globalForAIFallbackQueue.__aiFallbackQueue;
}

export interface AIFallbackJobData {
  organizationId?: string;
  agentId?: string;
  /** Free-text label for what this call was (matches the `context` strings agent-runtime.ts already records with recordAIUsage), used only for logging here. */
  context: string;
  system: string;
  userContent: string;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
}

async function processRetry(data: AIFallbackJobData): Promise<{ text: string; provider: string; model: string }> {
  // Dynamic import — see file header for why this can't be a static import.
  const { generateText } = await import("./fallback");

  const result = await generateText({
    system: data.system,
    userContent: data.userContent,
    maxTokens: data.maxTokens,
    effort: data.effort,
  });
  // No `queue` argument passed above — a retry job that itself fails must
  // rely on BullMQ's own attempts/backoff, never re-enqueue itself (that
  // would silently create an unbounded retry loop across two queues).

  if (data.agentId) {
    const agent = await prisma.aIAgentInstance.update({
      where: { id: data.agentId },
      data: { status: "COMPLETED" },
      select: { organizationId: true },
    });
    publishRealtimeEvent({ kind: "agent_status", organizationId: agent.organizationId });
  } else if (data.organizationId) {
    publishRealtimeEvent({ kind: "agent_status", organizationId: data.organizationId });
  }

  return { text: result.text, provider: result.provider, model: result.model };
}

function ensureWorker(): void {
  if (globalForAIFallbackQueue.__aiFallbackWorker) return;
  globalForAIFallbackQueue.__aiFallbackWorker = new Worker<AIFallbackJobData>(QUEUE_NAME, async (job) => processRetry(job.data), {
    connection: getWorkerConnection(),
    concurrency: 2,
  });
  globalForAIFallbackQueue.__aiFallbackWorker.on("failed", (job, err) => {
    console.error(`[ai/fallback-queue] job ${job?.id} (${job?.data.context}) failed:`, err);
  });
}

/**
 * Queues one durable retry of a failed generation. Backoff is deliberately
 * long — this only fires after all 4 providers already failed in the same
 * request, so retrying immediately would almost certainly hit the same
 * outage/rate-limit again; the delays give real recovery time (a rate limit
 * window passing, credit being topped up, a provider outage ending).
 */
export async function enqueueAIFallbackRetry(data: AIFallbackJobData): Promise<void> {
  ensureWorker();
  await getQueue().add("retry_generation", data, {
    attempts: 5,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  });
}

export interface AIFallbackQueueStats {
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
}

/** Mirrors getRagQueueStats()/getQueueStats() elsewhere — real job counts for the Production Dashboard / Jobs settings page's Queue Health section. */
export async function getAIFallbackQueueStats(): Promise<AIFallbackQueueStats> {
  const counts = await getQueue().getJobCounts("active", "waiting", "delayed", "completed", "failed");
  return {
    active: counts.active ?? 0,
    waiting: counts.waiting ?? 0,
    delayed: counts.delayed ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
  };
}
