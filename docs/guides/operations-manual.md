# KVL GrowthOS — Day-2 Operations Manual

> Real operational procedures, sourced from the actual monitoring/scheduler/security code as it exists today. As with the security guide, `src/lib/monitoring/` and `src/lib/security/` were being actively built by a parallel task while this was written — re-verify against the final files before treating this as complete.

## 1. Checking system health

**`GET /api/health`** (`src/app/api/health/route.ts`) is a real, public, unauthenticated health-check endpoint — safe for a load balancer or uptime monitor to poll with no credentials. Every call is a **live probe**, never a cached/fabricated "all green":

- Returns HTTP `200` when overall status is `HEALTHY` or `DEGRADED`, HTTP `503` when `DOWN` — an orchestrator can make a routing/restart decision from the status code alone.
- Runs `runAndRecordFullSystemCheck()` (`src/lib/monitoring/aggregate.ts`), which checks (`src/lib/monitoring/health.ts`):
  - `DATABASE` — a real `SELECT 1`; `DEGRADED` if latency > 1000ms, `DOWN` on error.
  - `REDIS` — a real `PING`; `DEGRADED` if latency > 500ms.
  - `AI_PROVIDER` — reports `isAIConnected()` (i.e. whether `ANTHROPIC_API_KEY` is set) rather than burning a real token spend on every health check; genuinely accurate for "will an AI call succeed," not a full completion round-trip.
  - `PAYMENT_GATEWAY` — `DOWN` if `listConfiguredGateways()` (excluding always-available Bank Transfer/Manual) is empty.
  - `STORAGE` — a real filesystem write-access check on the `storage/` directory.
  - Four real BullMQ queue checks (`WORKFLOW_QUEUE`, `SCHEDULER_QUEUE`, `RAG_QUEUE`, `BILLING_QUEUE`) — `DEGRADED` once a queue's failed-job count exceeds 20.
