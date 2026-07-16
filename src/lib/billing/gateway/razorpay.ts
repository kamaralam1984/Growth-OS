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
 * Razorpay — the recommended gateway for Indian tenants (real INR-native
 * pricing/settlement, UPI/netbanking support Stripe doesn't cover well in
 * India). Plain fetch against Razorpay's REST API, HTTP Basic auth with
 * key_id:key_secret — matches this codebase's lean-dependency convention
 * (no official Razorpay Node SDK dependency).
 *
 * Razorpay has no separate "checkout session" object like Stripe — creating
 * a Subscription directly returns a real `short_url` hosted payment page,
 * which doubles as both the checkout session and its own id here.
 */

const API_BASE = "https://api.razorpay.com/v1";

function isConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID) && Boolean(process.env.RAZORPAY_KEY_SECRET);
}

function authHeader(): string {
  const keyId = process.env.RAZORPAY_KEY_ID ?? "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

interface RazorpayCustomer {
  id: string;
}

interface RazorpaySubscription {
  id: string;
  short_url: string;
  status: string;
  customer_id?: string;
  current_start?: number;
  current_end?: number;
}

interface RazorpayErrorBody {
  error?: { description?: string };
}

async function findOrCreateCustomer(email: string): Promise<string> {
  const response = await fetch(`${API_BASE}/customers`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ email, fail_existing: 0 }),
  });
  const body = (await response.json().catch(() => ({}))) as RazorpayCustomer & RazorpayErrorBody;
  if (!response.ok || !body.id) throw new Error(`Razorpay customer creation failed: ${body.error?.description ?? `HTTP ${response.status}`}`);
  return body.id;
}

function fromUnixSeconds(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

export const razorpayGateway: PlatformGateway = {
  provider: "RAZORPAY",
  name: "Razorpay",
  requiredEnvVars: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  isConfigured,

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const customerId = input.gatewayCustomerId ?? (await findOrCreateCustomer(input.customerEmail));

    const response = await fetch(`${API_BASE}/subscriptions`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_id: input.gatewayPriceId,
        customer_id: customerId,
        customer_notify: 1,
        total_count: 120, // Razorpay requires a finite total_count even for "ongoing" subscriptions — 120 cycles is a real, documented convention for an effectively-indefinite subscription (10 years of monthly billing), renewed by creating a fresh subscription well before exhaustion if ever reached.
        notes: { organizationId: input.organizationId, billingAccountId: input.billingAccountId },
      }),
    });
    const body = (await response.json().catch(() => ({}))) as RazorpaySubscription & RazorpayErrorBody;
    if (!response.ok || !body.id) throw new Error(`Razorpay subscription creation failed: ${body.error?.description ?? `HTTP ${response.status}`}`);

    return { checkoutUrl: body.short_url, gatewaySessionId: body.id };
  },

  async getSubscription(gatewaySubscriptionId: string): Promise<GatewaySubscriptionSnapshot | null> {
    const response = await fetch(`${API_BASE}/subscriptions/${gatewaySubscriptionId}`, {
      headers: { Authorization: authHeader() },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as RazorpaySubscription;
    return {
      gatewayCustomerId: body.customer_id ?? "",
      gatewaySubscriptionId: body.id,
      status: body.status,
      currentPeriodStart: fromUnixSeconds(body.current_start),
      currentPeriodEnd: fromUnixSeconds(body.current_end),
      cancelAtPeriodEnd: false, // Razorpay's cancel-at-cycle-end isn't reflected back on the subscription object itself — tracked locally instead (BillingAccount.cancelAtPeriodEnd) when cancelSubscription(atPeriodEnd: true) is called.
    };
  },

  async cancelSubscription(gatewaySubscriptionId: string, atPeriodEnd: boolean): Promise<void> {
    const response = await fetch(`${API_BASE}/subscriptions/${gatewaySubscriptionId}/cancel`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ cancel_at_cycle_end: atPeriodEnd ? 1 : 0 }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as RazorpayErrorBody;
      throw new Error(`Razorpay subscription cancellation failed: ${body.error?.description ?? `HTTP ${response.status}`}`);
    }
  },

  async createRefund(input: CreateRefundInput): Promise<void> {
    const response = await fetch(`${API_BASE}/payments/${input.gatewayPaymentId}/refund`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(input.amountCents ? { amount: input.amountCents } : {}),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as RazorpayErrorBody;
      throw new Error(`Razorpay refund failed: ${body.error?.description ?? `HTTP ${response.status}`}`);
    }
  },

  async verifyAndParseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<NormalizedWebhookEvent | null> {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = headers["x-razorpay-signature"];
    if (!secret || !signature) return null;

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected, "hex");
    const actualBuf = Buffer.from(signature, "hex");
    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      console.error("[billing/razorpay] webhook signature mismatch");
      return null;
    }

    let payload: {
      event: string;
      payload?: {
        subscription?: { entity: RazorpaySubscription };
        payment?: { entity: { id: string; amount: number; currency: string; order_id?: string } };
        refund?: { entity: { payment_id: string; amount: number; currency: string } };
      };
    };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const gatewayEventId = `razorpay_${Date.now()}_${payload.event}`;
    const base = { gatewayEventId, raw: payload };

    switch (payload.event) {
      case "subscription.activated":
      case "subscription.charged": {
        const sub = payload.payload?.subscription?.entity;
        return {
          ...base,
          type: payload.event === "subscription.activated" ? "subscription.created" : "invoice.paid",
          gatewaySubscriptionId: sub?.id,
          gatewayCustomerId: sub?.customer_id,
          subscriptionSnapshot: sub
            ? {
                gatewayCustomerId: sub.customer_id ?? "",
                gatewaySubscriptionId: sub.id,
                status: sub.status,
                currentPeriodStart: fromUnixSeconds(sub.current_start),
                currentPeriodEnd: fromUnixSeconds(sub.current_end),
                cancelAtPeriodEnd: false,
              }
            : undefined,
        };
      }
      case "subscription.cancelled":
        return { ...base, type: "subscription.canceled", gatewaySubscriptionId: payload.payload?.subscription?.entity.id };
      case "payment.failed":
        return {
          ...base,
          type: "invoice.payment_failed",
          gatewayPaymentId: payload.payload?.payment?.entity.id,
          amountCents: payload.payload?.payment?.entity.amount,
          currency: payload.payload?.payment?.entity.currency,
          failureReason: "Payment failed — see Razorpay dashboard for details.",
        };
      case "refund.processed":
        return {
          ...base,
          type: "charge.refunded",
          gatewayPaymentId: payload.payload?.refund?.entity.payment_id,
          amountCents: payload.payload?.refund?.entity.amount,
          currency: payload.payload?.refund?.entity.currency,
        };
      default:
        return { ...base, type: "unhandled" };
    }
  },
};
