import { getFreshAccessToken } from "@/lib/integrations/connection-store";
import { listConnections } from "@/lib/integrations/connection-store";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import type { IntegrationProviderKey } from "@/lib/integrations/types";
import type { EmbeddingProvider } from "@/generated/prisma/client";

/**
 * Pluggable embedding client layer for the RAG Engine — mirrors
 * src/lib/ai/client.ts's discipline exactly: a connection is only ever
 * "configured" when a real credential is on file (here: a real, org-owned
 * IntegrationConnection, reusing the Integration Hub built in the prior
 * phase rather than a parallel env-var system), and a call either returns a
 * real embedding vector or throws one of the two typed errors below —
 * never a fabricated zero-vector.
 */

export class EmbeddingsNotConnectedError extends Error {
  constructor(public readonly provider?: EmbeddingProvider) {
    super("EMBEDDINGS_NOT_CONNECTED");
    this.name = "EmbeddingsNotConnectedError";
  }
}

export class EmbeddingsProviderError extends Error {
  constructor(public readonly provider: EmbeddingProvider, message: string) {
    super(message);
    this.name = "EmbeddingsProviderError";
  }
}

export interface EmbeddingBatchResult {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  vectors: number[][];
}

// Priority order when the caller doesn't pin a specific provider — first
// org-connected one wins. OpenAI first since it's the most commonly already
// connected (also used for AI_ACTION-adjacent routing in the Integration Hub).
const PROVIDER_PRIORITY: Array<{ embeddingProvider: EmbeddingProvider; integrationKey: IntegrationProviderKey }> = [
  { embeddingProvider: "OPENAI", integrationKey: "OPENAI" },
  { embeddingProvider: "VOYAGE", integrationKey: "VOYAGE_AI" },
  { embeddingProvider: "COHERE", integrationKey: "COHERE" },
  { embeddingProvider: "JINA", integrationKey: "JINA_EMBEDDINGS" },
  { embeddingProvider: "BGE", integrationKey: "BGE" },
];

const INTEGRATION_KEY_BY_PROVIDER: Record<EmbeddingProvider, IntegrationProviderKey> = {
  OPENAI: "OPENAI",
  VOYAGE: "VOYAGE_AI",
  COHERE: "COHERE",
  JINA: "JINA_EMBEDDINGS",
  BGE: "BGE",
};

const MODEL_BY_PROVIDER: Record<EmbeddingProvider, { model: string; dimensions: number }> = {
  OPENAI: { model: "text-embedding-3-small", dimensions: 1536 },
  VOYAGE: { model: "voyage-3", dimensions: 1024 },
  COHERE: { model: "embed-english-v3.0", dimensions: 1024 },
  JINA: { model: "jina-embeddings-v3", dimensions: 1024 },
  BGE: { model: "bge-large-en-v1.5", dimensions: 1024 },
};

/** Real check — true only when this org has an actually-CONNECTED embeddings provider on file. */
export async function isEmbeddingsConnected(organizationId: string, provider?: EmbeddingProvider): Promise<boolean> {
  const resolved = await resolveProvider(organizationId, provider);
  return resolved !== null;
}

async function resolveProvider(
  organizationId: string,
  provider?: EmbeddingProvider,
): Promise<{ provider: EmbeddingProvider; accessToken: string } | null> {
  if (provider) {
    const accessToken = await getFreshAccessToken(organizationId, INTEGRATION_KEY_BY_PROVIDER[provider]);
    return accessToken ? { provider, accessToken } : null;
  }

  const connections = await listConnections(organizationId);
  const connectedKeys = new Set(connections.filter((c) => c.status === "CONNECTED").map((c) => c.provider));

  for (const candidate of PROVIDER_PRIORITY) {
    if (!connectedKeys.has(candidate.integrationKey)) continue;
    const accessToken = await getFreshAccessToken(organizationId, candidate.integrationKey);
    if (accessToken) return { provider: candidate.embeddingProvider, accessToken };
  }
  return null;
}

async function callOpenAI(accessToken: string, texts: string[]): Promise<number[][]> {
  const { model } = MODEL_BY_PROVIDER.OPENAI;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model }),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: Array<{ embedding: number[] }>; error?: { message?: string } };
  if (!response.ok || !body.data) throw new EmbeddingsProviderError("OPENAI", body.error?.message ?? `OpenAI embeddings request failed (HTTP ${response.status}).`);
  return body.data.map((d) => d.embedding);
}

async function callVoyage(accessToken: string, texts: string[]): Promise<number[][]> {
  const { model } = MODEL_BY_PROVIDER.VOYAGE;
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model }),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: Array<{ embedding: number[] }>; error?: { message?: string } };
  if (!response.ok || !body.data) throw new EmbeddingsProviderError("VOYAGE", body.error?.message ?? `Voyage AI embeddings request failed (HTTP ${response.status}).`);
  return body.data.map((d) => d.embedding);
}

