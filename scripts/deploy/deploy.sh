#!/bin/sh
# Runs ON THE DEPLOY HOST (invoked over SSH by .github/workflows/cd.yml).
# Backs up the database, pulls the given image tag, restarts the stack
# (which runs `prisma migrate deploy` via entrypoint.sh before the API
# starts), health-checks the result, and automatically rolls back to the
# last known-good tag if the health check never turns green.
#
# Usage: deploy.sh <development|prod> <image_tag> <health_url>
# Expects to be run from the root of a checked-out copy of this repo on
# the deploy host, with .env.development / .env.prod already present
# there (never committed - see docs/deployment.md).
set -eu

ENVIRONMENT="${1:?Usage: deploy.sh <development|prod> <image_tag> <health_url>}"
IMAGE_TAG="${2:?Usage: deploy.sh <development|prod> <image_tag> <health_url>}"
HEALTH_URL="${3:?Usage: deploy.sh <development|prod> <image_tag> <health_url>}"

case "$ENVIRONMENT" in
  development)
    PROJECT_NAME=hadoum-development
    COMPOSE_FILE=docker-compose.development.yml
    ENV_FILE=.env.development
    ;;
  prod)
    PROJECT_NAME=hadoum-prod
    COMPOSE_FILE=docker-compose.prod.yml
    ENV_FILE=.env.prod
    ;;
  *)
    echo "Unknown environment: $ENVIRONMENT (expected 'development' or 'prod')" >&2
    exit 1
    ;;
esac

DEPLOY_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$DEPLOY_DIR"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE on deploy host - see docs/deployment.md." >&2
  exit 1
fi

compose() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

LAST_GOOD_FILE=".last_good_tag.${ENVIRONMENT}"
PREVIOUS_TAG=""
[ -f "$LAST_GOOD_FILE" ] && PREVIOUS_TAG=$(cat "$LAST_GOOD_FILE")

echo "==> [1/5] Ensuring database is up (first deploy to a fresh host has nothing to back up yet)..."
if ! compose up -d postgres; then
  echo "==> Could not start the database container." >&2
  ./scripts/notify.sh deploy_failure "Deploy to ${ENVIRONMENT} aborted: could not start the database."
  exit 1
fi

echo "==> [2/5] Backing up ${ENVIRONMENT} database before deploy..."
# shellcheck disable=SC1090
if ! (. "./$ENV_FILE" && PROJECT_NAME="$PROJECT_NAME" POSTGRES_USER="$POSTGRES_USER" POSTGRES_DB="$POSTGRES_DB" ./scripts/backup/backup.sh); then
  echo "==> Backup failed, aborting deploy (nothing else was changed)." >&2
  ./scripts/notify.sh deploy_failure "Deploy to ${ENVIRONMENT} aborted: pre-deploy backup failed."
  exit 1
fi

echo "==> [3/5] Pulling images (tag=${IMAGE_TAG})..."
if ! IMAGE_TAG="$IMAGE_TAG" compose pull; then
  echo "==> docker compose pull failed." >&2
  ./scripts/notify.sh deploy_failure "Deploy to ${ENVIRONMENT} failed: could not pull images for tag ${IMAGE_TAG}."
  exit 1
fi

echo "==> [4/5] Restarting stack (runs prisma migrate deploy via entrypoint.sh)..."
if ! IMAGE_TAG="$IMAGE_TAG" compose up -d --remove-orphans; then
  echo "==> docker compose up failed (likely a failed migration - entrypoint.sh exits non-zero on migration failure)." >&2
  ./scripts/notify.sh deploy_failure "Deploy to ${ENVIRONMENT} failed: docker compose up did not succeed for tag ${IMAGE_TAG} (check migration status)."
  exit 1
fi

echo "==> [5/5] Health-checking ${HEALTH_URL}..."
ATTEMPTS=0
MAX_ATTEMPTS=15
until curl -fsS -m 5 "$HEALTH_URL" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "==> Health check never turned green after ${MAX_ATTEMPTS} attempts." >&2
    if [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$IMAGE_TAG" ]; then
      echo "==> Rolling back ${ENVIRONMENT} to previous tag: ${PREVIOUS_TAG}"
      IMAGE_TAG="$PREVIOUS_TAG" compose pull
      IMAGE_TAG="$PREVIOUS_TAG" compose up -d --remove-orphans
      ./scripts/notify.sh deploy_rollback "Rolled back ${ENVIRONMENT} to previous tag ${PREVIOUS_TAG} after failed deploy of ${IMAGE_TAG}."
    else
      echo "==> No previous known-good tag recorded - manual intervention required." >&2
      ./scripts/notify.sh deploy_rollback "Deploy to ${ENVIRONMENT} (tag ${IMAGE_TAG}) failed health check and no previous tag is recorded. Manual intervention required."
    fi
    exit 1
  fi
  sleep 4
done

echo "$IMAGE_TAG" > "$LAST_GOOD_FILE"
echo "==> Deploy to ${ENVIRONMENT} succeeded (tag=${IMAGE_TAG})."
