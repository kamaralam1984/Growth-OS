# KVL GrowthOS — Developer Guide

> Onboarding doc for an engineer joining this codebase, written from the actual `package.json`, `.env.example`, `prisma/schema.prisma`, and a survey of real route folders as they exist today.

## 1. Local setup

### Prerequisites

- **Node.js** — `package.json` has no `engines` field pinning a version; the dev machine this was written on runs **Node v20.20.0**. Use Node 20 LTS unless a parallel task's CI config specifies otherwise (check `.github/workflows/` once it lands).
- **PostgreSQL** — the only supported `datasource` in `prisma/schema.prisma` is `provider = "postgresql"`.
- **Redis** — required for the Scheduler Service's BullMQ queue and the generic Redis caching layer; see `.env.example`'s comment on `REDIS_URL` (defaults to `redis://localhost:6379` if unset).

### Install & run

```bash
npm install                # postinstall runs `prisma generate` automatically
cp .env.example .env       # then fill in DATABASE_URL and AUTH_SECRET at minimum
npx prisma migrate dev     # local/dev only — creates the schema and shadow-migrates
npm run dev                # next dev
```

Real `package.json` scripts today:

```json
"dev": "next dev",
"build": "next build",
"start": "next start",
"lint": "eslint",
"postinstall": "prisma generate",
"db:seed": "tsx prisma/seed-automation-templates.ts"
```

There is no `test`/`typecheck` script yet as of this writing — the QA phase (`vitest`/`playwright`) was being added by a parallel task; check `package.json` again once that lands.

The Prisma client is generated to a **non-default output path**: `prisma/schema.prisma`'s `generator client` block sets `output = "../src/generated/prisma"`, so imports throughout the codebase are `from "@/generated/prisma/client"`, not `@prisma/client`. Keep this in mind if you add a new file that needs Prisma types.

### Required vs. optional environment variables

`.env.example` is extensively commented (each block explains exactly what degrades gracefully without it). Summary:

**Required to boot at all:**
- `DATABASE_URL` — Postgres connection string.
- `AUTH_SECRET` — Auth.js JWT signing secret (`openssl rand -base64 32`).

**Required for real functionality, but the app still runs/builds without them (features honestly degrade instead of faking success):**
- `REDIS_URL` — defaults to `redis://localhost:6379`; needed for the Scheduler, workflow engine, webhook delivery, RAG embedding, and billing-recurring queues (see `docs/architecture/system-architecture.md` §5).
- `ANTHROPIC_API_KEY` — without it, `isAIConnected()` (`src/lib/ai/client.ts`) returns false and every AI feature shows "AI not connected" rather than fabricating output.
- Four independent AES-256-GCM encryption keys — `AGENT_MEMORY_ENCRYPTION_KEY`, `INTEGRATION_TOKEN_ENCRYPTION_KEY`, `SECRETS_MANAGER_ENCRYPTION_KEY`, `WEBHOOK_SECRET_ENCRYPTION_KEY` — each required only once the corresponding feature is actually used (agent memory, an OAuth integration connection, the Secrets Manager, or a workflow webhook secret respectively). See `docs/guides/security-guide.md` for full detail.

**Fully optional, each gated by its own `isConfigured()`-style check:**
- OAuth login providers (Google/Microsoft Entra ID/GitHub) — only added to Auth.js's `providers` array when both client id and secret are set.
- `EMAIL_SERVER`/`EMAIL_FROM` — without it, magic-link sign-in logs the link to the console instead of emailing it, and still completes successfully.
- `RESEND_API_KEY` — Outreach cold email; without it, drafts can be generated/approved but never marked SENT.
- `WEATHER_API_KEY`, integration OAuth pairs (Slack/HubSpot/Salesforce/Zoho/Pipedrive/Dropbox/Calendly/Zoom/QuickBooks/Xero/GitHub-integration/GitLab/Bitbucket), e-signature providers (DocuSign/Adobe Sign/Dropbox Sign) and their webhook secrets, and the Platform Billing gateway credentials (Stripe/Razorpay/Paddle/LemonSqueezy) — all optional, all independently gated.

## 2. Code organization conventions

This codebase is unusually consistent about a small set of conventions. Learn these once and most of the app is navigable:

### Server Actions co-located with pages

A route folder under `src/app/dashboard/**` typically looks like:

```
src/app/dashboard/settings/jobs/
├── page.tsx            # Server Component — fetches data directly via Prisma/service calls
├── actions.ts           # "use server" mutation functions the page's client islands call
└── _components/
    └── cron-editor.tsx  # private, route-scoped client component
```

A repo-wide grep found **97 files** containing the `"use server"` directive — this is the dominant mutation pattern, not the `src/app/api/*` REST routes. Only reach for a hand-written route handler when a **non-browser caller** needs it (webhooks, OAuth callbacks, bulk exports consumable by API key, tracking pixels) — see `docs/api/api-reference.md`.

