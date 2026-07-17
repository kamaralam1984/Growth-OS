import { prisma } from "@/lib/prisma";
import type { PaymentGatewayProvider } from "@/generated/prisma/client";
import { getGateway, listConfiguredGateways } from "@/lib/billing/gateway/registry";
import type { NormalizedWebhookEvent } from "@/lib/billing/gateway/types";
import { generatePlatformInvoice, refundPlatformPayment, issueCreditNote } from "@/lib/billing/invoices";
import { generateLicenseKey } from "@/lib/billing/licenses";
import { logAudit } from "@/lib/audit";
import { installListing, uninstallListing, checkDependencies, MarketplaceInstallError } from "./install-engine";

/**
 * Paid marketplace checkout/fulfillment/refund — reuses the existing
 * platform gateway abstraction, PlatformInvoice/PlatformPayment models, and
 * refund flow verbatim (see src/lib/billing/gateway/*, src/lib/billing/
 * invoices.ts) rather than building a parallel payment system. A
 * marketplace purchase is just another PlatformInvoice under the buyer
 * org's existing BillingAccount. LemonSqueezy is honestly excluded from
 * one-time checkout candidates (it has no dynamic-pricing API — its own
 * gateway file throws rather than fake a session), and Manual/Bank Transfer
 * is always the final fallback, exactly like platform-subscription billing.
 */

const ONE_TIME_GATEWAY_PRIORITY: PaymentGatewayProvider[] = ["STRIPE", "RAZORPAY", "PADDLE", "MANUAL"];

async function getOrCreateBillingAccount(organizationId: string) {
  return prisma.billingAccount.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
}

export interface StartCheckoutParams {
  organizationId: string;
  listingId: string;
  buyerUserId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface StartCheckoutResult {
  ok: boolean;
  error?: string;
  checkoutUrl?: string;
  installId?: string;
  requiresManualConfirmation?: boolean;
}

export async function startMarketplaceCheckout(params: StartCheckoutParams): Promise<StartCheckoutResult> {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: params.listingId } });
  if (!listing || !listing.currentVersionId) return { ok: false, error: "This listing has no published version yet." };

  try {
    await checkDependencies(params.organizationId, listing.currentVersionId);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "A required dependency is missing." };
  }

  if (listing.pricingModel === "FREE") {
    try {
      const { installId } = await installListing({ organizationId: params.organizationId, listingId: params.listingId, installedByUserId: params.buyerUserId });
      return { ok: true, installId };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Install failed." };
    }
  }

  if (!listing.priceCents || listing.priceCents <= 0) return { ok: false, error: "This listing has no real price configured." };
  const currency = listing.currency ?? "USD";

  const buyer = await prisma.user.findUnique({ where: { id: params.buyerUserId }, select: { email: true } });
  if (!buyer?.email) return { ok: false, error: "Your account has no email address on file." };

  const billingAccount = await getOrCreateBillingAccount(params.organizationId);

  const order = await prisma.marketplaceOrder.create({
    data: {
      organizationId: params.organizationId,
      listingId: params.listingId,
      versionId: listing.currentVersionId,
      buyerUserId: params.buyerUserId,
      pricingModel: listing.pricingModel,
      amountCents: listing.priceCents,
      currency,
      status: "PENDING",
    },
  });

  const gatewayPriceIds = (listing.gatewayPriceIds as Record<string, string> | null) ?? {};
  const candidateProviders: PaymentGatewayProvider[] =
    listing.pricingModel === "SUBSCRIPTION"
      ? [...(Object.keys(gatewayPriceIds) as PaymentGatewayProvider[]), "MANUAL"]
      : ONE_TIME_GATEWAY_PRIORITY;

  const configured = new Set(listConfiguredGateways().map((g) => g.provider));

  let lastError: string | null = null;
  for (const provider of candidateProviders) {
    if (!configured.has(provider)) continue;
    try {
      const gateway = getGateway(provider);
      const session = await gateway.createCheckoutSession({
        organizationId: params.organizationId,
        billingAccountId: billingAccount.id,
        gatewayCustomerId: billingAccount.gatewayCustomerId,
        mode: listing.pricingModel === "SUBSCRIPTION" ? "subscription" : "payment",
        gatewayPriceId: listing.pricingModel === "SUBSCRIPTION" ? gatewayPriceIds[provider] : undefined,
        amountCents: listing.pricingModel === "ONE_TIME" ? listing.priceCents : undefined,
        currency,
        lineItemName: listing.name,
        customerEmail: buyer.email,
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        trialDays: 0,
        metadata: { kind: "marketplace_order", marketplaceOrderId: order.id },
      });

      await prisma.marketplaceOrder.update({
        where: { id: order.id },
        data: { gatewayProvider: provider, gatewayCheckoutSessionId: session.gatewaySessionId },
      });

      return { ok: true, checkoutUrl: session.checkoutUrl, requiresManualConfirmation: provider === "MANUAL" };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue; // try the next configured gateway rather than failing the whole checkout on one provider's real limitation
    }
  }

  await prisma.marketplaceOrder.update({ where: { id: order.id }, data: { status: "FAILED" } });
  return { ok: false, error: lastError ?? "No payment method is available for this listing." };
}

