import { prisma } from "@/lib/prisma";

const WON_STAGE_NAME = "Won"; // same convention computePipelineTotals (src/lib/company-health.ts) already uses

export interface ReferralAttributionRow {
  clientId: string;
  clientName: string;
  referredLeadsCount: number;
  convertedCount: number;
  convertedValue: number;
}

/**
 * Real aggregation over Lead.referredByClientId — set only manually via an
 * explicit "Referred by" picker (never AI-inferred). A lead with no
 * referredByClientId simply doesn't appear here; this is never backfilled
 * or guessed. convertedCount/convertedValue use the same "Won" pipeline
 * stage check computePipelineTotals already uses.
 */
export async function getReferralAttribution(organizationId: string): Promise<ReferralAttributionRow[]> {
  const leads = await prisma.lead.findMany({
    where: { referredByClientId: { not: null }, pipelineStage: { workspace: { organizationId } } },
    select: {
      referredByClientId: true,
      estimatedValue: true,
      pipelineStage: { select: { name: true } },
      referredByClient: { select: { id: true, name: true } },
    },
  });

  const byClient = new Map<string, ReferralAttributionRow>();
  for (const lead of leads) {
    if (!lead.referredByClientId || !lead.referredByClient) continue;
    const row = byClient.get(lead.referredByClientId) ?? {
      clientId: lead.referredByClientId,
      clientName: lead.referredByClient.name,
      referredLeadsCount: 0,
      convertedCount: 0,
      convertedValue: 0,
    };
    row.referredLeadsCount += 1;
    if (lead.pipelineStage.name === WON_STAGE_NAME) {
      row.convertedCount += 1;
      row.convertedValue += lead.estimatedValue ?? 0;
    }
    byClient.set(lead.referredByClientId, row);
  }

  return Array.from(byClient.values()).sort((a, b) => b.referredLeadsCount - a.referredLeadsCount);
}
