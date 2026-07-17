import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateStructured, generateText } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { runWebsiteScan } from "@/lib/scanner/run-scan";
import type { Prisma, SEOAudit, SeoKeywordResearch } from "@/generated/prisma/client";

export interface RunSeoAuditParams {
  organizationId: string;
  createdByUserId: string;
  url: string;
  companyNameInput?: string | null;
  industryInput?: string | null;
}

export interface RunSeoAuditResult {
  ok: boolean;
  scanId: string;
  seoAudit: SEOAudit | null;
  errorMessage?: string;
}

/**
 * SEO Agent's audit entrypoint — creates a real WebsiteScan row and runs the
 * existing, unmodified scan pipeline (runWebsiteScan). Performance/Security/
 * UX/Opportunity are computed as a byproduct of the same real scan, exactly
 * as they are for a manual Website Scanner run; the SEO Agent surfaces the
 * SEOAudit section specifically, but nothing here duplicates the scanner.
 */
export async function runSeoAudit(params: RunSeoAuditParams): Promise<RunSeoAuditResult> {
  const scan = await prisma.websiteScan.create({
    data: {
      organizationId: params.organizationId,
      createdByUserId: params.createdByUserId,
      url: params.url,
      companyNameInput: params.companyNameInput || null,
      industryInput: params.industryInput || null,
      status: "PENDING",
    },
  });

  const result = await runWebsiteScan(scan.id);
  const seoAudit = await prisma.sEOAudit.findUnique({ where: { scanId: scan.id } });

  return {
    ok: result.ok,
    scanId: scan.id,
    seoAudit,
    errorMessage: result.ok ? undefined : "Could not scan that website — check the URL and try again.",
  };
}

const MAX_KEYWORDS = 15;

const KeywordSchema = z.object({
  keyword: z.string(),
  intent: z.string().nullable(),
  estimatedDifficulty: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable(),
  evidenceNote: z.string().nullable(),
});
export type SeoKeyword = z.infer<typeof KeywordSchema>;

const KeywordsSchema = z.object({
  keywords: z.array(KeywordSchema).max(MAX_KEYWORDS).default([]),
});

/**
 * Two-pass web-search-then-extract keyword research — same pattern as
 * discoverCompetitors() (Company Understanding Engine). Every keyword is
 * tagged verificationMethod: "ai-web-search" on the persisted row; the UI
 * must never present this as a deterministic ranking-tool result.
 */
export async function researchKeywords(params: { organizationId: string; topic: string }): Promise<SeoKeywordResearch> {
  const searchResult = await generateText({
    system:
      "You are an SEO keyword researcher with live web search available. Only surface keywords that genuinely appear relevant based on real search results for this topic — never invent search-volume or ranking-difficulty numbers you cannot ground in what you observed.",
    userContent: `Search the web and identify up to ${MAX_KEYWORDS} real, relevant SEO keywords/phrases for the topic: "${params.topic}". For each, note the likely searcher intent (informational/commercial/navigational/transactional), a rough estimated difficulty (LOW/MEDIUM/HIGH) based on how competitive the ranking results look, and a short evidence note referencing what you observed in search results.`,
    maxTokens: 3072,
    webSearch: { maxUses: 5 },
  });
  await recordAIUsage(
    params.organizationId,
    searchResult.provider,
    searchResult.model,
    searchResult.inputTokens,
    searchResult.outputTokens,
    "seo-agent:keyword-search",
  );

  if (!searchResult.text.trim()) {
    return prisma.seoKeywordResearch.create({
      data: { organizationId: params.organizationId, topic: params.topic, keywords: [] },
    });
  }

  const extraction = await generateStructured({
    system: `Extract a clean, deduplicated list of at most ${MAX_KEYWORDS} real SEO keywords from these research notes. Only include a keyword that was actually surfaced in the notes — never invent one. If nothing usable was found, return an empty list.`,
    userContent: searchResult.text,
    maxTokens: 2048,
    effort: "low",
    schema: KeywordsSchema,
  });
  await recordAIUsage(
    params.organizationId,
    extraction.provider,
    extraction.model,
    extraction.inputTokens,
    extraction.outputTokens,
    "seo-agent:keyword-extract",
  );

  return prisma.seoKeywordResearch.create({
    data: {
      organizationId: params.organizationId,
      topic: params.topic,
      keywords: extraction.parsed.keywords as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function listKeywordResearch(organizationId: string, take = 20): Promise<SeoKeywordResearch[]> {
  return prisma.seoKeywordResearch.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take });
}
