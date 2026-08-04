"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { notifyOrganizationOwners, notifyUser } from "@/lib/notifications";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError } from "@/lib/ai/client";
import { runMeetingRound, runMeetingDecisionVote, generateMeetingSummary, computeDecisionRiskLevel } from "@/lib/ai/meeting-orchestrator";
import { createDecisionSchema, type CreateDecisionInput } from "@/lib/validations/board";
import { trackNarrativeActionItemSchema, deriveTrackedActionItemFields } from "@/lib/validations/action-items";
import type { MeetingStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Lets the UI pick a specific banner instead of parsing the message string. */
  errorKind?: "not_connected" | "billing" | "generic";
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

const postMessageSchema = z.object({
  content: z.string().trim().min(1, "Write something before posting.").max(4000, "Keep it under 4000 characters."),
});

const overrideStatusSchema = z.enum(["APPROVED", "REJECTED"]);

/**
 * Every real Claude call this route triggers costs real money — this caps
 * how often one signed-in user can kick one off, independent of the
 * per-request auth/role checks below.
 */
function checkBoardAiRateLimit(userId: string): boolean {
  return checkRateLimit(`board-ai:${userId}`, { limit: 20, windowMs: 5 * 60_000 }).allowed;
}

/** Maps a caught error to the exact, honest banner the brief requires — never a generic crash, never fabricated content. */
function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return {
      ok: false,
      errorKind: "not_connected",
      error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment.",
    };
  }
  if (error instanceof AIBillingError) {
    return {
      ok: false,
      errorKind: "billing",
      error:
        "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing.",
    };
  }
  console.error("[board] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong running the AI board. Please try again." };
}

async function requireMeetingAccess(
  meetingId: string,
  userId: string,
  requirePrivileged: boolean,
): Promise<{ ok: true; organizationId: string; status: MeetingStatus } | { ok: false; error: string }> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, organizationId: true, status: true },
  });
  if (!meeting) return { ok: false, error: "Meeting not found." };

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: meeting.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You do not have access to this meeting." };
  }
  if (requirePrivileged && !PRIVILEGED_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can do this." };
  }
  return { ok: true, organizationId: meeting.organizationId, status: meeting.status };
}

/**
 * Runs one real-AI discussion round via the orchestrator. Restricted to
 * OWNER/ADMIN — same judgment call as starting/ending a meeting.
 */
export async function advanceMeeting(meetingId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireMeetingAccess(meetingId, userId, true);
  if (!access.ok) return access;
  if (access.status === "PAUSED") {
    return { ok: false, error: "This meeting is paused — resume it first." };
  }
  if (access.status !== "LIVE" && access.status !== "SCHEDULED") {
    return { ok: false, error: "This meeting has already ended." };
  }

  if (!checkBoardAiRateLimit(userId)) {
    return { ok: false, errorKind: "generic", error: "Too many AI rounds requested — wait a few minutes and try again." };
  }

  try {
    await runMeetingRound(meetingId);
  } catch (error) {
    return describeAIError(error);
  }

  await logAudit({ userId, organizationId: access.organizationId, action: "board.meeting_round_advanced", metadata: { meetingId } });
  revalidatePath(`/board/meetings/${meetingId}`);
  return { ok: true };
}

/**
 * Creates a Decision linked to this meeting, then immediately runs a real
 * agent vote on it. The Decision row is created either way (and the page
 * revalidated) so a failed vote still surfaces the PENDING decision plus an
 * honest error banner, rather than silently dropping the proposal.
 */
