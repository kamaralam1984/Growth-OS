"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners, notifyUser } from "@/lib/notifications";
import { sendOutreachEmail } from "@/lib/outreach/email-provider";
import { injectTracking, getAppBaseUrl } from "@/lib/outreach/tracking";
import type { ApprovalDecision } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_configured" | "generic";
}

const APPROVER_ROLES = new Set(["OWNER", "ADMIN"]);

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

async function resolveDraftInOrg(userId: string, draftId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const draft = await prisma.emailDraft.findUnique({ where: { id: draftId }, include: { contact: true } });
  if (!draft || draft.organizationId !== membership.organizationId) return null;
  return { membership, draft };
}

/** Moves a draft into review — creates an Approval row and notifies OWNER/ADMIN. */
export async function requestApproval(draftId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveDraftInOrg(userId, draftId);
  if (!resolved) return { ok: false, error: "Draft not found." };

  await prisma.$transaction([
    prisma.emailDraft.update({ where: { id: draftId }, data: { status: "PENDING_APPROVAL" } }),
    prisma.approval.create({ data: { organizationId: resolved.membership.organizationId, emailDraftId: draftId, decision: "PENDING" } }),
  ]);

  await notifyOrganizationOwners({
    organizationId: resolved.membership.organizationId,
    type: "APPROVAL_REQUESTED",
    title: "A draft is waiting for approval",
    message: `${resolved.draft.subject ?? resolved.draft.body.slice(0, 60)} — for ${resolved.draft.contact.firstName}`,
  });

  revalidatePath("/dashboard/outreach");
  return { ok: true };
}

/** OWNER/ADMIN only — decides a pending draft. CHANGES_REQUESTED kicks it back to DRAFT for editing. */
export async function decideApproval(approvalId: string, decision: ApprovalDecision, comment?: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!APPROVER_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can approve drafts." };

  const approval = await prisma.approval.findUnique({ where: { id: approvalId }, include: { emailDraft: true } });
  if (!approval || approval.organizationId !== membership.organizationId) return { ok: false, error: "Approval request not found." };

  await prisma.approval.update({
    where: { id: approvalId },
    data: { decision, comment: comment || null, decidedByUserId: userId, decidedAt: new Date() },
  });

  const nextDraftStatus = decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "DRAFT";
  await prisma.emailDraft.update({ where: { id: approval.emailDraftId }, data: { status: nextDraftStatus } });

  await logAudit({ userId, organizationId: membership.organizationId, action: "outreach.approval_decided", metadata: { approvalId, decision } });
  revalidatePath("/dashboard/outreach");
  return { ok: true };
}

/** APPROVED -> QUEUED. Automatic-mode campaigns can queue without a human decision, but never skip the real send-configured check. */
export async function queueDraft(draftId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveDraftInOrg(userId, draftId);
  if (!resolved) return { ok: false, error: "Draft not found." };
  if (resolved.draft.status !== "APPROVED") return { ok: false, error: "Only an approved draft can be queued." };

  await prisma.emailDraft.update({ where: { id: draftId }, data: { status: "QUEUED", queuedAt: new Date() } });
  revalidatePath("/dashboard/outreach");
  return { ok: true };
}

/** QUEUED -> SENT|FAILED. Only ever marks SENT after a real send genuinely succeeds — LinkedIn drafts use markLinkedInDraftSent instead (no automation). */
export async function sendQueuedDraft(draftId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveDraftInOrg(userId, draftId);
  if (!resolved) return { ok: false, error: "Draft not found." };
  const draft = resolved.draft;
  if (draft.channel !== "EMAIL") return { ok: false, error: "Only email drafts can be sent this way — LinkedIn drafts are marked sent manually." };
  if (draft.status !== "QUEUED") return { ok: false, error: "Only a queued draft can be sent." };

  const baseUrl = getAppBaseUrl();
  const rawHtml = `<p>${draft.body.replace(/\n/g, "<br/>")}</p>`;
  const html = draft.trackingToken ? injectTracking(rawHtml, draft.trackingToken, baseUrl) : rawHtml;

  const result = await sendOutreachEmail(resolved.membership.organizationId, {
    to: draft.contact.email,
    subject: draft.subject ?? "",
    html,
    text: draft.body,
  });

  if (!result.ok) {
    await prisma.emailDraft.update({ where: { id: draftId }, data: { status: "FAILED", failedReason: result.error } });
    revalidatePath("/dashboard/outreach");
    return { ok: false, errorKind: result.errorKind === "not_configured" ? "not_configured" : "generic", error: result.error };
  }

  await prisma.emailDraft.update({
    where: { id: draftId },
    data: { status: "SENT", sentAt: new Date(), resendMessageId: result.providerMessageId ?? undefined },
  });
  await notifyUser({
    userId,
    organizationId: resolved.membership.organizationId,
    type: "CRM_EVENT",
    title: "Email sent",
    message: `Sent "${draft.subject ?? "email"}" to ${draft.contact.firstName}.`,
  });

  revalidatePath("/dashboard/outreach");
  return { ok: true };
}

/** LinkedIn drafts are never sent by this app — the user pastes the text into LinkedIn themselves, then confirms here. Zero automation. */
export async function markLinkedInDraftSent(draftId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveDraftInOrg(userId, draftId);
  if (!resolved) return { ok: false, error: "Draft not found." };
  if (resolved.draft.channel !== "LINKEDIN") return { ok: false, error: "This action is only for LinkedIn drafts." };
  if (resolved.draft.status !== "QUEUED" && resolved.draft.status !== "APPROVED") {
    return { ok: false, error: "Approve or queue this draft first." };
  }

  await prisma.emailDraft.update({ where: { id: draftId }, data: { status: "SENT", sentAt: new Date() } });
  revalidatePath("/dashboard/outreach");
  return { ok: true };
}
