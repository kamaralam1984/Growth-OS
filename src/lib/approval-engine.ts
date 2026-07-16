import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { ApprovalPolicyMode, BoardReviewDecision, DocumentKind, MeetingStatus } from "@/generated/prisma/client";

/**
 * Reusable gate in front of any "send to client" / "publish" action. Not
 * proposal-specific by design — takes a generic (organizationId, docKind,
 * docId), so future phases (Projects, Billing, Enterprise Workflow
 * Automation) widen DocumentKind/OrganizationApprovalPolicy.appliesToDocKinds
 * and reuse these same two functions rather than rebuilding a gate.
 */

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

export interface ApprovalGateResult {
  allowed: boolean;
  reason?: string;
  policyMode: ApprovalPolicyMode;
  boardReviewId?: string;
  boardReviewDecision?: BoardReviewDecision | null;
}

/**
 * Orgs with no OrganizationApprovalPolicy row behave exactly like before
 * this phase existed — ADVISORY, always allowed. A policy only blocks
 * sending once an owner/admin has explicitly turned it on in Company
 * Settings for specific document kinds.
 */
export async function checkApprovalGate(organizationId: string, docKind: DocumentKind, docId: string): Promise<ApprovalGateResult> {
  const policy = await prisma.organizationApprovalPolicy.findUnique({ where: { organizationId } });
  const mode: ApprovalPolicyMode = policy?.mode ?? "ADVISORY";

  if (mode === "ADVISORY" || !policy || !policy.appliesToDocKinds.includes(docKind)) {
    return { allowed: true, policyMode: mode };
  }

  const boardReview = await prisma.boardReview.findFirst({
    where: { organizationId, docKind, docId },
    orderBy: { createdAt: "desc" },
    select: { id: true, finalDecision: true, overriddenAt: true },
  });

  if (boardReview?.overriddenAt) {
    return { allowed: true, policyMode: mode, boardReviewId: boardReview.id, boardReviewDecision: boardReview.finalDecision };
  }

  if (boardReview?.finalDecision === "APPROVED" || boardReview?.finalDecision === "APPROVED_WITH_CHANGES") {
    return { allowed: true, policyMode: mode, boardReviewId: boardReview.id, boardReviewDecision: boardReview.finalDecision };
  }

  const reason = !boardReview
    ? "This organization requires AI Board approval before sending — submit this document for a Board Review first."
    : boardReview.finalDecision === "REJECTED"
      ? "The AI Board rejected this document. Address the feedback, or ask an owner/admin to override."
      : boardReview.finalDecision === "NEEDS_REVISION"
        ? "The AI Board requested revisions. Update the document, or ask an owner/admin to override."
        : "The AI Board review is still in progress — wait for a final decision, or ask an owner/admin to override.";

  return { allowed: false, policyMode: mode, boardReviewId: boardReview?.id, boardReviewDecision: boardReview?.finalDecision ?? null, reason };
}

export interface BoardReviewPanelData {
  latestReviewId: string | null;
  finalDecision: BoardReviewDecision | null;
  meetingStatus: MeetingStatus | null;
  overallConfidence: number | null;
  winProbability: number | null;
  gateAllowed: boolean;
  gateReason: string | null;
  policyMode: ApprovalPolicyMode;
}

/**
 * One combined fetch powering the document detail pages' BoardReviewPanel —
 * the latest BoardReview for this doc plus the current approval-gate
 * verdict, in a single helper so the 4 document-type pages don't each
 * duplicate this query.
 */
export async function getBoardReviewPanelData(organizationId: string, docKind: DocumentKind, docId: string): Promise<BoardReviewPanelData> {
  const [latestReview, gate] = await Promise.all([
    prisma.boardReview.findFirst({
      where: { organizationId, docKind, docId },
      orderBy: { createdAt: "desc" },
      include: { meeting: { select: { status: true } } },
    }),
    checkApprovalGate(organizationId, docKind, docId),
  ]);

  return {
    latestReviewId: latestReview?.id ?? null,
    finalDecision: latestReview?.finalDecision ?? null,
    meetingStatus: latestReview?.meeting.status ?? null,
    overallConfidence: latestReview?.overallConfidence ?? null,
    winProbability: latestReview?.winProbability ?? null,
    gateAllowed: gate.allowed,
    gateReason: gate.reason ?? null,
    policyMode: gate.policyMode,
  };
}

export interface OverrideApprovalGateResult {
  ok: boolean;
  error?: string;
}

/**
 * Owner/admin override of a blocked send — requires a non-empty reason and
 * writes an immutable AuditLog entry (AuditLog is genuinely insert-only
 * across this codebase: one call site, no update/delete anywhere). Sets
 * BoardReview.overriddenAt/overriddenByUserId/overrideReason so
 * checkApprovalGate allows the send from then on.
 */
export async function overrideApprovalGate(params: {
  organizationId: string;
  boardReviewId: string;
  userId: string;
  reason: string;
}): Promise<OverrideApprovalGateResult> {
  const reason = params.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required to override the AI Board's review." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: params.userId, organizationId: params.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") return { ok: false, error: "You do not have access to this organization." };
  if (!PRIVILEGED_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can override the AI Board's decision." };

  const policy = await prisma.organizationApprovalPolicy.findUnique({ where: { organizationId: params.organizationId } });
  if (policy && !policy.allowOwnerOverride) {
    return { ok: false, error: "Owner override is disabled for this organization's approval policy." };
  }

  const boardReview = await prisma.boardReview.findUnique({ where: { id: params.boardReviewId } });
  if (!boardReview || boardReview.organizationId !== params.organizationId) {
    return { ok: false, error: "Board review not found." };
  }

  try {
    await prisma.boardReview.update({
      where: { id: params.boardReviewId },
      data: { overriddenAt: new Date(), overriddenByUserId: params.userId, overrideReason: reason },
    });

    await logAudit({
      userId: params.userId,
      organizationId: params.organizationId,
      action: "approval.override",
      metadata: {
        boardReviewId: params.boardReviewId,
        docKind: boardReview.docKind,
        docId: boardReview.docId,
        reason,
        previousDecision: boardReview.finalDecision,
      },
    });

    return { ok: true };
  } catch (error) {
    console.error("[approval-engine] overrideApprovalGate failed:", error);
    return { ok: false, error: "Something went wrong recording the override. Please try again." };
  }
}
