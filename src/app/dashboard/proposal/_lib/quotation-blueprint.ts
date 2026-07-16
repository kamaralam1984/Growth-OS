import type { DocumentBlueprint } from "@/lib/documents";

export interface QuotationBlueprintInput {
  title: string;
  quotationNumber: string;
  organizationName: string;
  logoUrl?: string | null;
  gstNumber?: string | null;
  registrationNumber?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  currency?: string | null;
  validUntil?: Date | null;
  notes?: string | null;
  terms?: string | null;
  lineItems: Array<{ description: string; quantity: number; rate: number; discountPercent: number | null; amount: number }>;
  subtotal: number;
  discountAmount: number;
  discountPercent: number | null;
  taxAmount: number;
  taxPercent: number | null;
  grandTotal: number;
  createdAt: Date;
}

function formatCurrencyValue(value: number, currency?: string | null): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency ?? ""} ${value.toLocaleString()}`.trim();
  }
}

export function buildQuotationBlueprint(input: QuotationBlueprintInput): DocumentBlueprint {
  const sections = [];
  if (input.notes) sections.push({ heading: "Notes", body: input.notes });
  if (input.terms) sections.push({ heading: "Terms & Conditions", body: input.terms });
  if (input.validUntil) sections.push({ heading: "Validity", body: `This quotation is valid until ${input.validUntil.toLocaleDateString()}.` });

  return {
    docKind: "QUOTATION",
    title: input.title,
    subtitle: "Quotation",
    documentNumber: input.quotationNumber,
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
    ],
    footerText: input.organizationName,
    generatedAt: input.createdAt,
  };
}