export async function proposeDecision(meetingId: string, input: CreateDecisionInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the decision details." };
  }

  const access = await requireMeetingAccess(meetingId, userId, true);
  if (!access.ok) return access;
  if (access.status === "PAUSED") {
    return { ok: false, error: "This meeting is paused — resume it first." };
  }
  if (access.status !== "LIVE") {
    return { ok: false, error: "Decisions can only be proposed while the meeting is live." };
  }

  if (!checkBoardAiRateLimit(userId)) {
    return { ok: false, errorKind: "generic", error: "Too many AI rounds requested — wait a few minutes and try again." };
  }

  let decisionId: string;
  try {
    const decision = await prisma.decision.create({
      data: {
        organizationId: access.organizationId,
        meetingId,
        topic: parsed.data.topic,
        description: parsed.data.description || null,
        category: parsed.data.category,
        financialImpact: parsed.data.financialImpact ?? null,
        // Deterministic, not AI-guessed — see computeDecisionRiskLevel's
        // doc comment. Grounds the board's vote in real stakes instead of
        // leaving escalation purely up to each agent's free choice.
        riskLevel: computeDecisionRiskLevel(parsed.data.category, parsed.data.financialImpact),
      },
    });
    decisionId = decision.id;
    await logActivity({
      organizationId: access.organizationId,
      type: "MEETING",
      description: `Decision proposed: "${decision.topic}".`,
      actorUserId: userId,
      metadata: { meetingId, decisionId: decision.id },
    });
  } catch (error) {
    console.error("[board] proposeDecision failed to create decision:", error);
    return { ok: false, errorKind: "generic", error: "Something went wrong proposing the decision. Please try again." };
  }

  try {
    await runMeetingDecisionVote(decisionId);
  } catch (error) {
    revalidatePath(`/board/meetings/${meetingId}`);
    return describeAIError(error);
  }

  await logAudit({
    userId,
    organizationId: access.organizationId,
    action: "board.decision_proposed",
    metadata: { meetingId, decisionId },
  });
  revalidatePath(`/board/meetings/${meetingId}`);
  return { ok: true };
}

/**
 * Ends the meeting: generateMeetingSummary already sets status COMPLETED,
 * stamps endedAt, stores the summary, and notifies org owners (MEETING_ENDED)
 * — verified by reading src/lib/ai/meeting-orchestrator.ts. This action only
 * adds auth/role gating and an AuditLog entry on top.
 */
export async function endMeeting(meetingId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireMeetingAccess(meetingId, userId, true);
  if (!access.ok) return access;
  if (access.status !== "LIVE" && access.status !== "SCHEDULED" && access.status !== "PAUSED") {
    return { ok: false, error: "This meeting has already ended." };
  }

  if (!checkBoardAiRateLimit(userId)) {
    return { ok: false, errorKind: "generic", error: "Too many AI rounds requested — wait a few minutes and try again." };
  }

  try {
    await generateMeetingSummary(meetingId);
  } catch (error) {
    return describeAIError(error);
  }

  await logAudit({ userId, organizationId: access.organizationId, action: "board.meeting_ended", metadata: { meetingId } });

  const endedMeeting = await prisma.meeting.findUnique({ where: { id: meetingId }, select: { title: true } });
  await evaluateAutomationRules(access.organizationId, "MEETING_ENDED", {
    subject: endedMeeting?.title ?? "Meeting",
    meetingId,
  });
  await fireWorkflowTrigger(access.organizationId, "MEETING_ENDED", { meetingId, title: endedMeeting?.title ?? "Meeting" });

  revalidatePath(`/board/meetings/${meetingId}`);
  return { ok: true };
}

/**
 * Lets the signed-in user post their own message into the live discussion —
 * a real human contribution, stored with senderUserId set (never attributed
 * to an agent). Open to any active member of the meeting's organization, not
 * just owners/admins — this is a general participant control, not a
 * privileged one.
 */
