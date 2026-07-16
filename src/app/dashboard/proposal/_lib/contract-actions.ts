"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { sendOutreachEmail } from "@/lib/outreach/email-provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { AINotConnectedError, AIBillingError, isAIBillingError } from "@/lib/ai/client";
import { generateContractContent } from "@/lib/ai/document-engine";
import { generateTrackingToken, injectDocumentOpenPixel, createDocumentVersion, getSigningUrl, requestSignature, renderDocumentToPdf } from "@/lib/documents";
import { generateContractSchema, contractStatusSchema, type GenerateContractInput, type ContractStatusInput } from "@/lib/validations/documents";
import { checkApprovalGate } from "@/lib/approval-engine";
import { scheduleBoardReview } from "@/lib/ai/review-orchestrator";
import { resolveDocumentById } from "./document-resolver";

export interface ActionResult {
  ok: boolean;
  error?: string;
  errorKind?: "not_connected" | "billing" | "generic";
}

function describeAIError(error: unknown): ActionResult {
  if (error instanceof AINotConnectedError) {
    return { ok: false, errorKind: "not_connected", error: "AI is not connected — no ANTHROPIC_API_KEY is configured for this environment." };
  }
  if (error instanceof AIBillingError || isAIBillingError(error)) {
    return { ok: false, errorKind: "billing", error: "AI is connected but the account has no API credits — add credits at console.anthropic.com/settings/billing." };
  }
  console.error("[contract] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong generating the contract. Please try again." };
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

async function resolveContractInOrg(userId: string, contractId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const contract = await prisma.contract.findUnique({ where: { id: contractId } });
  if (!contract || contract.organizationId !== membership.organizationId) return null;
  return { membership, contract };
}

async function nextContractNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.contract.count({ where: { organizationId, createdAt: { gte: new Date(`${year}-01-01`) } } });
  return `CON-${year}-${String(count + 1).padStart(4, "0")}`;
}

export interface GenerateContractResult extends ActionResult {
  contractId?: string;
}

export async function generateContract(input: GenerateContractInput): Promise<GenerateContractResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = generateContractSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the contract details." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  if (!checkRateLimit(`contract-generate:${userId}`, { limit: 15, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many contracts requested — wait a few minutes and try again." };
  }

  const agent = await prisma.aIAgentInstance.findUnique({ where: { organizationId_type: { organizationId, type: "PROPOSAL" } } });
  if (!agent) return { ok: false, error: "Your Proposal agent isn't set up yet." };

  if (parsed.data.companyId) {
    const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId } });
    if (!company || company.organizationId !== organizationId) return { ok: false, error: "Selected company was not found." };
  }
  if (parsed.data.dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: parsed.data.dealId } });
    if (!deal || deal.organizationId !== organizationId) return { ok: false, error: "Selected deal was not found." };
  }
  if (parsed.data.clientId) {
    const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId } });
    if (!client || client.organizationId !== organizationId) return { ok: false, error: "Selected client was not found." };
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });

  try {
    const { content } = await generateContractContent({
      agentId: agent.id,
      agentName: agent.name,
      contractType: parsed.data.type,
      partyName: organization?.name ?? "Our organization",
      clientName: parsed.data.clientName,
      value: parsed.data.value,
      startDate: parsed.data.startDate?.toISOString().slice(0, 10),
      endDate: parsed.data.endDate?.toISOString().slice(0, 10),
      brief: parsed.data.brief,
    });

    const contractNumber = await nextContractNumber(organizationId);

    const contract = await prisma.contract.create({
      data: {
        organizationId,
        companyId: parsed.data.companyId || null,
        dealId: parsed.data.dealId || null,
        clientId: parsed.data.clientId || null,
        contractNumber,
        type: parsed.data.type,
        title: parsed.data.title,
        content,
        value: parsed.data.value ?? null,
        startDate: parsed.data.startDate ?? null,
        endDate: parsed.data.endDate ?? null,
        generatedByAgentId: agent.id,
        createdByUserId: userId,
        trackingToken: generateTrackingToken(),
      },
    });

    await createDocumentVersion({ organizationId, docKind: "CONTRACT", docId: contract.id, title: contract.title, content, changedByUserId: userId, changeNote: "Initial AI-generated draft" });
    await prisma.aIAgentInstance.update({ where: { id: agent.id }, data: { completedTasksCount: { increment: 1 } } });

    await logActivity({
      organizationId,
      type: "COMPLETED_WORK",
      description: `${agent.name} drafted contract "${contract.title}" (${contract.contractNumber}).`,
      actorAgentId: agent.id,
      metadata: { contractId: contract.id, dealId: parsed.data.dealId || undefined },
    });
    await logAudit({ userId, organizationId, action: "contract.generated", metadata: { contractId: contract.id } });

    try {
      await scheduleBoardReview({ organizationId, docKind: "CONTRACT", docId: contract.id, requestedByUserId: userId });
    } catch (scheduleError) {
      console.error("[contract] auto-schedule board review failed:", scheduleError);
    }

    revalidatePath("/dashboard/proposal/contracts");
    revalidatePath("/dashboard/proposal");
    if (parsed.data.dealId) revalidatePath(`/dashboard/crm/deals/${parsed.data.dealId}`);
    return { ok: true, contractId: contract.id };
  } catch (error) {
    return describeAIError(error);
  }
}

