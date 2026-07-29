import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import { checkRateLimitDegradable } from "@/lib/security/rate-limit-distributed";
import { clientIpFromHeaders } from "@/lib/security/client-ip";

/**
 * NOTE ON NAMING: this project is on Next.js 16, where the `middleware.ts`
 * file convention is deprecated in favor of `proxy.ts` (exported function
 * `proxy` instead of `middleware`) — see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
 * The runtime behavior is identical to classic middleware; only the file
 * name/export changed. A proxy.ts file may export only a single proxy
 * function, so the optimistic page auth-gate below and the CSRF check for
 * `/api/*` both live in the one handler rather than in separate files.
 *
 * This performs an OPTIMISTIC auth check only (JWT session cookie decoded
 * via `auth()`, no database round-trip) to gate a small set of
 * authenticated-only route prefixes, per Next's own recommended pattern
 * (see 01-app/02-guides/authentication.md#optimistic-checks-with-proxy-optional).
 * Every Server Action/route handler still independently checks `await auth()`
 * against the database session — this is a fast pre-filter, not the only
 * line of defense.
 *
 * CSRF PROTECTION FOR `/api/*`: Server Actions ("use server" functions)
 * already get same-origin protection for free from the framework itself,
 * which checks the `Origin` header on every POST to the Server Action
 * endpoint — they don't need anything here. The hand-written REST-style
 * route handlers under `src/app/api/` have no such built-in check, so this
 * proxy verifies `Origin` (falling back to `Referer`) against the app's
 * own origin for every non-GET `/api/*` request, using the standard
 * origin-check CSRF mitigation.
 *
 * Exempt from that check — these are legitimately called cross-origin, not
 * by this app's own frontend, and rely on their own verification instead:
 *   - `/api/webhooks/...` — DocuSign/Adobe Sign/Dropbox Sign call these
 *     directly; each verifies an HMAC/signature header instead (see
 *     `verifySignature`/`verifyClientId` in each provider's route handler
 *     under `src/app/api/webhooks/`).
 *   - `/api/integrations/<provider>/callback` — Google/Microsoft/DocuSign/etc.
 *     redirect the user's browser back here after OAuth; authenticity comes
 *     from the signed, HMAC-verified `state` param minted by
 *     `src/lib/integrations/state.ts`, not from same-origin-ness.
 *   - `/api/auth/*` — NextAuth's own routes, which have their own CSRF
 *     protection via a signed double-submit cookie (see
 *     `node_modules/@auth/core/lib/actions/callback/oauth/csrf-token.d.ts`).
 *   - `/api/outreach/track/*` and `/api/documents/track/*` — open/click
 *     tracking pixels and redirects hit directly by email clients, not by
 *     browsers making same-origin requests; they carry no `Origin` header
 *     under normal use. (These are also GET-only today, so the non-GET
 *     check below wouldn't touch them regardless.)
 *   - `/api/v1/*`, `/api/export/*`, `/api/graphql` — the public,
 *     Bearer-token-authenticated developer API (see
 *     src/lib/developer-platform-content.ts and /developers). External
 *     CLI/SDK/third-party clients are cross-origin by definition; a
 *     same-origin check would block every real API client. Authenticity
 *     here comes from `verifyApiKeyAuth`'s bcrypt-checked bearer token, not
 *     from same-origin-ness — this was missed when that API was first
 *     built and caught by a live production test immediately after.
 */
const PROTECTED_PREFIXES = ["/profile", "/company", "/onboarding"];

