# KVL GrowthOS — Security Guide

> A real inventory of this app's security posture, sourced from the actual files listed below. Last reconciled against an adversarial 5-track security review (auth/sessions, RBAC/ABAC/IDOR, injection/XSS, secrets/crypto/webhooks, SSRF/uploads/OAuth) whose findings were fixed in commit `b3d2273` and after — see §8 for what was found/fixed and what honestly remains.

## 1. Network/transport-layer hardening — `src/proxy.ts`

Next.js 16 renamed `middleware.ts` to `proxy.ts` (the file's own header comment cites `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`). This one file is responsible for:

- **CSRF protection for `/api/*`.** Server Actions get same-origin protection for free from the framework (it checks `Origin` on every Server Action POST); the hand-written REST routes under `src/app/api/` do not, so `blockedByCsrf()` in `src/proxy.ts` checks the `Origin` header (falling back to `Referer`) against the app's own origin for every non-GET `/api/*` request, returning `403 { error: "Cross-origin request blocked." }` on mismatch. Explicitly exempted (each with its own independent verification instead): `/api/webhooks/*` (signature/HMAC-verified), `/api/auth/*` (NextAuth's own double-submit-cookie CSRF), `/api/integrations/*/callback` (HMAC-signed `state` param), and the tracking-pixel routes under `/api/outreach/track/*` / `/api/documents/track/*` (hit directly by email clients, carry no `Origin`).
- **Content-Security-Policy and other security headers**, applied to every response via `withSecurityHeaders()`:
  - `Content-Security-Policy`: `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (plus `'unsafe-eval'` in development only), `style-src 'self' 'unsafe-inline'`, `object-src 'none'`, `frame-ancestors 'none'`, `upgrade-insecure-requests`, etc.
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation/browsing-topics all denied).
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` — added **only** when `NODE_ENV === "production"`.
  - The file's own comment is explicit about a real, undone tradeoff: this CSP uses the "without nonces" static policy rather than a per-request-nonce policy, because a nonce-based CSP would force every page into dynamic rendering (losing ISR/static optimization) and this app genuinely relies on inline styles (framer-motion/gsap) today — documented as "a valid future hardening step, not done here to avoid an unverified visual-regression risk."
- **Optimistic auth gating** for `/profile`, `/company`, `/onboarding` (JWT-cookie decode only, no DB round-trip) — every Server Action/route handler still independently re-checks `await auth()` against the database session; this is a fast pre-filter, not the sole line of defense.

## 2. Authentication hardening — `src/auth.ts`

