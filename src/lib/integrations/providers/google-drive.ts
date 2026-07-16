import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Google Drive — OAUTH2, reusing the SAME Google Cloud OAuth client as
 * Gmail/Calendar (GOOGLE_INTEGRATION_CLIENT_ID/SECRET), just with a
 * drive.file scope instead. google-oauth.ts's makeGoogleAdapter factory is
 * not exported, so the small amount of OAuth plumbing (token exchange,
 * revoke) is duplicated here rather than importing an unexported symbol.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_INTEGRATION_CLIENT_ID) && Boolean(process.env.GOOGLE_INTEGRATION_CLIENT_SECRET);
}

async function exchangeToken(params: Record<string, string>): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Google token endpoint rejected the request (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: body.scope ? body.scope.split(" ") : [],
  };
}

export const googleDriveAdapter: IntegrationAdapter = {
  key: "GOOGLE_DRIVE",
  name: "Google Drive",
  category: "STORAGE",
  authType: "OAUTH2",
  requiredEnvVars: ["GOOGLE_INTEGRATION_CLIENT_ID", "GOOGLE_INTEGRATION_CLIENT_SECRET"],
  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_INTEGRATION_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    return exchangeToken({
      code,
      client_id: process.env.GOOGLE_INTEGRATION_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_INTEGRATION_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const refreshed = await exchangeToken({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_INTEGRATION_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_INTEGRATION_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    });
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Drive about check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as { user?: { emailAddress?: string; displayName?: string } };
    return { ok: true, detail: body.user?.emailAddress ?? body.user?.displayName };
  },

  async revoke(accessToken: string): Promise<void> {
    try {
      const response = await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: accessToken }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[integrations] Google revoke failed for GOOGLE_DRIVE (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] Google revoke request failed for GOOGLE_DRIVE:", error);
    }
  },
};
