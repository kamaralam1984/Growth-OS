import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Calendly — OAUTH2 auth via CALENDLY_CLIENT_ID/CALENDLY_CLIENT_SECRET.
 * Token exchange and refresh both use body-based (not Basic-auth header)
 * client_id/client_secret form fields, per Calendly's documented OAuth flow.
 * Health check probes GET /users/me; revoke posts to the dedicated
 * /oauth/revoke endpoint and — per the never-throw contract — only logs on
 * failure.
 */

const AUTH_URL = "https://auth.calendly.com/oauth/authorize";
const TOKEN_URL = "https://auth.calendly.com/oauth/token";
const REVOKE_URL = "https://auth.calendly.com/oauth/revoke";
const API_BASE = "https://api.calendly.com";

interface CalendlyTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface CalendlyMeResponse {
  resource?: { uri?: string; name?: string; email?: string };
}

function clientId(): string {
  return process.env.CALENDLY_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.CALENDLY_CLIENT_SECRET ?? "";
}

function isConfigured(): boolean {
  return Boolean(process.env.CALENDLY_CLIENT_ID) && Boolean(process.env.CALENDLY_CLIENT_SECRET);
}

async function exchangeToken(params: Record<string, string>): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), ...params }),
  });
  const body = (await response.json().catch(() => ({}))) as CalendlyTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Calendly token endpoint rejected the request (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: body.scope ? body.scope.split(" ") : [],
  };
}

export const calendlyAdapter: IntegrationAdapter = {
  key: "CALENDLY",
  name: "Calendly",
  category: "CALENDAR",
  authType: "OAUTH2",
  requiredEnvVars: ["CALENDLY_CLIENT_ID", "CALENDLY_CLIENT_SECRET"],

  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri,
      response_type: "code",
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    return exchangeToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const refreshed = await exchangeToken({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Calendly /users/me check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as CalendlyMeResponse;
    return { ok: true, detail: body.resource?.email ?? body.resource?.name };
  },

  async revoke(accessToken: string): Promise<void> {
    try {
      const response = await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId(), client_secret: clientSecret(), token: accessToken }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[integrations] Calendly revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] Calendly revoke request failed:", error);
    }
  },
};
