"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function resolveActiveMembership(userId: string) {
  return prisma.membership.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
}

export interface SubmitReviewInput {
  listingId: string;
  rating: number;
  title?: string;
  body?: string;
}

/**
 * Gated server-side on a REAL ACTIVE MarketplaceInstall row for this org —
 * this IS the "verified install" badge (MarketplaceReview.installId is
 * @unique, tying the review to that specific real install), never a
 * cosmetic flag a client could fake.
 */
export async function submitReviewAction(input: SubmitReviewInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };
  if (input.rating < 1 || input.rating > 5) return { ok: false, error: "Rating must be between 1 and 5." };

  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false, error: "You don't belong to an organization yet." };

  const install = await prisma.marketplaceInstall.findUnique({
    where: { organizationId_listingId: { organizationId: membership.organizationId, listingId: input.listingId } },
  });
  if (!install || install.status !== "ACTIVE") {
    return { ok: false, error: "You can only review a listing your organization has actually installed." };
  }

  const existing = await prisma.marketplaceReview.findUnique({
    where: { listingId_organizationId: { listingId: input.listingId, organizationId: membership.organizationId } },
  });
  if (existing) return { ok: false, error: "Your organization already reviewed this listing." };

  const review = await prisma.marketplaceReview.create({
    data: {
      listingId: input.listingId,
      organizationId: membership.organizationId,
      userId,
      installId: install.id,
      rating: input.rating,
      title: input.title?.trim() || null,
      body: input.body?.trim() || null,
    },
  });

  const stats = await prisma.marketplaceReview.aggregate({ where: { listingId: input.listingId }, _avg: { rating: true }, _count: { _all: true } });
  await prisma.marketplaceListing.update({
    where: { id: input.listingId },
    data: { ratingAverage: stats._avg.rating ?? 0, ratingCount: stats._count._all },
  });

  await logAudit({ userId, organizationId: membership.organizationId, action: "marketplace.review_submitted", metadata: { listingId: input.listingId, reviewId: review.id, rating: input.rating } });
  revalidatePath(`/dashboard/marketplace`);
  return { ok: true };
}
