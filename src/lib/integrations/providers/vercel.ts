import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Vercel — API_KEY auth. A personal/team API token pasted in by the org,
 * not a redirect OAuth flow (kept simple for this server-to-server use
 * case). The token itself is stored as the "access token". No platform-level
 * env var is required — any org supplies their own token.
 */

const API_BASE = "https://api.vercel.com";

interface VercelUserResponse {
  user?: { id?: string; username?: string; email?: string };
  error?: { message?: string };
}

export const vercelAdapter: IntegrationAdapter = {
  key: "VERCEL",
  name: "Vercel",
  category: "DEVELOPMENT",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true;
  },

  credentialFields: [{ key: "apiToken", label: "API Token", secret: true }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiToken = credentials.apiToken?.trim();
    if (!apiToken) throw new Error("A Vercel API token is required.");

    const response = await fetch(`${API_BASE}/v2/user`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const body = (await response.json().catch(() => ({}))) as VercelUserResponse;
    if (!response.ok) {
      throw new Error(`Vercel rejected this API token: ${body.error?.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: apiToken,
      scopes: [],
      metadata: { userId: body.user?.id ?? null, username: body.user?.username ?? null, email: body.user?.email ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/v2/user`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as VercelUserResponse;
      return { ok: false, detail: `Vercel user check failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as VercelUserResponse;
    return { ok: true, detail: body.user?.username ?? body.user?.email };
  },

  async revoke(): Promise<void> {
    // Vercel has no API to remotely revoke a personal/team API token — it
    // must be deleted from the Vercel account dashboard. Disconnecting here
    // only ever removes our local copy.
  },
};
