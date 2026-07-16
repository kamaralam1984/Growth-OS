import { prisma } from "@/lib/prisma";
import type { DocumentBlueprint, DocumentEngineKind } from "@/lib/documents";
import type { ProposalSections } from "@/lib/ai/document-engine";
import { buildProposalBlueprint } from "./proposal-blueprint";
import { buildQuotationBlueprint } from "./quotation-blueprint";
import { buildContractBlueprint } from "./contract-blueprint";
import { buildInvoiceBlueprint } from "./invoice-blueprint";
import { buildBusinessDocumentBlueprint, SIGNATURE_KINDS } from "./business-document-blueprint";

export interface ResolvedDocument {
  id: string;
  organizationId: string;
  trackingToken: string | null;
  blueprint: DocumentBlueprint;
  filenameBase: string;
}

async function resolveBrand(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, logo: true, gstNumber: true, registrationNumber: true, currency: true } });
  return {
    organizationName: org?.name ?? "Organization",
    logoUrl: org?.logo ?? null,
    gstNumber: org?.gstNumber ?? null,
    registrationNumber: org?.registrationNumber ?? null,
    currency: org?.currency ?? null,
  };
}

function slugify(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "document";
}

/** Builds the render-ready blueprint for a document given its Prisma row id — used by both the auth-gated export route and (indirectly, via resolveDocumentByTrackingToken) the public download route. */
export async function resolveDocumentById(kind: DocumentEngineKind, id: string): Promise<ResolvedDocument | null> {
  switch (kind) {
    case "PROPOSAL": {
      const proposal = await prisma.proposal.findUnique({
        where: { id },
        include: { company: { select: { name: true } }, lead: { select: { name: true } } },
      });
      if (!proposal) return null;
      const brand = await resolveBrand(proposal.organizationId);
      return {
        id: proposal.id,
        organizationId: proposal.organizationId,
        trackingToken: proposal.trackingToken,
        filenameBase: slugify(proposal.title),
        blueprint: buildProposalBlueprint({
          title: proposal.title,
          content: proposal.content,
          sections: proposal.sections as ProposalSections | null,
          value: proposal.value,
          currency: brand.currency,
          documentNumber: `PROP-${proposal.id.slice(-8).toUpperCase()}`,
          organizationName: brand.organizationName,
          logoUrl: brand.logoUrl,
          gstNumber: brand.gstNumber,
          registrationNumber: brand.registrationNumber,
          companyName: proposal.company?.name ?? null,
          contactName: proposal.lead?.name ?? null,
          createdAt: proposal.createdAt,
        }),
      };
    }
    case "QUOTATION": {
      const quotation = await prisma.quotation.findUnique({
        where: { id },
        include: { lineItems: { orderBy: { order: "asc" } }, company: { select: { name: true } }, contact: { select: { firstName: true, lastName: true } } },
      });
      if (!quotation) return null;
      const brand = await resolveBrand(quotation.organizationId);
      return {
        id: quotation.id,
        organizationId: quotation.organizationId,
        trackingToken: quotation.trackingToken,
        filenameBase: slugify(`${quotation.quotationNumber}-${quotation.title}`),
        blueprint: buildQuotationBlueprint({
          title: quotation.title,
          quotationNumber: quotation.quotationNumber,
          organizationName: brand.organizationName,
          logoUrl: brand.logoUrl,
          gstNumber: brand.gstNumber,
          registrationNumber: brand.registrationNumber,
          companyName: quotation.company?.name ?? null,
          contactName: quotation.contact ? `${quotation.contact.firstName} ${quotation.contact.lastName ?? ""}`.trim() : null,
          currency: quotation.currency ?? brand.currency,
          validUntil: quotation.validUntil,
          notes: quotation.notes,
          terms: quotation.terms,
          lineItems: quotation.lineItems,
          subtotal: quotation.subtotal,
          discountAmount: quotation.discountAmount,
          discountPercent: quotation.discountPercent,
          taxAmount: quotation.taxAmount,
          taxPercent: quotation.taxPercent,
          grandTotal: quotation.grandTotal,
          createdAt: quotation.createdAt,
        }),
      };
    }
    case "CONTRACT": {
      const contract = await prisma.contract.findUnique({ where: { id }, include: { client: { select: { name: true } }, company: { select: { name: true } } } });
      if (!contract) return null;
      const brand = await resolveBrand(contract.organizationId);
      const clientName = contract.client?.name ?? contract.company?.name ?? "Client";
      return {
        id: contract.id,
        organizationId: contract.organizationId,
        trackingToken: contract.trackingToken,
        filenameBase: slugify(`${contract.contractNumber}-${contract.title}`),
        blueprint: buildContractBlueprint({
          title: contract.title,
          contractNumber: contract.contractNumber,
          content: contract.content,
          organizationName: brand.organizationName,
          logoUrl: brand.logoUrl,
          gstNumber: brand.gstNumber,
          registrationNumber: brand.registrationNumber,
          clientName,
          value: contract.value,
          currency: brand.currency,
          startDate: contract.startDate,
          endDate: contract.endDate,
          createdAt: contract.createdAt,
        }),
      };
    }
    case "INVOICE": {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { lineItems: { orderBy: { order: "asc" } }, company: { select: { name: true } }, client: { select: { name: true } } },
      });
      if (!invoice) return null;
      const brand = await resolveBrand(invoice.organizationId);
      return {
        id: invoice.id,
        organizationId: invoice.organizationId,
        trackingToken: invoice.trackingToken,
        filenameBase: slugify(invoice.invoiceNumber),
        blueprint: buildInvoiceBlueprint({
          invoiceNumber: invoice.invoiceNumber,
          type: invoice.type,
          organizationName: brand.organizationName,
          logoUrl: brand.logoUrl,
          gstNumber: brand.gstNumber,
          registrationNumber: brand.registrationNumber,
          companyName: invoice.company?.name ?? null,
          contactName: invoice.client?.name ?? null,
          currency: invoice.currency ?? brand.currency,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          notes: invoice.notes,
          terms: invoice.terms,
          lineItems: invoice.lineItems,
          subtotal: invoice.subtotal,
          discountAmount: invoice.discountAmount,
          discountPercent: invoice.discountPercent,
          taxAmount: invoice.taxAmount,
          taxPercent: invoice.taxPercent,
          grandTotal: invoice.grandTotal,
          amountPaid: invoice.amountPaid,
        }),
      };
    }
    case "BUSINESS_DOCUMENT": {
      const document = await prisma.businessDocument.findUnique({ where: { id }, include: { company: { select: { name: true } } } });
      if (!document) return null;
      const brand = await resolveBrand(document.organizationId);
      return {
        id: document.id,
        organizationId: document.organizationId,
        trackingToken: document.trackingToken,
        filenameBase: slugify(document.title),
        blueprint: buildBusinessDocumentBlueprint({
          kind: document.kind,
          title: document.title,
          content: document.content,
          organizationName: brand.organizationName,
          logoUrl: brand.logoUrl,
          gstNumber: brand.gstNumber,
          registrationNumber: brand.registrationNumber,
          companyName: document.company?.name ?? null,
          needsSignature: SIGNATURE_KINDS.has(document.kind),
          createdAt: document.createdAt,
        }),
      };
    }
    default:
      return null;
  }
}

