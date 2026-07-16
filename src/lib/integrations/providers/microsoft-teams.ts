import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Microsoft Teams — reuses the existing MICROSOFT_INTEGRATION_CLIENT_ID/
 * SECRET/TENANT_ID Entra ID app (same one backing Outlook/Calendar in
 * microsoft-oauth.ts) with Teams-specific Graph scopes. The OAuth plumbing
 * is duplicated inline here rather than imported, since microsoft-oauth.ts's
 * factory function isn't exported.
 *
 * Like the other Microsoft adapters, revoke() is a documented no-op: the v2
 * identity platform has no server-initiated revocation API for
 * confidential-client tokens.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = [
  "https://graph.microsoft.com/Chat.ReadWrite",
  "https://graph.microsoft.com/ChannelMessage.Send",
  "offline_access",
];

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

function tenant(): string {
  return process.env.MICROSOFT_INTEGRATION_TENANT_ID || "common";
}

function authorizeUrl(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`;
}

function tokenUrl(): string {
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`;
}

function isConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_INTEGRATION_CLIENT_ID) && Boolean(process.env.MICROSOFT_INTEGRATION_CLIENT_SECRET);
}

async function exchangeToken(grantParams: Record<string, string>): Promise<OAuthTokenResult> {
  const body = new URLSearchParams({
    client_id: process.env.MICROSOFT_INTEGRATION_CLIENT_ID ?? "",
    client_secret: process.env.MICROSOFT_INTEGRATION_CLIENT_SECRET ?? "",
    ...grantParams,
  });

  const response = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Microsoft OAuth token request failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as MicrosoftTokenResponse;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scopes: data.scope ? data.scope.split(" ") : SCOPES,
  };
}

export const microsoftTeamsAdapter: IntegrationAdapter = {
  key: "MICROSOFT_TEAMS",
  name: "Microsoft Teams",
  category: "COMMUNICATION",
  authType: "OAUTH2",
  requiredEnvVars: ["MICROSOFT_INTEGRATION_CLIENT_ID", "MICROSOFT_INTEGRATION_CLIENT_SECRET"],
  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: process.env.MICROSOFT_INTEGRATION_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: SCOPES.join(" "),
      state,
    });
    return `${authorizeUrl()}?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    return exchangeToken({
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES.join(" "),
    });
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    return exchangeToken({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES.join(" "),
    });
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${GRAPH_BASE}/me/joinedTeams`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Microsoft Graph joinedTeams check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const data = (await response.json().catch(() => ({}))) as { value?: Array<{ displayName?: string }> };
    return { ok: true, detail: data.value && data.value.length > 0 ? `${data.value.length} team(s)` : "0 teams" };
  },

  async revoke(): Promise<void> {
    console.error(
      "[integrations] Microsoft Teams: Microsoft's identity platform provides no server-initiated revocation API for " +
        "confidential-client refresh/access tokens. The local connection will still be removed; to fully revoke " +
        "provider-side access the user must remove this app's access at https://myaccount.microsoft.com/.",
    );
  },
};
