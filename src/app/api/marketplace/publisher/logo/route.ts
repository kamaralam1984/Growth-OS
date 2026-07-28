import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { savePublisherLogo, removePublisherLogo } from "@/lib/storage/publisher-logos";

/**
 * Uploads/replaces the signed-in user's MarketplacePublisher logo — requires
 * a publisher application to already exist (logo is set from the Publisher
 * Portal's profile-edit view, not the initial apply form, since attaching a
 * file to a not-yet-created row would need a parallel bookkeeping path for
 * no real benefit).
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const publisher = await prisma.marketplacePublisher.findUnique({ where: { userId } });
  if (!publisher) return NextResponse.json({ error: "You don't have a publisher profile yet." }, { status: 404 });

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  try {
    const { storageKey } = await savePublisherLogo(userId, file);
    await prisma.marketplacePublisher.update({ where: { id: publisher.id }, data: { logoStorageKey: storageKey } });

    if (publisher.logoStorageKey && publisher.logoStorageKey !== storageKey) {
      removePublisherLogo(publisher.logoStorageKey).catch(() => {});
    }

    return NextResponse.json({ url: `/api/marketplace/publisher/${userId}/logo` }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
