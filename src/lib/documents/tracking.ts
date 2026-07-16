import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { getAppBaseUrl } from "@/lib/outreach/tracking";
import type { DocumentEngineKind } from "./blueprint";

export { getAppBaseUrl };

/** New unique tracking token — same generation mechanism as EmailDraft.trackingToken. */
export function generateTrackingToken(): string {
  return randomUUID();
}

export function getDocumentTrackingUrls(kind: DocumentEngineKind, token: string, baseUrl: string = getAppBaseUrl()) {
  const kindSlug = kind.toLowerCase().replace(/_/g, "-");
  return {
    openPixelUrl: `${baseUrl}/api/documents/track/${kindSlug}/${token}/open`,
    downloadUrl: `${baseUrl}/api/documents/track/${kindSlug}/${token}/download`,
  };
}

/** Rewrites an email body to include a real open-tracking pixel for a generated document — same mechanism as src/lib/outreach/tracking.ts's injectTracking. */
export function injectDocumentOpenPixel(html: string, kind: DocumentEngineKind, token: string, baseUrl: string = getAppBaseUrl()): string {
  const { openPixelUrl } = getDocumentTrackingUrls(kind, token, baseUrl);
  return `${html}<img src="${openPixelUrl}" width="1" height="1" alt="" style="display:none" />`;
}

/**
 * Real, self-hosted open/download tracking across all five document kinds
 * — same "genuinely measured, never estimated" philosophy as the Outreach
 * open/click tracking this mirrors. Each Prisma model has its own
 * trackingToken/openCount/downloadCount/firstOpenedAt/firstDownloadedAt
 * fields (no shared tracking table — Prisma has no polymorphic relation),
 * so this is a small switch rather than one generic query.
 */
export async function trackDocumentOpen(kind: DocumentEngineKind, token: string): Promise<void> {
  try {
    switch (kind) {
      case "PROPOSAL": {
        const row = await prisma.proposal.findUnique({ where: { trackingToken: token }, select: { id: true, firstOpenedAt: true } });
        if (row) await prisma.proposal.update({ where: { id: row.id }, data: { openCount: { increment: 1 }, firstOpenedAt: row.firstOpenedAt ?? new Date() } });
        break;
      }
      case "QUOTATION": {
        const row = await prisma.quotation.findUnique({ where: { trackingToken: token }, select: { id: true, firstOpenedAt: true } });
        if (row) await prisma.quotation.update({ where: { id: row.id }, data: { openCount: { increment: 1 }, firstOpenedAt: row.firstOpenedAt ?? new Date() } });
        break;
      }
      case "CONTRACT": {
        const row = await prisma.contract.findUnique({ where: { trackingToken: token }, select: { id: true, firstOpenedAt: true } });
        if (row) await prisma.contract.update({ where: { id: row.id }, data: { openCount: { increment: 1 }, firstOpenedAt: row.firstOpenedAt ?? new Date() } });
        break;
      }
      case "INVOICE": {
        const row = await prisma.invoice.findUnique({ where: { trackingToken: token }, select: { id: true, firstOpenedAt: true } });
        if (row) await prisma.invoice.update({ where: { id: row.id }, data: { openCount: { increment: 1 }, firstOpenedAt: row.firstOpenedAt ?? new Date() } });
        break;
      }
      case "BUSINESS_DOCUMENT": {
        const row = await prisma.businessDocument.findUnique({ where: { trackingToken: token }, select: { id: true, firstOpenedAt: true } });
        if (row) await prisma.businessDocument.update({ where: { id: row.id }, data: { openCount: { increment: 1 }, firstOpenedAt: row.firstOpenedAt ?? new Date() } });
        break;
      }
    }
  } catch (error) {
    console.error("[documents/tracking] trackDocumentOpen failed:", error);
  }
}

export async function trackDocumentDownload(kind: DocumentEngineKind, token: string): Promise<void> {
  try {
    switch (kind) {
      case "PROPOSAL": {
        const row = await prisma.proposal.findUnique({ where: { trackingToken: token }, select: { id: true, firstDownloadedAt: true } });
        if (row) await prisma.proposal.update({ where: { id: row.id }, data: { downloadCount: { increment: 1 }, firstDownloadedAt: row.firstDownloadedAt ?? new Date() } });
        break;
      }
      case "QUOTATION": {
        const row = await prisma.quotation.findUnique({ where: { trackingToken: token }, select: { id: true, firstDownloadedAt: true } });
        if (row) await prisma.quotation.update({ where: { id: row.id }, data: { downloadCount: { increment: 1 }, firstDownloadedAt: row.firstDownloadedAt ?? new Date() } });
        break;
      }
      case "CONTRACT": {
        const row = await prisma.contract.findUnique({ where: { trackingToken: token }, select: { id: true, firstDownloadedAt: true } });
        if (row) await prisma.contract.update({ where: { id: row.id }, data: { downloadCount: { increment: 1 }, firstDownloadedAt: row.firstDownloadedAt ?? new Date() } });
        break;
      }
      case "INVOICE": {
        const row = await prisma.invoice.findUnique({ where: { trackingToken: token }, select: { id: true, firstDownloadedAt: true } });
        if (row) await prisma.invoice.update({ where: { id: row.id }, data: { downloadCount: { increment: 1 }, firstDownloadedAt: row.firstDownloadedAt ?? new Date() } });
        break;
      }
      case "BUSINESS_DOCUMENT": {
        const row = await prisma.businessDocument.findUnique({ where: { trackingToken: token }, select: { id: true, firstDownloadedAt: true } });
        if (row) await prisma.businessDocument.update({ where: { id: row.id }, data: { downloadCount: { increment: 1 }, firstDownloadedAt: row.firstDownloadedAt ?? new Date() } });
        break;
      }
    }
  } catch (error) {
    console.error("[documents/tracking] trackDocumentDownload failed:", error);
  }
}

/** Resolves a document's {organizationId, title} by kind+id — used by the export route to build the blueprint's filename and auth-check the org. Extended per document type as each backend module is built. */
export async function resolveDocumentOrg(kind: DocumentEngineKind, id: string): Promise<{ organizationId: string } | null> {
  switch (kind) {
    case "PROPOSAL":
      return prisma.proposal.findUnique({ where: { id }, select: { organizationId: true } });
    case "QUOTATION":
      return prisma.quotation.findUnique({ where: { id }, select: { organizationId: true } });
    case "CONTRACT":
      return prisma.contract.findUnique({ where: { id }, select: { organizationId: true } });
    case "INVOICE":
      return prisma.invoice.findUnique({ where: { id }, select: { organizationId: true } });
    case "BUSINESS_DOCUMENT":
      return prisma.businessDocument.findUnique({ where: { id }, select: { organizationId: true } });
    default:
      return null;
  }
}
