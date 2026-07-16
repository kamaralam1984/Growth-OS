"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";
import type { PartnerStatus } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const VALID_STATUSES = new Set<PartnerStatus>(["PENDING", "ACTIVE", "SUSPENDED"]);

/**
 * Platform-operator-only partner status flip (PENDING -> ACTIVE approval,
 * or ACTIVE/PENDING -> SUSPENDED). There is deliberately no self-service
 * approval path — this is the minimal manual-override tool referenced in
 * the Partner Portal's "a platform operator reviews your application"
 * copy.
 */
export async function updatePartnerStatusAction(partnerId: string, status: string): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/partners");

  if (!VALID_STATUSES.has(status as PartnerStatus)) {
    return { ok: false, error: "Choose a valid status." };
  }

  const partner = await prisma.partner.findUnique({ where: { id: partnerId } });
  if (!partner) return { ok: false, error: "Partner not found." };

  await prisma.partner.update({ where: { id: partnerId }, data: { status: status as PartnerStatus } });

  await logAudit({
    userId,
    action: "admin.partner_status_updated",
    metadata: { partnerId, from: partner.status, to: status },
  });

  revalidatePath("/admin/partners");
  return { ok: true };
}
