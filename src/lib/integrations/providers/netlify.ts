import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Netlify — API_KEY auth. A personal access token pasted in by the org,
 * stored as the "access token". No platform-level env var required — any
 * org supplies their own token.
 */

const API_BASE = "https://api.netlify.com/api/v1";

interface NetlifyUserResponse {
  id?: string;
  slug?: string;
  email?: string;
  message?: string;
}

export const netlifyAdapter: IntegrationAdapter = {
  key: "NETLIFY",
  name: "Netlify",
  category: "DEVELOPMENT",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true;
  },

  credentialFields: [{ key: "apiToken", label: "Personal Access Token", secret: true }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiToken = credentials.apiToken?.trim();
    if (!apiToken) throw new Error("A Netlify personal access token is required.");

    const response = await fetch(`${API_BASE}/user`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const body = (await response.json().catch(() => ({}))) as NetlifyUserResponse;
    if (!response.ok) {
      throw new Error(`Netlify rejected this personal access token: ${body.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: apiToken,
      scopes: [],
      metadata: { userId: body.id ?? null, slug: body.slug ?? null, email: body.email ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/user`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as NetlifyUserResponse;
      return { ok: false, detail: `Netlify user check failed (HTTP ${response.status}): ${body.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as NetlifyUserResponse;
    return { ok: true, detail: body.email ?? body.slug };
  },

  async revoke(): Promise<void> {
    // Netlify has no API to remotely revoke a personal access token — it
    // must be deleted from the Netlify user settings (Applications). Only
    // our local copy is removed on disconnect.
  },
};
