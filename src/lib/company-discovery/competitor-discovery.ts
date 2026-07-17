import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateStructured, generateText } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";
import type { CompetitorSnapshot, Prisma } from "@/generated/prisma/client";

/**
 * Step 8 (Competitor Intelligence) — same two-pass web-search-then-extract
 * pattern as runWebSearchDiscovery (Lead/Client Finder). Capped at 5
 * competitors for cost control (each is a summary, not a full independent
 * site audit in v1). Every competitor is tagged `verificationMethod:
 * "ai-web-search"` on write — the review UI must never present this as
 * "verified" the way crawled facts are.
 */

const MAX_COMPETITORS = 5;

const CompetitorSchema = z.object({
  name: z.string(),
  website: z.string().nullable(),
  strengths: z.array(z.string()).max(6).default([]),
  weaknesses: z.array(z.string()).max(6).default([]),
  positioning: z.string().nullable(),
});
export type Competitor = z.infer<typeof CompetitorSchema>;

const CompetitorsSchema = z.object({
  competitors: z.array(CompetitorSchema).max(MAX_COMPETITORS).default([]),
});

export async function discoverCompetitors(params: {
  organizationId: string;
  companyName: string;
  websiteUrl: string;
  industry?: string | null;
  services?: string[];
}): Promise<Competitor[]> {
  const searchResult = await generateText({
    system:
      "You are a competitive-intelligence researcher with live web search available. Only name real, currently-operating companies that genuinely appear in your search results as competitors — never invent a plausible-sounding competitor name.",
    userContent: [
      `Search the web and find up to ${MAX_COMPETITORS} real, named competitors of "${params.companyName}" (${params.websiteUrl}).`,
      params.industry ? `Industry: ${params.industry}.` : null,
      params.services?.length ? `Offers services like: ${params.services.join(", ")}.` : null,
      "For each real competitor found, note its name, website, apparent strengths/weaknesses, and market positioning relative to this company.",
    ]
      .filter(Boolean)
      .join(" "),
    maxTokens: 3072,
    webSearch: { maxUses: 5 },
  });
  await recordAIUsage(
    params.organizationId,
    searchResult.provider,
    searchResult.model,
    searchResult.inputTokens,
    searchResult.outputTokens,
    "company-discovery:competitor-search",
  );

  if (!searchResult.text.trim()) return [];

  const extraction = await generateStructured({
    system: `Extract a clean, deduplicated list of at most ${MAX_COMPETITORS} real competitors from these research notes. Only include a competitor that was actually named in the notes — never invent one. If nothing usable was found, return an empty list.`,
    userContent: searchResult.text,
    maxTokens: 2048,
    effort: "low",
    schema: CompetitorsSchema,
  });
  await recordAIUsage(
    params.organizationId,
    extraction.provider,
    extraction.model,
    extraction.inputTokens,
    extraction.outputTokens,
    "company-discovery:competitor-extract",
  );

  return extraction.parsed.competitors.slice(0, MAX_COMPETITORS);
}

interface BusinessUnderstandingShape {
  industry?: string | null;
  primaryServices?: string[];
}

/**
 * Recurring re-run of discoverCompetitors() (Phase 7 of the AI Business
 * Growth Engine) — reuses the exact onboarding search unchanged, but is now
 * callable on a schedule instead of once, writing to the already-existing,
 * previously-unused CompetitorSnapshot model. Diffs against the immediately
 * prior snapshot's real competitor names to compute `newlyDetected` — never
 * a fabricated diff. Requires a reviewed OrganizationDNA to source
 * company/industry/services context from; throws if none exists yet
 * (nothing real to ground the search in).
 */
export async function refreshCompetitorSnapshot(organizationId: string): Promise<CompetitorSnapshot> {
  const [organization, dna, priorSnapshot] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, website: true } }),
    prisma.organizationDNA.findFirst({
      where: { organizationId, status: "APPROVED" },
      orderBy: { version: "desc" },
      select: { businessUnderstanding: true },
    }),
    prisma.competitorSnapshot.findFirst({ where: { organizationId }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!dna || !organization.website) {
    throw new Error("No reviewed Organization DNA / website on file yet — nothing real to research competitors against.");
  }

  const businessUnderstanding = dna.businessUnderstanding as unknown as BusinessUnderstandingShape;

  const competitors = await discoverCompetitors({
    organizationId,
    companyName: organization.name,
    websiteUrl: organization.website,
    industry: businessUnderstanding.industry,
    services: businessUnderstanding.primaryServices,
  });

  const priorNames = new Set(
    ((priorSnapshot?.competitors as unknown as Competitor[] | null) ?? []).map((c) => c.name),
  );
  const newlyDetected = competitors.filter((c) => !priorNames.has(c.name)).map((c) => c.name);

  return prisma.competitorSnapshot.create({
    data: {
      organizationId,
      competitors: competitors as unknown as Prisma.InputJsonValue,
      newlyDetected,
    },
  });
}
