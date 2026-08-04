import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { emailOrganizationOwners } from "@/lib/email";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { AIBillingError, isAIBillingError } from "@/lib/ai/client";
import {
  runAgentVote,
  runMeetingAgentTurn,
  runMeetingNotesTurn,
  storeAgentMemory,
  type MeetingActionItem,
  type MeetingBlocker,
} from "@/lib/ai/agent-runtime";
import { EXECUTIVE_AGENT_TYPES, type ExecutiveAgentType } from "@/lib/ai/personas";
import type { AIAgentInstance, DecisionStatus, VoteChoice, Prisma } from "@/generated/prisma/client";

// Decision categories where getting it wrong genuinely costs money or a
// client relationship — used to deterministically set Decision.riskLevel
// (a real, previously-dead schema column) rather than leaving escalation
// entirely up to each agent's free-choice vote.
const HIGH_STAKES_DECISION_CATEGORIES = new Set([
  "PROPOSAL_APPROVAL",
  "QUOTATION_APPROVAL",
  "CONTRACT_APPROVAL",
  "INVOICE_APPROVAL",
  "ISSUE_ESCALATION",
]);

// A financial impact above this (in the org's currency's smallest common
// unit of "a lot") also forces HIGH risk, regardless of category.
const HIGH_STAKES_FINANCIAL_IMPACT_THRESHOLD = 100_000;

/**
 * Deterministic — not AI-guessed — risk classification for a proposed
 * Decision, called from proposeDecision (board/meetings/[id]/actions.ts) at
 * creation time. Feeds Decision.riskLevel, a real schema column that
 * existed but was never set or read anywhere before this. Returns null
 * (leave riskLevel unset) when neither signal applies — we don't invent a
 * LOW/MEDIUM rating for the common case, only flag genuine high stakes.
 */
export function computeDecisionRiskLevel(category: string, financialImpact?: number | null): "HIGH" | null {
  if (HIGH_STAKES_DECISION_CATEGORIES.has(category)) return "HIGH";
  if (financialImpact != null && financialImpact >= HIGH_STAKES_FINANCIAL_IMPACT_THRESHOLD) return "HIGH";
  return null;
}

function isExecutiveAgentType(type: string): type is ExecutiveAgentType {
  return (EXECUTIVE_AGENT_TYPES as readonly string[]).includes(type);
}

/** Renders one MeetingMessage as a "SenderName: content" transcript line. */
function formatMessageLine(message: {
  content: string;
  senderAgent?: { name: string } | null;
  senderUser?: { name: string | null } | null;
}): string {
  const name = message.senderAgent?.name ?? message.senderUser?.name ?? "Unknown";
  return `${name}: ${message.content}`;
}

