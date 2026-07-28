import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { saveOrgImage, saveOrgDocument, removeOrgAssetByUrl } from "@/lib/storage/org-assets";

/**
 * Generic organization-scoped asset upload — real file, real validation,
 * real save, returns a real serving URL. Any ACTIVE member of the
 * organization may upload (the underlying record's own update action, e.g.
 * updateCompanyAbout, still separately enforces who may actually SAVE that
 * URL onto the record — this endpoint alone only guards against a
 * non-member touching this organization's storage).
 */
export async function POST(request: Request, { params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const membership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return NextResponse.json({ error: "You do not have access to this organization." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  const kind = formData?.get("kind");
  const previousUrl = formData?.get("previousUrl");

  try {
    const result = kind === "document" ? await saveOrgDocument(organizationId, file) : await saveOrgImage(organizationId, file);

    // Best-effort cleanup of the file being replaced — never blocks the response.
    if (typeof previousUrl === "string") {
      removeOrgAssetByUrl(previousUrl).catch(() => {});
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
