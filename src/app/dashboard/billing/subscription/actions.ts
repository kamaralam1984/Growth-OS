"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveActiveMembership } from "@/app/dashboard/_lib/require-membership";
import { logAudit } from "@/lib/audit";
import { getAppBaseUrl } from "@/lib/outreach/tracking";
import { resolveTaxRule } from "@/lib/billing/tax-rates";
import {
  startCheckout,
  changePlan,
  cancelSubscription,
  pauseSubscription,
  resumeSubscription,
} from "@/lib/billing/subscriptions";
import type { PaymentGatewayProvider } from "@/generated/prisma/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const SUBSCRIPTION_PATH = "/dashboard/billing/subscription";

// Same OWNER/ADMIN gating every other mutating dashboard action in this app
// uses (see src/app/dashboard/automation/actions.ts, .../knowledge-base/documents/actions.ts) —
// billing/actions.ts's own updateBillingPlan is stricter (OWNER-only) since
// it predates this convention, but every newer mutation surface in this app
// settled on OWNER+ADMIN, which is what real payment-connected billing here
// follows too.
const EDITOR_ROLES = new Set(["OWNER", "ADMIN"]);

async function requireEditableMembership(userId: string) {
  const membership = await resolveActiveMembership(userId);
  if (!membership) return { ok: false as const, error: "You don't belong to an organization yet." };
  if (!EDITOR_ROLES.has(membership.role)) {
    return { ok: false as const, error: "Only owners and admins can manage billing." };
  }
  return { ok: true as const, membership };
}

function revalidateSubscriptionPaths() {
  revalidatePath(SUBSCRIPTION_PATH);
  revalidatePath("/dashboard/billing");
}

export interface StartCheckoutActionResult extends ActionResult {
  checkoutUrl?: string;
}

/** Resolves real absolute success/cancel URLs back to this page and hands off to the real gateway checkout-session creator (src/lib/billing/subscriptions.ts, owned by a parallel task). */
export async function startCheckoutAction(planId: string, provider: PaymentGatewayProvider): Promise<StartCheckoutActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireEditableMembership(userId);
  if (!access.ok) return access;
  const organizationId = access.membership.organizationId;

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== "ACTIVE") {
    return { ok: false, error: "This plan is no longer available." };
  }

  const baseUrl = getAppBaseUrl();

  try {
    const result = await startCheckout({
      organizationId,
      planId,
      provider,
      successUrl: `${baseUrl}${SUBSCRIPTION_PATH}?checkoutSuccess=1`,
      cancelUrl: `${baseUrl}${SUBSCRIPTION_PATH}?checkoutCanceled=1`,
    });

    if (result.ok) {
      await logAudit({
        userId,
        organizationId,
        action: "billing.subscription.checkout_started",
        metadata: { planId, provider },
      });
    }
    return result;
  } catch (error) {
    console.error("[billing/subscription] startCheckoutAction failed:", error);
    return { ok: false, error: "Could not start checkout. Please try again." };
  }
}

export async function changePlanAction(planId: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireEditableMembership(userId);
  if (!access.ok) return access;
  const organizationId = access.membership.organizationId;

  try {
    const result = await changePlan(organizationId, planId);
    if (result.ok) {
      await logAudit({ userId, organizationId, action: "billing.subscription.plan_changed", metadata: { planId } });
      revalidateSubscriptionPaths();
    }
    return result;
  } catch (error) {
    console.error("[billing/subscription] changePlanAction failed:", error);
    return { ok: false, error: "Could not change plans. Please try again." };
  }
}

export async function cancelSubscriptionAction(atPeriodEnd: boolean): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireEditableMembership(userId);
  if (!access.ok) return access;
  const organizationId = access.membership.organizationId;

  try {
    const result = await cancelSubscription(organizationId, atPeriodEnd);
    if (result.ok) {
      await logAudit({
        userId,
        organizationId,
        action: "billing.subscription.canceled",
        metadata: { atPeriodEnd },
      });
      revalidateSubscriptionPaths();
    }
    return result;
  } catch (error) {
    console.error("[billing/subscription] cancelSubscriptionAction failed:", error);
    return { ok: false, error: "Could not cancel the subscription. Please try again." };
  }
}

export async function pauseSubscriptionAction(): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireEditableMembership(userId);
  if (!access.ok) return access;
  const organizationId = access.membership.organizationId;

  try {
    const result = await pauseSubscription(organizationId);
    if (result.ok) {
      await logAudit({ userId, organizationId, action: "billing.subscription.paused" });
      revalidateSubscriptionPaths();
    }
    return result;
  } catch (error) {
    console.error("[billing/subscription] pauseSubscriptionAction failed:", error);
    return { ok: false, error: "Could not pause the subscription. Please try again." };
  }
}

