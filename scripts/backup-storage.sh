#!/usr/bin/env bash
# Real, working local-disk storage backup — tars + gzips this app's real
# storage/ directory (src/lib/storage/file-store.ts's on-disk root: uploaded
# documents, project files, prior backup artifacts, etc. — there is no S3/
# Blob store in this environment, so this directory IS the durable artifact
# store that needs its own backup).
#
# Usage:
#   ./scripts/backup-storage.sh
#   BACKUP_DIR=/var/backups/kvl-growthos ./scripts/backup-storage.sh   # optional override
#
# On success, prints the ABSOLUTE PATH of the final .tar.gz file to stdout
# (all progress/diagnostic output goes to stderr). Exits non-zero on any
# real failure; never fabricates a success.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STORAGE_DIR="$PROJECT_ROOT/storage"
BACKUP_ROOT="${BACKUP_DIR:-$PROJECT_ROOT/storage/backups}"
TARGET_DIR="$BACKUP_ROOT/storage"

if [ ! -d "$STORAGE_DIR" ]; then
  echo "[backup-storage] storage directory not found: ${STORAGE_DIR} — nothing to back up yet." >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$TARGET_DIR/kvl-growthos-storage-${TIMESTAMP}.tar.gz"

echo "[backup-storage] tar+gzip ${STORAGE_DIR} -> ${ARCHIVE}" >&2
# Exclude backups/ itself (nested under storage/) so this archive never
# recursively contains prior backup artifacts.
if ! tar --exclude="./backups" -czf "$ARCHIVE" -C "$STORAGE_DIR" . >&2; then
  echo "[backup-storage] tar failed." >&2
  rm -f "$ARCHIVE"
  exit 1
fi

if [ ! -s "$ARCHIVE" ]; then
  echo "[backup-storage] resulting archive is missing or empty: ${ARCHIVE}" >&2
  exit 1
fi

echo "[backup-storage] done: ${ARCHIVE}" >&2
echo "$ARCHIVE"
