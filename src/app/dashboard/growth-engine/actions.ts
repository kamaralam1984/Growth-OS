"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { updateDiscoveryConfig } from "@/lib/business-development/discovery-config";
import { runLeadDiscoveryForOrganization } from "@/lib/business-development/discovery-job";
import { generateCompanyIntelligence } from "@/lib/company-intelligence";
import { generateLeadOpportunities } from "@/lib/business-development/opportunity-engine";
import { generateBuyerPersonas } from "@/lib/business-development/buyer-persona";
import type { OutreachAutoMode } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

async function requireOwnerOrAdmin(): Promise<{ userId: string; organizationId: string } | { error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { error: "You don't belong to an organization yet." };
  if (!PRIVILEGED_ROLES.has(membership.role)) return { error: "Only owners and admins can manage the Growth Engine." };

  return { userId, organizationId: membership.organizationId };
}

export interface UpdateDiscoverySettingsInput {
  discoveryEnabled: boolean;
  searchQueries: string[];
  scoringWeights: Record<string, number> | null;
  outreachAutoMode: OutreachAutoMode;
}

export async function updateDiscoverySettingsAction(input: UpdateDiscoverySettingsInput): Promise<ActionResult> {
  const actor = await requireOwnerOrAdmin();
  if ("error" in actor) return { ok: false, error: actor.error };

  // AUTO_SEND is the one genuinely sensitive setting — spec requires it be
  // reachable only by an explicit OWNER opt-in, not any privileged role.
  if (input.outreachAutoMode === "AUTO_SEND") {
    const membership = await prisma.membership.findUnique({
      where: { userId_organizationId: { userId: actor.userId, organizationId: actor.organizationId } },
      select: { role: true },
    });
    if (membership?.role !== "OWNER") {
      return { ok: false, error: "Only the organization owner can enable Auto-Send." };
    }
  }

  await updateDiscoveryConfig(actor.organizationId, {
    discoveryEnabled: input.discoveryEnabled,
    searchQueries: input.searchQueries,
    scoringWeights: input.scoringWeights,
    outreachAutoMode: input.outreachAutoMode,
    updatedByUserId: actor.userId,
  });

  await logAudit({
    userId: actor.userId,
    organizationId: actor.organizationId,
    action: "business_development.config_updated",
    metadata: { discoveryEnabled: input.discoveryEnabled, outreachAutoMode: input.outreachAutoMode },
  });

  revalidatePath("/dashboard/growth-engine");
  return { ok: true };
}

export async function runDiscoveryNowAction(): Promise<ActionResult> {
  const actor = await requireOwnerOrAdmin();
  if ("error" in actor) return { ok: false, error: actor.error };

  const summary = await runLeadDiscoveryForOrganization(actor.organizationId);
  if (summary.skippedReason) return { ok: false, error: summary.skippedReason };

  revalidatePath("/dashboard/growth-engine");
  return { ok: true };
}

export async function researchCompanyNowAction(companyId: string): Promise<ActionResult> {
  const actor = await requireOwnerOrAdmin();
  if ("error" in actor) return { ok: false, error: actor.error };

  const company = await prisma.company.findFirst({ where: { id: companyId, organizationId: actor.organizationId } });
  if (!company) return { ok: false, error: "Company not found." };

  try {
    await generateCompanyIntelligence(companyId);
    await generateLeadOpportunities(companyId);
    await generateBuyerPersonas(companyId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Research failed." };
  }

  revalidatePath("/dashboard/growth-engine");
  return { ok: true };
}
