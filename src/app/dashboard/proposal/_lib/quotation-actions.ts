"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { sendOutreachEmail } from "@/lib/outreach/email-provider";
import { generateTrackingToken, injectDocumentOpenPixel, createDocumentVersion } from "@/lib/documents";
import { generateQuotationSchema, quotationStatusSchema, type GenerateQuotationInput, type QuotationStatusInput } from "@/lib/validations/documents";
import { checkApprovalGate } from "@/lib/approval-engine";
import { scheduleBoardReview } from "@/lib/ai/review-orchestrator";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" }, include: { organization: true } });
}

async function resolveQuotationInOrg(userId: string, quotationId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const quotation = await prisma.quotation.findUnique({ where: { id: quotationId }, include: { lineItems: true } });
  if (!quotation || quotation.organizationId !== membership.organizationId) return null;
  return { membership, quotation };
}

async function nextQuotationNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.quotation.count({ where: { organizationId, createdAt: { gte: new Date(`${year}-01-01`) } } });
  return `QUO-${year}-${String(count + 1).padStart(4, "0")}`;
}

function computeLineItemAmount(quantity: number, rate: number, discountPercent?: number): number {
  const gross = quantity * rate;
  return discountPercent ? gross * (1 - discountPercent / 100) : gross;
}

export interface CreateQuotationResult extends ActionResult {
  quotationId?: string;
}

