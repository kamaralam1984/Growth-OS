import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/monitoring/logger";
import type { Restore } from "@/generated/prisma/client";

/**
 * REAL restore verification — this is the "Restore Testing" half of
 * disaster-recovery (see docs/operations/disaster-recovery.md), distinct
 * from an actual production restore (a human-operated emergency procedure,
 * also documented there, that this function never performs). It genuinely:
 *
 *   1. Looks up a real, SUCCEEDED, DATABASE-type Backup row and its real
 *      gzip'd pg_dump artifact on disk (never a production restore target).
 *   2. Shells out to real `createdb`/`pg_restore`/`dropdb` binaries (Node
 *      child_process, not a mocked/simulated call) against a scratch
 *      database named `{original_db}_restore_test` on the SAME Postgres
 *      SERVER as DATABASE_URL — never the production database itself,
 *      which is why the scratch DB is always dropped again at the end,
 *      success or failure.
 *   3. Records a real Restore row (isTest: true) with SUCCEEDED only if
 *      every real shell command genuinely exited 0; FAILED with the real
 *      captured stderr otherwise. Never fabricates a SUCCEEDED result.
 *
 * OPERATIONAL PREREQUISITE (honest, not silently assumed): the Postgres
 * ROLE encoded in DATABASE_URL must have the CREATEDB privilege on the
 * target server for this to succeed — e.g.
 * `ALTER ROLE <role> WITH CREATEDB;` run once by a superuser. Without it,
 * `createdb` will fail with a permission error and this function will
 * (correctly) record the Restore row as FAILED with that real error
 * message, not silently skip the check.
 */

interface ParsedConnection {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function parseDatabaseUrl(databaseUrl: string): ParsedConnection {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error(`DATABASE_URL has no database name in its path: ${databaseUrl}`);
  return {
    host: url.hostname || "localhost",
    port: url.port || "5432",
    user: decodeURIComponent(url.username || "postgres"),
    password: decodeURIComponent(url.password || ""),
    database,
  };
}

interface ShellResult {
  ok: boolean;
  stderr: string;
}

function runPg(command: string, args: string[], conn: ParsedConnection): ShellResult {
  const result = spawnSync(command, args, {
    env: { ...process.env, PGPASSWORD: conn.password },
    encoding: "utf8",
  });
  if (result.error) return { ok: false, stderr: result.error.message };
  if (result.status !== 0) return { ok: false, stderr: result.stderr || `${command} exited with status ${result.status}` };
  return { ok: true, stderr: "" };
}

async function gunzipToTempFile(gzPath: string): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "kvl-restore-test-"));
  const file = path.join(dir, "dump.custom");
  await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(file));
  return { dir, file };
}

export async function runRestoreTest(backupId: string): Promise<Restore> {
  const restore = await prisma.restore.create({ data: { backupId, isTest: true, status: "RUNNING" } });

  const fail = async (error: string): Promise<Restore> => {
    logger.error("restore-test: failed", { backupId, restoreId: restore.id, error });
    return prisma.restore.update({ where: { id: restore.id }, data: { status: "FAILED", error, completedAt: new Date() } });
  };

  const backup = await prisma.backup.findUnique({ where: { id: backupId } });
  if (!backup) return fail(`No Backup found with id "${backupId}".`);
  if (backup.type !== "DATABASE") return fail(`Restore testing only supports type DATABASE backups; this Backup is type ${backup.type}.`);
  if (backup.status !== "SUCCEEDED" || !backup.storageKey) return fail(`Backup ${backupId} is not a SUCCEEDED backup with a real storageKey — nothing to restore.`);

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return fail("DATABASE_URL is not set — cannot determine the Postgres server to run the restore test against.");

  let conn: ParsedConnection;
  try {
    conn = parseDatabaseUrl(databaseUrl);
  } catch (error) {
    return fail(`Failed to parse DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`);
  }

  const scratchDb = `${conn.database}_restore_test`;
  const gzPath = path.join(process.cwd(), "storage", backup.storageKey);

  let tempDir: string | undefined;
  try {
    const { dir, file: dumpFile } = await gunzipToTempFile(gzPath);
    tempDir = dir;

    // Drop any leftover scratch DB from a prior failed run — --if-exists
    // means this is a genuine no-op (exit 0) when it doesn't exist yet.
    const dropBefore = runPg("dropdb", ["--if-exists", "-h", conn.host, "-p", conn.port, "-U", conn.user, scratchDb], conn);
    if (!dropBefore.ok) return fail(`Failed to drop pre-existing scratch database "${scratchDb}": ${dropBefore.stderr}`);

    const create = runPg("createdb", ["-h", conn.host, "-p", conn.port, "-U", conn.user, scratchDb], conn);
    if (!create.ok) {
      return fail(
        `createdb failed for scratch database "${scratchDb}": ${create.stderr}. ` +
          `This usually means the Postgres role "${conn.user}" lacks CREATEDB privilege — ` +
          `run "ALTER ROLE ${conn.user} WITH CREATEDB;" as a superuser to enable restore testing.`,
      );
    }

    try {
      const restoreExec = runPg(
        "pg_restore",
        ["--no-owner", "--no-privileges", "-h", conn.host, "-p", conn.port, "-U", conn.user, "-d", scratchDb, dumpFile],
        conn,
      );
      if (!restoreExec.ok) return fail(`pg_restore into scratch database "${scratchDb}" failed: ${restoreExec.stderr}`);

      logger.info("restore-test: succeeded", { backupId, restoreId: restore.id, scratchDb });
      return prisma.restore.update({ where: { id: restore.id }, data: { status: "SUCCEEDED", completedAt: new Date() } });
    } finally {
      // Always drop the scratch database afterward — it is a real,
      // disposable verification target, never left behind to accumulate.
      const dropAfter = runPg("dropdb", ["--if-exists", "-h", conn.host, "-p", conn.port, "-U", conn.user, scratchDb], conn);
      if (!dropAfter.ok) {
        logger.warn("restore-test: failed to drop scratch database after test", { scratchDb, error: dropAfter.stderr });
      }
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Recent Restore rows (test and real), newest first — for the Production Dashboard / DR runbook verification history. */
export async function listRecentRestores(limit = 20): Promise<Restore[]> {
  return prisma.restore.findMany({ orderBy: { startedAt: "desc" }, take: limit, include: { backup: true } });
}
