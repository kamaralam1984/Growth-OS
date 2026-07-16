import { prisma } from "@/lib/prisma";
import { generateEmbedding, isEmbeddingsConnected } from "./embeddings";
import { semanticSearch } from "./vector-store";
import { decryptMemory } from "@/lib/ai/encryption";
import type { EmbeddingSourceType } from "@/generated/prisma/client";

/**
 * Hybrid retrieval — the shared read path every RAG consumer (Enterprise
 * Search, the Context Engine, AI Memory recall) calls into, so ranking
 * behavior is defined exactly once. Real semantic search (cosine similarity
 * over actual embeddings) when an embedding provider is connected for this
 * org; a real keyword fallback (Prisma `contains`, same pattern
 * src/lib/search.ts's globalSearch already uses elsewhere in this app) when
 * it isn't — so retrieval degrades gracefully instead of failing outright
 * when no embeddings provider has been configured yet.
 */

export interface RetrievedItem {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  title: string;
  snippet: string;
  score: number;
  href: string | null;
  isSemanticMatch: boolean;
}

const SNIPPET_LENGTH = 280;

function toSnippet(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > SNIPPET_LENGTH ? `${trimmed.slice(0, SNIPPET_LENGTH)}…` : trimmed;
}

async function resolveKnowledgeArticles(organizationId: string, ids: string[]): Promise<Map<string, { title: string; snippet: string; href: string }>> {
  if (ids.length === 0) return new Map();
  const articles = await prisma.knowledgeArticle.findMany({
    where: { id: { in: ids }, knowledgeBase: { workspace: { organizationId } } },
    select: { id: true, title: true, content: true },
  });
  return new Map(articles.map((a) => [a.id, { title: a.title, snippet: toSnippet(a.content), href: `/dashboard/knowledge-base/${a.id}` }]));
}

async function resolveAgentMemories(organizationId: string, ids: string[]): Promise<Map<string, { title: string; snippet: string; href: string | null }>> {
  if (ids.length === 0) return new Map();
  const memories = await prisma.agentMemory.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, type: true, encryptedContent: true, agent: { select: { name: true } } },
  });
  return new Map(
    memories.map((m) => {
      let content = "";
      try {
        content = decryptMemory(m.encryptedContent);
      } catch {
        content = "(memory could not be decrypted)";
      }
      return [m.id, { title: `${m.agent.name} memory — ${m.type}`, snippet: toSnippet(content), href: null }];
    }),
  );
}

async function resolveDocumentChunks(organizationId: string, ids: string[]): Promise<Map<string, { title: string; snippet: string; href: string | null }>> {
  if (ids.length === 0) return new Map();
  const chunks = await prisma.documentChunk.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, content: true, ingestedDocument: { select: { title: true, id: true } } },
  });
  return new Map(chunks.map((c) => [c.id, { title: c.ingestedDocument.title, snippet: toSnippet(c.content), href: `/dashboard/knowledge-base/documents/${c.ingestedDocument.id}` }]));
}

async function keywordFallback(organizationId: string, query: string, sourceTypes: EmbeddingSourceType[], limit: number): Promise<RetrievedItem[]> {
  const results: RetrievedItem[] = [];

  if (sourceTypes.includes("KNOWLEDGE_ARTICLE")) {
    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        knowledgeBase: { workspace: { organizationId } },
        status: "PUBLISHED",
        OR: [{ title: { contains: query, mode: "insensitive" } }, { content: { contains: query, mode: "insensitive" } }],
      },
      select: { id: true, title: true, content: true },
      take: limit,
    });
    results.push(...articles.map((a) => ({
      sourceType: "KNOWLEDGE_ARTICLE" as const,
      sourceId: a.id,
      title: a.title,
      snippet: toSnippet(a.content),
      score: 0.5,
      href: `/dashboard/knowledge-base/${a.id}`,
      isSemanticMatch: false,
    })));
  }

  if (sourceTypes.includes("DOCUMENT_CHUNK")) {
    const chunks = await prisma.documentChunk.findMany({
      where: { organizationId, content: { contains: query, mode: "insensitive" } },
      select: { id: true, content: true, ingestedDocument: { select: { title: true, id: true } } },
      take: limit,
    });
    results.push(...chunks.map((c) => ({
      sourceType: "DOCUMENT_CHUNK" as const,
      sourceId: c.id,
      title: c.ingestedDocument.title,
      snippet: toSnippet(c.content),
      score: 0.5,
      href: `/dashboard/knowledge-base/documents/${c.ingestedDocument.id}`,
      isSemanticMatch: false,
    })));
  }

  return results;
}

export interface RetrievalOptions {
  sourceTypes?: EmbeddingSourceType[];
  topK?: number;
}

const DEFAULT_SOURCE_TYPES: EmbeddingSourceType[] = ["KNOWLEDGE_ARTICLE", "DOCUMENT_CHUNK", "AGENT_MEMORY"];

/**
 * Real hybrid retrieval over this org's actual knowledge — never returns a
 * fabricated result. An empty array is an honest, valid answer ("no
 * verified knowledge exists"), not an error.
 */
export async function retrieveContext(organizationId: string, query: string, options: RetrievalOptions = {}): Promise<RetrievedItem[]> {
  const sourceTypes = options.sourceTypes ?? DEFAULT_SOURCE_TYPES;
  const topK = options.topK ?? 8;
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const connected = await isEmbeddingsConnected(organizationId);
  if (!connected) {
    return keywordFallback(organizationId, trimmedQuery, sourceTypes, topK);
  }

  const { vector } = await generateEmbedding(organizationId, trimmedQuery);
  const matches = await semanticSearch(organizationId, sourceTypes, vector, topK);
  if (matches.length === 0) return [];

  const idsByType = new Map<EmbeddingSourceType, string[]>();
  for (const match of matches) {
    idsByType.set(match.sourceType, [...(idsByType.get(match.sourceType) ?? []), match.sourceId]);
  }

  const [articleMap, memoryMap, chunkMap] = await Promise.all([
    resolveKnowledgeArticles(organizationId, idsByType.get("KNOWLEDGE_ARTICLE") ?? []),
    resolveAgentMemories(organizationId, idsByType.get("AGENT_MEMORY") ?? []),
    resolveDocumentChunks(organizationId, idsByType.get("DOCUMENT_CHUNK") ?? []),
  ]);

  const resolverByType: Record<EmbeddingSourceType, Map<string, { title: string; snippet: string; href: string | null }>> = {
    KNOWLEDGE_ARTICLE: articleMap,
    AGENT_MEMORY: memoryMap,
    DOCUMENT_CHUNK: chunkMap,
  };

  const items: RetrievedItem[] = [];
  for (const match of matches) {
    const resolved = resolverByType[match.sourceType].get(match.sourceId);
    if (!resolved) continue; // real record no longer exists (deleted since embedding was written) — skip rather than show a dangling result
    items.push({ sourceType: match.sourceType, sourceId: match.sourceId, title: resolved.title, snippet: resolved.snippet, score: match.score, href: resolved.href, isSemanticMatch: true });
  }
  return items;
}
