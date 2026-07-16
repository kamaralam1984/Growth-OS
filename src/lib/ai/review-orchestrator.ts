import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { emailOrganizationOwners } from "@/lib/email";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { publishRealtimeEvent } from "@/lib/realtime/event-bus";
import { AIBillingError, isAIBillingError } from "@/lib/ai/client";
import {
  runReviewAgentTurn,
  runReviewVoteTurn,
  type ReviewTurnResult,
  type FinanceReviewTurnResult,
  type LegalReviewTurnResult,
} from "@/lib/ai/agent-runtime";
import { REVIEW_BOARD_AGENT_TYPES, getReviewBoardPersonas, type ExecutiveAgentType } from "@/lib/ai/personas";
import { resolveDocumentById } from "@/app/dashboard/proposal/_lib/document-resolver";
import type { DocumentBlueprint } from "@/lib/documents";
import type {
  AIAgentInstance,
  DocumentKind,
  DecisionCategory,
  DecisionStatus,
  VoteChoice,
  BoardReviewDecision,
  RecommendationType,
  Prisma,
} from "@/generated/prisma/client";

function isReviewBoardAgentType(type: string): type is ExecutiveAgentType {
  return (REVIEW_BOARD_AGENT_TYPES as readonly string[]).includes(type);
}

/** Renders one MeetingMessage as a "SenderName: content" transcript line — same convention as meeting-orchestrator.ts. */
function formatMessageLine(message: {
  content: string;
  senderAgent?: { name: string } | null;
  senderUser?: { name: string | null } | null;
}): string {
  const name = message.senderAgent?.name ?? message.senderUser?.name ?? "Unknown";
  return `${name}: ${message.content}`;
}

/** Flattens a DocumentBlueprint (already built by Phase 2's document-resolver) into plain text for the review agents' prompt context — real document content, never a fabricated summary. */
function summarizeDocumentForReview(blueprint: DocumentBlueprint): string {
  const parts: string[] = [`Title: ${blueprint.title}`];
  if (blueprint.subtitle) parts.push(`Subtitle: ${blueprint.subtitle}`);
  if (blueprint.documentNumber) parts.push(`Document number: ${blueprint.documentNumber}`);
  if (blueprint.preparedFor?.name) {
    parts.push(`Prepared for: ${blueprint.preparedFor.name}${blueprint.preparedFor.company ? ` (${blueprint.preparedFor.company})` : ""}`);
  }
  for (const section of blueprint.sections) {
    parts.push(`\n## ${section.heading}`);
    if (section.body) parts.push(section.body);
    if (section.bullets?.length) parts.push(section.bullets.map((b) => `- ${b}`).join("\n"));
    if (section.table) {
      parts.push(section.table.headers.join(" | "));
      parts.push(section.table.rows.map((row) => row.join(" | ")).join("\n"));
    }
  }
  if (blueprint.pricingTable) {
    parts.push(`\n## Pricing`);
    parts.push(blueprint.pricingTable.headers.join(" | "));
    parts.push(blueprint.pricingTable.rows.map((row) => row.join(" | ")).join("\n"));
  }
  if (blueprint.totalsSummary?.length) {
    parts.push(blueprint.totalsSummary.map((t) => `${t.label}: ${t.value}`).join("\n"));
  }
  return parts.join("\n");
}

/**
 * Only 4 of the 5 DocumentKind values are covered by the AI Proposal Review
 * Board (Proposal/Quotation/Contract/Invoice) — BusinessDocument (the 15
 * NDA/MSA/SLA/SOW/etc kinds from Phase 12) has no DecisionCategory of its
 * own and is out of scope for this phase, same boundary the schema plan
 * drew (an explicit, documented future enhancement, not an oversight).
 */
const DOC_KIND_DECISION_CATEGORY: Partial<Record<DocumentKind, DecisionCategory>> = {
  PROPOSAL: "PROPOSAL_APPROVAL",
  QUOTATION: "QUOTATION_APPROVAL",
  CONTRACT: "CONTRACT_APPROVAL",
  INVOICE: "INVOICE_APPROVAL",
};