export async function postMeetingMessage(meetingId: string, content: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = postMessageSchema.safeParse({ content });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please write a message." };
  }

  const access = await requireMeetingAccess(meetingId, userId, false);
  if (!access.ok) return access;
  if (access.status === "PAUSED") {
    return { ok: false, error: "This meeting is paused — resume it first." };
  }
  if (access.status !== "LIVE") {
    return { ok: false, error: "You can only post to a live meeting's discussion." };
  }

  try {
    await prisma.meetingMessage.create({
      data: { meetingId, senderUserId: userId, type: "DISCUSSION", content: parsed.data.content },
    });
    await logActivity({
      organizationId: access.organizationId,
      type: "MEETING",
      description: `${session.user?.name ?? "A team member"} posted a message in the meeting.`,
      actorUserId: userId,
      metadata: { meetingId },
    });
  } catch (error) {
    console.error("[board] postMeetingMessage failed:", error);
    return { ok: false, error: "Something went wrong posting your message. Please try again." };
  }

  revalidatePath(`/board/meetings/${meetingId}`);
  return { ok: true };
}

/**
 * Explicit human override from the brief: an OWNER/ADMIN can directly
 * approve or reject a PENDING decision, bypassing agent voting entirely.
 * Sets Decision.status and finalizedAt directly — this is not a bug, it's
 * the documented "human has the final say" control.
 */
