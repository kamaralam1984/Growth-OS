/**
 * Real backup CLI wrapper — runs the actual shell scripts
 * (scripts/backup-database.sh / scripts/backup-storage.sh), and tracks the
 * run as a real Backup row (src/lib/ops/backup.ts) so a backup run is
 * visible in the database (Production Dashboard), not just a cron job
 * silently writing files nobody sees.
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
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";

import { recordBackupComplete, recordBackupFailed, recordBackupStart } from "@/lib/ops/backup";
import type { BackupType } from "@/generated/prisma/client";

const KIND = process.argv[2];

const SCRIPT_BY_KIND: Record<string, { type: BackupType; script: string }> = {
  database: { type: "DATABASE", script: "backup-database.sh" },
  storage: { type: "STORAGE", script: "backup-storage.sh" },
};

async function sha256Of(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function main(): Promise<void> {
  const entry = KIND ? SCRIPT_BY_KIND[KIND] : undefined;
  if (!entry) {
    console.error(`Usage: tsx scripts/run-backup.ts <database|storage>`);
    process.exit(1);
  }

  const backup = await recordBackupStart(entry.type);
  console.log(`[run-backup] Backup ${backup.id} (${entry.type}) started.`);

  const scriptPath = path.join(process.cwd(), "scripts", entry.script);
  const result = spawnSync("bash", [scriptPath], {
    encoding: "utf8",
    env: process.env,
  });

  if (result.error || result.status !== 0) {
    const error = result.error ? result.error.message : (result.stderr || `exit code ${result.status}`);
    await recordBackupFailed(backup.id, error);
    console.error(`[run-backup] Backup ${backup.id} FAILED: ${error}`);
    process.exit(1);
  }

  const artifactPath = result.stdout.trim();
  if (!artifactPath) {
    await recordBackupFailed(backup.id, "Backup script exited 0 but printed no artifact path to stdout.");
    console.error(`[run-backup] Backup ${backup.id} FAILED: no artifact path returned.`);
    process.exit(1);
  }

  let stat;
  try {
    stat = statSync(artifactPath);
  } catch (error) {
    const message = `Artifact reported at ${artifactPath} does not exist: ${error instanceof Error ? error.message : String(error)}`;
    await recordBackupFailed(backup.id, message);
    console.error(`[run-backup] Backup ${backup.id} FAILED: ${message}`);
    process.exit(1);
  }

  const checksum = await sha256Of(artifactPath);

  // storageKey is stored relative to the project's storage/ root, matching
  // src/lib/storage/file-store.ts's storageKey convention, so the
  // Production Dashboard / restore-test tooling can resolve it consistently.
  const storageRoot = path.join(process.cwd(), "storage");
  const storageKey = path.relative(storageRoot, artifactPath);

  await recordBackupComplete(backup.id, storageKey, BigInt(stat.size), checksum);
  console.log(`[run-backup] Backup ${backup.id} SUCCEEDED: ${artifactPath} (${stat.size} bytes, sha256 ${checksum})`);
}

main()
  .catch((error) => {
    console.error("[run-backup] unexpected error:", error);
    process.exit(1);
  })
  .finally(() => process.exit(process.exitCode ?? 0));
