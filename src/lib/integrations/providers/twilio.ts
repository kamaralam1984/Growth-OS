import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Twilio — API_KEY auth using an Account SID + Auth Token pair, sent as
 * HTTP Basic auth per Twilio's standard REST API scheme. No platform-level
 * env var is required — any org supplies its own credentials.
 *
 * The stored accessToken is the JSON string `{accountSid, authToken}`
 * (both are required on every subsequent API call, e.g. the SMS-send node
 * executor in src/lib/workflows/node-executors/communication.ts) — this
 * exact shape/key-naming must not change.
 */

const API_BASE = "https://api.twilio.com/2010-04-01";

interface TwilioCredentialPair {
  accountSid: string;
  authToken: string;
}

interface TwilioAccount {
  sid?: string;
  friendly_name?: string;
  status?: string;
}

interface TwilioErrorBody {
  message?: string;
}

function basicAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

function parseStoredCredentials(accessToken: string): TwilioCredentialPair {
  const parsed = JSON.parse(accessToken) as Partial<TwilioCredentialPair>;
  if (!parsed.accountSid || !parsed.authToken) {
    throw new Error("Stored Twilio credential is missing accountSid/authToken.");
  }
  return { accountSid: parsed.accountSid, authToken: parsed.authToken };
}

export const twilioAdapter: IntegrationAdapter = {
  key: "TWILIO",
  name: "Twilio",
  category: "COMMUNICATION",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own Account SID/Auth Token
  },

  credentialFields: [
    { key: "accountSid", label: "Account SID", placeholder: "AC...", secret: false },
    { key: "authToken", label: "Auth Token", secret: true },
  ],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const accountSid = credentials.accountSid?.trim();
    const authToken = credentials.authToken?.trim();
    if (!accountSid || !authToken) throw new Error("A Twilio Account SID and Auth Token are both required.");

    const response = await fetch(`${API_BASE}/Accounts/${accountSid}.json`, {
      headers: { Authorization: basicAuthHeader(accountSid, authToken) },
    });
    const body = (await response.json().catch(() => ({}))) as TwilioAccount & TwilioErrorBody;
    if (!response.ok) {
      throw new Error(`Twilio rejected these credentials: ${body.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: JSON.stringify({ accountSid, authToken } satisfies TwilioCredentialPair),
      scopes: [],
      metadata: { friendlyName: body.friendly_name ?? null, status: body.status ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    let credentials: TwilioCredentialPair;
    try {
      credentials = parseStoredCredentials(accessToken);
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : "Invalid stored Twilio credential" };
    }

    const response = await fetch(`${API_BASE}/Accounts/${credentials.accountSid}.json`, {
      headers: { Authorization: basicAuthHeader(credentials.accountSid, credentials.authToken) },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as TwilioErrorBody;
      return { ok: false, detail: `Twilio account check failed (HTTP ${response.status}): ${body.message ?? "unknown error"}` };
    }
    const body = (await response.json().catch(() => ({}))) as TwilioAccount;
    return { ok: true, detail: body.status ?? body.sid };
  },

  async revoke(): Promise<void> {
    // Twilio has no API to revoke an Auth Token remotely — it must be rolled
    // from the Twilio Console. Disconnecting here only removes our local copy.
  },
};
