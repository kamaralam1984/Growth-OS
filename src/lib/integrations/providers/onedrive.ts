import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * OneDrive — OAUTH2, reusing the SAME Microsoft Entra ID app registration as
 * Outlook/Microsoft Calendar (MICROSOFT_INTEGRATION_CLIENT_ID/SECRET, same
 * tenant-aware `common`/MICROSOFT_INTEGRATION_TENANT_ID host pattern), just
 * with Files.ReadWrite scope. microsoft-oauth.ts's createMicrosoftAdapter
 * factory is not exported, so the small amount of OAuth plumbing is
 * duplicated here rather than importing an unexported symbol.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = ["Files.ReadWrite", "offline_access"];

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

export const onedriveAdapter: IntegrationAdapter = {
  key: "ONEDRIVE",
  name: "OneDrive",
  category: "STORAGE",
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
    const response = await fetch(`${GRAPH_BASE}/me/drive`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return { ok: false, detail: `Microsoft Graph drive check returned ${response.status}` };

    const data = (await response.json().catch(() => ({}))) as { driveType?: string; owner?: { user?: { displayName?: string } } };
    return { ok: true, detail: data.owner?.user?.displayName ?? data.driveType };
  },

  async revoke(): Promise<void> {
    console.error(
      "[integrations] OneDrive: Microsoft's identity platform provides no server-initiated revocation API for confidential-client " +
        "refresh/access tokens (unlike Google). The local connection will still be removed; to fully revoke provider-side access " +
        "the user must remove this app's access at https://myaccount.microsoft.com/.",
    );
  },
};
