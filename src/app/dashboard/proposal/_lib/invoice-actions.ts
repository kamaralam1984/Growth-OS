"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { logAudit } from "@/lib/audit";
import { notifyOrganizationOwners } from "@/lib/notifications";
import { sendOutreachEmail } from "@/lib/outreach/email-provider";
import { evaluateAutomationRules } from "@/lib/automation-engine";
import { fireWorkflowTrigger } from "@/lib/workflows/triggers";
import { generateTrackingToken, injectDocumentOpenPixel, createDocumentVersion } from "@/lib/documents";
import { createInvoiceSchema, invoiceStatusSchema, type CreateInvoiceInput, type InvoiceStatusInput } from "@/lib/validations/documents";
import { checkApprovalGate } from "@/lib/approval-engine";
import { scheduleBoardReview } from "@/lib/ai/review-orchestrator";
import { storeAgentMemory } from "@/lib/ai/agent-runtime";
import type { InvoiceStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" }, include: { organization: true } });
}

async function resolveInvoiceInOrg(userId: string, invoiceId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return null;
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { lineItems: true } });
  if (!invoice || invoice.organizationId !== membership.organizationId) return null;
  return { membership, invoice };
}

async function nextInvoiceNumber(organizationId: string, type: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = type === "CREDIT_NOTE" ? "CN" : type === "DEBIT_NOTE" ? "DN" : type === "PROFORMA" ? "PI" : "INV";
  const count = await prisma.invoice.count({ where: { organizationId, createdAt: { gte: new Date(`${year}-01-01`) } } });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Fires INVOICE_OVERDUE whenever an overdue invoice is touched by a write —
 * same documented "no cron in this app, so 'overdue' can only be observed on
 * write" limitation as CRM Task's TASK_OVERDUE (see
 * src/app/dashboard/crm/_lib/task-actions.ts). Exported so the Scheduler
 * Service's invoiceDueReminderJob (src/lib/scheduler/registry.ts) can call
 * the exact same transition on a schedule instead of only on write, closing
 * the same real-time gap overdueTaskDetectionJob closes for CRM tasks.
 */
export async function fireOverdueIfApplicable(organizationId: string, invoice: { id: string; title?: string; invoiceNumber: string; dueDate: Date | null; status: InvoiceStatus }) {
  if (!invoice.dueDate || invoice.dueDate >= new Date()) return;
  if (invoice.status === "PAID" || invoice.status === "CANCELLED" || invoice.status === "VOID") return;
  await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "OVERDUE" } });
  await evaluateAutomationRules(organizationId, "INVOICE_OVERDUE", { subject: invoice.invoiceNumber, invoiceId: invoice.id });
  await fireWorkflowTrigger(organizationId, "INVOICE_OVERDUE", { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, dueDate: invoice.dueDate });
}

function computeLineItemAmount(quantity: number, rate: number): number {
  return quantity * rate;
}

/**
 * Real memory write for the org's Finance agent whenever a real invoice is
 * fully paid — genuine client-context ("this client pays, and pays like
 * this") a Finance seat can recall in future proposal-review/collections
 * conversations. `sourceKind` is deliberately left unset: MemorySourceKind
 * has no INVOICE variant (PROPOSAL covers the proposal document itself, not
 * the invoice raised against it), and forcing PROPOSAL onto an invoice would
 * misattribute the source — leaving it unset is the honest choice here.
 * Fire-and-forget, same discipline as fireWorkflowTrigger/notifyOrganizationOwners
 * elsewhere in this file: a memory-store failure must never break a real
 * payment being recorded.
 */
async function storeInvoicePaidMemory(organizationId: string, invoice: { id: string; invoiceNumber: string; grandTotal: number }): Promise<void> {
  try {
    const financeAgent = await prisma.aIAgentInstance.findFirst({ where: { organizationId, type: "FINANCE" } });
    if (!financeAgent) return;
    await storeAgentMemory(
      financeAgent.id,
      organizationId,
      "CLIENT_CONTEXT",
      `Invoice ${invoice.invoiceNumber} (${invoice.grandTotal}) was paid in full.`,
    );
  } catch (memoryError) {
    console.error("[invoice] storeAgentMemory for INVOICE_PAID failed:", memoryError);
  }
}

export interface CreateInvoiceResult extends ActionResult {
  invoiceId?: string;
}

