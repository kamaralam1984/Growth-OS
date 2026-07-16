import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Slack — OAuth v2 workspace app install (full `chat:write`/`channels:read`
 * bot scopes), distinct from the pre-existing user-pasted Incoming Webhook
 * URL feature in src/lib/notifications.ts.
 *
 * Quirk: Slack's `oauth.v2.access`, `auth.test`, and `auth.revoke` endpoints
 * ALWAYS return HTTP 200, even on failure — the real success/failure signal
 * is the `ok` boolean in the JSON body, which must be checked explicitly.
 * Standard bot tokens (`xoxb-...`) never expire, so no refresh_token/expires_in.
 */

const AUTH_URL = "https://slack.com/oauth/v2/authorize";
const TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const BOT_SCOPES = "chat:write,channels:read";

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  scope?: string;
  team?: { id?: string; name?: string };
  authed_user?: { id?: string };
}

interface SlackAuthTestResponse {
  ok: boolean;
  error?: string;
  team?: string;
  user?: string;
}

function isConfigured(): boolean {
  return Boolean(process.env.SLACK_CLIENT_ID) && Boolean(process.env.SLACK_CLIENT_SECRET);
}

export const slackAdapter: IntegrationAdapter = {
  key: "SLACK",
  name: "Slack",
  category: "COMMUNICATION",
  authType: "OAUTH2",
  requiredEnvVars: ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
  isConfigured,

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID ?? "",
      scope: BOT_SCOPES,
      redirect_uri: redirectUri,
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async handleCallback(code: string, redirectUri: string): Promise<OAuthTokenResult> {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID ?? "",
        client_secret: process.env.SLACK_CLIENT_SECRET ?? "",
        code,
        redirect_uri: redirectUri,
      }),
    });
    const body = (await response.json().catch(() => ({ ok: false }))) as SlackOAuthResponse;
    if (!body.ok || !body.access_token) {
      throw new Error(`Slack rejected the OAuth exchange: ${body.error ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: body.access_token,
      scopes: body.scope ? body.scope.split(",") : [],
      metadata: {
        teamId: body.team?.id ?? null,
        teamName: body.team?.name ?? null,
        authedUserId: body.authed_user?.id ?? null,
      },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await response.json().catch(() => ({ ok: false }))) as SlackAuthTestResponse;
    if (!body.ok) {
      return { ok: false, detail: `Slack auth.test failed: ${body.error ?? `HTTP ${response.status}`}` };
    }
    return { ok: true, detail: body.team ? `${body.user ?? ""}@${body.team}` : body.user };
  },

  async revoke(accessToken: string): Promise<void> {
    try {
      const response = await fetch("https://slack.com/api/auth.revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = (await response.json().catch(() => ({ ok: false }))) as { ok: boolean; error?: string };
      if (!body.ok) {
        console.error(`[integrations] Slack revoke failed: ${body.error ?? `HTTP ${response.status}`}`);
      }
    } catch (error) {
      console.error("[integrations] Slack revoke request failed:", error);
    }
  },
};
