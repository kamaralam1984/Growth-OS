import tls from "node:tls";
import type { ParsedHtml } from "./html-parser";
import { safeFetchWebsite } from "./safe-fetch";

/**
 * A high-level, non-invasive security assessment — public HTTP
 * headers/cookies/HTTPS/TLS-handshake/known-sensitive-paths only, no
 * vulnerability scanning or auth testing. Always disclaimed as such
 * wherever this is shown, per the brief's explicit requirement to
 * distinguish this from real penetration testing.
 *
 * The TLS certificate/protocol check is a real handshake against the live
 * host (node:tls), not a third-party API — Node's own certificate-chain and
 * hostname validation populates authorizationError even with
 * rejectUnauthorized:false, so a genuinely expired/mismatched/self-signed
 * cert is detected exactly as a browser would flag it.
 */

const TLS_TIMEOUT_MS = 5_000;
const SENSITIVE_PATHS = ["/.env", "/.git/config"];
// OWASP/Mozilla Observatory's own threshold for a "real" HSTS policy — a
// max-age below 6 months leaves a meaningful downgrade-attack window.
const HSTS_STRONG_MAX_AGE_SECONDS = 15_552_000;

export interface SecurityFinding {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface TlsCheckResult {
  checked: boolean;
  authorized: boolean | null;
  authorizationError: string | null;
  protocol: string | null;
  daysUntilExpiry: number | null;
}

export interface SecurityAuditResult {
  isHttps: boolean;
  hasHsts: boolean;
  hasCsp: boolean;
  hasXFrameOptions: boolean;
  hasXContentTypeOptions: boolean;
  hasReferrerPolicy: boolean;
  hasPermissionsPolicy: boolean;
  cookiesSecureFlag: boolean | null;
  cookiesHttpOnlyFlag: boolean | null;
  mixedContentCount: number;
  corsMisconfigured: boolean;
  exposedSensitiveFileCount: number;
  tlsAuthorized: boolean | null;
  tlsProtocol: string | null;
  tlsDaysUntilExpiry: number | null;
  hstsMaxAgeSeconds: number | null;
  cspHasUnsafeDirectives: boolean | null;
  cookiesSameSiteFlag: boolean | null;
  missingSriScriptCount: number;
  securityScore: number;
  findings: SecurityFinding[];
}

/** A real TLS handshake against the live host — not a third-party API. */
function checkTlsCertificate(hostname: string): Promise<TlsCheckResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: TlsCheckResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let socket: tls.TLSSocket;
    try {
      socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: TLS_TIMEOUT_MS, rejectUnauthorized: false }, () => {
        const cert = socket.getPeerCertificate();
        const daysUntilExpiry = cert?.valid_to ? Math.round((new Date(cert.valid_to).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
        finish({
          checked: true,
          authorized: socket.authorized,
          authorizationError: socket.authorized ? null : String(socket.authorizationError ?? "Unknown TLS authorization error"),
          protocol: socket.getProtocol(),
          daysUntilExpiry,
        });
        socket.end();
      });
    } catch {
      finish({ checked: false, authorized: null, authorizationError: null, protocol: null, daysUntilExpiry: null });
      return;
    }

    socket.on("error", () => finish({ checked: false, authorized: null, authorizationError: null, protocol: null, daysUntilExpiry: null }));
    socket.on("timeout", () => {
      socket.destroy();
      finish({ checked: false, authorized: null, authorizationError: null, protocol: null, daysUntilExpiry: null });
    });
  });
}

/** Bounded real fetch of a handful of well-known sensitive paths — genuine misconfiguration detection, not a directory brute-force. */
async function checkExposedSensitiveFiles(base: URL): Promise<number> {
  const results = await Promise.all(SENSITIVE_PATHS.map((path) => safeFetchWebsite(new URL(path, base).toString())));
  return results.filter((r) => r.ok).length;
}

