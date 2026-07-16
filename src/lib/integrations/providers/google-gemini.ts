import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Google Gemini (AI Studio) — API_KEY auth. One of several optional
 * AI_PROVIDER connections used for multi-provider vision/content-generation
 * routing; distinct from this app's primary Claude connection
 * (src/lib/ai/client.ts). Auth quirk: the Gemini API authenticates via a
 * `key` query-string parameter rather than an Authorization header — that is
 * correct and required for this API, not a mistake.
 */

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiModelList {
  models?: Array<{ name: string }>;
}

interface GeminiErrorBody {
  error?: { message?: string };
}

export const googleGeminiAdapter: IntegrationAdapter = {
  key: "GOOGLE_GEMINI",
  name: "Google Gemini",
  category: "AI_PROVIDER",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key
  },

  credentialFields: [{ key: "apiKey", label: "API Key" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("A Google Gemini API key is required.");

    const response = await fetch(`${API_BASE}/models?key=${encodeURIComponent(apiKey)}`);
    const body = (await response.json().catch(() => ({}))) as GeminiModelList & GeminiErrorBody;
    if (!response.ok) {
      throw new Error(`Google Gemini rejected this API key: ${body.error?.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: apiKey,
      scopes: [],
      metadata: { modelCount: body.models?.length ?? 0 },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/models?key=${encodeURIComponent(accessToken)}`);
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as GeminiErrorBody;
      return { ok: false, detail: `Gemini models check failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as GeminiModelList;
    return { ok: true, detail: `${body.models?.length ?? 0} models available` };
  },

  async revoke(): Promise<void> {
    // Google AI Studio has no API to remotely revoke a specific API key — it
    // must be deleted from the AI Studio / Google Cloud console.
    // Disconnecting here only ever removes our local copy.
  },
};