- **Two-factor authentication (TOTP).** `User.twoFactorEnabled`/`twoFactorSecret` gate a second factor on the Credentials provider. If 2FA is enabled and no code (or an invalid one) is submitted, `authorize()` throws a typed `TwoFactorRequiredSignin`/`TwoFactorInvalidSignin` (both subclass `CredentialsSignin` with a distinct `.code`) so the login page can show a "enter your 6-digit code" field rather than a hard failure. Verification uses `otplib`'s `verify()` with `epochTolerance: 30`.
- **Persistent account lockout**, independent from the rolling in-memory rate limiter: `User.failedLoginAttempts`/`lockedUntil` — after `MAX_FAILED_ATTEMPTS = 5` wrong passwords, the account locks for `LOCKOUT_MINUTES = 15`, durable across process restarts (unlike the in-memory limiter below).
- **Rolling in-memory rate limiting** on sign-in attempts, keyed on `email+IP` (`checkRateLimit`, `src/lib/rate-limit.ts`) — 10 attempts / 10 minutes — so one bad actor can't lock out a real user's email from a different IP while still throttling a single source hammering many emails. The "IP" half of that key is `clientIpFromHeaders()` (`src/lib/security/client-ip.ts`, one shared helper used everywhere an IP is read) — it trusts `X-Real-IP` (which nginx always overwrites to `$remote_addr` before forwarding, never client-controlled) rather than `X-Forwarded-For`'s first entry, which a client can freely prepend to and rotate on every request.
- **The client-portal login** (`src/app/portal/_lib/actions.ts`, a separate credential system for `ClientPortalUser`) has the same two layers — a distributed rate limit and a persistent `failedLoginAttempts`/`lockedUntil` lockout on the `ClientPortalUser` row — not just the main app's `User` login.
- **A second, distributed rate limiter** now exists at `src/lib/security/rate-limit-distributed.ts` (`checkDistributedRateLimit`) — a real Redis sorted-set sliding window, correct across multiple server instances (the existing in-memory limiter is explicitly documented as single-process-only, with 31 existing call sites left untouched). It fails **open** on a Redis outage — the same fail-open posture `src/lib/cache/redis-cache.ts` already takes for cache misses — because a rate limiter failing closed would turn a Redis outage into a full user-facing outage.
- **Device fingerprinting / new-device & suspicious-login alerts.** `DeviceSession` rows are recorded on every sign-in (`src/lib/device-session.ts`, matched heuristically on `(userId, userAgent)`). A genuinely new device triggers a "new sign-in to your account" email (`sendNewDeviceAlert`); if that new device is **also** on a network prefix (`networkPrefix()` — a crude, documented-as-approximate IPv4 /16 comparison, not real geo-IP) never seen for this user in the last 30 days, a stronger "unusual sign-in activity" alert fires as well (`sendSuspiciousLoginAlert` + an in-app `CRITICAL_ALERT` notification + an `auth.suspicious_login_detected` `AuditLog` entry).
- **"Logout everywhere."** Because sessions are stateless JWTs (`session: { strategy: "jwt" }`), `User.sessionInvalidatedAt` is checked on every `jwt()` callback invocation (which Auth.js re-runs on every session check, not just at sign-in) — any token minted before that timestamp is rejected, returning `null` and dropping the session. A password reset via `/api/reset-password` now bumps this same timestamp (and clears `DeviceSession`/`Session` rows) — a reset terminates every other already-issued session, not just future sign-in attempts with the old password.
- **Invalid TOTP codes count toward the same lockout as invalid passwords**, and **disabling 2FA requires re-entering the current password** — a correct password alone no longer gives unlimited 6-digit-code guesses, and a hijacked-but-not-yet-expired session can't silently strip the account's second factor.
- **Real "remember me."** A custom `jwt.encode` override picks `maxAge` (1 day session-only vs. 30 days remembered) per-login based on the token's own `rememberMe` flag, since `@auth/core`'s default `encode()` always recomputes `exp` from the `maxAge` passed to it.
- **Failed-login and brute-force events are logged**, not just enforced: every failed password check calls `logSecurityEvent()` with type `LOGIN_FAILED` (severity `WARNING`) or, once the attempt trips the lockout threshold, `BRUTE_FORCE_DETECTED` (severity `CRITICAL`).

## 3. Password hashing — `src/lib/auth/password.ts`

