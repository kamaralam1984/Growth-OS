import type { ParsedHtml } from "./html-parser";

/**
 * A high-level, non-invasive security assessment — public HTTP
 * headers/cookies/HTTPS only, no vulnerability scanning or auth testing.
 * Always disclaimed as such wherever this is shown, per the brief's explicit
 * requirement to distinguish this from real penetration testing.
 */

export interface SecurityFinding {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface SecurityAuditResult {
  isHttps: boolean;
  hasHsts: boolean;
  hasCsp: boolean;
  hasXFrameOptions: boolean;
  hasXContentTypeOptions: boolean;
  cookiesSecureFlag: boolean | null;
  cookiesHttpOnlyFlag: boolean | null;
  mixedContentCount: number;
  securityScore: number;
  findings: SecurityFinding[];
}

export function analyzeSecurity(params: { finalUrl: string; headers: Headers; parsed: ParsedHtml }): SecurityAuditResult {
  const { finalUrl, headers, parsed } = params;
  const isHttps = finalUrl.startsWith("https://");
  const hasHsts = Boolean(headers.get("strict-transport-security"));
  const hasCsp = Boolean(headers.get("content-security-policy"));
  const hasXFrameOptions = Boolean(headers.get("x-frame-options"));
  const hasXContentTypeOptions = Boolean(headers.get("x-content-type-options"));

  const setCookieEntries: string[] =
    typeof headers.getSetCookie === "function" ? headers.getSetCookie() : headers.get("set-cookie") ? [headers.get("set-cookie")!] : [];
  let cookiesSecureFlag: boolean | null = null;
  let cookiesHttpOnlyFlag: boolean | null = null;
  if (setCookieEntries.length > 0) {
    cookiesSecureFlag = setCookieEntries.every((c) => /;\s*secure/i.test(c));
    cookiesHttpOnlyFlag = setCookieEntries.every((c) => /;\s*httponly/i.test(c));
  }

  let mixedContentCount = 0;
  if (isHttps) {
    mixedContentCount += parsed.scriptSrcs.filter((s) => s.startsWith("http://")).length;
    mixedContentCount += parsed.stylesheetHrefs.filter((s) => s.startsWith("http://")).length;
    mixedContentCount += parsed.images.filter((i) => i.src.startsWith("http://")).length;
  }

  const findings: SecurityFinding[] = [
    { label: "HTTPS", status: isHttps ? "pass" : "fail", detail: isHttps ? "Site is served over HTTPS." : "Site is not served over HTTPS." },
    { label: "Strict-Transport-Security (HSTS)", status: hasHsts ? "pass" : "warn", detail: hasHsts ? "Present." : "Not set." },
    { label: "Content-Security-Policy", status: hasCsp ? "pass" : "warn", detail: hasCsp ? "Present." : "Not set." },
    { label: "X-Frame-Options", status: hasXFrameOptions ? "pass" : "warn", detail: hasXFrameOptions ? "Present." : "Not set — page may be embeddable in a clickjacking iframe." },
    { label: "X-Content-Type-Options", status: hasXContentTypeOptions ? "pass" : "warn", detail: hasXContentTypeOptions ? "Present." : "Not set." },
    {
      label: "Cookie flags",
      status: cookiesSecureFlag === null ? "warn" : cookiesSecureFlag && cookiesHttpOnlyFlag ? "pass" : "warn",
      detail: cookiesSecureFlag === null ? "No cookies observed on this request." : `Secure=${cookiesSecureFlag}, HttpOnly=${cookiesHttpOnlyFlag}`,
    },
    {
      label: "Mixed content",
      status: mixedContentCount === 0 ? "pass" : "fail",
      detail: mixedContentCount === 0 ? "No http:// resources found on this https page." : `${mixedContentCount} http:// resource(s) found on an https page.`,
    },
  ];

  let score = 0;
  score += isHttps ? 30 : 0;
  score += hasHsts ? 12 : 0;
  score += hasCsp ? 15 : 0;
  score += hasXFrameOptions ? 12 : 0;
  score += hasXContentTypeOptions ? 11 : 0;
  score += cookiesSecureFlag ? 10 : cookiesSecureFlag === null ? 5 : 0;
  score += mixedContentCount === 0 ? 10 : 0;
  const securityScore = Math.max(0, Math.min(100, Math.round(score)));

  return { isHttps, hasHsts, hasCsp, hasXFrameOptions, hasXContentTypeOptions, cookiesSecureFlag, cookiesHttpOnlyFlag, mixedContentCount, securityScore, findings };
}