- **Honest, documented gap:** `SystemComponent` also defines `EMBEDDING_PROVIDER` and `EMAIL`, but as of this writing neither has a live probe wired up (`src/lib/monitoring/aggregate.ts`'s own comment calls this out) — they simply don't appear in the component list, nothing is fabricated for them.
- The public JSON body intentionally omits each component's raw `detail` string (which can contain a live DB/Redis connection error, hostnames, etc.) — that detail is logged server-side only (`logger.error`, JSON-line structured logging to stdout via `src/lib/monitoring/logger.ts`) and persisted in full on a `SystemHealthSnapshot` row for the authenticated Production Dashboard.
- Every call to this endpoint also reconciles `SystemAlert` rows (`src/lib/monitoring/alerts.ts`) as a side effect — uptime history accrues from real traffic to this endpoint, not just from a periodic scheduled job.

**Log ingestion:** `src/lib/monitoring/logger.ts` writes structured JSON lines to stdout/stderr (errors/warnings to stderr, everything else to stdout) — designed to be ingested directly by a hosting platform's log drain (Vercel/Render/Fly/Railway all parse plain JSON-line stdout). This is a thin wrapper, not a full logging framework migration — most of the app still uses plain `console.error`/`console.log` outside `src/lib/monitoring/*`.

## 2. Viewing logs and audit trails

Three real, queryable trails exist, at different scopes:

| Model | Scope | Mutable? | Purpose |
|---|---|---|---|
| `AuditLog` | Per-org business actions | Create-only | General "what happened" (`src/lib/audit.ts`'s `logAudit()`) |
| `SecurityEvent` | Per-user/org security signals | Create-only | Security-specific events feeding the Security dashboard/alerting (`src/lib/security/security-events.ts`'s `logSecurityEvent()`) |
| `Incident` / `IncidentUpdate` | Platform-wide | Append-only timeline | Cross-tenant incident tracking, auto-opened from `CRITICAL` `SecurityEvent`s |

The most direct way to inspect these without a dedicated admin UI is **Prisma Studio**:

```bash
npx prisma studio
```

Real, useful queries an operator can run there (or via a one-off script using `prisma` from `@/lib/prisma`):

```ts
// Recent failed logins for a specific email, across all IPs
await prisma.securityEvent.findMany({
  where: { type: "LOGIN_FAILED", detail: "user@example.com" },
  orderBy: { createdAt: "desc" },
  take: 50,
});

// All CRITICAL security events in the last 24 hours, across every org
await prisma.securityEvent.findMany({
  where: { severity: "CRITICAL", createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  orderBy: { createdAt: "desc" },
});

// Every open incident, oldest first
await prisma.incident.findMany({
  where: { status: { not: "RESOLVED" } },
  include: { updates: { orderBy: { createdAt: "asc" } } },
  orderBy: { startedAt: "asc" },
});

// A specific user's audit trail for a given organization
await prisma.auditLog.findMany({
  where: { userId, organizationId },
  orderBy: { createdAt: "desc" },
});
```

`countRecentFailedLogins(identity, ipAddress, windowMs)` (`src/lib/security/security-events.ts`) is the real function to reach for programmatically if you need "how many failed logins for X in the last N minutes" rather than writing the raw query yourself.

As of this writing, no dedicated `/admin/incidents` (or `/admin/security`) page had landed to surface `Incident`/`SecurityEvent` in-app — see `docs/guides/admin-manual.md` for what admin tooling actually exists today, and re-check for a newly-landed page before defaulting to Prisma Studio.

## 3. Rotating a compromised secret / encryption key

There are **four independent AES-256-GCM key domains** (see `docs/guides/security-guide.md` §4) — rotating one never breaks the others by design. Each is a 64-character hex string (32 bytes), generated with `openssl rand -hex 32`. The real rotation procedure differs per domain because each protects different data with different re-encryption needs:

### `AGENT_MEMORY_ENCRYPTION_KEY` (`src/lib/ai/encryption.ts`)
Protects AI Agent Memory content. Rotating this key **without** re-encrypting existing rows makes all prior agent memory permanently undecryptable (there is no key-versioning column). Real procedure:
1. Decrypt and export all existing `AgentMemory` rows under the **old** key (script using `decryptMemory` from `src/lib/ai/encryption.ts`).
2. Set the new `AGENT_MEMORY_ENCRYPTION_KEY`.
3. Re-encrypt and re-save each row under the new key before removing the old key from the environment anywhere.

### `INTEGRATION_TOKEN_ENCRYPTION_KEY` (`src/lib/integrations/crypto.ts`)
Protects `IntegrationConnection.encryptedAccessToken` (every org's OAuth/API-key credentials). Rotating this key invalidates every stored token at once. The safer real-world procedure is usually **not** to re-encrypt in place but to:
1. Set the new key.
2. Force every `IntegrationConnection` to re-authenticate (mark them for re-connect, or simply let the next `getFreshAccessToken()` call fail and surface "Not Connected — reconnect" in the Integrations UI).
3. Users/orgs reconnect each integration through the normal OAuth/credential-entry flow, which writes a fresh row under the new key.

### `SECRETS_MANAGER_ENCRYPTION_KEY` (`src/lib/secrets/crypto.ts`)
Protects org-level `Secret.encryptedValue` (`/dashboard/settings/secrets`). Same shape as above: either write a one-off decrypt-under-old/re-encrypt-under-new migration script, or accept that rotating this key requires every org to re-enter their secrets manually. Given secrets here are typically small in number per org, prefer the re-encryption-script approach to avoid disrupting customers.

### `WEBHOOK_SECRET_ENCRYPTION_KEY` (`src/lib/workflows/webhooks.ts`)
Protects Automation Workflow outbound webhook signing secrets. Rotating without re-encryption breaks outbound webhook signature generation for every existing workflow webhook node until each is re-saved. Prefer a decrypt-old/re-encrypt-new migration script for the same reason as above.

**General principle across all four:** never delete the old key from the environment until you have confirmed (by running the migration script, not by assumption) that every row it protects has been re-encrypted under the new key. Keep the old key available (e.g., in a separate secret store, not in the live `.env`) until that migration is verified complete.

## 4. Handling a stuck / failed BullMQ job

The real Dead Letter Queue UI lives at **`/dashboard/settings/jobs`** (`src/app/dashboard/settings/jobs/page.tsx`), gated by `requireActiveMembership` at the page level and further restricted to `OWNER`/`ADMIN` roles for actual mutations (`requirePrivileged()` in `src/app/dashboard/settings/jobs/actions.ts`). It shows, live:

- Every registered job's status (`scheduler.listStatuses()`) and its last 10 runs (`scheduler.listRuns(key, 10)`).
- Real queue depth stats (`getQueueStats()`) and a list of genuinely failed jobs (`listFailedJobs()`), both from `src/lib/scheduler/providers/bullmq-provider.ts`.
- Running/retrying/failed run breakdowns, each job's configured cron expression (with the server's real resolved IANA timezone shown via `Intl.DateTimeFormat().resolvedOptions().timeZone`), and per-job priority (`P1 Critical` through `P5 Background`).

Real actions available from that page (all in `src/app/dashboard/settings/jobs/actions.ts`, all privileged and all writing an `AuditLog` entry where they mutate configuration):

- **`runJobNow(key)`** — manually triggers a job immediately (`scheduler.trigger(key)`).
- **`pauseJob(key)` / `resumeJob(key)`** — pause/resume a recurring job.
- **`retryFailedJobAction`** → `retryFailedJob(jobId)` — re-queues a specific failed job.
- **`discardFailedJobAction`** → `discardFailedJob(jobId)` — permanently drops a specific failed job from the dead-letter list (use when the job is confirmed unrecoverable/no-longer-relevant, not as a default response to a failure).
- **`updateJobCronExpressionAction(key, cronExpression)`** — edits a job's schedule (validated via `updateJobCronExpressionSchema`), logs `jobs.cron_expression_updated` to `AuditLog` with the old/new expression in `metadata`.

This UI only covers the generic `kvl-scheduler` queue (the `SchedulerProvider` abstraction). The other 4 real BullMQ queues (`kvl-workflow-execution`, `kvl-webhook-delivery`, `kvl-rag-embedding`, `kvl-billing-recurring` — see `docs/architecture/system-architecture.md` §5) each expose their own `getXQueueStats()`-style function (e.g. `getWorkflowQueueStats` in `src/lib/workflows/engine.ts`, `getRagQueueStats` in `src/lib/rag/embedding-queue.ts`, `getRecurringBillingQueueStats` in `src/lib/billing/recurring-billing-queue.ts`) — these feed `/api/health`'s per-queue `DEGRADED` status, but as of this writing **do not** have their own dedicated dead-letter/retry UI the way the scheduler queue does. For those, a stuck job today requires either direct BullMQ CLI/Redis inspection (queue name is the string constant in each file, e.g. `kvl-rag-embedding`) or a one-off script calling that queue's own retry/discard logic.

## 5. Backups

Real backup tooling landed under `scripts/` during this documentation pass:

- **`scripts/backup-database.sh`** — runs `pg_dump` against `DATABASE_URL` in custom format (`-Fc`, chosen specifically so it can be fed straight to `pg_restore`), gzips the result, writes it to `storage/backups/database/` (or `$BACKUP_DIR` if set) as `kvl-growthos-db-<UTC timestamp>.dump.gz`. Prints only the absolute output path to stdout on success (all progress goes to stderr); exits non-zero and removes any partial dump on failure — it never fabricates a success.
- **`scripts/backup-storage.sh`** — tars + gzips the app's real on-disk `storage/` directory (`src/lib/storage/file-store.ts`'s root — uploaded documents, project files, prior backups) to `storage/backups/storage/kvl-growthos-storage-<timestamp>.tar.gz`. Its own comment notes there is no S3/Blob store in this environment, so this directory is genuinely the durable artifact store that needs backing up.
- **`scripts/run-backup.ts`** — the real CLI wrapper (`tsx scripts/run-backup.ts database|storage`) that invokes the shell script above and records the run as a real `Backup` row (`src/lib/ops/backup.ts`: `recordBackupStart`/`recordBackupComplete`/`recordBackupFailed`, including a SHA-256 checksum of the resulting archive) so a backup run is visible in the database/Production Dashboard rather than being a cron job silently writing files nobody tracks. Exits 0 only on a real `SUCCEEDED` backup.

Run these on a schedule (cron/systemd timer/hosting-platform scheduled job) pointed at `DATABASE_URL` for the database script; the storage script needs no env var beyond an optional `BACKUP_DIR` override. Verify restore periodically — as of this writing, check `scripts/` for a `run-restore-test.ts` or equivalent (`scripts/backup-database.sh`'s own comment references `scripts/run-restore-test.ts` as a planned consumer of its `.dump.gz` output via `pg_restore`) before assuming an automated restore-verification path exists.

## 6. Disaster recovery

A full disaster-recovery runbook landed at `docs/operations/disaster-recovery.md` from the parallel monitoring/DR task during this documentation pass — it is the authoritative source for RTO/RPO targets and restore procedures (it states its RPO honestly as "however long since the last `SUCCEEDED` `Backup` row," since this deployment runs manual/cron-triggered backups rather than continuous WAL streaming as of this writing) and references real tooling (`scripts/run-restore-test.ts`, `src/lib/ops/restore-test.ts`) beyond what §5 above covers. Defer to that document for anything beyond the day-2 backup-invocation basics in §5.

## 7. What this document could not confirm as of this writing

- Whether an admin UI for `ComplianceReport` existed yet — not found as of this writing (see `docs/guides/admin-manual.md`).
- Whether `PLATFORM_ALERTS_SLACK_WEBHOOK_URL` / `PLATFORM_ALERTS_TEAMS_WEBHOOK_URL` (referenced in `src/lib/monitoring/alerts.ts` as "new env vars added for" platform-wide infra alerting) had been added to `.env.example` yet — a direct grep of `.env.example` at the time of writing found no match. Confirm before assuming they're documented there; set them directly in your environment regardless if you want platform-wide Slack/Teams alerting.
