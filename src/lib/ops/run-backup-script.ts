import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";

import { recordBackupComplete, recordBackupFailed, recordBackupStart } from "@/lib/ops/backup";
import type { Backup, BackupType } from "@/generated/prisma/client";

/**
 * The real shell-out + Backup-row-lifecycle logic, extracted from
 * scripts/run-backup.ts (which still does the same thing for the CLI/cron
 * entry point) so the scheduler (Phase 20: backups previously existed but
 * were never actually scheduled — see src/lib/scheduler/registry.ts) can
 * call it in-process without spawning a second Node process. Shells out to
 * the real scripts/backup-database.sh / scripts/backup-storage.sh — never
 * fabricates a SUCCEEDED Backup row; a non-zero exit or a missing artifact
 * is always recorded as FAILED with the real error.
 */

const SCRIPT_BY_TYPE: Record<Extract<BackupType, "DATABASE" | "STORAGE">, string> = {
  DATABASE: "backup-database.sh",
  STORAGE: "backup-storage.sh",
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

export async function runBackupScript(type: "DATABASE" | "STORAGE"): Promise<Backup> {
  const backup = await recordBackupStart(type);

  const scriptPath = path.join(process.cwd(), "scripts", SCRIPT_BY_TYPE[type]);
  const result = spawnSync("bash", [scriptPath], { encoding: "utf8", env: process.env });

  if (result.error || result.status !== 0) {
    const error = result.error ? result.error.message : result.stderr || `exit code ${result.status}`;
    return recordBackupFailed(backup.id, error);
  }

  const artifactPath = result.stdout.trim();
  if (!artifactPath) {
    return recordBackupFailed(backup.id, "Backup script exited 0 but printed no artifact path to stdout.");
  }

  let stat;
  try {
    stat = statSync(artifactPath);
  } catch (error) {
    return recordBackupFailed(backup.id, `Artifact reported at ${artifactPath} does not exist: ${error instanceof Error ? error.message : String(error)}`);
  }

  const checksum = await sha256Of(artifactPath);
  const storageRoot = path.join(process.cwd(), "storage");
  const storageKey = path.relative(storageRoot, artifactPath);

  return recordBackupComplete(backup.id, storageKey, BigInt(stat.size), checksum);
}