/**
 * Shared fulfillment core — called from BOTH the real gateway webhook
 * handler and the manual "mark as paid" operator action, so a purchase is
 * always fulfilled the identical way regardless of which payment path
 * confirmed it. Creates the real PlatformInvoice+PlatformPayment (reused,
 * unmodified models), runs the install engine, issues a real License, and
 * — the previously-unwired trigger — creates a real publisher Commission.
 */
export async function fulfillMarketplaceOrder(orderId: string, opts: { gatewayPaymentId?: string; provider?: PaymentGatewayProvider } = {}): Promise<void> {
  const order = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: orderId }, include: { listing: { include: { publisher: true } } } });
  if (order.status === "PAID") return; // idempotent — a duplicate webhook delivery must never double-fulfill

  const billingAccount = await prisma.billingAccount.findUniqueOrThrow({ where: { organizationId: order.organizationId } });
  const provider = opts.provider ?? order.gatewayProvider ?? "MANUAL";

  const invoice = await generatePlatformInvoice(
    billingAccount.id,
    [{ description: `Marketplace: ${order.listing.name}`, quantity: 1, unitAmountCents: order.amountCents }],
    order.pricingModel === "SUBSCRIPTION" ? "RECURRING" : "RECEIPT",
    order.currency,
  );

  await prisma.$transaction(async (tx) => {
    await tx.platformPayment.create({
      data: {
        organizationId: order.organizationId,
        billingAccountId: billingAccount.id,
        invoiceId: invoice.id,
        provider,
        status: "SUCCEEDED",
        amountCents: order.amountCents,
        currency: order.currency,
        gatewayPaymentId: opts.gatewayPaymentId,
        gatewayChargeId: opts.gatewayPaymentId,
        paidAt: new Date(),
      },
    });
    await tx.platformInvoice.update({
      where: { id: invoice.id },
      data: { status: "PAID", paidAt: new Date(), amountPaidCents: { increment: order.amountCents } },
    });
  });

  let installId: string | null = null;
  try {
    const result = await installListing({ organizationId: order.organizationId, listingId: order.listingId, versionId: order.versionId, installedByUserId: order.buyerUserId });
    installId = result.installId;
  } catch (error) {
    if (!(error instanceof MarketplaceInstallError)) throw error;
    console.error(`[marketplace/checkout] install failed after real payment for order ${order.id}:`, error.message);
    // Payment already succeeded — never silently drop it. The order stays PAID with no install; an admin can retry the install from the order's admin view.
  }

  let licenseId: string | null = null;
  try {
    const license = await generateLicenseKey(order.organizationId, "API");
    await prisma.license.update({ where: { id: license.id }, data: { marketplaceListingId: order.listingId } });
    if (installId) await prisma.marketplaceInstall.update({ where: { id: installId }, data: { licenseId: license.id } });
    licenseId = license.id;
  } catch (error) {
    console.error(`[marketplace/checkout] license issuance failed for order ${order.id}:`, error);
  }

  let commissionId: string | null = null;
  const publisher = order.listing.publisher;
  if (publisher?.partnerId && installId) {
    const platformFeePercent = order.listing.platformFeePercent ?? 20;
    const publisherShareCents = Math.round(order.amountCents * (1 - platformFeePercent / 100));
    const commission = await prisma.commission.create({
      data: {
        partnerId: publisher.partnerId,
        organizationId: order.organizationId,
        amountCents: publisherShareCents,
        currency: order.currency,
        status: "PENDING",
        sourceType: "MARKETPLACE_SALE",
        marketplaceInstallId: installId,
      },
    });
    commissionId = commission.id;
  }

  await prisma.marketplaceOrder.update({
    where: { id: order.id },
    data: {
      status: "PAID",
      platformInvoiceId: invoice.id,
      installId,
      commissionId,
      gatewayProvider: provider,
      gatewayCheckoutSessionId: order.gatewayCheckoutSessionId,
    },
  });

  await logAudit({ organizationId: order.organizationId, action: "marketplace.order.fulfilled", metadata: { orderId: order.id, listingId: order.listingId, provider, installId, licenseId, commissionId } });
}

