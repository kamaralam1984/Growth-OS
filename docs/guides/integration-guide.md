# KVL GrowthOS — Integration Guide

> A real inventory of how this app connects to third-party services — sourced from `src/lib/integrations/`, `src/app/api/webhooks/`, and `src/lib/auth/api-key.ts`.

## 1. OAuth connections — `src/lib/integrations/connection-store.ts`

Every real, per-organization third-party connection (Gmail, Outlook, Slack, and the rest of the 52 `IntegrationProviderKey` values) is one `IntegrationConnection` row. Access/refresh tokens are encrypted at rest (`src/lib/integrations/crypto.ts`, `INTEGRATION_TOKEN_ENCRYPTION_KEY` — see the Security Guide's key table) — the raw token never appears in a query result or log.

Real exported functions, all in `connection-store.ts`:

- `getConnection(organizationId, provider)` — single-row lookup on the `@@unique([organizationId, provider])` constraint, decrypting tokens on the way out.
- `listConnections(organizationId)` — every connection for an org, decrypted.
- `saveConnection(organizationId, provider, category, tokens, connectedByUserId)` — upserts, encrypting both tokens; the function's own doc comment is explicit that it is "only ever called after a real provider round-trip succeeded" — there is no path that marks a connection `CONNECTED` speculatively.
- `getFreshAccessToken(organizationId, provider)` — returns a real, currently-valid access token, transparently refreshing via the provider's own token endpoint when the stored one is within 60 seconds (`60_000` ms) of `tokenExpiresAt` and a refresh token is on file. On refresh failure it sets `status: "EXPIRED"` and records the real error in `lastError` — it returns `null` for "not connected," never a stale or fabricated token. Callers (e.g. `src/lib/outreach/email-provider.ts`'s Gmail/Outlook senders) never handle refresh logic themselves.
- `runHealthCheck(organizationId, provider)` — a real, live call against the provider's own API (`adapter.healthCheck(token)`) to confirm the connection still works, not just that a token exists; writes `lastHealthCheckAt`/`status`/`lastError`. **Not scheduled** — the only call sites are the "Test connection" button's `checkIntegrationHealth()` server action and a couple of adapters' own internal use (`stripe.ts`, `mailgun.ts`). There is no background cron job that periodically re-checks every connection; a connection can silently sit `ERROR` until someone clicks "Test connection" again.
- `disconnectConnection(organizationId, provider)` — best-effort calls `adapter.revoke(accessToken)` (caught and logged, never thrown — several adapters, e.g. `docusignAdapter.revoke`/`stripeAdapter.revoke`, are documented no-ops because the provider has no real revoke API), then nulls out the encrypted fields and sets `status: "NOT_CONNECTED"`. A subsequent feature call honestly reports "not connected" rather than silently failing.

`DecryptedConnection.status` is `"NOT_CONNECTED" | "CONNECTED" | "ERROR" | "EXPIRED"`, matching the Prisma `IntegrationStatus` enum.

