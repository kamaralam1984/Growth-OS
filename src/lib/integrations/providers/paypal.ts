import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * PayPal — API_KEY auth. PayPal's REST API is technically OAuth2
 * client-credentials, but for a platform/merchant integration like this
 * there is no browser consent step or per-user redirect — it's a
 * server-to-server credential exchange, so it fits this codebase's
 * API_KEY shape (credential pair entered once via a form) rather than the
 * 3-legged OAUTH2 shape.
 *
 * IMPORTANT: the minted access_token from client_credentials expires in
 * ~9 hours and this adapter has no refresh-token mechanism (API_KEY
 * connections don't get refreshAccessToken calls). So the stored "access
 * token" is the JSON credential PAIR `{clientId, clientSecret}`, not the
 * ephemeral token itself — healthCheck (and any future business call)
 * re-mints a fresh token from that pair on every call.
 */

const TOKEN_URL = "https://api-m.paypal.com/v1/oauth2/token";

interface PayPalCredentialPair {
  clientId: string;
  clientSecret: string;
}

interface PayPalTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function parseCredentialPair(accessToken: string): PayPalCredentialPair {
  try {
    const parsed = JSON.parse(accessToken) as Partial<PayPalCredentialPair>;
    if (!parsed.clientId || !parsed.clientSecret) throw new Error("missing clientId/clientSecret");
    return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
  } catch {
    throw new Error("Stored PayPal credential is not a valid {clientId, clientSecret} pair.");
  }
}

async function mintToken(clientId: string, clientSecret: string): Promise<{ response: Response; body: PayPalTokenResponse }> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });
  const body = (await response.json().catch(() => ({}))) as PayPalTokenResponse;
  return { response, body };
}

export const paypalAdapter: IntegrationAdapter = {
  key: "PAYPAL",
  name: "PayPal",
  category: "PAYMENTS",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own Client ID/Secret
  },

  credentialFields: [
    { key: "clientId", label: "Client ID" },
    { key: "clientSecret", label: "Client Secret" },
  ],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const clientId = credentials.clientId?.trim();
    const clientSecret = credentials.clientSecret?.trim();
    if (!clientId || !clientSecret) throw new Error("A PayPal Client ID and Client Secret are both required.");

    const { response, body } = await mintToken(clientId, clientSecret);
    if (!response.ok || !body.access_token) {
      throw new Error(`PayPal rejected this Client ID/Secret pair: ${body.error_description ?? body.error ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: JSON.stringify({ clientId, clientSecret } satisfies PayPalCredentialPair),
      scopes: [],
      metadata: { clientId },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    try {
      const { clientId, clientSecret } = parseCredentialPair(accessToken);
      const { response, body } = await mintToken(clientId, clientSecret);
      if (!response.ok || !body.access_token) {
        return { ok: false, detail: `PayPal token mint failed (HTTP ${response.status}): ${body.error_description ?? body.error ?? "unknown error"}` };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },

  async revoke(): Promise<void> {
    // PayPal client-credential tokens simply expire (~9h) and there's no
    // stable public revoke-by-credential endpoint for this flow. The
    // credential pair itself must be rotated from the PayPal developer
    // dashboard. Disconnecting here only ever removes our local copy.
  },
};
