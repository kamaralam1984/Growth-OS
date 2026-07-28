import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readUserAvatar, saveUserAvatar, removeUserAvatar, AVATAR_CONTENT_TYPE_BY_EXTENSION } from "@/lib/storage/avatars";

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

/** Self-service only — a user may only ever replace their OWN avatar, never another user's. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  if (session.user.id !== id) return NextResponse.json({ error: "You can only update your own photo." }, { status: 403 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  try {
    const previous = await prisma.user.findUnique({ where: { id }, select: { avatarStorageKey: true } });
    const { storageKey } = await saveUserAvatar(id, file);
    await prisma.user.update({ where: { id }, data: { avatarStorageKey: storageKey, image: `/api/users/${id}/avatar` } });

    if (previous?.avatarStorageKey && previous.avatarStorageKey !== storageKey) {
      removeUserAvatar(previous.avatarStorageKey).catch(() => {});
    }

    return NextResponse.json({ url: `/api/users/${id}/avatar` }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
