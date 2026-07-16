import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * OpenAI — API_KEY auth. One of several optional AI_PROVIDER connections used
 * for multi-provider content-generation/vision routing; distinct from this
 * app's primary Claude connection (src/lib/ai/client.ts), which is wired
 * separately via ANTHROPIC_API_KEY and never goes through this adapter
 * system. Each org supplies its own OpenAI secret key — no platform-level
 * env var is required to enable this adapter.
 */

const API_BASE = "https://api.openai.com/v1";

interface OpenAIModelList {
  data?: Array<{ id: string }>;
}

interface OpenAIErrorBody {
  error?: { message?: string };
}

export const openaiAdapter: IntegrationAdapter = {
  key: "OPENAI",
  name: "OpenAI",
  category: "AI_PROVIDER",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key
  },

  credentialFields: [{ key: "apiKey", label: "API Key", placeholder: "sk-..." }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("An OpenAI API key is required.");

    const response = await fetch(`${API_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = (await response.json().catch(() => ({}))) as OpenAIModelList & OpenAIErrorBody;
    if (!response.ok) {
      throw new Error(`OpenAI rejected this API key: ${body.error?.message ?? `HTTP ${response.status}`}`);
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
      const body = (await response.json().catch(() => ({}))) as OpenAIErrorBody;
      return { ok: false, detail: `OpenAI models check failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as OpenAIModelList;
    return { ok: true, detail: `${body.data?.length ?? 0} models available` };
  },

  async revoke(): Promise<void> {
    // OpenAI has no API to remotely revoke a specific secret key — it must be
    // deleted from the OpenAI dashboard (Settings > API keys). Disconnecting
    // here only ever removes our local copy.
  },
};
