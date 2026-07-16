import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Stripe — API_KEY auth (a Stripe secret key is a long-lived credential,
 * there's no OAuth consent flow for Stripe Connect's platform-account use
 * case here). The submitted secret key IS the "access token" — stored the
 * same encrypted way an OAuth token would be, so every connection-store
 * consumer (getFreshAccessToken, runHealthCheck, disconnectConnection)
 * works identically regardless of auth shape.
 *
 * Canonical template for every other API_KEY adapter in this directory:
 * requiredEnvVars gates whether the *feature* is enabled at all (here,
 * none — Stripe needs no platform-level env var, any org can paste in
 * their own secret key), credentialFields describes the form, and
 * connectWithCredentials makes one real, cheap, read-only API call to
 * prove the key actually works before ever persisting it.
 */

const API_BASE = "https://api.stripe.com/v1";

interface StripeAccount {
  id: string;
  business_profile?: { name?: string | null };
  email?: string | null;
}

interface StripeErrorBody {
  error?: { message?: string };
}

export const stripeAdapter: IntegrationAdapter = {
  key: "STRIPE",
  name: "Stripe",
  category: "PAYMENTS",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own secret key
  },

  credentialFields: [{ key: "secretKey", label: "Secret key", placeholder: "sk_live_... or sk_test_...", secret: true }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const secretKey = credentials.secretKey?.trim();
    if (!secretKey) throw new Error("A Stripe secret key is required.");

    const response = await fetch(`${API_BASE}/account`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const body = (await response.json().catch(() => ({}))) as StripeAccount & StripeErrorBody;
    if (!response.ok) {
      throw new Error(`Stripe rejected this secret key: ${body.error?.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: secretKey,
      scopes: [],
      metadata: { accountId: body.id, businessName: body.business_profile?.name ?? null, email: body.email ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as StripeErrorBody;
      return { ok: false, detail: `Stripe account check failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as StripeAccount;
    return { ok: true, detail: body.id };
  },

  async revoke(): Promise<void> {
    // Stripe has no API to revoke/invalidate a secret key remotely — it must
    // be rolled from the Stripe Dashboard. Disconnecting here only ever
    // removes our local copy, which is honest: we never claim to have
    // revoked provider-side access we can't actually revoke.
  },
};
