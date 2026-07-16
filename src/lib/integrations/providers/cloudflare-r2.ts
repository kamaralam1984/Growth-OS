import { createHash, createHmac } from "crypto";
import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * Cloudflare R2 — API_KEY auth. R2 is S3-API-compatible at
 * https://{accountId}.r2.cloudflarestorage.com, signed with the same SigV4
 * algorithm as AWS S3/SES (service name "s3", but region is the literal
 * string "auto" per Cloudflare's R2 SigV4 convention — R2 has no per-region
 * endpoints). Signer duplicated file-locally, same as aws-s3.ts.
 */

const SERVICE = "s3";
const REGION = "auto";

interface R2Credential {
  accessKeyId: string;
  secretAccessKey: string;
  accountId: string;
  bucket: string;
}

interface R2ErrorResponse {
  message?: string;
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
function signGetRequest(
  accessKeyId: string,
  secretAccessKey: string,
  host: string,
  path: string,
  query: string,
): { url: string; headers: Record<string, string> } {
  const { amzDate, dateStamp } = amzDateStamp();
  const emptyBodyHash = sha256Hex("");

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyBodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["GET", path, query, canonicalHeaders, signedHeaders, emptyBodyHash].join("\n");

  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmac(kSigning, stringToSign).toString("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` + `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    url: `https://${host}${path}${query ? `?${query}` : ""}`,
    headers: {
      Authorization: authorization,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": emptyBodyHash,
    },
  };
}

async function verify(cred: R2Credential): Promise<{ response: Response; body: R2ErrorResponse }> {
  const host = `${cred.accountId}.r2.cloudflarestorage.com`;
  const { url, headers } = signGetRequest(cred.accessKeyId, cred.secretAccessKey, host, `/${cred.bucket}`, "list-type=2&max-keys=1");
  const response = await fetch(url, { headers });
  const text = await response.text().catch(() => "");
  // R2's list-objects response is XML, not JSON — surface enough of the body for a useful error without a full XML parser.
  const message = /<Message>(.*?)<\/Message>/.exec(text)?.[1];
  return { response, body: { message: message ?? (response.ok ? undefined : text.slice(0, 200)) } };
}

function parseCredential(accessToken: string): R2Credential {
  const parsed = JSON.parse(accessToken) as Partial<R2Credential>;
  if (!parsed.accessKeyId || !parsed.secretAccessKey || !parsed.accountId || !parsed.bucket) {
    throw new Error("Stored Cloudflare R2 credential is missing accessKeyId/secretAccessKey/accountId/bucket.");
  }
  return { accessKeyId: parsed.accessKeyId, secretAccessKey: parsed.secretAccessKey, accountId: parsed.accountId, bucket: parsed.bucket };
}

export const cloudflareR2Adapter: IntegrationAdapter = {
  key: "CLOUDFLARE_R2",
  name: "Cloudflare R2",
  category: "STORAGE",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own R2 access keys + account/bucket
  },

  credentialFields: [
    { key: "accessKeyId", label: "R2 Access Key ID" },
    { key: "secretAccessKey", label: "R2 Secret Access Key" },
    { key: "accountId", label: "Cloudflare Account ID", secret: false },
    { key: "bucket", label: "Bucket name", secret: false },
  ],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const accessKeyId = credentials.accessKeyId?.trim();
    const secretAccessKey = credentials.secretAccessKey?.trim();
    const accountId = credentials.accountId?.trim();
    const bucket = credentials.bucket?.trim();
    if (!accessKeyId || !secretAccessKey || !accountId || !bucket) {
      throw new Error("R2 Access Key ID, Secret Access Key, Cloudflare Account ID, and Bucket name are all required.");
    }

    const cred: R2Credential = { accessKeyId, secretAccessKey, accountId, bucket };
    const { response, body } = await verify(cred);
    if (!response.ok) {
      throw new Error(`Cloudflare R2 rejected these credentials: ${body.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: JSON.stringify(cred),
      scopes: [],
      metadata: { accountId, bucket },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    try {
      const cred = parseCredential(accessToken);
      const { response, body } = await verify(cred);
      if (!response.ok) {
        return { ok: false, detail: `R2 bucket list check failed (HTTP ${response.status}): ${body.message ?? "unknown error"}` };
      }
      return { ok: true, detail: `Bucket ${cred.bucket} reachable` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },

  async revoke(): Promise<void> {
    // Cloudflare R2 access keys have no per-connection revoke API reachable
    // with only the key pair itself — the user must delete the key from the
    // Cloudflare dashboard. Disconnecting here only removes our local copy.
  },
};
