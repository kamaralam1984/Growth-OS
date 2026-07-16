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
import { generateBusinessDocument } from "@/lib/ai/document-engine";
import { generateTrackingToken, injectDocumentOpenPixel, createDocumentVersion, generateSignatureToken, getSigningUrl } from "@/lib/documents";
import {
  generateBusinessDocumentSchema,
  businessDocumentStatusSchema,
  type GenerateBusinessDocumentInput,
  type BusinessDocumentStatusInput,
} from "@/lib/validations/documents";

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
  console.error("[business-document] AI call failed:", error);
  return { ok: false, errorKind: "generic", error: "Something went wrong generating the document. Please try again." };
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

async function resolveBusinessDocumentInOrg(userId: string, docId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const document = await prisma.businessDocument.findUnique({ where: { id: docId } });
  if (!document || document.organizationId !== membership.organizationId) return null;
  return { membership, document };
}

export interface GenerateBusinessDocumentResult extends ActionResult {
  documentId?: string;
}

export async function generateBusinessDocumentAction(input: GenerateBusinessDocumentInput): Promise<GenerateBusinessDocumentResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = generateBusinessDocumentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the document details." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  if (!checkRateLimit(`bizdoc-generate:${userId}`, { limit: 15, windowMs: 5 * 60_000 }).allowed) {
    return { ok: false, errorKind: "generic", error: "Too many documents requested — wait a few minutes and try again." };
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
  if (parsed.data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
    if (!project || project.organizationId !== organizationId) return { ok: false, error: "Selected project was not found." };
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });

  try {
    const { title, content } = await generateBusinessDocument({
      agentId: agent.id,
      agentName: agent.name,
      kind: parsed.data.kind,
      organizationName: organization?.name ?? "Our organization",
      counterpartyName: parsed.data.counterpartyName || undefined,
      brief: parsed.data.brief,
    });

    const document = await prisma.businessDocument.create({
      data: {
        organizationId,
        companyId: parsed.data.companyId || null,
        dealId: parsed.data.dealId || null,
        projectId: parsed.data.projectId || null,
        kind: parsed.data.kind,
        title,
        content,
        generatedByAgentId: agent.id,
        createdByUserId: userId,
        trackingToken: generateTrackingToken(),
      },
    });

    await createDocumentVersion({ organizationId, docKind: "BUSINESS_DOCUMENT", docId: document.id, title: document.title, content, changedByUserId: userId, changeNote: "Initial AI-generated draft" });
    await prisma.aIAgentInstance.update({ where: { id: agent.id }, data: { completedTasksCount: { increment: 1 } } });

    await logActivity({
      organizationId,
      type: "COMPLETED_WORK",
      description: `${agent.name} drafted ${parsed.data.kind.replace(/_/g, " ").toLowerCase()} "${document.title}".`,
      actorAgentId: agent.id,
      metadata: { businessDocumentId: document.id, dealId: parsed.data.dealId || undefined },
    });
    await logAudit({ userId, organizationId, action: "business_document.generated", metadata: { businessDocumentId: document.id, kind: parsed.data.kind } });
    await notifyOrganizationOwners({ organizationId, type: "EMAIL_READY", title: "Document ready", message: `"${document.title}" is drafted and ready to review.` });

    revalidatePath("/dashboard/proposal/documents");
    revalidatePath("/dashboard/proposal");
    if (parsed.data.dealId) revalidatePath(`/dashboard/crm/deals/${parsed.data.dealId}`);
    return { ok: true, documentId: document.id };
  } catch (error) {
    return describeAIError(error);
  }
}

export async function updateBusinessDocumentStatus(documentId: string, status: BusinessDocumentStatusInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsedStatus = businessDocumentStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Invalid status." };

  const resolved = await resolveBusinessDocumentInOrg(userId, documentId);
  if (!resolved) return { ok: false, error: "Document not found." };

  await prisma.businessDocument.update({ where: { id: documentId }, data: { status: parsedStatus.data } });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "business_document.status_updated", metadata: { documentId, status: parsedStatus.data } });

  revalidatePath(`/dashboard/proposal/documents/${documentId}`);
  revalidatePath("/dashboard/proposal/documents");
  return { ok: true };
}

