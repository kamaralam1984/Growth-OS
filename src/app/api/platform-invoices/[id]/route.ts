import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readPlatformInvoiceFile } from "@/lib/storage/platform-invoices";
import { renderPlatformInvoicePdf } from "@/lib/billing/invoices";

/**
 * Auth-gated platform-invoice PDF download — mirrors
 * src/app/api/documents/[id]/route.ts's exact auth-gated-streaming pattern.
 * Two independent gates: an internal employee with an ACTIVE membership in
 * the invoice's organization, OR a platform operator (User.isPlatformOwner)
 * viewing any organization's invoice (the same cross-tenant access the
 * Admin Billing Dashboard already has).
 *
 * If a PDF was already generated and stored (pdfStorageKey set), it's
 * streamed straight from disk; otherwise it's rendered on demand via
 * renderPlatformInvoicePdf (src/lib/billing/invoices.ts, owned by a
 * parallel task) — never fabricated, always a real render of the invoice's
 * real line items.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const invoice = await prisma.platformInvoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let authorized = false;

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId: invoice.organizationId } },
  });
  authorized = !!membership && membership.status === "ACTIVE";

  if (!authorized) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { isPlatformOwner: true } });
    authorized = !!user?.isPlatformOwner;
  }

  if (!authorized) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const buffer = invoice.pdfStorageKey ? await readPlatformInvoiceFile(invoice.pdfStorageKey) : await renderPlatformInvoicePdf(invoice.id);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoiceNumber.replace(/"/g, "")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[api/platform-invoices] failed to produce PDF:", error);
    return NextResponse.json({ error: "PDF unavailable" }, { status: 404 });
  }
}
