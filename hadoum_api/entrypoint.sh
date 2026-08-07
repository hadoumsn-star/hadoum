#!/bin/sh
set -e

alert() {
  # Best-effort: only fires if an alert webhook is configured and the
  # shared alert script was mounted/copied in. Never blocks startup.
  if [ -n "${ALERT_WEBHOOK_URL:-}" ] && [ -x /app/scripts/notify.sh ]; then
    /app/scripts/notify.sh "$1" "$2" || true
  fi
}

echo "==> Applying database migrations..."
if ! npx prisma migrate deploy; then
  echo "==> Migration failed, aborting startup." >&2
  alert "migration_failure" "prisma migrate deploy failed for ${APP_ENV:-unknown} (${HOSTNAME:-unknown host})"
  exit 1
fi

echo "==> Starting API on port ${PORT:-3001} (NODE_ENV=${NODE_ENV:-unset}, APP_ENV=${APP_ENV:-unset})..."
exec node dist/main
