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

const ROUNDS_PER_DNA_MEETING = 3;

/**
 * Sibling of startSystemTriggeredExecutiveMeeting, for the AI Company
 * Understanding Engine (src/lib/company-discovery/pipeline.ts) — same
 * mechanics (LIVE meeting, real executive-agent participants, runMeetingRound
 * / generateMeetingSummary unchanged), but the agenda is seeded from the
 * freshly-generated Company DNA's business understanding instead of a fixed
 * "yesterday's progress" string, and there's no "already ran today" guard
 * (this runs at most once per discovery run, never on a cron). Called
 * automatically as part of the discovery pipeline, BEFORE the owner reviews
 * the DNA — per the approved pipeline order, the meeting's strategic output
 * is itself part of what gets reviewed, not a live config change, so it's
 * safe to run unattended.
 */
export async function startCompanyDNAExecutiveMeeting(params: {
  organizationId: string;
  companyName: string;
  businessSummary: string;
}): Promise<{ meetingId: string; skippedReason?: never } | { meetingId?: never; skippedReason: string }> {
  const owner = await prisma.membership.findFirst({
    where: { organizationId: params.organizationId, status: "ACTIVE", role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { userId: true },
  });
  if (!owner) return { skippedReason: "no active OWNER membership" };

  const agents = await prisma.aIAgentInstance.findMany({
    where: { organizationId: params.organizationId, active: true, type: { in: EXECUTIVE_AGENT_TYPES } },
    select: { id: true },
  });
  if (agents.length === 0) return { skippedReason: "no active executive agents" };

  if (!isAIConnected()) return { skippedReason: "ANTHROPIC_API_KEY not configured" };

  const userId = owner.userId;
  const title = `Company DNA Review — ${params.companyName}`;
  const agenda = `The AI Company Understanding Engine finished analyzing ${params.companyName}. Business summary: ${params.businessSummary}. Each executive should review this profile from their own role's perspective and recommend strategy, priorities, and risks.`;

  const meeting = await prisma.meeting.create({
    data: {
      organizationId: params.organizationId,
      title,
      agenda,
      status: "LIVE",
      startedAt: new Date(),
      createdById: userId,
      participants: { create: [...agents.map((agent) => ({ agentId: agent.id })), { userId }] },
    },
  });

  await logActivity({
    organizationId: params.organizationId,
    type: "MEETING",
    description: `Meeting "${meeting.title}" started automatically by the AI Company Understanding Engine.`,
    actorUserId: userId,
    metadata: { meetingId: meeting.id, triggeredBy: "company-discovery" },
  });
  await logAudit({
    userId,
    organizationId: params.organizationId,
    action: "board.meeting_created",
    metadata: { meetingId: meeting.id, triggeredBy: "company-discovery" },
  });

  for (let round = 0; round < ROUNDS_PER_DNA_MEETING; round += 1) {
    await runMeetingRound(meeting.id);
  }
  await generateMeetingSummary(meeting.id);

  return { meetingId: meeting.id };
}
