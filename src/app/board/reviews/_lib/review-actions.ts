"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError } from "@/lib/ai/client";
import { scheduleBoardReview, runReviewRound, runReviewVote } from "@/lib/ai/review-orchestrator";
import { overrideApprovalGate } from "@/lib/approval-engine";
import {
  pauseMeeting as pauseMeetingAction,
  resumeMeeting as resumeMeetingAction,
  postMeetingMessage as postMeetingMessageAction,
  endMeeting as endMeetingAction,
  userDecideOverride as userDecideOverrideAction,
} from "@/app/board/meetings/[id]/actions";
import type { DocumentKind } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Lets the UI pick a specific banner instead of parsing the message string — same contract as the War Room's board actions. */
  errorKind?: "not_connected" | "billing" | "generic";
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

/** Every real Claude call this route triggers costs real money — same per-user cap as the War Room's checkBoardAiRateLimit, kept under a distinct key so the two features don't share one budget. */
function checkReviewAiRateLimit(userId: string): boolean {
  return checkRateLimit(`review-ai:${userId}`, { limit: 20, windowMs: 5 * 60_000 }).allowed;
}

/** Maps a caught error to the exact, honest banner the brief requires — reused verbatim from the War Room's describeAIError contract so AiErrorBanner works unmodified here. */
function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return {
      ok: false,
      errorKind: "not_connected",
      error: "AI Board is unavailable until an LLM provider is connected.",
    };
  }
  if (error instanceof AIBillingError) {
    return {
      ok: false,
      errorKind: "billing",
      error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing.",
    };
  }
  console.error("[board/reviews] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong running the AI Board. Please try again." };
}

async function requireReviewAccess(
  boardReviewId: string,
  userId: string,
  requirePrivileged: boolean,
): Promise<{ ok: true; organizationId: string; meetingId: string } | { ok: false; error: string }> {
  const boardReview = await prisma.boardReview.findUnique({
    where: { id: boardReviewId },
    select: { id: true, organizationId: true, meetingId: true },
  });
  if (!boardReview) return { ok: false, error: "Board review not found." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: boardReview.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You do not have access to this review." };
  }
  if (requirePrivileged && !PRIVILEGED_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can do this." };
  }
  return { ok: true, organizationId: boardReview.organizationId, meetingId: boardReview.meetingId };
}

/**
 * The single public entry point for requesting an AI Proposal Review Board
 * review — used both by the "Submit for Board Review" button on a document
 * detail page (fresh request, e.g. re-requesting after edits) and could be
 * called again for the same document (each call schedules a new Meeting/
 * BoardReview; nothing is silently overwritten, same "every save is a new
 * version" discipline as the rest of this app).
 */
export async function requestBoardReview(docKind: DocumentKind, docId: string): Promise<ActionResult & { boardReviewId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!PRIVILEGED_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can request an AI Board review." };
  }

  try {
    const { boardReviewId } = await scheduleBoardReview({
      organizationId: membership.organizationId,
      docKind,
      docId,
      requestedByUserId: userId,
    });
    await logAudit({ userId, organizationId: membership.organizationId, action: "board_review.scheduled", metadata: { boardReviewId, docKind, docId } });
    return { ok: true, boardReviewId };
  } catch (error) {
    console.error("[board/reviews] requestBoardReview failed:", error);
    return { ok: false, error: "Something went wrong scheduling the review. Please try again." };
  }
}

/** Same action as requestBoardReview, but redirects straight into the Review Room — used by the document detail page's primary CTA. */
export async function requestBoardReviewAndOpen(docKind: DocumentKind, docId: string): Promise<ActionResult> {
  const result = await requestBoardReview(docKind, docId);
  if (!result.ok || !result.boardReviewId) return result;
  redirect(`/board/reviews/${result.boardReviewId}`);
}

/** Runs one real-AI review round. Restricted to OWNER/ADMIN, matching the War Room's advanceMeeting bar. */
export async function advanceReviewRound(boardReviewId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireReviewAccess(boardReviewId, userId, true);
  if (!access.ok) return access;

  if (!checkReviewAiRateLimit(userId)) {
    return { ok: false, errorKind: "generic", error: "Too many AI rounds requested — wait a few minutes and try again." };
  }

  try {
    await runReviewRound(boardReviewId);
  } catch (error) {
    return describeAIError(error);
  }

  await logAudit({ userId, organizationId: access.organizationId, action: "board_review.round_advanced", metadata: { boardReviewId } });
  return { ok: true };
}

/** Runs the real-AI final vote, tallying to one of the 4 BoardReviewDecision outcomes. Restricted to OWNER/ADMIN. */
export async function finalizeReviewVote(boardReviewId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireReviewAccess(boardReviewId, userId, true);
  if (!access.ok) return access;

  if (!checkReviewAiRateLimit(userId)) {
    return { ok: false, errorKind: "generic", error: "Too many AI rounds requested — wait a few minutes and try again." };
  }

  try {
    await runReviewVote(boardReviewId);
  } catch (error) {
    return describeAIError(error);
  }

  await logAudit({ userId, organizationId: access.organizationId, action: "board_review.vote_finalized", metadata: { boardReviewId } });
  return { ok: true };
}

// Pause/Resume/Ask-a-question/End-&-Summarize/Override are pure meetingId/
// decisionId operations with no War-Room-specific logic — reused directly
// (thin async wrappers, not a `export { } from` re-export, since a "use
// server" file's exports must each be a locally-defined async function)
// rather than re-implemented, so Review Room components only ever import
// from this one actions module.
export async function pauseReviewMeeting(meetingId: string): Promise<ActionResult> {
  return pauseMeetingAction(meetingId);
}

export async function resumeReviewMeeting(meetingId: string): Promise<ActionResult> {
  return resumeMeetingAction(meetingId);
}

export async function postReviewMessage(meetingId: string, content: string): Promise<ActionResult> {
  return postMeetingMessageAction(meetingId, content);
}

export async function endReviewMeeting(meetingId: string): Promise<ActionResult> {
  return endMeetingAction(meetingId);
}

export async function overrideReviewDecision(decisionId: string, status: "APPROVED" | "REJECTED"): Promise<ActionResult> {
  return userDecideOverrideAction(decisionId, status);
}

/**
 * Owner/admin override of a blocked "Send to client" — the ApprovalOverrideDialog's
 * submit action. Resolves organizationId from the BoardReview row itself
 * (never trusts a client-supplied org id) before delegating to the Approval
 * Engine, which does the actual RBAC + reason-required + AuditLog write.
 */
export async function submitApprovalOverride(boardReviewId: string, reason: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const boardReview = await prisma.boardReview.findUnique({ where: { id: boardReviewId }, select: { organizationId: true } });
  if (!boardReview) return { ok: false, error: "Board review not found." };

  return overrideApprovalGate({ organizationId: boardReview.organizationId, boardReviewId, userId, reason });
}
