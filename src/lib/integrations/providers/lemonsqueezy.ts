import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * LemonSqueezy — API_KEY auth (a LemonSqueezy API key, Bearer auth, no
 * OAuth). The submitted API key IS the "access token" — stored the same
 * encrypted way an OAuth token would be. LemonSqueezy's API is JSON:API
 * (https://jsonapi.org) — every request MUST send
 * `Accept: application/vnd.api+json` or the API rejects it, even though the
 * endpoint is a simple GET.
 */

const API_BASE = "https://api.lemonsqueezy.com/v1";

interface LemonSqueezyErrorBody {
  errors?: Array<{ detail?: string; title?: string }>;
}

function jsonApiHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/vnd.api+json",
  };
}

export const lemonsqueezyAdapter: IntegrationAdapter = {
  key: "LEMONSQUEEZY",
  name: "Lemon Squeezy",
  category: "PAYMENTS",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key
  },

  credentialFields: [{ key: "apiKey", label: "API Key" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("A Lemon Squeezy API key is required.");

    const response = await fetch(`${API_BASE}/users/me`, { headers: jsonApiHeaders(apiKey) });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as LemonSqueezyErrorBody;
      throw new Error(`Lemon Squeezy rejected this API key: ${body.errors?.[0]?.detail ?? `HTTP ${response.status}`}`);
    }

    return { accessToken: apiKey, scopes: [] };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/users/me`, { headers: jsonApiHeaders(accessToken) });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as LemonSqueezyErrorBody;
      return { ok: false, detail: `Lemon Squeezy users/me check failed (HTTP ${response.status}): ${body.errors?.[0]?.detail ?? "unknown error"}` };
    }
    return { ok: true };
  },

  async revoke(): Promise<void> {
    // Lemon Squeezy has no API to revoke/invalidate an API key remotely — it
    // must be deleted from the Lemon Squeezy Dashboard. Disconnecting here
    // only ever removes our local copy.
  },
};
