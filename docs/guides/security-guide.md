# KVL GrowthOS — Security Guide

> A real inventory of this app's security posture, sourced from the actual files listed below. This document was written while the "Enterprise Security, Monitoring, DR, Compliance" phase was **actively landing in parallel** — `src/lib/security/` grew from 2 files to 4 (`abac.ts`, `incidents.ts`, `rate-limit-distributed.ts`, `security-events.ts`) over the course of writing this document. Re-verify this section against the final `src/lib/security/` contents before treating it as complete.

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
- **Rolling in-memory rate limiting** on sign-in attempts, keyed on `email+IP` (`checkRateLimit`, `src/lib/rate-limit.ts`) — 10 attempts / 10 minutes — so one bad actor can't lock out a real user's email from a different IP while still throttling a single source hammering many emails.
- **A second, distributed rate limiter** now exists at `src/lib/security/rate-limit-distributed.ts` (`checkDistributedRateLimit`) — a real Redis sorted-set sliding window, correct across multiple server instances (the existing in-memory limiter is explicitly documented as single-process-only, with 31 existing call sites left untouched). It fails **open** on a Redis outage — the same fail-open posture `src/lib/cache/redis-cache.ts` already takes for cache misses — because a rate limiter failing closed would turn a Redis outage into a full user-facing outage.
- **Device fingerprinting / new-device & suspicious-login alerts.** `DeviceSession` rows are recorded on every sign-in (`src/lib/device-session.ts`, matched heuristically on `(userId, userAgent)`). A genuinely new device triggers a "new sign-in to your account" email (`sendNewDeviceAlert`); if that new device is **also** on a network prefix (`networkPrefix()` — a crude, documented-as-approximate IPv4 /16 comparison, not real geo-IP) never seen for this user in the last 30 days, a stronger "unusual sign-in activity" alert fires as well (`sendSuspiciousLoginAlert` + an in-app `CRITICAL_ALERT` notification + an `auth.suspicious_login_detected` `AuditLog` entry).
- **"Logout everywhere."** Because sessions are stateless JWTs (`session: { strategy: "jwt" }`), `User.sessionInvalidatedAt` is checked on every `jwt()` callback invocation (which Auth.js re-runs on every session check, not just at sign-in) — any token minted before that timestamp is rejected, returning `null` and dropping the session.
- **Real "remember me."** A custom `jwt.encode` override picks `maxAge` (1 day session-only vs. 30 days remembered) per-login based on the token's own `rememberMe` flag, since `@auth/core`'s default `encode()` always recomputes `exp` from the `maxAge` passed to it.
- **Failed-login and brute-force events are logged**, not just enforced: every failed password check calls `logSecurityEvent()` with type `LOGIN_FAILED` (severity `WARNING`) or, once the attempt trips the lockout threshold, `BRUTE_FORCE_DETECTED` (severity `CRITICAL`).

## 3. Password hashing — `src/lib/auth/password.ts`

