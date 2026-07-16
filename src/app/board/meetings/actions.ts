"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { logActivity } from "@/lib/activity";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { emailOrganizationOwners } from "@/lib/email";
import { EXECUTIVE_AGENT_TYPES } from "@/lib/ai/personas";
import { createMeetingSchema, type CreateMeetingInput } from "@/lib/validations/board";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const PRIVILEGED_ROLES = new Set(["OWNER", "ADMIN"]);

/**
 * Starts a new board meeting: creates the Meeting as LIVE (this Server
 * Action treats "created" and "started" as the same moment — a human
 * pressing "Start new meeting" is the thing that makes it live, not the
 * first AI round), seats every active executive AIAgentInstance plus the
 * creating user as participants, notifies the org's owners/admins, and logs
 * both an Activity (timeline) and an AuditLog entry.
 *
 * Judgment call: restricted to OWNER/ADMIN, matching the brief's default for
 * meeting start/stop and task assignment.
 */
export async function createMeeting(input: CreateMeetingInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createMeetingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the meeting details." };
  }

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  if (!PRIVILEGED_ROLES.has(membership.role)) {
    return { ok: false, error: "Only owners and admins can start a board meeting." };
  }

  const organizationId = membership.organizationId;

  let meetingId: string;
  try {
    const agents = await prisma.aIAgentInstance.findMany({
      where: {
        organizationId,
        active: true,
        type: { in: EXECUTIVE_AGENT_TYPES },
      },
      select: { id: true },
    });

    const meeting = await prisma.meeting.create({
      data: {
        organizationId,
        title: parsed.data.title,
        agenda: parsed.data.agenda,
        status: "LIVE",
        startedAt: new Date(),
        createdById: userId,
        participants: {
          create: [...agents.map((agent) => ({ agentId: agent.id })), { userId }],
        },
      },
    });
    meetingId = meeting.id;

    await logActivity({
      organizationId,
      type: "MEETING",
      description: `Meeting "${meeting.title}" started by ${session.user?.name ?? "a team member"}.`,
      actorUserId: userId,
      metadata: { meetingId: meeting.id },
    });
    await notifyOrganizationOwners({
      organizationId,
      type: "MEETING_STARTED",
      title: `Meeting started: ${meeting.title}`,
      message: meeting.agenda,
    });
    await emailOrganizationOwners({
      organizationId,
      subject: `Meeting started: ${meeting.title}`,
      text: `Your AI Executive Board started a meeting.\n\nAgenda: ${meeting.agenda}`,
    });
    await logAudit({
      userId,
      organizationId,
      action: "board.meeting_created",
      metadata: { meetingId: meeting.id },
    });
  } catch (error) {
    console.error("[board] createMeeting failed:", error);
    return { ok: false, error: "Something went wrong starting the meeting. Please try again." };
  }

  redirect(`/board/meetings/${meetingId}`);
}
