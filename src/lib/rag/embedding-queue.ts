import { Queue, Worker } from "bullmq";

import { prisma } from "@/lib/prisma";
import { createRedisClient, type RedisLikeClient } from "@/lib/redis-client";
import { generateEmbedding, generateEmbeddings, EmbeddingsNotConnectedError } from "./embeddings";
import { upsertEmbedding, deleteEmbeddings } from "./vector-store";
import { chunkText } from "./chunking";
import { extractDocumentText } from "./ingestion";
import { readDocumentFile } from "@/lib/storage/documents";
import type { EmbeddingSourceType } from "@/generated/prisma/client";

/**
 * Background embedding/ingestion queue — copies the exact
 * globalThis-cached-connection, separate-Queue/Worker-connection pattern
 * already used by src/lib/scheduler/providers/bullmq-provider.ts and
 * src/lib/workflows/engine.ts, rather than inventing a third variant. A
 * dedicated queue (not reusing the workflow-execution or scheduler queues)
 * so a burst of re-embedding work never competes with workflow steps or
 * scheduled jobs for the same worker concurrency slots.
 */

const QUEUE_NAME = "kvl-rag-embedding";

function getRedisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

const globalForEmbeddingQueue = globalThis as unknown as {
  __ragRedisConnection?: RedisLikeClient;
  __ragWorkerConnection?: RedisLikeClient;
  __ragQueue?: Queue;
  __ragWorker?: Worker;
};

