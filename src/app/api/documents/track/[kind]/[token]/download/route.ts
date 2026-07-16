import { NextResponse } from "next/server";

import { renderDocumentToPdf, trackDocumentDownload } from "@/lib/documents";
import { parseDocumentKindSlug, resolveDocumentByTrackingToken } from "@/app/dashboard/proposal/_lib/document-resolver";

/**
 * Public, unauthenticated document download — hit when a real recipient
 * clicks the download link in a sent email. The unguessable trackingToken
 * IS the access control (same model as the open-tracking pixel and the
 * /sign/[token] signing link); there is no session here by design. Always
 * defaults to PDF for maximum compatibility with an external recipient.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind: kindSlug, token } = await params;
  const kind = parseDocumentKindSlug(kindSlug);
  if (!kind) return NextResponse.json({ error: "Unknown document type" }, { status: 404 });

  const resolved = await resolveDocumentByTrackingToken(kind, token);
  if (!resolved) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await trackDocumentDownload(kind, token);

  const buffer = await renderDocumentToPdf(resolved.blueprint);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${resolved.filenameBase}.pdf"`,
    },
  });
}