function buildRelatedDocFields(docKind: DocumentKind, docId: string) {
  switch (docKind) {
    case "PROPOSAL":
      return { relatedProposalId: docId };
    case "QUOTATION":
      return { relatedQuotationId: docId };
    case "CONTRACT":
      return { relatedContractId: docId };
    case "INVOICE":
      return { relatedInvoiceId: docId };
    default:
      return {};
  }
}

/** Same doc-kind switch, but keyed to match AutomationContext's field names (proposalId, not relatedProposalId). */
function buildAutomationDocFields(docKind: DocumentKind, docId: string) {
  switch (docKind) {
    case "PROPOSAL":
      return { proposalId: docId };
    case "QUOTATION":
      return { quotationId: docId };
    case "CONTRACT":
      return { contractId: docId };
    case "INVOICE":
      return { invoiceId: docId };
    default:
      return {};
  }
}

/**
 * Upserts any of the 8 AI Proposal Review Board agent types missing for this
 * org — safe under AIAgentInstance's @@unique([organizationId, type]).
 * Called lazily at review-schedule time rather than added to the onboarding
 * wizard, so organizations onboarded before this phase (with only the
 * original 7 agents) get FINANCE/LEGAL provisioned the first time a review
 * is requested, with zero changes to onboarding itself.
 */
export async function ensureReviewBoardAgentsProvisioned(organizationId: string): Promise<void> {
  const existing = await prisma.aIAgentInstance.findMany({
    where: { organizationId, type: { in: REVIEW_BOARD_AGENT_TYPES } },
    select: { type: true },
  });
  const existingTypes = new Set(existing.map((a) => a.type));
  const missing = getReviewBoardPersonas().filter((p) => !existingTypes.has(p.type));
  if (missing.length === 0) return;

  await prisma.$transaction(
    missing.map((persona) =>
      prisma.aIAgentInstance.upsert({
        where: { organizationId_type: { organizationId, type: persona.type } },
        create: {
          organizationId,
          type: persona.type,
          name: persona.title,
          introMessage: `I'm your ${persona.title.replace(" Agent", "")} on the AI Proposal Review Board — ${persona.responsibilities.slice(0, 3).join(", ").toLowerCase()}.`,
        },
        update: {},
      }),
    ),
  );
}

export interface ScheduleBoardReviewResult {
  boardReviewId: string;
  meetingId: string;
}

/**
 * Schedules (does not yet run) an AI Proposal Review Board meeting for a
 * real Proposal/Quotation/Contract/Invoice — creates the Meeting as
 * SCHEDULED (not LIVE, unlike the War Room's createMeeting) plus a
 * BoardReview anchor row. The actual discussion only starts when
 * runReviewRound is first called (owner-triggered from the Review Room,
 * matching the brief's Owner Control section — Join/Watch Live/Pause implies
 * a live, owner-paced session, not a silent background job).
 */
export async function scheduleBoardReview(params: {
  organizationId: string;
  docKind: DocumentKind;
  docId: string;
  requestedByUserId: string;
}): Promise<ScheduleBoardReviewResult> {
  const { organizationId, docKind, docId, requestedByUserId } = params;

  if (!(docKind in DOC_KIND_DECISION_CATEGORY)) {
    throw new Error("The AI Proposal Review Board doesn't cover this document type yet.");
  }

  const resolved = await resolveDocumentById(docKind, docId);
  if (!resolved || resolved.organizationId !== organizationId) {
    throw new Error("Document not found.");
  }

  await ensureReviewBoardAgentsProvisioned(organizationId);

  const agents = await prisma.aIAgentInstance.findMany({
    where: { organizationId, active: true, type: { in: REVIEW_BOARD_AGENT_TYPES } },
  });

  const title = `Board Review: ${resolved.blueprint.title}`;
  const agenda = `Review this ${docKind.toLowerCase().replace("_", " ")} before it is sent to the client.\n\n${summarizeDocumentForReview(resolved.blueprint)}`.slice(0, 6000);

  const meeting = await prisma.meeting.create({
    data: {
      organizationId,
      title,
      agenda,
      status: "SCHEDULED",
      createdById: requestedByUserId,
      participants: {
        create: [...agents.map((agent) => ({ agentId: agent.id })), { userId: requestedByUserId }],
      },
    },
  });

  const boardReview = await prisma.boardReview.create({
    data: {
      organizationId,
      meetingId: meeting.id,
      docKind,
      docId,
      requestedByUserId,
    },
  });

  await logActivity({
    organizationId,
    type: "MEETING",
    description: `AI Proposal Review Board scheduled for "${resolved.blueprint.title}".`,
    actorUserId: requestedByUserId,
    metadata: { meetingId: meeting.id, boardReviewId: boardReview.id, docKind, docId },
  });
  await fireWorkflowTrigger(organizationId, "MEETING_SCHEDULED", { meetingId: meeting.id, title: meeting.title, boardReviewId: boardReview.id, docKind, docId });

  publishRealtimeEvent({ kind: "activity", organizationId });

  return { boardReviewId: boardReview.id, meetingId: meeting.id };
}