Marketplace `INTEGRATION_CONNECTOR` listings never create a connection directly (`installers/integration-connector.ts`'s own doc comment is explicit about this) — installing one only deep-links to `/dashboard/settings/integrations?provider=X`; `reconcileIntegrationInstall()` polls for a matching `CONNECTED` row afterward and flips the install's `createdRowsLog.integrationConnectionId` once one genuinely appears.

## 2. The provider registry — `src/lib/integrations/{registry,types}.ts`

`src/lib/integrations/types.ts` defines the `IntegrationProviderKey` union (52 values), `IntegrationCategory` enum, `IntegrationAuthType` (`OAUTH2 | API_KEY`), and the `IntegrationAdapter` interface every provider implements — `registry.ts` imports and registers all 52 concrete adapter objects (one file per provider under `src/lib/integrations/providers/*.ts`) into a `Map`, exposing `getAdapter(key)`/`listAdapters()`. `registry.ts` is the only file in the codebase that imports every concrete provider module.

Grouped exactly as the code groups them:

| Category | Providers |
|---|---|
| Email | `GOOGLE_GMAIL`, `MICROSOFT_OUTLOOK`, `SENDGRID`, `MAILGUN`, `AMAZON_SES` |
| Calendar | `GOOGLE_CALENDAR`, `MICROSOFT_CALENDAR`, `CAL_COM`, `CALENDLY` |
| Signature | `DOCUSIGN`, `ADOBE_SIGN`, `DROPBOX_SIGN` |
| CRM sync | `HUBSPOT`, `SALESFORCE`, `ZOHO_CRM`, `PIPEDRIVE`, `FRESHSALES` |
| Communication | `SLACK`, `MICROSOFT_TEAMS`, `DISCORD`, `TELEGRAM`, `TWILIO` |
| Storage | `GOOGLE_DRIVE`, `DROPBOX`, `ONEDRIVE`, `AWS_S3`, `CLOUDFLARE_R2` |
| Payments | `STRIPE`, `RAZORPAY`, `PAYPAL`, `PADDLE`, `LEMONSQUEEZY` |
| Accounting | `QUICKBOOKS`, `XERO`, `ZOHO_BOOKS` |
| Meetings | `ZOOM`, `GOOGLE_MEET` |
| Development | `GITHUB`, `GITLAB`, `BITBUCKET`, `VERCEL`, `NETLIFY`, `CLOUDFLARE` |
| AI providers | `OPENAI`, `GOOGLE_GEMINI`, `DEEPSEEK`, `GROQ`, `OPENROUTER`, `OLLAMA` |
| Embedding providers (RAG Engine) | `VOYAGE_AI`, `COHERE`, `JINA_EMBEDDINGS`, `BGE` |

Note the two payment surfaces here are a deliberately different concern from Platform Billing: these `STRIPE`/`RAZORPAY`/`PAYPAL`/`PADDLE`/`LEMONSQUEEZY` adapters let an *org* accept its own clients' payments; the `STRIPE_SECRET_KEY` etc. platform gateway credentials in the Deployment Guide are for KVL charging *tenants*, a fully separate code path (`src/lib/billing/gateway/*`).

Two adapters worth citing as the canonical templates: `docusignAdapter` (`providers/docusign.ts`, `OAUTH2`) and `stripeAdapter` (`providers/stripe.ts`, `API_KEY`, explicitly commented as "the canonical template for every other `API_KEY` adapter").

`state.ts` signs/verifies the OAuth `state` query param via HMAC-SHA256 keyed by `AUTH_SECRET` (deliberately reused rather than a new env var), carrying `{organizationId, userId, nonce}` — this is what stops a forged callback from attaching a connection to the wrong org.

## 3. The OAuth flow — real route files

- **`GET /api/integrations/[provider]/connect`** (`src/app/api/integrations/[provider]/connect/route.ts`) — requires an active session with `OWNER`/`ADMIN` membership, 404s on an unknown provider key, 400s if the adapter isn't `OAUTH2`, redirects with `?error=not_configured` if the adapter's own `isConfigured()` check fails (i.e. the platform-level client id/secret for that provider isn't set), otherwise signs the state and redirects to `adapter.getAuthUrl(state, redirectUri)`. The redirect URI is always `${origin}/api/integrations/${provider}/callback`.
- **`GET /api/integrations/[provider]/callback`** (`src/app/api/integrations/[provider]/callback/route.ts`) — Zod-validates `code`/`state`, verifies the HMAC state, re-checks active membership, calls `adapter.handleCallback(code, redirectUri)`, then `saveConnection()` + `logAudit({action: "integration.connected"})`. Any failure (`missing_code`, `invalid_state`, `membership_not_found`, `not_oauth_provider`, `token_exchange_failed`) redirects back with `?error=<reason>` and never marks a connection connected.
- **API_KEY-auth providers connect through a Server Action, not a route.** `connectIntegrationWithCredentials(provider, credentials)` in `src/app/dashboard/settings/integrations/actions.ts` (called from `_components/connect-api-key-dialog.tsx`) enforces the same `OWNER`/`ADMIN` gate and `isConfigured()` check, calls `adapter.connectWithCredentials(credentials)`, then `saveConnection()` + audit log. The same file also exports `disconnectIntegration(provider)` and `checkIntegrationHealth(provider)`, both privileged-only.

## 4. Incoming webhooks

Two distinct systems, each with its own real signature verification, verified **before** any business logic runs:

**Third-party provider webhooks** (`src/app/api/webhooks/*`):

| Route | Verification |
|---|---|
| `resend/route.ts` | Svix (`new Webhook(secret).verify(...)`) against `svix-id`/`svix-timestamp`/`svix-signature`, secret = `RESEND_WEBHOOK_SECRET` |
| `docusign/route.ts` | Manual HMAC-SHA256 **base64** digest of the raw body, `timingSafeEqual`-compared against `x-docusign-signature-1`, secret = `DOCUSIGN_WEBHOOK_HMAC_SECRET` |
| `adobe-sign/route.ts` | Not HMAC — compares the `x-adobesign-clientid` header to `ADOBE_SIGN_CLIENT_ID`; genuinely Adobe's own (weaker) model, not a shortcut this app took. Also implements the `GET` handshake Adobe requires to register a webhook (echoes the client id back). |
| `dropbox-sign/route.ts` | HMAC-SHA256 hex of `event_time + event_type` (no separator) keyed by `DROPBOX_SIGN_CLIENT_SECRET`, compared via `timingSafeEqual` to `event.event_hash`. Payload is `multipart/form-data` with a `json` field, not a raw JSON body, and the route must reply with the literal string `"Hello API Event Received"` to satisfy Dropbox Sign's ack requirement. |
| `billing/[provider]/route.ts` | Delegates to `getGateway(provider).verifyAndParseWebhook(...)` — a separate concern (platform billing, KVL charging tenants), each of `STRIPE`/`RAZORPAY`/`PADDLE`/`LEMONSQUEEZY`/`BANK_TRANSFER`/`MANUAL` implementing its own scheme via `src/lib/billing/gateway/registry.ts`. PayPal is deliberately absent here. |

All four e-signature/Resend routes log a `WEBHOOK_SIGNATURE_INVALID` `SecurityEvent` on verification failure (Resend's route doesn't) and return `200` even on a downstream processing error specifically to avoid provider retry storms — each has a comment explaining this.

**User-configured dynamic webhooks** (`/api/webhooks/custom/[slug]`, `src/lib/workflows/webhooks.ts`) — this app's own signing convention:

- A signed webhook (`Webhook.encryptedSecret` set) requires an HMAC-SHA256 **hex** digest of the exact raw body in the `X-KVL-Signature` header, checked via `verifySignature()` (`src/lib/workflows/webhook-signature.ts`) using `timingSafeEqual` (rejects on length mismatch rather than throwing).
- Unsigned webhooks are accepted with **no verification** — an intentional, documented lower-security option for callers that can't easily sign requests.
- Secrets are `randomBytes(32).toString("hex")` (64 hex chars), stored AES-256-GCM-encrypted keyed by `WEBHOOK_SECRET_ENCRYPTION_KEY` (its own independent key domain), and are **reveal-once**: `createWebhook()`/`rotateWebhookSecret()` return the plaintext exactly once; `listWebhooks()` structurally omits `encryptedSecret` from its Prisma `select` so it can never be read back.
- Rate-limited at **60 requests / 60 seconds per webhook slug** via `checkRateLimitDegradable()` — the Redis-backed distributed sliding-window limiter, falling back in-memory if Redis is unreachable — so one runaway sender can't starve every other webhook.
- Every attempt (success, invalid signature, invalid JSON, 500) is recorded via `recordWebhookDelivery(webhookId, "INCOMING", payload, {statusCode, success, attempt, error})`, and success stamps `Webhook.lastTriggeredAt`. If the webhook is bound to an `ACTIVE` `Workflow`, it triggers `startWorkflowRun(workflow.id, organizationId, {webhookSlug, body, headers})`.
- Slugs are `randomBytes(9).toString("base64url")`, retried up to 5 times on a unique-constraint collision (Prisma `P2002`).
- **Outgoing** webhook delivery (this app calling *out* to a URL a user configured, e.g. from a workflow) is a separate BullMQ queue (`kvl-webhook-delivery`) with 5 retry attempts and exponential backoff starting at 1 second, using the same SSRF-safe `assertPublicUrl`/`performOutgoingRequest` helpers workflow executors use. A documented limitation: async retry outcomes only ever update the `WebhookDelivery` row — they never retroactively flip an already-`FAILED` `WorkflowStepRun` back to success.

## 5. Public API & API keys — `src/lib/auth/api-key.ts`

Real `ApiKey` rows, hashed with bcrypt (see the Security Guide's password-hashing section for why API keys deliberately stay on bcrypt rather than Argon2), scoped by `ApiKeyScope` (`src/lib/auth/api-key-scopes.ts`) so a key can authenticate but call nothing until at least one scope is granted. Manage keys at `/profile` → API Keys.

The full, closed set of real scopes today:

| Scope | Grants |
|---|---|
| `export:companies:read` | `GET /api/export/companies` |
| `export:deals:read` | `GET /api/export/deals` |
| `export:contacts:read` | `GET /api/export/contacts` |
| `workflows:trigger` | `POST /api/v1/workflows/[workflowId]/trigger` — wraps `startWorkflowRun`/`fireWorkflowTrigger` in `src/lib/workflows/{engine,triggers}.ts` |

Key format/verification: a raw key is `"gos_" + randomBytes(32).toString("hex")` (`API_KEY_PREFIX`, `src/app/profile/actions.ts`), stored as `bcrypt.hash(rawKey, 10)` in `ApiKey.hashedKey`; a 12-character cleartext `prefix` (`rawKey.slice(0, 12)`) narrows candidate rows for lookup, since bcrypt hashes can't be queried directly. `verifyApiKeyAuth(request)` reads `Authorization: Bearer <key>`, finds candidates by prefix + `revokedAt: null`, bcrypt-compares each, and updates `lastUsedAt` on match — it returns `null` on any failure, never throws.

`checkApiKeyRateLimit()` enforces the key's own `rateLimitPerHour` (defaults to **1000**, `ApiKey.rateLimitPerHour @default(1000)`) via `checkRateLimitDegradable(\`apikey:${apiKeyId}\`, {limit, windowMs: 3_600_000})` — a 1-hour Redis-backed sliding window, keyed per-key so one key's traffic never exhausts another's budget, falling back to the in-memory limiter if Redis is down. `withApiKeyAuth(requiredScope, handler)` (`src/lib/auth/with-api-key-auth.ts`) is the composable route wrapper: 401 on an invalid key, 403 on a missing scope (also logs an `API_KEY_ABUSE` security event), 429 on rate-limit exceeded (same event type), and records every call — including failures, response time, and status code — to `APIUsage` via `recordAPIUsage()`.

## 6. Outbound email — `src/lib/outreach/email-provider.ts` vs. `src/lib/email.ts`

Two deliberately different contracts, not a duplicate implementation:

- `src/lib/email.ts`'s `sendEmail()` — fire-and-forget, used for internal notifications/invites/auth emails. Never throws; degrades to a console log when `EMAIL_SERVER` is unset. Real per-organization white-label branding (`from` name/address) is applied automatically when configured — see the White Label Guide.
- `src/lib/outreach/email-provider.ts`'s `sendOutreachEmail()` — an honest tri-state (sent / genuinely failed / not configured), used for the Outreach Assistant's customer-facing cold email, since an `EmailDraft` must never be marked `SENT` when nothing left the building. Provider order: the org's own connected Gmail/Outlook mailbox first (better deliverability, real sender reputation), then Resend, then SMTP.

## 7. Environment variables — the real list

`.env.example` is authoritative; this is the integration-relevant subset. All are optional/independently gated — no integration is required for the app to run.

| Purpose | Variables |
|---|---|
| Token/secret encryption | `INTEGRATION_TOKEN_ENCRYPTION_KEY`, `WEBHOOK_SECRET_ENCRYPTION_KEY` (each a 64-char hex / 32-byte AES-256-GCM key, `openssl rand -hex 32`, independent of the other 3 encryption-key domains — see the Security Guide) |
| E-signature | `ADOBE_SIGN_CLIENT_ID`/`SECRET`/`SHARD` (defaults `"na1"`), `DOCUSIGN_INTEGRATION_KEY`/`CLIENT_SECRET`/`ENVIRONMENT` (defaults `"demo"`), `DOCUSIGN_WEBHOOK_HMAC_SECRET`, `DROPBOX_SIGN_CLIENT_ID`/`SECRET` |
| Email/Calendar (Google/Microsoft) | `GOOGLE_INTEGRATION_CLIENT_ID`/`SECRET` (shared by Gmail, Google Calendar, Google Drive, Google Meet — **deliberately separate** from the login `GOOGLE_CLIENT_ID`), `MICROSOFT_INTEGRATION_CLIENT_ID`/`SECRET`/`TENANT_ID` (shared by Outlook, Microsoft Calendar, Microsoft Teams — separate from login `MICROSOFT_ENTRA_ID_CLIENT_ID`) |
| Integration Hub OAuth2 apps | `SLACK_CLIENT_ID`/`SECRET`, `HUBSPOT_CLIENT_ID`/`SECRET`, `SALESFORCE_CLIENT_ID`/`SECRET`, `ZOHO_CLIENT_ID`/`SECRET` (shared by Zoho CRM + Zoho Books), `PIPEDRIVE_CLIENT_ID`/`SECRET`, `DROPBOX_CLIENT_ID`/`SECRET`, `CALENDLY_CLIENT_ID`/`SECRET`, `ZOOM_CLIENT_ID`/`SECRET`, `QUICKBOOKS_CLIENT_ID`/`SECRET`/`ENVIRONMENT` (defaults sandbox), `XERO_CLIENT_ID`/`SECRET`, `GITHUB_INTEGRATION_CLIENT_ID`/`SECRET` (separate from login `GITHUB_CLIENT_ID`), `GITLAB_CLIENT_ID`/`SECRET`, `BITBUCKET_CLIENT_ID`/`SECRET` |
| No platform env var needed | Every `API_KEY`-auth provider — Cal.com, Freshsales, Twilio, Razorpay, PayPal, Paddle, LemonSqueezy, Vercel, Netlify, Cloudflare, Stripe, and every AI/embedding provider — credentials are entered per-org via the Connect dialog, not platform config. |

Important: the OAuth **login** client IDs (`GOOGLE_CLIENT_ID`, `MICROSOFT_ENTRA_ID_CLIENT_ID`, `GITHUB_CLIENT_ID`) are deliberately separate credentials from the **integration** OAuth apps above even for the same provider — `.env.example` calls this out explicitly for each pair ("must never be reused for login"). Do not collapse them when configuring a real deployment.

## 8. Tenant isolation

Every `IntegrationConnection`, `ApiKey`, and `Webhook` row is `organizationId`-scoped. A connection's OAuth tokens, once decrypted, are only ever passed to that same organization's own outbound calls — never cached or reused across tenants.