export async function createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsed = createInvoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the invoice details." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };
  const organizationId = membership.organizationId;

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

  try {
    const lineItemsWithAmount = parsed.data.lineItems.map((li, order) => ({
      description: li.description,
      quantity: li.quantity,
      rate: li.rate,
      amount: computeLineItemAmount(li.quantity, li.rate),
      order,
    }));
    const subtotal = lineItemsWithAmount.reduce((sum, li) => sum + li.amount, 0);
    const discountAmount = parsed.data.discountPercent ? subtotal * (parsed.data.discountPercent / 100) : 0;
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = parsed.data.taxPercent ? afterDiscount * (parsed.data.taxPercent / 100) : 0;
    const grandTotal = afterDiscount + taxAmount;

    const invoiceNumber = await nextInvoiceNumber(organizationId, parsed.data.type);

    const invoice = await prisma.invoice.create({
      data: {
        organizationId,
        companyId: parsed.data.companyId || null,
        dealId: parsed.data.dealId || null,
        clientId: parsed.data.clientId || null,
        invoiceNumber,
        type: parsed.data.type,
        currency: parsed.data.currency || membership.organization.currency,
        dueDate: parsed.data.dueDate ?? null,
        subtotal,
        discountPercent: parsed.data.discountPercent ?? null,
        discountAmount,
        taxPercent: parsed.data.taxPercent ?? null,
        taxAmount,
        grandTotal,
        isRecurring: parsed.data.isRecurring,
        recurrenceRule: parsed.data.isRecurring ? (parsed.data.recurrenceRule ?? null) : null,
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
      docKind: "INVOICE",
      docId: invoice.id,
      title: invoice.invoiceNumber,
      content: JSON.stringify({ lineItems: lineItemsWithAmount, grandTotal }),
      changedByUserId: userId,
      changeNote: "Initial invoice",
    });

    await logActivity({
      organizationId,
      type: "SYSTEM_EVENT",
      description: `${session.user?.name ?? "A team member"} created invoice ${invoice.invoiceNumber}.`,
      actorUserId: userId,
      metadata: { invoiceId: invoice.id, dealId: parsed.data.dealId || undefined },
    });
    await logAudit({ userId, organizationId, action: "invoice.created", metadata: { invoiceId: invoice.id } });

    try {
      await scheduleBoardReview({ organizationId, docKind: "INVOICE", docId: invoice.id, requestedByUserId: userId });
    } catch (scheduleError) {
      console.error("[invoice] auto-schedule board review failed:", scheduleError);
    }

    revalidatePath("/dashboard/proposal/invoices");
    revalidatePath("/dashboard/proposal");
    if (parsed.data.dealId) revalidatePath(`/dashboard/crm/deals/${parsed.data.dealId}`);
    return { ok: true, invoiceId: invoice.id };
  } catch (error) {
    console.error("[invoice] createInvoice failed:", error);
    return { ok: false, error: "Something went wrong creating the invoice. Please try again." };
  }
}

export async function updateInvoiceStatus(invoiceId: string, status: InvoiceStatusInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const parsedStatus = invoiceStatusSchema.safeParse(status);
  if (!parsedStatus.success) return { ok: false, error: "Invalid status." };

  const resolved = await resolveInvoiceInOrg(userId, invoiceId);
  if (!resolved) return { ok: false, error: "Invoice not found." };
  const { invoice, membership } = resolved;

  const data: { status: InvoiceStatus; paidAt?: Date; amountPaid?: number } = { status: parsedStatus.data };
  if (parsedStatus.data === "PAID") {
    data.paidAt = new Date();
    data.amountPaid = invoice.grandTotal;
  }

  await prisma.invoice.update({ where: { id: invoiceId }, data });
  await logAudit({ userId, organizationId: membership.organizationId, action: "invoice.status_updated", metadata: { invoiceId, status: parsedStatus.data } });

  if (parsedStatus.data === "PAID") {
    await notifyOrganizationOwners({ organizationId: membership.organizationId, type: "INVOICE_PAID", title: "Invoice paid", message: `Invoice ${invoice.invoiceNumber} was marked paid.` });
    await evaluateAutomationRules(membership.organizationId, "INVOICE_PAID", { subject: invoice.invoiceNumber, invoiceId });
    await fireWorkflowTrigger(membership.organizationId, "INVOICE_PAID", { invoiceId, invoiceNumber: invoice.invoiceNumber, grandTotal: invoice.grandTotal, dealId: invoice.dealId, companyId: invoice.companyId });
    await storeInvoicePaidMemory(membership.organizationId, invoice);
  } else {
    await fireOverdueIfApplicable(membership.organizationId, invoice);
  }

  revalidatePath(`/dashboard/proposal/invoices/${invoiceId}`);
  revalidatePath("/dashboard/proposal/invoices");
  return { ok: true };
}

