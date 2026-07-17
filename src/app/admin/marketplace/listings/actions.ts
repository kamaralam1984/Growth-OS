"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Publishes an IN_REVIEW listing's current draft version — flips the version PUBLISHED, sets it as currentVersionId, marks the listing PUBLISHED+isVerified. */
export async function approveListingVersionAction(listingId: string, versionId: string): Promise<ActionResult> {
  const admin = await requirePlatformOwner("/admin/marketplace/listings");

  const version = await prisma.marketplaceVersion.findUnique({ where: { id: versionId } });
  if (!version || version.listingId !== listingId) return { ok: false, error: "Version not found." };

  await prisma.marketplaceVersion.update({ where: { id: versionId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await prisma.marketplaceListing.update({ where: { id: listingId }, data: { status: "PUBLISHED", isVerified: true, currentVersionId: versionId } });

  await logAudit({ userId: admin.userId, action: "marketplace.listing_approved", metadata: { listingId, versionId } });
  revalidatePath("/admin/marketplace/listings");
  return { ok: true };
}

export async function rejectListingAction(listingId: string, reason?: string): Promise<ActionResult> {
  const admin = await requirePlatformOwner("/admin/marketplace/listings");

  await prisma.marketplaceListing.update({ where: { id: listingId }, data: { status: "REJECTED" } });

  await logAudit({ userId: admin.userId, action: "marketplace.listing_rejected", metadata: { listingId, reason } });
  revalidatePath("/admin/marketplace/listings");
  return { ok: true };
}

export async function suspendListingAction(listingId: string): Promise<ActionResult> {
  const admin = await requirePlatformOwner("/admin/marketplace/listings");

  await prisma.marketplaceListing.update({ where: { id: listingId }, data: { status: "SUSPENDED" } });

  await logAudit({ userId: admin.userId, action: "marketplace.listing_suspended", metadata: { listingId } });
  revalidatePath("/admin/marketplace/listings");
  return { ok: true };
}
