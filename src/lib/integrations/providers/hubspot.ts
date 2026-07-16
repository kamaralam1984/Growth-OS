import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * HubSpot CRM — OAUTH2. Plain fetch against HubSpot's stable OAuth v1
 * endpoints (api.hubapi.com), no per-portal host to discover: every HubSpot
 * API call, including the health check, goes through the same generic host
 * regardless of which "hub" (portal) the token belongs to.
 *
 * Quirk: the real HubSpot revoke API (DELETE /oauth/v1/refresh-tokens/{token})
 * operates on the *refresh* token, but the shared IntegrationAdapter#revoke
 * signature only ever receives the access token — so revoke() here is a
 * documented no-op rather than a fabricated call with the wrong token.
 */

const AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";
const SCOPES = ["crm.objects.contacts.read", "crm.objects.deals.read"];

interface HubSpotTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
}

interface HubSpotErrorBody {
  message?: string;
  category?: string;
}

interface HubSpotAccessTokenInfo {
  hub_id?: number;
  user?: string;
  scopes?: string[];
}

function clientId(): string {
  return process.env.HUBSPOT_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.HUBSPOT_CLIENT_SECRET ?? "";
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
  const body = (await response.json().catch(() => ({}))) as HubSpotTokenResponse & HubSpotErrorBody;
  if (!response.ok || !body.access_token) {
    throw new Error(`HubSpot token endpoint rejected the request (HTTP ${response.status}): ${body.message ?? JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: SCOPES,
  };
}

export const hubspotAdapter: IntegrationAdapter = {
  key: "HUBSPOT",
  name: "HubSpot",
  category: "CRM_SYNC",
  authType: "OAUTH2",
  requiredEnvVars: ["HUBSPOT_CLIENT_ID", "HUBSPOT_CLIENT_SECRET"],

  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri,
      scope: SCOPES.join(" "),
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
    const response = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `HubSpot token introspection failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as HubSpotAccessTokenInfo;
    return { ok: true, detail: body.hub_id ? `Hub ${body.hub_id}` : body.user };
  },

  async revoke(): Promise<void> {
    console.info(
      "[hubspot] HubSpot's refresh-token revoke endpoint (DELETE /oauth/v1/refresh-tokens/{refreshToken}) needs the refresh token, " +
        "which this adapter's revoke(accessToken) is never given — local disconnect only. The access token itself also expires " +
        "naturally within HubSpot's short TTL. Full revocation can be done from the portal's Connected Apps settings.",
    );
  },
};