- **Argon2id** (OWASP's current recommendation over bcrypt) via the `argon2` package, for every user-chosen password (`User.password`, `ClientPortalUser.passwordHash`).
- **Existing bcrypt hashes keep working** — `verifyPassword()` detects the hash format (`$2a$`/`$2b$`/$2y$` prefix vs. `$argon2` prefix) and calls the matching algorithm; there is no forced reset.
- **Transparent upgrade on next successful login.** `needsRehash()`/`rehashIfNeeded()` implement the standard pattern: a bcrypt hash is only ever re-hashed to Argon2 immediately after this exact call already verified the plaintext password was correct — never speculatively.
- API keys deliberately stay on **bcrypt**, not Argon2 — the code comment in this file explains why: bcrypt's cost factor defends against brute-forcing a low-entropy *human-chosen* secret, which a 256-bit random API key was never at risk from; switching would be pure churn.

## 4. The four independent AES-256-GCM encryption key domains

Confirmed by grepping `_ENCRYPTION_KEY` across `.env.example` and `src/`:

| Env var | File that consumes it | Protects |
|---|---|---|
| `AGENT_MEMORY_ENCRYPTION_KEY` | `src/lib/ai/encryption.ts` | AI Agent Memory contents |
| `INTEGRATION_TOKEN_ENCRYPTION_KEY` | `src/lib/integrations/crypto.ts` | `IntegrationConnection`'s OAuth access/refresh tokens and stored API-key credentials |
| `SECRETS_MANAGER_ENCRYPTION_KEY` | `src/lib/secrets/crypto.ts` | The org-level Secrets Manager's `Secret.encryptedValue` (`/dashboard/settings/secrets`) |
| `WEBHOOK_SECRET_ENCRYPTION_KEY` | `src/lib/workflows/webhooks.ts` | Automation Workflow outbound webhook signing secrets |

Every one of these four files independently throws a startup/runtime error if its own env var is missing or not a 64-character hex string (32 bytes) — e.g. `src/lib/integrations/crypto.ts`: *"`INTEGRATION_TOKEN_ENCRYPTION_KEY` must be set to a 64-character hex string (32 bytes) to store integration tokens."* Each key's own doc comment explicitly states the reason for the separation: rotating any one of the four must never break the other three. Generate each with `openssl rand -hex 32`. See `docs/guides/operations-manual.md` for the real rotation procedure per domain.

## 5. Webhook signature verification per payment gateway (`src/lib/billing/gateway/*.ts`)

Every `PlatformGateway.verifyAndParseWebhook()` implementation verifies the raw request body against that gateway's own real signature scheme before any event is processed, returning `null` (never throwing) on failure so the route can respond `400` and log rather than process an unverified payload:

| Gateway | File | Verification method |
|---|---|---|
| Stripe | `src/lib/billing/gateway/stripe.ts` | `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` against the `stripe-signature` header |
| Razorpay | `src/lib/billing/gateway/razorpay.ts` | HMAC-SHA256 over the raw body with `RAZORPAY_WEBHOOK_SECRET`, compared to the `x-razorpay-signature` header via `timingSafeEqual` |
| Paddle | `src/lib/billing/gateway/paddle.ts` | Parses the `paddle-signature` header's `ts=...;h1=...` parts, HMAC-SHA256 over `${timestamp}:${rawBody}` with `PADDLE_WEBHOOK_SECRET`, `timingSafeEqual` comparison |
| LemonSqueezy | `src/lib/billing/gateway/lemonsqueezy.ts` | HMAC-SHA256 over the raw body with `LEMONSQUEEZY_WEBHOOK_SECRET`, compared to the `x-signature` header via `timingSafeEqual` |

All four use Node's `crypto.timingSafeEqual` (not `===`) for the comparison — a real timing-attack mitigation, not just a functional check. The route handler (`src/app/api/webhooks/billing/[provider]/route.ts`) always reads the body as raw text first, never `request.json()`, since parsing first would break every one of these signature checks.

The e-signature providers follow the same discipline, each with its own scheme (see `docs/api/api-reference.md` §"Webhooks" for specifics): DocuSign via `DOCUSIGN_WEBHOOK_HMAC_SECRET`, Adobe Sign via the `x-adobesign-clientid` header matched against `ADOBE_SIGN_CLIENT_ID`, Dropbox Sign via `DROPBOX_SIGN_CLIENT_SECRET` doubling as its own callback signing key. All three **do still process the payload with a logged warning if the relevant secret isn't set**, rather than rejecting it outright — a real, currently-accepted gap worth closing before those webhook endpoints are exposed on a production domain without their secrets configured. The Resend email webhook (`src/app/api/webhooks/resend/route.ts`) behaves the same way for `RESEND_WEBHOOK_SECRET` (Svix-based verification).

## 6. Security event logging & incident response (parallel task, landing during this writing)

- **`SecurityEvent`** (`prisma/schema.prisma`) is an immutable, create-only log (never updated/deleted, matching `AuditLog`'s existing discipline), written via `logSecurityEvent()` (`src/lib/security/security-events.ts`). Its `SecurityEventType` enum: `LOGIN_FAILED`, `LOGIN_SUCCESS_NEW_DEVICE`, `BRUTE_FORCE_DETECTED`, `RATE_LIMIT_EXCEEDED`, `SUSPICIOUS_IP`, `PASSWORD_CHANGED`, `TWO_FACTOR_ENABLED`, `TWO_FACTOR_DISABLED`, `SESSION_REVOKED`, `API_KEY_ABUSE`, `WEBHOOK_SIGNATURE_INVALID`, `PERMISSION_DENIED`, each with `SecurityEventSeverity` `INFO | WARNING | CRITICAL`.
- **Auto-incident creation.** Every `CRITICAL`-severity `SecurityEvent` calls `ensureIncidentForCriticalEvent()` (`src/lib/security/incidents.ts`), which either appends to an already-open `Incident` with the same derived title (deduping, e.g., a sustained brute-force attempt into one incident rather than dozens) or opens a new one. `Incident`/`IncidentUpdate` are platform-wide (not organization-scoped) and append-only, gated to `requirePlatformOwner` at the UI layer. A real `/admin/incidents` page landed during this documentation pass (`src/app/admin/incidents/page.tsx` + `[id]/page.tsx` + `actions.ts`) — see `docs/guides/admin-manual.md` for its real capabilities.
- **ABAC (Attribute-Based Access Control), `src/lib/security/abac.ts`.** A lightweight layer sitting **on top of**, not replacing, the existing `MembershipRole` RBAC. It formalizes two rules previously re-implemented ad hoc per Server Action: (1) tenant isolation — a resource carrying an `organizationId` must match the actor's own membership's organization; (2) read-only roles — `VIEWER` (and `AI_AGENT` acting outside its own scoped tool calls) may `read` but never `write`/`delete`. Every `DENY` fires a `PERMISSION_DENIED` `SecurityEvent`. As documented in the file itself, this is deliberately **not** wired into every Server Action in the app yet — only a small number of concrete, security-sensitive call sites (`src/app/dashboard/settings/secrets/actions.ts`, `src/app/company/actions.ts` as of this writing).

## 7. Audit trail

`AuditLog` (`prisma/schema.prisma`) is a separate, general-purpose "what happened" business-action log (distinct from the security-specific `SecurityEvent`), written via `logAudit()` (`src/lib/audit.ts`), indexed by `userId`, `organizationId`, and `action`. Real examples already firing today: `auth.suspicious_login_detected` (in `src/auth.ts`) and password-reset/email-verification completions (`src/app/api/reset-password/route.ts`, `.../verify-email/route.ts`).

## 8. Honest gaps as of this writing

- The e-signature and Resend webhook routes accept unverified payloads (with a logged warning) when their signing secret isn't configured — tighten to hard-reject before exposing those routes without secrets set.
- ABAC (`src/lib/security/abac.ts`) is applied at only a handful of call sites, not app-wide.
- An `/admin/incidents` UI landed for `Incident` during this writing (see `docs/guides/admin-manual.md`); no admin UI for `ComplianceReport` was confirmed to exist yet at the time of this writing.
- This entire `src/lib/security/` directory was still being actively written in parallel with this documentation pass — re-read it before relying on this document as final.
