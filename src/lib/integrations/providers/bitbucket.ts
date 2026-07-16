import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Bitbucket Cloud — OAUTH2 via a Bitbucket OAuth consumer. BITBUCKET_CLIENT_ID/
 * SECRET are dedicated to this integration. Quirk: Bitbucket OAuth consumers
 * configure their callback URL in the consumer's own settings rather than
 * accepting an arbitrary redirect_uri per-request — we still pass redirect_uri
 * on the authorize step for consistency with the other adapters, but
 * Bitbucket ignores it in favor of the consumer's configured callback URL.
 * No documented public revoke endpoint exists for OAuth consumer tokens, so
 * revoke() is a no-op (mirrors docusign.ts) — users revoke access from their
 * Bitbucket workspace's OAuth settings.
 */

const AUTH_URL = "https://bitbucket.org/site/oauth2/authorize";
const TOKEN_URL = "https://bitbucket.org/site/oauth2/access_token";

interface BitbucketTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scopes?: string;
  error?: string;
  error_description?: string;
}

interface BitbucketUser {
  username: string;
  uuid: string;
}

function clientId(): string {
  return process.env.BITBUCKET_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.BITBUCKET_CLIENT_SECRET ?? "";
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64")}`;
}

async function exchangeToken(params: Record<string, string>): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as BitbucketTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Bitbucket token endpoint rejected the request (HTTP ${response.status}): ${body.error_description ?? body.error ?? JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : undefined,
    scopes: body.scopes ? body.scopes.split(" ") : [],
  };
}

export const bitbucketAdapter: IntegrationAdapter = {
  key: "BITBUCKET",
  name: "Bitbucket",
  category: "DEVELOPMENT",
  authType: "OAUTH2",
  requiredEnvVars: ["BITBUCKET_CLIENT_ID", "BITBUCKET_CLIENT_SECRET"],

  isConfigured(): boolean {
    return Boolean(clientId()) && Boolean(clientSecret());
  },

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: clientId(),
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(code: string): Promise<OAuthTokenResult> {
    return exchangeToken({ grant_type: "authorization_code", code });
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const refreshed = await exchangeToken({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch("https://api.bitbucket.org/2.0/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Bitbucket user check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as BitbucketUser;
    return { ok: true, detail: body.username };
  },

  async revoke(): Promise<void> {
    console.info(
      "[bitbucket] Bitbucket Cloud has no documented public REST endpoint to revoke an OAuth consumer's issued token remotely. The user can revoke this app's access from their Bitbucket workspace settings (Settings > OAuth consumers / Access management).",
    );
  },
};
