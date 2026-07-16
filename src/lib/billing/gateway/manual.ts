import { randomUUID } from "node:crypto";

import type {
  CheckoutSessionResult,
  CreateCheckoutSessionInput,
  GatewaySubscriptionSnapshot,
  NormalizedWebhookEvent,
  PlatformGateway,
} from "./types";

/**
 * Bank Transfer / Manual Payment — the one "gateway" that's always
 * configured, since it represents an organization paying by wire transfer
 * or the platform operator recording a payment received outside any
 * automated processor. There's no external API: "checkout" is just this
 * app's own bank-transfer-instructions page, and there's no subscription to
 * fetch/cancel/refund at a gateway (the business layer flips
 * BillingAccount/PlatformInvoice/PlatformPayment rows directly instead —
 * see markManualPaymentReceived in src/lib/billing/subscriptions.ts).
 */
export const manualGateway: PlatformGateway = {
  provider: "MANUAL",
  name: "Bank Transfer / Manual Payment",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true;
  },

  async createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSessionResult> {
    const reference = randomUUID();
    return {
      checkoutUrl: `${input.successUrl}${input.successUrl.includes("?") ? "&" : "?"}manualReference=${reference}`,
      gatewaySessionId: reference,
    };
  },

  async getSubscription(): Promise<GatewaySubscriptionSnapshot | null> {
    return null;
  },

  async cancelSubscription(): Promise<void> {
    // No-op — a manual-payment BillingAccount is cancelled by updating its
    // own status directly, there's nothing at a gateway to cancel.
  },

  async createRefund(): Promise<void> {
    // No-op — a manual refund is recorded by updating the real
    // PlatformPayment row directly (see recordManualRefund), not by calling
    // any external API.
  },

  async verifyAndParseWebhook(): Promise<NormalizedWebhookEvent | null> {
    return null; // manual payments never arrive via webhook
  },
};
