import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readWhiteLabelAsset } from "@/lib/storage/white-label-assets";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  gif: "image/gif",
  ico: "image/x-icon",
};

/**
 * Auth-gated white-label logo/favicon download — mirrors
 * src/app/api/documents/[id]/route.ts's pattern. The file lives under
 * storage/white-label-assets/ (never public/), and this is the only way to
 * read it back. Only members with an ACTIVE membership in the requested
 * organization can view its assets — this route is used for the settings
 * page's "current logo" preview; wiring these assets into a real public
 * rendering surface (the actual login screen a visitor sees before
 * authenticating) is out of this task's scope, see
 * src/lib/white-label/resolve-brand.ts's doc comment.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ organizationId: string; kind: string }> },
) {
  const { organizationId, kind } = await params;
  if (kind !== "logo" && kind !== "favicon") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const settings = await prisma.whiteLabelSettings.findUnique({ where: { organizationId } });
  const storageKey = kind === "logo" ? settings?.logoStorageKey : settings?.faviconStorageKey;
  if (!storageKey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const extension = storageKey.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";

  try {
    const buffer = await readWhiteLabelAsset(storageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    console.error("[api/white-label/assets] failed to read file:", error);
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
