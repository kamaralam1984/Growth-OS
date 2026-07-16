import { prisma } from "@/lib/prisma";
import { computeTax } from "./tax-rates";
import { getGateway } from "./gateway/registry";
import { renderDocumentToPdf } from "@/lib/documents";
import { savePlatformInvoiceFile } from "@/lib/storage/platform-invoices";
import type { DocumentBlueprint } from "@/lib/documents";
import type { PlatformInvoice, PlatformInvoiceType } from "@/generated/prisma/client";

/**
 * Platform invoice generation, PDF rendering, credit notes, and refunds —
 * operates on the Phase 18 PlatformInvoice/PlatformInvoiceItem/PlatformPayment
 * models (KVL GrowthOS billing a tenant organization for platform access),
 * a deliberately separate concept from the pre-existing client-facing
 * Invoice model (an organization billing ITS OWN clients, see
 * src/app/dashboard/proposal/_lib/invoice-actions.ts) — never touched here.
 */

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unitAmountCents: number;
}

const INVOICE_NUMBER_PREFIX: Record<PlatformInvoiceType, string> = {
  TAX: "INV",
  PROFORMA: "PI",
  CREDIT_NOTE: "CN",
  DEBIT_NOTE: "DN",
  RECEIPT: "RC",
  RECURRING: "INV",
};

const INVOICE_TYPE_LABEL: Record<PlatformInvoiceType, string> = {
  TAX: "Invoice",
  PROFORMA: "Proforma Invoice",
  CREDIT_NOTE: "Credit Note",
  DEBIT_NOTE: "Debit Note",
  RECEIPT: "Receipt",
  RECURRING: "Recurring Invoice",
};

/**
 * Real, sequential invoice numbering — `{PREFIX}-{year}-{4-digit-seq}`,
 * scoped per organization (each tenant is its own "buyer" on this
 * platform's own books) and mirroring the exact counting convention
 * src/app/dashboard/proposal/_lib/invoice-actions.ts's nextInvoiceNumber
 * already uses for the separate client-facing Invoice model: count this
 * org's PlatformInvoice rows created since Jan 1 of the current year and
 * take the next number. A small, accepted race window exists under truly
 * concurrent invoice creation for the same org (same tradeoff the existing
 * client-facing invoice numbering already makes) — acceptable at this
 * app's real write volume; `invoiceNumber` remains @unique as a hard
 * backstop against a genuine collision.
 */
async function nextInvoiceNumber(organizationId: string, type: PlatformInvoiceType): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = INVOICE_NUMBER_PREFIX[type];
  const count = await prisma.platformInvoice.count({
    where: { organizationId, createdAt: { gte: new Date(`${year}-01-01`) } },
  });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

/** Creates a real PlatformInvoice + PlatformInvoiceItem rows — computes subtotal from the given line items and real tax via computeTax(), using the BillingAccount's real TaxProfile (preferred) or BillingAddress country and whether a tax id is on file. Status starts OPEN (not DRAFT) since every real call site here generates an invoice for an already-decided real charge (a checkout, a manual payment, a credit note) rather than a not-yet-final draft. */
export async function generatePlatformInvoice(
  billingAccountId: string,
  items: InvoiceLineInput[],
  type: PlatformInvoiceType,
  currency: string,
): Promise<PlatformInvoice> {
  const billingAccount = await prisma.billingAccount.findUnique({
    where: { id: billingAccountId },
    include: { taxProfile: true, billingAddress: true },
  });
  if (!billingAccount) throw new Error(`BillingAccount ${billingAccountId} not found.`);

  const subtotalCents = items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitAmountCents), 0);
  const country = billingAccount.taxProfile?.country ?? billingAccount.billingAddress?.country ?? null;
  const hasBuyerTaxId = Boolean(billingAccount.taxProfile?.taxId || billingAccount.billingAddress?.taxId);
  const tax = computeTax(subtotalCents, country, hasBuyerTaxId);

  const invoiceNumber = await nextInvoiceNumber(billingAccount.organizationId, type);

  return prisma.platformInvoice.create({
    data: {
      organizationId: billingAccount.organizationId,
      billingAccountId,
      invoiceNumber,
      type,
      status: "OPEN",
      currency,
      subtotalCents: tax.taxableCents,
      taxCents: tax.taxCents,
      totalCents: tax.totalCents,
      items: {
        create: items.map((item, index) => ({
          description: item.description,
          quantity: item.quantity,
          unitAmountCents: item.unitAmountCents,
          amountCents: Math.round(item.quantity * item.unitAmountCents),
          order: index,
        })),
      },
    },
  });
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
  } catch {
    return `${currency} ${(cents / 100).toFixed(2)}`;
  }
}