export async function userDecideOverride(decisionId: string, status: "APPROVED" | "REJECTED"): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsedStatus = overrideStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Invalid decision outcome." };

  const decision = await prisma.decision.findUnique({ where: { id: decisionId } });
  if (!decision) return { ok: false, error: "Decision not found." };
  // ESCALATED is exactly the state that needs a human decision — it must
  // stay overridable, not treated as already-finalized like APPROVED/
  // REJECTED/DELAYED/DELEGATED are.
  if (decision.status !== "PENDING" && decision.status !== "ESCALATED") {
    return { ok: false, error: "This decision has already been finalized." };
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: decision.organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return { ok: false, error: "You do not have access to this decision." };
  }
  if (!PRIVILEGED_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can override a decision." };
  }

  try {
    await prisma.decision.update({
      where: { id: decisionId },
      data: { status: parsedStatus.data, finalizedAt: new Date() },
    });
    await logActivity({
      organizationId: decision.organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} overrode decision "${decision.topic}" as ${parsedStatus.data} (human override).`,
      actorUserId: userId,
      metadata: { decisionId, status: parsedStatus.data },
    });
    await notifyOrganizationOwners({
      organizationId: decision.organizationId,
      type: "DECISION_MADE",
      title: `Decision finalized: ${decision.topic}`,
      message: `A human owner/admin overrode this decision as ${parsedStatus.data}, bypassing agent voting.`,
    });
    await logAudit({
      userId,
      organizationId: decision.organizationId,
      action: "board.decision_overridden",
      metadata: { decisionId, status: parsedStatus.data },
    });
    await evaluateAutomationRules(decision.organizationId, "DECISION_MADE", {
      subject: decision.topic,
      decisionId,
    });
    await fireWorkflowTrigger(decision.organizationId, "DECISION_MADE", { decisionId, topic: decision.topic, status: parsedStatus.data, meetingId: decision.meetingId });
  } catch (error) {
    console.error("[board] userDecideOverride failed:", error);
    return { ok: false, error: "Something went wrong finalizing the decision. Please try again." };
  }

  if (decision.meetingId) revalidatePath(`/board/meetings/${decision.meetingId}`);
  return { ok: true };
}

/**
 * War Room owner control: freezes AI rounds, decisions, and human posts
 * (see the PAUSED gates added to advanceMeeting/proposeDecision/
 * postMeetingMessage above) without ending the meeting. Privileged only.
 */
export async function pauseMeeting(meetingId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireMeetingAccess(meetingId, userId, true);
  if (!access.ok) return access;
  if (access.status !== "LIVE") {
    return { ok: false, error: "Only a live meeting can be paused." };
  }

  await prisma.meeting.update({ where: { id: meetingId }, data: { status: "PAUSED" } });
  await logAudit({ userId, organizationId: access.organizationId, action: "board.meeting_paused", metadata: { meetingId } });
  revalidatePath(`/board/meetings/${meetingId}`);
  return { ok: true };
}

export async function resumeMeeting(meetingId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireMeetingAccess(meetingId, userId, true);
  if (!access.ok) return access;
  if (access.status !== "PAUSED") {
    return { ok: false, error: "This meeting isn't paused." };
  }

  await prisma.meeting.update({ where: { id: meetingId }, data: { status: "LIVE" } });
  await logAudit({ userId, organizationId: access.organizationId, action: "board.meeting_resumed", metadata: { meetingId } });
  revalidatePath(`/board/meetings/${meetingId}`);
  return { ok: true };
}

/**
 * Links this meeting to a real Lead — the honest, non-fabricated basis for
 * the War Room's "Revenue Opportunity" stat (Lead.estimatedValue). Pass
 * `null` to unlink. Privileged only, same bar as other meeting-level edits.
 */
export async function linkMeetingLead(meetingId: string, leadId: string | null): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireMeetingAccess(meetingId, userId, true);
  if (!access.ok) return access;

  if (leadId) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { pipelineStage: { include: { workspace: true } } },
    });
    if (!lead || lead.pipelineStage.workspace.organizationId !== access.organizationId) {
      return { ok: false, error: "Lead not found." };
    }
  }

  await prisma.meeting.update({ where: { id: meetingId }, data: { relatedLeadId: leadId } });
  await logAudit({
    userId,
    organizationId: access.organizationId,
    action: "board.meeting_lead_linked",
    metadata: { meetingId, leadId },
  });
  revalidatePath(`/board/meetings/${meetingId}`);
  return { ok: true };
}

/**
 * Promotes one narrative action-item sentence from generateMeetingSummary's
 * structured notes (Meeting.notesJson.actionItems[], rendered read-only by
 * MeetingNotes) into a real, trackable ActionItem row. Restricted to
 * OWNER/ADMIN, same bar as assigning a Task from the War Room's owner
 * controls — this is the same kind of "decide what the org tracks" action.
 */
export async function convertMeetingActionItemToTracked(
  meetingId: string,
  narrativeText: string,
  assignedToUserId?: string,
): Promise<ActionResult & { actionItemId?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = trackNarrativeActionItemSchema.safeParse({ narrativeText, assignedToUserId });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Nothing to track." };
  }

  const access = await requireMeetingAccess(meetingId, userId, true);
  if (!access.ok) return access;

  let assigneeUserId: string | null = null;
  if (parsed.data.assignedToUserId) {
    const assigneeMembership = await prisma.membership.findFirst({
      where: { userId: parsed.data.assignedToUserId, organizationId: access.organizationId, status: "ACTIVE" },
      select: { userId: true },
    });
    if (!assigneeMembership) return { ok: false, error: "That team member could not be found." };
    assigneeUserId = assigneeMembership.userId;
  }

  const { title, description } = deriveTrackedActionItemFields(parsed.data.narrativeText);

  try {
    const actionItem = await prisma.actionItem.create({
      data: {
        organizationId: access.organizationId,
        meetingId,
        title,
        description,
        assignedToUserId: assigneeUserId,
      },
    });

    await logActivity({
      organizationId: access.organizationId,
      type: "MEETING",
      description: `${session.user?.name ?? "A team member"} tracked an action item from the meeting summary: "${title}".`,
      actorUserId: userId,
      metadata: { meetingId, actionItemId: actionItem.id },
    });
    await logAudit({
      userId,
      organizationId: access.organizationId,
      action: "board.action_item_tracked",
      metadata: { meetingId, actionItemId: actionItem.id },
    });

    if (assigneeUserId) {
      await notifyUser({
        userId: assigneeUserId,
        organizationId: access.organizationId,
        type: "TASK_ASSIGNED",
        title: "New action item assigned to you",
        message: title,
      });
    }

    revalidatePath(`/board/meetings/${meetingId}`);
    revalidatePath("/board/action-items");
    return { ok: true, actionItemId: actionItem.id };
  } catch (error) {
    console.error("[board] convertMeetingActionItemToTracked failed:", error);
    return { ok: false, error: "Something went wrong tracking this action item. Please try again." };
  }
}
