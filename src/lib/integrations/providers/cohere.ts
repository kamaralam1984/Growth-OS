import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Cohere — API_KEY auth, used for both RAG embeddings (embed-english-v3.0 /
 * embed-multilingual-v3.0) and reranking. Verified via Cohere's real
 * `/v1/models` list endpoint — cheap, read-only, no embedding cost incurred
 * just to connect.
 */

const API_BASE = "https://api.cohere.com";

interface CohereModelsResponse {
  models?: Array<{ name: string }>;
}

interface CohereErrorBody {
  message?: string;
}

export const cohereAdapter: IntegrationAdapter = {
  key: "COHERE",
  name: "Cohere",
  category: "AI_PROVIDER",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true;
  },

  credentialFields: [{ key: "apiKey", label: "API Key" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("A Cohere API key is required.");

    const response = await fetch(`${API_BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as CohereErrorBody;
      throw new Error(`Cohere rejected this key: ${body.message ?? `HTTP ${response.status}`}`);
    }

    return { accessToken: apiKey, scopes: [] };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/v1/models`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as CohereErrorBody;
      return { ok: false, detail: `Cohere models check failed (HTTP ${response.status}): ${body.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as CohereModelsResponse;
    return { ok: true, detail: body.models ? `${body.models.length} models available` : undefined };
  },

  async revoke(): Promise<void> {
    // Cohere has no API to revoke a specific key remotely — it must be deleted from the Cohere dashboard.
  },
};
