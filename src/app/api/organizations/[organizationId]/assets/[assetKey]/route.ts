import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOrgAsset, ORG_ASSET_CONTENT_TYPE_BY_EXTENSION } from "@/lib/storage/org-assets";

/**
 * Serves a real organization asset (logo/banner/portfolio-image/case-study-
 * image/certificate PDF) — gated on ACTIVE membership in the owning
 * organization, mirroring the white-label assets route's pattern.
 * `assetKey` is `{assetId}.{extension}` as one path segment (matches the URL
 * shape org-assets.ts's saveOrgImage/saveOrgDocument construct).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ organizationId: string; assetKey: string }> }) {
  const { organizationId, assetKey } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dot = assetKey.lastIndexOf(".");
  if (dot === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const assetId = assetKey.slice(0, dot);
  const extension = assetKey.slice(dot + 1).toLowerCase();
  const contentType = ORG_ASSET_CONTENT_TYPE_BY_EXTENSION[extension];
  if (!contentType) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const buffer = await readOrgAsset(organizationId, assetId, extension);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[api/organizations/assets] failed to read file:", error);
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
