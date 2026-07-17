import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";

/**
 * Buyer Persona generation — probable decision-maker roles for a discovered
 * company (Founder, CEO, CTO, Operations Manager, Marketing Head, IT
 * Manager, Business Owner, ...), grounded in the company's real
 * `CompanyIntelligence`. `isVerified` is never AI-asserted — it's flipped
 * true only by a plain, separate DB check against real `Contact` rows on
 * this company, keeping "AI inference" and "verified fact" honestly distinct
 * per the spec's core requirement.
 */

const BuyerPersonaSchema = z.object({
  likelyTitle: z.string(),
  description: z.string(),
  painPoints: z.array(z.string()).max(6).default([]),
  preferredChannel: z.enum(["email", "linkedin"]).nullable(),
  confidenceScore: z.number().min(0).max(100),
});

const BuyerPersonasSchema = z.object({
  personas: z.array(BuyerPersonaSchema).max(4).default([]),
});

export async function generateBuyerPersonas(companyId: string): Promise<number> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  const intelligence = await prisma.companyIntelligence.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" } });
  if (!intelligence) return 0;

  const result = await generateStructured({
    system:
      "You are a B2B sales strategist. Based ONLY on the real company research given, propose the 1-4 most probable buyer/decision-maker personas for this specific company (e.g. Founder, CEO, CTO, Operations Manager, Marketing Head, IT Manager, Business Owner) — this is explicitly an inference exercise (real personas require real contacts), so ground every point in something plausible from the real data given, never a generic template disconnected from this company's actual size/industry/tech profile.",
    userContent: JSON.stringify({
      companyName: company.name,
      industry: company.industry,
      employeeCount: company.employeeCount,
      businessSummary: intelligence.businessSummary,
      techStackSummary: intelligence.techStackSummary,
      potentialPainPoints: intelligence.potentialPainPoints,
      recommendedSolution: intelligence.recommendedSolution,
    }),
    maxTokens: 1536,
    effort: "medium",
    schema: BuyerPersonasSchema,
  });

  await recordAIUsage(
    company.organizationId,
    result.provider,
    result.model,
    result.inputTokens,
    result.outputTokens,
    "business-development:buyer-personas",
  );

  if (result.parsed.personas.length === 0) return 0;

  const contacts = await prisma.contact.findMany({ where: { companyId }, select: { jobTitle: true } });
  const contactTitles = new Set(contacts.map((c) => c.jobTitle?.toLowerCase().trim()).filter(Boolean));

  await prisma.buyerPersona.createMany({
    data: result.parsed.personas.map((p) => ({
      companyId,
      likelyTitle: p.likelyTitle,
      description: p.description,
      painPoints: p.painPoints,
      preferredChannel: p.preferredChannel,
      confidenceScore: p.confidenceScore,
      isVerified: contactTitles.has(p.likelyTitle.toLowerCase().trim()),
    })),
  });

  return result.parsed.personas.length;
}