// Deliberate speaking order: specialists first, financial/legal deep-dive,
// CEO makes the final strategic call last (closing synthesis) — unlike the
// War Room's CEO-opens-the-meeting order, since a review's CEO turn is a
// verdict informed by everyone else, not a kickoff.
const REVIEW_SPEAKING_ORDER: ExecutiveAgentType[] = ["PROPOSAL", "SALES", "MARKETING", "CRM", "ANALYTICS", "FINANCE", "LEGAL", "CEO"];

/**
 * Runs one real-AI review round: every participating board agent takes one
 * turn, in REVIEW_SPEAKING_ORDER, each turn a genuine structured Claude call
 * via runReviewAgentTurn. Mirrors meeting-orchestrator.ts's runMeetingRound
 * exactly in structure (sequential, context-accumulating, first-round
 * SCHEDULED->LIVE transition + notification) but cannot reuse it directly —
 * runMeetingRound filters participants to the 5-value EXECUTIVE_AGENT_TYPES,
 * which would silently drop FINANCE/LEGAL/CRM/ANALYTICS from the review.
 */
export async function runReviewRound(boardReviewId: string): Promise<void> {
  const boardReview = await prisma.boardReview.findUnique({
    where: { id: boardReviewId },
    include: {
      meeting: {
        include: {
          participants: { include: { agent: true } },
          messages: { orderBy: { createdAt: "asc" }, include: { senderAgent: true, senderUser: true } },
        },
      },
    },
  });
  if (!boardReview) throw new Error("Board review not found.");
  const { meeting } = boardReview;

  const agentParticipants = meeting.participants
    .map((p) => p.agent)
    .filter((agent): agent is AIAgentInstance => agent !== null && isReviewBoardAgentType(agent.type));

  if (agentParticipants.length === 0) {
    throw new Error("This review has no AI board agents participating.");
  }

  const isFirstRound = meeting.status === "SCHEDULED";

  if (isFirstRound) {
    await prisma.meeting.update({ where: { id: meeting.id }, data: { status: "LIVE", startedAt: new Date() } });
    await logActivity({
      organizationId: boardReview.organizationId,
      type: "MEETING",
      description: `AI Proposal Review Board started reviewing "${meeting.title}".`,
      metadata: { meetingId: meeting.id, boardReviewId },
    });
    await notifyOrganizationOwners({
      organizationId: boardReview.organizationId,
      type: "BOARD_REVIEW_STARTED",
      title: `Board review started: ${meeting.title}`,
      message: meeting.agenda.length > 300 ? `${meeting.agenda.slice(0, 297)}...` : meeting.agenda,
    });
    await emailOrganizationOwners({
      organizationId: boardReview.organizationId,
      subject: `Board review started: ${meeting.title}`,
      text: `Your AI Proposal Review Board started reviewing a document.\n\n${meeting.agenda}`,
    });
  }

  const byType = new Map(agentParticipants.map((agent) => [agent.type as ExecutiveAgentType, agent]));
  const orderedAgents = REVIEW_SPEAKING_ORDER.map((type) => byType.get(type)).filter((agent): agent is AIAgentInstance => Boolean(agent));

  let conversationContext = meeting.messages.map(formatMessageLine).join("\n");

  for (const agent of orderedAgents) {
    const agentType = agent.type as ExecutiveAgentType;
    const task =
      agentType === "CEO"
        ? "You're closing this review after hearing the rest of the board. Give the final strategic perspective — weigh what everyone else raised and where you land."
        : `Review this document from your role's perspective. Agenda:\n${meeting.agenda}`;

    let turn: (ReviewTurnResult | FinanceReviewTurnResult | LegalReviewTurnResult) & { usage: { inputTokens: number; outputTokens: number } };
    try {
      if (agentType === "FINANCE") {
        turn = await runReviewAgentTurn({
          agentId: agent.id,
          agentType,
          agentName: agent.name,
          task,
          conversationContext: conversationContext || undefined,
          specialty: "FINANCE",
        });
      } else if (agentType === "LEGAL") {
        turn = await runReviewAgentTurn({
          agentId: agent.id,
          agentType,
          agentName: agent.name,
          task,
          conversationContext: conversationContext || undefined,
          specialty: "LEGAL",
        });
      } else {
        turn = await runReviewAgentTurn({
          agentId: agent.id,
          agentType,
          agentName: agent.name,
          task,
          conversationContext: conversationContext || undefined,
        });
      }
    } catch (error) {
      if (isAIBillingError(error)) {
        await logActivity({
          organizationId: boardReview.organizationId,
          type: "SYSTEM_EVENT",
          description: `Review round failed: AI account has no usable credits (agent "${agent.name}").`,
          actorAgentId: agent.id,
          metadata: { boardReviewId },
        });
        throw new AIBillingError(error);
      }
      throw error;
    }

    await prisma.meetingMessage.create({
      data: {
        meetingId: meeting.id,
        senderAgentId: agent.id,
        type: "DISCUSSION",
        content: turn.opinion,
        confidenceScore: turn.confidenceScore,
        reviewJson: turn as unknown as Prisma.InputJsonValue,
      },
    });

    if (agentType === "FINANCE" && "profitAnalysis" in turn) {
      const pa = turn.profitAnalysis;
      const revenue = pa.estimatedRevenue ?? null;
      const cost = pa.estimatedCost ?? null;
      const profitData = {
        estimatedRevenue: revenue,
        estimatedCost: cost,
        grossMargin: pa.grossMargin ?? null,
        netMargin: pa.netMargin ?? null,
        profit: revenue != null && cost != null ? revenue - cost : null,
        discountImpact: pa.discountImpact ?? null,
        paymentRiskLevel: pa.paymentRiskLevel,
        paymentRiskNotes: pa.paymentRiskNotes ?? null,
      };
      await prisma.profitAnalysis.upsert({
        where: { boardReviewId },
        create: { boardReviewId, ...profitData },
        update: profitData,
      });
    }

    if (agentType === "LEGAL" && "riskAnalysis" in turn) {
      const ra = turn.riskAnalysis;
      const riskData = {
        contractTermsOk: ra.contractTermsOk ?? null,
        missingClauses: ra.missingClauses,
        ndaRequired: ra.ndaRequired ?? null,
        liabilityRisk: ra.liabilityRisk ?? null,
        warrantyRisk: ra.warrantyRisk ?? null,
        complianceNotes: ra.complianceNotes ?? null,
        overallRiskLevel: ra.overallRiskLevel,
        riskFactors: ra.riskFactors,
      };
      await prisma.riskAnalysis.upsert({
        where: { boardReviewId },
        create: { boardReviewId, ...riskData },
        update: riskData,
      });
    }

    conversationContext = conversationContext ? `${conversationContext}\n${agent.name}: ${turn.opinion}` : `${agent.name}: ${turn.opinion}`;
  }

  await logActivity({
    organizationId: boardReview.organizationId,
    type: "MEETING",
    description: `Review round completed for "${meeting.title}" — ${orderedAgents.length} board member(s) contributed.`,
    metadata: { boardReviewId, agentCount: orderedAgents.length },
  });

  publishRealtimeEvent({ kind: "activity", organizationId: boardReview.organizationId });
}

