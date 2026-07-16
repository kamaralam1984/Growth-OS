import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Zoom — OAUTH2 auth via ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET. Token exchange,
 * refresh, and revoke all authenticate with an `Authorization: Basic
 * base64(client_id:client_secret)` header (not body-based credentials), per
 * Zoom's OAuth app conventions. Health check probes GET /v2/users/me.
 */

const AUTH_URL = "https://zoom.us/oauth/authorize";
const TOKEN_URL = "https://zoom.us/oauth/token";
const REVOKE_URL = "https://zoom.us/oauth/revoke";
const API_BASE = "https://api.zoom.us/v2";

interface ZoomTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  error?: string;
}

interface ZoomUserResponse {
  id?: string;
  email?: string;
}

function clientId(): string {
  return process.env.ZOOM_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.ZOOM_CLIENT_SECRET ?? "";
}

function isConfigured(): boolean {
  return Boolean(process.env.ZOOM_CLIENT_ID) && Boolean(process.env.ZOOM_CLIENT_SECRET);
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64")}`;
}

async function exchangeToken(params: Record<string, string>): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as ZoomTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Zoom token endpoint rejected the request (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: body.scope ? body.scope.split(" ") : [],
  };
}

export const zoomAdapter: IntegrationAdapter = {
  key: "ZOOM",
  name: "Zoom",
  category: "MEETINGS",
  authType: "OAUTH2",
  requiredEnvVars: ["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET"],

  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId(),
      redirect_uri: redirectUri,
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
      return { ok: false, detail: `Zoom /v2/users/me check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as ZoomUserResponse;
    return { ok: true, detail: body.email ?? body.id };
  },

  async revoke(accessToken: string): Promise<void> {
    try {
      const response = await fetch(REVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: basicAuthHeader(),
        },
        body: new URLSearchParams({ token: accessToken }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[integrations] Zoom revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] Zoom revoke request failed:", error);
    }
  },
};
