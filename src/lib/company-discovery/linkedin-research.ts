import { z } from "zod";

import { generateStructured, generateText } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";

/**
 * Step 4 (LinkedIn Company Analysis) — deliberately NOT a scraper. LinkedIn's
 * terms of service prohibit automated data collection from company pages, and
 * no public API exposes employee count / followers / hiring trends without a
 * paid partner integration. Instead this reuses the exact same primitive
 * Lead Finder / Company Intelligence already use (Claude's native web-search
 * tool via generateText), restricted to publicly-indexed information. Any
 * field the search genuinely can't surface stays `null` — the pipeline marks
 * it in `unknownFields`, never guesses a number.
 */

const LinkedInInsightsSchema = z.object({
  companyName: z.string().nullable(),
  industry: z.string().nullable(),
  companySizeRange: z.string().nullable(),
  employeeCountEstimate: z.string().nullable(),
  followers: z.string().nullable(),
  headquarters: z.string().nullable(),
  specialties: z.array(z.string()).max(10).default([]),
  hiringTrends: z.string().nullable(),
  growthTrends: z.string().nullable(),
  culture: z.string().nullable(),
  businessFocus: z.string().nullable(),
  publicDescription: z.string().nullable(),
});
export type LinkedInInsights = z.infer<typeof LinkedInInsightsSchema>;

export interface LinkedInResearchResult {
  insights: LinkedInInsights | null;
  unknownFields: string[];
}

export async function researchLinkedInCompany(params: {
  organizationId: string;
  linkedinUrl: string;
  companyName?: string;
}): Promise<LinkedInResearchResult> {
  const searchResult = await generateText({
    system:
      "You are a market-intelligence researcher. You have live web search available. Only report information that is genuinely publicly indexed and findable via search — never invent numbers or facts, never access private or login-gated pages, never bypass any platform's access restrictions or terms of service. If reliable information for something cannot be found, say so explicitly rather than guessing or estimating.",
    userContent: [
      `Search the web for publicly available information about this company's LinkedIn presence: ${params.linkedinUrl}`,
      params.companyName ? `The company's name is "${params.companyName}".` : null,
      "Report whatever is genuinely findable: industry, company size / employee count range, follower count, headquarters, specialties, hiring trends, growth trends, culture, and business focus. For anything you cannot verify via a real search result, explicitly say \"not found\" rather than guessing.",
    ]
      .filter(Boolean)
      .join(" "),
    maxTokens: 2048,
    webSearch: { maxUses: 5 },
  });

  await recordAIUsage(
    params.organizationId,
    searchResult.provider,
    searchResult.model,
    searchResult.inputTokens,
    searchResult.outputTokens,
    "company-discovery:linkedin-search",
  );

  if (!searchResult.text.trim()) {
    return { insights: null, unknownFields: ["linkedinInsights"] };
  }

  const extraction = await generateStructured({
    system:
      "Extract a structured LinkedIn company profile from these research notes. Every field must be null unless the notes genuinely contain that specific fact — never infer, round, or estimate a number that wasn't actually reported in the notes.",
    userContent: searchResult.text,
    maxTokens: 1536,
    effort: "low",
    schema: LinkedInInsightsSchema,
  });

  await recordAIUsage(
    params.organizationId,
    extraction.provider,
    extraction.model,
    extraction.inputTokens,
    extraction.outputTokens,
    "company-discovery:linkedin-extract",
  );

  const unknownFields = Object.entries(extraction.parsed)
    .filter(([, value]) => value === null || (Array.isArray(value) && value.length === 0))
    .map(([key]) => `linkedinInsights.${key}`);

  return { insights: extraction.parsed, unknownFields };
}