/**
 * Tally rule for the 4-outcome review vote — majority per outcome; ties
 * (no outcome has a strict majority) resolve toward more scrutiny
 * (REJECTED > NEEDS_REVISION > APPROVED_WITH_CHANGES > APPROVED), the same
 * "never let ambiguity resolve toward the least-scrutinized outcome"
 * principle as the War Room's "escalation always wins" rule.
 */
function tallyReviewVotes(votes: VoteChoice[]): BoardReviewDecision {
  const total = votes.length;
  const count = (choice: VoteChoice) => votes.filter((v) => v === choice).length;

  if (count("REJECT") > total / 2) return "REJECTED";
  if (count("REQUEST_REVISION") > total / 2) return "NEEDS_REVISION";
  if (count("APPROVE_WITH_CHANGES") > total / 2) return "APPROVED_WITH_CHANGES";
  if (count("APPROVE") > total / 2) return "APPROVED";

  const tally: Array<{ outcome: BoardReviewDecision; votes: number }> = [
    { outcome: "REJECTED", votes: count("REJECT") },
    { outcome: "NEEDS_REVISION", votes: count("REQUEST_REVISION") },
    { outcome: "APPROVED_WITH_CHANGES", votes: count("APPROVE_WITH_CHANGES") },
    { outcome: "APPROVED", votes: count("APPROVE") },
  ];
  const max = Math.max(...tally.map((t) => t.votes));
  return tally.find((t) => t.votes === max)!.outcome;
}

