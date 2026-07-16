"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { emailOrganizationOwners } from "@/lib/email";
import { AINotConnectedError, AIBillingError } from "@/lib/ai/client";
import { startDeliveryBoardMeeting, runDeliveryBoardRound, runDeliveryBoardDecisionVote } from "@/lib/ai/delivery-board-orchestrator";
import { buildDeliveryReportSummary } from "@/lib/projects/delivery-report";
import { createDecisionSchema, type CreateDecisionInput } from "@/lib/validations/board";
import {
  pauseMeeting as pauseMeetingAction,
  resumeMeeting as resumeMeetingAction,
  postMeetingMessage as postMeetingMessageAction,
  endMeeting as endMeetingAction,
  userDecideOverride as userDecideOverrideAction,
} from "@/app/board/meetings/[id]/actions";
import type { MeetingStatus, DeliveryReportType } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

/** Every real Claude call this route triggers costs real money — same per-user cap as War Room's checkBoardAiRateLimit and Review Board's checkReviewAiRateLimit, kept under a distinct key so the three boards don't share one budget. */
function checkDeliveryAiRateLimit(userId: string): boolean {
  return checkRateLimit(`delivery-ai:${userId}`, { limit: 20, windowMs: 5 * 60_000 }).allowed;
}

function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return { ok: false, errorKind: "not_connected", error: "AI Delivery Board is unavailable until an LLM provider is connected." };
  }
  if (error instanceof AIBillingError) {
    return { ok: false, errorKind: "billing", error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing." };
  }
  console.error("[projects/delivery] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong running the AI Delivery Board. Please try again." };
}

async function requireProjectAccess(
  projectId: string,
  userId: string,
  requirePrivileged: boolean,
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
  if (!project || project.organizationId !== membership.organizationId) return { ok: false, error: "Project not found." };
  if (requirePrivileged && !PRIVILEGED_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can do this." };
  return { ok: true, organizationId: membership.organizationId };
}

async function requireMeetingAccess(
  meetingId: string,
  userId: string,
  requirePrivileged: boolean,
): Promise<{ ok: true; organizationId: string; status: MeetingStatus; projectId: string | null } | { ok: false; error: string }> {
  const meeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { organizationId: true, status: true, relatedProjectId: true } });
  if (!meeting) return { ok: false, error: "Meeting not found." };
  const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: meeting.organizationId } } });
  if (!membership || membership.status !== "ACTIVE") return { ok: false, error: "You do not have access to this meeting." };
  if (requirePrivileged && !PRIVILEGED_ROLES.has(membership.role)) return { ok: false, error: "Only owners and admins can do this." };
  return { ok: true, organizationId: meeting.organizationId, status: meeting.status, projectId: meeting.relatedProjectId };
}

export interface StartMeetingResult extends ActionResult {
  meetingId?: string;
}

export async function startMeeting(projectId: string): Promise<StartMeetingResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireProjectAccess(projectId, userId, true);
  if (!access.ok) return access;

  try {
    const { meetingId } = await startDeliveryBoardMeeting(projectId, userId);
    await logAudit({ userId, organizationId: access.organizationId, action: "delivery_board.meeting_started", metadata: { meetingId, projectId } });
    revalidatePath(`/dashboard/projects/${projectId}/delivery`);
    return { ok: true, meetingId };
  } catch (error) {
    console.error("[projects/delivery] startMeeting failed:", error);
    return { ok: false, errorKind: "generic", error: "Something went wrong starting the Delivery Board meeting. Please try again." };
  }
}

export async function advanceDeliveryRound(meetingId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireMeetingAccess(meetingId, userId, true);
  if (!access.ok) return access;
  if (access.status === "PAUSED") return { ok: false, error: "This meeting is paused — resume it first." };
  if (access.status !== "LIVE" && access.status !== "SCHEDULED") return { ok: false, error: "This meeting has already ended." };

  if (!checkDeliveryAiRateLimit(userId)) {
    return { ok: false, errorKind: "generic", error: "Too many AI rounds requested — wait a few minutes and try again." };
  }

  try {
    await runDeliveryBoardRound(meetingId);
  } catch (error) {
    return describeAIError(error);
  }

  await logAudit({ userId, organizationId: access.organizationId, action: "delivery_board.round_advanced", metadata: { meetingId } });
  revalidatePath(`/dashboard/projects/${access.projectId}/delivery`);
  return { ok: true };
}

