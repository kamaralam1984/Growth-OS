"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomReferralCode(length = 8): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomReferralCode();
    const existing = await prisma.partner.findUnique({ where: { referralCode: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  throw new Error("Could not generate a unique referral code. Please try again.");
}

/**
 * Applies the signed-in USER (not any organization — Partner.userId is
 * unique per user, per schema) to become a reseller Partner. Creates a real
 * PENDING Partner row with a real, DB-unique referralCode. A platform
 * operator later flips PENDING -> ACTIVE manually (direct DB access, or the
 * optional /admin/partners page) — no self-service approval path exists by
 * design, same posture as User.isPlatformOwner.
 */
export async function becomePartnerAction(): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const existing = await prisma.partner.findUnique({ where: { userId } });
  if (existing) return { ok: false, error: "You already have a partner account." };

  const referralCode = await generateUniqueReferralCode();
  const partner = await prisma.partner.create({ data: { userId, referralCode, status: "PENDING" } });

  await logAudit({ userId, action: "partner.applied", metadata: { partnerId: partner.id } });
  revalidatePath("/dashboard/partner");
  return { ok: true };
}

/**
 * Bundles every one of the signed-in partner's APPROVED, not-yet-paid-out
 * Commission rows into a real new Payout (status PENDING), linking each
 * commission's `payoutId`. Grouped by currency since a Payout carries one
 * currency but a partner's approved commissions may legitimately span more
 * than one (referred organizations on different billing currencies) — this
 * creates one Payout per distinct currency rather than fabricating a mixed
 * total.
 *
 * This Payout row is a real, trackable REQUEST/record only — actually
 * sending money (a bank transfer / PayPal payout API call) is out of scope
 * for this pass. Marking a Payout "PAID" is a manual operator action (see
 * the optional /admin/payouts page).
 */
export async function requestPayoutAction(): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const partner = await prisma.partner.findUnique({ where: { userId } });
  if (!partner) return { ok: false, error: "You don't have a partner account yet." };
  if (partner.status !== "ACTIVE") {
    return { ok: false, error: "Your partner account must be approved before you can request a payout." };
  }

  const approvedCommissions = await prisma.commission.findMany({
    where: { partnerId: partner.id, status: "APPROVED", payoutId: null },
  });
  if (approvedCommissions.length === 0) {
    return { ok: false, error: "There are no approved commissions available to pay out right now." };
  }

  const byCurrency = new Map<string, typeof approvedCommissions>();
  for (const commission of approvedCommissions) {
    const list = byCurrency.get(commission.currency) ?? [];
    list.push(commission);
    byCurrency.set(commission.currency, list);
  }

  const createdPayoutIds: string[] = [];
  for (const [currency, commissions] of byCurrency) {
    const amountCents = commissions.reduce((sum, c) => sum + c.amountCents, 0);
    const payout = await prisma.$transaction(async (tx) => {
      const created = await tx.payout.create({
        data: { partnerId: partner.id, amountCents, currency, status: "PENDING" },
      });
      await tx.commission.updateMany({
        where: { id: { in: commissions.map((c) => c.id) } },
        data: { payoutId: created.id },
      });
      return created;
    });
    createdPayoutIds.push(payout.id);
  }

  await logAudit({
    userId,
    action: "partner.payout_requested",
    metadata: { partnerId: partner.id, payoutIds: createdPayoutIds },
  });
  revalidatePath("/dashboard/partner");
  return { ok: true };
}
