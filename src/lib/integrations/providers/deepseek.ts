import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * DeepSeek — API_KEY auth. One of several optional AI_PROVIDER connections
 * used for multi-provider content-generation routing; distinct from this
 * app's primary Claude connection (src/lib/ai/client.ts). DeepSeek's API is
 * OpenAI-compatible, so verification mirrors the OpenAI adapter's pattern:
 * a Bearer-authenticated GET against the models list.
 */

const API_BASE = "https://api.deepseek.com/v1";

interface DeepSeekModelList {
  data?: Array<{ id: string }>;
}

interface DeepSeekErrorBody {
  error?: { message?: string };
}

export const deepseekAdapter: IntegrationAdapter = {
  key: "DEEPSEEK",
  name: "DeepSeek",
  category: "AI_PROVIDER",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key
  },

  credentialFields: [{ key: "apiKey", label: "API Key" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("A DeepSeek API key is required.");

    const response = await fetch(`${API_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = (await response.json().catch(() => ({}))) as DeepSeekModelList & DeepSeekErrorBody;
    if (!response.ok) {
      throw new Error(`DeepSeek rejected this API key: ${body.error?.message ?? `HTTP ${response.status}`}`);
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
      const body = (await response.json().catch(() => ({}))) as DeepSeekErrorBody;
      return { ok: false, detail: `DeepSeek models check failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as DeepSeekModelList;
    return { ok: true, detail: `${body.data?.length ?? 0} models available` };
  },

  async revoke(): Promise<void> {
    // DeepSeek has no API to remotely revoke a specific API key — it must be
    // deleted from the DeepSeek platform dashboard. Disconnecting here only
    // ever removes our local copy.
  },
};
