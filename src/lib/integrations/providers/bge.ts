import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * BGE (BAAI General Embeddings) — self-hosted, no API key. The "credential"
 * is the base URL of a real Hugging Face Text Embeddings Inference (TEI)
 * server running a BGE model (e.g. BAAI/bge-large-en-v1.5), the standard way
 * to self-host BGE in production. Mirrors the Ollama adapter's
 * base-URL-as-credential pattern.
 */

interface TeiEmbedResponse {
  error?: string;
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export const bgeAdapter: IntegrationAdapter = {
  key: "BGE",
  name: "BGE (self-hosted)",
  category: "AI_PROVIDER",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true;
  },

  credentialFields: [{ key: "baseUrl", label: "Server URL", secret: false, placeholder: "http://localhost:8080" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const baseUrlRaw = credentials.baseUrl?.trim();
    if (!baseUrlRaw) throw new Error("A BGE server URL is required.");
    const baseUrl = normalizeBaseUrl(baseUrlRaw);

    const response = await fetch(`${baseUrl}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: "connection check" }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as TeiEmbedResponse;
      throw new Error(`BGE server at ${baseUrl} rejected the request: ${body.error ?? `HTTP ${response.status}`}`);
    }

    return { accessToken: baseUrl, scopes: [] };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    try {
      const response = await fetch(`${accessToken}/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: "health check" }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as TeiEmbedResponse;
        return { ok: false, detail: `BGE server embed check failed (HTTP ${response.status}): ${body.error ?? "unknown error"}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : "BGE server unreachable" };
    }
  },

  async revoke(): Promise<void> {
    // No remote credential to revoke — this is a self-hosted server URL, not a secret key.
  },
};
