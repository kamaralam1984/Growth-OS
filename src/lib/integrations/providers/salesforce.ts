import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Salesforce — OAUTH2. Plain fetch against Salesforce's standard login host
 * (login.salesforce.com); this codebase does not distinguish sandbox vs.
 * production orgs, matching the other adapters' single-host conventions.
 *
 * Quirk: every org gets its own API host (`instance_url`, e.g.
 * https://yourorg.my.salesforce.com) returned alongside the token — real
 * data calls need it, so it's stashed in `metadata.instanceUrl`. The health
 * check instead uses Salesforce's host-independent `/services/oauth2/userinfo`
 * endpoint, which accepts the bearer token regardless of instance_url.
 */

const AUTH_HOST = "https://login.salesforce.com";
const AUTH_URL = `${AUTH_HOST}/services/oauth2/authorize`;
const TOKEN_URL = `${AUTH_HOST}/services/oauth2/token`;
const USERINFO_URL = `${AUTH_HOST}/services/oauth2/userinfo`;
const REVOKE_URL = `${AUTH_HOST}/services/oauth2/revoke`;

interface SalesforceTokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url?: string;
  id?: string;
  token_type?: string;
  issued_at?: string;
  signature?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface SalesforceUserInfo {
  sub?: string;
  email?: string;
  name?: string;
}

function clientId(): string {
  return process.env.SALESFORCE_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.SALESFORCE_CLIENT_SECRET ?? "";
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
  const body = (await response.json().catch(() => ({}))) as SalesforceTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Salesforce token endpoint rejected the request (HTTP ${response.status}): ${body.error_description ?? JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    scopes: body.scope ? body.scope.split(" ") : [],
    metadata: body.instance_url ? { instanceUrl: body.instance_url } : undefined,
  };
}

export const salesforceAdapter: IntegrationAdapter = {
  key: "SALESFORCE",
  name: "Salesforce",
  category: "CRM_SYNC",
  authType: "OAUTH2",
  requiredEnvVars: ["SALESFORCE_CLIENT_ID", "SALESFORCE_CLIENT_SECRET"],

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
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Salesforce userinfo check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as SalesforceUserInfo;
    return { ok: true, detail: body.email ?? body.name ?? body.sub };
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
        console.error(`[integrations] Salesforce revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] Salesforce revoke request failed:", error);
    }
  },
};
