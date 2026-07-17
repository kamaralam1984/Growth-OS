import type { DocumentBlueprint } from "@/lib/documents";

export interface InvoiceBlueprintInput {
  invoiceNumber: string;
  type: string;
  organizationName: string;
  logoUrl?: string | null;
  footerText?: string | null;
  gstNumber?: string | null;
  registrationNumber?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  currency?: string | null;
  issueDate: Date;
  dueDate?: Date | null;
  notes?: string | null;
  terms?: string | null;
  lineItems: Array<{ description: string; quantity: number; rate: number; amount: number }>;
  subtotal: number;
  discountAmount: number;
  discountPercent: number | null;
  taxAmount: number;
  taxPercent: number | null;
  grandTotal: number;
  amountPaid: number;
}

function formatCurrencyValue(value: number, currency?: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency ?? ""} ${value.toLocaleString()}`.trim();
  }
}

const TYPE_LABEL: Record<string, string> = {
  STANDARD: "Invoice",
  GST: "GST Invoice",
  RECURRING: "Recurring Invoice",
  PROFORMA: "Proforma Invoice",
  CREDIT_NOTE: "Credit Note",
  DEBIT_NOTE: "Debit Note",
};

export function buildInvoiceBlueprint(input: InvoiceBlueprintInput): DocumentBlueprint {
  const balanceDue = input.grandTotal - input.amountPaid;
  const sections = [];
  const dates = [`Issue date: ${input.issueDate.toLocaleDateString()}`, input.dueDate ? `Due date: ${input.dueDate.toLocaleDateString()}` : null].filter(Boolean).join("  ·  ");
  sections.push({ heading: "Details", body: dates });
  if (input.notes) sections.push({ heading: "Notes", body: input.notes });
  if (input.terms) sections.push({ heading: "Terms", body: input.terms });

  return {
    docKind: "INVOICE",
    title: TYPE_LABEL[input.type] ?? "Invoice",
    subtitle: input.invoiceNumber,
    documentNumber: input.invoiceNumber,
    brand: { organizationName: input.organizationName, logoUrl: input.logoUrl, gstNumber: input.gstNumber, registrationNumber: input.registrationNumber },
    preparedFor: input.contactName || input.companyName ? { name: input.contactName ?? input.companyName ?? "Client", company: input.companyName } : undefined,
    tableOfContents: false,
    sections,
    pricingTable: {
      headers: ["Description", "Qty", "Rate", "Amount"],
      rows: input.lineItems.map((li) => [li.description, li.quantity, formatCurrencyValue(li.rate, input.currency), formatCurrencyValue(li.amount, input.currency)]),
      alignRightColumns: [1, 2, 3],
    },
    totalsSummary: [
      { label: "Subtotal", value: formatCurrencyValue(input.subtotal, input.currency) },
      ...(input.discountAmount > 0 ? [{ label: `Discount${input.discountPercent ? ` (${input.discountPercent}%)` : ""}`, value: `-${formatCurrencyValue(input.discountAmount, input.currency)}` }] : []),
      ...(input.taxAmount > 0 ? [{ label: `Tax${input.taxPercent ? ` (${input.taxPercent}%)` : ""}`, value: formatCurrencyValue(input.taxAmount, input.currency) }] : []),
      { label: "Grand Total", value: formatCurrencyValue(input.grandTotal, input.currency), emphasis: true },
      ...(input.amountPaid > 0 ? [{ label: "Amount Paid", value: formatCurrencyValue(input.amountPaid, input.currency) }, { label: "Balance Due", value: formatCurrencyValue(balanceDue, input.currency), emphasis: true }] : []),
    ],
    footerText: input.footerText ?? input.organizationName,
    generatedAt: input.issueDate,
  };
}
