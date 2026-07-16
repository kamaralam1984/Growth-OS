import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Zoho Books — OAUTH2. Deliberately reuses ZOHO_CLIENT_ID/ZOHO_CLIENT_SECRET
 * — the same env vars a sibling Zoho CRM adapter uses elsewhere in this
 * codebase — because both are the same Zoho API Console "app", just
 * requesting a different scope (ZohoBooks.fullaccess.all vs CRM scopes).
 * Do not invent separate ZOHO_BOOKS_* env vars.
 *
 * Zoho's token response includes `api_domain` (the per-datacenter API host,
 * e.g. www.zohoapis.com vs www.zohoapis.eu) — stored in metadata since
 * downstream Books API calls need it. Auth header for Zoho APIs is the
 * non-standard `Zoho-oauthtoken <token>` scheme, not `Bearer`.
 */

const AUTH_URL = "https://accounts.zoho.com/oauth/v2/auth";
const TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";
const REVOKE_URL = "https://accounts.zoho.com/oauth/v2/token/revoke";
const USERINFO_URL = "https://accounts.zoho.com/oauth/user/info";
const SCOPES = ["ZohoBooks.fullaccess.all"];

interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  api_domain?: string;
  token_type?: string;
  error?: string;
}

interface ZohoUserInfo {
  Email?: string;
  Display_Name?: string;
}

function clientId(): string {
  return process.env.ZOHO_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.ZOHO_CLIENT_SECRET ?? "";
}

async function exchangeToken(params: Record<string, string>, action: string): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: clientId(),
      client_secret: clientSecret(),
    }).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as ZohoTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Zoho Books ${action} failed (HTTP ${response.status}): ${body.error ?? "unknown error"}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: SCOPES,
    metadata: body.api_domain ? { apiDomain: body.api_domain } : undefined,
  };
}

export const zohoBooksAdapter: IntegrationAdapter = {
  key: "ZOHO_BOOKS",
  name: "Zoho Books",
  category: "ACCOUNTING",
  authType: "OAUTH2",
  requiredEnvVars: ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET"],

  isConfigured(): boolean {
    return clientId().length > 0 && clientSecret().length > 0;
  },

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId(),
      scope: SCOPES.join(","),
      redirect_uri: redirectUri,
      access_type: "offline",
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    return exchangeToken({ grant_type: "authorization_code", redirect_uri: redirectUri, code }, "token exchange");
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const refreshed = await exchangeToken({ grant_type: "refresh_token", refresh_token: refreshToken }, "token refresh");
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    try {
      const response = await fetch(USERINFO_URL, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return { ok: false, detail: `Zoho user info check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
      }
      const body = (await response.json().catch(() => ({}))) as ZohoUserInfo;
      return { ok: true, detail: body.Email ?? body.Display_Name };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },

  async revoke(accessToken: string): Promise<void> {
    try {
      const response = await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: accessToken }).toString(),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[integrations] Zoho Books revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] Zoho Books revoke request failed:", error);
    }
  },
};
