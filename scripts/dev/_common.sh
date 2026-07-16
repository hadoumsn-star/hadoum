#!/bin/sh
# Shared helpers for scripts/dev/*.sh. Not meant to be run directly.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

COMPOSE_FILE="$ROOT_DIR/docker-compose.dev.yml"
ENV_FILE="$ROOT_DIR/.env.dev"
PROJECT_NAME="hadoum-dev"

compose() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

require_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    echo "Missing $ENV_FILE." >&2
    echo "Copy .env.dev.example to .env.dev and fill in dev-only values first." >&2
    exit 1
  fi
}

# Defence in depth: this whole script family must only ever touch the
# hadoum-dev project. If any of these checks fail, something is
# misconfigured and we refuse to proceed rather than risk touching prod.
guard_no_prod() {
  if [ "$PROJECT_NAME" != "hadoum-dev" ]; then
    echo "Refusing: PROJECT_NAME must be 'hadoum-dev' (got '$PROJECT_NAME')." >&2
    exit 1
  fi
  case "$COMPOSE_FILE" in
    *prod*)
      echo "Refusing: compose file path contains 'prod': $COMPOSE_FILE" >&2
      exit 1
      ;;
  esac
  for name in "$PROJECT_NAME" "hadoum-postgres-dev" "hadoum-api-dev" "hadoum-frontend-dev" \
              "hadoum-network-dev" "hadoum-postgres-dev-data"; do
    case "$name" in
      *prod*)
        echo "Refusing: resource name '$name' contains 'prod'." >&2
        exit 1
        ;;
    esac
  done
}