export async function updateContractStatus(contractId: string, status: ContractStatusInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsedStatus = contractStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Invalid status." };

  const resolved = await resolveContractInOrg(userId, contractId);
  if (!resolved) return { ok: false, error: "Contract not found." };

  await prisma.contract.update({ where: { id: contractId }, data: { status: parsedStatus.data } });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "contract.status_updated", metadata: { contractId, status: parsedStatus.data } });

  revalidatePath(`/dashboard/proposal/contracts/${contractId}`);
  revalidatePath("/dashboard/proposal/contracts");
  return { ok: true };
}

export async function sendContractToClient(contractId: string, recipientEmail: string, message?: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveContractInOrg(userId, contractId);
  if (!resolved) return { ok: false, error: "Contract not found." };
  const { contract, membership } = resolved;

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ok: false, error: "Enter a valid recipient email address." };
  }

  const gate = await checkApprovalGate(membership.organizationId, "CONTRACT", contractId);
  if (!gate.allowed) return { ok: false, error: gate.reason };

  const bodyText = [message?.trim(), `Please find our contract "${contract.title}" (${contract.contractNumber}).`].filter(Boolean).join("\n\n");
  const bodyHtml = `<p>${(message?.trim() ?? "").replace(/\n/g, "<br/>")}</p><p>Please find our contract "<strong>${contract.title}</strong>" (${contract.contractNumber}).</p>`;
  const html = contract.trackingToken ? injectDocumentOpenPixel(bodyHtml, "CONTRACT", contract.trackingToken) : bodyHtml;

  const result = await sendOutreachEmail(membership.organizationId, { to: recipientEmail, subject: `Contract: ${contract.title}`, html, text: bodyText });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.contract.update({ where: { id: contractId }, data: { status: "SENT", sentAt: new Date() } });
  await logActivity({ organizationId: membership.organizationId, type: "SYSTEM_EVENT", description: `${session.user?.name ?? "A team member"} sent contract "${contract.title}" to ${recipientEmail}.`, actorUserId: userId, metadata: { contractId } });

  revalidatePath(`/dashboard/proposal/contracts/${contractId}`);
  return { ok: true };
}