/** Operator/OWNER-initiated confirmation for a MANUAL-gateway order — the real "bank transfer received" flow, same posture as markManualPaymentReceived for platform subscriptions. */
export async function markManualMarketplaceOrderPaid(orderId: string, markedByUserId: string): Promise<{ ok: boolean; error?: string }> {
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.gatewayProvider !== "MANUAL") return { ok: false, error: "This order was not started via Manual/Bank Transfer." };
  if (order.status === "PAID") return { ok: true };

  try {
    await fulfillMarketplaceOrder(orderId, { provider: "MANUAL" });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not fulfill this order." };
  }
  await logAudit({ userId: markedByUserId, organizationId: order.organizationId, action: "marketplace.order.manual_payment_confirmed", metadata: { orderId } });
  return { ok: true };
}

/** Reverses a paid order: real gateway refund (or a direct state flip for Manual, which has no gateway charge to call), voids the publisher commission, and uninstalls. */
export async function refundMarketplaceOrder(orderId: string, requestedByUserId: string): Promise<{ ok: boolean; error?: string }> {
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Order not found." };
  if (order.status !== "PAID") return { ok: false, error: `Cannot refund an order with status ${order.status}.` };
  if (!order.platformInvoiceId) return { ok: false, error: "This order has no real invoice on file." };

  if (order.gatewayProvider === "MANUAL") {
    const payment = await prisma.platformPayment.findFirst({ where: { invoiceId: order.platformInvoiceId }, orderBy: { createdAt: "desc" } });
    if (!payment) return { ok: false, error: "No real payment record found for this order." };
    await prisma.platformPayment.update({ where: { id: payment.id }, data: { status: "REFUNDED", refundedAmountCents: payment.amountCents } });
    await issueCreditNote(order.platformInvoiceId, payment.amountCents, "Marketplace order refunded (Manual payment).");
  } else {
    const payment = await prisma.platformPayment.findFirst({ where: { invoiceId: order.platformInvoiceId }, orderBy: { createdAt: "desc" } });
    if (!payment) return { ok: false, error: "No real payment record found for this order." };
    const result = await refundPlatformPayment(payment.id);
    if (!result.ok) return result;
  }

  if (order.commissionId) {
    await prisma.commission.update({ where: { id: order.commissionId }, data: { status: "VOID" } });
  }
  if (order.installId) {
    try {
      await uninstallListing({ organizationId: order.organizationId, listingId: order.listingId, uninstalledByUserId: requestedByUserId });
    } catch (error) {
      console.error(`[marketplace/checkout] uninstall-on-refund failed for order ${order.id}:`, error);
    }
  }

  await prisma.marketplaceOrder.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
  await logAudit({ userId: requestedByUserId, organizationId: order.organizationId, action: "marketplace.order.refunded", metadata: { orderId } });
  return { ok: true };
}

/**
 * Called from the metadata-first branch in
 * src/lib/billing/subscriptions.ts's handleGatewayWebhookEvent() when
 * event.metadata.kind === "marketplace_order" — routes real gateway events
 * to marketplace fulfillment instead of the BillingAccount-oriented switch.
 */
export async function handleMarketplaceOrderWebhookEvent(provider: PaymentGatewayProvider, event: NormalizedWebhookEvent): Promise<void> {
  const orderId = event.metadata?.marketplaceOrderId;
  if (!orderId) return;

  switch (event.type) {
    case "checkout.completed":
    case "invoice.paid":
      await fulfillMarketplaceOrder(orderId, { gatewayPaymentId: event.gatewayPaymentId, provider });
      break;
    case "invoice.payment_failed":
      await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { status: "FAILED" } }).catch(() => {});
      break;
    case "charge.refunded": {
      // The refund already happened at the gateway (e.g. issued from its
      // dashboard) — this just syncs local state, never calls
      // gateway.createRefund() again (that would double-refund).
      const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
      if (order?.status === "PAID") {
        if (order.commissionId) await prisma.commission.update({ where: { id: order.commissionId }, data: { status: "VOID" } });
        if (order.installId) await uninstallListing({ organizationId: order.organizationId, listingId: order.listingId, uninstalledByUserId: order.buyerUserId }).catch(() => {});
        await prisma.marketplaceOrder.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
      }
      break;
    }
    default:
      break;
  }
}