- **Argon2id** (OWASP's current recommendation over bcrypt) via the `argon2` package, for every user-chosen password (`User.password`, `ClientPortalUser.passwordHash`).
- **Existing bcrypt hashes keep working** — `verifyPassword()` detects the hash format (`$2a$`/`$2b$`/$2y$` prefix vs. `$argon2` prefix) and calls the matching algorithm; there is no forced reset.
- **Transparent upgrade on next successful login.** `needsRehash()`/`rehashIfNeeded()` implement the standard pattern: a bcrypt hash is only ever re-hashed to Argon2 immediately after this exact call already verified the plaintext password was correct — never speculatively.
- API keys deliberately stay on **bcrypt**, not Argon2 — the code comment in this file explains why: bcrypt's cost factor defends against brute-forcing a low-entropy *human-chosen* secret, which a 256-bit random API key was never at risk from; switching would be pure churn.

## 4. The five independent AES-256-GCM encryption key domains

Confirmed by grepping `_ENCRYPTION_KEY` across `.env.example` and `src/`:

| Env var | File that consumes it | Protects |
|---|---|---|
| `AGENT_MEMORY_ENCRYPTION_KEY` | `src/lib/ai/encryption.ts` | AI Agent Memory contents |
| `INTEGRATION_TOKEN_ENCRYPTION_KEY` | `src/lib/integrations/crypto.ts` | `IntegrationConnection`'s OAuth access/refresh tokens and stored API-key credentials |
| `SECRETS_MANAGER_ENCRYPTION_KEY` | `src/lib/secrets/crypto.ts` | The org-level Secrets Manager's `Secret.encryptedValue` (`/dashboard/settings/secrets`) |
| `WEBHOOK_SECRET_ENCRYPTION_KEY` | `src/lib/workflows/webhooks.ts` | Automation Workflow outbound webhook signing secrets |
| `TWO_FACTOR_SECRET_ENCRYPTION_KEY` | `src/lib/auth/two-factor-crypto.ts` | `User.twoFactorSecret` (previously stored in plaintext — a DB dump alone was enough to generate valid TOTP codes; fixed) |

Every one of these five files independently throws a startup/runtime error if its own env var is missing or not a 64-character hex string (32 bytes) — e.g. `src/lib/integrations/crypto.ts`: *"`INTEGRATION_TOKEN_ENCRYPTION_KEY` must be set to a 64-character hex string (32 bytes) to store integration tokens."* Each key's own doc comment explicitly states the reason for the separation: rotating any one must never break the others. Generate each with `openssl rand -hex 32`. See `docs/guides/operations-manual.md` for the real rotation procedure per domain.

## 5. Webhook signature verification per payment gateway (`src/lib/billing/gateway/*.ts`)

Every `PlatformGateway.verifyAndParseWebhook()` implementation verifies the raw request body against that gateway's own real signature scheme before any event is processed, returning `null` (never throwing) on failure so the route can respond `400` and log rather than process an unverified payload:

| Gateway | File | Verification method |
|---|---|---|
| Stripe | `src/lib/billing/gateway/stripe.ts` | `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` against the `stripe-signature` header |
| Razorpay | `src/lib/billing/gateway/razorpay.ts` | HMAC-SHA256 over the raw body with `RAZORPAY_WEBHOOK_SECRET`, compared to the `x-razorpay-signature` header via `timingSafeEqual` |
| Paddle | `src/lib/billing/gateway/paddle.ts` | Parses the `paddle-signature` header's `ts=...;h1=...` parts, HMAC-SHA256 over `${timestamp}:${rawBody}` with `PADDLE_WEBHOOK_SECRET`, `timingSafeEqual` comparison |
| LemonSqueezy | `src/lib/billing/gateway/lemonsqueezy.ts` | HMAC-SHA256 over the raw body with `LEMONSQUEEZY_WEBHOOK_SECRET`, compared to the `x-signature` header via `timingSafeEqual` |

All four use Node's `crypto.timingSafeEqual` (not `===`) for the comparison — a real timing-attack mitigation, not just a functional check. The route handler (`src/app/api/webhooks/billing/[provider]/route.ts`) always reads the body as raw text first, never `request.json()`, since parsing first would break every one of these signature checks.

The e-signature and email-delivery webhooks now fail **closed** (reject with a logged error) rather than processing unsigned payloads when their secret is unset — the same posture as the payment gateways above:

| Provider | File | Verification method |
|---|---|---|
| DocuSign | `src/app/api/webhooks/docusign/route.ts` | HMAC-SHA256 (base64) over the raw body with `DOCUSIGN_WEBHOOK_HMAC_SECRET`, `x-docusign-signature-1` header, `timingSafeEqual` |
| Adobe Sign | `src/app/api/webhooks/adobe-sign/route.ts` | `X-AdobeSign-ClientId` header matched against `ADOBE_SIGN_CLIENT_ID` — this **is** Adobe Acrobat Sign's real, documented verification mechanism (no separate HMAC option exists for this product); the route also implements the `GET` webhook-registration handshake Acrobat Sign requires (echoing the client ID back), which was previously missing entirely |
| Dropbox Sign | `src/app/api/webhooks/dropbox-sign/route.ts` | HMAC-SHA256 of `event_time + event_type` keyed by `DROPBOX_SIGN_CLIENT_SECRET`, compared to `event.event_hash` via `timingSafeEqual` — an earlier version of this handler used a non-standard plain-hash scheme that would never have matched a real Dropbox Sign callback; now matches Dropbox's documented scheme |
| Resend | `src/app/api/webhooks/resend/route.ts` | Svix-based verification (`svix-id`/`svix-timestamp`/`svix-signature`) with `RESEND_WEBHOOK_SECRET` |

Configure the relevant secret before exposing any of these routes on a production domain — with it unset, the route now correctly rejects every request rather than accepting unauthenticated ones.

## 6. Security event logging & incident response (parallel task, landing during this writing)

- **`SecurityEvent`** (`prisma/schema.prisma`) is an immutable, create-only log (never updated/deleted, matching `AuditLog`'s existing discipline), written via `logSecurityEvent()` (`src/lib/security/security-events.ts`). Its `SecurityEventType` enum: `LOGIN_FAILED`, `LOGIN_SUCCESS_NEW_DEVICE`, `BRUTE_FORCE_DETECTED`, `RATE_LIMIT_EXCEEDED`, `SUSPICIOUS_IP`, `PASSWORD_CHANGED`, `TWO_FACTOR_ENABLED`, `TWO_FACTOR_DISABLED`, `SESSION_REVOKED`, `API_KEY_ABUSE`, `WEBHOOK_SIGNATURE_INVALID`, `PERMISSION_DENIED`, each with `SecurityEventSeverity` `INFO | WARNING | CRITICAL`.
- **Auto-incident creation.** Every `CRITICAL`-severity `SecurityEvent` calls `ensureIncidentForCriticalEvent()` (`src/lib/security/incidents.ts`), which either appends to an already-open `Incident` with the same derived title (deduping, e.g., a sustained brute-force attempt into one incident rather than dozens) or opens a new one. `Incident`/`IncidentUpdate` are platform-wide (not organization-scoped) and append-only, gated to `requirePlatformOwner` at the UI layer. A real `/admin/incidents` page landed during this documentation pass (`src/app/admin/incidents/page.tsx` + `[id]/page.tsx` + `actions.ts`) — see `docs/guides/admin-manual.md` for its real capabilities.
- **ABAC (Attribute-Based Access Control), `src/lib/security/abac.ts`.** A lightweight layer sitting **on top of**, not replacing, the existing `MembershipRole` RBAC. It formalizes two rules previously re-implemented ad hoc per Server Action: (1) tenant isolation — a resource carrying an `organizationId` must match the actor's own membership's organization; (2) read-only roles — `VIEWER` (and `AI_AGENT` acting outside its own scoped tool calls) may `read` but never `write`/`delete`. Every `DENY` fires a `PERMISSION_DENIED` `SecurityEvent`. As documented in the file itself, this is deliberately **not** wired into every Server Action in the app yet — only a small number of concrete, security-sensitive call sites (`src/app/dashboard/settings/secrets/actions.ts`, `src/app/company/actions.ts` as of this writing).

## 7. Audit trail

`AuditLog` (`prisma/schema.prisma`) is a separate, general-purpose "what happened" business-action log (distinct from the security-specific `SecurityEvent`), written via `logAudit()` (`src/lib/audit.ts`), indexed by `userId`, `organizationId`, and `action`. Real examples already firing today: `auth.suspicious_login_detected` (in `src/auth.ts`) and password-reset/email-verification completions (`src/app/api/reset-password/route.ts`, `.../verify-email/route.ts`).

## 8. SSRF protections for server-side outbound requests

Two independent code paths make outbound HTTP requests to URLs a user supplies, and both apply the same real hardening: scheme allowlist (http/https only), reject local/internal hostnames, DNS-resolve and reject private/loopback/link-local/CGNAT/reserved IP ranges (including `169.254.169.254`, the cloud-metadata endpoint) for both IPv4 and IPv6, and — critically — follow redirects **manually**, re-validating the destination host at every hop (a validated public host redirecting to an internal address is a common SSRF bypass otherwise):

- `src/lib/scanner/safe-fetch.ts` — the Website Scanner.
- `src/lib/workflows/node-executors/outgoing-request.ts` — Automation Workflow HTTP-request nodes and webhook-delivery retries. This one previously validated only the *initial* URL and then let `fetch`'s default `redirect: "follow"` chase redirects with no re-validation — a clean bypass, fixed to match `safe-fetch.ts`'s per-hop revalidation.

Both files document the same honest residual limitation: DNS-rebinding TOCTOU (the validation resolves DNS once; the actual `fetch` call does its own, unpinned, separate resolution a moment later) is not fully closed by a DNS-allowlist approach without a custom low-level socket agent pinning the validated IP. Basic filtering is real and substantial; this specific gap is not.

## 9. Honest gaps as of this writing

- **DNS-rebinding TOCTOU** in both SSRF-protected paths above — see §8.
- **ABAC** (`src/lib/security/abac.ts`) is applied at only a handful of call sites (secrets, company), not app-wide — the real protection for tenant isolation is the manual per-action organization check present and verified on every inspected Server Action/API route, not ABAC; if that manual pattern is ever forgotten in a future action, ABAC provides no automatic backstop today.
- **Multi-org "active workspace" resolution** — a number of Server Actions/API routes resolved "the current organization" via the user's oldest ACTIVE membership rather than honoring the `activeOrgId` cookie the workspace switcher sets. This is a correctness/data-integrity bug for users in 2+ organizations (their own data in a non-oldest org can be missed or double-guessed as "not found"), never a cross-tenant security issue — Prisma queries stay scoped by whichever organizationId is resolved. `src/app/dashboard/_lib/require-membership.ts`'s `resolveActiveMembership()` is the shared, cookie-aware fix; being rolled out across remaining call sites.
- **RAG prompt construction** (`src/lib/rag/generation.ts`) puts retrieved document content (which can itself be attacker-authored, via Knowledge Base uploads) into the same system-prompt channel as the grounding instructions, with no delimiter fencing. The never-fabricate/citation design limits blast radius, but this is worth revisiting as prompt-injection defenses mature — informational, not a "must-fix."
- No admin UI for `ComplianceReport` beyond the `/admin/compliance` self-check page itself (see `src/lib/security/compliance.ts` and the Compliance section of the Production Readiness Report for what that page actually verifies vs. what remains a manual/organizational control).