const CSRF_EXEMPT_PREFIXES = [
  "/api/webhooks/",
  "/api/auth/",
  "/api/outreach/track/",
  "/api/documents/track/",
  "/api/v1/",
  "/api/export/",
  "/api/graphql",
];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isCsrfExempt(pathname: string): boolean {
  if (CSRF_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return /^\/api\/integrations\/[^/]+\/callback\/?$/.test(pathname);
}

/**
 * Real, multi-instance-correct sign-in-attempt throttle at the edge, keyed
 * only by IP (not by email/credential — this proxy never reads the request
 * body). This is deliberately a coarser, additional layer on top of the
 * existing per-(email, IP) check already enforced inside Credentials'
 * authorize() (src/auth.ts) — that one still runs, unchanged, for every
 * request that gets this far. Sitting in front of it here, at the one place
 * that runs identically on every app instance, closes the gap the old
 * purely in-memory limiter had: a distributed brute-force attempt spread
 * across many different email addresses from the same IP (which the
 * per-email+IP check alone would never throttle) and, in a multi-instance
 * deployment, an attacker spread across instances (which a per-process Map
 * could never see as one attacker in the first place).
 *
 * Covers exactly the sign-in-attempt endpoints, both Credentials and
 * Passkey/WebAuthn: the actual NextAuth callback each hits, plus the
 * WebAuthn options endpoint (issues a fresh challenge — cheap, but still
 * worth capping so it can't be used to spam Redis/DB writes).
 */
const RATE_LIMITED_AUTH_PATHS = new Set([
  "/api/auth/callback/credentials",
  "/api/auth/callback/webauthn",
  "/api/auth/webauthn-options/webauthn",
]);

function isRateLimitedAuthPath(pathname: string): boolean {
  return RATE_LIMITED_AUTH_PATHS.has(pathname);
}

function clientIp(request: NextRequest): string {
  return clientIpFromHeaders(request.headers);
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function blockedByCsrf(request: NextRequest): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  if (isCsrfExempt(request.nextUrl.pathname)) return false;

  const originHeader = request.headers.get("origin") ?? refererOrigin(request.headers.get("referer"));
  return originHeader !== request.nextUrl.origin;
}

/**
 * Real security headers (Enterprise Security hardening phase) applied to
 * EVERY response this proxy produces — CSP, clickjacking/MIME-sniffing/
 * referrer/permissions hardening, plus HSTS once actually served over
 * HTTPS in production. A proxy.ts file may only export one proxy
 * function, so this is applied as the last step on every branch below
 * (redirect/json/next) rather than living in a separate file.
 *
 * CSP uses the documented "without nonces" static policy
 * (node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md)
 * rather than per-request nonces — a nonce-based CSP forces every page in
 * this app into dynamic rendering (no ISR/static optimization anywhere), a
 * real performance tradeoff not taken in this pass. `'unsafe-inline'` for
 * styles/scripts is required for this app's real, existing use of inline
 * style props (framer-motion/gsap animations, dynamic brand-theme colors)
 * and Next's own inline bootstrap script without nonce wiring — tightening
 * to a nonce-based policy is a valid future hardening step, not done here
 * to avoid an unverified visual-regression risk across the whole app.
 */
const CSP_HEADER = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS: Array<[string, string]> = [
  ["Content-Security-Policy", CSP_HEADER],
  ["X-Frame-Options", "DENY"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), browsing-topics=()"],
  ...(process.env.NODE_ENV === "production"
    ? ([["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"]] as Array<[string, string]>)
    : []),
];

function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of SECURITY_HEADERS) {
    response.headers.set(key, value);
  }
  return response;
}

export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;

  if (pathname.startsWith("/api/") && blockedByCsrf(req)) {
    return withSecurityHeaders(NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 }));
  }

  if (isRateLimitedAuthPath(pathname)) {
    const rate = await checkRateLimitDegradable(`proxy:auth:${clientIp(req)}`, {
      limit: 30,
      windowMs: 10 * 60_000,
    });
    if (!rate.allowed) {
      return withSecurityHeaders(
        NextResponse.json({ error: "Too many sign-in attempts. Please try again in a few minutes." }, { status: 429 }),
      );
    }
  }

  if (!isProtectedPath(pathname)) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  return withSecurityHeaders(NextResponse.next());
});

export const config = {
  // Run on everything except static assets, image optimization, and common
  // metadata files. Deliberately NOT excluding /api or Server Function POSTs
  // here: /profile, /company, /onboarding Server Actions post back to their
  // own page path and must stay behind the auth-gate check above, and the
  // CSRF check above needs to see every /api/* request too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|opengraph-image).*)"],
};
