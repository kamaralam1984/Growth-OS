import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Jina Embeddings — API_KEY auth. Like Voyage, Jina has no dedicated
 * "whoami"/list-models endpoint, so verification is a real, minimal embed
 * call against a short fixed string.
 */

const EMBED_URL = "https://api.jina.ai/v1/embeddings";

interface JinaEmbedResponse {
  data?: Array<{ embedding: number[] }>;
  detail?: string;
}

export const jinaAdapter: IntegrationAdapter = {
  key: "JINA_EMBEDDINGS",
  name: "Jina Embeddings",
  category: "AI_PROVIDER",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true;
  },

  credentialFields: [{ key: "apiKey", label: "API Key" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("A Jina API key is required.");

    const response = await fetch(EMBED_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: ["connection check"], model: "jina-embeddings-v3" }),
    });
    const body = (await response.json().catch(() => ({}))) as JinaEmbedResponse;
    if (!response.ok || !body.data?.[0]?.embedding) {
      throw new Error(`Jina rejected this key: ${body.detail ?? `HTTP ${response.status}`}`);
    }

    return { accessToken: apiKey, scopes: [] };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(EMBED_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: ["health check"], model: "jina-embeddings-v3" }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as JinaEmbedResponse;
      return { ok: false, detail: `Jina embed check failed (HTTP ${response.status}): ${body.detail ?? "unknown error"}` };
    }
    return { ok: true };
  },

  async revoke(): Promise<void> {
    // Jina has no API to revoke a specific key remotely — it must be deleted from the Jina AI dashboard.
  },
};
