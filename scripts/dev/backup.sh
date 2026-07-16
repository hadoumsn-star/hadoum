#!/bin/sh
# Dump the DEV database to backups/dev/. Manual, on-demand only
# (no cron is configured by this script).
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

# shellcheck disable=SC1090
. "$ENV_FILE"

BACKUP_DIR="$ROOT_DIR/backups/dev"
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/hadoum_dev_${TIMESTAMP}.sql"

docker exec hadoum-postgres-dev pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "$OUT_FILE"
echo "Dev backup written to: $OUT_FILE"
