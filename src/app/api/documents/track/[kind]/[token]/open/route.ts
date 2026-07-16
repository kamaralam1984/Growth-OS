import { NextResponse } from "next/server";

import { trackDocumentOpen } from "@/lib/documents";
import { parseDocumentKindSlug } from "@/app/dashboard/proposal/_lib/document-resolver";

// A real, standard 1x1 transparent GIF — matches src/app/api/outreach/track/open/[token]/route.ts exactly.
const TRANSPARENT_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

/** Public, unauthenticated open-tracking pixel for Proposals/Quotations/Contracts/Invoices/BusinessDocuments — hit by the recipient's real email client. Never throws; always returns the pixel. */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; token: string }> }) {
  const { kind: kindSlug, token } = await params;
  const kind = parseDocumentKindSlug(kindSlug);

  if (kind) {
    await trackDocumentOpen(kind, token);
  }

  return new NextResponse(new Uint8Array(TRANSPARENT_GIF), {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
