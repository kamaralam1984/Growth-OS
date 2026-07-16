import { createHash, createHmac } from "crypto";
import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Amazon SES (v2 API) — API_KEY auth, but unlike a single bearer token SES
 * needs an access key ID + secret access key + region on every call to
 * produce a Signature Version 4 signature (no SDK — a minimal, self
 * contained SigV4 signer for unsigned-body GET requests, built on Node's
 * built-in `crypto`). The composite credential is JSON-stringified into the
 * single "accessToken" string the connection store persists, since all
 * three fields are required together for every future signed call.
 */

const SERVICE = "ses";

interface SesCredential {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

interface SesAccountResponse {
  SendingEnabled?: boolean;
  ProductionAccessEnabled?: boolean;
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function amzDateStamp(): { amzDate: string; dateStamp: string } {
  const iso = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

/** Signs a bodyless GET request against a SigV4 service and returns the ready-to-use fetch options. */
function signGetRequest(cred: SesCredential, host: string, path: string, query: string): { url: string; headers: Record<string, string> } {
  const { amzDate, dateStamp } = amzDateStamp();
  const emptyBodyHash = sha256Hex("");

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyBodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["GET", path, query, canonicalHeaders, signedHeaders, emptyBodyHash].join("\n");

  const credentialScope = `${dateStamp}/${cred.region}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${cred.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, cred.region);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${cred.accessKeyId}/${credentialScope}, ` + `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${host}${path}${query ? `?${query}` : ""}`,
    headers: {
      Authorization: authorization,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": emptyBodyHash,
    },
  };
}

async function verify(cred: SesCredential): Promise<{ response: Response; body: SesAccountResponse & { message?: string } }> {
  const host = `email.${cred.region}.amazonaws.com`;
  const { url, headers } = signGetRequest(cred, host, "/v2/email/account", "");
  const response = await fetch(url, { headers });
  const body = (await response.json().catch(() => ({}))) as SesAccountResponse & { message?: string };
  return { response, body };
}

function parseCredential(accessToken: string): SesCredential {
  const parsed = JSON.parse(accessToken) as Partial<SesCredential>;
  if (!parsed.accessKeyId || !parsed.secretAccessKey || !parsed.region) {
    throw new Error("Stored Amazon SES credential is missing accessKeyId/secretAccessKey/region.");
  }
  return { accessKeyId: parsed.accessKeyId, secretAccessKey: parsed.secretAccessKey, region: parsed.region };
}

export const amazonSesAdapter: IntegrationAdapter = {
  key: "AMAZON_SES",
  name: "Amazon SES",
  category: "EMAIL",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own AWS access keys
  },

  credentialFields: [
    { key: "accessKeyId", label: "AWS Access Key ID" },
    { key: "secretAccessKey", label: "AWS Secret Access Key" },
    { key: "region", label: "AWS Region", secret: false, placeholder: "us-east-1" },
  ],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const accessKeyId = credentials.accessKeyId?.trim();
    const secretAccessKey = credentials.secretAccessKey?.trim();
    const region = credentials.region?.trim();
    if (!accessKeyId || !secretAccessKey || !region) {
      throw new Error("AWS Access Key ID, Secret Access Key, and Region are all required.");
    }

    const cred: SesCredential = { accessKeyId, secretAccessKey, region };
    const { response, body } = await verify(cred);
    if (!response.ok) {
      throw new Error(`Amazon SES rejected these credentials: ${body.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: JSON.stringify(cred),
      scopes: [],
      metadata: { region, sendingEnabled: body.SendingEnabled ?? null, productionAccessEnabled: body.ProductionAccessEnabled ?? null },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    try {
      const cred = parseCredential(accessToken);
      const { response, body } = await verify(cred);
      if (!response.ok) {
        return { ok: false, detail: `Amazon SES account check failed (HTTP ${response.status}): ${body.message ?? "unknown error"}` };
      }
      return { ok: true, detail: body.SendingEnabled ? "Sending enabled" : "Sending disabled" };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },

  async revoke(): Promise<void> {
    // AWS IAM access keys have no per-connection revoke API reachable with
    // only the key pair itself (revocation requires IAM admin permissions
    // on a different credential) — the user must deactivate/delete the key
    // from the AWS IAM console. Disconnecting here only removes our local copy.
  },
};
