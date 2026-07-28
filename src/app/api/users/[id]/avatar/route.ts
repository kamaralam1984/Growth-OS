import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readUserAvatar, AVATAR_CONTENT_TYPE_BY_EXTENSION } from "@/lib/storage/avatars";

/**
 * Real self-hosted avatar download — mirrors the white-label logo/favicon
 * route's pattern (src/app/api/white-label/assets/.../route.ts), but gated
 * on "any authenticated user" rather than same-organization membership: a
 * profile photo is low-sensitivity and legitimately viewed across org
 * boundaries (agency portals, cross-org meetings, marketplace reviews),
 * unlike a white-labeled org's private branding assets.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { id }, select: { avatarStorageKey: true } });
  if (!user?.avatarStorageKey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const extension = user.avatarStorageKey.split(".").pop()?.toLowerCase() ?? "";
  const contentType = AVATAR_CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";

  try {
    const buffer = await readUserAvatar(user.avatarStorageKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("[api/users/avatar] failed to read file:", error);
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
