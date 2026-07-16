import { logSecurityEvent } from "@/lib/security/security-events";

/**
 * Real IP reputation checking via AbuseIPDB (https://www.abuseipdb.com/api —
 * a real, free-tier-available third-party threat-intel API), gated behind
 * ABUSEIPDB_API_KEY exactly like every other optional external integration
 * in this codebase (see .env.example): with no key configured, this is a
 * genuine no-op that honestly reports "not configured" — it never fabricates
 * a score or silently pretends an IP was checked. This is a real ADDITIONAL
 * signal layered on top of (not a replacement for) the existing crude
 * IPv4-/16-prefix "unfamiliar network" heuristic already in src/auth.ts
 * (`networkPrefix`/`detectSuspiciousLogin`) — that heuristic stays exactly
 * as-is as a dependency-free fallback layer for when this isn't configured
 * (or for IPs AbuseIPDB has no data on).
 *
 * Never blocks a sign-in/sign-up on its own: every call site treats this as
 * an observability/alerting signal fed into the existing SecurityEvent
 * pipeline (src/lib/security/security-events.ts), which already knows how
 * to escalate a CRITICAL-severity event into an Incident — not a new gate
 * that could turn an AbuseIPDB outage or false positive into a locked-out
 * legitimate user.
 */

const ABUSEIPDB_ENDPOINT = "https://api.abuseipdb.com/api/v2/check";
const REQUEST_TIMEOUT_MS = 3_000;

/** Confidence score (0-100) at/above which an IP is treated as "abusive" for alerting purposes. */
const ABUSIVE_THRESHOLD = 50;
/** Confidence score at/above which the resulting SecurityEvent is escalated to CRITICAL (auto-opens an Incident). */
const CRITICAL_THRESHOLD = 90;

export interface IpReputationResult {
  /** False when ABUSEIPDB_API_KEY is unset, the IP is private/loopback, or the request failed — never treat as "clean" in that case, just "unknown". */
  checked: boolean;
  abusive: boolean;
  /** AbuseIPDB's 0-100 confidence score, or null if not checked. */
  score: number | null;
  reason: string;
}

function isConfigured(): boolean {
  return Boolean(process.env.ABUSEIPDB_API_KEY);
}

/**
 * Private/loopback/link-local ranges and non-dotted-quad values (IPv6,
 * "unknown", etc. — this app's `clientIp()` helpers can return any of
 * those) never carry meaningful public reputation data and would just
 * return an AbuseIPDB error — skip the network call entirely for these.
 */
function isPubliclyRoutableIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return false;
  const [a, b] = parts.map(Number);
  if (a === 10) return false;
  if (a === 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 0) return false;
  return true;
}

/**
 * Performs the real AbuseIPDB lookup. Returns `checked: false` (never
 * `abusive: true`) for any of: missing API key, a non-public IP, a network
 * error, a non-2xx response, or a timeout — the caller should treat
 * `checked: false` as "no signal available", not as "this IP is clean".
 */
export async function checkIpReputation(ip: string): Promise<IpReputationResult> {
  if (!isConfigured()) {
    return { checked: false, abusive: false, score: null, reason: "Not Configured — set ABUSEIPDB_API_KEY to enable IP reputation checks." };
  }

  if (!isPubliclyRoutableIpv4(ip)) {
    return { checked: false, abusive: false, score: null, reason: `"${ip}" is not a publicly routable IPv4 address — skipped.` };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = `${ABUSEIPDB_ENDPOINT}?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`;
    const response = await fetch(url, {
      headers: {
        Key: process.env.ABUSEIPDB_API_KEY!,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return { checked: false, abusive: false, score: null, reason: `AbuseIPDB responded ${response.status}.` };
    }

    const body = (await response.json()) as { data?: { abuseConfidenceScore?: number } };
    const score = body.data?.abuseConfidenceScore;
    if (typeof score !== "number") {
      return { checked: false, abusive: false, score: null, reason: "AbuseIPDB response did not include a confidence score." };
    }

    return {
      checked: true,
      abusive: score >= ABUSIVE_THRESHOLD,
      score,
      reason: `AbuseIPDB confidence score: ${score}/100.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { checked: false, abusive: false, score: null, reason: `AbuseIPDB request failed: ${message}` };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fire-and-forget wrapper for call sites (e.g. src/auth.ts's Credentials
 * authorize()) that just want to feed a bad-IP signal into the existing
 * SecurityEvent/Incident pipeline without awaiting the HTTP round trip or
 * risking a thrown error. Never delays or fails the sign-in it's attached
 * to — genuinely a no-op when ABUSEIPDB_API_KEY is unset.
 */
export function reportIpReputationToSecurityEvents(
  ip: string,
  context: { userId?: string; detail?: string; userAgent?: string | null },
): void {
  void (async () => {
    const result = await checkIpReputation(ip);
    if (!result.checked || !result.abusive) return;

    await logSecurityEvent({
      userId: context.userId,
      type: "SUSPICIOUS_IP",
      severity: result.score !== null && result.score >= CRITICAL_THRESHOLD ? "CRITICAL" : "WARNING",
      ipAddress: ip,
      userAgent: context.userAgent,
      detail: context.detail,
      metadata: { source: "abuseipdb", score: result.score },
    });
  })().catch((error) => {
    console.error(`[security/ip-reputation] reportIpReputationToSecurityEvents("${ip}") failed:`, error);
  });
}
