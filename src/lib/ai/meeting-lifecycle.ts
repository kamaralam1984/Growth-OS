import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { emailOrganizationOwners } from "@/lib/email";
import { isAIConnected } from "@/lib/ai/client";
import { runMeetingRound, generateMeetingSummary } from "@/lib/ai/meeting-orchestrator";
import { EXECUTIVE_AGENT_TYPES } from "@/lib/ai/personas";

const ROUNDS_PER_SYSTEM_MEETING = 3;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Headless equivalent of the human-triggered createMeeting Server Action
 * (src/app/board/meetings/actions.ts), used by the Scheduler Service's
 * daily-executive-board-meeting job. Mirrors its meeting-creation logic
 * exactly (LIVE status, agent participants, owner notification/email,
 * activity + audit log) but is called with no session — the org's longest-
 * tenured OWNER stands in as createdById/actor, and the event is tagged
 * `triggeredBy: "scheduler"` in both logs so it's never confused with a
 * human-started meeting when reviewing history.
 *
 * Returns null (and does nothing) when the org has no OWNER, no active
 * executive agents, or already had a system-triggered meeting created today
 * — this is the job's own idempotency guard, since node-cron delivers "at
 * most approximately once" not "exactly once".
 */
export async function startSystemTriggeredExecutiveMeeting(
  organizationId: string,
): Promise<{ meetingId: string; skippedReason?: never } | { meetingId?: never; skippedReason: string }> {
  const owner = await prisma.membership.findFirst({
    where: { organizationId, status: "ACTIVE", role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return { skippedReason: "no active OWNER membership" };

  const agents = await prisma.aIAgentInstance.findMany({
    where: { organizationId, active: true, type: { in: EXECUTIVE_AGENT_TYPES } },
    select: { id: true },
  });
  if (agents.length === 0) return { skippedReason: "no active executive agents" };

  const already = await prisma.meeting.findFirst({
    where: {
      organizationId,
      createdAt: { gte: startOfDay(new Date()) },
      title: { startsWith: "Daily Executive Board Sync" },
    },
    select: { id: true },
  });
  if (already) return { skippedReason: "already ran today" };

  if (!isAIConnected()) return { skippedReason: "ANTHROPIC_API_KEY not configured" };

  const userId = owner.userId;
  const title = `Daily Executive Board Sync — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const agenda =
    "Automatic daily sync: review yesterday's progress, today's priorities, open risks, and any decisions that need owner attention.";

  const meeting = await prisma.meeting.create({
    data: {
      organizationId,
      title,
      agenda,
      status: "LIVE",
      startedAt: new Date(),
      createdById: userId,
      participants: { create: [...agents.map((agent) => ({ agentId: agent.id })), { userId }] },
    },
  });

  await logActivity({
    organizationId,
    type: "MEETING",
    description: `Meeting "${meeting.title}" started automatically by the Scheduler Service.`,
    actorUserId: userId,
    metadata: { meetingId: meeting.id, triggeredBy: "scheduler" },
  });
  await notifyOrganizationOwners({
    organizationId,
    type: "MEETING_STARTED",
    title: `Meeting started: ${meeting.title}`,
    message: agenda,
  });
  await emailOrganizationOwners({
    organizationId,
    subject: `Meeting started: ${meeting.title}`,
    text: `Your AI Executive Board started its daily sync automatically.\n\nAgenda: ${agenda}`,
  });
  await logAudit({
    userId,
    organizationId,
    action: "board.meeting_created",
    metadata: { meetingId: meeting.id, triggeredBy: "scheduler" },
  });

  for (let round = 0; round < ROUNDS_PER_SYSTEM_MEETING; round += 1) {
    await runMeetingRound(meeting.id);
  }
  await generateMeetingSummary(meeting.id);

  return { meetingId: meeting.id };
}
