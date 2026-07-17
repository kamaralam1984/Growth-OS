import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { isAIConnected } from "@/lib/ai/client";
import { runWebSearchDiscovery } from "@/lib/ai/agent-runtime";
import { addCompanyTimelineEvent } from "@/lib/company-intelligence";
import { scoreCompany } from "@/lib/lead-scoring";

import { findOrCreateCompany } from "./dedup";
import { deriveDefaultQueries, getOrCreateDiscoveryConfig } from "./discovery-config";

/**
 * Continuous Lead Discovery (spec §"LEAD DISCOVERY") — reuses the exact same
 * web-search primitive the manual Lead Finder page already uses
 * (`runWebSearchDiscovery`), the same dedup choke point every save path now
 * goes through (`findOrCreateCompany`), and the same immediate lead-scoring
 * step manual saves already do. The only genuinely new thing here is the
 * scheduled, per-org-configured loop around those existing pieces.
 *
 * Bounded: max 3 queries per org per run, capping AI cost the same way
 * Phase 16's crawler/competitor caps do — a silent unbounded loop across
 * every org's queries would be a real cost risk for an always-on job.
 */
const MAX_QUERIES_PER_RUN = 3;

export interface DiscoveryRunSummary {
  organizationId: string;
  queriesRun: number;
  companiesFound: number;
  duplicatesSkipped: number;
  skippedReason?: string;
}

export async function runLeadDiscoveryForOrganization(organizationId: string): Promise<DiscoveryRunSummary> {
  const config = await getOrCreateDiscoveryConfig(organizationId);
  if (!config.discoveryEnabled) {
    return { organizationId, queriesRun: 0, companiesFound: 0, duplicatesSkipped: 0, skippedReason: "discovery not enabled for this organization" };
  }
  if (!isAIConnected()) {
    return { organizationId, queriesRun: 0, companiesFound: 0, duplicatesSkipped: 0, skippedReason: "AI provider not configured" };
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { industry: true, clientTypes: true, countriesServed: true },
  });
  if (!organization) return { organizationId, queriesRun: 0, companiesFound: 0, duplicatesSkipped: 0, skippedReason: "organization not found" };

  const queries = (config.searchQueries.length > 0 ? config.searchQueries : deriveDefaultQueries(organization)).slice(0, MAX_QUERIES_PER_RUN);
  if (queries.length === 0) {
    return { organizationId, queriesRun: 0, companiesFound: 0, duplicatesSkipped: 0, skippedReason: "no search queries configured or derivable" };
  }

  const salesAgent = await prisma.aIAgentInstance.findFirst({ where: { organizationId, type: "SALES", active: true } });
  if (!salesAgent) return { organizationId, queriesRun: 0, companiesFound: 0, duplicatesSkipped: 0, skippedReason: "no active Sales agent" };

  const owner = await prisma.membership.findFirst({
    where: { organizationId, status: "ACTIVE", role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return { organizationId, queriesRun: 0, companiesFound: 0, duplicatesSkipped: 0, skippedReason: "no active OWNER membership" };

  const stage = await prisma.pipelineStage.findFirst({ where: { workspace: { organizationId } }, orderBy: { order: "asc" } });
  if (!stage) return { organizationId, queriesRun: 0, companiesFound: 0, duplicatesSkipped: 0, skippedReason: "no pipeline stage configured" };

  let companiesFound = 0;
  let duplicatesSkipped = 0;
  let queriesRun = 0;

  for (const query of queries) {
    try {
      const result = await runWebSearchDiscovery({
        agentId: salesAgent.id,
        agentType: "SALES",
        agentName: salesAgent.name,
        query,
        resultKind: "lead",
      });
      queriesRun += 1;

      for (const item of result.companies) {
        const { company, wasCreated } = await findOrCreateCompany({
          organizationId,
          name: item.name,
          website: item.website,
          industry: item.industry,
          email: item.email,
          notes: item.reason,
          source: "AUTO_DISCOVERY",
          status: "LEAD",
        });

        if (!wasCreated) {
          const existingLead = await prisma.lead.findFirst({ where: { companyId: company.id } });
          if (existingLead) {
            duplicatesSkipped += 1;
            continue;
          }
        }

        await prisma.lead.create({
          data: { pipelineStageId: stage.id, companyId: company.id, name: item.name, company: item.name, email: item.email || null },
        });
        await addCompanyTimelineEvent({
          companyId: company.id,
          type: "CREATED",
          title: `${company.name} discovered automatically (query: "${query}")`,
          description: item.reason || null,
          source: "AI_RESEARCH",
        });
        await scoreCompany(company.id);
        companiesFound += 1;
      }
    } catch (error) {
      console.error(`[business-development/discovery-job] query "${query}" failed for org ${organizationId}:`, error);
    }
  }

  await logActivity({
    organizationId,
    type: "SYSTEM_EVENT",
    description: `Autonomous lead discovery ran ${queriesRun} quer${queriesRun === 1 ? "y" : "ies"} and found ${companiesFound} new lead${companiesFound === 1 ? "" : "s"}${duplicatesSkipped > 0 ? ` (${duplicatesSkipped} already existed)` : ""}.`,
    actorUserId: owner.userId,
    metadata: { queriesRun, companiesFound, duplicatesSkipped },
  });
  await logAudit({
    organizationId,
    action: "business_development.lead_discovery_run",
    metadata: { queriesRun, companiesFound, duplicatesSkipped },
  });

  return { organizationId, queriesRun, companiesFound, duplicatesSkipped };
}

/** Runs discovery for every organization that has opted in — the Scheduler Service's job handler. */
export async function runLeadDiscoveryForAllOrganizations(): Promise<DiscoveryRunSummary[]> {
  const configs = await prisma.leadDiscoveryConfig.findMany({ where: { discoveryEnabled: true }, select: { organizationId: true } });
  const summaries: DiscoveryRunSummary[] = [];
  for (const config of configs) {
    try {
      summaries.push(await runLeadDiscoveryForOrganization(config.organizationId));
    } catch (error) {
      console.error(`[business-development/discovery-job] org ${config.organizationId} failed:`, error);
      summaries.push({ organizationId: config.organizationId, queriesRun: 0, companiesFound: 0, duplicatesSkipped: 0, skippedReason: "unhandled error" });
    }
  }
  return summaries;
}