/** Marks an invoice paid, optionally for a partial amount — full payment sets status PAID via updateInvoiceStatus's logic; a partial amount just records amountPaid and leaves status as-is. */
export async function recordInvoicePayment(invoiceId: string, amount: number): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (!(amount > 0)) return { ok: false, error: "Enter a payment amount greater than 0." };

  const resolved = await resolveInvoiceInOrg(userId, invoiceId);
  if (!resolved) return { ok: false, error: "Invoice not found." };
  const { invoice, membership } = resolved;

  const newAmountPaid = invoice.amountPaid + amount;
  const isFullyPaid = newAmountPaid >= invoice.grandTotal;

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { amountPaid: newAmountPaid, ...(isFullyPaid ? { status: "PAID", paidAt: new Date() } : {}) },
  });
  await logActivity({ organizationId: membership.organizationId, type: "SYSTEM_EVENT", description: `${session.user?.name ?? "A team member"} recorded a payment of ${amount} on invoice ${invoice.invoiceNumber}.`, actorUserId: userId, metadata: { invoiceId } });

  if (isFullyPaid) {
    await notifyOrganizationOwners({ organizationId: membership.organizationId, type: "INVOICE_PAID", title: "Invoice paid", message: `Invoice ${invoice.invoiceNumber} is now fully paid.` });
    await evaluateAutomationRules(membership.organizationId, "INVOICE_PAID", { subject: invoice.invoiceNumber, invoiceId });
    await fireWorkflowTrigger(membership.organizationId, "INVOICE_PAID", { invoiceId, invoiceNumber: invoice.invoiceNumber, grandTotal: invoice.grandTotal, dealId: invoice.dealId, companyId: invoice.companyId });
    await storeInvoicePaidMemory(membership.organizationId, invoice);
  }

  revalidatePath(`/dashboard/proposal/invoices/${invoiceId}`);
  return { ok: true };
}

export async function sendInvoiceToClient(invoiceId: string, recipientEmail: string, message?: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveInvoiceInOrg(userId, invoiceId);
  if (!resolved) return { ok: false, error: "Invoice not found." };
  const { invoice, membership } = resolved;

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return { ok: false, error: "Enter a valid recipient email address." };
  }

  const gate = await checkApprovalGate(membership.organizationId, "INVOICE", invoiceId);
  if (!gate.allowed) return { ok: false, error: gate.reason };

  const bodyText = [message?.trim(), `Please find invoice ${invoice.invoiceNumber} attached/linked.`].filter(Boolean).join("\n\n");
  const bodyHtml = `<p>${(message?.trim() ?? "").replace(/\n/g, "<br/>")}</p><p>Please find invoice "<strong>${invoice.invoiceNumber}</strong>".</p>`;
  const html = invoice.trackingToken ? injectDocumentOpenPixel(bodyHtml, "INVOICE", invoice.trackingToken) : bodyHtml;

  const result = await sendOutreachEmail(membership.organizationId, { to: recipientEmail, subject: `Invoice ${invoice.invoiceNumber}`, html, text: bodyText });
  if (!result.ok) return { ok: false, error: result.error };

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: invoice.status === "DRAFT" ? "SENT" : invoice.status, sentAt: new Date() } });
  await logActivity({ organizationId: membership.organizationId, type: "SYSTEM_EVENT", description: `${session.user?.name ?? "A team member"} sent invoice ${invoice.invoiceNumber} to ${recipientEmail}.`, actorUserId: userId, metadata: { invoiceId } });

  revalidatePath(`/dashboard/proposal/invoices/${invoiceId}`);
  return { ok: true };
}

export async function deleteInvoice(invoiceId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const resolved = await resolveInvoiceInOrg(userId, invoiceId);
  if (!resolved) return { ok: false, error: "Invoice not found." };

  await prisma.invoice.delete({ where: { id: invoiceId } });
  await logAudit({ userId, organizationId: resolved.membership.organizationId, action: "invoice.deleted", metadata: { invoiceId } });
  revalidatePath("/dashboard/proposal/invoices");
  return { ok: true };
}
