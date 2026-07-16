import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Groq — API_KEY auth. One of several optional AI_PROVIDER connections, used
 * here for ultra-fast inference routing (low-latency generation) in a
 * multi-provider setup; distinct from this app's primary Claude connection
 * (src/lib/ai/client.ts). Groq's API is OpenAI-compatible, so verification
 * mirrors the OpenAI adapter's pattern: a Bearer-authenticated GET against
 * the models list.
 */

const API_BASE = "https://api.groq.com/openai/v1";

interface GroqModelList {
  data?: Array<{ id: string }>;
}

interface GroqErrorBody {
  error?: { message?: string };
}

export const groqAdapter: IntegrationAdapter = {
  key: "GROQ",
  name: "Groq",
  category: "AI_PROVIDER",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key
  },

  credentialFields: [{ key: "apiKey", label: "API Key" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("A Groq API key is required.");

    const response = await fetch(`${API_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = (await response.json().catch(() => ({}))) as GroqModelList & GroqErrorBody;
    if (!response.ok) {
      throw new Error(`Groq rejected this API key: ${body.error?.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: apiKey,
      scopes: [],
      metadata: { modelCount: body.data?.length ?? 0 },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/models`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as GroqErrorBody;
      return { ok: false, detail: `Groq models check failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as GroqModelList;
    return { ok: true, detail: `${body.data?.length ?? 0} models available` };
  },

  async revoke(): Promise<void> {
    // Groq has no API to remotely revoke a specific API key — it must be
    // deleted from the Groq console. Disconnecting here only ever removes
    // our local copy.
  },
};
