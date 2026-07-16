import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * GitHub — OAUTH2 via a classic GitHub OAuth App (not a GitHub App/JWT flow).
 * GITHUB_INTEGRATION_CLIENT_ID/SECRET are a SEPARATE OAuth client from
 * GITHUB_CLIENT_ID/SECRET (src/auth.ts, NextAuth "Sign in with GitHub") —
 * the login client must never be granted `repo` scope. Classic OAuth Apps of
 * this type don't issue refresh tokens; access tokens don't expire, so
 * refreshAccessToken() throws rather than fabricating a refresh.
 */

const AUTH_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const SCOPES = ["repo", "read:user"];

interface GitHubTokenResponse {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  login: string;
  id: number;
}

function clientId(): string {
  return process.env.GITHUB_INTEGRATION_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.GITHUB_INTEGRATION_CLIENT_SECRET ?? "";
}

export const githubAdapter: IntegrationAdapter = {
  key: "GITHUB",
  name: "GitHub",
  category: "DEVELOPMENT",
  authType: "OAUTH2",
  requiredEnvVars: ["GITHUB_INTEGRATION_CLIENT_ID", "GITHUB_INTEGRATION_CLIENT_SECRET"],

  isConfigured(): boolean {
    return Boolean(clientId()) && Boolean(clientSecret());
  },

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
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId(),
        client_secret: clientSecret(),
        code,
        redirect_uri: redirectUri,
      }),
    });
    const body = (await response.json().catch(() => ({}))) as GitHubTokenResponse;
    if (!response.ok || !body.access_token) {
      throw new Error(`GitHub token endpoint rejected the request (HTTP ${response.status}): ${body.error_description ?? body.error ?? JSON.stringify(body)}`);
    }
    return {
      accessToken: body.access_token,
      scopes: body.scope ? body.scope.split(",").map((s) => s.trim()).filter(Boolean) : [],
    };
  },

  async refreshAccessToken(): Promise<OAuthTokenResult> {
    throw new Error("GitHub access tokens don't expire for this OAuth app type; re-authorize instead.");
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { ok: false, detail: `GitHub user check failed (HTTP ${response.status}): ${body.slice(0, 200)}` };
    }
    const body = (await response.json().catch(() => ({}))) as GitHubUser;
    return { ok: true, detail: body.login };
  },

  async revoke(accessToken: string): Promise<void> {
    try {
      const response = await fetch(`https://api.github.com/applications/${clientId()}/grant`, {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64")}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ access_token: accessToken }),
      });
      if (!response.ok && response.status !== 204) {
        const body = await response.text().catch(() => "");
        console.error(`[integrations] GitHub revoke failed (HTTP ${response.status}): ${body.slice(0, 200)}`);
      }
    } catch (error) {
      console.error("[integrations] GitHub revoke request failed:", error);
    }
  },
};
