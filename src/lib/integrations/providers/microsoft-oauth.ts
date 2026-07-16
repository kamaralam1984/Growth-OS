import type { HealthCheckResult, IntegrationAdapter, IntegrationCategory, IntegrationProviderKey, OAuthTokenResult } from "../types";

/**
 * Microsoft Entra ID OAuth adapter — backs both microsoftOutlookAdapter and
 * microsoftCalendarAdapter below. Both share one Entra ID app registration
 * (MICROSOFT_INTEGRATION_CLIENT_ID/SECRET) but are stored as separate
 * IntegrationConnection rows with different Graph scopes, so a user can
 * connect Outlook without Calendar or vice versa.
 *
 * This is a SEPARATE app registration from MICROSOFT_ENTRA_ID_CLIENT_ID/
 * MICROSOFT_ENTRA_ID_CLIENT_SECRET (src/auth.ts), which is used only for
 * "Sign in with Microsoft" and requests basic sign-in scopes. This one
 * requests Microsoft Graph Mail.Send / Calendars.ReadWrite permissions plus
 * offline_access, and must never be reused for login.
 *
 * Microsoft's v2 identity platform has no public server-side revocation API
 * for confidential-client refresh/access tokens (unlike Google), so revoke()
 * is a documented no-op — see revoke() below.
 */

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

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

async function exchangeToken(grantParams: Record<string, string>, fallbackScopes: string[]): Promise<OAuthTokenResult> {
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
    scopes: data.scope ? data.scope.split(" ") : fallbackScopes,
  };
}

function createMicrosoftAdapter(options: {
  key: IntegrationProviderKey;
  category: IntegrationCategory;
  name: string;
  scopes: string[];
  healthCheckPath: string;
}): IntegrationAdapter {
  const { key, category, name, scopes, healthCheckPath } = options;

  return {
    key,
    name,
    category,
    authType: "OAUTH2",
    requiredEnvVars: ["MICROSOFT_INTEGRATION_CLIENT_ID", "MICROSOFT_INTEGRATION_CLIENT_SECRET"],

    isConfigured,

    getAuthUrl(state: string, redirectUri: string): string {
      const params = new URLSearchParams({
        client_id: process.env.MICROSOFT_INTEGRATION_CLIENT_ID ?? "",
        redirect_uri: redirectUri,
        response_type: "code",
        response_mode: "query",
        scope: scopes.join(" "),
        state,
      });
      return `${authorizeUrl()}?${params.toString()}`;
    },

    async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
      return exchangeToken(
        {
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          scope: scopes.join(" "),
        },
        scopes,
      );
    },

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
      return exchangeToken(
        {
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: scopes.join(" "),
        },
        scopes,
      );
    },

    async healthCheck(accessToken: string): Promise<HealthCheckResult> {
      const response = await fetch(`${GRAPH_BASE}${healthCheckPath}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return { ok: false, detail: `Microsoft Graph returned ${response.status}` };

      const data = (await response.json()) as { mail?: string; userPrincipalName?: string; name?: string };
      return { ok: true, detail: data.mail ?? data.userPrincipalName ?? data.name ?? undefined };
    },

    async revoke(): Promise<void> {
      console.error(
        `[integrations] ${name}: Microsoft's identity platform provides no server-initiated revocation API for confidential-client ` +
          "refresh/access tokens (unlike Google). The local connection will still be removed; to fully revoke provider-side access " +
          "the user must remove this app's access at https://myaccount.microsoft.com/.",
      );
    },
  };
}

export const microsoftOutlookAdapter: IntegrationAdapter = createMicrosoftAdapter({
  key: "MICROSOFT_OUTLOOK",
  category: "EMAIL",
  name: "Microsoft Outlook",
  scopes: ["Mail.Send", "offline_access"],
  healthCheckPath: "/me",
});

export const microsoftCalendarAdapter: IntegrationAdapter = createMicrosoftAdapter({
  key: "MICROSOFT_CALENDAR",
  category: "CALENDAR",
  name: "Microsoft Calendar",
  scopes: ["Calendars.ReadWrite", "offline_access"],
  healthCheckPath: "/me/calendar",
});
