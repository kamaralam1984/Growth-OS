import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Dropbox — OAUTH2 with its own app (DROPBOX_CLIENT_ID/SECRET).
 * token_access_type=offline is requested at the auth-url step (Dropbox's
 * equivalent of Google's access_type=offline) to get a long-lived refresh
 * token. No stable server-side introspection endpoint, so healthCheck uses
 * the standard get_current_account probe.
 */

const AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

interface DropboxTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

function isConfigured(): boolean {
  return Boolean(process.env.DROPBOX_CLIENT_ID) && Boolean(process.env.DROPBOX_CLIENT_SECRET);
}

async function exchangeToken(params: Record<string, string>): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as DropboxTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Dropbox token endpoint rejected the request (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: body.scope ? body.scope.split(" ") : [],
  };
}

export const dropboxAdapter: IntegrationAdapter = {
  key: "DROPBOX",
  name: "Dropbox",
  category: "STORAGE",
  authType: "OAUTH2",
  requiredEnvVars: ["DROPBOX_CLIENT_ID", "DROPBOX_CLIENT_SECRET"],
  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: process.env.DROPBOX_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      token_access_type: "offline",
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    return exchangeToken({
      code,
      grant_type: "authorization_code",
      client_id: process.env.DROPBOX_CLIENT_ID ?? "",
      client_secret: process.env.DROPBOX_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
    });
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const refreshed = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.DROPBOX_CLIENT_ID ?? "",
      client_secret: process.env.DROPBOX_CLIENT_SECRET ?? "",
    });
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: null,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Dropbox get_current_account failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as { email?: string; name?: { display_name?: string } };
    return { ok: true, detail: body.email ?? body.name?.display_name };
  },

  async revoke(accessToken: string): Promise<void> {
    try {
      const response = await fetch("https://api.dropboxapi.com/2/auth/token/revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: null,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[integrations] Dropbox revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] Dropbox revoke request failed:", error);
    }
  },
};
