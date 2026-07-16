# KVL GrowthOS — Production Deployment Guide

> Written from the real `package.json`, `.env.example`, `prisma/schema.prisma`/`prisma.config.ts`, and `src/instrumentation.ts` as they exist today. Sections referencing Docker/CI are honestly marked as pending a parallel task's output — see §6.

## 1. Prerequisites

- **PostgreSQL** — `prisma/schema.prisma`'s `datasource db { provider = "postgresql" }` is the only supported database. No specific minimum version is pinned anywhere in this repository (no Docker/CI config had landed yet at the time of this writing — see §6); given this app runs **Prisma 7.8** (`@prisma/client` / `prisma` `^7.8.0` in `package.json`) via `@prisma/adapter-pg`, a current-generation Postgres (14+, ideally 16+) is a safe assumption, but confirm against Prisma 7's actual supported-database matrix and any final `docker-compose.yml`/CI config before relying on a specific number.
- **Redis** — required for all 5 real BullMQ queues (workflow execution, scheduler, webhook delivery, RAG embedding, billing recurring — see `docs/architecture/system-architecture.md` §5) and the generic Redis caching layer (`src/lib/cache/redis-cache.ts`). Configured via `REDIS_URL`, defaulting to `redis://localhost:6379` if unset.
- **Node.js** — `package.json` has no `engines` field. The development machine this documentation was written on runs **Node v20.20.0** (checked via `node --version`); use Node 20 LTS in production unless a later CI config pins something different.

## 2. Environment variables

`.env.example` is the authoritative, heavily-commented list. Categorized summary (see `docs/guides/developer-guide.md` §1 for the required-vs-optional breakdown in more depth):

| Category | Variables | Required? |
|---|---|---|
| Core | `DATABASE_URL`, `AUTH_SECRET` | **Required** |
| Background jobs | `REDIS_URL` | Required for real functionality; defaults to localhost if unset |
| AI | `ANTHROPIC_API_KEY` | Optional — AI features honestly show "not connected" without it |
| Encryption (4 independent domains) | `AGENT_MEMORY_ENCRYPTION_KEY`, `INTEGRATION_TOKEN_ENCRYPTION_KEY`, `SECRETS_MANAGER_ENCRYPTION_KEY`, `WEBHOOK_SECRET_ENCRYPTION_KEY` | Required only once the corresponding feature is used — see `docs/guides/security-guide.md` |
| OAuth login | `GOOGLE_CLIENT_ID`/`SECRET`, `MICROSOFT_ENTRA_ID_CLIENT_ID`/`SECRET`(+`TENANT_ID`), `GITHUB_CLIENT_ID`/`SECRET` | Optional, per-provider |
| Email | `EMAIL_SERVER`, `EMAIL_FROM`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Optional — degrades to console-logged magic links / undelivered drafts |
| Misc widgets | `WEATHER_API_KEY` | Optional |
| Integration Hub (40+ adapters) | Per-provider OAuth pairs (Slack, HubSpot, Salesforce, Zoho, Pipedrive, Dropbox, Google/Microsoft integration apps — separate from the login OAuth apps above, Calendly, Zoom, QuickBooks, Xero, GitHub/GitLab/Bitbucket integration apps) + e-signature webhook secrets (`DOCUSIGN_WEBHOOK_HMAC_SECRET`) | Optional, independently gated |
| Platform Billing gateways | `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_ID`/`KEY_SECRET`/`WEBHOOK_SECRET`, `PADDLE_API_KEY`/`WEBHOOK_SECRET`(+`PADDLE_ENVIRONMENT`), `LEMONSQUEEZY_API_KEY`/`STORE_ID`/`WEBHOOK_SECRET` | Optional per gateway — Bank Transfer/Manual always works with zero credentials |

Important: the OAuth **login** client IDs (`GOOGLE_CLIENT_ID`, `MICROSOFT_ENTRA_ID_CLIENT_ID`, `GITHUB_CLIENT_ID`) are deliberately separate credentials from the **integration** OAuth apps (`GOOGLE_INTEGRATION_CLIENT_ID`, `MICROSOFT_INTEGRATION_CLIENT_ID`, `GITHUB_INTEGRATION_CLIENT_ID`) even for the same provider — `.env.example` calls this out explicitly for each pair ("must never be reused for login"). Do not collapse them when configuring a real deployment.

