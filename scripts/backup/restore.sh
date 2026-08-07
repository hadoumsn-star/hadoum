#!/bin/sh
# DESTRUCTIVE: restores a backup archive directly into the prod/development
# database, overwriting current data. Requires two separate explicit
# confirmations. For a non-destructive check that a backup is restorable,
# use restore-test.sh instead - that is what should run routinely/in CI.
#
# Usage:
#   ./scripts/backup/restore.sh backups/prod/hadoum_prod_20260716_020000.dump
#   PROJECT_NAME=hadoum-development ./scripts/backup/restore.sh <file>
set -eu
. "$(dirname "$0")/_common.sh"
require_container_running
require_db_vars

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <path-to-backup.dump>" >&2
  exit 1
fi

cat <<EOF
=======================================================================
 WARNING: this will OVERWRITE the '${ENV_LABEL}' database
 ('${POSTGRES_DB}' in container '${CONTAINER}') with the contents of:
   $FILE
 This is IRREVERSIBLE without a separate prior backup.
=======================================================================
EOF

printf "Type the environment name '%s' to confirm: " "$ENV_LABEL"
read -r CONFIRM1
if [ "$CONFIRM1" != "$ENV_LABEL" ]; then
  echo "Confirmation did not match. Aborted."
  exit 1
fi

printf "Type 'RESTORE' (all caps) to proceed: "
read -r CONFIRM2
if [ "$CONFIRM2" != "RESTORE" ]; then
  echo "Confirmation did not match. Aborted."
  exit 1
fi

echo "==> Restoring into ${POSTGRES_DB}..."
if ! docker exec -i "$CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    --clean --if-exists --no-owner --role="$POSTGRES_USER" < "$FILE"; then
  echo "==> Restore failed." >&2
  alert "restore_failure" "Manual restore into ${ENV_LABEL} (${POSTGRES_DB}) failed from ${FILE}."
  exit 1
fi

echo "==> Restore complete."
alert "restore_completed" "Manual restore into ${ENV_LABEL} (${POSTGRES_DB}) completed from ${FILE}."
