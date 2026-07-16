import Stripe from "stripe";

import type {
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  CreateRefundInput,
  GatewaySubscriptionSnapshot,
  NormalizedWebhookEvent,
  PlatformGateway,
} from "./types";

/**
 * Stripe — the primary international platform billing gateway. Uses the
 * official `stripe` SDK (unlike the plain-fetch Integration Hub adapters)
 * because webhook signature verification (`stripe.webhooks.constructEvent`)
 * is genuinely security-critical and easy to get subtly wrong by hand —
 * the one place in this billing system where reaching for the official SDK
 * over a lean fetch call is the right tradeoff.
 */

let client: Stripe | null = null;

function isConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function getClient(): Stripe {
  if (!isConfigured()) throw new Error("Stripe is not configured — set STRIPE_SECRET_KEY.");
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

function fromUnixSeconds(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

export const stripeGateway: PlatformGateway = {
  provider: "STRIPE",
  name: "Stripe",
  requiredEnvVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
  isConfigured,

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const stripe = getClient();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: input.gatewayPriceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      ...(input.gatewayCustomerId ? { customer: input.gatewayCustomerId } : { customer_email: input.customerEmail }),
      subscription_data: input.trialDays > 0 ? { trial_period_days: input.trialDays } : undefined,
      client_reference_id: input.organizationId,
      metadata: { organizationId: input.organizationId, billingAccountId: input.billingAccountId },
    });

    if (!session.url) throw new Error("Stripe checkout session was created without a redirect URL.");
    return { checkoutUrl: session.url, gatewaySessionId: session.id };
  },

  async getSubscription(gatewaySubscriptionId: string): Promise<GatewaySubscriptionSnapshot | null> {
    const stripe = getClient();
    try {
      const sub = await stripe.subscriptions.retrieve(gatewaySubscriptionId);
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      return {
        gatewayCustomerId: customerId,
        gatewaySubscriptionId: sub.id,
        status: sub.status,
        currentPeriodStart: fromUnixSeconds(sub.items.data[0]?.current_period_start),
        currentPeriodEnd: fromUnixSeconds(sub.items.data[0]?.current_period_end),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
    } catch (error) {
      console.error(`[billing/stripe] getSubscription(${gatewaySubscriptionId}) failed:`, error);
      return null;
    }
  },

  async cancelSubscription(gatewaySubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    const stripe = getClient();
    if (atPeriodEnd) {
      await stripe.subscriptions.update(gatewaySubscriptionId, { cancel_at_period_end: true });
    } else {
      await stripe.subscriptions.cancel(gatewaySubscriptionId);
    }
  },

  async createRefund(input: CreateRefundInput): Promise<void> {
    const stripe = getClient();
    await stripe.refunds.create({
      charge: input.gatewayPaymentId,
      amount: input.amountCents,
      reason: input.reason === "duplicate" || input.reason === "fraudulent" ? input.reason : "requested_by_customer",
    });
  },

  async verifyAndParseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<NormalizedWebhookEvent | null> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = headers["stripe-signature"];
    if (!webhookSecret || !signature) return null;

    const stripe = getClient();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      console.error("[billing/stripe] webhook signature verification failed:", error);
      return null;
    }

    const base = { gatewayEventId: event.id, raw: event };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        return {
          ...base,
          type: "checkout.completed",
          gatewayCustomerId: typeof session.customer === "string" ? session.customer : undefined,
          gatewaySubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
        };
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        return {
          ...base,
          type: event.type === "customer.subscription.created" ? "subscription.created" : "subscription.updated",
          gatewayCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          gatewaySubscriptionId: sub.id,
          subscriptionSnapshot: {
            gatewayCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            gatewaySubscriptionId: sub.id,
            status: sub.status,
            currentPeriodStart: fromUnixSeconds(sub.items.data[0]?.current_period_start),
            currentPeriodEnd: fromUnixSeconds(sub.items.data[0]?.current_period_end),
            cancelAtPeriodEnd: sub.cancel_at_period_end,
          },
        };
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        return {
          ...base,
          type: "subscription.canceled",
          gatewayCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          gatewaySubscriptionId: sub.id,
        };
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        return {
          ...base,
          type: "invoice.paid",
          gatewayCustomerId: typeof invoice.customer === "string" ? invoice.customer : undefined,
          gatewayInvoiceId: invoice.id,
          amountCents: invoice.amount_paid,
          currency: invoice.currency,
        };
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        return {
          ...base,
          type: "invoice.payment_failed",
          gatewayCustomerId: typeof invoice.customer === "string" ? invoice.customer : undefined,
          gatewayInvoiceId: invoice.id,
          amountCents: invoice.amount_due,
          currency: invoice.currency,
          failureReason: "Payment failed — see Stripe dashboard for the decline reason.",
        };
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        return {
          ...base,
          type: "charge.refunded",
          gatewayPaymentId: charge.id,
          amountCents: charge.amount_refunded,
          currency: charge.currency,
        };
      }
      default:
        return { ...base, type: "unhandled" };
    }
  },
};
