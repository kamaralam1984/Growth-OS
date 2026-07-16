import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Zoho CRM — OAUTH2. Plain fetch against Zoho's accounts.zoho.com host.
 * ZOHO_CLIENT_ID/ZOHO_CLIENT_SECRET are shared across every Zoho product
 * adapter in this codebase (a Zoho Books adapter reuses the same client) —
 * that's intentional, a single Zoho API console app covers all scopes.
 *
 * Quirks: (1) the token response's `api_domain` (e.g. https://www.zohoapis.com,
 * varies by data-center region) is the host every real CRM data call must use
 * — not derivable from the bearer token alone — so it's stashed in
 * `metadata.apiDomain`. (2) Zoho's bearer scheme is the non-standard
 * `Zoho-oauthtoken`, not `Bearer` — used for every authenticated call below.
 */

const ACCOUNTS_HOST = "https://accounts.zoho.com";
const AUTH_URL = `${ACCOUNTS_HOST}/oauth/v2/auth`;
const TOKEN_URL = `${ACCOUNTS_HOST}/oauth/v2/token`;
const USERINFO_URL = `${ACCOUNTS_HOST}/oauth/user/info`;
const REVOKE_URL = `${ACCOUNTS_HOST}/oauth/v2/token/revoke`;
const SCOPE = "ZohoCRM.modules.ALL";

interface ZohoTokenResponse {
  access_token: string;
  refresh_token?: string;
  api_domain?: string;
  token_type?: string;
  expires_in: number;
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

function isConfigured(): boolean {
  return clientId().length > 0 && clientSecret().length > 0;
}

async function exchangeToken(params: Record<string, string>): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as ZohoTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Zoho token endpoint rejected the request (HTTP ${response.status}): ${body.error ?? JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: [SCOPE],
    metadata: body.api_domain ? { apiDomain: body.api_domain } : undefined,
  };
}

export const zohoCrmAdapter: IntegrationAdapter = {
  key: "ZOHO_CRM",
  name: "Zoho CRM",
  category: "CRM_SYNC",
  authType: "OAUTH2",
  requiredEnvVars: ["ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET"],

  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId(),
      scope: SCOPE,
      redirect_uri: redirectUri,
      access_type: "offline",
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    return exchangeToken({
      grant_type: "authorization_code",
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      code,
    });
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const refreshed = await exchangeToken({
      grant_type: "refresh_token",
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: refreshToken,
    });
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(USERINFO_URL, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Zoho user-info check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as ZohoUserInfo;
    return { ok: true, detail: body.Email ?? body.Display_Name };
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
        console.error(`[integrations] Zoho CRM revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] Zoho CRM revoke request failed:", error);
    }
  },
};
