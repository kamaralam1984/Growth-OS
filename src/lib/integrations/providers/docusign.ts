import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

// Verify these endpoints against DocuSign's current developer docs
// (developers.docusign.com) before relying on this in production — written
// from stable, long-documented DocuSign OAuth conventions (demo/production
// host split, Basic-auth token exchange, userinfo→base_uri discovery)
// without live doc access in this session.

const SCOPES = ["signature"];

function authHost(): string {
  return process.env.DOCUSIGN_ENVIRONMENT === "production" ? "https://account.docusign.com" : "https://account-d.docusign.com";
}

function integrationKey(): string {
  return process.env.DOCUSIGN_INTEGRATION_KEY ?? "";
}

function clientSecret(): string {
  return process.env.DOCUSIGN_CLIENT_SECRET ?? "";
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${integrationKey()}:${clientSecret()}`).toString("base64")}`;
}

interface DocuSignTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface DocuSignUserInfoAccount {
  account_id: string;
  base_uri: string;
  is_default: boolean;
}

interface DocuSignUserInfoResponse {
  email?: string;
  name?: string;
  accounts?: DocuSignUserInfoAccount[];
}

async function fetchUserInfo(accessToken: string): Promise<DocuSignUserInfoResponse> {
  const response = await fetch(`${authHost()}/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DocuSign userinfo request failed (${response.status}): ${body}`);
  }
  return (await response.json()) as DocuSignUserInfoResponse;
}

async function tokenResultFromResponse(response: Response, action: string): Promise<OAuthTokenResult> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DocuSign ${action} failed (${response.status}): ${body}`);
  }
  const tokens = (await response.json()) as DocuSignTokenResponse;

  const userInfo = await fetchUserInfo(tokens.access_token);
  const account = userInfo.accounts?.find((a) => a.is_default) ?? userInfo.accounts?.[0];

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    scopes: SCOPES,
    metadata: account ? { accountId: account.account_id, baseUri: account.base_uri } : undefined,
  };
}

export const docusignAdapter: IntegrationAdapter = {
  key: "DOCUSIGN",
  name: "DocuSign",
  category: "SIGNATURE",
  authType: "OAUTH2",
  requiredEnvVars: ["DOCUSIGN_INTEGRATION_KEY", "DOCUSIGN_CLIENT_SECRET"],

  isConfigured(): boolean {
    return integrationKey().length > 0 && clientSecret().length > 0;
  },

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      scope: SCOPES.join(" "),
      client_id: integrationKey(),
      redirect_uri: redirectUri,
      state,
    });
    return `${authHost()}/oauth/auth?${params.toString()}`;
  },

  async handleCallback(code: string): Promise<OAuthTokenResult> {
    const response = await fetch(`${authHost()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code }).toString(),
    });
    return tokenResultFromResponse(response, "token exchange");
  },

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResult> {
    const response = await fetch(`${authHost()}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
    });
    return tokenResultFromResponse(response, "token refresh");
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    try {
      const response = await fetch(`${authHost()}/oauth/userinfo`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        const body = await response.text();
        return { ok: false, detail: `DocuSign userinfo returned ${response.status}: ${body}` };
      }
      const userInfo = (await response.json()) as DocuSignUserInfoResponse;
      if (!Array.isArray(userInfo.accounts)) {
        return { ok: false, detail: "DocuSign userinfo response had no parseable accounts array." };
      }
      return { ok: true, detail: userInfo.email ?? userInfo.name ?? "Connected to DocuSign." };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },

  async revoke(): Promise<void> {
    console.info(
      "[docusign] DocuSign has no stable, universally-documented public revoke endpoint across demo/production — tokens simply expire. The user can revoke this app's access from their DocuSign admin panel (Settings > Connected Apps & Keys).",
    );
  },
};
