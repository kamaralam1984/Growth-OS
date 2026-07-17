#!/usr/bin/env bash
# Real, working PostgreSQL backup script — pg_dump's the database named by
# DATABASE_URL in custom format (-Fc, required so scripts/run-restore-test.ts
# can later feed it straight to `pg_restore`), gzips it, and writes it to a
# real local path.
#
# Usage:
#   DATABASE_URL="postgresql://user:pass@host:5432/dbname" ./scripts/backup-database.sh
#   BACKUP_DIR=/var/backups/kvl-growthos ./scripts/backup-database.sh   # optional override
#
# On success, prints the ABSOLUTE PATH of the final .dump.gz file to stdout
# (and only that — all progress/diagnostic output goes to stderr) so a
# caller (scripts/run-backup.ts) can capture it directly. Exits non-zero on
# any real failure; never fabricates a success.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup-database] DATABASE_URL is not set — refusing to run." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "[backup-database] pg_dump not found on PATH. Install the postgresql-client package." >&2
  exit 1
fi

# Prisma's DATABASE_URL convention adds a "?schema=..." query parameter that
# Prisma's own client understands but libpq/pg_dump does NOT (pg_dump
# rejects it outright: 'invalid URI query parameter: "schema"'). Strip every
# query parameter from the URI passed to pg_dump and instead select the
# schema explicitly via pg_dump's own `-n` flag — the actually-correct way
# to scope a dump to one schema, and robust to any other Prisma-only query
# params (e.g. connection_limit) that would otherwise trip the same error.
DB_URL_NO_QUERY="${DATABASE_URL%%\?*}"
SCHEMA_PARAM="$(printf '%s' "$DATABASE_URL" | grep -oP '(?<=[?&]schema=)[^&]+' || true)"
PG_SCHEMA="${SCHEMA_PARAM:-public}"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="${BACKUP_DIR:-$PROJECT_ROOT/storage/backups}"
TARGET_DIR="$BACKUP_ROOT/database"
mkdir -p "$TARGET_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$TARGET_DIR/kvl-growthos-db-${TIMESTAMP}.dump"
GZ_FILE="${DUMP_FILE}.gz"

echo "[backup-database] pg_dump (custom format, schema=${PG_SCHEMA}) -> ${DUMP_FILE}" >&2
if ! pg_dump "$DB_URL_NO_QUERY" --format=custom --no-owner --no-privileges --schema="$PG_SCHEMA" --file "$DUMP_FILE" >&2; then
  echo "[backup-database] pg_dump failed — removing partial dump file." >&2
  rm -f "$DUMP_FILE"
  exit 1
fi

echo "[backup-database] gzipping ${DUMP_FILE}" >&2
if ! gzip -f "$DUMP_FILE"; then
  echo "[backup-database] gzip failed." >&2
  rm -f "$DUMP_FILE" "$GZ_FILE"
  exit 1
fi

if [ ! -s "$GZ_FILE" ]; then
  echo "[backup-database] resulting archive is missing or empty: ${GZ_FILE}" >&2
  exit 1
fi

echo "[backup-database] done: ${GZ_FILE}" >&2
echo "$GZ_FILE"
