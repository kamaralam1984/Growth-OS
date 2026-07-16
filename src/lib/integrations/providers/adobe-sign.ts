import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * VERIFY THESE ENDPOINTS: this file was written from stable, long-documented
 * Adobe Sign OAuth conventions (shard-based hosts, standard authorization-code
 * grant) without live access to Adobe's docs in this session. Confirm against
 * Adobe Acrobat Sign's current developer docs
 * (developer.adobe.com/document-services/docs/acrobat-sign) before relying on
 * this in production.
 *
 * Adobe Sign's API/auth is partitioned into regional "shards" (na1, na2, na3,
 * eu1, eu2, au1, ...). Both the authorization host and the API host are
 * shard-specific, and ADOBE_SIGN_SHARD picks which one this deployment talks
 * to. A production-grade version would call Adobe's discovery/base-URI
 * endpoint after token exchange to confirm the account's real shard (it can
 * differ from the one assumed here); this implementation covers the common
 * single-configured-shard case and persists the shard it used in the token
 * result's metadata so later calls for the same connection stay consistent.
 */

const SCOPES = ["user_login:self", "agreement_send:account", "agreement_write:account"];

interface AdobeSignTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

function getShard(): string {
  return process.env.ADOBE_SIGN_SHARD || "na1";
}

function getAuthHost(shard: string): string {
  return `https://secure.${shard}.adobesign.com`;
}

function getApiHost(shard: string): string {
  return `https://api.${shard}.adobesign.com`;
}

function isConfigured(): boolean {
  return Boolean(process.env.ADOBE_SIGN_CLIENT_ID) && Boolean(process.env.ADOBE_SIGN_CLIENT_SECRET);
}

async function exchangeToken(apiHost: string, shard: string, params: Record<string, string>): Promise<OAuthTokenResult> {
  const response = await fetch(`${apiHost}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as AdobeSignTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Adobe Sign token endpoint rejected the request (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : undefined,
    scopes: SCOPES,
    metadata: { shard },
  };
}

export const adobeSignAdapter: IntegrationAdapter = {
  key: "ADOBE_SIGN",
  name: "Adobe Acrobat Sign",
  category: "SIGNATURE",
  authType: "OAUTH2",
  requiredEnvVars: ["ADOBE_SIGN_CLIENT_ID", "ADOBE_SIGN_CLIENT_SECRET"],
  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const shard = getShard();
    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      response_type: "code",
      client_id: process.env.ADOBE_SIGN_CLIENT_ID ?? "",
      scope: SCOPES.join(" "),
      state,
    });
    return `${getAuthHost(shard)}/public/oauth/v2?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    const shard = getShard();
    return exchangeToken(getApiHost(shard), shard, {
      grant_type: "authorization_code",
      code,
      client_id: process.env.ADOBE_SIGN_CLIENT_ID ?? "",
      client_secret: process.env.ADOBE_SIGN_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
    });
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const shard = getShard();
    const refreshed = await exchangeToken(getApiHost(shard), shard, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.ADOBE_SIGN_CLIENT_ID ?? "",
      client_secret: process.env.ADOBE_SIGN_CLIENT_SECRET ?? "",
    });
    return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const shard = getShard();
    const response = await fetch(`${getApiHost(shard)}/api/rest/v6/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Adobe Sign user check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as { email?: string };
    return { ok: true, detail: body.email };
  },

  async revoke(accessToken: string): Promise<void> {
    const shard = getShard();
    try {
      const response = await fetch(`${getApiHost(shard)}/oauth/v2/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: accessToken,
          client_id: process.env.ADOBE_SIGN_CLIENT_ID ?? "",
          client_secret: process.env.ADOBE_SIGN_CLIENT_SECRET ?? "",
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[integrations] Adobe Sign revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] Adobe Sign revoke request failed:", error);
    }
  },
};
