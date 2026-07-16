import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  GatewaySubscriptionSnapshot,
  NormalizedWebhookEvent,
  PlatformGateway,
} from "./types";

/**
 * LemonSqueezy — optional platform gateway, JSON:API over plain fetch.
 * `gatewayPriceId` here is a LemonSqueezy variant id (LemonSqueezy has no
 * separate "price" object the way Stripe does — a Product's Variant IS the
 * purchasable price point).
 *
 * Written from stable, documented LemonSqueezy API conventions — verify
 * against docs.lemonsqueezy.com before relying on this in production, same
 * caveat this codebase already attaches to its DocuSign adapter.
 */

const API_BASE = "https://api.lemonsqueezy.com/v1";

function isConfigured(): boolean {
  return Boolean(process.env.LEMONSQUEEZY_API_KEY) && Boolean(process.env.LEMONSQUEEZY_STORE_ID);
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY ?? ""}`,
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}

interface LsErrorBody {
  errors?: Array<{ detail?: string }>;
}

interface LsCheckoutResponse {
  data?: { id: string; attributes?: { url?: string } };
}

interface LsSubscriptionResponse {
  data?: {
    id: string;
    attributes?: {
      status?: string;
      renews_at?: string;
      ends_at?: string | null;
      customer_id?: number;
      cancelled?: boolean;
    };
  };
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const lemonsqueezyGateway: PlatformGateway = {
  provider: "LEMONSQUEEZY",
  name: "LemonSqueezy",
  requiredEnvVars: ["LEMONSQUEEZY_API_KEY", "LEMONSQUEEZY_STORE_ID", "LEMONSQUEEZY_WEBHOOK_SECRET"],
  isConfigured,

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const response = await fetch(`${API_BASE}/checkouts`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: { email: input.customerEmail, custom: { organizationId: input.organizationId, billingAccountId: input.billingAccountId } },
            product_options: { redirect_url: input.successUrl },
          },
          relationships: {
            store: { data: { type: "stores", id: process.env.LEMONSQUEEZY_STORE_ID } },
            variant: { data: { type: "variants", id: input.gatewayPriceId } },
          },
        },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as LsCheckoutResponse & LsErrorBody;
    if (!response.ok || !body.data?.attributes?.url) {
      throw new Error(`LemonSqueezy checkout creation failed: ${body.errors?.[0]?.detail ?? `HTTP ${response.status}`}`);
    }
    return { checkoutUrl: body.data.attributes.url, gatewaySessionId: body.data.id };
  },

  async getSubscription(gatewaySubscriptionId: string): Promise<GatewaySubscriptionSnapshot | null> {
    const response = await fetch(`${API_BASE}/subscriptions/${gatewaySubscriptionId}`, { headers: headers() });
    if (!response.ok) return null;
    const body = (await response.json()) as LsSubscriptionResponse;
    if (!body.data) return null;
    return {
      gatewayCustomerId: String(body.data.attributes?.customer_id ?? ""),
      gatewaySubscriptionId: body.data.id,
      status: body.data.attributes?.status ?? "unknown",
      currentPeriodStart: null, // LemonSqueezy's subscription object doesn't expose a period-start field directly — only the next `renews_at`.
      currentPeriodEnd: parseDate(body.data.attributes?.renews_at),
      cancelAtPeriodEnd: Boolean(body.data.attributes?.cancelled),
    };
  },

  async cancelSubscription(gatewaySubscriptionId: string): Promise<void> {
    // LemonSqueezy's DELETE cancels at the end of the current billing period
    // by default — there is no documented "cancel immediately" variant, so
    // `atPeriodEnd` isn't threaded through separately here (unlike
    // Stripe/Razorpay/Paddle) — this is the gateway's own real behavior,
    // not a shortcut taken by this adapter.
    const response = await fetch(`${API_BASE}/subscriptions/${gatewaySubscriptionId}`, {
      method: "DELETE",
      headers: headers(),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as LsErrorBody;
      throw new Error(`LemonSqueezy subscription cancellation failed: ${body.errors?.[0]?.detail ?? `HTTP ${response.status}`}`);
    }
  },

  async createRefund(): Promise<void> {
    // LemonSqueezy has no documented public API endpoint for creating a
    // refund — refunds must be issued from the LemonSqueezy dashboard.
    // Throwing here (rather than guessing at an endpoint that doesn't
    // exist) so the caller shows an honest "refund manually in the
    // LemonSqueezy dashboard" message instead of a fabricated success.
    throw new Error("LemonSqueezy does not support refunds via API — issue this refund from the LemonSqueezy dashboard.");
  },

  async verifyAndParseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<NormalizedWebhookEvent | null> {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const signature = headers["x-signature"];
    if (!secret || !signature) return null;

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(signature, "hex");
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      console.error("[billing/lemonsqueezy] webhook signature mismatch");
      return null;
    }

    let payload: { meta: { event_name: string }; data: { id: string; attributes: Record<string, unknown> } };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const gatewayEventId = `lemonsqueezy_${payload.data.id}_${payload.meta.event_name}_${Date.now()}`;
    const base = { gatewayEventId, raw: payload };
    const attrs = payload.data.attributes as { status?: string; renews_at?: string; customer_id?: number; total?: number; currency?: string };

    switch (payload.meta.event_name) {
      case "subscription_created":
      case "subscription_updated":
        return {
          ...base,
          type: payload.meta.event_name === "subscription_created" ? "subscription.created" : "subscription.updated",
          gatewaySubscriptionId: payload.data.id,
          gatewayCustomerId: String(attrs.customer_id ?? ""),
          subscriptionSnapshot: {
            gatewayCustomerId: String(attrs.customer_id ?? ""),
            gatewaySubscriptionId: payload.data.id,
            status: attrs.status ?? "unknown",
            currentPeriodStart: null,
            currentPeriodEnd: parseDate(attrs.renews_at),
            cancelAtPeriodEnd: attrs.status === "cancelled",
          },
        };
      case "subscription_cancelled":
      case "subscription_expired":
        return { ...base, type: "subscription.canceled", gatewaySubscriptionId: payload.data.id };
      case "subscription_payment_success":
        return { ...base, type: "invoice.paid", gatewaySubscriptionId: payload.data.id, amountCents: attrs.total, currency: attrs.currency };
      case "subscription_payment_failed":
        return { ...base, type: "invoice.payment_failed", gatewaySubscriptionId: payload.data.id, failureReason: "Payment failed — see LemonSqueezy dashboard for details." };
      case "subscription_payment_refunded":
        return { ...base, type: "charge.refunded", gatewaySubscriptionId: payload.data.id, amountCents: attrs.total, currency: attrs.currency };
      default:
        return { ...base, type: "unhandled" };
    }
  },
};