export async function analyzeSecurity(params: { finalUrl: string; headers: Headers; parsed: ParsedHtml }): Promise<SecurityAuditResult> {
  const { finalUrl, headers, parsed } = params;
  const base = new URL(finalUrl);
  const isHttps = finalUrl.startsWith("https://");
  const hstsHeader = headers.get("strict-transport-security");
  const hasHsts = Boolean(hstsHeader);
  const hstsMaxAgeSeconds = hstsHeader ? Number(hstsHeader.match(/max-age\s*=\s*(\d+)/i)?.[1] ?? NaN) : null;
  const hstsIsStrong = hstsMaxAgeSeconds !== null && !Number.isNaN(hstsMaxAgeSeconds) && hstsMaxAgeSeconds >= HSTS_STRONG_MAX_AGE_SECONDS;
  const cspHeader = headers.get("content-security-policy");
  const hasCsp = Boolean(cspHeader);
  const cspHasUnsafeDirectives = cspHeader ? /unsafe-inline|unsafe-eval/i.test(cspHeader) : null;
  const hasXFrameOptions = Boolean(headers.get("x-frame-options"));
  const hasXContentTypeOptions = Boolean(headers.get("x-content-type-options"));
  const hasReferrerPolicy = Boolean(headers.get("referrer-policy"));
  const hasPermissionsPolicy = Boolean(headers.get("permissions-policy"));

  const corsOrigin = headers.get("access-control-allow-origin");
  const corsCredentials = headers.get("access-control-allow-credentials");
  const corsMisconfigured = corsOrigin === "*" && /true/i.test(corsCredentials ?? "");

  const setCookieEntries: string[] =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : headers.get("set-cookie") ? [headers.get("set-cookie")!] : [];
  let cookiesSecureFlag: boolean | null = null;
  let cookiesHttpOnlyFlag: boolean | null = null;
  let cookiesSameSiteFlag: boolean | null = null;
  if (setCookieEntries.length > 0) {
    cookiesSecureFlag = setCookieEntries.every((c) => /;\s*secure/i.test(c));
    cookiesHttpOnlyFlag = setCookieEntries.every((c) => /;\s*httponly/i.test(c));
    cookiesSameSiteFlag = setCookieEntries.every((c) => /;\s*samesite\s*=\s*(strict|lax)/i.test(c));
  }

  // Real inspection of <script src="..."> tags: a cross-origin script with no
  // integrity="..." attribute is a genuine supply-chain risk (a compromised
  // third-party host/CDN can silently change what code runs on this page).
  let missingSriScriptCount = 0;
  for (const match of parsed.rawHtml.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = match[1];
    const src = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    let isCrossOrigin = false;
    try {
      isCrossOrigin = new URL(src, base).hostname !== base.hostname;
    } catch {
      continue;
    }
    if (isCrossOrigin && !/\bintegrity\s*=/i.test(attrs)) missingSriScriptCount++;
  }

  let mixedContentCount = 0;
  if (isHttps) {
    mixedContentCount += parsed.scriptSrcs.filter((s) => s.startsWith("http://")).length;
    mixedContentCount += parsed.stylesheetHrefs.filter((s) => s.startsWith("http://")).length;
    mixedContentCount += parsed.images.filter((i) => i.src.startsWith("http://")).length;
  }

  const [tlsResult, exposedSensitiveFileCount] = await Promise.all([
    isHttps ? checkTlsCertificate(base.hostname) : Promise.resolve<TlsCheckResult>({ checked: false, authorized: null, authorizationError: null, protocol: null, daysUntilExpiry: null }),
    checkExposedSensitiveFiles(base),
  ]);

  const modernProtocols = new Set(["TLSv1.3", "TLSv1.2"]);
  const tlsProtocolIsModern = tlsResult.protocol !== null && modernProtocols.has(tlsResult.protocol);

  const findings: SecurityFinding[] = [
    { label: "HTTPS", status: isHttps ? "pass" : "fail", detail: isHttps ? "Site is served over HTTPS." : "Site is not served over HTTPS." },
    {
      label: "Strict-Transport-Security (HSTS)",
      status: !hasHsts ? "warn" : hstsIsStrong ? "pass" : "warn",
      detail: !hasHsts ? "Not set." : hstsIsStrong ? `Present with max-age=${hstsMaxAgeSeconds}s (≥180 days).` : `Present but max-age=${hstsMaxAgeSeconds ?? "unparseable"}s is below the 180-day threshold for a durable policy.`,
    },
    {
      label: "Content-Security-Policy",
      status: !hasCsp ? "warn" : cspHasUnsafeDirectives ? "warn" : "pass",
      detail: !hasCsp ? "Not set." : cspHasUnsafeDirectives ? "Present, but allows 'unsafe-inline' or 'unsafe-eval' — this substantially weakens CSP's XSS protection." : "Present, with no unsafe-inline/unsafe-eval directives.",
    },
    { label: "X-Frame-Options", status: hasXFrameOptions ? "pass" : "warn", detail: hasXFrameOptions ? "Present." : "Not set — page may be embeddable in a clickjacking iframe." },
    { label: "X-Content-Type-Options", status: hasXContentTypeOptions ? "pass" : "warn", detail: hasXContentTypeOptions ? "Present." : "Not set." },
    { label: "Referrer-Policy", status: hasReferrerPolicy ? "pass" : "warn", detail: hasReferrerPolicy ? "Present." : "Not set — full URLs may leak to third parties via the Referer header." },
    { label: "Permissions-Policy", status: hasPermissionsPolicy ? "pass" : "warn", detail: hasPermissionsPolicy ? "Present." : "Not set." },
    {
      label: "CORS configuration",
      status: corsMisconfigured ? "fail" : "pass",
      detail: corsMisconfigured ? "Access-Control-Allow-Origin: * combined with Access-Control-Allow-Credentials: true — a real cross-origin credential-leak misconfiguration." : "No wildcard-origin + credentials misconfiguration detected.",
    },
    {
      label: "Cookie flags",
      status: cookiesSecureFlag === null ? "warn" : cookiesSecureFlag && cookiesHttpOnlyFlag && cookiesSameSiteFlag ? "pass" : "warn",
      detail: cookiesSecureFlag === null ? "No cookies observed on this request." : `Secure=${cookiesSecureFlag}, HttpOnly=${cookiesHttpOnlyFlag}, SameSite=${cookiesSameSiteFlag}`,
    },
    {
      label: "Subresource Integrity (SRI)",
      status: missingSriScriptCount === 0 ? "pass" : missingSriScriptCount <= 2 ? "warn" : "fail",
      detail: missingSriScriptCount === 0 ? "No cross-origin <script> tags are missing an integrity attribute." : `${missingSriScriptCount} cross-origin <script> tag(s) load without an integrity="..." attribute — a compromised third-party host could silently change this code.`,
    },
    {
      label: "Mixed content",
      status: mixedContentCount === 0 ? "pass" : "fail",
      detail: mixedContentCount === 0 ? "No http:// resources found on this https page." : `${mixedContentCount} http:// resource(s) found on an https page.`,
    },
    {
      label: "Exposed sensitive files",
      status: exposedSensitiveFileCount === 0 ? "pass" : "fail",
      detail: exposedSensitiveFileCount === 0 ? `Checked ${SENSITIVE_PATHS.join(", ")} — none publicly accessible.` : `${exposedSensitiveFileCount} of ${SENSITIVE_PATHS.length} checked path(s) (${SENSITIVE_PATHS.join(", ")}) are publicly accessible — real exposure risk.`,
    },
    {
      label: "TLS certificate",
      status: !isHttps ? "warn" : !tlsResult.checked ? "warn" : tlsResult.authorized ? "pass" : "fail",
      detail: !isHttps
        ? "N/A — site does not use HTTPS."
        : !tlsResult.checked
          ? "Could not complete a TLS handshake to verify the certificate."
          : tlsResult.authorized
            ? `Valid and trusted${tlsResult.daysUntilExpiry !== null ? ` — expires in ${tlsResult.daysUntilExpiry} day(s).` : "."}`
            : `Not trusted — ${tlsResult.authorizationError}.`,
    },
    {
      label: "TLS protocol version",
      status: !isHttps ? "warn" : !tlsResult.protocol ? "warn" : tlsProtocolIsModern ? "pass" : "fail",
      detail: !isHttps ? "N/A — site does not use HTTPS." : tlsResult.protocol ? `Negotiated ${tlsResult.protocol}${tlsProtocolIsModern ? "" : " — outdated/deprecated, upgrade to TLS 1.2+."}` : "Could not determine negotiated protocol.",
    },
  ];

  // Each header's flat weight from before is now split into a presence
  // component + a "done properly" bonus (HSTS max-age, CSP unsafe
  // directives) so the max attainable per-header score is unchanged (7 and 9
  // respectively) but a shallow/misconfigured header no longer scores
  // identically to a genuinely strong one. missingSriScriptCount is a pure
  // deduction, same pattern as seoScore's brokenCount penalty.
  let score = 0;
  score += isHttps ? 18 : 0;
  score += hasHsts ? 4 + (hstsIsStrong ? 3 : 0) : 0;
  score += hasCsp ? 6 + (cspHasUnsafeDirectives ? 0 : 3) : 0;
  score += hasXFrameOptions ? 7 : 0;
  score += hasXContentTypeOptions ? 7 : 0;
  score += hasReferrerPolicy ? 5 : 0;
  score += hasPermissionsPolicy ? 5 : 0;
  score += corsMisconfigured ? 0 : 5;
  score += cookiesSecureFlag === null ? 3 : cookiesSecureFlag && cookiesHttpOnlyFlag ? 4 + (cookiesSameSiteFlag ? 2 : 0) : 0;
  score += mixedContentCount === 0 ? 6 : 0;
  score += exposedSensitiveFileCount === 0 ? 7 : 0;
  score += isHttps ? (tlsResult.authorized ? 10 : tlsResult.checked ? 0 : 5) : 0;
  score += isHttps ? (tlsProtocolIsModern ? 8 : tlsResult.protocol ? 0 : 4) : 0;
  score -= Math.min(5, missingSriScriptCount * 2);
  const securityScore = Math.max(0, Math.min(100, Math.round(score)));

  return {
    isHttps,
    hasHsts,
    hasCsp,
    hasXFrameOptions,
    hasXContentTypeOptions,
    hasReferrerPolicy,
    hasPermissionsPolicy,
    cookiesSecureFlag,
    cookiesHttpOnlyFlag,
    mixedContentCount,
    corsMisconfigured,
    exposedSensitiveFileCount,
    tlsAuthorized: tlsResult.authorized,
    tlsProtocol: tlsResult.protocol,
    tlsDaysUntilExpiry: tlsResult.daysUntilExpiry,
    hstsMaxAgeSeconds,
    cspHasUnsafeDirectives,
    cookiesSameSiteFlag,
    missingSriScriptCount,
    securityScore,
    findings,
  };
}
