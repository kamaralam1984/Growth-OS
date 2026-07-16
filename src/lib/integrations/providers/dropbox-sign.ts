import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

// Verify these endpoints against Dropbox Sign's current developer docs
// (developers.hellosign.com) before relying on this in production — written
// from stable, long-documented Dropbox Sign/HelloSign OAuth conventions
// without live doc access in this session.

const AUTH_URL = "https://app.hellosign.com/oauth/authorize";
const TOKEN_URL = "https://app.hellosign.com/oauth/token";
const ACCOUNT_URL = "https://api.hellosign.com/v3/account";

const SCOPES = ["basic_account_info", "request_signature"];

interface DropboxSignTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  state?: string;
  error?: string;
  error_description?: string;
}

interface DropboxSignAccountResponse {
  account?: {
    email_address?: string;
  };
}

function isConfigured(): boolean {
  return Boolean(process.env.DROPBOX_SIGN_CLIENT_ID) && Boolean(process.env.DROPBOX_SIGN_CLIENT_SECRET);
}

async function exchangeToken(params: Record<string, string>): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as DropboxSignTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Dropbox Sign token endpoint rejected the request (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: SCOPES,
  };
}

export const dropboxSignAdapter: IntegrationAdapter = {
  key: "DROPBOX_SIGN",
  name: "Dropbox Sign",
  category: "SIGNATURE",
  authType: "OAUTH2",
  requiredEnvVars: ["DROPBOX_SIGN_CLIENT_ID", "DROPBOX_SIGN_CLIENT_SECRET"],
  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.DROPBOX_SIGN_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      scope: SCOPES.join(","),
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    return exchangeToken({
      grant_type: "authorization_code",
      code,
      client_id: process.env.DROPBOX_SIGN_CLIENT_ID ?? "",
      client_secret: process.env.DROPBOX_SIGN_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
    });
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const refreshed = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.DROPBOX_SIGN_CLIENT_ID ?? "",
      client_secret: process.env.DROPBOX_SIGN_CLIENT_SECRET ?? "",
    });
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(ACCOUNT_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Dropbox Sign account check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as DropboxSignAccountResponse;
    if (!body.account) {
      return { ok: false, detail: "Dropbox Sign account check returned an unparseable response" };
    }
    return { ok: true, detail: body.account.email_address };
  },

  async revoke(): Promise<void> {
    console.info(
      "[integrations] Dropbox Sign has no documented public server-side OAuth revoke endpoint; the local connection is being removed, but to fully revoke access the user must remove this app from their Dropbox Sign account's connected apps settings.",
    );
  },
};
