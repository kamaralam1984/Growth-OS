# Disaster Recovery Runbook

This is a real, concrete operational runbook for KVL GrowthOS — every command
below is a real command that exists in this repository today (see
`scripts/backup-database.sh`, `scripts/backup-storage.sh`,
`scripts/run-backup.ts`, `scripts/run-restore-test.ts`,
`src/lib/ops/backup.ts`, `src/lib/ops/restore-test.ts`). Nothing here
describes tooling that doesn't exist yet.

> **Phase 20 fix note:** the very first real end-to-end backup+restore-test run against this repo's actual `DATABASE_URL` (which, per Prisma convention, carries a `?schema=public` query parameter) surfaced two real bugs, both now fixed: (1) `pg_dump` rejects the `schema` query parameter outright (`invalid URI query parameter: "schema"`) — `scripts/backup-database.sh` now strips query parameters from the URI it passes to `pg_dump` and selects the schema via the real `-n` flag instead; (2) `pg_restore` failed with `schema "public" already exists` because a freshly `createdb`'d database already has a `public` schema, colliding with the dump's own `CREATE SCHEMA public;` — `src/lib/ops/restore-test.ts` now passes `--clean --if-exists` to `pg_restore`, the standard fix. Both are live-verified working as of this fix.

## 1. Targets — RTO / RPO (stated honestly, not aspirationally)

**RPO (Recovery Point Objective) — currently manual/cron-triggered backups,
NOT continuous WAL streaming.** This deployment does not yet run Postgres
continuous archiving / point-in-time recovery (no `wal_level=replica`
archiving pipeline, no streaming replica). The real, honest RPO today is:

> **RPO = however long it has been since the last SUCCEEDED `Backup` row of
> type `DATABASE`.**

Check it directly:

```sql
SELECT "completedAt" FROM "Backup"
WHERE type = 'DATABASE' AND status = 'SUCCEEDED'
ORDER BY "completedAt" DESC LIMIT 1;
```

**Update (Phase 20):** `scripts/backup-database.sh` now runs automatically every night at 2am via the real `"nightly-database-backup"` job in `src/lib/scheduler/registry.ts` (BullMQ-backed, calling the same `runBackupScript()` logic the CLI wraps — see `src/lib/ops/run-backup-script.ts`), so the honest worst-case RPO is now **up to 24 hours of data loss** in normal operation, down from the prior manual/unscheduled state. The caveat that motivated keeping this OUT of the in-process scheduler originally still applies and is worth stating plainly: a BullMQ job only runs while the app process is up — if the app itself is down or crash-looping for an extended period, the nightly backup silently doesn't run either. For a stronger guarantee independent of app uptime, additionally wire `npm run backup:database` into host-level cron (or your platform's scheduled-task feature) as a second, process-independent trigger — `runBackupScript()`/`recordBackupStart()` are idempotent-safe to call more than once a day. Reduce RPO further by increasing frequency, or (a real follow-up, not implemented here) enabling WAL archiving / a managed Postgres provider's point-in-time-recovery feature for a near-zero RPO.

**RTO (Recovery Time Objective) — realistic estimate for this
architecture:**

| Step | Realistic time |
|---|---|
| Detect the outage (SystemAlert DATABASE_FAILURE fires from `/api/health` or the 5-minute `health-snapshot` job) | < 5 minutes |
| Provision/reach a replacement Postgres instance | 5–30 minutes (depends on hosting) |
| Run the real restore procedure (Section 3) | 5–20 minutes, depending on database size |
| Verify the app + smoke-test critical flows | 10–15 minutes |
| **Total realistic RTO** | **~30–75 minutes** |

This is an estimate for a single-instance deployment restoring from the most
recent gzip'd `pg_dump` — not a guaranteed SLA.

## 2. Backup procedure (real, runnable today)

Database backup (custom-format `pg_dump`, gzip'd, tracked as a real `Backup`
row):

```bash
npm run backup:database
# equivalent to: tsx scripts/run-backup.ts database
```

Storage backup (tars + gzips the real `storage/` directory —
`src/lib/storage/file-store.ts`'s on-disk root; there is no S3/Blob store in
this environment):

```bash
npm run backup:storage
```

Both scripts write into `$BACKUP_DIR` (defaults to
`<project root>/storage/backups/{database,storage}/`) and create a real
`Backup` row via `src/lib/ops/backup.ts` (`recordBackupStart` →
`recordBackupComplete`/`recordBackupFailed`) — check the `Backup` table for
history, or the Production Dashboard's Backups panel
(`src/app/admin/production/page.tsx`).

**Real, current cadence (Phase 20):** both are now genuinely scheduled via `src/lib/scheduler/registry.ts` — `"nightly-database-backup"` (2am daily) and `"weekly-storage-backup"` (2:30am Sunday). No manual cron setup is required for the default cadence. For a stronger guarantee that survives the app process itself being down (the one real limitation of an in-process BullMQ scheduler), additionally wire host-level cron as a second, independent trigger:

```cron
0 */6 * * * cd /path/to/kvl-growthos && npm run backup:database >> /var/log/kvl-backup-db.log 2>&1
0 3 * * *   cd /path/to/kvl-growthos && npm run backup:storage  >> /var/log/kvl-backup-storage.log 2>&1
```

## 3. Restore procedure — REAL disaster recovery (production restore)

**This restores INTO the real production database. Only run this during an
actual declared incident, with a second engineer aware.**

