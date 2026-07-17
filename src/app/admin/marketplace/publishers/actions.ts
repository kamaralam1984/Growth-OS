"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import { logAudit } from "@/lib/audit";
import type { MarketplacePublisherStatus, PartnerStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const VALID_STATUSES: MarketplacePublisherStatus[] = ["PENDING", "APPROVED", "SUSPENDED", "REJECTED"];

/** Approving a publisher also activates their linked Partner row, so payouts can actually flow once they publish a paid listing. */
export async function updatePublisherStatusAction(publisherId: string, status: string): Promise<ActionResult> {
  const admin = await requirePlatformOwner("/admin/marketplace/publishers");
  if (!VALID_STATUSES.includes(status as MarketplacePublisherStatus)) return { ok: false, error: "Invalid status." };

  const publisher = await prisma.marketplacePublisher.findUnique({ where: { id: publisherId } });
  if (!publisher) return { ok: false, error: "Publisher not found." };

  await prisma.marketplacePublisher.update({ where: { id: publisherId }, data: { status: status as MarketplacePublisherStatus } });

  if (status === "APPROVED" && publisher.partnerId) {
    const partnerStatus: PartnerStatus = "ACTIVE";
    await prisma.partner.update({ where: { id: publisher.partnerId }, data: { status: partnerStatus } });
  }

  await logAudit({ userId: admin.userId, action: "marketplace.publisher_status_updated", metadata: { publisherId, status } });
  revalidatePath("/admin/marketplace/publishers");
  return { ok: true };
}
