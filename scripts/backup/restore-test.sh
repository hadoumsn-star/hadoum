#!/bin/sh
# Non-destructive restore test: restores a backup archive into a disposable
# database on the SAME Postgres server (never overwrites prod/development
# data), runs a basic sanity check, then drops the disposable database.
#
# This is what should run routinely (e.g. after every nightly backup, or on
# a schedule) to prove backups are actually restorable - a backup that was
# never test-restored is not a verified backup.
#
# Usage:
#   ./scripts/backup/restore-test.sh backups/prod/hadoum_prod_20260716_020000.dump
#   PROJECT_NAME=hadoum-development ./scripts/backup/restore-test.sh <file>
set -eu
. "$(dirname "$0")/_common.sh"
require_container_running
require_db_vars

FILE="${1:-}"
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "Usage: $0 <path-to-backup.dump>" >&2
  exit 1
fi

TEST_DB="hadoum_restore_test_$(date -u +%Y%m%d_%H%M%S)"

cleanup() {
  docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS \"$TEST_DB\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Creating disposable database ${TEST_DB}..."
if ! docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d postgres \
    -c "CREATE DATABASE \"$TEST_DB\";" >/dev/null; then
  echo "==> Could not create disposable test database." >&2
  alert "restore_test_failure" "Restore test for ${ENV_LABEL} could not create a disposable database."
  exit 1
fi

echo "==> Restoring ${FILE} into ${TEST_DB}..."
if ! docker exec -i "$CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$TEST_DB" \
    --no-owner --role="$POSTGRES_USER" < "$FILE"; then
  echo "==> Restore into disposable database failed." >&2
  alert "restore_test_failure" "Restore test failed for ${ENV_LABEL}: could not restore ${FILE} into a disposable database."
  exit 1
fi

echo "==> Sanity check: migration history table..."
MIGRATION_COUNT=$(docker exec "$CONTAINER" psql -U "$POSTGRES_USER" -d "$TEST_DB" -tAc \
  'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;' 2>/dev/null || echo "")

if [ -z "$MIGRATION_COUNT" ] || [ "$MIGRATION_COUNT" -eq 0 ] 2>/dev/null; then
  echo "==> Sanity check failed: no completed migrations found in restored database." >&2
  alert "restore_test_failure" "Restore test for ${ENV_LABEL} restored ${FILE} but the sanity check found no completed migrations."
  exit 1
fi

echo "==> Restore test OK: ${MIGRATION_COUNT} completed migrations found in restored copy of ${FILE}."
alert "restore_test_ok" "Restore test for ${ENV_LABEL} passed (${FILE}, ${MIGRATION_COUNT} migrations)."
