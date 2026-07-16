import { promises as dns } from "node:dns";
import net from "node:net";

/**
 * Real SSRF protection for a server that fetches arbitrary user-supplied
 * URLs. Nothing in this repo does this yet (geocode.ts only calls a fixed,
 * trusted host), so this is built from scratch:
 *  - only http/https, with a hostname
 *  - the hostname is DNS-resolved and the resolved IP is checked against
 *    private/loopback/link-local ranges (blocks "http://localhost", raw IPs,
 *    AND hostnames that resolve to an internal IP)
 *  - every redirect hop is re-validated the same way (blocks a public host
 *    redirecting to an internal one) — resolved manually up to 5 hops
 *  - a request timeout and a response-size cap guard against slow-loris /
 *    memory-exhaustion abuse
 * This is a solid, documented mitigation — not a claim of perfect SSRF
 * immunity (e.g. TOCTOU DNS-rebinding between the check and the actual
 * connect is a known residual risk of any DNS-based allowlist approach
 * without a custom low-level socket agent; documented as a limitation).
 */

const USER_AGENT = "KVL-GrowthOS-WebsiteScanner/1.0 (business website audit; contact via app owner)";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB

export interface SafeFetchSuccess {
  ok: true;
  html: string;
  headers: Headers;
  status: number;
  finalUrl: string;
  responseTimeMs: number;
}

export interface SafeFetchFailure {
  ok: false;
  error: string;
}

export type SafeFetchResult = SafeFetchSuccess | SafeFetchFailure;

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
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — check the embedded IPv4 too.
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIpv4(mapped[1]);
  return false;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h === "0.0.0.0";
}

async function assertPublicHost(hostname: string): Promise<string | null> {
  if (isPrivateOrLocalHostname(hostname)) return `"${hostname}" is a local/internal hostname — not scannable.`;

  if (net.isIP(hostname)) {
    const isPrivate = net.isIPv4(hostname) ? isPrivateIpv4(hostname) : isPrivateIpv6(hostname);
    return isPrivate ? `"${hostname}" is a private/internal IP address — not scannable.` : null;
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const record of records) {
      const isPrivate = record.family === 4 ? isPrivateIpv4(record.address) : isPrivateIpv6(record.address);
      if (isPrivate) return `"${hostname}" resolves to a private/internal IP address — not scannable.`;
    }
    if (records.length === 0) return `"${hostname}" did not resolve to any address.`;
    return null;
  } catch {
    return `Could not resolve "${hostname}".`;
  }
}

function validateUrlShape(raw: string): { url: URL } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: "Enter a valid website URL, e.g. https://example.com" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: "Only http:// and https:// URLs can be scanned." };
  }
  return { url };
}

/**
 * Fetches a real website's HTML server-side with SSRF protection, a request
 * timeout, and a response-size cap. Never throws — returns a discriminated
 * result, matching this app's "honest degrade" convention (geocodeAddress,
 * sendEmail): a failure is a real, visible failure state, never a silent
 * fallback to fabricated data.
 */
export async function safeFetchWebsite(rawUrl: string): Promise<SafeFetchResult> {
  const shape = validateUrlShape(rawUrl);
  if ("error" in shape) return { ok: false, error: shape.error };

  let currentUrl = shape.url;
  const startedAt = Date.now();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const hostError = await assertPublicHost(currentUrl.hostname);
    if (hostError) return { ok: false, error: hostError };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(currentUrl.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      });
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error && error.name === "AbortError" ? "The website took too long to respond." : "Could not reach that website.";
      return { ok: false, error: message };
    }
    clearTimeout(timeout);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { ok: false, error: `Received a redirect (${response.status}) with no destination.` };
      try {
        currentUrl = new URL(location, currentUrl);
      } catch {
        return { ok: false, error: "Redirect target was not a valid URL." };
      }
      if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
        return { ok: false, error: "Redirected to a non-http(s) URL." };
      }
      continue; // re-validate the new host on the next loop iteration
    }

    if (!response.ok) {
      return { ok: false, error: `The website responded with HTTP ${response.status}.` };
    }

    const reader = response.body?.getReader();
    if (!reader) return { ok: false, error: "The website returned an empty response." };

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        return { ok: false, error: "The website's response was too large to scan." };
      }
      chunks.push(value);
    }

    const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");
    return {
      ok: true,
      html,
      headers: response.headers,
      status: response.status,
      finalUrl: currentUrl.toString(),
      responseTimeMs: Date.now() - startedAt,
    };
  }

  return { ok: false, error: "Too many redirects." };
}
