#!/bin/sh
# Restore a SQL dump into the LOCAL database only.
# Usage: ./restore.sh backups/local/hadoum_local_20260716_120000.sql
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

# shellcheck disable=SC1090
. "$ENV_FILE"

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <path-to-backup.sql>" >&2
  exit 1
fi

echo "This will overwrite data in the LOCAL database only (container: hadoum-postgres-local)."
printf "Type 'yes' to continue: "
read -r CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

docker exec -i hadoum-postgres-local psql -U "${POSTGRES_USER}" "${POSTGRES_DB}" < "$FILE"
echo "Restore complete."
