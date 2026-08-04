import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { emailOrganizationOwners } from "@/lib/email";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { runMeetingAgentTurn, runDeliveryVoteTurn } from "@/lib/ai/agent-runtime";
import { DELIVERY_BOARD_AGENT_TYPES, getDeliveryBoardPersonas, type ExecutiveAgentType } from "@/lib/ai/personas";
import { buildProjectContext } from "@/lib/ai/project-manager-orchestrator";
import type { AIAgentInstance, DecisionStatus, VoteChoice, RecommendationType } from "@/generated/prisma/client";

const OPEN_TASK_STATUSES = ["PENDING", "RUNNING", "BLOCKED", "BACKLOG", "REVIEW", "TESTING", "READY_FOR_CLIENT"] as const;

function isDeliveryBoardAgentType(type: string): type is ExecutiveAgentType {
  return (DELIVERY_BOARD_AGENT_TYPES as readonly string[]).includes(type);
}

/** Idempotent upsert of the 5 delivery-board agent types — mirrors ensureReviewBoardAgentsProvisioned's fixed batch-idempotency logic exactly. PROJECT_MANAGER/CEO are typically already provisioned by earlier phases and simply no-op here. */
export async function ensureDeliveryBoardAgentsProvisioned(organizationId: string): Promise<void> {
  const existing = await prisma.aIAgentInstance.findMany({
    where: { organizationId, type: { in: DELIVERY_BOARD_AGENT_TYPES } },
    select: { type: true },
  });
  const existingTypes = new Set(existing.map((a) => a.type));
  const missing = getDeliveryBoardPersonas().filter((p) => !existingTypes.has(p.type));
  if (missing.length === 0) return;

  await prisma.$transaction(
    missing.map((persona) =>
      prisma.aIAgentInstance.upsert({
        where: { organizationId_type: { organizationId, type: persona.type } },
        create: {
          organizationId,
          type: persona.type,
          name: persona.title,
          introMessage: `I'm your ${persona.title.replace(" Agent", "")} on this project's AI Delivery Board — ${persona.responsibilities.slice(0, 3).join(", ").toLowerCase()}.`,
        },
        update: {},
      }),
    ),
  );
}

const AGENDA_ITEMS = [
  "Yesterday's progress",
  "Today's goals",
  "Blocked tasks",
  "Critical risks",
  "Quality status",
  "Deployment readiness",
  "Upcoming deadlines",
  "Budget",
  "Client feedback",
  "Resource issues",
] as const;

export interface StartDeliveryBoardMeetingResult {
  meetingId: string;
}

/** Creates a SCHEDULED (not immediately LIVE) Delivery Board meeting for one project — the first runDeliveryBoardRound call transitions it to LIVE with the real MEETING_STARTED notification, same pattern runMeetingRound already implements for a SCHEDULED meeting. */
export async function startDeliveryBoardMeeting(projectId: string, userId: string): Promise<StartDeliveryBoardMeetingResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, organizationId: true } });
  if (!project) throw new Error("Project not found.");

  await ensureDeliveryBoardAgentsProvisioned(project.organizationId);

  const agents = await prisma.aIAgentInstance.findMany({
    where: { organizationId: project.organizationId, active: true, type: { in: DELIVERY_BOARD_AGENT_TYPES } },
    select: { id: true },
  });

  const agenda = `Daily delivery standup for "${project.name}".\n\nAgenda:\n${AGENDA_ITEMS.map((item) => `- ${item}`).join("\n")}`;

  const meeting = await prisma.meeting.create({
    data: {
      organizationId: project.organizationId,
      relatedProjectId: projectId,
      title: `${project.name} — Delivery Board`,
      agenda,
      status: "SCHEDULED",
      createdById: userId,
      participants: {
        create: [...agents.map((agent) => ({ agentId: agent.id })), { userId }],
      },
    },
  });

  await logActivity({
    organizationId: project.organizationId,
    type: "MEETING",
    description: `Delivery Board meeting scheduled for "${project.name}".`,
    actorUserId: userId,
    metadata: { meetingId: meeting.id, projectId },
  });
  await fireWorkflowTrigger(project.organizationId, "MEETING_SCHEDULED", { meetingId: meeting.id, title: meeting.title, projectId });

  return { meetingId: meeting.id };
}

