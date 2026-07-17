"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { runWebSearchDiscovery, type DiscoveredCompany } from "@/lib/ai/agent-runtime";
import {
  discoveryQuerySchema,
  discoveryFiltersSchema,
  discoveredCompanyListSchema,
  describeFilters,
  type DiscoveryFilters,
} from "@/lib/validations/discovery";
import { addCompanyTimelineEvent } from "@/lib/company-intelligence";
import { scoreCompany } from "@/lib/lead-scoring";
import { findOrCreateCompany } from "@/lib/business-development/dedup";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

export interface SearchLeadsResult extends ActionResult {
  companies?: DiscoveredCompany[];
}

export interface SaveLeadsResult extends ActionResult {
  savedCount?: number;
  duplicatesSkipped?: number;
}

function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return {
      ok: false,
      errorKind: "not_connected",
      error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment.",
    };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return {
      ok: false,
      errorKind: "billing",
      error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing.",
    };
  }
  console.error("[lead-finder] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong searching the web. Please try again." };
}

/** Runs a real, live web-search-backed lead search via the org's Sales agent. */
export async function searchLeads(query: string, filters?: Partial<DiscoveryFilters>): Promise<SearchLeadsResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsedQuery = discoveryQuerySchema.safeParse(query);
  if (!parsedQuery.success) {
    return { ok: false, error: parsedQuery.error.issues[0]?.message ?? "Enter what you're looking for." };
  }
  const parsedFilters = discoveryFiltersSchema.partial().safeParse(filters ?? {});

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  if (!checkRateLimit(`lead-finder:${userId}`, { limit: 15, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many searches — wait a few minutes and try again." };
  }

  const agent = await prisma.aIAgentInstance.findUnique({
    where: { organizationId_type: { organizationId: membership.organizationId, type: "SALES" } },
  });
  if (!agent) return { ok: false, error: "Your Sales agent isn't set up yet." };

  try {
    const result = await runWebSearchDiscovery({
      agentId: agent.id,
      agentType: "SALES",
      agentName: agent.name,
      query: parsedQuery.data,
      resultKind: "lead",
      filtersDescription: parsedFilters.success ? describeFilters(parsedFilters.data) || undefined : undefined,
    });

    await logActivity({
      organizationId: membership.organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} searched Lead Finder: "${parsedQuery.data}".`,
      actorUserId: userId,
      metadata: { searchKind: "lead", query: parsedQuery.data, filters: parsedFilters.success ? parsedFilters.data : {} },
    });

    return { ok: true, companies: result.companies };
  } catch (error) {
    return describeAIError(error);
  }
}

/** Saves the user's approved subset of AI-found companies as real Company + Lead rows. */
export async function saveDiscoveredLeads(companies: DiscoveredCompany[]): Promise<SaveLeadsResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = discoveredCompanyListSchema.safeParse(companies);
  if (!parsed.success || parsed.data.length === 0) {
    return { ok: false, error: "Select at least one company to save." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  try {
    const stage = await prisma.pipelineStage.findFirst({
      where: { workspace: { organizationId } },
      orderBy: { order: "asc" },
    });
    if (!stage) return { ok: false, error: "No pipeline stage is configured for your organization yet." };

    let savedCount = 0;
    let duplicatesSkipped = 0;
    for (const item of parsed.data) {
      const { company, wasCreated } = await findOrCreateCompany({
        organizationId,
        name: item.name,
        website: item.website,
        industry: item.industry,
        email: item.email,
        notes: item.reason,
        source: "LEAD_FINDER",
        status: "LEAD",
      });

      if (!wasCreated) {
        const existingLead = await prisma.lead.findFirst({ where: { companyId: company.id } });
        if (existingLead) {
          duplicatesSkipped += 1;
          continue; // already in the pipeline — never a duplicate Company or Lead row
        }
      }

      await prisma.lead.create({
        data: {
          pipelineStageId: stage.id,
          companyId: company.id,
          name: item.name,
          company: item.name,
          email: item.email || null,
        },
      });
      await addCompanyTimelineEvent({
        companyId: company.id,
        type: "CREATED",
        title: `${company.name} discovered via Lead Finder`,
        description: item.reason || null,
        source: "AI_RESEARCH",
      });
      await scoreCompany(company.id);
      savedCount += 1;
    }

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} saved ${savedCount} lead${savedCount === 1 ? "" : "s"} found by Lead Finder${duplicatesSkipped > 0 ? ` (${duplicatesSkipped} already existed)` : ""}.`,
      actorUserId: userId,
      metadata: { count: savedCount, duplicatesSkipped },
    });
    await logAudit({ userId, organizationId, action: "lead_finder.leads_saved", metadata: { count: savedCount, duplicatesSkipped } });

    revalidatePath("/dashboard/lead-finder");
    revalidatePath("/dashboard/companies");
    revalidatePath("/dashboard/crm");
    revalidatePath("/dashboard");
    return { ok: true, savedCount, duplicatesSkipped };
  } catch (error) {
    console.error("[lead-finder] saveDiscoveredLeads failed:", error);
    return { ok: false, errorKind: "generic", error: "Something went wrong saving these leads. Please try again." };
  }
}
