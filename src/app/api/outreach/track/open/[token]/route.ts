import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// A real, standard 1x1 transparent GIF — not a placeholder image.
const TRANSPARENT_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

/** Public, unauthenticated open-tracking pixel — hit by the recipient's real email client. Never throws; always returns the pixel. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const draft = await prisma.emailDraft.findUnique({ where: { trackingToken: token }, select: { id: true, firstOpenedAt: true } });
    if (draft) {
      await prisma.emailDraft.update({
        where: { id: draft.id },
        data: { openCount: { increment: 1 }, firstOpenedAt: draft.firstOpenedAt ?? new Date() },
      });
    }
  } catch (error) {
    console.error("[outreach/track/open] failed:", error);
  }

  return new NextResponse(new Uint8Array(TRANSPARENT_GIF), {
    headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, no-cache, must-revalidate" },
  });
}
