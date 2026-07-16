import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Voyage AI — API_KEY auth, embeddings-only provider (src/lib/rag/embeddings.ts
 * reads this connection for RAG chunk/article/memory embedding generation).
 * Voyage has no dedicated "list models"/"whoami" endpoint, so verification
 * is a real, minimal embed call against a short fixed string — cheap, honest,
 * and proves the key actually works end-to-end rather than just "looks well-formed".
 */

const EMBED_URL = "https://api.voyageai.com/v1/embeddings";

interface VoyageEmbedResponse {
  data?: Array<{ embedding: number[] }>;
  error?: { message?: string };
}

export const voyageAdapter: IntegrationAdapter = {
  key: "VOYAGE_AI",
  name: "Voyage AI",
  category: "AI_PROVIDER",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true;
  },

  credentialFields: [{ key: "apiKey", label: "API Key" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("A Voyage AI API key is required.");

    const response = await fetch(EMBED_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: ["connection check"], model: "voyage-3" }),
    });
    const body = (await response.json().catch(() => ({}))) as VoyageEmbedResponse;
    if (!response.ok || !body.data?.[0]?.embedding) {
      throw new Error(`Voyage AI rejected this key: ${body.error?.message ?? `HTTP ${response.status}`}`);
    }

    return { accessToken: apiKey, scopes: [] };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(EMBED_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: ["health check"], model: "voyage-3" }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as VoyageEmbedResponse;
      return { ok: false, detail: `Voyage AI embed check failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}` };
    }
    return { ok: true };
  },

  async revoke(): Promise<void> {
    // Voyage AI has no API to revoke a specific key remotely — it must be deleted from the Voyage dashboard.
  },
};
