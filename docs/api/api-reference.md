# KVL GrowthOS — API Reference

> Covers the hand-written REST-style routes under `src/app/api/`. This is **not** the primary way this app mutates data — the primary pattern is Server Actions co-located with each page (see `docs/guides/developer-guide.md`) — these routes exist specifically for non-browser callers: webhook receivers, OAuth redirects, bulk exports usable by API key, tracking pixels, and one public workflow-trigger endpoint. Every entry below was verified against the real route file. Auth column values: **Session** (signed-in cookie via `auth()`), **API Key** (`Authorization: Bearer <key>` via `verifyApiKeyAuth`/`withApiKeyAuth`, `src/lib/auth/api-key.ts` + `src/lib/auth/with-api-key-auth.ts`), **Session or API Key** (dual-mode), **Client Portal Session** (separate `ClientPortalUser` cookie, `src/lib/client-portal/auth.ts`), **Signature-verified / Public** (no session — verified by a provider-specific HMAC/signature check instead), **Public (unauthenticated)**.

## Authentication mechanisms in play

1. **Session cookie** — the normal Auth.js JWT session (`await auth()`), same as any Server Action.
2. **API key** — a bearer token created via `createApiKey` (`src/app/profile/actions.ts`), stored as a bcrypt hash on `ApiKey.hashedKey`, verified by `verifyApiKeyAuth()` (`src/lib/auth/api-key.ts`). Every candidate key is looked up by its 12-character `prefix` then bcrypt-compared; a match updates `lastUsedAt`. Only 4 scopes exist today (`src/lib/auth/api-key-scopes.ts`):
   - `export:companies:read`
   - `export:deals:read`
   - `export:contacts:read`
   - `workflows:trigger`
   The `withApiKeyAuth(scope, handler)` wrapper (`src/lib/auth/with-api-key-auth.ts`) is the standard way a route enforces one of these scopes.
