#!/bin/sh
# Dump the LOCAL database to backups/local/. Manual, on-demand only
# (no cron is configured by this script).
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

# shellcheck disable=SC1090
. "$ENV_FILE"

BACKUP_DIR="$ROOT_DIR/backups/local"
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/hadoum_local_${TIMESTAMP}.sql"

docker exec hadoum-postgres-local pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "$OUT_FILE"
echo "Local backup written to: $OUT_FILE"
