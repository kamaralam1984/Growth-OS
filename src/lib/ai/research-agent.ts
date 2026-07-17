import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateText, generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { AINotConnectedError, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { MarketTrendSnapshot, Prisma } from "@/generated/prisma/client";

/**
 * Research Agent — an ad-hoc, on-demand version of discoverMarketTrends()
 * (src/lib/market-intelligence/trend-discovery.ts). Same real two-pass
 * web-search-then-extract discipline and the same MarketTrendSnapshot
 * model, but scoped to a specific company/topic named by the caller instead
 * of the org's own industry, and tagged via the (additive) `topic` field so
 * it's distinguishable from the org's own scheduled snapshots. The
 * scheduled discoverMarketTrends() itself is untouched — this is a sibling,
 * not a modification.
 */

const MAX_FINDINGS = 5;

const FindingSchema = z.object({
  title: z.string(),
  description: z.string(),
  signalStrength: z.enum(["EMERGING", "GROWING", "ESTABLISHED"]),
  evidenceUrls: z.array(z.string()).max(3).default([]),
});
export type ResearchFinding = z.infer<typeof FindingSchema>;

const OpportunitySchema = z.object({
  title: z.string(),
  description: z.string(),
  relatedFindingTitle: z.string(),
});
export type ResearchOpportunity = z.infer<typeof OpportunitySchema>;

const ResearchResponseSchema = z.object({
  findings: z.array(FindingSchema).max(MAX_FINDINGS).default([]),
  opportunities: z.array(OpportunitySchema).max(MAX_FINDINGS).default([]),
});

export async function generateResearchBrief(organizationId: string, topic: string): Promise<MarketTrendSnapshot> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const persona = getPersona("RESEARCH");

  const searchResult = await generateText({
    system: `${persona.systemPrompt}\n\nYou have live web search available. Only report real, currently-relevant findings that genuinely appear in your search results — never invent a plausible-sounding fact.`,
    userContent: `Search the web and research: "${topic}". Find up to ${MAX_FINDINGS} real, current findings — this could be company facts, industry trends, competitor intelligence, or technology adoption signals, whichever are genuinely relevant to this topic. For each, note the likely signal strength (EMERGING/GROWING/ESTABLISHED) and, where available, source URLs.`,
    maxTokens: 3072,
    webSearch: { maxUses: 5 },
  });
  await recordAIUsage(organizationId, searchResult.provider, searchResult.model, searchResult.inputTokens, searchResult.outputTokens, "research-agent:search");

  if (!searchResult.text.trim()) {
    return prisma.marketTrendSnapshot.create({
      data: { organizationId, topic, industry: null, trends: [], opportunities: [] },
    });
  }

  const extraction = await generateStructured({
    system: `Extract a clean, deduplicated list of at most ${MAX_FINDINGS} real findings from these research notes, plus any opportunities each finding suggests. Only include a finding that was actually named in the notes — never invent one. If nothing usable was found, return empty lists.`,
    userContent: searchResult.text,
    maxTokens: 2048,
    effort: "low",
    schema: ResearchResponseSchema,
  });
  await recordAIUsage(organizationId, extraction.provider, extraction.model, extraction.inputTokens, extraction.outputTokens, "research-agent:extract");

  return prisma.marketTrendSnapshot.create({
    data: {
      organizationId,
      topic,
      industry: null,
      trends: extraction.parsed.findings.slice(0, MAX_FINDINGS) as unknown as Prisma.InputJsonValue,
      opportunities: extraction.parsed.opportunities.slice(0, MAX_FINDINGS) as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function listResearchBriefs(organizationId: string, take = 20): Promise<MarketTrendSnapshot[]> {
  return prisma.marketTrendSnapshot.findMany({
    where: { organizationId, topic: { not: null } },
    orderBy: { createdAt: "desc" },
    take,
  });
}
