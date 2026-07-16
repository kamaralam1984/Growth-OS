import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Mailgun — API_KEY auth using HTTP Basic (username "api", password the
 * API key), verified against the sending domain's own domain-details
 * endpoint. The raw API key is stored as the access token; the sending
 * domain is stashed in metadata for downstream send calls.
 *
 * Known limitation: this targets Mailgun's US region (api.mailgun.net)
 * only. EU-region domains are served from api.eu.mailgun.net and would
 * need a region field/toggle — out of scope for this pass.
 */

const API_BASE = "https://api.mailgun.net/v3";

interface MailgunDomain {
  name?: string;
  state?: string;
}

interface MailgunDomainResponse {
  domain?: MailgunDomain;
  message?: string;
}

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`;
}

async function verify(apiKey: string, domain: string): Promise<{ response: Response; body: MailgunDomainResponse }> {
  const response = await fetch(`${API_BASE}/domains/${encodeURIComponent(domain)}`, {
    headers: { Authorization: basicAuthHeader(apiKey) },
  });
  const body = (await response.json().catch(() => ({}))) as MailgunDomainResponse;
  return { response, body };
}

export const mailgunAdapter: IntegrationAdapter = {
  key: "MAILGUN",
  name: "Mailgun",
  category: "EMAIL",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own API key + domain
  },

  credentialFields: [
    { key: "apiKey", label: "API Key", secret: true },
    { key: "domain", label: "Sending domain", secret: false, placeholder: "mg.yourdomain.com" },
  ],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const apiKey = credentials.apiKey?.trim();
    const domain = credentials.domain?.trim();
    if (!apiKey) throw new Error("A Mailgun API key is required.");
    if (!domain) throw new Error("A Mailgun sending domain is required.");

    const { response, body } = await verify(apiKey, domain);
    if (!response.ok) {
      throw new Error(`Mailgun rejected this API key/domain pair: ${body.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: apiKey,
      scopes: [],
      metadata: { domain, state: body.domain?.state ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    // healthCheck's contract only ever receives the stored access token
    // (see connection-store.runHealthCheck) — the sending domain saved in
    // metadata at connect time isn't passed back in. So we can't re-hit the
    // domain-specific endpoint here; the account-wide domains list is the
    // cheapest authenticated probe that only needs the API key.
    const response = await fetch(`${API_BASE}/domains?limit=1`, {
      headers: { Authorization: basicAuthHeader(accessToken) },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as MailgunDomainResponse;
      return { ok: false, detail: `Mailgun domains check failed (HTTP ${response.status}): ${body.message ?? "unknown error"}` };
    }
    return { ok: true };
  },

  async revoke(): Promise<void> {
    // Mailgun has no API to remotely invalidate an API key — it must be
    // rotated from the Mailgun dashboard. Disconnecting here only ever
    // removes our local copy.
  },
};
