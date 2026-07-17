import { createHmac, timingSafeEqual } from "node:crypto";

import type {
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  CreateRefundInput,
  GatewaySubscriptionSnapshot,
  NormalizedWebhookEvent,
  PlatformGateway,
} from "./types";

/**
 * Paddle (Paddle Billing / v2 API) — a genuine Merchant of Record: Paddle
 * itself becomes the seller of record and handles global sales tax/VAT
 * remittance, which is why the spec calls it out separately from
 * Stripe/Razorpay (which require the platform operator to handle their own
 * tax registration). Plain fetch, matching this codebase's convention.
 *
 * Written from stable, well-documented Paddle Billing API conventions
 * (transactions/subscriptions/adjustments, `Paddle-Signature` webhook
 * scheme) — verify endpoint paths against developer.paddle.com before
 * relying on this in production, same caveat this codebase already
 * attaches to its DocuSign adapter.
 */

function apiBase(): string {
  return process.env.PADDLE_ENVIRONMENT === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

function isConfigured(): boolean {
  return Boolean(process.env.PADDLE_API_KEY);
}

function authHeader(): string {
  return `Bearer ${process.env.PADDLE_API_KEY ?? ""}`;
}

interface PaddleErrorBody {
  error?: { detail?: string };
}

interface PaddleTransaction {
  id: string;
  checkout?: { url?: string };
  customer_id?: string;
}

interface PaddleSubscription {
  id: string;
  status: string;
  customer_id: string;
  current_billing_period?: { starts_at?: string; ends_at?: string };
  scheduled_change?: { action: string } | null;
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export const paddleGateway: PlatformGateway = {
  provider: "PADDLE",
  name: "Paddle",
  requiredEnvVars: ["PADDLE_API_KEY", "PADDLE_WEBHOOK_SECRET"],
  isConfigured,

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const customData = { organizationId: input.organizationId, billingAccountId: input.billingAccountId, ...input.metadata };

    // One-time payments use Paddle's real support for a non-catalog inline
    // price on a Transaction — no pre-created Price object required, unlike
    // the gatewayPriceId-based subscription path below.
    const items =
      input.mode === "payment"
        ? (() => {
            if (!input.amountCents || !input.currency) throw new Error("Paddle one-time checkout requires amountCents and currency.");
            return [
              {
                price: {
                  description: input.lineItemName ?? "Purchase",
                  name: input.lineItemName ?? "Purchase",
                  unit_price: { amount: String(input.amountCents), currency_code: input.currency.toUpperCase() },
                },
                quantity: 1,
              },
            ];
          })()
        : (() => {
            if (!input.gatewayPriceId) throw new Error("Paddle subscription checkout requires gatewayPriceId.");
            return [{ price_id: input.gatewayPriceId, quantity: 1 }];
          })();

    const response = await fetch(`${apiBase()}/transactions`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        ...(input.gatewayCustomerId ? { customer_id: input.gatewayCustomerId } : {}),
        custom_data: customData,
        checkout: { url: input.successUrl },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as { data?: PaddleTransaction } & PaddleErrorBody;
    if (!response.ok || !body.data) throw new Error(`Paddle transaction creation failed: ${body.error?.detail ?? `HTTP ${response.status}`}`);
    if (!body.data.checkout?.url) throw new Error("Paddle transaction was created without a checkout URL — verify the price's checkout settings.");

    return { checkoutUrl: body.data.checkout.url, gatewaySessionId: body.data.id };
  },

  async getSubscription(gatewaySubscriptionId: string): Promise<GatewaySubscriptionSnapshot | null> {
    const response = await fetch(`${apiBase()}/subscriptions/${gatewaySubscriptionId}`, {
      headers: { Authorization: authHeader() },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { data: PaddleSubscription };
    const sub = body.data;
    return {
      gatewayCustomerId: sub.customer_id,
      gatewaySubscriptionId: sub.id,
      status: sub.status,
      currentPeriodStart: parseDate(sub.current_billing_period?.starts_at),
      currentPeriodEnd: parseDate(sub.current_billing_period?.ends_at),
      cancelAtPeriodEnd: sub.scheduled_change?.action === "cancel",
    };
  },

  async cancelSubscription(gatewaySubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    const response = await fetch(`${apiBase()}/subscriptions/${gatewaySubscriptionId}/cancel`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ effective_from: atPeriodEnd ? "next_billing_period" : "immediately" }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as PaddleErrorBody;
      throw new Error(`Paddle subscription cancellation failed: ${body.error?.detail ?? `HTTP ${response.status}`}`);
    }
  },

  async createRefund(input: CreateRefundInput): Promise<void> {
    const response = await fetch(`${apiBase()}/adjustments`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "refund",
        transaction_id: input.gatewayPaymentId,
        reason: input.reason ?? "Requested by platform operator",
        ...(input.amountCents ? { items: [{ type: "partial", amount: String(input.amountCents) }] } : { type: "full" }),
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as PaddleErrorBody;
      throw new Error(`Paddle refund (adjustment) failed: ${body.error?.detail ?? `HTTP ${response.status}`}`);
    }
  },

  async verifyAndParseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<NormalizedWebhookEvent | null> {
    const secret = process.env.PADDLE_WEBHOOK_SECRET;
    const signatureHeader = headers["paddle-signature"];
    if (!secret || !signatureHeader) return null;

    const parts = Object.fromEntries(signatureHeader.split(";").map((p) => p.split("=") as [string, string]));
    const timestamp = parts.ts;
    const h1 = parts.h1;
    if (!timestamp || !h1) return null;

    const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(h1, "hex");
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      console.error("[billing/paddle] webhook signature mismatch");
      return null;
    }

    let payload: { event_id: string; event_type: string; data: Record<string, unknown> };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const base = { gatewayEventId: payload.event_id, raw: payload };
    const data = payload.data as Partial<PaddleSubscription> & {
      id?: string;
      subscription_id?: string;
      amount?: string;
      currency_code?: string;
      custom_data?: Record<string, string>;
      details?: { totals?: { total?: string } };
    };

    switch (payload.event_type) {
      case "subscription.created":
      case "subscription.updated":
        return {
          ...base,
          type: payload.event_type === "subscription.created" ? "subscription.created" : "subscription.updated",
          gatewaySubscriptionId: data.id,
          gatewayCustomerId: data.customer_id,
          subscriptionSnapshot: data.id
            ? {
                gatewayCustomerId: data.customer_id ?? "",
                gatewaySubscriptionId: data.id,
                status: data.status ?? "unknown",
                currentPeriodStart: parseDate(data.current_billing_period?.starts_at),
                currentPeriodEnd: parseDate(data.current_billing_period?.ends_at),
                cancelAtPeriodEnd: data.scheduled_change?.action === "cancel",
              }
            : undefined,
        };
      case "subscription.canceled":
        return { ...base, type: "subscription.canceled", gatewaySubscriptionId: data.id };
      case "transaction.paid":
        return {
          ...base,
          // A transaction with no subscription_id is a real one-time
          // marketplace purchase, not a recurring invoice — surfaced as
          // "checkout.completed" so it's routed the same way the
          // subscription-mode checkout.completed event is, never mistaken
          // for a subscription renewal.
          type: data.subscription_id ? "invoice.paid" : "checkout.completed",
          gatewayInvoiceId: data.id,
          gatewayPaymentId: data.id,
          gatewaySubscriptionId: data.subscription_id,
          currency: data.currency_code,
          amountCents: data.details?.totals?.total ? Number(data.details.totals.total) : undefined,
          metadata: data.custom_data,
        };
      case "transaction.payment_failed":
        return {
          ...base,
          type: "invoice.payment_failed",
          gatewayInvoiceId: data.id,
          gatewaySubscriptionId: data.subscription_id,
          failureReason: "Payment failed — see Paddle dashboard for details.",
        };
      case "adjustment.updated":
        return { ...base, type: "charge.refunded", gatewayPaymentId: (data as { transaction_id?: string }).transaction_id };
      default:
        return { ...base, type: "unhandled" };
    }
  },
};
