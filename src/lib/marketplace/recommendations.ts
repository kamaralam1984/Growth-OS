import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import { AINotConnectedError, isAIConnected } from "@/lib/ai/client";
import { getPersona } from "@/lib/ai/personas";
import type { MarketplaceListing } from "@/generated/prisma/client";

const MAX_CANDIDATES = 15;
const MAX_RECOMMENDATIONS = 5;

/**
 * Deterministic pre-filter — real DB query, no AI. Excludes already-installed
 * listings, and ranks candidates by a real industryTags overlap with the
 * org's own real Organization.industry/companySize, falling back to
 * installCount when there's no industry signal to match on. This is the
 * candidate SET the AI pass below is constrained to — it can never
 * recommend a listing outside this real, already-fetched list.
 */
export async function prefilterListings(organizationId: string): Promise<MarketplaceListing[]> {
  const [organization, installedListingIds] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { industry: true, companySize: true } }),
    prisma.marketplaceInstall.findMany({ where: { organizationId, status: "ACTIVE" }, select: { listingId: true } }),
  ]);

  const excludeIds = installedListingIds.map((i) => i.listingId);

  const candidates = await prisma.marketplaceListing.findMany({
    where: {
      status: { in: ["AVAILABLE", "PUBLISHED"] },
      id: { notIn: excludeIds.length > 0 ? excludeIds : undefined },
      // Real, installable Phase 19 listings all have a slug — excludes the
      // legacy stub rows that have no manifest to install.
      slug: { not: null },
    },
    orderBy: [{ installCount: "desc" }, { ratingAverage: "desc" }],
    take: 40,
  });

  const industry = organization?.industry?.toUpperCase();
  const scored = candidates.map((listing) => {
    const industryMatch = industry && listing.industryTags.some((t) => t.toUpperCase() === industry);
    return { listing, score: (industryMatch ? 100 : 0) + listing.installCount + listing.ratingAverage * 5 };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_CANDIDATES).map((s) => s.listing);
}

const RecommendationItemSchema = z.object({
  listingId: z.string(),
  reason: z.string().trim().min(1).max(300),
});
const RecommendationsResponseSchema = z.object({ recommendations: z.array(RecommendationItemSchema).max(MAX_RECOMMENDATIONS) });

export interface MarketplaceRecommendation {
  listing: MarketplaceListing;
  reason: string;
}

/**
 * Real AI call (same generateStructured/getPersona/recordAIUsage discipline
 * as insights-generator.ts), constrained to the pre-filtered candidate set
 * above. Every returned listingId is re-validated against that real set
 * afterward — a hallucinated id is dropped, never surfaced (same defense
 * auto-configure.ts uses for hallucinated template names). Throws
 * AINotConnectedError if no provider is configured — callers must show an
 * honest empty state, never fake recommendations.
 */
export async function generateMarketplaceRecommendations(organizationId: string): Promise<MarketplaceRecommendation[]> {
  if (!isAIConnected()) throw new AINotConnectedError();

  const candidates = await prefilterListings(organizationId);
  if (candidates.length === 0) return [];

  const [organization, installedListings] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, industry: true, companySize: true } }),
    prisma.marketplaceInstall.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { listing: { select: { name: true, category: true } } },
      take: 10,
    }),
  ]);

  const candidateList = candidates
    .map((c) => `- id="${c.id}" | ${c.name} (${c.category}) | ${c.tagline ?? c.description.slice(0, 100)} | tags: ${c.industryTags.join(", ") || "none"}`)
    .join("\n");
  const installedList = installedListings.length > 0 ? installedListings.map((i) => `- ${i.listing.name} (${i.listing.category})`).join("\n") : "None yet.";

  const persona = getPersona("CEO");
  const result = await generateStructured({
    system: `${persona.systemPrompt}\n\nYou are recommending Marketplace listings for this organization. You may ONLY recommend a listing whose exact id appears in the candidate list given below — never invent an id or recommend anything not in that list. Ground every reason in the organization's real industry/size and what it has already installed.`,
    userContent: `Organization: ${organization?.name ?? "Unknown"}, industry: ${organization?.industry ?? "not set"}, size: ${organization?.companySize ?? "not set"}.\n\nAlready installed:\n${installedList}\n\nReal candidate listings (id | name | category | description | tags):\n${candidateList}\n\nRecommend up to ${MAX_RECOMMENDATIONS} of these candidates, each with a one-sentence reason grounded in the organization's real profile above.`,
    maxTokens: 1536,
    effort: "low",
    schema: RecommendationsResponseSchema,
  });
  await recordAIUsage(organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "marketplace:recommendations");

  const candidateIds = new Set(candidates.map((c) => c.id));
  const byId = new Map(candidates.map((c) => [c.id, c]));

  return result.parsed.recommendations
    .filter((r) => candidateIds.has(r.listingId)) // drop any hallucinated id — never surface a listing outside the real candidate set
    .map((r) => ({ listing: byId.get(r.listingId)!, reason: r.reason }));
}
