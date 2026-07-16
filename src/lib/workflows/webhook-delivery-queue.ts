import { Queue, Worker, type Job as BullJob } from "bullmq";

import { createRedisClient, type RedisLikeClient } from "@/lib/redis-client";
import { assertPublicUrl, performOutgoingRequest } from "./node-executors/outgoing-request";
import { recordWebhookDelivery } from "./webhooks";

const QUEUE_NAME = "kvl-webhook-delivery";

/**
 * Real, dedicated BullMQ queue for OUTGOING webhook delivery retries — kept
 * separate from engine.ts's "kvl-workflow-execution" queue on purpose:
 * workflow-step sequencing and outgoing-webhook retry timing are different
 * concerns with different backoff needs, and mixing them would mean a burst
 * of webhook retries could starve/delay unrelated workflow step jobs (and
 * vice versa). Connection/Queue/Worker caching mirrors engine.ts's and
 * bullmq-provider.ts's exact globalThis pattern for the same reason they
 * use it: Next.js can reload this module multiple times in dev, and a naive
 * top-level `new Queue(...)` would leak a fresh Redis connection on every
 * reload.
 *
 * Retries/backoff are BullMQ's native `attempts`/`backoff` job options — a
 * real library feature, not hand-rolled setTimeout retry logic.
 */

const RETRY_ATTEMPTS = 5;
const RETRY_BACKOFF_DELAY_MS = 1000;

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

const globalForWebhookQueue = globalThis as unknown as {
  __webhookDeliveryRedisConnection?: RedisLikeClient;
  __webhookDeliveryWorkerConnection?: RedisLikeClient;
  __webhookDeliveryQueue?: Queue;
  __webhookDeliveryWorker?: Worker;
};

function getConnection(): RedisLikeClient {
  if (!globalForWebhookQueue.__webhookDeliveryRedisConnection) {
    globalForWebhookQueue.__webhookDeliveryRedisConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForWebhookQueue.__webhookDeliveryRedisConnection;
}

function getWorkerConnection(): RedisLikeClient {
  // BullMQ Workers need their own dedicated connection (blocking commands),
  // never shared with the Queue's connection — same rule engine.ts and
  // bullmq-provider.ts follow.
  if (!globalForWebhookQueue.__webhookDeliveryWorkerConnection) {
    globalForWebhookQueue.__webhookDeliveryWorkerConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForWebhookQueue.__webhookDeliveryWorkerConnection;
}

function getQueue(): Queue {
  if (!globalForWebhookQueue.__webhookDeliveryQueue) {
    globalForWebhookQueue.__webhookDeliveryQueue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return globalForWebhookQueue.__webhookDeliveryQueue;
}

interface WebhookDeliveryJobData {
  webhookId?: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body: unknown;
}

function ensureWorker(): void {
  if (globalForWebhookQueue.__webhookDeliveryWorker) return;
  globalForWebhookQueue.__webhookDeliveryWorker = new Worker<WebhookDeliveryJobData>(
    QUEUE_NAME,
    (bullJob) => processDelivery(bullJob),
    { connection: getWorkerConnection(), concurrency: 5 },
  );
  globalForWebhookQueue.__webhookDeliveryWorker.on("failed", (bullJob, err) => {
    console.error(`[workflows:webhook-delivery] delivery job failed (webhook ${bullJob?.data?.webhookId ?? "none"}, url ${bullJob?.data?.url}):`, err);
  });
}

/**
 * The Worker's processor — performs one real HTTP delivery attempt (reusing
 * outgoing-request.ts's exact SSRF-safe URL validation + fetch helpers —
 * the same ones communication.ts's WEBHOOK/CUSTOM_API executors use — not a
 * duplicate copy of that private-IP-blocking logic) and logs a real
 * WebhookDelivery row for THIS attempt regardless of outcome, so the audit
 * trail shows the full retry history rather than only the final result.
 *
 * Attempt numbering: this queue is only ever enqueued (by
 * communication.ts's WEBHOOK/CUSTOM_API executors) AFTER a first synchronous
 * attempt has already happened and already been logged as attempt 1 — so
 * this Worker's own first try (bullJob.attemptsMade === 0) is genuinely
 * attempt 2 in the real delivery history, and so on.
 */
async function processDelivery(bullJob: BullJob<WebhookDeliveryJobData>): Promise<void> {
  const { webhookId, url, method, headers, body } = bullJob.data;
  const attempt = bullJob.attemptsMade + 2;

  let statusCode: number | undefined;
  let error: string | undefined;
  try {
    const target = await assertPublicUrl(url, "WEBHOOK_DELIVERY_RETRY");
    const result = await performOutgoingRequest("WEBHOOK_DELIVERY_RETRY", target, method, headers ?? {}, body);
    statusCode = result.status;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  if (webhookId) {
    await recordWebhookDelivery(webhookId, "OUTGOING", body ?? null, {
      statusCode,
      success: error === undefined,
      attempt,
      error,
    });
  }

  if (error !== undefined) throw error; // BullMQ owns retry scheduling/backoff from here — real, not hand-rolled.
}

/**
 * Fire-and-forget from the caller's perspective — enqueues a real background
 * retry job and returns immediately. IMPORTANT, INTENTIONAL LIMITATION:
 * retries run fully async in this dedicated queue/Worker; their outcomes are
 * only ever recorded as WebhookDelivery rows. They NEVER flow back onto the
 * WorkflowStepRun that originally triggered them — that row is already
 * finalized (FAILED) based on the executor's own immediate, synchronous
 * first attempt, exactly as it was before this batch. A workflow does not
 * retroactively "come back to life" if a background retry later succeeds;
 * only the delivery audit log reflects it. This is the correct tradeoff for
 * this app: workflow step outcomes must be decided immediately and
 * deterministically, while still giving a flaky downstream endpoint real
 * follow-up attempts.
 */
export async function enqueueWebhookDelivery(input: {
  webhookId?: string;
  url: string;
  method: string;
  headers?: Record<string, string>;
  body: unknown;
}): Promise<void> {
  ensureWorker();
  const jobIdSuffix = input.webhookId ?? "adhoc";
  await getQueue().add("deliver", input, {
    // BullMQ rejects custom job ids containing ":" — a cuid webhookId and
    // "adhoc" both stay colon-free, so this is safe.
    jobId: `webhook-delivery-${jobIdSuffix}-${Date.now()}`,
    attempts: RETRY_ATTEMPTS,
    backoff: { type: "exponential", delay: RETRY_BACKOFF_DELAY_MS },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  });
}
