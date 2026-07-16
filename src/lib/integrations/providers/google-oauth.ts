import type { HealthCheckResult, IntegrationAdapter, IntegrationCategory, IntegrationProviderKey, OAuthTokenResult } from "../types";

/**
 * Gmail send + Google Calendar, both backed by the same Google Cloud OAuth
 * client (one project can request both scopes) but stored as two separate
 * IntegrationConnection rows — a user can connect Gmail without Calendar
 * and vice versa.
 *
 * Deliberately NOT the `googleapis` SDK — plain fetch against Google's
 * stable, well-known OAuth/API endpoints, matching this codebase's
 * lean-dependency style (see src/lib/outreach/email-provider.ts).
 *
 * GOOGLE_INTEGRATION_CLIENT_ID/SECRET are a SEPARATE OAuth client from
 * GOOGLE_CLIENT_ID/SECRET (src/auth.ts, NextAuth login "Sign in with
 * Google"). The login client only ever requests profile/email scopes and
 * must never be granted gmail.send/calendar — mixing the two would put
 * broad mailbox/calendar access on a token minted for authentication.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_INTEGRATION_CLIENT_ID) && Boolean(process.env.GOOGLE_INTEGRATION_CLIENT_SECRET);
}

async function exchangeToken(params: Record<string, string>): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`Google token endpoint rejected the request (HTTP ${response.status}): ${JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    scopes: body.scope ? body.scope.split(" ") : [],
  };
}

function makeGoogleAdapter(config: {
  key: IntegrationProviderKey;
  category: IntegrationCategory;
  name: string;
  scopes: string[];
  healthCheck: (accessToken: string) => Promise<HealthCheckResult>;
}): IntegrationAdapter {
  return {
    key: config.key,
    name: config.name,
    category: config.category,
    authType: "OAUTH2",
    requiredEnvVars: ["GOOGLE_INTEGRATION_CLIENT_ID", "GOOGLE_INTEGRATION_CLIENT_SECRET"],
    isConfigured,

    getAuthUrl(state: string, redirectUri: string): string {
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_INTEGRATION_CLIENT_ID ?? "",
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes.join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
      });
      return `${AUTH_URL}?${params.toString()}`;
    },

    async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
      return exchangeToken({
        code,
        client_id: process.env.GOOGLE_INTEGRATION_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_INTEGRATION_CLIENT_SECRET ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });
    },

    async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
      const refreshed = await exchangeToken({
        refresh_token: refreshToken,
        client_id: process.env.GOOGLE_INTEGRATION_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_INTEGRATION_CLIENT_SECRET ?? "",
        grant_type: "refresh_token",
      });
      return { ...refreshed, refreshToken: refreshed.refreshToken ?? refreshToken };
    },

    healthCheck: config.healthCheck,

    async revoke(accessToken: string): Promise<void> {
      try {
        const response = await fetch(REVOKE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: accessToken }),
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          console.error(`[integrations] Google revoke failed for ${config.key} (HTTP ${response.status}): ${body.slice(0, 200)}`);
        }
      } catch (error) {
        console.error(`[integrations] Google revoke request failed for ${config.key}:`, error);
      }
    },
  };
}

export const googleGmailAdapter: IntegrationAdapter = makeGoogleAdapter({
  key: "GOOGLE_GMAIL",
  category: "EMAIL",
  name: "Gmail",
  scopes: ["https://www.googleapis.com/auth/gmail.send"],
  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Gmail profile check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as { emailAddress?: string };
    return { ok: true, detail: body.emailAddress };
  },
});

export const googleCalendarAdapter: IntegrationAdapter = makeGoogleAdapter({
  key: "GOOGLE_CALENDAR",
  category: "CALENDAR",
  name: "Google Calendar",
  scopes: ["https://www.googleapis.com/auth/calendar"],
  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `Calendar list check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    return { ok: true };
  },
});
