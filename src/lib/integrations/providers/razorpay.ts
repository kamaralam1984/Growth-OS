import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Razorpay — API_KEY auth. Razorpay's REST API uses a Key ID / Key Secret
 * pair over HTTP Basic auth (no OAuth). Both values together are the
 * credential, so the stored "access token" is the JSON pair `{keyId,
 * keySecret}` — every downstream consumer (healthCheck, business code that
 * needs to call the Payments API) parses this JSON rather than treating the
 * stored string as a single bearer token, matching Razorpay's own auth
 * scheme instead of forcing it into a one-string model.
 */

const API_BASE = "https://api.razorpay.com/v1";

interface RazorpayCredentialPair {
  keyId: string;
  keySecret: string;
}

interface RazorpayErrorBody {
  error?: { description?: string };
}

function basicAuthHeader(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

function parseCredentialPair(accessToken: string): RazorpayCredentialPair {
  try {
    const parsed = JSON.parse(accessToken) as Partial<RazorpayCredentialPair>;
    if (!parsed.keyId || !parsed.keySecret) throw new Error("missing keyId/keySecret");
    return { keyId: parsed.keyId, keySecret: parsed.keySecret };
  } catch {
    throw new Error("Stored Razorpay credential is not a valid {keyId, keySecret} pair.");
  }
}

export const razorpayAdapter: IntegrationAdapter = {
  key: "RAZORPAY",
  name: "Razorpay",
  category: "PAYMENTS",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own Key ID/Secret
  },

  credentialFields: [
    { key: "keyId", label: "Key ID", placeholder: "rzp_live_...", secret: false },
    { key: "keySecret", label: "Key Secret" },
  ],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const keyId = credentials.keyId?.trim();
    const keySecret = credentials.keySecret?.trim();
    if (!keyId || !keySecret) throw new Error("A Razorpay Key ID and Key Secret are both required.");

    const response = await fetch(`${API_BASE}/payments?count=1`, {
      headers: { Authorization: basicAuthHeader(keyId, keySecret) },
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as RazorpayErrorBody;
      throw new Error(`Razorpay rejected this Key ID/Secret pair: ${body.error?.description ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: JSON.stringify({ keyId, keySecret } satisfies RazorpayCredentialPair),
      scopes: [],
      metadata: { keyId },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    try {
      const { keyId, keySecret } = parseCredentialPair(accessToken);
      const response = await fetch(`${API_BASE}/payments?count=1`, {
        headers: { Authorization: basicAuthHeader(keyId, keySecret) },
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as RazorpayErrorBody;
        return { ok: false, detail: `Razorpay payments check failed (HTTP ${response.status}): ${body.error?.description ?? "unknown error"}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },

  async revoke(): Promise<void> {
    // Razorpay has no API to revoke/invalidate a Key ID/Secret remotely — it
    // must be regenerated from the Razorpay Dashboard. Disconnecting here
    // only ever removes our local copy.
  },
};