export async function requestContractApproval(contractId: string, approverUserId: string, note?: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveContractInOrg(userId, contractId);
  if (!resolved) return { ok: false, error: "Contract not found." };
  const { contract, membership } = resolved;
  const organizationId = membership.organizationId;

  const approverMembership = await prisma.membership.findFirst({ where: { userId: approverUserId, organizationId, status: "ACTIVE" } });
  if (!approverMembership) return { ok: false, error: "That approver could not be found." };

  await prisma.task.create({
    data: {
      organizationId,
      type: "APPROVAL",
      title: `Approve contract: ${contract.title}`,
      description: note || `${session.user?.name ?? "A team member"} requested approval for "${contract.title}".`,
      assignedByUserId: userId,
      assignedToUserId: approverUserId,
      priority: "HIGH",
    },
  });
  await notifyOrganizationOwners({ organizationId, type: "APPROVAL_REQUESTED", title: "Contract approval requested", message: `${session.user?.name ?? "A team member"} requested approval for "${contract.title}".` });
  await logActivity({ organizationId, type: "SYSTEM_EVENT", description: `${session.user?.name ?? "A team member"} requested approval for contract "${contract.title}".`, actorUserId: userId, metadata: { contractId } });

  revalidatePath(`/dashboard/proposal/contracts/${contractId}`);
  return { ok: true };
}

export interface RequestSignatureResult extends ActionResult {
  signingUrl?: string;
}

/**
 * Creates a real Signature record via requestSignature() — tries a real
 * DocuSign (or Dropbox Sign) envelope first when the org has one connected,
 * falling back to the internal MANUAL token flow otherwise. The DocuSign/
 * Dropbox Sign paths email the signer directly from the provider; only the
 * MANUAL fallback needs this app to send its own signing-link email.
 */
export async function requestContractSignature(contractId: string, signerName: string, signerEmail: string): Promise<RequestSignatureResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveContractInOrg(userId, contractId);
  if (!resolved) return { ok: false, error: "Contract not found." };
  const { contract, membership } = resolved;
  const organizationId = membership.organizationId;

  if (!signerName.trim()) return { ok: false, error: "Enter the signer's name." };
  if (!signerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) return { ok: false, error: "Enter a valid signer email address." };

  try {
    const resolvedDoc = await resolveDocumentById("CONTRACT", contractId);
    if (!resolvedDoc) return { ok: false, error: "Contract not found." };
    const documentBuffer = await renderDocumentToPdf({ ...resolvedDoc.blueprint, docusignAnchor: true });

    const signResult = await requestSignature(
      organizationId,
      "CONTRACT",
      contractId,
      documentBuffer,
      contract.title,
      { name: signerName.trim(), email: signerEmail.trim() },
      userId,
    );

    let signingUrl: string | undefined;
    if (signResult.provider === "MANUAL" && signResult.token) {
      signingUrl = getSigningUrl(signResult.token);
      const result = await sendOutreachEmail(organizationId, {
        to: signerEmail,
        subject: `Signature requested: ${contract.title}`,
        html: `<p>Please review and sign "<strong>${contract.title}</strong>":</p><p><a href="${signingUrl}">${signingUrl}</a></p>`,
        text: `Please review and sign "${contract.title}": ${signingUrl}`,
      });
      if (!result.ok) {
        console.error("[contract] requestContractSignature email failed:", result.error);
      }
    }

    await logActivity({ organizationId, type: "SYSTEM_EVENT", description: `${session.user?.name ?? "A team member"} requested a signature from ${signerName} for contract "${contract.title}" via ${signResult.provider}.`, actorUserId: userId, metadata: { contractId } });

    revalidatePath(`/dashboard/proposal/contracts/${contractId}`);
    return { ok: true, signingUrl };
  } catch (error) {
    console.error("[contract] requestContractSignature failed:", error);
    return { ok: false, error: "Something went wrong requesting the signature. Please try again." };
  }
}

export async function deleteContract(contractId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveContractInOrg(userId, contractId);
  if (!resolved) return { ok: false, error: "Contract not found." };

  await prisma.contract.delete({ where: { id: contractId } });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "contract.deleted", metadata: { contractId } });
  revalidatePath("/dashboard/proposal/contracts");
  return { ok: true };
}
