import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * QuickBooks Online — OAUTH2. Intuit's data API (invoices, customers, etc.)
 * needs a `realmId` (company id) that Intuit appends as a query param on the
 * OAuth redirect (`...&realmId=123...`), NOT in the token response body.
 * This adapter's handleCallback(code, redirectUri) signature only receives
 * the authorization code, not the full callback request URL/query string,
 * so realmId capture is out of scope here — it would need a signature
 * change (passing the full callback URL through) threaded from the
 * OAuth callback route down into this adapter. `metadata` is therefore left
 * without realmId; business code integrating QuickBooks' accounting API
 * later will need to capture and store realmId itself.
 */

const AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const SCOPES = ["com.intuit.quickbooks.accounting"];

interface QuickBooksTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface QuickBooksUserInfo {
  sub?: string;
  email?: string;
}

function clientId(): string {
  return process.env.QUICKBOOKS_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.QUICKBOOKS_CLIENT_SECRET ?? "";
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64")}`;
}

function isProduction(): boolean {
  return process.env.QUICKBOOKS_ENVIRONMENT === "production";
}

function userInfoUrl(): string {
  return isProduction()
    ? "https://accounts.platform.intuit.com/v1/openid_connect/userinfo"
    : "https://sandbox-accounts.platform.intuit.com/v1/openid_connect/userinfo";
}

async function exchangeToken(params: Record<string, string>, action: string): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as QuickBooksTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`QuickBooks ${action} failed (HTTP ${response.status}): ${body.error_description ?? body.error ?? "unknown error"}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: SCOPES,
    // realmId intentionally omitted — see file-level doc comment.
  };
}

export const quickbooksAdapter: IntegrationAdapter = {
  key: "QUICKBOOKS",
  name: "QuickBooks Online",
  category: "ACCOUNTING",
  authType: "OAUTH2",
  requiredEnvVars: ["QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET"],

  isConfigured(): boolean {
    return clientId().length > 0 && clientSecret().length > 0;
  },

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    return exchangeToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri }, "token exchange");
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const refreshed = await exchangeToken({ grant_type: "refresh_token", refresh_token: refreshToken }, "token refresh");
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    try {
      const response = await fetch(userInfoUrl(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return { ok: false, detail: `QuickBooks userinfo check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
      }
      const body = (await response.json().catch(() => ({}))) as QuickBooksUserInfo;
      return { ok: true, detail: body.email ?? body.sub };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },

  async revoke(accessToken: string): Promise<void> {
    try {
      const response = await fetch(REVOKE_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: accessToken }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[integrations] QuickBooks revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] QuickBooks revoke request failed:", error);
    }
  },
};
