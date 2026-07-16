import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Ollama — API_KEY-shaped auth, but not really a credential: Ollama is a
 * self-hosted inference server used here for local/private-model routing in
 * a multi-provider setup, distinct from this app's primary Claude connection
 * (src/lib/ai/client.ts). There is no API key at all — the "credential" is
 * the base URL of the org's Ollama server, so it goes through the same
 * connectWithCredentials verification flow for consistency, but the field
 * is not marked secret and the stored "access token" is just the normalized
 * base URL.
 */

interface OllamaTagList {
  models?: Array<{ name: string }>;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export const ollamaAdapter: IntegrationAdapter = {
  key: "OLLAMA",
  name: "Ollama",
  category: "AI_PROVIDER",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org points at its own Ollama server
  },

  credentialFields: [{ key: "baseUrl", label: "Server URL", secret: false, placeholder: "http://localhost:11434" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const rawBaseUrl = credentials.baseUrl?.trim();
    if (!rawBaseUrl) throw new Error("An Ollama server URL is required.");
    const baseUrl = normalizeBaseUrl(rawBaseUrl);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/tags`);
    } catch (err) {
      throw new Error(`Could not reach Ollama server at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!response.ok) {
      throw new Error(`Ollama server rejected the request: HTTP ${response.status}`);
    }
    const body = (await response.json().catch(() => ({}))) as OllamaTagList;

    return {
      accessToken: baseUrl,
      scopes: [],
      metadata: { modelCount: body.models?.length ?? 0 },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const baseUrl = normalizeBaseUrl(accessToken);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/tags`);
    } catch (err) {
      return { ok: false, detail: `Could not reach Ollama server: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (!response.ok) {
      return { ok: false, detail: `Ollama server check failed (HTTP ${response.status})` };
    }
    const body = (await response.json().catch(() => ({}))) as OllamaTagList;
    return { ok: true, detail: `${body.models?.length ?? 0} models available` };
  },

  async revoke(): Promise<void> {
    // There is no key to revoke — Ollama has no auth at all. Disconnecting
    // here only ever removes our local record of the server URL.
  },
};
