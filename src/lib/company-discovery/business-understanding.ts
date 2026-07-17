import { z } from "zod";

import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";

import type { BrandAssets } from "./brand-extractor";
import type { CrawledPage } from "./crawler";
import type { LinkedInInsights } from "./linkedin-research";

/**
 * Step 5 (Business Understanding) + Step 7 (Ideal Customer Profile) —
 * synthesis calls grounded strictly in real crawled content, brand facts, and
 * LinkedIn research. `confidenceScore` is the model's own honest self-report
 * (same convention as runCompanyIntelligenceTurn in agent-runtime.ts), never
 * a number computed/guessed in this code.
 */

const BusinessUnderstandingSchema = z.object({
  industry: z.string().nullable(),
  subIndustry: z.string().nullable(),
  businessModel: z.string().nullable(),
  revenueModel: z.string().nullable(),
  targetMarket: z.string().nullable(),
  countriesServed: z.array(z.string()).max(20).default([]),
  primaryServices: z.array(z.string()).max(15).default([]),
  secondaryServices: z.array(z.string()).max(15).default([]),
  products: z.array(z.string()).max(15).default([]),
  companySizeEstimate: z.string().nullable(),
  businessStage: z.string().nullable(),
  marketPosition: z.string().nullable(),
  businessMaturity: z.string().nullable(),
  brandPositioning: z.string().nullable(),
  digitalMaturity: z.string().nullable(),
  aiMaturity: z.string().nullable(),
  automationReadiness: z.string().nullable(),
  confidenceScore: z.number().min(0).max(100),
});
export type BusinessUnderstanding = z.infer<typeof BusinessUnderstandingSchema>;

const ICPSchema = z.object({
  idealIndustries: z.array(z.string()).max(10).default([]),
  idealCompanySize: z.string().nullable(),
  decisionMakers: z.array(z.string()).max(10).default([]),
  painPoints: z.array(z.string()).max(10).default([]),
  buyingBehaviour: z.string().nullable(),
  budgetRange: z.string().nullable(),
  salesCycle: z.string().nullable(),
  businessGoals: z.array(z.string()).max(10).default([]),
  preferredChannels: z.array(z.string()).max(10).default([]),
  personas: z.array(z.object({ title: z.string(), description: z.string() })).max(5).default([]),
  confidenceScore: z.number().min(0).max(100),
});
export type ICP = z.infer<typeof ICPSchema>;

function buildSourceContent(pages: CrawledPage[], brandAssets: BrandAssets, linkedinInsights: LinkedInInsights | null): string {
  const pageText = pages
    .map((p) => `## ${p.pageType.toUpperCase()} (${p.url})\n${p.parsed.visibleText.slice(0, 3000)}`)
    .join("\n\n")
    .slice(0, 24_000);

  return [
    `Real content crawled from the company's own website:\n\n${pageText || "(no page content was successfully crawled)"}`,
    `\nExtracted contact/brand facts: ${JSON.stringify(brandAssets)}`,
    linkedinInsights ? `\nPublicly-found LinkedIn info: ${JSON.stringify(linkedinInsights)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function synthesizeBusinessUnderstanding(params: {
  organizationId: string;
  pages: CrawledPage[];
  brandAssets: BrandAssets;
  linkedinInsights: LinkedInInsights | null;
}): Promise<{ businessUnderstanding: BusinessUnderstanding; icp: ICP }> {
  const sourceContent = buildSourceContent(params.pages, params.brandAssets, params.linkedinInsights);

  const understanding = await generateStructured({
    system:
      "You are a business analyst. Determine this company's business profile ONLY from the real website content and research notes given. Every field must be null (or an empty array) if the source material doesn't genuinely support it — never guess a plausible-sounding answer. confidenceScore must honestly reflect how much real, specific information the source material actually contained.",
    userContent: sourceContent,
    maxTokens: 3072,
    effort: "medium",
    schema: BusinessUnderstandingSchema,
  });
  await recordAIUsage(
    params.organizationId,
    understanding.provider,
    understanding.model,
    understanding.inputTokens,
    understanding.outputTokens,
    "company-discovery:business-understanding",
  );

  const icp = await generateStructured({
    system:
      "You are a B2B sales strategist. Based ONLY on the company profile and real website content given, propose this company's Ideal Customer Profile (ICP). This is explicitly an inference exercise (a definitive ICP requires the company's own sales data) — ground every point in something plausible from the real content given, never a generic template answer disconnected from what this specific company actually does. confidenceScore must reflect how well-grounded these inferences are.",
    userContent: `${sourceContent}\n\nBusiness understanding already determined: ${JSON.stringify(understanding.parsed)}`,
    maxTokens: 2048,
    effort: "medium",
    schema: ICPSchema,
  });
  await recordAIUsage(params.organizationId, icp.provider, icp.model, icp.inputTokens, icp.outputTokens, "company-discovery:icp");

  return { businessUnderstanding: understanding.parsed, icp: icp.parsed };
}

/** Field names left null/empty by the model — rendered as explicit "Unknown" in the review UI, never guessed. */
export function collectUnknownFields(prefix: string, obj: Record<string, unknown>): string[] {
  return Object.entries(obj)
    .filter(([key, value]) => key !== "confidenceScore" && (value === null || (Array.isArray(value) && value.length === 0)))
    .map(([key]) => `${prefix}.${key}`);
}
