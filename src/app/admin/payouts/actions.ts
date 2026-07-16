"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requirePlatformOwner } from "@/lib/billing/platform-admin";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Platform-operator-only manual step marking a Payout as actually sent.
 * Genuinely sending money (a real bank transfer / PayPal payout API call)
 * is out of scope for this pass — this only flips the real, trackable
 * record: the Payout to PAID with a real paidAt timestamp, and every
 * Commission it bundled from PENDING/APPROVED-via-payout to PAID, so a
 * partner's commission history reflects reality end to end.
 */
export async function markPayoutPaidAction(payoutId: string): Promise<ActionResult> {
  const { userId } = await requirePlatformOwner("/admin/payouts");

  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) return { ok: false, error: "Payout not found." };
  if (payout.status === "PAID") return { ok: false, error: "This payout is already marked paid." };

  const paidAt = new Date();
  await prisma.$transaction([
    prisma.payout.update({ where: { id: payoutId }, data: { status: "PAID", paidAt } }),
    prisma.commission.updateMany({ where: { payoutId }, data: { status: "PAID" } }),
  ]);

  await logAudit({
    userId,
    action: "admin.payout_marked_paid",
    metadata: { payoutId, amountCents: payout.amountCents, currency: payout.currency },
  });

  revalidatePath("/admin/payouts");
  return { ok: true };
}
