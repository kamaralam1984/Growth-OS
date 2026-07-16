import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Pipedrive — OAUTH2. Plain fetch against Pipedrive's oauth.pipedrive.com
 * host; token exchange/refresh use HTTP Basic auth (client_id:client_secret)
 * rather than form-encoded credentials, per Pipedrive's documented flow.
 *
 * Quirk: the token response's per-company `api_domain` isn't derivable from
 * the bearer token alone, so it's stashed in `metadata.apiDomain` for future
 * business-logic calls. The health check instead hits the generic
 * api.pipedrive.com host, which accepts the bearer token regardless of the
 * company-specific domain. Pipedrive has no documented public revoke API —
 * disconnect is local-only, same pattern as docusign.ts.
 */

const TOKEN_URL = "https://oauth.pipedrive.com/oauth/token";
const AUTH_URL = "https://oauth.pipedrive.com/oauth/authorize";

interface PipedriveTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  api_domain?: string;
  token_type?: string;
  error?: string;
}

interface PipedriveMeResponse {
  success?: boolean;
  data?: { name?: string; email?: string };
}

function clientId(): string {
  return process.env.PIPEDRIVE_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.PIPEDRIVE_CLIENT_SECRET ?? "";
}

function isConfigured(): boolean {
  return clientId().length > 0 && clientSecret().length > 0;
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
  const body = (await response.json().catch(() => ({}))) as PipedriveTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Pipedrive token endpoint rejected the request (HTTP ${response.status}): ${body.error ?? JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: body.scope ? body.scope.split(" ") : [],
    metadata: body.api_domain ? { apiDomain: body.api_domain } : undefined,
  };
}

export const pipedriveAdapter: IntegrationAdapter = {
  key: "PIPEDRIVE",
  name: "Pipedrive",
  category: "CRM_SYNC",
  authType: "OAUTH2",
  requiredEnvVars: ["PIPEDRIVE_CLIENT_ID", "PIPEDRIVE_CLIENT_SECRET"],

  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    return exchangeToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const refreshed = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch("https://api.pipedrive.com/v1/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Pipedrive users/me check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as PipedriveMeResponse;
    return { ok: true, detail: body.data?.email ?? body.data?.name };
  },

  async revoke(): Promise<void> {
    console.info(
      "[pipedrive] Pipedrive has no stable, publicly documented API to revoke an OAuth token server-side — local disconnect only. " +
        "The user can fully revoke this app's access from their Pipedrive Marketplace > Connected Apps settings.",
    );
  },
};
