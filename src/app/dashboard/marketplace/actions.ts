"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notifyOrganizationOwners } from "@/lib/notifications";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Records a real "notify me" request — no fake install, just a genuine interest signal. */
export async function registerMarketplaceInterest(listingId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const membership = await prisma.membership.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  try {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    if (!listing) return { ok: false, error: "Listing not found." };

    const existing = await prisma.marketplaceInterest.findUnique({
      where: { listingId_organizationId: { listingId, organizationId: membership.organizationId } },
    });
    if (existing) return { ok: true };

    await prisma.marketplaceInterest.create({
      data: { listingId, organizationId: membership.organizationId, userId },
    });
    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { interestCount: { increment: 1 } },
    });

    await notifyOrganizationOwners({
      organizationId: membership.organizationId,
      type: "SYSTEM_NOTICE",
      title: "Marketplace interest recorded",
      message: `Your organization requested to be notified when "${listing.name}" ships.`,
    });

    revalidatePath("/dashboard/marketplace");
    return { ok: true };
  } catch (error) {
    console.error("[marketplace] registerMarketplaceInterest failed:", error);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
