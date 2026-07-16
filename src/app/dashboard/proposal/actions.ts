"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { emailOrganizationOwners } from "@/lib/email";
import { sendOutreachEmail } from "@/lib/outreach/email-provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateProposalSections, suggestProposalRecommendations } from "@/lib/ai/document-engine";
import { generateTrackingToken, injectDocumentOpenPixel, createDocumentVersion } from "@/lib/documents";
import { checkApprovalGate } from "@/lib/approval-engine";
import { scheduleBoardReview } from "@/lib/ai/review-orchestrator";
import {
  generateProposalSchema,
  updateProposalContentSchema,
  proposalStatusSchema,
  type GenerateProposalInput,
  type UpdateProposalContentInput,
  type ProposalStatusInput,
} from "@/lib/validations/proposal";
import { flattenProposalSections } from "./_lib/proposal-blueprint";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

export interface GenerateProposalResult extends ActionResult {
  proposalId?: string;
}

function describeAIError(error: unknown, prefix = "generating the proposal"): ActionResult {
  if (error instanceof AINotConnectedError) {
    return { ok: false, errorKind: "not_connected", error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment." };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return { ok: false, errorKind: "billing", error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing." };
  }
  console.error(`[proposal] AI call failed (${prefix}):`, error);
  return { ok: false, errorKind: "generic", error: `Something went wrong ${prefix}. Please try again.` };
}

async function resolveProposalInOrg(userId: string, proposalId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal || proposal.organizationId !== membership.organizationId) return null;
  return { membership, proposal };
}

/** Real proposal draft via the org's Proposal agent — structured AI Proposal Engine output (generateProposalSections), never a single unstructured blob anymore. */
export async function generateProposal(input: GenerateProposalInput): Promise<GenerateProposalResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = generateProposalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the proposal brief." };
  }

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  if (!checkRateLimit(`proposal-generate:${userId}`, { limit: 15, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many proposals requested — wait a few minutes and try again." };
  }

  const agent = await prisma.aIAgentInstance.findUnique({
    where: { organizationId_type: { organizationId, type: "PROPOSAL" } },
  });
  if (!agent) return { ok: false, error: "Your Proposal agent isn't set up yet." };

  let companyName: string | null = null;
  if (parsed.data.companyId) {
    const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId } });
    if (!company || company.organizationId !== organizationId) return { ok: false, error: "Selected company was not found." };
    companyName = company.name;
  }
  if (parsed.data.leadId) {
    const lead = await prisma.lead.findUnique({ where: { id: parsed.data.leadId }, include: { pipelineStage: { include: { workspace: true } } } });
    if (!lead || lead.pipelineStage.workspace.organizationId !== organizationId) return { ok: false, error: "Selected lead was not found." };
  }
  if (parsed.data.dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: parsed.data.dealId } });
    if (!deal || deal.organizationId !== organizationId) return { ok: false, error: "Selected deal was not found." };
  }
  if (parsed.data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
    if (!project || project.organizationId !== organizationId) return { ok: false, error: "Selected project was not found." };
  }

  try {
    const sections = await generateProposalSections({
      agentId: agent.id,
      agentName: agent.name,
      title: parsed.data.title,
      brief: parsed.data.brief,
      industry: parsed.data.industry,
      companyContext: companyName ? `Client: ${companyName}` : undefined,
      pricingModel: parsed.data.pricingModel,
    });
    const content = flattenProposalSections(sections);

    const proposal = await prisma.proposal.create({
      data: {
        organizationId,
        companyId: parsed.data.companyId || null,
        leadId: parsed.data.leadId || null,
        dealId: parsed.data.dealId || null,
        projectId: parsed.data.projectId || null,
        title: parsed.data.title,
        content,
        sections,
        estimation: sections.estimation,
        industry: parsed.data.industry,
        pricingModel: parsed.data.pricingModel,
        value: parsed.data.value ?? null,
        generatedByAgentId: agent.id,
        createdByUserId: userId,
        status: "DRAFT",
        trackingToken: generateTrackingToken(),
      },
    });

    await createDocumentVersion({
      organizationId,
      docKind: "PROPOSAL",
      docId: proposal.id,
      title: proposal.title,
      content,
      changedByUserId: userId,
      changeNote: "Initial AI-generated draft",
    });

    await prisma.aIAgentInstance.update({ where: { id: agent.id }, data: { completedTasksCount: { increment: 1 } } });

    await logActivity({
      organizationId,
      type: "COMPLETED_WORK",
      description: `${agent.name} drafted proposal "${proposal.title}".`,
      actorAgentId: agent.id,
      metadata: { proposalId: proposal.id, dealId: parsed.data.dealId || undefined },
    });
    await logAudit({ userId, organizationId, action: "proposal.generated", metadata: { proposalId: proposal.id } });
    await notifyOrganizationOwners({
      organizationId,
      type: "EMAIL_READY",
      title: "Proposal ready",
      message: `"${proposal.title}" is drafted and ready to review.`,
    });
    await emailOrganizationOwners({
      organizationId,
      subject: `Proposal ready: ${proposal.title}`,
      text: `Your Proposal agent drafted "${proposal.title}"${companyName ? ` for ${companyName}` : ""}. Review it in KVL GrowthOS before sending.`,
    });

    // "Whenever a proposal is created, automatically schedule an AI Board
    // Meeting" — schedules the review shell only (no AI round runs yet, the
    // owner starts that from the Review Room). Never lets a scheduling
    // failure break proposal generation itself.
    try {
      await scheduleBoardReview({ organizationId, docKind: "PROPOSAL", docId: proposal.id, requestedByUserId: userId });
    } catch (scheduleError) {
      console.error("[proposal] auto-schedule board review failed:", scheduleError);
    }

    revalidatePath("/dashboard/proposal");
    revalidatePath("/dashboard/proposal/proposals");
    revalidatePath("/dashboard");
    if (parsed.data.dealId) revalidatePath(`/dashboard/crm/deals/${parsed.data.dealId}`);
    return { ok: true, proposalId: proposal.id };
  } catch (error) {
    return describeAIError(error);
  }
}