/** Renders one MeetingMessage as a "SenderName: content" transcript line — identical to meeting-orchestrator.ts's private helper, duplicated rather than imported since these are two independently-forked orchestrators. */
function formatMessageLine(message: { content: string; senderAgent?: { name: string } | null; senderUser?: { name: string | null } | null }): string {
  const name = message.senderAgent?.name ?? message.senderUser?.name ?? "Unknown";
  return `${name}: ${message.content}`;
}

/** Open (non-terminal) BugReport statuses — mirrors OPEN_TASK_STATUSES' role for the dedicated BugReport model: FIXED/VERIFIED/WONT_FIX are terminal, OPEN/IN_PROGRESS are not. */
const OPEN_BUG_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

/** Real QA/DevOps/Delivery-specific signals not covered by buildProjectContext's PM-focused summary — open bugs, security-labeled bugs, Go-Live proximity, open client tickets, and dedicated BugReport counts. All real counts, never fabricated. */
async function buildDeliveryContextBlock(projectId: string): Promise<string> {
  const [openBugs, securityBugs, goLiveMilestone, openClientTickets, openBugReports, criticalBugReports] = await Promise.all([
    prisma.task.count({ where: { projectId, type: "BUG", status: { in: Array.from(OPEN_TASK_STATUSES) as never[] } } }),
    prisma.task.count({ where: { projectId, type: "BUG", status: { in: Array.from(OPEN_TASK_STATUSES) as never[] }, labels: { has: "security" } } }),
    prisma.milestone.findFirst({ where: { projectId, name: "Go Live" }, select: { status: true, dueDate: true } }),
    prisma.task.count({ where: { projectId, clientRaised: true, status: { in: Array.from(OPEN_TASK_STATUSES) as never[] } } }),
    prisma.bugReport.count({ where: { projectId, status: { in: Array.from(OPEN_BUG_STATUSES) as never[] } } }),
    prisma.bugReport.count({ where: { projectId, status: { in: Array.from(OPEN_BUG_STATUSES) as never[] }, severity: "CRITICAL" } }),
  ]);

  const lines = [
    "",
    "QA / DevOps / Delivery signals:",
    `- Open bugs (Task-type BUG): ${openBugs}${securityBugs > 0 ? ` (${securityBugs} labeled security)` : ""}`,
    `- Open BugReports: ${openBugReports}${criticalBugReports > 0 ? ` (${criticalBugReports} critical)` : ""}`,
    `- Go Live milestone: ${goLiveMilestone ? `${goLiveMilestone.status}${goLiveMilestone.dueDate ? `, due ${goLiveMilestone.dueDate.toISOString().slice(0, 10)}` : ""}` : "not set"}`,
    `- Open client tickets: ${openClientTickets}`,
  ];
  return lines.join("\n");
}

/**
 * Forked from meeting-orchestrator.ts's runMeetingRound (Correction #2 in
 * the Phase 5 plan) — same real-Claude-call-per-agent shape, different
 * roster and speaking order. Project Manager opens (sets today's focus from
 * the real agenda), QA/DevOps/Delivery Directors report, CEO closes with a
 * decision-oriented synthesis (Correction #3).
 */
