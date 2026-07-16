import { randomUUID } from "node:crypto";

import { isAIConnected, AINotConnectedError } from "@/lib/ai/client";
import { generateText } from "@/lib/ai/fallback";
import { prisma } from "@/lib/prisma";
import { retrieveContext, type RetrievedItem } from "./retrieval";
import type { Prisma } from "@/generated/prisma/client";

/**
 * RAG answer generation — the never-fabricate contract required by this
 * phase: an answer is only ever generated from real retrieved context
 * (retrieveContext, this org's actual Knowledge Base articles/uploaded
 * documents/agent memory), every answer's `citations` point at real
 * Citation rows backed by real source records, and `confidenceScore` is
 * derived from real retrieval scores rather than an LLM self-report (an
 * LLM asked "how confident are you" tends to be overconfident and is not
 * grounded in anything real). When retrieval finds nothing, this returns
 * an honest "no verified knowledge" answer without ever calling Claude —
 * there's nothing for it to ground a response in.
 */

export interface RagAnswer {
  queryId: string;
  answer: string;
  hasVerifiedKnowledge: boolean;
  confidenceScore: number;
  citations: Array<{ sourceType: RetrievedItem["sourceType"]; sourceId: string; title: string; snippet: string; href: string | null; relevanceScore: number }>;
}

const NO_KNOWLEDGE_ANSWER =
  "No verified knowledge exists in this organization's Knowledge Base, documents, or AI memory for this question. I won't guess — add relevant articles or documents, or connect an embedding provider for better recall, then ask again.";

function averageScore(items: RetrievedItem[]): number {
  if (items.length === 0) return 0;
  return items.reduce((sum, i) => sum + i.score, 0) / items.length;
}

/**
 * Answers a natural-language question using only this org's verified
 * knowledge. Persists Citation rows (grouped by the returned `queryId`) and
 * a SearchHistory row for every real call — never a preview-only,
 * unlogged path, matching this app's existing audit discipline.
 */
export async function answerFromKnowledge(organizationId: string, userId: string, question: string): Promise<RagAnswer> {
  const queryId = randomUUID();
  const trimmedQuestion = question.trim();

  const retrieved = await retrieveContext(organizationId, trimmedQuestion, { topK: 8 });

  await prisma.searchHistory.create({
    data: { organizationId, userId, query: trimmedQuestion, resultCount: retrieved.length, isSemanticSearch: retrieved.some((r) => r.isSemanticMatch) },
  });

  if (retrieved.length === 0) {
    return { queryId, answer: NO_KNOWLEDGE_ANSWER, hasVerifiedKnowledge: false, confidenceScore: 0, citations: [] };
  }

  if (!isAIConnected()) throw new AINotConnectedError();

  const contextBlock = retrieved
    .map((item, index) => `[Source ${index + 1}] ${item.title}\n${item.snippet}`)
    .join("\n\n");

  const systemPrompt = `You are the KVL GrowthOS Knowledge Assistant. Answer the user's question using ONLY the numbered sources provided below — never use outside knowledge, never invent facts, and never fill gaps with assumptions. Cite every claim with its source number like [Source 2]. If the sources only partially answer the question, say exactly what's missing. If the sources don't answer the question at all, say so plainly instead of guessing.

Sources:
${contextBlock}`;

  const result = await generateText({
    system: systemPrompt,
    userContent: trimmedQuestion,
    maxTokens: 1024,
  });
  const answerText = result.text;

  const citationRows: Prisma.CitationCreateManyInput[] = retrieved.map((item) => ({
    organizationId,
    queryId,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    snippet: item.snippet,
    relevanceScore: item.score,
  }));
  await prisma.citation.createMany({ data: citationRows });

  // Confidence is the real average retrieval score of the sources actually
  // used — grounded in retrieval quality, not an LLM's self-assessment.
  // Keyword-fallback matches carry a fixed, documented 0.5 score (see
  // retrieval.ts's keywordFallback) rather than a cosine similarity, since
  // no embedding provider is connected in that path.
  const confidenceScore = Math.round(averageScore(retrieved) * 100) / 100;

  return {
    queryId,
    answer: answerText,
    hasVerifiedKnowledge: true,
    confidenceScore,
    citations: retrieved.map((item) => ({ sourceType: item.sourceType, sourceId: item.sourceId, title: item.title, snippet: item.snippet, href: item.href, relevanceScore: item.score })),
  };
}