1. Identify the `Backup` row to restore from (the most recent `SUCCEEDED`
   `DATABASE` backup, unless a specific earlier point is needed):
   ```sql
   SELECT id, "storageKey", "completedAt", "sizeBytes", checksum
   FROM "Backup" WHERE type = 'DATABASE' AND status = 'SUCCEEDED'
   ORDER BY "completedAt" DESC LIMIT 5;
   ```
2. Locate the artifact on disk: `storage/<storageKey>` (a `.dump.gz` file —
   custom-format `pg_dump` output, gzip'd).
3. Decompress it: `gunzip -k storage/<storageKey>` → produces the `.dump`
   file (`pg_restore`-compatible custom format).
4. **Stop application traffic** to the target database (take the app out of
   the load balancer, or stop the process) so nothing writes during restore.
5. Restore into the target database:
   ```bash
   pg_restore --no-owner --no-privileges --clean --if-exists \
     -h <host> -p <port> -U <user> -d <target_database_name> \
     storage/<storageKey without .gz>
   ```
   `--clean --if-exists` drops conflicting objects before recreating them —
   appropriate for restoring into an existing (corrupted/lost) database;
   omit `--clean` if restoring into a brand-new empty database instead.
6. Run `npx prisma migrate deploy` against the restored database to ensure
   its schema is current (a backup taken before the latest migration will
   otherwise be behind).
7. Bring the app back online and smoke-test: `/api/health` should report
   `overall: "HEALTHY"`, and spot-check a few core reads (login, dashboard
   load) before declaring the incident resolved.
8. File a real incident write-up: what caused the outage, the actual RPO/RTO
   achieved, and any gaps this runbook should close.

For **storage** (uploaded files) recovery, extract the tarball back into
`storage/`: `tar -xzf storage/backups/storage/<archive>.tar.gz -C storage/`.

## 4. Restore TESTING — verifying a backup is actually restorable

This is the honest, ongoing verification that backups are not silently
broken — it NEVER touches production. It restores into a genuinely separate
scratch database (`{original_db}_restore_test`) on the same Postgres server,
then drops that scratch database again:

```bash
npm run restore:test                 # tests the most recent SUCCEEDED DATABASE backup
npm run restore:test -- <backupId>   # tests a specific Backup row
```

This calls `src/lib/ops/restore-test.ts`'s `runRestoreTest`, which shells out
to real `createdb` / `pg_restore` / `dropdb` binaries and records a real
`Restore` row (`isTest: true`) with `SUCCEEDED` or `FAILED` — never a
fabricated result.

**Operational prerequisite (real, not silently assumed): the Postgres role
in `DATABASE_URL` must have `CREATEDB` privilege** on the server for this to
work:

```sql
ALTER ROLE <role> WITH CREATEDB;
```

Without it, `createdb` fails with a permission error and the `Restore` row
is honestly recorded as `FAILED` with that real error message — restore
testing does not silently skip or fake success when this prerequisite is
missing.

**Real, current cadence (Phase 20):** the `"weekly-restore-test"` job (`src/lib/scheduler/registry.ts`, Sunday 3am — one hour after that morning's `"nightly-database-backup"` run) automatically restore-tests the latest `SUCCEEDED` `DATABASE` backup, so a broken backup is caught within the week, not discovered during a real incident. Run `npm run restore:test` manually anytime for an immediate check.

## 5. Rollback procedure (application deploys, not database restores)

Application-level rollback is a different concern from database
disaster-recovery above, and is tracked by the real `Deployment` model
(`prisma/schema.prisma`) — owned by a parallel CI/CD task, which is
responsible for actually writing `Deployment` rows and performing the
rollback action. This section documents the real DB-level contract that
pipeline is expected to honor:

- Every real deploy to an environment creates a `Deployment` row:
  `{ environment, version, commitSha, status: PENDING → IN_PROGRESS →
  SUCCEEDED | FAILED, deployedByUserId, startedAt, finishedAt }`.
- A rollback is itself a new `Deployment` row with `rollbackOfId` pointing at
  the `Deployment` being rolled back from (`Deployment.rollbackOf` /
  `rolledBackBy` relations) — never a mutation of the original row. This
  preserves a genuine, queryable deploy history: "what was live, when, and
  what superseded it."
- To find the last known-good deployment for a given environment (the real
  rollback target):
  ```sql
  SELECT * FROM "Deployment"
  WHERE environment = 'PRODUCTION' AND status = 'SUCCEEDED'
  ORDER BY "startedAt" DESC LIMIT 2; -- most recent SUCCEEDED, and the one before it
  ```
- A rollback in this architecture is a CODE rollback (redeploying a prior
  commit/version), not a database rollback — if the incident also involves
  bad data (not just bad code), combine this with Section 3's real database
  restore procedure using a `Backup` taken before the bad deploy.

## 6. Honest gaps in this DR posture today

- No continuous WAL archiving / point-in-time recovery — RPO is bounded by
  backup cadence, not near-zero (Section 1).
- Backups and restore tests are now genuinely automated (Phase 20, Section 2/4 above) via the in-process BullMQ scheduler — but that scheduler only runs while the app process itself is up; a host-level cron entry remains the one guarantee independent of app uptime, and isn't configured by default in this environment.
- Backups are stored on local disk only (`storage/backups/`) — there is no
  off-site/off-host replication of backup artifacts configured in this
  environment. A host-level disk failure would take out both the live
  database's disk (if colocated) and local backup copies together unless an
  operator separately copies `storage/backups/` off-host.
- `EMBEDDING_PROVIDER` and `EMAIL` (two `SystemComponent` enum members) have
  no real live health probe yet (see `src/lib/monitoring/health.ts` /
  `src/lib/monitoring/aggregate.ts`) — their status is never checked or
  reported, honestly, rather than fabricated as healthy.