export async function runDeliveryBoardRound(meetingId: string): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: { include: { agent: true } },
      messages: { orderBy: { createdAt: "asc" }, include: { senderAgent: true, senderUser: true } },
    },
  });
  if (!meeting || !meeting.relatedProjectId) throw new Error("Delivery Board meeting not found.");
  const projectId = meeting.relatedProjectId;

  const agentParticipants: AIAgentInstance[] = meeting.participants
    .map((p) => p.agent)
    .filter((agent): agent is AIAgentInstance => agent !== null && isDeliveryBoardAgentType(agent.type));
  if (agentParticipants.length === 0) {
    throw new Error("This Delivery Board meeting has no AI agents participating.");
  }

  const isFirstRound = meeting.status === "SCHEDULED";
  if (isFirstRound) {
    await prisma.meeting.update({ where: { id: meetingId }, data: { status: "LIVE", startedAt: new Date() } });
    await logActivity({
      organizationId: meeting.organizationId,
      type: "MEETING",
      description: `Delivery Board meeting "${meeting.title}" started.`,
      metadata: { meetingId, projectId },
    });
    await notifyOrganizationOwners({
      organizationId: meeting.organizationId,
      type: "MEETING_STARTED",
      title: `Delivery Board started: ${meeting.title}`,
      message: meeting.agenda,
    });
    await emailOrganizationOwners({
      organizationId: meeting.organizationId,
      subject: `Delivery Board started: ${meeting.title}`,
      text: `Your AI Delivery Board started today's standup.\n\nAgenda: ${meeting.agenda}`,
    });
  }

  const projectContext = await buildProjectContext(projectId);
  const deliveryBlock = await buildDeliveryContextBlock(projectId);
  const baseContext = `${projectContext?.context ?? "No real project data available."}${deliveryBlock}`;

  const pm = agentParticipants.find((a) => a.type === "PROJECT_MANAGER");
  const ceo = agentParticipants.find((a) => a.type === "CEO");
  const middle = agentParticipants.filter((a) => a.type !== "PROJECT_MANAGER" && a.type !== "CEO");
  const orderedAgents = [...(pm ? [pm] : []), ...middle, ...(ceo ? [ceo] : [])];

  let conversationContext = [baseContext, meeting.messages.map(formatMessageLine).join("\n")].filter(Boolean).join("\n\n");

  const suggestedActionMessages: Array<{ agentId: string; agentName: string; content: string; suggestedAction: string }> = [];

  for (const agent of orderedAgents) {
    const task =
      agent.type === "PROJECT_MANAGER"
        ? isFirstRound
          ? "Open today's Delivery Board standup: review the real agenda and set today's focus for the team."
          : "Given the discussion so far, summarize where things stand and what still needs attention."
        : agent.type === "CEO"
          ? "Close this standup: synthesize what the other directors reported into a clear decision-oriented summary — what needs to happen next and who owns it."
          : "Report your real status for today's standup, referencing the discussion so far and the real project data you were given.";

    let turn;
    try {
      turn = await runMeetingAgentTurn({
        agentId: agent.id,
        agentType: agent.type as ExecutiveAgentType,
        agentName: agent.name,
        task,
        conversationContext: conversationContext || undefined,
        meetingLabel: "AI Delivery Board meeting",
        organizationId: meeting.organizationId,
        contextQuery: task,
      });
    } catch (error) {
      if (isAIBillingError(error)) {
        await logActivity({
          organizationId: meeting.organizationId,
          type: "SYSTEM_EVENT",
          description: `Delivery Board round failed: AI account has no usable credits (agent "${agent.name}").`,
          actorAgentId: agent.id,
          metadata: { meetingId, projectId },
        });
        throw new AIBillingError(error);
      }
      throw error;
    }

    await prisma.meetingMessage.create({
      data: {
        meetingId,
        senderAgentId: agent.id,
        type: "DISCUSSION",
        content: turn.content,
        priority: turn.priority,
        confidenceScore: turn.confidenceScore,
        suggestedAction: turn.suggestedAction || null,
        evidence: turn.evidence || null,
      },
    });

    if (turn.suggestedAction) {
      suggestedActionMessages.push({ agentId: agent.id, agentName: agent.name, content: turn.content, suggestedAction: turn.suggestedAction });
    }

    conversationContext = `${conversationContext}\n${agent.name}: ${turn.content}`;
  }

  // Flatten every agent's real suggestedAction into a real Recommendation
  // row — no extra LLM call, the data already exists (same pattern the
  // Review Board uses for its recommendations[] arrays).
  if (suggestedActionMessages.length > 0) {
    await prisma.recommendation.createMany({
      data: suggestedActionMessages.map((m) => ({
        organizationId: meeting.organizationId,
        type: "DELIVERY_RECOMMENDATION" as RecommendationType,
        title: m.suggestedAction.slice(0, 120),
        description: `${m.agentName}: ${m.content}`.slice(0, 2000),
        relatedMeetingId: meetingId,
        relatedProjectId: projectId,
      })),
    });
  }

  await logActivity({
    organizationId: meeting.organizationId,
    type: "MEETING",
    description: `Delivery Board round completed for "${meeting.title}" — ${orderedAgents.length} agent(s) contributed.`,
    metadata: { meetingId, projectId, agentCount: orderedAgents.length },
  });
}

/**
 * Forked from meeting-orchestrator.ts's runMeetingDecisionVote — same real
 * per-agent-vote-in-parallel + tally shape, filtered to
 * DELIVERY_BOARD_AGENT_TYPES via runDeliveryVoteTurn (which offers
 * REQUEST_REVISION alongside the same 6 choices, per Correction re: not
 * widening the shared VoteSchema).
 */