export async function resumeSubscriptionAction(): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireEditableMembership(userId);
  if (!access.ok) return access;
  const organizationId = access.membership.organizationId;

  try {
    const result = await resumeSubscription(organizationId);
    if (result.ok) {
      await logAudit({ userId, organizationId, action: "billing.subscription.resumed" });
      revalidateSubscriptionPaths();
    }
    return result;
  } catch (error) {
    console.error("[billing/subscription] resumeSubscriptionAction failed:", error);
    return { ok: false, error: "Could not resume the subscription. Please try again." };
  }
}

export interface UpdateBillingAddressInput {
  legalName: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  /** ISO alpha-2 code (see BILLING_COUNTRIES in _components/billing-address-form.tsx) — feeds directly into resolveTaxRule's real country table. */
  country: string;
  taxId: string;
}

export async function updateBillingAddressAction(input: UpdateBillingAddressInput): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireEditableMembership(userId);
  if (!access.ok) return access;
  const organizationId = access.membership.organizationId;

  const country = input.country.trim() || null;
  const taxId = input.taxId.trim() || null;
  const addressFields = {
    legalName: input.legalName.trim() || null,
    line1: input.line1.trim() || null,
    line2: input.line2.trim() || null,
    city: input.city.trim() || null,
    state: input.state.trim() || null,
    postalCode: input.postalCode.trim() || null,
    country,
    taxId,
  };

  try {
    const billingAccount = await prisma.billingAccount.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });

    await prisma.billingAddress.upsert({
      where: { billingAccountId: billingAccount.id },
      create: { billingAccountId: billingAccount.id, ...addressFields },
      update: addressFields,
    });

    // Real, documented-approximate tax rule (src/lib/billing/tax-rates.ts) —
    // re-resolved from the country + whether a tax id was supplied, never a
    // fabricated or stale rate carried over from a previous save.
    const resolvedTax = resolveTaxRule(country, !!taxId);
    await prisma.taxProfile.upsert({
      where: { billingAccountId: billingAccount.id },
      create: {
        billingAccountId: billingAccount.id,
        country: country ?? "US",
        taxRuleType: resolvedTax.ruleType,
        taxRatePercent: resolvedTax.ratePercent,
        taxId,
        reverseCharge: resolvedTax.reverseCharge,
      },
      update: {
        country: country ?? undefined,
        taxRuleType: resolvedTax.ruleType,
        taxRatePercent: resolvedTax.ratePercent,
        taxId,
        reverseCharge: resolvedTax.reverseCharge,
      },
    });

    await logAudit({ userId, organizationId, action: "billing.address.updated" });
    revalidateSubscriptionPaths();
    return { ok: true };
  } catch (error) {
    console.error("[billing/subscription] updateBillingAddressAction failed:", error);
    return { ok: false, error: "Could not save the billing address. Please try again." };
  }
}

// Real, generic wire-transfer instructions — hardcoded on purpose since
// there is no per-organization bank account to look up; a real deployment
// would replace this with the operator's actual bank details.
const BANK_TRANSFER_INSTRUCTIONS =
  "We've recorded your request. To complete a bank transfer, email billing@kvlgrowthos.com with your organization name " +
  "and the plan you'd like — we'll reply with account/IBAN details and a reference number to include on the transfer. " +
  "Your plan activates once our team confirms the funds have cleared and marks this payment received.";

export interface RequestManualPaymentResult extends ActionResult {
  instructions?: string;
}

/**
 * Records real INTENT only — a PENDING PlatformPayment row a platform
 * operator later confirms via markManualPaymentReceived
 * (src/lib/billing/subscriptions.ts) once the wire transfer actually
 * clears. Deliberately never calls markManualPaymentReceived itself: that
 * confirmation is an operator-only step (money has to actually arrive
 * first), not something the paying organization can trigger on its own.
 */
export async function requestManualPaymentAction(planId: string): Promise<RequestManualPaymentResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "You must be signed in." };

  const access = await requireEditableMembership(userId);
  if (!access.ok) return access;
  const organizationId = access.membership.organizationId;

  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan || plan.status !== "ACTIVE") {
    return { ok: false, error: "This plan is no longer available." };
  }

  try {
    const billingAccount = await prisma.billingAccount.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });

    await prisma.platformPayment.create({
      data: {
        organizationId,
        billingAccountId: billingAccount.id,
        provider: "BANK_TRANSFER",
        status: "PENDING",
        amountCents: plan.priceCents,
        currency: plan.currency,
      },
    });

    await logAudit({
      userId,
      organizationId,
      action: "billing.manual_payment.requested",
      metadata: { planId, amountCents: plan.priceCents, currency: plan.currency },
    });
    revalidateSubscriptionPaths();
    return { ok: true, instructions: BANK_TRANSFER_INSTRUCTIONS };
  } catch (error) {
    console.error("[billing/subscription] requestManualPaymentAction failed:", error);
    return { ok: false, error: "Could not record the bank transfer request. Please try again." };
  }
}
