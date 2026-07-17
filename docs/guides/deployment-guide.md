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

## 6. Docker & CI

Real, present in this repository — `Dockerfile` (multi-stage, `output: "standalone"`, non-root `nextjs` user, `EXPOSE 3000`), `docker-compose.yml` (app + Postgres 16 + Redis 7, real healthchecks, loopback-only port binding designed to sit behind an existing host reverse proxy), `.github/workflows/ci.yml` (lint/typecheck/`vitest`/`playwright`, real Postgres+Redis service containers), `.github/workflows/deploy.yml` (builds/pushes to GHCR, runs `prisma migrate deploy`, records a real `Deployment` row — stops short of an actual host rollout since no hosting credentials exist in this environment), and `.github/workflows/codeql.yml`.

```bash
docker build -t kvl-growthos .
docker run -p 3000:3000 --env-file .env kvl-growthos
# or, with real Postgres/Redis wired up:
docker compose up -d
```

## 6b. Kubernetes & PM2 (Phase 20)

Two additional real, valid deployment topologies for scale beyond a single VPS:

- **`k8s/`** — real Deployment/Service/Ingress/ConfigMap/Secret-template/HPA/migration-Job manifests for a real Kubernetes rollout (2+ replicas, autoscaling 2–10 on CPU/memory, real liveness/readiness probes against `/api/health`). See `k8s/README.md` for the full apply order and what's deliberately NOT included (in-cluster Postgres/Redis — use a real managed service instead). Hand-validated for schema correctness; not yet applied against a live cluster (`kubectl` was unavailable in the environment these were authored in) — run `kubectl apply --dry-run=client -f k8s/` before a real rollout.
- **`ecosystem.config.js`** — real PM2 process-manager config for a bare-metal/VM deployment without Docker, running the same `output: "standalone"` build's generated `server.js` in cluster mode (one worker per CPU core). `pm2 start ecosystem.config.js` after `npm run build`.

## 8. Cloud provider deployment runbooks

Every runbook below is built from the real artifacts already in this repo — `Dockerfile`, `docker-compose.yml`, `k8s/*.yaml`, `ecosystem.config.js`, `nginx/nginx.conf`, and `.env.example` — not generic "deploy your app to the cloud" filler. Two facts apply to every provider and are not repeated in each section:

- **Port and health check are fixed**: the app always listens on **3000** (`Dockerfile EXPOSE 3000` / `ENV PORT=3000`, `docker-compose.yml`, `k8s/deployment.yaml` `containerPort: 3000`, `ecosystem.config.js` `PORT: "3000"`), and `GET /api/health` (`src/app/api/health/route.ts`) is the real, unauthenticated liveness/readiness endpoint every load balancer/orchestrator below should point at. It runs live Postgres (`SELECT 1`), Redis (`PING`), local disk-write, and BullMQ-queue-depth checks in parallel and returns HTTP `200` for healthy/degraded, `503` only when a component is fully down — it never leaks raw connection strings or error detail in the response body (those are logged server-side only).
- **Object storage is not implemented.** `src/lib/storage/file-store.ts` (used for uploaded documents, white-label logos, RAG source files, project files, and generated invoices/exports) writes to local disk under `storage/<subdir>/` — there is no S3/Blob/GCS integration anywhere in this codebase today (`k8s/deployment.yaml`'s own comment flags this explicitly). A single-instance deployment just needs a persistent volume mounted at `/app/storage`; a multi-instance deployment (autoscaled ECS/Cloud Run/AKS/GKE, or the k8s manifests' `hpa.yaml` at more than 1 replica) needs a **shared** filesystem (EFS, Azure Files, Filestore, or NFS) mounted at the same path on every instance, because `k8s/deployment.yaml` ships with `emptyDir: {}` for that mount — correct only for a single-replica/dev rollout, called out as such in the manifest's own comment. Treat this as a real, current limitation, not a gap in these instructions.

Cloud consoles and CLIs change frequently. Where a step below names a specific console menu path or CLI flag, treat it as directional guidance current as of this writing, not a guaranteed-stable command — verify against the provider's current documentation before running it in production, particularly for pricing tiers and IAM permission names.

### 8.1 AWS — ECS Fargate or EKS