export async function runDeliveryBoardDecisionVote(decisionId: string): Promise<void> {
  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
    include: { meeting: { include: { messages: { orderBy: { createdAt: "asc" }, include: { senderAgent: true, senderUser: true } } } } },
  });
  if (!decision) throw new Error("Decision not found.");

  const agents = await prisma.aIAgentInstance.findMany({ where: { organizationId: decision.organizationId, active: true } });
  const votingAgents = agents.filter((agent) => isDeliveryBoardAgentType(agent.type));
  if (votingAgents.length === 0) {
    throw new Error("This organization has no active AI Delivery Board agents to vote.");
  }

  const conversationContext = decision.meeting ? decision.meeting.messages.map(formatMessageLine).join("\n") || undefined : undefined;

  let voteResults: Array<{ agent: AIAgentInstance; vote: VoteChoice; reasoning: string }>;
  try {
    voteResults = await Promise.all(
      votingAgents.map(async (agent) => {
        const result = await runDeliveryVoteTurn({
          agentId: agent.id,
          agentType: agent.type as ExecutiveAgentType,
          agentName: agent.name,
          topic: decision.topic,
          description: decision.description ?? undefined,
          conversationContext,
          organizationId: decision.organizationId,
          contextQuery: decision.topic,
        });
        return { agent, vote: result.vote as VoteChoice, reasoning: result.reasoning };
      }),
    );
  } catch (error) {
    if (isAIBillingError(error)) {
      await logActivity({
        organizationId: decision.organizationId,
        type: "SYSTEM_EVENT",
        description: `Delivery decision vote failed: AI account has no usable credits (decision "${decision.topic}").`,
        metadata: { decisionId },
      });
      throw new AIBillingError(error);
    }
    throw error;
  }

  await prisma.$transaction(
    voteResults.map(({ agent, vote, reasoning }) =>
      prisma.decisionVote.upsert({
        where: { decisionId_agentId: { decisionId, agentId: agent.id } },
        create: { decisionId, agentId: agent.id, vote, reasoning },
        update: { vote, reasoning },
      }),
    ),
  );

  const votes = voteResults.map((v) => v.vote);
  const total = votes.length;
  const count = (choice: VoteChoice) => votes.filter((v) => v === choice).length;

  // Same tally rule as runMeetingDecisionVote — REQUEST_REVISION is treated
  // like DELAY (not enough to approve yet, needs changes) when it doesn't
  // form a majority on its own.
  let status: DecisionStatus;
  if (votes.includes("ESCALATE")) {
    status = "ESCALATED";
  } else if (count("APPROVE") > total / 2) {
    status = "APPROVED";
  } else if (count("REJECT") > total / 2) {
    status = "REJECTED";
  } else if (votes.includes("DELAY") || votes.includes("REQUEST_REVISION")) {
    status = "DELAYED";
  } else {
    status = "DELEGATED";
  }

  await prisma.decision.update({ where: { id: decisionId }, data: { status, finalizedAt: new Date() } });

  await evaluateAutomationRules(decision.organizationId, "DECISION_MADE", { subject: decision.topic, decisionId });
  await fireWorkflowTrigger(decision.organizationId, "DECISION_MADE", { decisionId, topic: decision.topic, status, meetingId: decision.meetingId });

  await logActivity({
    organizationId: decision.organizationId,
    type: "SYSTEM_EVENT",
    description: `Delivery decision "${decision.topic}" finalized as ${status} (${total} vote${total === 1 ? "" : "s"}).`,
    metadata: { decisionId, status, votes: voteResults.map((v) => ({ agentId: v.agent.id, agentName: v.agent.name, vote: v.vote })) },
  });

  if (status === "ESCALATED") {
    await notifyOrganizationOwners({
      organizationId: decision.organizationId,
      type: "APPROVAL_REQUESTED",
      title: `Approval needed: ${decision.topic}`,
      message: "The AI Delivery Board escalated this decision — it needs a human owner/admin to approve or reject it.",
    });
    await emailOrganizationOwners({
      organizationId: decision.organizationId,
      subject: `Approval needed: ${decision.topic}`,
      text: `Your AI Delivery Board escalated a decision that needs your judgment.\n\nTopic: ${decision.topic}\n${decision.description ? `Details: ${decision.description}\n` : ""}\nReview and approve/reject it in the project's Delivery Board.`,
    });
  } else {
    await notifyOrganizationOwners({
      organizationId: decision.organizationId,
      type: "DECISION_MADE",
      title: `Decision finalized: ${decision.topic}`,
      message: `The AI Delivery Board voted and finalized this decision as ${status}.`,
    });
  }
}
