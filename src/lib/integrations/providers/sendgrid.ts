import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * SendGrid — API_KEY auth. The submitted API key IS the stored access
 * token, exactly like stripe.ts. No platform-level env var is required:
 * any org can paste in their own SendGrid API key.
 */

const API_BASE = "https://api.sendgrid.com/v3";

interface SendGridAccount {
  type?: string;
  reputation?: number;
}

interface SendGridErrorBody {
  errors?: { message?: string }[];
}

async function verify(apiKey: string): Promise<{ response: Response; body: SendGridAccount & SendGridErrorBody }> {
  const response = await fetch(`${API_BASE}/user/account`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = (await response.json().catch(() => ({}))) as SendGridAccount & SendGridErrorBody;
  return { response, body };
}

export const sendgridAdapter: IntegrationAdapter = {
  key: "SENDGRID",
  name: "SendGrid",
  category: "EMAIL",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key
  },

  credentialFields: [{ key: "apiKey", label: "API Key", placeholder: "SG...." }],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    if (!apiKey) throw new Error("A SendGrid API key is required.");

    const { response, body } = await verify(apiKey);
    if (!response.ok) {
      throw new Error(`SendGrid rejected this API key: ${body.errors?.[0]?.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: apiKey,
      scopes: [],
      metadata: { type: body.type ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    const { response, body } = await verify(accessToken);
    if (!response.ok) {
      return { ok: false, detail: `SendGrid account check failed (HTTP ${response.status}): ${body.errors?.[0]?.message ?? "unknown error"}` };
    }
    return { ok: true, detail: body.type };
  },

  async revoke(): Promise<void> {
    // SendGrid has no API to remotely invalidate an API key — it must be
    // deleted from the SendGrid dashboard. Disconnecting here only ever
    // removes our local copy.
  },
};