/**
 * Runs a real-AI vote finalizing this review: every active review-board
 * AIAgentInstance in the org votes in parallel (voting doesn't depend on
 * turn order, same rationale as runMeetingDecisionVote), tallies to one of
 * the 4 BoardReviewDecision outcomes, flattens every agent's
 * already-produced recommendations[] into real Recommendation rows (no
 * extra LLM call — the data was already generated during the discussion
 * round), and notifies + emails the outcome.
 */
export async function runReviewVote(boardReviewId: string): Promise<void> {
  const boardReview = await prisma.boardReview.findUnique({
    where: { id: boardReviewId },
    include: {
      meeting: { include: { messages: { orderBy: { createdAt: "asc" }, include: { senderAgent: true, senderUser: true } } } },
    },
  });
  if (!boardReview) throw new Error("Board review not found.");
  const { meeting } = boardReview;

  const category = DOC_KIND_DECISION_CATEGORY[boardReview.docKind];
  if (!category) throw new Error("Board Review voting isn't available for this document type yet.");

  const agents = await prisma.aIAgentInstance.findMany({
    where: { organizationId: boardReview.organizationId, active: true, type: { in: REVIEW_BOARD_AGENT_TYPES } },
  });
  if (agents.length === 0) throw new Error("This organization has no active AI board agents to vote.");

  const conversationContext = meeting.messages.map(formatMessageLine).join("\n") || undefined;

  let decisionId = boardReview.decisionId;
  if (!decisionId) {
    const decision = await prisma.decision.create({
      data: {
        organizationId: boardReview.organizationId,
        meetingId: meeting.id,
        topic: meeting.title,
        description: meeting.agenda.length > 500 ? `${meeting.agenda.slice(0, 497)}...` : meeting.agenda,
        category,
      },
    });
    decisionId = decision.id;
    await prisma.boardReview.update({ where: { id: boardReviewId }, data: { decisionId } });
  }

  let voteResults: Array<{ agent: AIAgentInstance; vote: VoteChoice; reasoning: string }>;
  try {
    voteResults = await Promise.all(
      agents.map(async (agent) => {
        const result = await runReviewVoteTurn({
          agentId: agent.id,
          agentType: agent.type as ExecutiveAgentType,
          agentName: agent.name,
          topic: meeting.title,
          description: meeting.agenda,
          conversationContext,
        });
        return { agent, vote: result.vote as VoteChoice, reasoning: result.reasoning };
      }),
    );
  } catch (error) {
    if (isAIBillingError(error)) {
      await logActivity({
        organizationId: boardReview.organizationId,
        type: "SYSTEM_EVENT",
        description: `Review vote failed: AI account has no usable credits ("${meeting.title}").`,
        metadata: { boardReviewId },
      });
      throw new AIBillingError(error);
    }
    throw error;
  }

  await prisma.$transaction(
    voteResults.map(({ agent, vote, reasoning }) =>
      prisma.decisionVote.upsert({
        where: { decisionId_agentId: { decisionId: decisionId!, agentId: agent.id } },
        create: { decisionId: decisionId!, agentId: agent.id, vote, reasoning },
        update: { vote, reasoning },
      }),
    ),
  );

  const finalDecision = tallyReviewVotes(voteResults.map((v) => v.vote));

  // Decision.status stays the existing binary-ish DecisionStatus enum;
  // BoardReview.finalDecision carries the real 4-way nuance. Mapping:
  // APPROVED/APPROVED_WITH_CHANGES both read as an approved Decision (the
  // Approval Engine treats both as "allowed to send"); NEEDS_REVISION maps
  // to DELAYED (closest existing meaning: "not ready to finalize yet");
  // REJECTED maps straight across.
  const decisionStatus: DecisionStatus =
    finalDecision === "REJECTED" ? "REJECTED" : finalDecision === "NEEDS_REVISION" ? "DELAYED" : "APPROVED";

  await prisma.decision.update({ where: { id: decisionId }, data: { status: decisionStatus, finalizedAt: new Date() } });

  // Aggregate overallConfidence/winProbability from the discussion round's
  // real structured output — never estimated separately from the vote.
  const reviewMessages = meeting.messages.filter((m) => m.reviewJson != null);
  const confidenceScores = reviewMessages.map((m) => m.confidenceScore).filter((c): c is number => typeof c === "number");
  const overallConfidence = confidenceScores.length > 0 ? confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length : null;
  const winProbabilities = reviewMessages
    .map((m) => (m.reviewJson as unknown as ReviewTurnResult | null)?.winProbability)
    .filter((w): w is number => typeof w === "number");
  const winProbability = winProbabilities.length > 0 ? winProbabilities.reduce((a, b) => a + b, 0) / winProbabilities.length : null;

  await prisma.boardReview.update({
    where: { id: boardReviewId },
    data: { finalDecision, overallConfidence, winProbability },
  });

  // Flatten every agent's already-produced recommendations[] into real
  // Recommendation rows — no extra LLM call, the data already exists.
  const recommendationRows = reviewMessages.flatMap((m) => {
    const parsed = m.reviewJson as unknown as ReviewTurnResult | null;
    return (parsed?.recommendations ?? []).map((r) => ({
      organizationId: boardReview.organizationId,
      type: r.type as RecommendationType,
      title: r.title,
      description: r.description,
      relatedMeetingId: meeting.id,
      ...buildRelatedDocFields(boardReview.docKind, boardReview.docId),
    }));
  });
  if (recommendationRows.length > 0) {
    await prisma.recommendation.createMany({ data: recommendationRows });
  }

  await logActivity({
    organizationId: boardReview.organizationId,
    type: "SYSTEM_EVENT",
    description: `Board review of "${meeting.title}" finalized as ${finalDecision} (${voteResults.length} vote${voteResults.length === 1 ? "" : "s"}).`,
    metadata: {
      boardReviewId,
      finalDecision,
      votes: voteResults.map((v) => ({ agentId: v.agent.id, agentName: v.agent.name, vote: v.vote })),
    },
  });

  await evaluateAutomationRules(boardReview.organizationId, "DECISION_MADE", {
    subject: meeting.title,
    decisionId,
    meetingId: meeting.id,
    ...buildAutomationDocFields(boardReview.docKind, boardReview.docId),
  });
  await fireWorkflowTrigger(boardReview.organizationId, "DECISION_MADE", {
    decisionId,
    topic: meeting.title,
    status: decisionStatus,
    meetingId: meeting.id,
    finalDecision,
    ...buildAutomationDocFields(boardReview.docKind, boardReview.docId),
  });

  await notifyOrganizationOwners({
    organizationId: boardReview.organizationId,
    type: "BOARD_REVIEW_COMPLETED",
    title: `Board review finalized: ${meeting.title}`,
    message: `The AI Proposal Review Board finalized this review as ${finalDecision.replace(/_/g, " ").toLowerCase()}.`,
  });
  await emailOrganizationOwners({
    organizationId: boardReview.organizationId,
    subject: `Board review finalized: ${meeting.title}`,
    text: `Your AI Proposal Review Board finished reviewing "${meeting.title}".\n\nFinal decision: ${finalDecision.replace(/_/g, " ")}\n${overallConfidence != null ? `Overall confidence: ${Math.round(overallConfidence)}%\n` : ""}${winProbability != null ? `Win probability: ${Math.round(winProbability)}%\n` : ""}`,
  });

  publishRealtimeEvent({ kind: "activity", organizationId: boardReview.organizationId });
}