export async function sendBusinessDocumentToClient(documentId: string, recipientEmail: string, message?: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveBusinessDocumentInOrg(userId, documentId);
  if (!resolved) return { ok: false, error: "Document not found." };
  const { document, membership } = resolved;

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ok: false, error: "Enter a valid recipient email address." };
  }

  const bodyText = [message?.trim(), `Please find "${document.title}".`].filter(Boolean).join("\n\n");
  const bodyHtml = `<p>${(message?.trim() ?? "").replace(/\n/g, "<br/>")}</p><p>Please find "<strong>${document.title}</strong>".</p>`;
  const html = document.trackingToken ? injectDocumentOpenPixel(bodyHtml, "BUSINESS_DOCUMENT", document.trackingToken) : bodyHtml;

  const result = await sendOutreachEmail(membership.organizationId, { to: recipientEmail, subject: document.title, html, text: bodyText });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.businessDocument.update({ where: { id: documentId }, data: { status: "SENT", sentAt: new Date() } });
  await logActivity({ organizationId: membership.organizationId, type: "SYSTEM_EVENT", description: `${session.user?.name ?? "A team member"} sent "${document.title}" to ${recipientEmail}.`, actorUserId: userId, metadata: { businessDocumentId: documentId } });

  revalidatePath(`/dashboard/proposal/documents/${documentId}`);
  return { ok: true };
}

export interface RequestSignatureResult extends ActionResult {
  signingUrl?: string;
}

export async function requestBusinessDocumentSignature(documentId: string, signerName: string, signerEmail: string): Promise<RequestSignatureResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveBusinessDocumentInOrg(userId, documentId);
  if (!resolved) return { ok: false, error: "Document not found." };
  const { document, membership } = resolved;
  const organizationId = membership.organizationId;

  if (!signerName.trim()) return { ok: false, error: "Enter the signer's name." };
  if (!signerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) return { ok: false, error: "Enter a valid signer email address." };

  try {
    const token = generateSignatureToken();
    await prisma.signature.create({
      data: { organizationId, docKind: "BUSINESS_DOCUMENT", docId: documentId, signerName: signerName.trim(), signerEmail: signerEmail.trim(), provider: "MANUAL", status: "PENDING", signatureToken: token, requestedByUserId: userId },
    });

    const signingUrl = getSigningUrl(token);
    const result = await sendOutreachEmail(organizationId, {
      to: signerEmail,
      subject: `Signature requested: ${document.title}`,
      html: `<p>Please review and sign "<strong>${document.title}</strong>":</p><p><a href="${signingUrl}">${signingUrl}</a></p>`,
      text: `Please review and sign "${document.title}": ${signingUrl}`,
    });
    if (!result.ok) console.error("[business-document] requestBusinessDocumentSignature email failed:", result.error);

    await logActivity({ organizationId, type: "SYSTEM_EVENT", description: `${session.user?.name ?? "A team member"} requested a signature from ${signerName} for "${document.title}".`, actorUserId: userId, metadata: { businessDocumentId: documentId } });

    revalidatePath(`/dashboard/proposal/documents/${documentId}`);
    return { ok: true, signingUrl };
  } catch (error) {
    console.error("[business-document] requestBusinessDocumentSignature failed:", error);
    return { ok: false, error: "Something went wrong requesting the signature. Please try again." };
  }
}

export async function deleteBusinessDocument(documentId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveBusinessDocumentInOrg(userId, documentId);
  if (!resolved) return { ok: false, error: "Document not found." };

  await prisma.businessDocument.delete({ where: { id: documentId } });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "business_document.deleted", metadata: { documentId } });
  revalidatePath("/dashboard/proposal/documents");
  return { ok: true };
}
