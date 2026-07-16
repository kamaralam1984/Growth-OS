import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * GitLab.com — OAUTH2 via a GitLab OAuth application. GITLAB_CLIENT_ID/SECRET
 * are dedicated to this integration (this codebase has no separate
 * "Sign in with GitLab" login client, so no naming collision to avoid here).
 * Unlike GitHub, GitLab issues real refresh tokens — refreshAccessToken()
 * is a genuine token-rotation call.
 */

const AUTH_URL = "https://gitlab.com/oauth/authorize";
const TOKEN_URL = "https://gitlab.com/oauth/token";
const REVOKE_URL = "https://gitlab.com/oauth/revoke";
const SCOPES = ["api", "read_user"];

interface GitLabTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GitLabUser {
  username: string;
  id: number;
}

function clientId(): string {
  return process.env.GITLAB_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.GITLAB_CLIENT_SECRET ?? "";
}

async function exchangeToken(params: Record<string, string>): Promise<OAuthTokenResult> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await response.json().catch(() => ({}))) as GitLabTokenResponse;
  if (!response.ok || !body.access_token) {
    throw new Error(`GitLab token endpoint rejected the request (HTTP ${response.status}): ${body.error_description ?? body.error ?? JSON.stringify(body)}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : undefined,
    scopes: body.scope ? body.scope.split(" ") : [],
  };
}

export const gitlabAdapter: IntegrationAdapter = {
  key: "GITLAB",
  name: "GitLab",
  category: "DEVELOPMENT",
  authType: "OAUTH2",
  requiredEnvVars: ["GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET"],

  isConfigured(): boolean {
    return Boolean(clientId()) && Boolean(clientSecret());
  },

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: redirectUri,
      response_type: "code",
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
    const response = await fetch("https://gitlab.com/api/v4/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `GitLab user check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as GitLabUser;
    return { ok: true, detail: body.username };
  },

  async revoke(accessToken: string): Promise<void> {
    try {
      const response = await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId(),
          client_secret: clientSecret(),
          token: accessToken,
        }),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error(`[integrations] GitLab revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] GitLab revoke request failed:", error);
    }
  },
};