// Simple heuristic for classifying a CEO discussion turn as ACTION_ITEM
// instead of DISCUSSION: look for language that reads as assigning concrete
// work to someone. Deliberately conservative (biased toward DISCUSSION) —
// false negatives just mean a message is stored as a plain discussion turn
// instead of an action item, which is harmless; false positives would
// mislabel ordinary commentary as an assignment.
const ACTION_ITEM_PATTERNS = [
  /\baction item/i,
  /\bI(?:'m| am) assigning\b/i,
  /\byour (?:task|action) is\b/i,
  /\bI need you to\b/i,
  /\bplease (?:handle|own|take|draft|prepare|follow up)\b/i,
  /\b(?:sales|marketing|proposal|outreach)\s+agent,?\s+(?:please|you(?:'ll| will))\b/i,
];

function looksLikeActionAssignment(content: string): boolean {
  return ACTION_ITEM_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Runs one real-AI discussion round for a meeting: every participating
 * executive agent takes one turn, in order (CEO first, then the rest),
 * each turn a genuine Claude call via runAgentTurn. Each agent sees every
 * prior agent's contribution from THIS call plus the full prior transcript
 * — conversationContext is rebuilt after each agent speaks so the
 * discussion is genuinely sequential, not simulated turn-taking.
 *
 * Message-ordering decision: "first round" is defined as
 * Meeting.status === "SCHEDULED" (its default) — this function is what
 * transitions a meeting from SCHEDULED to LIVE (startedAt = now,
 * MEETING_STARTED notification) on its very first invocation. Every
 * subsequent call for the same meeting is treated as a later round and the
 * CEO is asked to move toward a decision / action item instead of opening
 * the meeting.
 */
export async function runMeetingRound(meetingId: string): Promise<void> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: { include: { agent: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { senderAgent: true, senderUser: true },
      },
    },
  });
  if (!meeting) throw new Error("Meeting not found.");

  const agentParticipants: AIAgentInstance[] = meeting.participants
    .map((p) => p.agent)
    .filter((agent): agent is AIAgentInstance => agent !== null && isExecutiveAgentType(agent.type));

  if (agentParticipants.length === 0) {
    throw new Error("This meeting has no AI executive agents participating.");
  }

  const isFirstRound = meeting.status === "SCHEDULED";

  if (isFirstRound) {
    await prisma.meeting.update({
      where: { id: meetingId },
      data: { status: "LIVE", startedAt: new Date() },
    });
    await logActivity({
      organizationId: meeting.organizationId,
      type: "MEETING",
      description: `Meeting "${meeting.title}" started.`,
      metadata: { meetingId },
    });
    await notifyOrganizationOwners({
      organizationId: meeting.organizationId,
      type: "MEETING_STARTED",
      title: `Meeting started: ${meeting.title}`,
      message: meeting.agenda,
    });
    await emailOrganizationOwners({
      organizationId: meeting.organizationId,
      subject: `Meeting started: ${meeting.title}`,
      text: `Your AI Executive Board started a meeting.\n\nAgenda: ${meeting.agenda}`,
    });
  }

  // CEO first, then the remaining agents in whatever order they were loaded.
  const ceo = agentParticipants.find((a) => a.type === "CEO");
  const others = agentParticipants.filter((a) => a.type !== "CEO");
  const orderedAgents = ceo ? [ceo, ...others] : others;

  let conversationContext = meeting.messages.map(formatMessageLine).join("\n");

  for (const agent of orderedAgents) {
    const task =
      agent.type === "CEO"
        ? isFirstRound
          ? "Open this meeting: review the agenda and set direction for the discussion."
          : "Given the discussion so far, either move to a decision, ask a specific agent to elaborate, or assign an action item."
        : "Contribute your perspective on the current agenda item, referencing the discussion so far.";

    let turn;
    try {
      turn = await runMeetingAgentTurn({
        agentId: agent.id,
        agentType: agent.type as ExecutiveAgentType,
        agentName: agent.name,
        task,
        conversationContext: conversationContext || undefined,
        organizationId: meeting.organizationId,
        contextQuery: task,
      });
    } catch (error) {
      if (isAIBillingError(error)) {
        await logActivity({
          organizationId: meeting.organizationId,
          type: "SYSTEM_EVENT",
          description: `Meeting round failed: AI account has no usable credits (agent "${agent.name}").`,
          actorAgentId: agent.id,
          metadata: { meetingId },
        });
        throw new AIBillingError(error);
      }
      throw error;
    }

    const messageType = agent.type === "CEO" && looksLikeActionAssignment(turn.content) ? "ACTION_ITEM" : "DISCUSSION";

    await prisma.meetingMessage.create({
      data: {
        meetingId,
        senderAgentId: agent.id,
        type: messageType,
        content: turn.content,
        priority: turn.priority,
        confidenceScore: turn.confidenceScore,
        suggestedAction: turn.suggestedAction || null,
        evidence: turn.evidence || null,
      },
    });

    conversationContext = conversationContext
      ? `${conversationContext}\n${agent.name}: ${turn.content}`
      : `${agent.name}: ${turn.content}`;
  }

  await logActivity({
    organizationId: meeting.organizationId,
    type: "MEETING",
    description: `Meeting round completed for "${meeting.title}" — ${orderedAgents.length} agent(s) contributed.`,
    metadata: { meetingId, agentCount: orderedAgents.length },
  });
}

/**
 * Runs a real-AI vote on a Decision: every active executive AIAgentInstance
 * in the decision's organization casts a genuine, independent vote via
 * runAgentVote, IN PARALLEL (Promise.all — unlike discussion, voting does
 * not depend on seeing other agents' votes first).
 *
 * Tally rule (judgment call, documented here since the brief left it open):
 *   1. If ANY agent votes ESCALATE, the decision is ESCALATED. Escalation
 *      always wins — a real executive board would not let a majority
 *      overrule a colleague flagging "this needs human judgment."
 *   2. Else if a strict majority (> half of all votes) vote APPROVE, the
 *      decision is APPROVED.
 *   3. Else if a strict majority vote REJECT, the decision is REJECTED.
 *   4. Else if ANY agent votes DELAY, the decision is DELAYED (not enough
 *      information yet, and no majority formed either way).
 *   5. Otherwise (a genuine split with no majority and no delay flagged),
 *      the decision is DELEGATED — punted to a specific owner to resolve
 *      rather than left in limbo.
 */
export async function runMeetingDecisionVote(decisionId: string): Promise<void> {
  const decision = await prisma.decision.findUnique({
    where: { id: decisionId },
    include: {
      meeting: {
        include: {
          messages: { orderBy: { createdAt: "asc" }, include: { senderAgent: true, senderUser: true } },
        },
      },
    },
  });
  if (!decision) throw new Error("Decision not found.");

  const agents = await prisma.aIAgentInstance.findMany({
    where: { organizationId: decision.organizationId, active: true },
  });
  const votingAgents = agents.filter((agent) => isExecutiveAgentType(agent.type));

  if (votingAgents.length === 0) {
    throw new Error("This organization has no active AI executive agents to vote.");
  }

  const conversationContext = decision.meeting
    ? decision.meeting.messages.map(formatMessageLine).join("\n") || undefined
    : undefined;

  // Ground each agent's free-choice ESCALATE vote in the real, deterministic
  // signals already sitting on Decision (category always present;
  // riskLevel/financialImpact set by computeDecisionRiskLevel at proposal
  // time, or supplied directly) instead of leaving escalation purely to
  // vibes. The tally rule itself (any ESCALATE wins) is untouched below.
  const riskContext =
    decision.riskLevel || decision.financialImpact != null
      ? [
          `Category: ${decision.category}.`,
          decision.riskLevel ? `Risk level: ${decision.riskLevel}.` : null,
          decision.financialImpact != null ? `Financial impact: ${decision.financialImpact}.` : null,
        ]
          .filter(Boolean)
          .join(" ")
      : undefined;

  let voteResults: Array<{ agent: AIAgentInstance; vote: VoteChoice; reasoning: string }>;
  try {
    voteResults = await Promise.all(
      votingAgents.map(async (agent) => {
        const result = await runAgentVote({
          agentId: agent.id,
          agentType: agent.type as ExecutiveAgentType,
          agentName: agent.name,
          topic: decision.topic,
          description: decision.description ?? undefined,
          conversationContext,
          riskContext,
          organizationId: decision.organizationId,
          contextQuery: decision.topic,
        });
        return { agent, vote: result.vote, reasoning: result.reasoning };
      }),
    );
  } catch (error) {
    if (isAIBillingError(error)) {
      await logActivity({
        organizationId: decision.organizationId,
        type: "SYSTEM_EVENT",
        description: `Decision vote failed: AI account has no usable credits (decision "${decision.topic}").`,
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

  let status: DecisionStatus;
  if (votes.includes("ESCALATE")) {
    status = "ESCALATED";
  } else if (count("APPROVE") > total / 2) {
    status = "APPROVED";
  } else if (count("REJECT") > total / 2) {
    status = "REJECTED";
  } else if (votes.includes("DELAY")) {
    status = "DELAYED";
  } else {
    status = "DELEGATED";
  }

  await prisma.decision.update({
    where: { id: decisionId },
    data: { status, finalizedAt: new Date() },
  });

  await evaluateAutomationRules(decision.organizationId, "DECISION_MADE", {
    subject: decision.topic,
    decisionId,
  });
  await fireWorkflowTrigger(decision.organizationId, "DECISION_MADE", { decisionId, topic: decision.topic, status, meetingId: decision.meetingId });

  await logActivity({
    organizationId: decision.organizationId,
    type: "SYSTEM_EVENT",
    description: `Decision "${decision.topic}" finalized as ${status} (${total} vote${total === 1 ? "" : "s"}).`,
    metadata: {
      decisionId,
      status,
      votes: voteResults.map((v) => ({ agentId: v.agent.id, agentName: v.agent.name, vote: v.vote })),
    },
  });

  if (status === "ESCALATED") {
    await notifyOrganizationOwners({
      organizationId: decision.organizationId,
      type: "APPROVAL_REQUESTED",
      title: `Approval needed: ${decision.topic}`,
      message: "The AI board escalated this decision — it needs a human owner/admin to approve or reject it.",
    });
    // Real email trigger: "Critical Decision" / "Owner Approval Required".
    await emailOrganizationOwners({
      organizationId: decision.organizationId,
      subject: `Approval needed: ${decision.topic}`,
      text: `Your AI Executive Board escalated a decision that needs your judgment.\n\nTopic: ${decision.topic}\n${decision.description ? `Details: ${decision.description}\n` : ""}\nReview and approve/reject it in the War Room.`,
    });
  } else {
    await notifyOrganizationOwners({
      organizationId: decision.organizationId,
      type: "DECISION_MADE",
      title: `Decision finalized: ${decision.topic}`,
      message: `The AI board voted and finalized this decision as ${status}.`,
    });
  }
}

/** Flattens the six structured note sections into the plain-text `Meeting.summary` field, for anything that only reads that. */
function flattenMeetingNotes(notes: {
  summary: string;
  actionItems: MeetingActionItem[];
  risks: string[];
  blockers: MeetingBlocker[];
  recommendations: string[];
  nextSteps: string[];
}): string {
  const section = (label: string, items: string[]) => (items.length > 0 ? `\n\n${label}:\n${items.map((i) => `- ${i}`).join("\n")}` : "");
  const actionItemLines = notes.actionItems.map(
    (item) => `${item.title} — Owner: ${item.owner}, Priority: ${item.priority}, Due in ${item.dueInDays}d, KPI: ${item.kpi}, Expected impact: ${item.expectedImpact}`,
  );
  const blockerLines = notes.blockers.map((b) => `${b.description} — Proposed solution: ${b.proposedSolution}`);
  return (
    notes.summary +
    section("Action items", actionItemLines) +
    section("Risks", notes.risks) +
    section("Blockers", blockerLines) +
    section("Recommendations", notes.recommendations) +
    section("Next steps", notes.nextSteps)
  );
}

/**
 * Generates real, structured end-of-meeting notes (summary + action items +
 * risks + recommendations + next steps) via runMeetingNotesTurn, stores the
 * structured object on Meeting.notesJson (and a flattened render on
 * Meeting.summary for backward compatibility), creates a SUMMARY-type
 * MeetingMessage, and closes the meeting out (status COMPLETED, endedAt now).
 */
export async function generateMeetingSummary(meetingId: string): Promise<string> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: { include: { agent: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { senderAgent: true, senderUser: true },
      },
    },
  });
  if (!meeting) throw new Error("Meeting not found.");

  const executiveParticipants = meeting.participants
    .map((p) => p.agent)
    .filter((agent): agent is AIAgentInstance => agent !== null && isExecutiveAgentType(agent.type));

  const summarizer = executiveParticipants.find((a) => a.type === "CEO") ?? executiveParticipants[0];
  if (!summarizer) {
    throw new Error("This meeting has no AI executive agent to generate a summary.");
  }

  const transcript = meeting.messages.map(formatMessageLine).join("\n");

  let notes;
  try {
    notes = await runMeetingNotesTurn({
      agentId: summarizer.id,
      agentType: summarizer.type as ExecutiveAgentType,
      agentName: summarizer.name,
      transcript,
      organizationId: meeting.organizationId,
    });
  } catch (error) {
    if (isAIBillingError(error)) {
      await logActivity({
        organizationId: meeting.organizationId,
        type: "SYSTEM_EVENT",
        description: `Meeting summary failed: AI account has no usable credits (meeting "${meeting.title}").`,
        actorAgentId: summarizer.id,
        metadata: { meetingId },
      });
      throw new AIBillingError(error);
    }
    throw error;
  }

  const flattened = flattenMeetingNotes(notes);

  await prisma.meetingMessage.create({
    data: {
      meetingId,
      senderAgentId: summarizer.id,
      type: "SUMMARY",
      content: flattened,
    },
  });

  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      summary: flattened,
      notesJson: notes as unknown as Prisma.InputJsonValue,
      status: "COMPLETED",
      endedAt: new Date(),
    },
  });

  // Turn the AI's structured execution plan into real ActionItem rows —
  // Task/Owner/Priority/Deadline/KPI/Expected-Impact, not just narrative
  // strings a human has to manually track one at a time. Owner "HUMAN"
  // (or an agent type not actually provisioned for this org) leaves both
  // assignee columns null — visibly unassigned rather than guessed.
  if (notes.actionItems.length > 0) {
    const orgAgents = await prisma.aIAgentInstance.findMany({
      where: { organizationId: meeting.organizationId, active: true, type: { in: EXECUTIVE_AGENT_TYPES } },
      select: { id: true, type: true },
    });
    const agentIdByType = new Map(orgAgents.map((a) => [a.type, a.id]));

    for (const item of notes.actionItems) {
      await prisma.actionItem.create({
        data: {
          organizationId: meeting.organizationId,
          meetingId,
          title: item.title,
          dueDate: new Date(Date.now() + item.dueInDays * 86_400_000),
          priority: item.priority,
          kpi: item.kpi,
          expectedImpact: item.expectedImpact,
          assignedToAgentId: item.owner === "HUMAN" ? null : (agentIdByType.get(item.owner) ?? null),
        },
      });
    }
  }

  await logActivity({
    organizationId: meeting.organizationId,
    type: "MEETING",
    description: `Meeting "${meeting.title}" summarized and marked completed.`,
    actorAgentId: summarizer.id,
    metadata: { meetingId },
  });

  // Real memory write — every executive who actually participated in this
  // meeting "remembers" its real outcome (same real summary/risks/action
  // items every participant would recall), not a per-agent fabrication.
  const memoryContent = [
    `Meeting "${meeting.title}": ${notes.summary}`,
    notes.risks.length ? `Risks: ${notes.risks.join("; ")}` : null,
    notes.blockers.length ? `Blockers: ${notes.blockers.map((b) => b.description).join("; ")}` : null,
    notes.actionItems.length ? `Action items: ${notes.actionItems.map((i) => `${i.title} (${i.owner})`).join("; ")}` : null,
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 2000);
  await Promise.all(
    executiveParticipants.map((agent) => storeAgentMemory(agent.id, meeting.organizationId, "MEETING_NOTE", memoryContent, "MEETING", meetingId)),
  );

  await notifyOrganizationOwners({
    organizationId: meeting.organizationId,
    type: "MEETING_ENDED",
    title: `Meeting ended: ${meeting.title}`,
    message: notes.summary.length > 300 ? `${notes.summary.slice(0, 297)}...` : notes.summary,
  });
  await emailOrganizationOwners({
    organizationId: meeting.organizationId,
    subject: `Meeting ended: ${meeting.title}`,
    text: [
      notes.summary,
      notes.actionItems.length
        ? `\nAction items:\n${notes.actionItems.map((i) => `- ${i.title} (Owner: ${i.owner}, Due in ${i.dueInDays}d, KPI: ${i.kpi})`).join("\n")}`
        : "",
      notes.risks.length ? `\nRisks:\n${notes.risks.map((i) => `- ${i}`).join("\n")}` : "",
      notes.blockers.length
        ? `\nBlockers:\n${notes.blockers.map((b) => `- ${b.description} (Proposed solution: ${b.proposedSolution})`).join("\n")}`
        : "",
      notes.nextSteps.length ? `\nNext steps:\n${notes.nextSteps.map((i) => `- ${i}`).join("\n")}` : "",
    ].join(""),
  });

  return flattened;
}
