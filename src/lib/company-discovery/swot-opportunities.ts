import { z } from "zod";

import { generateStructured } from "@/lib/ai/fallback";
import { recordAIUsage } from "@/lib/billing/ai-credits";

import type { BusinessUnderstanding } from "./business-understanding";
import type { Competitor } from "./competitor-discovery";

/** Step 9 (SWOT) + Step 10 (Business Opportunities) — grounded only in the real findings from earlier pipeline steps; every opportunity carries an `evidence` citation back to that input data. */

const SWOTSchema = z.object({
  strengths: z.array(z.string()).max(8).default([]),
  weaknesses: z.array(z.string()).max(8).default([]),
  opportunities: z.array(z.string()).max(8).default([]),
  threats: z.array(z.string()).max(8).default([]),
  confidenceScore: z.number().min(0).max(100),
});
export type SWOT = z.infer<typeof SWOTSchema>;

const OpportunitySchema = z.object({
  title: z.string(),
  category: z.string(),
  description: z.string(),
  estimatedImpact: z.enum(["low", "medium", "high"]),
  evidence: z.string(),
});

const OpportunitiesSchema = z.object({
  opportunities: z.array(OpportunitySchema).max(10).default([]),
  confidenceScore: z.number().min(0).max(100),
});
export type BusinessOpportunities = z.infer<typeof OpportunitiesSchema>;

export async function generateSWOT(params: {
  organizationId: string;
  businessUnderstanding: BusinessUnderstanding;
  competitors: Competitor[];
  digitalAuditSummary?: string;
}): Promise<SWOT> {
  const result = await generateStructured({
    system:
      "You are a strategy consultant producing a SWOT analysis. Ground every point in the real business-understanding, competitor, and digital-audit data given. If a point is an inference rather than a direct fact, phrase it accordingly — never invent a point with no basis in the provided data. confidenceScore must honestly reflect how well-supported this analysis is by the real input data.",
    userContent: JSON.stringify({
      businessUnderstanding: params.businessUnderstanding,
      competitors: params.competitors,
      digitalAuditSummary: params.digitalAuditSummary ?? null,
    }),
    maxTokens: 2048,
    effort: "medium",
    schema: SWOTSchema,
  });
  await recordAIUsage(params.organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "company-discovery:swot");
  return result.parsed;
}

export async function identifyOpportunities(params: {
  organizationId: string;
  businessUnderstanding: BusinessUnderstanding;
  digitalAuditSummary?: string;
  techFindings?: string[];
}): Promise<BusinessOpportunities> {
  const result = await generateStructured({
    system:
      "You are a growth consultant. Identify concrete business opportunities (missing CRM/ERP, weak SEO, security issues, automation opportunities, conversion/branding issues, etc.) ONLY where genuinely supported by the real digital-audit/tech findings and business understanding given — every opportunity needs a real evidence citation from the input data. Never invent a generic opportunity with no basis in what was actually found.",
    userContent: JSON.stringify({
      businessUnderstanding: params.businessUnderstanding,
      digitalAuditSummary: params.digitalAuditSummary ?? null,
      techFindings: params.techFindings ?? [],
    }),
    maxTokens: 2560,
    effort: "medium",
    schema: OpportunitiesSchema,
  });
  await recordAIUsage(params.organizationId, result.provider, result.model, result.inputTokens, result.outputTokens, "company-discovery:opportunities");
  return result.parsed;
}