3. **Client Portal session** — a completely separate opaque-token cookie for `ClientPortalUser` (`src/lib/client-portal/auth.ts`'s `getClientPortalSession()`), isolated from the internal Auth.js stack.
4. **Signature/HMAC verification** — for routes hit directly by external providers (webhooks, e-signature callbacks). No session of any kind; authenticity comes from a per-provider signature check. These routes are also the ones exempted from `src/proxy.ts`'s same-origin CSRF check (see `docs/architecture/system-architecture.md` §2).

`src/proxy.ts` applies a same-origin `Origin`/`Referer` check to every non-GET `/api/*` request **except**: `/api/webhooks/*`, `/api/auth/*` (NextAuth's own CSRF), `/api/integrations/*/callback` (state-param verified instead), and the tracking-pixel routes under `/api/outreach/track/*` and `/api/documents/track/*`.

---

## Auth & account lifecycle

| Method | Path | Auth | Notes |
|---|---|---|---|
| `*` | `/api/auth/[...nextauth]` | Public / NextAuth-managed | Auth.js's own handler — sign-in, callback, session, CSRF token endpoints. |
| POST | `/api/register` | Public | Rate-limited by IP (`checkRateLimit`), validates via `registerSchema`, hashes the password with Argon2id (`hashPassword`), sends a verification email via `sendVerificationEmail`. |
| POST | `/api/forgot-password` | Public | Rate-limited, issues a `UserToken` via `issueUserToken`, emails a reset link. Does not reveal whether the email exists. |
| POST | `/api/reset-password` | Public (token-bearing) | Consumes the reset token (`consumeUserToken`), re-hashes the new password with Argon2id, writes an `AuditLog` entry (`logAudit`). |
| POST | `/api/verify-email` | Public (token-bearing) | Consumes an `EMAIL_VERIFICATION` token via `consumeUserToken`, writes an `AuditLog` entry. |

## Export (bulk data export)

Every export route defaults to CSV and accepts `?format=csv|excel|pdf` (companies also supports `crm`). Three are dual-mode (session **or** API key, gated by the matching scope); the rest are session-only today.

| Method | Path | Auth | Scope (if API-key) | Notes |
|---|---|---|---|---|
| GET | `/api/export/companies` | Session or API Key | `export:companies:read` | Bulk Company export with lead-score band/overall score; the first real `verifyApiKeyAuth`/`withApiKeyAuth` consumer built in this app. |
| GET | `/api/export/companies/[id]` | Session | — | Single-company export. |
| GET | `/api/export/deals` | Session or API Key | `export:deals:read` | Bulk Deal/pipeline export. |
| GET | `/api/export/contacts` | Session or API Key | `export:contacts:read` | Bulk Contact export. |
| GET | `/api/export/campaigns` | Session | — | Outreach campaign export. |
| GET | `/api/export/campaigns/[id]` | Session | — | Single-campaign export. |
| GET | `/api/export/scans` | Session | — | Website Scanner results export. |
| GET | `/api/export/scans/[id]` | Session | — | Single-scan export. |
| GET | `/api/export/tasks` | Session | — | Project task export. |
| GET | `/api/export/crm-report/[type]` | Session | — | CRM analytics report export. |
| GET | `/api/export/analytics-report/[tier]` | Session | — | Analytics tier report export. |
| GET | `/api/export/board-report/[period]` | Session | — | AI Executive Board period report export. |
| GET | `/api/export/project-report/[type]` | Session | — | Project report export. |
| GET | `/api/export/project-executive-report/[id]` | Session | — | Executive project report export. |

Per `src/lib/auth/api-key-scopes.ts`'s own doc comment, `export:contacts:read` and `export:deals:read` were originally called out as "being retrofitted" onto `withApiKeyAuth` — as of this reading, both routes already import and use `withApiKeyAuth`, so the retrofit is complete for those two.

## Workflows (v1, public API-key surface)

| Method | Path | Auth | Scope | Notes |
|---|---|---|---|---|
| POST | `/api/v1/workflows/{workflowId}/trigger` | API Key | `workflows:trigger` | Starts a real `WorkflowRun` via `startWorkflowRun` (`src/lib/workflows/engine.ts`). The workflow must belong to the key's own organization and be `ACTIVE`. JSON request body (if present) becomes the run's `triggerPayload`. Returns `202` with `{ "runId": "..." }`. Documented example response: `{"runId": "clx1a2b3c4d5e6f7g8h9i0j1"}`. |

## Webhooks (signature-verified, publicly reachable)

All of these are exempt from the proxy's origin/CSRF check by design — they are meant to be called cross-origin by the provider itself.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/webhooks/billing/[provider]` | Signature-verified | One route for every registered `PaymentGatewayProvider` (stripe/razorpay/paddle/lemonsqueezy/bank-transfer/manual slugs). Reads the raw body as text (never `request.json()` first, which would break signature verification) and calls the matching gateway's `verifyAndParseWebhook`. Always returns HTTP 200 once signature verification passes (even if downstream business logic itself failed, already logged server-side) to avoid the provider's retry storm; returns 400 only when signature verification itself fails. |
| POST | `/api/webhooks/docusign` | Signature-verified | Verified via `DOCUSIGN_WEBHOOK_HMAC_SECRET` if set; otherwise processed with a logged warning that verification was skipped. |
| POST | `/api/webhooks/adobe-sign` | Signature-verified | Verified via the `x-adobesign-clientid` header against `ADOBE_SIGN_CLIENT_ID` — no separate secret env var. |
| POST | `/api/webhooks/dropbox-sign` | Signature-verified | `DROPBOX_SIGN_CLIENT_SECRET` doubles as the event-callback signing key. |
| POST | `/api/webhooks/resend` | Signature-verified (Svix) | Verified via Svix `svix-id`/`svix-timestamp`/`svix-signature` headers against `RESEND_WEBHOOK_SECRET`. **Without that secret set, the route logs a warning and accepts the payload without verification** (`src/app/api/webhooks/resend/route.ts`) — set it in any real deployment. |
| POST | `/api/webhooks/custom/[slug]` | Per-workflow, custom | Generic inbound webhook trigger for Automation Workflows keyed by a per-workflow slug. |

## Integrations (OAuth connect/callback)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/integrations/[provider]/connect` | Session | Starts the 3-legged OAuth consent redirect for one of the 40+ providers in `src/lib/integrations/providers/`. |
| GET | `/api/integrations/[provider]/callback` | State-param verified (no session check in proxy) | The browser is redirected back here by the provider; authenticity comes from the signed, HMAC-verified `state` param minted by `src/lib/integrations/state.ts`, not from same-origin-ness — hence its exemption in `src/proxy.ts`. |

API-key-auth providers (Stripe, Twilio, SendGrid, OpenAI, etc. — see `.env.example`) skip this OAuth flow entirely; each org pastes its own credential directly into the Connect dialog, handled by `connectWithCredentials()` rather than these two routes.

## Platform billing

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/platform-invoices/[id]` | Session **or** platform owner | Streams a platform invoice PDF. Two independent gates: an internal user with an ACTIVE membership in the invoice's own organization, OR any `User.isPlatformOwner` viewing any organization's invoice (mirrors the cross-tenant access the Admin Billing Dashboard already has). If a PDF was already rendered and stored, it streams from disk; otherwise `renderPlatformInvoicePdf` (`src/lib/billing/invoices.ts`) renders it on demand — never fabricated. |

## White label

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/white-label/assets/[organizationId]/[kind]` | Session | Streams a white-label logo/favicon asset from `storage/white-label-assets/` (deliberately never under `public/`) — this route is the only way to fetch it. |

## Documents & files

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/documents/[id]` | Session | Auth-gated document download/streaming. |
| GET | `/api/documents/export` | Session | Document export. |
| GET | `/api/documents/track/[kind]/[token]/open` | Public (tracking pixel) | Open-tracking pixel hit directly by email clients — no `Origin` header under normal use; CSRF-exempt. |
| GET | `/api/documents/track/[kind]/[token]/download` | Public (tracking) | Download-tracking redirect, same rationale. |
| GET | `/api/knowledge-attachments/[id]` | Session | Knowledge Base attachment download. |
| GET | `/api/project-files/[versionId]` | Session | Project file version download. |

## Outreach

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/outreach/track/open/[token]` | Public (tracking pixel) | Email open-tracking pixel; CSRF-exempt, GET-only. |
| GET | `/api/outreach/track/click/[token]` | Public (tracking redirect) | Email click-tracking redirect; CSRF-exempt. |
| GET | `/api/outreach/meetings/[id]/ics` | Session | Generates an `.ics` calendar file for a booked meeting. |

## Realtime

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/realtime` | Session | Internal app real-time event stream. |
| GET | `/api/portal/realtime` | Client Portal Session | Uses `getClientPortalSession()` — never the internal Auth.js session — consistent with the Client Portal's fully separate auth boundary. |

---

## Scoped-API-key-gated endpoints — canonical registry

The hand-maintained registry at `src/app/dashboard/settings/api-manager/_lib/api-docs-registry.ts` is this app's own source of truth for which endpoints are safe to document as API-key-callable, and is reproduced here verbatim (field-for-field) rather than re-derived, per that file's own instruction to keep it as the one honest list:

- **GET `/api/export/companies`** (`export:companies:read`) — Bulk-export every Company record for the key's organization, with lead score band/overall score included, as CSV, CRM-mapped CSV, Excel, or PDF (`?format=csv|crm|excel|pdf`, default csv).
- **GET `/api/export/deals`** (`export:deals:read`) — Bulk-export every Deal record for the key's organization as CSV, Excel, or PDF (`?format=csv|excel|pdf`, default csv).
- **GET `/api/export/contacts`** (`export:contacts:read`) — Bulk-export every Contact record for the key's organization as CSV, Excel, or PDF (`?format=csv|excel|pdf`, default csv).
- **POST `/api/v1/workflows/{workflowId}/trigger`** (`workflows:trigger`) — Starts a real run of the given Workflow (must belong to the key's organization and have status `ACTIVE`), passing the JSON request body as the run's `triggerPayload`. Returns the new `WorkflowRun` id.

This registry is also rendered in-app to end users creating their own API keys at `/dashboard/settings/api-manager`.

## Note on scope

This document covers `src/app/api/*` only. Server Actions (the primary mutation surface for the browser-facing dashboard, board, and portal UIs) are not enumerated here — see `docs/guides/developer-guide.md` for that convention, and read the `actions.ts` file co-located with any given page for its real exported functions.
