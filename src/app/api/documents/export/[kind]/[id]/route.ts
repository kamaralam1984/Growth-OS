import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { renderDocumentToPdf, renderDocumentToDocx, trackDocumentDownload } from "@/lib/documents";
import { parseDocumentKindSlug, resolveDocumentById } from "@/app/dashboard/proposal/_lib/document-resolver";

// Any unrecognized format falls back to PDF, mirroring the previous
// ternary equality-check behavior exactly — never a 400 here.
const formatSchema = z.enum(["pdf", "docx"]).catch("pdf");

/** Auth-gated PDF/DOCX export for any generated document (Proposal/Quotation/Contract/Invoice/BusinessDocument), reusing the same DocumentBlueprint + render pipeline the public download route uses. */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!membership) return NextResponse.json({ error: "No organization" }, { status: 404 });

  const { kind: kindSlug, id } = await params;
  const kind = parseDocumentKindSlug(kindSlug);
  if (!kind) return NextResponse.json({ error: "Unknown document type" }, { status: 404 });

  const resolved = await resolveDocumentById(kind, id);
  if (!resolved || resolved.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const format = formatSchema.parse(url.searchParams.get("format"));

  if (resolved.trackingToken) await trackDocumentDownload(kind, resolved.trackingToken);

  if (format === "docx") {
    const buffer = await renderDocumentToDocx(resolved.blueprint);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${resolved.filenameBase}.docx"`,
      },
    });
  }

  const buffer = await renderDocumentToPdf(resolved.blueprint);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${resolved.filenameBase}.pdf"`,
    },
  });
}
