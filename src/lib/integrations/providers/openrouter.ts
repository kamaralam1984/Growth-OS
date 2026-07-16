import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * OpenRouter — API_KEY auth. One of several optional AI_PROVIDER
 * connections, used as a multi-model routing gateway (many providers behind
 * one key) in a multi-provider setup; distinct from this app's primary
 * Claude connection (src/lib/ai/client.ts). OpenRouter exposes a
 * purpose-built key-introspection endpoint (`/auth/key`) that returns
 * usage/limit info for the key itself, which is used here instead of a
 * generic model list.
 */

const API_BASE = "https://openrouter.ai/api/v1";

interface OpenRouterKeyInfo {
  data?: { label?: string; usage?: number; limit?: number | null };
}

interface OpenRouterErrorBody {
  error?: { message?: string };
}

export const openrouterAdapter: IntegrationAdapter = {
  key: "OPENROUTER",
  name: "OpenRouter",
  category: "AI_PROVIDER",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key
  },

  credentialFields: [{ key: "apiKey", label: "API Key" }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("An OpenRouter API key is required.");

    const response = await fetch(`${API_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = (await response.json().catch(() => ({}))) as OpenRouterKeyInfo & OpenRouterErrorBody;
    if (!response.ok) {
      throw new Error(`OpenRouter rejected this API key: ${body.error?.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: apiKey,
      scopes: [],
      metadata: { label: body.data?.label ?? null, usage: body.data?.usage ?? null, limit: body.data?.limit ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const response = await fetch(`${API_BASE}/auth/key`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as OpenRouterErrorBody;
      return { ok: false, detail: `OpenRouter key check failed (HTTP ${response.status}): ${body.error?.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as OpenRouterKeyInfo;
    return { ok: true, detail: body.data?.label ?? "key valid" };
  },

  async revoke(): Promise<void> {
    // OpenRouter has no API to remotely revoke a specific key — it must be
    // deleted from the OpenRouter dashboard. Disconnecting here only ever
    // removes our local copy.
  },
};
