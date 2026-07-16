import { prisma } from "@/lib/prisma";

/**
 * Reseller/Partner commission generation (Phase 18).
 *
 * INTENDED CALL SITE (not yet wired): the real payment-gateway webhook
 * handler in src/lib/billing/subscriptions.ts, whenever it records a
 * successful PlatformPayment for an organization's BillingAccount. That
 * file is owned by a parallel task and may not exist/be stable yet, so this
 * is deliberately a standalone, side-effect-contained function this repo's
 * webhook handler can call once it lands:
 *
 *   await generateCommissionForPayment(payment.organizationId, payment.amountCents, payment.currency);
 *
 * Wiring that one call site into subscriptions.ts is a follow-up
 * integration step, not done here — this module does not import from or
 * modify subscriptions.ts.
 *
 * Behavior: looks up whether the paying organization was referred by a
 * Partner (Organization.referredByPartnerId). If so, and that Partner is
 * ACTIVE, creates a real PENDING Commission for that partner's
 * commissionRatePercent of the payment. A platform operator later reviews
 * and moves PENDING -> APPROVED (out of scope here) before the partner can
 * request a payout against it (see src/app/dashboard/partner/actions.ts's
 * requestPayoutAction, which only ever pulls APPROVED, not-yet-paid-out
 * commissions).
 */
export async function generateCommissionForPayment(
  organizationId: string,
  amountCents: number,
  currency: string,
): Promise<void> {
  if (amountCents <= 0) return;

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { referredByPartnerId: true },
  });
  if (!organization?.referredByPartnerId) return;

  const partner = await prisma.partner.findUnique({ where: { id: organization.referredByPartnerId } });
  if (!partner || partner.status !== "ACTIVE") return;

  const commissionAmountCents = Math.round(amountCents * (partner.commissionRatePercent / 100));
  if (commissionAmountCents <= 0) return;

  await prisma.commission.create({
    data: {
      partnerId: partner.id,
      organizationId,
      amountCents: commissionAmountCents,
      currency,
      status: "PENDING",
    },
  });
}
