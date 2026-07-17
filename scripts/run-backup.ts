/**
 * Real backup CLI wrapper — runs the actual shell scripts
 * (scripts/backup-database.sh / scripts/backup-storage.sh) via
 * src/lib/ops/run-backup-script.ts (shared with the scheduled job, see
 * src/lib/scheduler/registry.ts), and tracks the run as a real Backup row
 * (src/lib/ops/backup.ts) so a backup run is visible in the database
 * (Production Dashboard), not just a cron job silently writing files
 * nobody sees.
 *
 * Usage (matches this repo's tsx CLI convention, e.g. prisma/seed-*.ts):
 *   tsx scripts/run-backup.ts database
 *   tsx scripts/run-backup.ts storage
 *   npm run backup:database
 *   npm run backup:storage
 *
 * Exits 0 on a real SUCCEEDED backup, 1 on any real failure (never
 * fabricates success either way — mirrors src/lib/ops/backup.ts's own
 * "never fake a Backup row" discipline).
 */
import { runBackupScript } from "@/lib/ops/run-backup-script";

const KIND = process.argv[2];
const VALID_KINDS = new Set(["database", "storage"]);

async function main(): Promise<void> {
  if (!KIND || !VALID_KINDS.has(KIND)) {
    console.error(`Usage: tsx scripts/run-backup.ts <database|storage>`);
    process.exit(1);
  }

  const type = KIND === "database" ? "DATABASE" : "STORAGE";
  console.log(`[run-backup] Backup (${type}) starting...`);

  const backup = await runBackupScript(type);

  if (backup.status === "SUCCEEDED") {
    console.log(`[run-backup] Backup ${backup.id} SUCCEEDED: ${backup.storageKey} (${backup.sizeBytes} bytes, sha256 ${backup.checksum})`);
    process.exit(0);
  }

  console.error(`[run-backup] Backup ${backup.id} FAILED: ${backup.error ?? "unknown error"}`);
  process.exit(1);
}

main()
  .catch((error) => {
    console.error("[run-backup] unexpected error:", error);
    process.exit(1);
  })
  .finally(() => process.exit(process.exitCode ?? 0));
