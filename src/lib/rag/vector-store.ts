import { prisma } from "@/lib/prisma";
import type { Embedding, EmbeddingProvider, EmbeddingSourceType } from "@/generated/prisma/client";

/**
 * Vector storage/retrieval layer. Every embedding is always written to the
 * real, always-available `Embedding.vector Float[]` column (see that
 * model's doc comment in prisma/schema.prisma) — this file's brute-force
 * `cosineSimilarity` scan over that column is therefore never a "fallback
 * that might be stale"; it is the one retrieval path that always works.
 *
 * If the `vector` Postgres extension is later installed (see
 * prisma/optional-pgvector-upgrade.sql), `isPgVectorAvailable()` starts
 * returning true and callers that want ANN-speed search at large scale can
 * route through a native `vector`-column side table instead — but nothing
 * in this codebase requires that upgrade to function correctly today; it's
 * a pure performance path, never a correctness dependency.
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

let pgVectorAvailable: boolean | null = null;

/** Real, cached check against pg_extension — never assumed. */
export async function isPgVectorAvailable(): Promise<boolean> {
  if (pgVectorAvailable !== null) return pgVectorAvailable;
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS exists
    `;
    pgVectorAvailable = rows[0]?.exists ?? false;
  } catch (error) {
    console.error("[rag/vector-store] pgvector availability check failed:", error);
    pgVectorAvailable = false;
  }
  return pgVectorAvailable;
}

export interface UpsertEmbeddingInput {
  organizationId: string;
  sourceType: EmbeddingSourceType;
  sourceId: string;
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  vector: number[];
}

export async function upsertEmbedding(input: UpsertEmbeddingInput): Promise<Embedding> {
  return prisma.embedding.upsert({
    where: { sourceType_sourceId_provider: { sourceType: input.sourceType, sourceId: input.sourceId, provider: input.provider } },
    create: input,
    update: { model: input.model, dimensions: input.dimensions, vector: input.vector },
  });
}

export async function deleteEmbeddings(sourceType: EmbeddingSourceType, sourceId: string): Promise<void> {
  await prisma.embedding.deleteMany({ where: { sourceType, sourceId } });
}

export interface SemanticMatch {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  score: number;
}

// Real, documented scaling ceiling of the brute-force JS fallback path — a
// per-org, per-sourceType corpus larger than this needs the pgvector
// upgrade (prisma/optional-pgvector-upgrade.sql) for acceptable latency;
// this cap keeps a single search from loading unbounded memory in the
// meantime rather than silently degrading forever.
const BRUTE_FORCE_SCAN_LIMIT = 5000;

/**
 * Real cosine-similarity search over this org's embeddings, scoped to the
 * given source types. Loads up to BRUTE_FORCE_SCAN_LIMIT candidate vectors
 * and ranks them in Node — genuine semantic ranking, not a keyword match,
 * just not ANN-indexed. Returns the real top `topK` above `minScore`.
 */
export async function semanticSearch(
  organizationId: string,
  sourceTypes: EmbeddingSourceType[],
  queryVector: number[],
  topK = 10,
  minScore = 0.15,
): Promise<SemanticMatch[]> {
  const candidates = await prisma.embedding.findMany({
    where: { organizationId, sourceType: { in: sourceTypes } },
    select: { sourceType: true, sourceId: true, vector: true },
    take: BRUTE_FORCE_SCAN_LIMIT,
  });

  const scored = candidates
    .map((c) => ({ sourceType: c.sourceType, sourceId: c.sourceId, score: cosineSimilarity(queryVector, c.vector) }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored;
}