function getConnection(): RedisLikeClient {
  if (!globalForEmbeddingQueue.__ragRedisConnection) {
    globalForEmbeddingQueue.__ragRedisConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForEmbeddingQueue.__ragRedisConnection;
}

function getWorkerConnection(): RedisLikeClient {
  if (!globalForEmbeddingQueue.__ragWorkerConnection) {
    globalForEmbeddingQueue.__ragWorkerConnection = createRedisClient(getRedisUrl(), { maxRetriesPerRequest: null });
  }
  return globalForEmbeddingQueue.__ragWorkerConnection;
}

function getQueue(): Queue {
  if (!globalForEmbeddingQueue.__ragQueue) {
    globalForEmbeddingQueue.__ragQueue = new Queue(QUEUE_NAME, { connection: getConnection() });
  }
  return globalForEmbeddingQueue.__ragQueue;
}

type EmbeddingJobData =
  | { kind: "embed_source"; organizationId: string; sourceType: EmbeddingSourceType; sourceId: string; text: string }
  | { kind: "ingest_document"; organizationId: string; ingestedDocumentId: string };

async function processEmbedSource(data: Extract<EmbeddingJobData, { kind: "embed_source" }>): Promise<void> {
  const trimmed = data.text.trim();
  if (!trimmed) {
    await deleteEmbeddings(data.sourceType, data.sourceId);
    return;
  }

  // Articles/memory get one representative embedding of their content
  // (truncated for extremely long text) rather than being split into
  // DocumentChunk rows — multi-chunk retrieval is reserved for
  // IngestedDocument, which is what DocumentChunk actually models.
  const TRUNCATE_CHARS = 24_000;
  const result = await generateEmbedding(data.organizationId, trimmed.slice(0, TRUNCATE_CHARS));
  await upsertEmbedding({
    organizationId: data.organizationId,
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    provider: result.provider,
    model: result.model,
    dimensions: result.dimensions,
    vector: result.vector,
  });
}

async function processIngestDocument(data: Extract<EmbeddingJobData, { kind: "ingest_document" }>): Promise<void> {
  const doc = await prisma.ingestedDocument.findUnique({ where: { id: data.ingestedDocumentId } });
  if (!doc || doc.organizationId !== data.organizationId) return;

  try {
    await prisma.ingestedDocument.update({ where: { id: doc.id }, data: { status: "PARSING", error: null } });

    let rawText: string;
    if (doc.storageKey && doc.mimeType) {
      const buffer = await readDocumentFile(doc.storageKey);
      rawText = await extractDocumentText(buffer, doc.mimeType, doc.originalFilename ?? doc.title);
    } else {
      throw new Error("IngestedDocument has no storageKey/mimeType to parse.");
    }

    await prisma.ingestedDocument.update({ where: { id: doc.id }, data: { status: "CHUNKING" } });
    const chunks = chunkText(rawText);
    if (chunks.length === 0) throw new Error("Document produced no extractable text content.");

    await prisma.documentChunk.deleteMany({ where: { ingestedDocumentId: doc.id } });
    const createdChunks = await prisma.$transaction(
      chunks.map((chunk, index) =>
        prisma.documentChunk.create({
          data: {
            ingestedDocumentId: doc.id,
            organizationId: doc.organizationId,
            chunkIndex: index,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
          },
        }),
      ),
    );

    await prisma.ingestedDocument.update({ where: { id: doc.id }, data: { status: "EMBEDDING" } });
    const embeddingResult = await generateEmbeddings(doc.organizationId, createdChunks.map((c) => c.content));
    await Promise.all(
      createdChunks.map((chunk, index) =>
        upsertEmbedding({
          organizationId: doc.organizationId,
          sourceType: "DOCUMENT_CHUNK",
          sourceId: chunk.id,
          provider: embeddingResult.provider,
          model: embeddingResult.model,
          dimensions: embeddingResult.dimensions,
          vector: embeddingResult.vectors[index],
        }),
      ),
    );

    await prisma.ingestedDocument.update({ where: { id: doc.id }, data: { status: "READY" } });
  } catch (error) {
    const message = error instanceof EmbeddingsNotConnectedError
      ? "No embedding provider is connected for this organization — connect one at /dashboard/settings/integrations, then retry ingestion."
      : error instanceof Error ? error.message : String(error);
    await prisma.ingestedDocument.update({ where: { id: doc.id }, data: { status: "FAILED", error: message } });
  }
}

function ensureWorker(): void {
  if (globalForEmbeddingQueue.__ragWorker) return;
  globalForEmbeddingQueue.__ragWorker = new Worker<EmbeddingJobData>(
    QUEUE_NAME,
    async (job) => {
      if (job.data.kind === "embed_source") return processEmbedSource(job.data);
      return processIngestDocument(job.data);
    },
    { connection: getWorkerConnection(), concurrency: 3 },
  );
  globalForEmbeddingQueue.__ragWorker.on("failed", (job, err) => {
    console.error(`[rag:embedding-queue] job ${job?.id} failed:`, err);
  });
}

/** Enqueues (re-)embedding a single KnowledgeArticle or AgentMemory's real content — never embeds synchronously in a request path. */
export async function enqueueSourceEmbedding(organizationId: string, sourceType: EmbeddingSourceType, sourceId: string, text: string): Promise<void> {
  ensureWorker();
  await getQueue().add(
    "embed_source",
    { kind: "embed_source", organizationId, sourceType, sourceId, text },
    { attempts: 3, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: 200, removeOnFail: 500 },
  );
}

/** Enqueues real parse → chunk → embed processing for an uploaded IngestedDocument. */
export async function enqueueDocumentIngestion(organizationId: string, ingestedDocumentId: string): Promise<void> {
  ensureWorker();
  await getQueue().add(
    "ingest_document",
    { kind: "ingest_document", organizationId, ingestedDocumentId },
    { attempts: 3, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: 200, removeOnFail: 500 },
  );
}

export interface RagQueueStats {
  active: number;
  waiting: number;
  delayed: number;
  completed: number;
  failed: number;
}

/**
 * Real job counts straight from this queue's own BullMQ/Redis instance
 * ("kvl-rag-embedding") — added for the Production Dashboard's Queue Health
 * section, mirroring the stats getters this app's other three BullMQ queues
 * already expose (bullmq-provider.ts, engine.ts, recurring-billing-queue.ts).
 */
export async function getRagQueueStats(): Promise<RagQueueStats> {
  const counts = await getQueue().getJobCounts("active", "waiting", "delayed", "completed", "failed");
  return {
    active: counts.active ?? 0,
    waiting: counts.waiting ?? 0,
    delayed: counts.delayed ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
  };
}
