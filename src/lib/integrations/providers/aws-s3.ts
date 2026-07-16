import { createHash, createHmac } from "crypto";
import type { HealthCheckResult, IntegrationAdapter, OAuthTokenResult } from "../types";

/**
 * AWS S3 — API_KEY auth via a Signature Version 4 signed request (no SDK).
 * Like Amazon SES, S3 needs an access key ID + secret access key + region
 * (plus a bucket name here) on every call, so the composite credential is
 * JSON-stringified into the single "accessToken" string the connection
 * store persists. The SigV4 signer below is a local, self-contained
 * duplicate of amazon-ses.ts's signer (same algorithm, different service
 * name/host shape) — kept file-local per this codebase's "no shared-file
 * edits across a provider batch" rule.
 */

const SERVICE = "s3";

interface S3Credential {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
}

interface S3ErrorResponse {
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
  region: string,
  host: string,
  path: string,
  query: string,
): { url: string; headers: Record<string, string> } {
  const { amzDate, dateStamp } = amzDateStamp();
  const emptyBodyHash = sha256Hex("");

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${emptyBodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["GET", path, query, canonicalHeaders, signedHeaders, emptyBodyHash].join("\n");

  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
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

async function verify(cred: S3Credential): Promise<{ response: Response; body: S3ErrorResponse }> {
  const host = `${cred.bucket}.s3.${cred.region}.amazonaws.com`;
  const { url, headers } = signGetRequest(cred.accessKeyId, cred.secretAccessKey, cred.region, host, "/", "list-type=2&max-keys=1");
  const response = await fetch(url, { headers });
  const text = await response.text().catch(() => "");
  // S3 returns XML, not JSON — surface enough of the body for a useful error message without a full XML parser.
  const message = /<Message>(.*?)<\/Message>/.exec(text)?.[1];
  return { response, body: { message: message ?? (response.ok ? undefined : text.slice(0, 200)) } };
}

function parseCredential(accessToken: string): S3Credential {
  const parsed = JSON.parse(accessToken) as Partial<S3Credential>;
  if (!parsed.accessKeyId || !parsed.secretAccessKey || !parsed.region || !parsed.bucket) {
    throw new Error("Stored AWS S3 credential is missing accessKeyId/secretAccessKey/region/bucket.");
  }
  return { accessKeyId: parsed.accessKeyId, secretAccessKey: parsed.secretAccessKey, region: parsed.region, bucket: parsed.bucket };
}

export const awsS3Adapter: IntegrationAdapter = {
  key: "AWS_S3",
  name: "Amazon S3",
  category: "STORAGE",
  authType: "API_KEY",
  requiredEnvVars: [],

  isConfigured(): boolean {
    return true; // no platform-level credential required — each org supplies its own AWS access keys + bucket
  },

  credentialFields: [
    { key: "accessKeyId", label: "AWS Access Key ID" },
    { key: "secretAccessKey", label: "AWS Secret Access Key" },
    { key: "region", label: "AWS Region", secret: false, placeholder: "us-east-1" },
    { key: "bucket", label: "Bucket name", secret: false },
  ],

  async connectWithCredentials(credentials: Record<string, string>): Promise<OAuthTokenResult> {
    const accessKeyId = credentials.accessKeyId?.trim();
    const secretAccessKey = credentials.secretAccessKey?.trim();
    const region = credentials.region?.trim();
    const bucket = credentials.bucket?.trim();
    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
      throw new Error("AWS Access Key ID, Secret Access Key, Region, and Bucket name are all required.");
    }

    const cred: S3Credential = { accessKeyId, secretAccessKey, region, bucket };
    const { response, body } = await verify(cred);
    if (!response.ok) {
      throw new Error(`AWS S3 rejected these credentials: ${body.message ?? `HTTP ${response.status}`}`);
    }

    return {
      accessToken: JSON.stringify(cred),
      scopes: [],
      metadata: { region, bucket },
    };
  },

  async healthCheck(accessToken: string): Promise<HealthCheckResult> {
    try {
      const cred = parseCredential(accessToken);
      const { response, body } = await verify(cred);
      if (!response.ok) {
        return { ok: false, detail: `S3 bucket list check failed (HTTP ${response.status}): ${body.message ?? "unknown error"}` };
      }
      return { ok: true, detail: `Bucket ${cred.bucket} reachable` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  },

  async revoke(): Promise<void> {
    // AWS IAM access keys have no per-connection revoke API reachable with
    // only the key pair itself — the user must deactivate/delete the key
    // from the AWS IAM console. Disconnecting here only removes our local copy.
  },
};