export async function updateProposalContent(proposalId: string, input: UpdateProposalContentInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = updateProposalContentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the proposal content." };
  }

  const resolved = await resolveProposalInOrg(userId, proposalId);
  if (!resolved) return { ok: false, error: "Proposal not found." };

  try {
    await prisma.proposal.update({
      where: { id: proposalId },
      data: { title: parsed.data.title, content: parsed.data.content, value: parsed.data.value ?? null },
    });

    await createDocumentVersion({
      organizationId: resolved.membership.organizationId,
      docKind: "PROPOSAL",
      docId: proposalId,
      title: parsed.data.title,
      content: parsed.data.content,
      changedByUserId: userId,
      changeNote: "Manual edit",
    });

    revalidatePath(`/dashboard/proposal/proposals/${proposalId}`);
    revalidatePath("/dashboard/proposal");
    revalidatePath("/dashboard/proposal/proposals");
    return { ok: true };
  } catch (error) {
    console.error("[proposal] updateProposalContent failed:", error);
    return { ok: false, error: "Something went wrong saving the proposal. Please try again." };
  }
}

export async function updateProposalStatus(proposalId: string, status: ProposalStatusInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsedStatus = proposalStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Invalid status." };

  const resolved = await resolveProposalInOrg(userId, proposalId);
  if (!resolved) return { ok: false, error: "Proposal not found." };
  const { proposal, membership } = resolved;
  const organizationId = membership.organizationId;

  try {
    const timestampField =
      parsedStatus.data === "ACCEPTED" ? { acceptedAt: new Date() } : parsedStatus.data === "REJECTED" ? { rejectedAt: new Date() } : parsedStatus.data === "SENT" ? { sentAt: new Date() } : {};

    await prisma.proposal.update({ where: { id: proposalId }, data: { status: parsedStatus.data, ...timestampField } });
    await logAudit({ userId, organizationId, action: "proposal.status_updated", metadata: { proposalId, status: parsedStatus.data } });

    if (parsedStatus.data === "ACCEPTED") {
      await notifyOrganizationOwners({ organizationId, type: "PROPOSAL_ACCEPTED", title: "Proposal accepted", message: `"${proposal.title}" was accepted.` });
      await evaluateAutomationRules(organizationId, "PROPOSAL_ACCEPTED", { subject: proposal.title, proposalId });
      await fireWorkflowTrigger(organizationId, "PROPOSAL_ACCEPTED", { proposalId, title: proposal.title, value: proposal.value, dealId: proposal.dealId, companyId: proposal.companyId });
    } else if (parsedStatus.data === "REJECTED") {
      await notifyOrganizationOwners({ organizationId, type: "PROPOSAL_REJECTED", title: "Proposal rejected", message: `"${proposal.title}" was rejected.` });
      await evaluateAutomationRules(organizationId, "PROPOSAL_REJECTED", { subject: proposal.title, proposalId });
      await fireWorkflowTrigger(organizationId, "PROPOSAL_REJECTED", { proposalId, title: proposal.title, value: proposal.value, dealId: proposal.dealId, companyId: proposal.companyId });
    }

    revalidatePath(`/dashboard/proposal/proposals/${proposalId}`);
    revalidatePath("/dashboard/proposal");
    revalidatePath("/dashboard/proposal/proposals");
    return { ok: true };
  } catch (error) {
    console.error("[proposal] updateProposalStatus failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Real outbound send via the same sendOutreachEmail primitive Outreach campaigns use (Resend, falling back to SMTP) — never a fire-and-forget fake send. */
export async function sendProposalToClient(proposalId: string, recipientEmail: string, message?: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveProposalInOrg(userId, proposalId);
  if (!resolved) return { ok: false, error: "Proposal not found." };
  const { proposal, membership } = resolved;
  const organizationId = membership.organizationId;

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ok: false, error: "Enter a valid recipient email address." };
  }

  const gate = await checkApprovalGate(organizationId, "PROPOSAL", proposalId);
  if (!gate.allowed) return { ok: false, error: gate.reason };

  const bodyText = [message?.trim(), `Please find our proposal "${proposal.title}" attached/linked. You can view it any time in your inbox.`].filter(Boolean).join("\n\n");
  const bodyHtml = `<p>${(message?.trim() ?? "").replace(/\n/g, "<br/>")}</p><p>Please find our proposal "<strong>${proposal.title}</strong>".</p>`;
  const html = proposal.trackingToken ? injectDocumentOpenPixel(bodyHtml, "PROPOSAL", proposal.trackingToken) : bodyHtml;

  const result = await sendOutreachEmail(organizationId, { to: recipientEmail, subject: `Proposal: ${proposal.title}`, html, text: bodyText });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.proposal.update({ where: { id: proposalId }, data: { status: "SENT", sentAt: new Date() } });
  await notifyOrganizationOwners({ organizationId, type: "PROPOSAL_SENT", title: "Proposal sent", message: `"${proposal.title}" was sent to ${recipientEmail}.` });
  await logActivity({ organizationId, type: "SYSTEM_EVENT", description: `${session.user?.name ?? "A team member"} sent proposal "${proposal.title}" to ${recipientEmail}.`, actorUserId: userId, metadata: { proposalId } });
  await logAudit({ userId, organizationId, action: "proposal.sent", metadata: { proposalId, recipientEmail } });

  revalidatePath(`/dashboard/proposal/proposals/${proposalId}`);
  return { ok: true };
}

/** Reuses the CRM Deal's Task-based approval pattern (see requestDealApproval in src/app/dashboard/crm/_lib/deal-actions.ts) rather than the EmailDraft-bound Approval model. */
export async function requestProposalApproval(proposalId: string, approverUserId: string, note?: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveProposalInOrg(userId, proposalId);
  if (!resolved) return { ok: false, error: "Proposal not found." };
  const { proposal, membership } = resolved;
  const organizationId = membership.organizationId;

  const approverMembership = await prisma.membership.findFirst({ where: { userId: approverUserId, organizationId, status: "ACTIVE" } });
  if (!approverMembership) return { ok: false, error: "That approver could not be found." };

  try {
    await prisma.task.create({
      data: {
        organizationId,
        type: "APPROVAL",
        title: `Approve proposal: ${proposal.title}`,
        description: note || `${session.user?.name ?? "A team member"} requested approval for "${proposal.title}".`,
        assignedByUserId: userId,
        assignedToUserId: approverUserId,
        priority: "HIGH",
      },
    });
    await notifyOrganizationOwners({ organizationId, type: "APPROVAL_REQUESTED", title: "Proposal approval requested", message: `${session.user?.name ?? "A team member"} requested approval for "${proposal.title}".` });
    await logActivity({ organizationId, type: "SYSTEM_EVENT", description: `${session.user?.name ?? "A team member"} requested approval for proposal "${proposal.title}".`, actorUserId: userId, metadata: { proposalId } });

    revalidatePath(`/dashboard/proposal/proposals/${proposalId}`);
    return { ok: true };
  } catch (error) {
    console.error("[proposal] requestProposalApproval failed:", error);
    return { ok: false, error: "Something went wrong requesting approval. Please try again." };
  }
}

export interface RecommendationsResult extends ActionResult {
  recommendations?: Array<{ id: string; type: string; title: string; description: string }>;
}

/** Real Claude call powering the AI Recommendations panel on a proposal — better pricing, upsell/cross-sell, timeline, risk warnings. */
export async function refreshProposalRecommendations(proposalId: string): Promise<RecommendationsResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveProposalInOrg(userId, proposalId);
  if (!resolved) return { ok: false, error: "Proposal not found." };
  const { proposal, membership } = resolved;
  const organizationId = membership.organizationId;

  if (!checkRateLimit(`proposal-recs:${userId}`, { limit: 15, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many AI requests — wait a few minutes and try again." };
  }

  const agent = await prisma.aIAgentInstance.findUnique({ where: { organizationId_type: { organizationId, type: "PROPOSAL" } } });
  if (!agent) return { ok: false, error: "Your Proposal agent isn't set up yet." };

  try {
    const result = await suggestProposalRecommendations({
      agentId: agent.id,
      agentName: agent.name,
      proposalTitle: proposal.title,
      proposalSummary: proposal.content.slice(0, 4000),
      value: proposal.value ?? undefined,
    });

    const created = await prisma.$transaction(
      result.recommendations.map((r) =>
        prisma.recommendation.create({
          data: { organizationId, type: r.type, title: r.title, description: r.description, relatedProposalId: proposalId },
        }),
      ),
    );

    revalidatePath(`/dashboard/proposal/proposals/${proposalId}`);
    return { ok: true, recommendations: created.map((r) => ({ id: r.id, type: r.type, title: r.title, description: r.description })) };
  } catch (error) {
    return describeAIError(error, "generating recommendations");
  }
}