/** Renders a real PDF via pdfkit (through the shared renderDocumentToPdf/DocumentBlueprint pipeline — see src/lib/documents/pdf-renderer.ts) with organization name/address, line items, tax breakdown, total, and payment status. Saves it via src/lib/storage/platform-invoices.ts and persists the resulting storageKey on PlatformInvoice.pdfStorageKey. */
export async function renderPlatformInvoicePdf(invoiceId: string): Promise<Buffer> {
  const invoice = await prisma.platformInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      items: { orderBy: { order: "asc" } },
      organization: true,
      billingAccount: { include: { billingAddress: true } },
    },
  });
  if (!invoice) throw new Error(`PlatformInvoice ${invoiceId} not found.`);

  const address = invoice.billingAccount.billingAddress;
  const addressLine = [address?.line1, address?.line2, address?.city, address?.state, address?.postalCode, address?.country].filter(Boolean).join(", ");

  const blueprint: DocumentBlueprint = {
    docKind: "INVOICE",
    title: INVOICE_TYPE_LABEL[invoice.type],
    subtitle: invoice.invoiceNumber,
    documentNumber: invoice.invoiceNumber,
    brand: { organizationName: "KVL GrowthOS" },
    preparedFor: {
      name: address?.legalName ?? invoice.organization.name,
      company: invoice.organization.name,
      address: addressLine || undefined,
    },
    tableOfContents: false,
    sections: [
      {
        heading: "Details",
        body: [
          `Issued: ${invoice.issuedAt.toLocaleDateString()}`,
          invoice.dueDate ? `Due: ${invoice.dueDate.toLocaleDateString()}` : null,
          `Status: ${invoice.status}`,
        ]
          .filter(Boolean)
          .join("  ·  "),
      },
    ],
    pricingTable: {
      headers: ["Description", "Qty", "Unit Price", "Amount"],
      rows: invoice.items.map((item) => [item.description, item.quantity, formatMoney(item.unitAmountCents, invoice.currency), formatMoney(item.amountCents, invoice.currency)]),
      alignRightColumns: [1, 2, 3],
    },
    totalsSummary: [
      { label: "Subtotal", value: formatMoney(invoice.subtotalCents, invoice.currency) },
      ...(invoice.discountCents > 0 ? [{ label: "Discount", value: `-${formatMoney(invoice.discountCents, invoice.currency)}` }] : []),
      ...(invoice.taxCents !== 0 ? [{ label: "Tax", value: formatMoney(invoice.taxCents, invoice.currency) }] : []),
      { label: "Total", value: formatMoney(invoice.totalCents, invoice.currency), emphasis: true },
      ...(invoice.amountPaidCents > 0
        ? [
            { label: "Amount Paid", value: formatMoney(invoice.amountPaidCents, invoice.currency) },
            { label: "Balance Due", value: formatMoney(invoice.totalCents - invoice.amountPaidCents, invoice.currency), emphasis: true },
          ]
        : []),
    ],
    footerText: "KVL GrowthOS",
    generatedAt: invoice.issuedAt,
  };

  const buffer = await renderDocumentToPdf(blueprint);
  const storageKey = await savePlatformInvoiceFile(invoice.organizationId, invoice.id, `${invoice.invoiceNumber}.pdf`, buffer);
  await prisma.platformInvoice.update({ where: { id: invoice.id }, data: { pdfStorageKey: storageKey } });
  return buffer;
}

/** Real negative-line-item invoice referencing the original by invoice number in `notes` (PlatformInvoice has no dedicated "original invoice" relation) — type CREDIT_NOTE, immediately marked PAID (a credit note is a completed accounting document the moment it's issued, not something awaiting its own payment). */
export async function issueCreditNote(originalInvoiceId: string, amountCents: number, reason: string): Promise<PlatformInvoice> {
  const original = await prisma.platformInvoice.findUnique({ where: { id: originalInvoiceId } });
  if (!original) throw new Error(`PlatformInvoice ${originalInvoiceId} not found.`);

  const creditNote = await generatePlatformInvoice(
    original.billingAccountId,
    [{ description: `Credit note for ${original.invoiceNumber} — ${reason}`, quantity: 1, unitAmountCents: -Math.abs(amountCents) }],
    "CREDIT_NOTE",
    original.currency,
  );

  return prisma.platformInvoice.update({
    where: { id: creditNote.id },
    data: { status: "PAID", paidAt: new Date(), notes: `Credit note against invoice ${original.invoiceNumber}: ${reason}` },
  });
}

/** Looks up the real PlatformPayment, calls the real gateway's createRefund, and updates the payment's refundedAmountCents/status only on real gateway success. Issues a real credit note against the linked invoice (if any) for the refunded amount. Surfaces a gateway's real thrown error honestly (e.g. LemonSqueezy's "refunds aren't supported via API") rather than a generic failure message. */
export async function refundPlatformPayment(paymentId: string, amountCents?: number): Promise<{ ok: boolean; error?: string }> {
  const payment = await prisma.platformPayment.findUnique({ where: { id: paymentId } });
  if (!payment) return { ok: false, error: `PlatformPayment ${paymentId} not found.` };
  if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") {
    return { ok: false, error: `Cannot refund a payment with status ${payment.status}.` };
  }

  const gatewayPaymentId = payment.gatewayChargeId ?? payment.gatewayPaymentId;
  if (!gatewayPaymentId) return { ok: false, error: "This payment has no gateway charge/payment id on file to refund." };

  const gateway = getGateway(payment.provider);
  if (!gateway.isConfigured()) {
    return { ok: false, error: `${gateway.name} isn't configured — set ${gateway.requiredEnvVars.join(", ")}.` };
  }

  try {
    await gateway.createRefund({ gatewayPaymentId, amountCents });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const refundAmount = amountCents ?? payment.amountCents - payment.refundedAmountCents;
  const newRefundedTotal = payment.refundedAmountCents + refundAmount;
  const fullyRefunded = newRefundedTotal >= payment.amountCents;

  await prisma.platformPayment.update({
    where: { id: paymentId },
    data: { refundedAmountCents: newRefundedTotal, status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" },
  });

  if (payment.invoiceId) {
    await issueCreditNote(payment.invoiceId, refundAmount, "Refund issued via platform payment gateway.");
  }

  return { ok: true };
}