/** Resolves by the public trackingToken (never by id — used only by the unauthenticated download route). */
export async function resolveDocumentByTrackingToken(kind: DocumentEngineKind, token: string): Promise<ResolvedDocument | null> {
  let id: string | null = null;
  switch (kind) {
    case "PROPOSAL":
      id = (await prisma.proposal.findUnique({ where: { trackingToken: token }, select: { id: true } }))?.id ?? null;
      break;
    case "QUOTATION":
      id = (await prisma.quotation.findUnique({ where: { trackingToken: token }, select: { id: true } }))?.id ?? null;
      break;
    case "CONTRACT":
      id = (await prisma.contract.findUnique({ where: { trackingToken: token }, select: { id: true } }))?.id ?? null;
      break;
    case "INVOICE":
      id = (await prisma.invoice.findUnique({ where: { trackingToken: token }, select: { id: true } }))?.id ?? null;
      break;
    case "BUSINESS_DOCUMENT":
      id = (await prisma.businessDocument.findUnique({ where: { trackingToken: token }, select: { id: true } }))?.id ?? null;
      break;
  }
  if (!id) return null;
  return resolveDocumentById(kind, id);
}

const KIND_SLUGS: Record<string, DocumentEngineKind> = {
  proposal: "PROPOSAL",
  quotation: "QUOTATION",
  contract: "CONTRACT",
  invoice: "INVOICE",
  "business-document": "BUSINESS_DOCUMENT",
};

export function parseDocumentKindSlug(slug: string): DocumentEngineKind | null {
  return KIND_SLUGS[slug] ?? null;
}