**Managed data services**: Amazon RDS for PostgreSQL (a current-generation engine version — see §1 on the Postgres 14+/16+ assumption) for `DATABASE_URL`, and Amazon ElastiCache for Redis (or the Valkey-based successor, per AWS's current naming) for `REDIS_URL`. Put both in private subnets with a security group that only allows inbound from the app's own security group.

1. **Build & push the image** to Amazon ECR using the repo's own `Dockerfile` unmodified:
   ```bash
   aws ecr create-repository --repository-name kvl-growthos
   aws ecr get-login-password | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
   docker build -t <account-id>.dkr.ecr.<region>.amazonaws.com/kvl-growthos:latest .
   docker push <account-id>.dkr.ecr.<region>.amazonaws.com/kvl-growthos:latest
   ```
   (This mirrors what `.github/workflows/deploy.yml` already does against GHCR — same build, different registry.)
2. **Run migrations** once, before the first rollout: run `npx prisma migrate deploy` as a one-off ECS task (Fargate task using the same image, overriding the container command) or a Kubernetes Job — the repo already ships exactly this as `k8s/migration-job.yaml` if you're going the EKS route.
3. **ECS Fargate path**: create a Task Definition with one container from the pushed image, container port `3000`, environment variables from an ECS `environmentFiles` S3 object or individual `secrets` entries backed by AWS Secrets Manager / SSM Parameter Store (map every var in the Environment Variables table in §2 — at minimum `DATABASE_URL`, `AUTH_SECRET`, `REDIS_URL`), an ALB target group health check pointed at `/api/health` on port 3000, and an EFS volume mounted at `/app/storage` if you plan more than one task (see the object-storage note above). Put the service behind an Application Load Balancer terminating TLS (ACM certificate) and forwarding to the target group.
4. **EKS path**: reuse `k8s/` as-is. Push the built image to ECR, update the placeholder image reference (`ghcr.io/your-org/kvl-growthos:latest`) in `k8s/deployment.yaml` and `k8s/migration-job.yaml` to your ECR image URI, fill in real `DATABASE_URL`/`REDIS_URL`/`AUTH_SECRET`/encryption keys in a copy of `k8s/secret.example.yaml` (consider AWS Secrets Manager + the External Secrets Operator instead of a plain `Secret`, per that file's own comment), and follow `k8s/README.md`'s apply order (`namespace.yaml` → `configmap.yaml` → `secret.yaml` → `migration-job.yaml` → `deployment.yaml` → `service.yaml` → `ingress.yaml` → `hpa.yaml`). Use the AWS Load Balancer Controller so `ingress.yaml`'s Ingress resource provisions a real ALB; swap the `cert-manager.io/cluster-issuer` annotation for ACM if you're not running cert-manager. Replace the `emptyDir` storage volume with an EFS-backed `StorageClass`/PVC for any deployment above 1 replica.
5. Set `HOSTNAME=0.0.0.0` (already the Dockerfile/k8s default) so the standalone Next.js server binds on all interfaces inside the container/task network.

### 8.2 Azure — Container Apps or AKS

**Managed data services**: Azure Database for PostgreSQL – Flexible Server for `DATABASE_URL`, and Azure Cache for Redis for `REDIS_URL`. Restrict both to VNet-integrated access rather than public endpoints where the app's compute also sits inside a VNet.

1. **Build & push** to Azure Container Registry:
   ```bash
   az acr create --name <registryName> --resource-group <rg> --sku Basic
   az acr login --name <registryName>
   docker build -t <registryName>.azurecr.io/kvl-growthos:latest .
   docker push <registryName>.azurecr.io/kvl-growthos:latest
   ```
2. **Run migrations** once per release: an `az container` one-off run or `az containerapp job` (Container Apps) / a `k8s/migration-job.yaml`-style Job (AKS) executing `npx prisma migrate deploy` against the Flexible Server instance's connection string.
3. **Azure Container Apps path**: create a Container App from the pushed image, ingress target port `3000`, external ingress enabled with the platform's own managed TLS, and every env var from §2 set as Container App secrets/env vars (`az containerapp secret set` + `az containerapp update --set-env-vars`). Configure the Container App's health probe against `/api/health`. For storage, mount an Azure Files share (Container Apps supports Azure Files-backed volumes) at `/app/storage` — the same shared-filesystem requirement as every other multi-instance provider here, since this app has no Blob Storage integration of its own.
4. **AKS path**: same `k8s/` manifests as the AWS EKS path — push to ACR instead of ECR, update the image reference, use the AGIC (Application Gateway Ingress Controller) or ingress-nginx + cert-manager for `k8s/ingress.yaml`, and replace `emptyDir` with an Azure Files-backed PVC (`azurefile-csi` StorageClass, which supports `ReadWriteMany`) for multi-replica storage.
5. Populate the Secret/Container-App-secrets with the same variable set as the AWS section — `DATABASE_URL` pointed at the Flexible Server, `REDIS_URL` pointed at Azure Cache for Redis (note Azure Cache for Redis uses TLS by default on port 6380 in many SKUs — confirm the exact connection string format in the current Azure portal for your chosen tier before setting `REDIS_URL`).

### 8.3 GCP — Cloud Run or GKE

**Managed data services**: Cloud SQL for PostgreSQL for `DATABASE_URL`, and Memorystore for Redis for `REDIS_URL`. Memorystore instances are VPC-internal only (no public IP), so Cloud Run needs a Serverless VPC Access connector to reach it — this is a real, non-optional extra step for the Cloud Run path that doesn't exist on the other providers' equivalents.

1. **Build & push** to Artifact Registry:
   ```bash
   gcloud artifacts repositories create kvl-growthos --repository-format=docker --location=<region>
   gcloud auth configure-docker <region>-docker.pkg.dev
   docker build -t <region>-docker.pkg.dev/<project-id>/kvl-growthos/app:latest .
   docker push <region>-docker.pkg.dev/<project-id>/kvl-growthos/app:latest
   ```
2. **Run migrations** once per release: `gcloud run jobs create` (or `execute` on an existing job) running the same image with the command overridden to `npx prisma migrate deploy`, on the same VPC connector as the service so it can reach Cloud SQL — or, on GKE, apply `k8s/migration-job.yaml` as-is.
3. **Cloud Run path**: `gcloud run deploy` the pushed image, container port `3000`, `--vpc-connector` attached for Memorystore/private Cloud SQL access (or a Cloud SQL Auth Proxy sidecar if you're using Cloud SQL's public IP + proxy pattern instead), every env var from §2 set via `--set-env-vars`/`--set-secrets` (prefer Secret Manager–backed `--set-secrets` for `AUTH_SECRET` and the encryption keys), and a startup/liveness probe pointed at `/api/health`. **Important limitation to state plainly**: Cloud Run instances have no persistent local disk across restarts/scale-events by default, and Cloud Run does not support mounting a shared network filesystem the way Container Apps/EKS/AKS do — since this app's document/white-label-asset storage is local-disk-only (see the preface above), Cloud Run is the one provider here where multi-instance file storage genuinely has no clean answer without first adding real object-storage support to `src/lib/storage/file-store.ts`. Cloud Run is a good fit for this app only if you either run a single instance (`--max-instances=1`, accepting the single-writer limitation) or accept that uploaded documents/logos won't survive being served by a different instance than the one that wrote them.
4. **GKE path** avoids that limitation: same `k8s/` manifests as AWS/Azure — push to Artifact Registry, update the image reference, use GKE's native Ingress or ingress-nginx + cert-manager for `k8s/ingress.yaml`, and back the storage PVC with Filestore (NFS, supports `ReadWriteMany`) instead of `emptyDir` for any deployment above 1 replica.
5. `HOSTNAME=0.0.0.0`/`PORT=3000` are already Cloud Run's own expected defaults for a container listening on `$PORT` — the Dockerfile's `ENV PORT=3000` matches what Cloud Run injects unless you override it, so no change is needed there.

### 8.4 DigitalOcean — App Platform or a Droplet

**Managed data services**: DigitalOcean Managed Databases for PostgreSQL, and DigitalOcean Managed Databases for Redis/Valkey (DigitalOcean has migrated new Redis-compatible clusters to Valkey under the same "Managed Redis/Valkey" product — confirm current naming in your account before provisioning).

- **App Platform path**: create an App from this repo/registry, choosing "Dockerfile" as the build method so App Platform builds the existing `Dockerfile` directly rather than needing a buildpack. Set the HTTP port to `3000` and the health check path to `/api/health`. Add every env var from §2 as App-level environment variables/encrypted secrets, and set `DATABASE_URL`/`REDIS_URL` to the Managed Database connection strings (App Platform can inject these automatically if you attach the databases as a "Database" component in the same App spec). **App Platform's filesystem is ephemeral per deployment** — same storage caveat as Cloud Run above: this app's local-disk document/asset storage will not persist across redeploys or survive being read by a different instance under horizontal scaling. App Platform is a reasonable fit at a single instance; beyond that, the same `file-store.ts` limitation applies.
- **Droplet path** — this is the one this repo's own `docker-compose.yml`/`nginx/nginx.conf`/`ecosystem.config.js` were actually written for, and the most direct match to what's already in the repo:
  1. Provision a Droplet (Ubuntu LTS is the common choice), install Docker + the Compose plugin.
  2. Clone the repo, create a real `.env` from `.env.example` with `AUTH_SECRET`, `POSTGRES_PASSWORD`, `APP_HOST_PORT`/`POSTGRES_HOST_PORT` (both required by `docker-compose.yml`'s `:?set ... in your .env` guards), and any encryption/AI/integration keys you need.
  3. `docker compose up -d` — this brings up the `app` (built from the local `Dockerfile`), `postgres:16`, and `redis:7` services exactly as described in §6, with Postgres/app ports bound to `127.0.0.1` only and Redis not published at all.
  4. Install the repo's own `nginx/nginx.conf` as your public-facing reverse proxy (or adapt it — it already proxies `/` to the `app` service, forwards the standard `X-Forwarded-*` headers, and supports WebSocket upgrades). Point `certbot --nginx` at it for a free Let's Encrypt certificate once DNS is pointed at the Droplet's IP.
  5. Use a Volume (DigitalOcean's block storage product) mounted at the host path backing the `storage_documents` named volume if you want document storage to survive Droplet resizes/rebuilds independent of the boot disk.
  - You can substitute the bare-metal PM2 path instead of Docker on the same Droplet — see the Hetzner section below, which documents that exact setup, including a real reference nginx vhost from a production deployment of this app.

### 8.5 Hetzner — VPS with PM2 + nginx (no managed app platform)

Hetzner Cloud provides VPS/dedicated compute but, as of this writing, no first-party managed Postgres/Redis/app-platform product comparable to the other four providers — verify this against Hetzner's current product catalog before assuming it, since providers add managed data services over time. Two real, viable paths, both already represented by files in this repo:

- **Docker Compose path** — identical to the DigitalOcean Droplet path above: provision a Hetzner Cloud server, install Docker + Compose, `docker compose up -d` using this repo's `docker-compose.yml` (which brings its own Postgres 16 and Redis 7 containers, so no managed database is needed), and front it with `nginx/nginx.conf` + certbot.
- **Bare-metal PM2 path** — this repo's `ecosystem.config.js` and `deploy/nginx/growthos.kvlbusinesssolutions.com.conf` are, respectively, the real PM2 config and a real reference nginx vhost from an actual production deployment of this app on a Hetzner-class VPS (`srv1569796.hstgr.cloud`), so this path is directly copyable:
  1. Install Node.js 20 LTS, PostgreSQL, and Redis directly on the VPS (`apt install postgresql redis-server` on Debian/Ubuntu, or run them as Docker containers alongside a non-Docker app process if you'd rather not manage native Postgres/Redis packages).
  2. `git clone` the repo, `npm ci`, populate a real `.env` (same required vars as §2 — `DATABASE_URL` pointing at the local Postgres instance, `REDIS_URL` defaulting to `redis://localhost:6379` if Redis is on the same host), `npx prisma migrate deploy`, `npm run build`.
  3. Install PM2 globally (`npm i -g pm2`) and start the app with the repo's own config: `pm2 start ecosystem.config.js` — this runs the standalone build's `server.js` in PM2 cluster mode (`instances: "max"`, one worker per CPU core), listening on `PORT=3000`/`HOSTNAME=0.0.0.0` exactly as configured in the file. `pm2 save` + `pm2 startup` to survive reboots.
  4. Install nginx and adapt `deploy/nginx/growthos.kvlbusinesssolutions.com.conf` as your site config — it's a real, working reference: `client_max_body_size 50M`, proxies `/` to `http://127.0.0.1:3030` (that specific port was chosen on the reference host because 3000–3204 were already in use by other services on the same box — pick whichever free loopback port you're actually running the app on, and make sure it matches the `PORT` your PM2 process is listening on), forwards `Upgrade`/`Connection: upgrade` for WebSocket support, and gets rewritten in place by `certbot --nginx -d <your-domain>` to add TLS + an HTTP→HTTPS redirect.
  5. For document/white-label-asset storage, a Hetzner Volume (their block storage product) mounted at the path backing `storage/` gives you persistent, resizable disk independent of the server's boot volume — the same single-writer caveat from the preface applies if you ever run more than one app instance against the same storage directory without first adding real object storage to the app.

## 9. Operational follow-up

Once deployed, see `docs/guides/operations-manual.md` for health checks, log/audit review, secret rotation, and stuck-job recovery, and `docs/guides/security-guide.md` for the real security posture (CSP/CSRF, 2FA, encryption key domains, webhook verification) that this deployment relies on.