async function callCohere(accessToken: string, texts: string[]): Promise<number[][]> {
  const { model } = MODEL_BY_PROVIDER.COHERE;
  const response = await fetch("https://api.cohere.com/v2/embed", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ texts, model, input_type: "search_document", embedding_types: ["float"] }),
  });
  const body = (await response.json().catch(() => ({}))) as { embeddings?: { float?: number[][] }; message?: string };
  if (!response.ok || !body.embeddings?.float) throw new EmbeddingsProviderError("COHERE", body.message ?? `Cohere embeddings request failed (HTTP ${response.status}).`);
  return body.embeddings.float;
}

async function callJina(accessToken: string, texts: string[]): Promise<number[][]> {
  const { model } = MODEL_BY_PROVIDER.JINA;
  const response = await fetch("https://api.jina.ai/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model }),
  });
  const body = (await response.json().catch(() => ({}))) as { data?: Array<{ embedding: number[] }>; detail?: string };
  if (!response.ok || !body.data) throw new EmbeddingsProviderError("JINA", body.detail ?? `Jina embeddings request failed (HTTP ${response.status}).`);
  return body.data.map((d) => d.embedding);
}

async function callBge(baseUrl: string, texts: string[]): Promise<number[][]> {
  const response = await fetch(`${baseUrl}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: texts }),
  });
  const body = (await response.json().catch(() => null)) as number[][] | { error?: string } | null;
  if (!response.ok || !Array.isArray(body)) {
    const message = body && !Array.isArray(body) ? body.error : undefined;
    throw new EmbeddingsProviderError("BGE", message ?? `BGE server embed request failed (HTTP ${response.status}).`);
  }
  return body;
}

const BATCH_SIZE = 32;

function chunkArray<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

/**
 * Generates real embedding vectors for a batch of texts using whichever
 * embedding provider this organization has actually connected (or a pinned
 * `provider`, if given, in which case that specific provider must be
 * connected or this throws EmbeddingsNotConnectedError — it never silently
 * falls back to a different provider than the caller asked for).
 */
export async function generateEmbeddings(
  organizationId: string,
  texts: string[],
  provider?: EmbeddingProvider,
): Promise<EmbeddingBatchResult> {
  if (texts.length === 0) throw new Error("generateEmbeddings requires at least one text.");

  const resolved = await resolveProvider(organizationId, provider);
  if (!resolved) throw new EmbeddingsNotConnectedError(provider);

  const { dimensions, model } = MODEL_BY_PROVIDER[resolved.provider];
  const batches = chunkArray(texts, BATCH_SIZE);
  const vectors: number[][] = [];

  for (const batch of batches) {
    let batchVectors: number[][];
    switch (resolved.provider) {
      case "OPENAI":
        batchVectors = await callOpenAI(resolved.accessToken, batch);
        break;
      case "VOYAGE":
        batchVectors = await callVoyage(resolved.accessToken, batch);
        break;
      case "COHERE":
        batchVectors = await callCohere(resolved.accessToken, batch);
        break;
      case "JINA":
        batchVectors = await callJina(resolved.accessToken, batch);
        break;
      case "BGE":
        batchVectors = await callBge(resolved.accessToken, batch);
        break;
    }
    vectors.push(...batchVectors);
  }

  // Real per-call AI usage metering (Phase 19's AI Credit System) — embedding
  // providers don't uniformly return a token count in their response body,
  // so this uses the same real BPE tokenizer chunking.ts already depends on
  // (gpt-tokenizer) rather than a char-count guess. Fire-and-forget: never
  // blocks or fails the embedding call it's recording.
  void recordEmbeddingUsage(organizationId, model, texts).catch((error) => {
    console.error("[rag/embeddings] recordEmbeddingUsage failed:", error);
  });

  return { provider: resolved.provider, model, dimensions, vectors };
}

async function recordEmbeddingUsage(organizationId: string, model: string, texts: string[]): Promise<void> {
  const { encode } = await import("gpt-tokenizer");
  const totalTokens = texts.reduce((sum, text) => sum + encode(text).length, 0);
  await recordAIUsage(organizationId, "EMBEDDING", model, totalTokens, 0, "rag-embedding");
}

export async function generateEmbedding(organizationId: string, text: string, provider?: EmbeddingProvider): Promise<{ provider: EmbeddingProvider; model: string; dimensions: number; vector: number[] }> {
  const result = await generateEmbeddings(organizationId, [text], provider);
  return { provider: result.provider, model: result.model, dimensions: result.dimensions, vector: result.vectors[0] };
}
