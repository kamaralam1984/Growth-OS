"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { planCampaign } from "@/lib/outreach/campaign-planner";
import { campaignSchema, type CampaignInput } from "@/lib/validations/outreach";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return { ok: false, errorKind: "not_connected", error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment." };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return { ok: false, errorKind: "billing", error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing." };
  }
  console.error("[outreach] campaign planner failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong. Please try again." };
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

async function resolveCampaignInOrg(userId: string, campaignId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.organizationId !== membership.organizationId) return null;
  return { membership, campaign };
}

export interface CreateCampaignResult extends ActionResult {
  campaignId?: string;
}

export async function createCampaign(input: CampaignInput): Promise<CreateCampaignResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the campaign details." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const campaign = await prisma.campaign.create({
    data: {
      organizationId: membership.organizationId,
      name: parsed.data.name,
      type: parsed.data.type,
      targetIndustry: parsed.data.targetIndustry || null,
      targetCountry: parsed.data.targetCountry || null,
      targetCompanySize: parsed.data.targetCompanySize || null,
      goal: parsed.data.goal || null,
      approvalMode: parsed.data.approvalMode,
      createdByUserId: userId,
    },
  });

  await logAudit({ userId, organizationId: membership.organizationId, action: "outreach.campaign_created", metadata: { campaignId: campaign.id } });
  revalidatePath("/dashboard/outreach");
  return { ok: true, campaignId: campaign.id };
}

export async function updateCampaign(campaignId: string, input: CampaignInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the campaign details." };

  const resolved = await resolveCampaignInOrg(userId, campaignId);
  if (!resolved) return { ok: false, error: "Campaign not found." };

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      targetIndustry: parsed.data.targetIndustry || null,
      targetCountry: parsed.data.targetCountry || null,
      targetCompanySize: parsed.data.targetCompanySize || null,
      goal: parsed.data.goal || null,
      approvalMode: parsed.data.approvalMode,
    },
  });

  revalidatePath("/dashboard/outreach");
  revalidatePath(`/dashboard/outreach/campaigns/${campaignId}`);
  return { ok: true };
}

export async function setCampaignStatus(campaignId: string, status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED"): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveCampaignInOrg(userId, campaignId);
  if (!resolved) return { ok: false, error: "Campaign not found." };

  await prisma.campaign.update({ where: { id: campaignId }, data: { status } });

  if (status === "COMPLETED") {
    await notifyOrganizationOwners({
      organizationId: resolved.membership.organizationId,
      type: "SYSTEM_NOTICE",
      title: "Campaign finished",
      message: `"${resolved.campaign.name}" is marked complete.`,
    });
  }

  revalidatePath("/dashboard/outreach");
  revalidatePath(`/dashboard/outreach/campaigns/${campaignId}`);
  return { ok: true };
}

export interface AddContactsResult extends ActionResult {
  addedCount?: number;
}

/**
 * Adds contacts to a campaign, matching the brief's 4 audience-building modes
 * honestly — every mode queries real stored data, never a fabricated
 * audience: explicit contactIds, or a real filter over Contact/linked
 * Company fields (industry/country/tag).
 */
export async function addContactsToCampaign(
  campaignId: string,
  selection: { contactIds?: string[]; industry?: string; country?: string; tag?: string },
): Promise<AddContactsResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveCampaignInOrg(userId, campaignId);
  if (!resolved) return { ok: false, error: "Campaign not found." };
  const organizationId = resolved.membership.organizationId;

  let contactIds = selection.contactIds ?? [];
  if (!contactIds.length && (selection.industry || selection.country || selection.tag)) {
    const matches = await prisma.contact.findMany({
      where: {
        organizationId,
        ...(selection.tag ? { tags: { has: selection.tag } } : {}),
        ...(selection.country ? { country: { equals: selection.country, mode: "insensitive" } } : {}),
        ...(selection.industry ? { company: { industry: { equals: selection.industry, mode: "insensitive" } } } : {}),
      },
      select: { id: true },
    });
    contactIds = matches.map((c) => c.id);
  }

  if (contactIds.length === 0) return { ok: false, error: "No matching contacts found." };

  const validContacts = await prisma.contact.findMany({ where: { id: { in: contactIds }, organizationId }, select: { id: true } });

  await prisma.campaignContact.createMany({
    data: validContacts.map((c) => ({ campaignId, contactId: c.id })),
    skipDuplicates: true,
  });

  revalidatePath(`/dashboard/outreach/campaigns/${campaignId}`);
  return { ok: true, addedCount: validContacts.length };
}

export async function removeContactFromCampaign(campaignId: string, contactId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveCampaignInOrg(userId, campaignId);
  if (!resolved) return { ok: false, error: "Campaign not found." };

  await prisma.campaignContact.deleteMany({ where: { campaignId, contactId } });
  revalidatePath(`/dashboard/outreach/campaigns/${campaignId}`);
  return { ok: true };
}

/** Runs the real AI Campaign Planner and persists its (deterministic score + AI narrative) output onto the campaign. */
export async function generateCampaignPlan(campaignId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveCampaignInOrg(userId, campaignId);
  if (!resolved) return { ok: false, error: "Campaign not found." };

  try {
    const plan = await planCampaign(resolved.membership.organizationId, {
      goal: resolved.campaign.goal ?? undefined,
      targetIndustry: resolved.campaign.targetIndustry ?? undefined,
      targetCountry: resolved.campaign.targetCountry ?? undefined,
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { aiPlanNotes: plan.aiPlanNotes, estimatedSuccessPotential: plan.estimatedSuccessPotential },
    });

    await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "outreach.campaign_planned", metadata: { campaignId } });
    revalidatePath(`/dashboard/outreach/campaigns/${campaignId}`);
    return { ok: true };
  } catch (error) {
    return describeAIError(error);
  }
}
