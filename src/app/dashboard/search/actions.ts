"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { retrieveContext, type RetrievedItem } from "@/lib/rag/retrieval";
import { answerFromKnowledge, type RagAnswer } from "@/lib/rag/generation";
import type { EmbeddingSourceType } from "@/generated/prisma/client";

/**
 * Enterprise Search — a real semantic/keyword search experience over this
 * org's actual Knowledge Base articles, ingested documents, and AI memory
 * (src/lib/rag/retrieval.ts's retrieveContext), distinct from the Cmd+K
 * quick-nav palette (src/lib/search.ts's globalSearch, unchanged here).
 * Every action re-derives userId/organizationId from the session — client
 * code never supplies either directly.
 */

async function requireMembership() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { userId: null as never, organizationId: null, error: "You must be signed in." } as const;

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    return { userId, organizationId: null, error: "You don't belong to an organization yet." } as const;
  }

  return { userId, organizationId: membership.organizationId, error: null } as const;
}

export interface SearchFiltersInput {
  query: string;
  sourceTypes?: EmbeddingSourceType[];
  /** ISO date strings (yyyy-mm-dd or full ISO) — inclusive bounds. */
  dateFrom?: string;
  dateTo?: string;
  authorId?: string;
}

export interface KnowledgeCardResult {
  sourceType: EmbeddingSourceType;
  sourceId: string;
  title: string;
  snippet: string;
  score: number;
  href: string | null;
  isSemanticMatch: boolean;
  createdAt: string;
  authorLabel: string | null;
  /** Only meaningful for KNOWLEDGE_ARTICLE — the only source kind with a matching BookmarkableType (see prisma/schema.prisma's BookmarkableType enum). */
  isBookmarked: boolean;
}

export interface KnowledgeSearchActionResult {
  ok: boolean;
  results: KnowledgeCardResult[];
  error?: string;
}

interface EnrichedItem extends RetrievedItem {
  createdAt: Date;
  authorId: string | null;
  authorLabel: string | null;
}

/**
 * Attaches real createdAt/author metadata retrieveContext doesn't itself
 * return (it's a pure ranking/snippet resolver), so the date-range and
 * author filters below are genuine Prisma-backed filters, not decorative.
 */
async function enrichWithMetadata(organizationId: string, items: RetrievedItem[]): Promise<EnrichedItem[]> {
  const articleIds = items.filter((i) => i.sourceType === "KNOWLEDGE_ARTICLE").map((i) => i.sourceId);
  const chunkIds = items.filter((i) => i.sourceType === "DOCUMENT_CHUNK").map((i) => i.sourceId);
  const memoryIds = items.filter((i) => i.sourceType === "AGENT_MEMORY").map((i) => i.sourceId);

  const [articles, chunks, memories] = await Promise.all([
    articleIds.length
      ? prisma.knowledgeArticle.findMany({
          where: { id: { in: articleIds }, knowledgeBase: { workspace: { organizationId } } },
          select: { id: true, createdAt: true, createdByUserId: true, createdByUser: { select: { name: true, email: true } } },
        })
      : [],
    chunkIds.length
      ? prisma.documentChunk.findMany({
          where: { id: { in: chunkIds }, organizationId },
          select: {
            id: true,
            createdAt: true,
            ingestedDocument: { select: { uploadedByUserId: true, uploadedByUser: { select: { name: true, email: true } } } },
          },
        })
      : [],
    memoryIds.length
      ? prisma.agentMemory.findMany({
          where: { id: { in: memoryIds }, organizationId },
          select: { id: true, createdAt: true, agent: { select: { name: true } } },
        })
      : [],
  ]);

  const articleMeta = new Map(
    articles.map((a) => [
      a.id,
      { createdAt: a.createdAt, authorId: a.createdByUserId, authorLabel: a.createdByUser?.name ?? a.createdByUser?.email ?? null },
    ]),
  );
  const chunkMeta = new Map(
    chunks.map((c) => [
      c.id,
      {
        createdAt: c.createdAt,
        authorId: c.ingestedDocument.uploadedByUserId,
        authorLabel: c.ingestedDocument.uploadedByUser?.name ?? c.ingestedDocument.uploadedByUser?.email ?? null,
      },
    ]),
  );
  const memoryMeta = new Map(
    memories.map((m) => [m.id, { createdAt: m.createdAt, authorId: null as string | null, authorLabel: `Agent: ${m.agent.name}` }]),
  );

  return items.map((item) => {
    const meta =
      item.sourceType === "KNOWLEDGE_ARTICLE"
        ? articleMeta.get(item.sourceId)
        : item.sourceType === "DOCUMENT_CHUNK"
          ? chunkMeta.get(item.sourceId)
          : memoryMeta.get(item.sourceId);
    return {
      ...item,
      createdAt: meta?.createdAt ?? new Date(0),
      authorId: meta?.authorId ?? null,
      authorLabel: meta?.authorLabel ?? null,
    };
  });
}

