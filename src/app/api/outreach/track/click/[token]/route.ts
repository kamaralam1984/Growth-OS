import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/** Public, unauthenticated click-tracking redirect — hit when the recipient clicks a real link in a real sent email. Never throws; always redirects somewhere safe. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const requestUrl = new URL(request.url);
  const target = requestUrl.searchParams.get("url");

  let destination = "/";
  if (target) {
    try {
      const parsed = new URL(target);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") destination = parsed.toString();
    } catch {
      // Malformed target — fall back to "/" rather than throwing.
    }
  }

  try {
    const draft = await prisma.emailDraft.findUnique({ where: { trackingToken: token }, select: { id: true, firstClickedAt: true } });
    if (draft) {
      await prisma.emailDraft.update({
        where: { id: draft.id },
        data: { clickCount: { increment: 1 }, firstClickedAt: draft.firstClickedAt ?? new Date() },
      });
    }
  } catch (error) {
    console.error("[outreach/track/click] failed:", error);
  }

  return NextResponse.redirect(destination, { status: 302 });
}
