import { promises as dns } from "node:dns";
import net from "node:net";

/**
 * Real SSRF-safe outgoing HTTP request helpers for a user-supplied URL —
 * used by communication.ts's WEBHOOK/CUSTOM_API node executors AND by
 * webhook-delivery-queue.ts's background retry Worker. Extracted into its
 * own module (rather than living only in communication.ts) specifically so
 * those two files can both import the SAME validation/fetch logic without
 * duplicating it AND without a circular import between them — verified for
 * real: communication.ts importing enqueueWebhookDelivery from
 * webhook-delivery-queue.ts while that file imported these helpers back
 * from communication.ts caused a genuine "Cannot access ... before
 * initialization" crash at module load (Node/CJS circular-require TDZ
 * issue), reproduced by actually running the app, not assumed from docs.
 *
 * Same private/loopback/link-local blocklist as
 * src/lib/scanner/safe-fetch.ts, reused here for the same reason: sending a
 * real outgoing request to a user-supplied URL needs the same basic SSRF
 * hygiene as the website scanner.
 */

const OUTGOING_FETCH_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_SNIPPET_CHARS = 2000;

function ipv4ToLong(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

const PRIVATE_IPV4_CIDRS: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local
  ["172.16.0.0", 12],
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16],
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

function isPrivateIpv4(ip: string): boolean {
  const target = ipv4ToLong(ip);
  return PRIVATE_IPV4_CIDRS.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (target & mask) === (ipv4ToLong(base) & mask);
  });
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("fe80:") || normalized.startsWith("fec0:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // unique local fc00::/7
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "0.0.0.0";
}

export async function assertPublicUrl(raw: unknown, fieldLabel: string): Promise<URL> {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`${fieldLabel} node config must include a non-empty string "url".`);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${fieldLabel} node's "url" is not a valid URL: "${raw}".`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${fieldLabel} node's "url" must be http:// or https://, got "${url.protocol}".`);
  }

  const hostname = url.hostname;
  if (isPrivateOrLocalHostname(hostname)) {
    throw new Error(`${fieldLabel} node's "url" targets a local/internal hostname ("${hostname}") — not allowed.`);
  }
  if (net.isIP(hostname)) {
    const isPrivate = net.isIPv4(hostname) ? isPrivateIpv4(hostname) : isPrivateIpv6(hostname);
    if (isPrivate) throw new Error(`${fieldLabel} node's "url" targets a private/internal IP address ("${hostname}") — not allowed.`);
    return url;
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    if (records.length === 0) throw new Error(`${fieldLabel} node's "url" hostname "${hostname}" did not resolve to any address.`);
    for (const record of records) {
      const isPrivate = record.family === 4 ? isPrivateIpv4(record.address) : isPrivateIpv6(record.address);
      if (isPrivate) throw new Error(`${fieldLabel} node's "url" hostname "${hostname}" resolves to a private/internal IP address — not allowed.`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes(hostname)) throw error;
    throw new Error(`${fieldLabel} node could not resolve "${hostname}".`);
  }
  return url;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}… (truncated)` : text;
}

export interface OutgoingRequestResult {
  status: number;
  body: unknown;
}

export async function performOutgoingRequest(
  fieldLabel: string,
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<OutgoingRequestResult> {
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(OUTGOING_FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`${fieldLabel} node's request to "${url.toString()}" failed: ${error instanceof Error ? error.message : "unknown fetch error"}.`);
  }

  const rawBody = await response.text().catch(() => "");
  let parsedBody: unknown = rawBody;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") && rawBody) {
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      parsedBody = rawBody;
    }
  }
  const snippet = typeof parsedBody === "string" ? truncate(parsedBody, MAX_RESPONSE_SNIPPET_CHARS) : parsedBody;

  if (!response.ok) {
    const errorSnippet = truncate(rawBody, 500);
    throw new Error(`${fieldLabel} node's request to "${url.toString()}" failed with HTTP ${response.status}: ${errorSnippet}`);
  }

  return { status: response.status, body: snippet };
}

export function readOutgoingRequestConfig(
  config: Record<string, unknown>,
  fieldLabel: string,
): { method: string; headers: Record<string, string>; body: unknown } {
  const method = typeof config.method === "string" ? config.method.toUpperCase() : "POST";
  if (!["POST", "GET", "PUT", "PATCH", "DELETE"].includes(method)) {
    throw new Error(`${fieldLabel} node's "method" must be one of POST, GET, PUT, PATCH, DELETE — got "${method}".`);
  }
  const headers = (config.headers && typeof config.headers === "object" ? (config.headers as Record<string, string>) : {}) ?? {};
  const body = config.body;
  return { method, headers: { ...headers }, body };
}
