/**
 * Platform payment gateway abstraction — the PLATFORM OPERATOR's own
 * Stripe/Razorpay/Paddle/LemonSqueezy credentials (env-var based, one
 * singleton per provider), completely distinct from the per-organization
 * "bring your own account" payment integrations built in the Integration
 * Hub phase (src/lib/integrations/providers/{stripe,razorpay,paypal,paddle,
 * lemonsqueezy}.ts — those let an ORG accept ITS OWN clients' payments;
 * this abstraction is KVL GrowthOS charging a TENANT for platform access).
 * Mirrors src/lib/ai/client.ts's discipline: isConfigured() gates every
 * call, a provider with no real credentials never fakes a checkout URL or
 * a successful charge.
 *
 * Business logic (subscription lifecycle, invoice generation, recurring
 * billing jobs) NEVER imports a concrete provider file directly — only
 * getGateway()/listConfiguredGateways() from registry.ts — so adding a 5th
 * gateway or swapping the primary provider never touches business code.
 */

import type { PaymentGatewayProvider } from "@/generated/prisma/client";

export interface CreateCheckoutSessionInput {
  organizationId: string;
  billingAccountId: string;
  gatewayCustomerId: string | null;
  gatewayPriceId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  trialDays: number;
}

export interface CheckoutSessionResult {
  checkoutUrl: string;
  gatewaySessionId: string;
}

export interface GatewaySubscriptionSnapshot {
  gatewayCustomerId: string;
  gatewaySubscriptionId: string;
  status: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface CreateRefundInput {
  gatewayPaymentId: string;
  amountCents?: number;
  reason?: string;
}

/** Normalized event this gateway's raw webhook payload maps to — business logic (webhook route handlers) branches on `type`, never touches `raw` directly except to log it. */
export type NormalizedWebhookEventType =
  | "checkout.completed"
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "invoice.paid"
  | "invoice.payment_failed"
  | "charge.refunded"
  | "unhandled";

export interface NormalizedWebhookEvent {
  type: NormalizedWebhookEventType;
  gatewayEventId: string;
  gatewayCustomerId?: string;
  gatewaySubscriptionId?: string;
  gatewayPaymentId?: string;
  gatewayInvoiceId?: string;
  amountCents?: number;
  currency?: string;
  failureReason?: string;
  subscriptionSnapshot?: GatewaySubscriptionSnapshot;
  raw: unknown;
}

export interface PlatformGateway {
  provider: PaymentGatewayProvider;
  name: string;
  requiredEnvVars: string[];
  isConfigured(): boolean;

  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult>;
  getSubscription(gatewaySubscriptionId: string): Promise<GatewaySubscriptionSnapshot | null>;
  cancelSubscription(gatewaySubscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  createRefund(input: CreateRefundInput): Promise<void>;

  /** Verifies the raw webhook body against the gateway's real signature scheme. Returns null (never throws to the caller) on an invalid/unverifiable signature — the webhook route must respond 400 and log, never process an unverified payload. */
  verifyAndParseWebhook(rawBody: string, headers: Record<string, string | undefined>): Promise<NormalizedWebhookEvent | null>;
}
