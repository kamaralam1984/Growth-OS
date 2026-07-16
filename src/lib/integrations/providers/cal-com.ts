import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Cal.com — API_KEY auth. No platform-level OAuth app: each org pastes in
 * their own Cal.com v1 API key, so isConfigured() is unconditionally true
 * (same shape as stripe.ts).
 *
 * Quirk: Cal.com's v1 API authenticates via a query-string `apiKey` param
 * rather than an Authorization header — every call below (verification and
 * health check) appends it to the query string instead of sending Bearer.
 */

const API_BASE = "https://api.cal.com/v1";

interface CalComMeResponse {
  user?: { id?: number; email?: string | null; username?: string | null };
}

interface CalComErrorBody {
  message?: string;
}

export const calComAdapter: IntegrationAdapter = {
  key: "CAL_COM",
  name: "Cal.com",
  category: "CALENDAR",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key
  },

  credentialFields: [{ key: "apiKey", label: "API Key", placeholder: "cal_live_...", secret: true }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("A Cal.com API key is required.");

    const response = await fetch(`${API_BASE}/me?apiKey=${encodeURIComponent(apiKey)}`);
    const body = (await response.json().catch(() => ({}))) as CalComMeResponse & CalComErrorBody;
    if (!response.ok) {
      throw new Error(`Cal.com rejected this API key: ${body.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: apiKey,
      scopes: [],
      metadata: { userId: body.user?.id ?? null, email: body.user?.email ?? null, username: body.user?.username ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/me?apiKey=${encodeURIComponent(accessToken)}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as CalComErrorBody;
      return { ok: false, detail: `Cal.com /me check failed (HTTP ${response.status}): ${body.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as CalComMeResponse;
    return { ok: true, detail: body.user?.email ?? body.user?.username ?? undefined };
  },

  async revoke(): Promise<void> {
    // Cal.com has no API to revoke an API key remotely — it must be deleted
    // from the Cal.com dashboard. Disconnecting here only ever removes our
    // local copy.
  },
};
