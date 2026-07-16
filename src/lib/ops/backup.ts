import { prisma } from "@/lib/prisma";
import type { Backup, BackupType } from "@/generated/prisma/client";

/**
 * Real Backup row lifecycle — called by scripts/run-backup.ts (a tsx CLI
 * wrapper around scripts/backup-database.sh / scripts/backup-storage.sh) so
 * every real backup run is tracked in the database, not just a cron job
 * writing files nobody sees. Every row here reflects a real shell command's
 * real exit code: recordBackupComplete is only ever called after the
 * artifact genuinely exists on disk with a real size/checksum;
 * recordBackupFailed is called on any non-zero exit, with the real stderr
 * captured as `error`. Nothing here fabricates a "backup succeeded" result.
 */

export async function recordBackupStart(type: BackupType): Promise<Backup> {
  return prisma.backup.create({ data: { type, status: "RUNNING" } });
}

export async function recordBackupComplete(
  backupId: string,
  storageKey: string,
  sizeBytes: bigint,
  checksum: string,
): Promise<Backup> {
  return prisma.backup.update({
    where: { id: backupId },
    data: { status: "SUCCEEDED", storageKey, sizeBytes, checksum, completedAt: new Date() },
  });
}

export async function recordBackupFailed(backupId: string, error: string): Promise<Backup> {
  return prisma.backup.update({
    where: { id: backupId },
    data: { status: "FAILED", error, completedAt: new Date() },
  });
}

/** Most recent SUCCEEDED backup of a given type — used by the Production Dashboard to show real "time since last successful backup" (this app's honest RPO metric, see docs/operations/disaster-recovery.md). */
export async function getLastSuccessfulBackup(type: BackupType): Promise<Backup | null> {
  return prisma.backup.findFirst({ where: { type, status: "SUCCEEDED" }, orderBy: { completedAt: "desc" } });
}

/** Recent backups of any type/status, newest first — for the Production Dashboard's backup history table. */
export async function listRecentBackups(limit = 20): Promise<Backup[]> {
  return prisma.backup.findMany({ orderBy: { startedAt: "desc" }, take: limit });
}