## 3. Database migrations — `migrate deploy`, never `migrate dev`

This repo has **42 real migrations** under `prisma/migrations/` (from `20260713185502_init` through the current phase). In production, run:

```bash
npx prisma migrate deploy
```

**Never** run `npx prisma migrate dev` against a production database. The two commands do fundamentally different things:

- `migrate dev` is an interactive, development-only workflow: it compares your local schema to the migration history, may **prompt to reset the database** if it detects drift, generates a new migration file from whatever schema changes are pending, and uses a disposable "shadow database" to validate them. It assumes you're the one actively iterating on the schema.
- `migrate deploy` is the non-interactive, CI/production-safe command: it applies any migration files in `prisma/migrations/` that haven't been applied yet, in order, and does nothing else — no drift detection prompts, no shadow database, no schema diffing, no destructive reset path. It is explicitly designed to be safe to run unattended as part of a deploy pipeline.

Run `prisma generate` (already wired into `postinstall` in `package.json`) as part of your build step so the generated client at `src/generated/prisma` matches the schema before `next build` runs.

## 4. Instrumentation bootstrap

`src/instrumentation.ts` exports Next.js 16's `register()` hook, which the framework calls **once per server process, before it accepts requests** (see the file's own citation of `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`). It guards on `process.env.NEXT_RUNTIME === "nodejs"` (skipping the edge runtime, since it needs Prisma/`node-cron`/BullMQ) and then, in order:

1. Imports and calls `initScheduler()` from `src/lib/scheduler/init.ts` — registers the generic Scheduler Service's recurring jobs.
2. Imports and calls `registerRecurringBillingJobs()` from `src/lib/billing/recurring-billing-queue.ts` — registers the platform billing engine's `renewal-sweep`/`trial-reminder`/`dunning`/`credit-reset` jobs on the separate `kvl-billing-recurring` BullMQ queue.
3. Imports and calls `ensurePlansSeeded()` from `src/lib/billing/plan-catalog.ts` — idempotently seeds the Plan catalog.
4. Imports and calls `ensureCoreFeatureFlagsSeeded()` from `src/lib/billing/feature-flags.ts` — idempotently seeds core feature flags.

Practically: **every real deployment needs a running Node.js server process (not just a static export) for this hook to fire**, and needs `DATABASE_URL`/`REDIS_URL` reachable at process start, since all four steps touch the database and (for the queue registration steps) Redis. If you run multiple app server replicas behind a load balancer, this hook runs once **per replica** — the job-registration calls are documented as idempotent (`registerRecurringBillingJobs()`, `initScheduler()`), so this is safe, but be aware every replica opens its own Redis connections for these queues.

## 5. Build & start

```bash
npm run build   # next build — runs the production build
npm run start   # next start — runs the production server (fires instrumentation.ts)
```

`next.config.ts` sets `serverExternalPackages: ["pdfkit"]` — required because `pdfkit` reads its `.afm` font files from disk relative to its own package directory at runtime, which bundling would break (see the inline comment in `next.config.ts` and `src/lib/export/pdf.ts`). No other custom build configuration exists in `next.config.ts` as of this writing.

## 6. Docker & CI — pending a parallel task

As of this writing, **no `Dockerfile`, `docker-compose.yml`, or `.github/workflows/` directory exists in this repository** — a parallel task in this same build session was scoped to add them (containerization + CI/CD + QA). This section is intentionally left as a placeholder rather than a fabrication:

- **Expected (per the stated scope of that parallel task):** a `Dockerfile` building the Next.js app, a `docker-compose.yml` wiring up Postgres + Redis + the app for local/CI use, and `.github/workflows/ci.yml` running lint/typecheck/tests (and possibly `vitest`/`playwright`, per that task's scope) on push.
- **Action required:** once those files land, re-read them and replace this section with their real, verified contents — service names, exposed ports, build stages, and the exact CI steps — rather than trusting this description. Do not assume the placeholder description above is accurate; it is a statement of expected scope, not a description of real files that exist.

## 7. Operational follow-up

Once deployed, see `docs/guides/operations-manual.md` for health checks, log/audit review, secret rotation, and stuck-job recovery, and `docs/guides/security-guide.md` for the real security posture (CSP/CSRF, 2FA, encryption key domains, webhook verification) that this deployment relies on.
