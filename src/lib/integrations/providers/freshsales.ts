import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Freshsales (Freshworks CRM) — API_KEY. There's no OAuth flow; Freshsales
 * issues a long-lived per-account API key, and every API call is also
 * per-account-domain-scoped (e.g. yourcompany.myfreshworks.com), so both the
 * key AND the domain are required on every call. Since the shared
 * IntegrationAdapter contract stores a single opaque `accessToken` string,
 * both values are packed together as a small JSON blob and unpacked again in
 * healthCheck. Freshsales's auth header scheme is `Token token=<key>`, not
 * Bearer — real, documented Freshworks CRM behavior.
 */

interface FreshsalesStoredCredentials {
  apiKey: string;
  domain: string;
}

interface FreshsalesSystemStats {
  system_stats?: unknown;
}

interface FreshsalesErrorBody {
  message?: string;
  error?: string;
}

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function verify(apiKey: string, domain: string): Promise<HealthCheckResult> {
  const host = normalizeDomain(domain);
  const response = await fetch(`https://${host}/crm/sales/api/settings/system_stats`, {
    headers: { Authorization: `Token token=${apiKey}` },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as FreshsalesErrorBody;
    return {
      ok: false,
      detail: `Freshsales system_stats check failed (HTTP ${response.status}): ${body.message ?? body.error ?? "unknown error"}`,
    };
  }
  const body = (await response.json().catch(() => ({}))) as FreshsalesSystemStats;
  return { ok: true, detail: body.system_stats !== undefined ? "Connected to Freshsales." : undefined };
}

export const freshsalesAdapter: IntegrationAdapter = {
  key: "FRESHSALES",
  name: "Freshsales",
  category: "CRM_SYNC",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key + domain
  },

  credentialFields: [
    { key: "apiKey", label: "API Key" },
    { key: "domain", label: "Freshsales domain", secret: false, placeholder: "yourcompany.myfreshworks.com" },
  ],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    const domain = credentials.domain?.trim();
    if (!apiKey) throw new Error("A Freshsales API key is required.");
    if (!domain) throw new Error("A Freshsales domain is required.");

    const result = await verify(apiKey, domain);
    if (!result.ok) {
      throw new Error(result.detail ?? "Freshsales rejected this API key/domain.");
    }

    const stored: FreshsalesStoredCredentials = { apiKey, domain: normalizeDomain(domain) };
    return {
      accessToken: JSON.stringify(stored),
      scopes: [],
      metadata: { domain: stored.domain },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    let stored: FreshsalesStoredCredentials;
    try {
      stored = JSON.parse(accessToken) as FreshsalesStoredCredentials;
    } catch {
      return { ok: false, detail: "Stored Freshsales credential is not in the expected format." };
    }
    if (!stored.apiKey || !stored.domain) {
      return { ok: false, detail: "Stored Freshsales credential is missing apiKey or domain." };
    }
    return verify(stored.apiKey, stored.domain);
  },

  async revoke(): Promise<void> {
    // Freshsales has no API to revoke/invalidate an API key remotely — it
    // must be regenerated from the Freshsales admin settings. Disconnecting
    // here only ever removes our local copy.
  },
};