/** Real, deterministic quotation math — line items, discount, GST/tax, grand total. No AI-invented numbers; AI can only assist drafting notes/terms elsewhere. */
export async function createQuotation(input: GenerateQuotationInput): Promise<CreateQuotationResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = generateQuotationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the quotation details." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

  if (parsed.data.companyId) {
    const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId } });
    if (!company || company.organizationId !== organizationId) return { ok: false, error: "Selected company was not found." };
  }
  if (parsed.data.contactId) {
    const contact = await prisma.contact.findUnique({ where: { id: parsed.data.contactId } });
    if (!contact || contact.organizationId !== organizationId) return { ok: false, error: "Selected contact was not found." };
  }
  if (parsed.data.dealId) {
    const deal = await prisma.deal.findUnique({ where: { id: parsed.data.dealId } });
    if (!deal || deal.organizationId !== organizationId) return { ok: false, error: "Selected deal was not found." };
  }

  try {
    const lineItemsWithAmount = parsed.data.lineItems.map((li, order) => ({
      description: li.description,
      quantity: li.quantity,
      rate: li.rate,
      discountPercent: li.discountPercent ?? null,
      amount: computeLineItemAmount(li.quantity, li.rate, li.discountPercent),
      order,
    }));
    const subtotal = lineItemsWithAmount.reduce((sum, li) => sum + li.amount, 0);
    const discountAmount = parsed.data.discountPercent ? subtotal * (parsed.data.discountPercent / 100) : 0;
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = parsed.data.taxPercent ? afterDiscount * (parsed.data.taxPercent / 100) : 0;
    const grandTotal = afterDiscount + taxAmount;

    const quotationNumber = await nextQuotationNumber(organizationId);

    const quotation = await prisma.quotation.create({
      data: {
        organizationId,
        companyId: parsed.data.companyId || null,
        contactId: parsed.data.contactId || null,
        dealId: parsed.data.dealId || null,
        quotationNumber,
        title: parsed.data.title,
        pricingModel: parsed.data.pricingModel,
        currency: parsed.data.currency || membership.organization.currency,
        subtotal,
        discountPercent: parsed.data.discountPercent ?? null,
        discountAmount,
        taxPercent: parsed.data.taxPercent ?? null,
        taxAmount,
        grandTotal,
        validUntil: parsed.data.validUntil ?? null,
        notes: parsed.data.notes || null,
        terms: parsed.data.terms || null,
        createdByUserId: userId,
        trackingToken: generateTrackingToken(),
        lineItems: { create: lineItemsWithAmount },
      },
      include: { lineItems: true },
    });

    await createDocumentVersion({
      organizationId,
      docKind: "QUOTATION",
      docId: quotation.id,
      title: quotation.title,
      content: JSON.stringify({ lineItems: lineItemsWithAmount, grandTotal }),
      changedByUserId: userId,
      changeNote: "Initial quotation",
    });

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} created quotation "${quotation.title}" (${quotation.quotationNumber}).`,
      actorUserId: userId,
      metadata: { quotationId: quotation.id, dealId: parsed.data.dealId || undefined },
    });
    await logAudit({ userId, organizationId, action: "quotation.created", metadata: { quotationId: quotation.id } });

    try {
      await scheduleBoardReview({ organizationId, docKind: "QUOTATION", docId: quotation.id, requestedByUserId: userId });
    } catch (scheduleError) {
      console.error("[quotation] auto-schedule board review failed:", scheduleError);
    }

    revalidatePath("/dashboard/proposal/quotations");
    revalidatePath("/dashboard/proposal");
    if (parsed.data.dealId) revalidatePath(`/dashboard/crm/deals/${parsed.data.dealId}`);
    return { ok: true, quotationId: quotation.id };
  } catch (error) {
    console.error("[quotation] createQuotation failed:", error);
    return { ok: false, error: "Something went wrong creating the quotation. Please try again." };
  }
}

export async function updateQuotationStatus(quotationId: string, status: QuotationStatusInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsedStatus = quotationStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Invalid status." };

  const resolved = await resolveQuotationInOrg(userId, quotationId);
  if (!resolved) return { ok: false, error: "Quotation not found." };
  const { quotation, membership } = resolved;

  const timestampField =
    parsedStatus.data === "ACCEPTED" ? { acceptedAt: new Date() } : parsedStatus.data === "REJECTED" ? { rejectedAt: new Date() } : parsedStatus.data === "SENT" ? { sentAt: new Date() } : {};

  await prisma.quotation.update({ where: { id: quotationId }, data: { status: parsedStatus.data, ...timestampField } });
  await logAudit({ userId, organizationId: membership.organizationId, action: "quotation.status_updated", metadata: { quotationId, status: parsedStatus.data } });

  if (parsedStatus.data === "ACCEPTED") {
    await notifyOrganizationOwners({ organizationId: membership.organizationId, type: "CRM_EVENT", title: "Quotation accepted", message: `"${quotation.title}" was accepted.` });
  }

  revalidatePath(`/dashboard/proposal/quotations/${quotationId}`);
  revalidatePath("/dashboard/proposal/quotations");
  return { ok: true };
}

export async function sendQuotationToClient(quotationId: string, recipientEmail: string, message?: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveQuotationInOrg(userId, quotationId);
  if (!resolved) return { ok: false, error: "Quotation not found." };
  const { quotation, membership } = resolved;

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ok: false, error: "Enter a valid recipient email address." };
  }

  const gate = await checkApprovalGate(membership.organizationId, "QUOTATION", quotationId);
  if (!gate.allowed) return { ok: false, error: gate.reason };

  const bodyText = [message?.trim(), `Please find our quotation "${quotation.title}" (${quotation.quotationNumber}).`].filter(Boolean).join("\n\n");
  const bodyHtml = `<p>${(message?.trim() ?? "").replace(/\n/g, "<br/>")}</p><p>Please find our quotation "<strong>${quotation.title}</strong>" (${quotation.quotationNumber}).</p>`;
  const html = quotation.trackingToken ? injectDocumentOpenPixel(bodyHtml, "QUOTATION", quotation.trackingToken) : bodyHtml;

  const result = await sendOutreachEmail(membership.organizationId, { to: recipientEmail, subject: `Quotation: ${quotation.title}`, html, text: bodyText });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.quotation.update({ where: { id: quotationId }, data: { status: "SENT", sentAt: new Date() } });
  await logActivity({ organizationId: membership.organizationId, type: "SYSTEM_EVENT", description: `${session.user?.name ?? "A team member"} sent quotation "${quotation.title}" to ${recipientEmail}.`, actorUserId: userId, metadata: { quotationId } });

  revalidatePath(`/dashboard/proposal/quotations/${quotationId}`);
  return { ok: true };
}

export async function deleteQuotation(quotationId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveQuotationInOrg(userId, quotationId);
  if (!resolved) return { ok: false, error: "Quotation not found." };

  await prisma.quotation.delete({ where: { id: quotationId } });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "quotation.deleted", metadata: { quotationId } });
  revalidatePath("/dashboard/proposal/quotations");
  return { ok: true };
}
