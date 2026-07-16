import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Cloudflare — API_KEY auth. General DNS/zones/workers integration using a
 * scoped Cloudflare API Token, pasted in by the org. Distinct from the
 * separate CLOUDFLARE_R2 storage adapter (S3-compatible access keys) — do
 * not confuse the two. Verification uses Cloudflare's purpose-built
 * token-verification endpoint; every Cloudflare API response wraps its
 * payload in `{success, errors, messages, result}`, so `success: true` in
 * the body — not just HTTP 200 — is what actually proves the token is valid.
 */

const VERIFY_URL = "https://api.cloudflare.com/client/v4/user/tokens/verify";

interface CloudflareEnvelope<T> {
  success: boolean;
  errors?: { code?: number; message?: string }[];
  messages?: { code?: number; message?: string }[];
  result?: T;
}

interface CloudflareTokenVerifyResult {
  id?: string;
  status?: string;
}

export const cloudflareAdapter: IntegrationAdapter = {
  key: "CLOUDFLARE",
  name: "Cloudflare",
  category: "DEVELOPMENT",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true;
  },

  credentialFields: [{ key: "apiToken", label: "API Token", secret: true }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiToken = credentials.apiToken?.trim();
    if (!apiToken) throw new Error("A Cloudflare API token is required.");

    const response = await fetch(VERIFY_URL, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const body = (await response.json().catch(() => ({}))) as CloudflareEnvelope<CloudflareTokenVerifyResult>;
    if (!response.ok || !body.success) {
      throw new Error(`Cloudflare rejected this API token: ${body.errors?.[0]?.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: apiToken,
      scopes: [],
      metadata: { tokenId: body.result?.id ?? null, status: body.result?.status ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(VERIFY_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const body = (await response.json().catch(() => ({}))) as CloudflareEnvelope<CloudflareTokenVerifyResult>;
    if (!response.ok || !body.success) {
      return { ok: false, detail: `Cloudflare token verify failed (HTTP ${response.status}): ${body.errors?.[0]?.message ?? "unknown error"}` };
    }
    return { ok: true, detail: body.result?.status };
  },

  async revoke(): Promise<void> {
    // Deliberately not calling Cloudflare's token-delete endpoint here: this
    // adapter only ever received a token the org created and scoped
    // themselves, and DELETE /user/tokens/:id needs the token's own ID
    // rather than its secret value; the org can revoke it directly from
    // their Cloudflare dashboard (My Profile > API Tokens). Only our local
    // copy is removed on disconnect.
  },
};