### `_components/` and `_lib/` private folders

Any folder prefixed with `_` under `src/app/` is a Next.js "private folder" — excluded from routing, used purely for route-scoped code that shouldn't be importable from outside that subtree. Two real examples:
- `src/app/dashboard/settings/jobs/_components/cron-editor.tsx`
- `src/app/dashboard/_lib/require-membership.ts` — shared across every `/dashboard/*` page, not just one route.

### Auth-guard patterns

Three distinct guard functions exist, matching the three distinct auth boundaries described in `docs/architecture/system-architecture.md` §3:

- **`requireActiveMembership(callbackPath)`** (`src/app/dashboard/_lib/require-membership.ts`) — the standard guard for any organization-scoped `/dashboard/*` page. Redirects to `/login` if signed out, `/onboarding` if the user has zero `ACTIVE` memberships, and resolves the active org from the `activeOrgId` cookie (falling back to the earliest-joined membership).
- **`requirePlatformOwner(redirectPath)`** (`src/lib/billing/platform-admin.ts`) — gates the cross-tenant `/admin/*` pages to `User.isPlatformOwner` only. Redirects to `/dashboard` (not `/onboarding`) if the signed-in user isn't a platform owner.
- **`getClientPortalSession()`** (`src/lib/client-portal/auth.ts`) — the Client Portal's own, fully separate session check; never mixed with the internal Auth.js session.

Use the one matching the surface you're building on — don't reach for `requireActiveMembership` inside `/admin/*`, and don't reach for `requirePlatformOwner` inside ordinary `/dashboard/*` pages.

### The "never fake an external integration" discipline

This is enforced consistently, not just in one place. Concrete examples actually read in this codebase:

1. **`src/lib/ai/client.ts`** — `isAIConnected()` gates every Claude call; `getAnthropicClient()` throws `AINotConnectedError` rather than returning a stub client. A second error class, `AIBillingError`, distinguishes "not configured" from "configured but out of credit" so the UI never shows a generic failure for either case.
2. **`src/lib/integrations/types.ts`** — its own doc comment states the contract explicitly: *"an adapter must never report a connection as healthy or return a token/credential result unless a real HTTP call to the provider actually succeeded. If required env vars are missing, `isConfigured()` returns false and the UI shows 'Not Connected — requires `<ENV_VAR>`', never a simulated success."*
3. **`src/lib/billing/gateway/types.ts`** — the `PlatformGateway` interface requires every gateway to implement `isConfigured()` and `requiredEnvVars: string[]`; its doc comment notes it *"mirrors `src/lib/ai/client.ts`'s discipline: `isConfigured()` gates every call, a provider with no real credentials never fakes a checkout URL or a successful charge."*
4. **`src/lib/rag/embeddings.ts`** — throws `EmbeddingsNotConnectedError` rather than a fabricated zero-vector when no embedding provider is connected for an org.
5. **`.env.example`** itself documents this pattern for nearly every optional integration inline, e.g. the Outreach email note: *"With neither [RESEND_API_KEY nor EMAIL_SERVER] set, EmailDrafts can be generated and approved but a 'send' honestly reports not_configured — a draft is never marked SENT unless a real send genuinely succeeded."*

When adding a new external integration, follow this pattern: an explicit `isConfigured()`/`isXConnected()` check, a typed "not connected" error class, and a UI state that says so honestly — never a mocked success path.

## 3. Where things live (quick map)

- `src/lib/ai/` — the Anthropic client + AI Memory encryption.
- `src/lib/rag/` — the RAG pipeline (ingestion → chunking → embedding → retrieval → generation).
- `src/lib/integrations/` — the 40+-provider OAuth/API-key integration framework.
- `src/lib/billing/` — the platform's own subscription/invoicing/gateway engine (distinct from org-facing payment integrations).
- `src/lib/workflows/`, `src/lib/scheduler/` — the Automation Workflow engine and generic job scheduler (BullMQ-backed).
- `src/lib/security/` — security hardening utilities (as of this writing: `rate-limit-distributed.ts`, `security-events.ts`; being actively expanded by a parallel task — do not assume this list is final).
- `src/lib/monitoring/` — operational health checks (as of this writing: `health.ts` only).
- `src/app/dashboard/` — the main tenant-scoped app; `src/app/admin/` — platform-operator-only tools; `src/app/portal/` — the Client Portal.

## 4. A note on this codebase's Next.js version

`AGENTS.md`/`CLAUDE.md` at the repo root flag that this app runs **Next.js 16.2.10**, which has real breaking changes from earlier Next versions (e.g. `middleware.ts` → `proxy.ts`, documented inline in `src/proxy.ts`). Before writing routing/middleware/instrumentation code, check `node_modules/next/dist/docs/` for the current convention rather than relying on prior training data — this repo's own code comments do exactly that (see the citations in `src/proxy.ts` and `src/instrumentation.ts`).
