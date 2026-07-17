import { prisma } from "@/lib/prisma";
import { isAIConnected } from "@/lib/ai/client";
import { generateCompanyIntelligence } from "@/lib/company-intelligence";

import { generateLeadOpportunities } from "./opportunity-engine";
import { generateBuyerPersonas } from "./buyer-persona";

/**
 * Bulk/scheduled Company Research (spec §"COMPANY RESEARCH") — processes a
 * bounded backlog of companies missing `CompanyIntelligence`, chaining the
 * existing `generateCompanyIntelligence()` (unchanged, previously only
 * manually triggered from a Company's detail page) with the two genuinely
 * new Phase 17 calls. Bounded per org per run for the same cost-control
 * reason as the discovery job — an unattended job processing an unbounded
 * backlog would be a real AI-spend risk.
 */
const MAX_COMPANIES_PER_RUN = 5;

export interface CompanyResearchRunSummary {
  organizationId: string;
  processed: number;
  failed: number;
  skippedReason?: string;
}

export async function runCompanyResearchBacklog(): Promise<CompanyResearchRunSummary[]> {
  if (!isAIConnected()) return [{ organizationId: "*", processed: 0, failed: 0, skippedReason: "AI provider not configured" }];

  const configs = await prisma.leadDiscoveryConfig.findMany({ where: { discoveryEnabled: true }, select: { organizationId: true } });
  const summaries: CompanyResearchRunSummary[] = [];

  for (const config of configs) {
    const companies = await prisma.company.findMany({
      where: { organizationId: config.organizationId, intelligenceRuns: { none: {} } },
      orderBy: { createdAt: "asc" },
      take: MAX_COMPANIES_PER_RUN,
      select: { id: true },
    });

    let processed = 0;
    let failed = 0;
    for (const company of companies) {
      try {
        await generateCompanyIntelligence(company.id);
        await generateLeadOpportunities(company.id);
        await generateBuyerPersonas(company.id);
        processed += 1;
      } catch (error) {
        console.error(`[business-development/company-research-job] company ${company.id} failed:`, error);
        failed += 1;
      }
    }

    summaries.push({ organizationId: config.organizationId, processed, failed });
  }

  return summaries;
}
