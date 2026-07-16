/**
 * Real restore-test CLI wrapper around src/lib/ops/restore-test.ts's
 * runRestoreTest — verifies a real Backup is actually restorable by
 * shelling out to createdb/pg_restore/dropdb against a genuinely separate
 * scratch database, never production. See that file's top comment for the
 * full real procedure and the CREATEDB privilege prerequisite.
 *
 * Usage:
 *   tsx scripts/run-restore-test.ts <backupId>
 *   npm run restore:test -- <backupId>
 *
 * With no backupId argument, runs against the most recent SUCCEEDED
 * DATABASE backup on file (a reasonable default for "verify last night's
 * backup actually restores").
 *
 * Exits 0 only if the Restore row's real status is SUCCEEDED; exits 1 on
 * FAILED or if there is no eligible backup to test.
 */
import { prisma } from "@/lib/prisma";
import { runRestoreTest } from "@/lib/ops/restore-test";

async function resolveBackupId(argId: string | undefined): Promise<string> {
  if (argId) return argId;

  const latest = await prisma.backup.findFirst({
    where: { type: "DATABASE", status: "SUCCEEDED" },
    orderBy: { completedAt: "desc" },
  });
  if (!latest) {
    console.error("[run-restore-test] No backupId given and no SUCCEEDED DATABASE backup exists to test.");
    process.exit(1);
  }
  return latest.id;
}

async function main(): Promise<void> {
  const backupId = await resolveBackupId(process.argv[2]);
  console.log(`[run-restore-test] Running restore test against Backup ${backupId}...`);

  const restore = await runRestoreTest(backupId);

  if (restore.status === "SUCCEEDED") {
    console.log(`[run-restore-test] Restore ${restore.id} SUCCEEDED.`);
    process.exit(0);
  }

  console.error(`[run-restore-test] Restore ${restore.id} FAILED: ${restore.error ?? "unknown error"}`);
  process.exit(1);
}

main().catch((error) => {
  console.error("[run-restore-test] unexpected error:", error);
  process.exit(1);
});
