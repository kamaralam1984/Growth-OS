import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Paddle — API_KEY auth (Paddle Billing's REST API key, Bearer auth, no
 * OAuth). The submitted API key IS the "access token" — stored the same
 * encrypted way an OAuth token would be. Verification and health check both
 * hit GET /event-types, a lightweight, safe, read-only endpoint that exists
 * purely to enumerate webhook event types — cheap and side-effect free.
 */

const API_BASE = "https://api.paddle.com";

interface PaddleErrorBody {
  error?: { detail?: string; code?: string };
}

export const paddleAdapter: IntegrationAdapter = {
  key: "PADDLE",
  name: "Paddle",
  category: "PAYMENTS",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key
  },

  credentialFields: [{ key: "apiKey", label: "API Key" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("A Paddle API key is required.");

    const response = await fetch(`${API_BASE}/event-types`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as PaddleErrorBody;
      throw new Error(`Paddle rejected this API key: ${body.error?.detail ?? `HTTP ${response.status}`}`);
    }

    return { accessToken: apiKey, scopes: [] };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/event-types`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as PaddleErrorBody;
      return { ok: false, detail: `Paddle event-types check failed (HTTP ${response.status}): ${body.error?.detail ?? "unknown error"}` };
    }
    return { ok: true };
  },

  async revoke(): Promise<void> {
    // Paddle has no API to revoke/invalidate an API key remotely — it must
    // be rolled from the Paddle Dashboard. Disconnecting here only ever
    // removes our local copy.
  },
};
