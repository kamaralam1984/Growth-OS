"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateEmailDraft } from "@/lib/outreach/draft-generator";
import type { DraftChannel, DraftPurpose, EmailTone } from "@/generated/prisma/client";

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
  console.error("[outreach] A/B draft generation failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong. Please try again." };
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

export interface CreateAbTestResult extends ActionResult {
  abTestGroupId?: string;
  variantACount?: number;
  variantBCount?: number;
}

/**
 * Splits a campaign's enrolled contacts alternately into two real groups and
 * generates a genuinely distinct AI draft variant for each — a comparison of
 * two things that will actually happen (sent to real, different contact
 * subsets), never a simulated split-test.
 */
export async function createAbTestForCampaign(
  campaignId: string,
  purpose: DraftPurpose,
  channel: DraftChannel,
  toneA: EmailTone,
  toneB: EmailTone,
): Promise<CreateAbTestResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { contacts: { select: { contactId: true } } } });
  if (!campaign || campaign.organizationId !== membership.organizationId) return { ok: false, error: "Campaign not found." };
  if (campaign.contacts.length < 2) return { ok: false, error: "Add at least 2 contacts to this campaign before running an A/B test." };

  const abTestGroupId = crypto.randomUUID();
  const groupA = campaign.contacts.filter((_, i) => i % 2 === 0);
  const groupB = campaign.contacts.filter((_, i) => i % 2 === 1);

  try {
    let variantACount = 0;
    let variantBCount = 0;
    for (const { contactId } of groupA) {
      await generateEmailDraft({ contactId, purpose, tone: toneA, channel, campaignId, abVariant: "A", abTestGroupId });
      variantACount++;
    }
    for (const { contactId } of groupB) {
      await generateEmailDraft({ contactId, purpose, tone: toneB, channel, campaignId, abVariant: "B", abTestGroupId });
      variantBCount++;
    }

    await logAudit({ userId, organizationId: membership.organizationId, action: "outreach.ab_test_created", metadata: { campaignId, abTestGroupId, variantACount, variantBCount } });
    revalidatePath(`/dashboard/outreach/campaigns/${campaignId}`);
    return { ok: true, abTestGroupId, variantACount, variantBCount };
  } catch (error) {
    return describeAIError(error);
  }
}

export interface AbVariantStats {
  variant: string;
  count: number;
  sentCount: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  sampleSubject: string | null;
  sampleBody: string;
}

/** Real per-variant metrics from the actually-tracked EmailDraft rows in each group — never simulated. */
export async function getAbTestResults(abTestGroupId: string): Promise<AbVariantStats[]> {
  const drafts = await prisma.emailDraft.findMany({ where: { abTestGroupId }, orderBy: { createdAt: "asc" } });
  const variants = Array.from(new Set(drafts.map((d) => d.abVariant).filter((v): v is string => v !== null)));

  const replyCounts = await prisma.reply.groupBy({
    by: ["emailDraftId"],
    where: { emailDraftId: { in: drafts.map((d) => d.id) } },
    _count: { emailDraftId: true },
  });
  const draftsWithReplies = new Set(replyCounts.map((r) => r.emailDraftId));

  return variants.map((variant) => {
    const rows = drafts.filter((d) => d.abVariant === variant);
    const sent = rows.filter((d) => d.status === "SENT");
    const opened = sent.filter((d) => d.openCount > 0).length;
    const clicked = sent.filter((d) => d.clickCount > 0).length;
    const replied = sent.filter((d) => draftsWithReplies.has(d.id)).length;
    return {
      variant,
      count: rows.length,
      sentCount: sent.length,
      openRate: sent.length > 0 ? Math.round((opened / sent.length) * 100) : 0,
      clickRate: sent.length > 0 ? Math.round((clicked / sent.length) * 100) : 0,
      replyRate: sent.length > 0 ? Math.round((replied / sent.length) * 100) : 0,
      sampleSubject: rows[0]?.subject ?? null,
      sampleBody: rows[0]?.body ?? "",
    };
  });
}