/** Creates a real Decision (category PROJECT_DELIVERY) tied to this Delivery Board meeting — deliberately does not auto-vote (unlike War Room's proposeDecision), matching Review Board's discuss-first-then-finalize-separately flow. */
export async function proposeDeliveryDecision(meetingId: string, input: CreateDecisionInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the decision details." };

  const access = await requireMeetingAccess(meetingId, userId, true);
  if (!access.ok) return access;
  if (access.status === "PAUSED") return { ok: false, error: "This meeting is paused — resume it first." };
  if (access.status !== "LIVE") return { ok: false, error: "Decisions can only be proposed while the meeting is live." };

  try {
    const decision = await prisma.decision.create({
      data: {
        organizationId: access.organizationId,
        meetingId,
        topic: parsed.data.topic,
        description: parsed.data.description || null,
        category: "PROJECT_DELIVERY",
      },
    });
    await logActivity({
      organizationId: access.organizationId,
      type: "MEETING",
      description: `Delivery decision proposed: "${decision.topic}".`,
      actorUserId: userId,
      metadata: { meetingId, decisionId: decision.id },
    });
    await logAudit({ userId, organizationId: access.organizationId, action: "delivery_board.decision_proposed", metadata: { meetingId, decisionId: decision.id } });
    revalidatePath(`/dashboard/projects/${access.projectId}/delivery`);
    return { ok: true };
  } catch (error) {
    console.error("[projects/delivery] proposeDeliveryDecision failed:", error);
    return { ok: false, errorKind: "generic", error: "Something went wrong proposing the decision. Please try again." };
  }
}

export async function finalizeDeliveryVote(decisionId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const decision = await prisma.decision.findUnique({ where: { id: decisionId }, select: { organizationId: true, meetingId: true, status: true } });
  if (!decision) return { ok: false, error: "Decision not found." };
  const membership = await prisma.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: decision.organizationId } } });
  if (!membership || membership.status !== "ACTIVE" || !PRIVILEGED_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can do this." };
  }
  if (decision.status !== "PENDING") return { ok: false, error: "This decision has already been finalized." };

  if (!checkDeliveryAiRateLimit(userId)) {
    return { ok: false, errorKind: "generic", error: "Too many AI rounds requested — wait a few minutes and try again." };
  }

  try {
    await runDeliveryBoardDecisionVote(decisionId);
  } catch (error) {
    return describeAIError(error);
  }

  await logAudit({ userId, organizationId: decision.organizationId, action: "delivery_board.vote_finalized", metadata: { decisionId } });
  const meeting = decision.meetingId ? await prisma.meeting.findUnique({ where: { id: decision.meetingId }, select: { relatedProjectId: true } }) : null;
  if (meeting?.relatedProjectId) revalidatePath(`/dashboard/projects/${meeting.relatedProjectId}/delivery`);
  return { ok: true };
}

/**
 * Generates a real delivery report from real project data (no LLM call,
 * zero fabricated content — see buildDeliveryReportSummary), logs a
 * DeliveryReport row, and emails org owners. sendEmail has no attachment
 * support, so the email body is the real summary plus a link back to the
 * project's Delivery Board — never a fake PDF attachment.
 */
export async function sendDeliveryReport(projectId: string, type: DeliveryReportType): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireProjectAccess(projectId, userId, true);
  if (!access.ok) return access;

  try {
    const { summary, projectName, organizationId } = await buildDeliveryReportSummary(projectId, type);

    const owners = await prisma.membership.findMany({
      where: { organizationId, status: "ACTIVE", role: { in: ["OWNER", "ADMIN"] } },
      select: { userId: true },
    });

    await prisma.deliveryReport.create({
      data: { organizationId, projectId, type, summary, recipientCount: owners.length, createdByUserId: userId },
    });

    await emailOrganizationOwners({
      organizationId,
      subject: `${type.replace(/_/g, " ")} delivery report: ${projectName}`,
      text: `${summary}\n\nFull details on the project's Delivery Board.`,
    });

    await logAudit({ userId, organizationId, action: "delivery_board.report_sent", metadata: { projectId, type, recipientCount: owners.length } });
    revalidatePath(`/dashboard/projects/${projectId}/delivery`);
    return { ok: true };
  } catch (error) {
    console.error("[projects/delivery] sendDeliveryReport failed:", error);
    return { ok: false, errorKind: "generic", error: "Something went wrong generating the report. Please try again." };
  }
}

// Pause/Resume/Ask-a-question/End-&-Summarize/Override are pure meetingId/
// decisionId operations with no board-specific logic — reused directly (thin
// async wrappers, not `export {} from`, since a "use server" file's exports
// must each be a locally-defined async function), exact pattern
// review-actions.ts already established for the Review Board.
export async function pauseDeliveryMeeting(meetingId: string): Promise<ActionResult> {
  return pauseMeetingAction(meetingId);
}

export async function resumeDeliveryMeeting(meetingId: string): Promise<ActionResult> {
  return resumeMeetingAction(meetingId);
}

export async function postDeliveryMessage(meetingId: string, content: string): Promise<ActionResult> {
  return postMeetingMessageAction(meetingId, content);
}

export async function endDeliveryMeeting(meetingId: string): Promise<ActionResult> {
  return endMeetingAction(meetingId);
}

export async function overrideDeliveryDecision(decisionId: string, status: "APPROVED" | "REJECTED"): Promise<ActionResult> {
  return userDecideOverrideAction(decisionId, status);
}
