import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readPublisherLogo, PUBLISHER_LOGO_CONTENT_TYPE_BY_EXTENSION } from "@/lib/storage/publisher-logos";

/**
 * Serves a real MarketplacePublisher logo — gated on "any authenticated
 * user" (same posture as the user-avatar route): publisher logos are
 * legitimately shown across the Marketplace to any member browsing
 * listings, not scoped to one organization.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const publisher = await prisma.marketplacePublisher.findUnique({ where: { userId }, select: { logoStorageKey: true } });
  if (!publisher?.logoStorageKey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const extension = publisher.logoStorageKey.split(".").pop()?.toLowerCase() ?? "";
  const contentType = PUBLISHER_LOGO_CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";

  try {
    const buffer = await readPublisherLogo(publisher.logoStorageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[api/marketplace/publisher/logo] failed to read file:", error);
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