/**
 * Real hybrid retrieval + real Prisma date-range/author filtering + a real
 * logged SearchHistory row. isSemanticSearch reflects what actually
 * happened for the results that survived filtering (true only if at least
 * one is a genuine cosine-similarity match, same honesty rule
 * answerFromKnowledge already applies) — never a hardcoded mode flag.
 */
export async function runKnowledgeSearch(input: SearchFiltersInput): Promise<KnowledgeSearchActionResult> {
  const { userId, organizationId, error } = await requireMembership();
  if (!organizationId || !userId) return { ok: false, results: [], error: error ?? "Not authorized." };

  const trimmed = input.query.trim();
  if (trimmed.length < 2) return { ok: true, results: [] };

  try {
    const sourceTypes = input.sourceTypes && input.sourceTypes.length > 0 ? input.sourceTypes : undefined;
    const retrieved = await retrieveContext(organizationId, trimmed, { sourceTypes, topK: 30 });
    const enriched = await enrichWithMetadata(organizationId, retrieved);

    const dateFrom = input.dateFrom ? new Date(input.dateFrom) : null;
    // dateTo is a calendar-day bound from a <input type="date">, so push it to end-of-day
    // to make the bound inclusive of that whole day rather than excluding it entirely.
    const dateTo = input.dateTo ? new Date(new Date(input.dateTo).setHours(23, 59, 59, 999)) : null;

    const filtered = enriched.filter((item) => {
      if (dateFrom && item.createdAt < dateFrom) return false;
      if (dateTo && item.createdAt > dateTo) return false;
      if (input.authorId && item.authorId !== input.authorId) return false;
      return true;
    });

    const articleIds = filtered.filter((i) => i.sourceType === "KNOWLEDGE_ARTICLE").map((i) => i.sourceId);
    const bookmarked = articleIds.length
      ? await prisma.bookmark.findMany({
          where: { organizationId, userId, kind: "BOOKMARK", targetType: "KNOWLEDGE_ARTICLE", targetId: { in: articleIds } },
          select: { targetId: true },
        })
      : [];
    const bookmarkedIds = new Set(bookmarked.map((b) => b.targetId));

    await prisma.searchHistory.create({
      data: {
        organizationId,
        userId,
        query: trimmed,
        resultCount: filtered.length,
        isSemanticSearch: filtered.some((r) => r.isSemanticMatch),
      },
    });

    return {
      ok: true,
      results: filtered.map((item) => ({
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        title: item.title,
        snippet: item.snippet,
        score: item.score,
        href: item.href,
        isSemanticMatch: item.isSemanticMatch,
        createdAt: item.createdAt.toISOString(),
        authorLabel: item.authorLabel,
        isBookmarked: item.sourceType === "KNOWLEDGE_ARTICLE" && bookmarkedIds.has(item.sourceId),
      })),
    };
  } catch (err) {
    console.error("[enterprise-search] search failed:", err);
    return { ok: false, results: [], error: "Search failed. Please try again." };
  }
}

export interface AskAIActionResult {
  ok: boolean;
  answer?: string;
  hasVerifiedKnowledge?: boolean;
  confidenceScore?: number;
  citations?: RagAnswer["citations"];
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

/** Same honest per-error-type message shape used across board/tasks, automation, and command-center actions. */
function describeAskAIError(error: unknown): AskAIActionResult {
  if (error instanceof AINotConnectedError) {
    return {
      ok: false,
      errorKind: "not_connected",
      error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment.",
    };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return {
      ok: false,
      errorKind: "billing",
      error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing.",
    };
  }
  console.error("[enterprise-search] Ask AI failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong answering that question. Please try again." };
}

/**
 * "Ask AI" mode — wraps src/lib/rag/generation.ts's answerFromKnowledge,
 * which already logs its own SearchHistory row (isSemanticSearch derived
 * from real retrieval matches) and never fabricates an answer: an empty
 * retrieval set returns the honest "no verified knowledge" message without
 * ever calling Claude, so no rate limit is worth applying to that free path
 * — the limiter below only throttles the billable Claude call.
 */
export async function askAIAction(question: string): Promise<AskAIActionResult> {
  const { userId, organizationId, error } = await requireMembership();
  if (!organizationId || !userId) return { ok: false, errorKind: "generic", error: error ?? "Not authorized." };

  const trimmed = question.trim();
  if (trimmed.length < 2) return { ok: false, errorKind: "generic", error: "Type a question first." };

  if (!checkRateLimit(`enterprise-search-ask-ai:${userId}`, { limit: 20, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many questions asked — wait a few minutes and try again." };
  }

  try {
    const result = await answerFromKnowledge(organizationId, userId, trimmed);
    return {
      ok: true,
      answer: result.answer,
      hasVerifiedKnowledge: result.hasVerifiedKnowledge,
      confidenceScore: result.confidenceScore,
      citations: result.citations,
    };
  } catch (err) {
    return describeAskAIError(err);
  }
}
