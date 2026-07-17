import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateText, generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import type { MarketTrendSnapshot, Prisma } from "@/generated/prisma/client";

/**
 * Market Trend Intelligence — same two-pass web-search-then-extract
 * discipline as discoverCompetitors() (src/lib/company-discovery/
 * competitor-discovery.ts). Every trend is stamped verificationMethod:
 * "ai-web-search" and must be rendered under the same explicit
 * "not independently verified" badge — never presented as confirmed fact.
 */

const MAX_TRENDS = 5;

const TrendSchema = z.object({
  title: z.string(),
  description: z.string(),
  signalStrength: z.enum(["EMERGING", "GROWING", "ESTABLISHED"]),
  evidenceUrls: z.array(z.string()).max(3).default([]),
});
export type MarketTrend = z.infer<typeof TrendSchema>;

const OpportunitySchema = z.object({
  title: z.string(),
  description: z.string(),
  relatedTrendTitle: z.string(),
});

const TrendsResponseSchema = z.object({
  trends: z.array(TrendSchema).max(MAX_TRENDS).default([]),
  opportunities: z.array(OpportunitySchema).max(MAX_TRENDS).default([]),
});

export async function discoverMarketTrends(organizationId: string): Promise<MarketTrendSnapshot> {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { industry: true, clientTypes: true, countriesServed: true },
  });

  const searchResult = await generateText({
    system:
      "You are a market-intelligence researcher with live web search available. Only report real, currently-relevant trends that genuinely appear in your search results — never invent a plausible-sounding trend.",
    userContent: [
      `Search the web and find up to ${MAX_TRENDS} real, current industry/technology/market trends relevant to a business`,
      organization.industry ? `in the "${organization.industry}" industry` : "across general B2B services",
      organization.clientTypes.length ? `serving client types like: ${organization.clientTypes.join(", ")}` : null,
      organization.countriesServed.length ? `in markets: ${organization.countriesServed.join(", ")}` : null,
      ". Cover AI adoption, software demand, digital transformation, and emerging technology adoption where relevant.",
    ]
      .filter(Boolean)
      .join(" "),
    maxTokens: 3072,
    webSearch: { maxUses: 5 },
  });
  await recordAIUsage(organizationId, searchResult.provider, searchResult.model, searchResult.inputTokens, searchResult.outputTokens, "market-intelligence:trend-search");

  if (!searchResult.text.trim()) {
    return prisma.marketTrendSnapshot.create({
      data: { organizationId, industry: organization.industry, trends: [], opportunities: [] },
    });
  }

  const extraction = await generateStructured({
    system: `Extract a clean, deduplicated list of at most ${MAX_TRENDS} real trends from these research notes, plus any org-specific opportunities each trend suggests. Only include a trend that was actually named in the notes — never invent one. If nothing usable was found, return empty lists.`,
    userContent: searchResult.text,
    maxTokens: 2048,
    effort: "low",
    schema: TrendsResponseSchema,
  });
  await recordAIUsage(organizationId, extraction.provider, extraction.model, extraction.inputTokens, extraction.outputTokens, "market-intelligence:trend-extract");

  return prisma.marketTrendSnapshot.create({
    data: {
      organizationId,
      industry: organization.industry,
      trends: extraction.parsed.trends.slice(0, MAX_TRENDS) as unknown as Prisma.InputJsonValue,
      opportunities: extraction.parsed.opportunities.slice(0, MAX_TRENDS) as unknown as Prisma.InputJsonValue,
    },
  });
}
