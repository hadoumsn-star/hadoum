#!/bin/sh
# Nightly (or on-demand) backup of the prod/development Postgres database.
#
# Usage:
#   ./scripts/backup/backup.sh                          # backs up prod
#   PROJECT_NAME=hadoum-development ./scripts/backup/backup.sh
#
# Produces a compressed pg_dump custom-format archive (-Fc is compressed by
# default), verifies the archive is readable, prunes dumps older than
# BACKUP_RETENTION_DAYS (default 14), and alerts on any failure.
set -eu
. "$(dirname "$0")/_common.sh"
require_container_running
require_db_vars

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/hadoum_${ENV_LABEL}_${TIMESTAMP}.dump"
TMP_FILE="${OUT_FILE}.partial"

echo "==> Backing up ${ENV_LABEL} database '${POSTGRES_DB}' from container '${CONTAINER}'..."

if ! docker exec "$CONTAINER" pg_dump -U "$POSTGRES_USER" -Fc -d "$POSTGRES_DB" > "$TMP_FILE"; then
  rm -f "$TMP_FILE"
  echo "==> pg_dump failed." >&2
  alert "backup_failure" "pg_dump failed for ${ENV_LABEL} (${POSTGRES_DB})."
  exit 1
fi

mv "$TMP_FILE" "$OUT_FILE"

echo "==> Verifying archive integrity..."
if ! docker exec -i "$CONTAINER" pg_restore --list > /dev/null < "$OUT_FILE"; then
  echo "==> Backup archive failed verification (pg_restore --list)." >&2
  alert "backup_failure" "Backup for ${ENV_LABEL} was written but failed verification: ${OUT_FILE}"
  exit 1
fi

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo "==> Backup OK: $OUT_FILE ($SIZE)"

echo "==> Pruning backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}..."
find "$BACKUP_DIR" -name "hadoum_${ENV_LABEL}_*.dump" -mtime "+${RETENTION_DAYS}" -print -delete || true

echo "==> Done."
