import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Xero — OAUTH2. Xero's accounting API is tenant-scoped (a connected user
 * can have multiple orgs/tenants), so instead of a company-id-specific
 * health probe this adapter hits GET /connections — a real, generic,
 * tenant-independent endpoint that lists every tenant the token is
 * connected to. Business code that needs a specific tenantId later can call
 * the same endpoint; here we just stash the first tenant's id in metadata
 * as a convenience, not a guarantee of which tenant to operate on.
 *
 * NOTE on revoke(): Xero's revocation endpoint prefers a refresh token, but
 * connection-store.disconnectConnection() only ever calls
 * revoke(accessToken) — the stored refresh token isn't threaded through to
 * this call site (a store-level signature change, out of scope for this
 * adapter). We revoke with whatever access token we do have instead; Xero
 * access tokens are short-lived anyway, so this is a reasonable best effort.
 */

const AUTH_URL = "https://login.xero.com/identity/connect/authorize";
const TOKEN_URL = "https://identity.xero.com/connect/token";
const REVOKE_URL = "https://identity.xero.com/connect/revocation";
const CONNECTIONS_URL = "https://api.xero.com/connections";
const SCOPES = ["openid", "profile", "email", "accounting.transactions", "offline_access"];

interface XeroTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface XeroConnection {
  tenantId?: string;
  tenantType?: string;
  tenantName?: string;
}

function clientId(): string {
  return process.env.XERO_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.XERO_CLIENT_SECRET ?? "";
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64")}`;
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
  const body = (await response.json().catch(() => ({}))) as XeroTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Xero ${action} failed (HTTP ${response.status}): ${body.error_description ?? body.error ?? "unknown error"}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: SCOPES,
  };
}

export const xeroAdapter: IntegrationAdapter = {
  key: "XERO",
  name: "Xero",
  category: "ACCOUNTING",
  authType: "OAUTH2",
  requiredEnvVars: ["XERO_CLIENT_ID", "XERO_CLIENT_SECRET"],

  isConfigured(): boolean {
    return clientId().length > 0 && clientSecret().length > 0;
  },

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId(),
      redirect_uri: redirectUri,
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
      const response = await fetch(CONNECTIONS_URL, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return { ok: false, detail: `Xero connections check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
      }
      const connections = (await response.json().catch(() => null)) as XeroConnection[] | null;
      if (!Array.isArray(connections)) {
        return { ok: false, detail: "Xero connections response was not a parseable array." };
      }
      return { ok: true, detail: connections[0]?.tenantName };
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
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ token: accessToken }).toString(),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[integrations] Xero revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] Xero revoke request failed:", error);
    }
  },
};
