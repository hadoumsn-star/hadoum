#!/bin/sh
# Shared helpers for scripts/backup/*.sh. Not meant to be run directly.
# Unlike scripts/local/*.sh, this family deliberately targets the PROD
# (and, via PROJECT_NAME override, the development) Postgres container.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Which environment to back up. Defaults to prod; the development
# environment's scheduled backup passes PROJECT_NAME=hadoum-development.
PROJECT_NAME="${PROJECT_NAME:-hadoum-prod}"

case "$PROJECT_NAME" in
  hadoum-prod)
    CONTAINER="hadoum-postgres-prod"
    ENV_LABEL="prod"
    ;;
  hadoum-development)
    CONTAINER="hadoum-postgres-development"
    ENV_LABEL="development"
    ;;
  *)
    echo "Refusing: unknown PROJECT_NAME '$PROJECT_NAME' (expected hadoum-prod or hadoum-development)." >&2
    exit 1
    ;;
esac

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/$ENV_LABEL}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

alert() {
  "$ROOT_DIR/scripts/notify.sh" "$1" "$2" || true
}

require_container_running() {
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "Refusing: container '$CONTAINER' is not running." >&2
    alert "backup_failure" "Backup aborted for ${ENV_LABEL}: container ${CONTAINER} is not running."
    exit 1
  fi
}

# POSTGRES_USER / POSTGRES_DB must be exported by the caller (sourced from
# the relevant .env.prod / .env.development - never hardcoded here).
require_db_vars() {
  : "${POSTGRES_USER:?POSTGRES_USER must be set (source .env.$ENV_LABEL first)}"
  : "${POSTGRES_DB:?POSTGRES_DB must be set (source .env.$ENV_LABEL first)}"
}
