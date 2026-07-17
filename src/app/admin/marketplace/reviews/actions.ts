"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function respondToReviewAction(reviewId: string, response: string): Promise<ActionResult> {
  const admin = await requirePlatformOwner("/admin/marketplace/reviews");
  if (!response.trim()) return { ok: false, error: "Response can't be empty." };

  await prisma.marketplaceReview.update({ where: { id: reviewId }, data: { publisherResponse: response.trim(), publisherRespondedAt: new Date() } });

  await logAudit({ userId: admin.userId, action: "marketplace.review_responded", metadata: { reviewId } });
  revalidatePath("/admin/marketplace/reviews");
  return { ok: true };
}

/** Removes a real review and recomputes the listing's real rating aggregate — used for moderation (spam, abuse), never for suppressing a genuine negative review. */
export async function removeReviewAction(reviewId: string): Promise<ActionResult> {
  const admin = await requirePlatformOwner("/admin/marketplace/reviews");

  const review = await prisma.marketplaceReview.findUnique({ where: { id: reviewId } });
  if (!review) return { ok: false, error: "Review not found." };

  await prisma.marketplaceReview.delete({ where: { id: reviewId } });

  const stats = await prisma.marketplaceReview.aggregate({ where: { listingId: review.listingId }, _avg: { rating: true }, _count: { _all: true } });
  await prisma.marketplaceListing.update({
    where: { id: review.listingId },
    data: { ratingAverage: stats._avg.rating ?? 0, ratingCount: stats._count._all },
  });

  await logAudit({ userId: admin.userId, action: "marketplace.review_removed", metadata: { reviewId, listingId: review.listingId } });
  revalidatePath("/admin/marketplace/reviews");
  return { ok: true };
}
