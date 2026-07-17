"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { applyDraftConfiguration } from "@/lib/company-discovery/auto-configure";
import { enqueueCompanyDiscoveryRun } from "@/lib/company-discovery/discovery-queue";
import type { DraftConfiguration } from "@/lib/company-discovery/draft-configuration";
import type { Prisma, WidgetType } from "@/generated/prisma/client";

/**
 * Human Approval Workflow (plan §11) — every mutation here is gated the same
 * way every other /dashboard/settings action is (OWNER/ADMIN via
 * resolveActiveMembership), and every mutation re-checks
 * `status !== "AWAITING_REVIEW"` so a DNA can only ever be approved or
 * rejected once — a second submit (double-click, stale tab) is a no-op error,
 * never a double-apply.
 */

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
  if (!PRIVILEGED_ROLES.has(membership.role)) return { error: "Only owners and admins can manage the Company DNA." };

  return { userId, organizationId: membership.organizationId };
}

export interface ApproveCompanyDNAInput {
  dnaId: string;
  approvedWidgets: WidgetType[];
  approvedTemplateNames: string[];
  approvedArticleTitles: string[];
  approveDealStageRenames: boolean;
}

export async function approveCompanyDNAAction(input: ApproveCompanyDNAInput): Promise<ActionResult> {
  const actor = await requireOwnerOrAdmin();
  if ("error" in actor) return { ok: false, error: actor.error };

  const dna = await prisma.organizationDNA.findFirst({ where: { id: input.dnaId, organizationId: actor.organizationId } });
  if (!dna) return { ok: false, error: "Company DNA not found." };
  if (dna.status !== "AWAITING_REVIEW") return { ok: false, error: "This Company DNA has already been reviewed." };

  const draftConfiguration = dna.draftConfiguration as unknown as DraftConfiguration;
  const applied = await applyDraftConfiguration({
    organizationId: actor.organizationId,
    userId: actor.userId,
    draftConfiguration,
    approvedWidgets: input.approvedWidgets,
    approvedTemplateNames: input.approvedTemplateNames,
    approvedArticleTitles: input.approvedArticleTitles,
    approveDealStageRenames: input.approveDealStageRenames,
  });

  await prisma.organizationDNA.update({
    where: { id: dna.id },
    data: { status: "APPROVED", reviewedByUserId: actor.userId, reviewedAt: new Date() },
  });
  await prisma.companyDiscoveryRun.updateMany({ where: { dnaId: dna.id }, data: { status: "APPROVED" } });

  await logAudit({
    userId: actor.userId,
    organizationId: actor.organizationId,
    action: "company_dna.approved",
    metadata: { dnaId: dna.id, applied },
  });

  revalidatePath("/dashboard/settings/company-dna");
  return { ok: true };
}

export async function rejectCompanyDNAAction(dnaId: string, reason: string): Promise<ActionResult> {
  const actor = await requireOwnerOrAdmin();
  if ("error" in actor) return { ok: false, error: actor.error };

  const dna = await prisma.organizationDNA.findFirst({ where: { id: dnaId, organizationId: actor.organizationId } });
  if (!dna) return { ok: false, error: "Company DNA not found." };
  if (dna.status !== "AWAITING_REVIEW") return { ok: false, error: "This Company DNA has already been reviewed." };

  await prisma.organizationDNA.update({
    where: { id: dna.id },
    data: { status: "REJECTED", reviewedByUserId: actor.userId, reviewedAt: new Date(), rejectionReason: reason || null },
  });
  await prisma.companyDiscoveryRun.updateMany({ where: { dnaId: dna.id }, data: { status: "REJECTED" } });

  await logAudit({
    userId: actor.userId,
    organizationId: actor.organizationId,
    action: "company_dna.rejected",
    metadata: { dnaId: dna.id, reason },
  });

  revalidatePath("/dashboard/settings/company-dna");
  return { ok: true };
}

export async function retryCompanyDiscoveryAction(): Promise<ActionResult> {
  const actor = await requireOwnerOrAdmin();
  if ("error" in actor) return { ok: false, error: actor.error };

  const organization = await prisma.organization.findUnique({ where: { id: actor.organizationId }, select: { website: true } });
  if (!organization?.website) return { ok: false, error: "Add a website URL in your company profile first." };

  const run = await prisma.companyDiscoveryRun.create({ data: { organizationId: actor.organizationId, status: "PENDING" } });
  await enqueueCompanyDiscoveryRun(run.id);

  await logAudit({
    userId: actor.userId,
    organizationId: actor.organizationId,
    action: "company_discovery.retry_requested",
    metadata: { runId: run.id },
  });

  revalidatePath("/dashboard/settings/company-dna");
  return { ok: true };
}

export interface UpdateBusinessUnderstandingInput {
  dnaId: string;
  industry?: string;
  businessModel?: string;
  targetMarket?: string;
}

/**
 * Step 16 (Human Confirmation) — "Edit" action: lets the owner correct or
 * fill in the most consequential business-classification fields before
 * approving (an empty string clears a field back to "Unknown" rather than
 * being stored as a literal empty string). Only permitted while still
 * AWAITING_REVIEW — no versioning needed since nothing downstream has read
 * this DNA yet.
 */
export async function updateBusinessUnderstandingAction(input: UpdateBusinessUnderstandingInput): Promise<ActionResult> {
  const actor = await requireOwnerOrAdmin();
  if ("error" in actor) return { ok: false, error: actor.error };

  const dna = await prisma.organizationDNA.findFirst({ where: { id: input.dnaId, organizationId: actor.organizationId } });
  if (!dna) return { ok: false, error: "Company DNA not found." };
  if (dna.status !== "AWAITING_REVIEW") return { ok: false, error: "This Company DNA has already been reviewed." };

  const current = dna.businessUnderstanding as Record<string, unknown>;
  const updated: Record<string, unknown> = { ...current };
  if (input.industry !== undefined) updated.industry = input.industry.trim() || null;
  if (input.businessModel !== undefined) updated.businessModel = input.businessModel.trim() || null;
  if (input.targetMarket !== undefined) updated.targetMarket = input.targetMarket.trim() || null;

  await prisma.organizationDNA.update({
    where: { id: dna.id },
    data: { businessUnderstanding: updated as unknown as Prisma.InputJsonValue },
  });

  await logAudit({
    userId: actor.userId,
    organizationId: actor.organizationId,
    action: "company_dna.edited",
    metadata: { dnaId: dna.id, fields: Object.keys(input).filter((k) => k !== "dnaId") },
  });

  revalidatePath("/dashboard/settings/company-dna");
  return { ok: true };
}
