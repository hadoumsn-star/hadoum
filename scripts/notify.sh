#!/bin/sh
# Shared host-side alert sender, used by scripts/backup/*.sh and by CI/CD
# workflows that run on the deploy host (not inside a container - see
# hadoum_api/scripts/notify.sh for the containerized counterpart used by
# entrypoint.sh on migration failure).
#
# Posts a JSON payload to a Slack/Discord-compatible incoming webhook
# (ALERT_WEBHOOK_URL). Never fails the caller: on any error it prints a
# warning to stderr and exits 0, since alerting must not be able to take
# down a deployment or a backup job.
#
# Usage: notify.sh <event_type> <message>
set -u

EVENT="${1:-unknown_event}"
MESSAGE="${2:-(no message)}"

if [ -z "${ALERT_WEBHOOK_URL:-}" ]; then
  echo "notify.sh: ALERT_WEBHOOK_URL not set, skipping alert (${EVENT}: ${MESSAGE})" >&2
  exit 0
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "notify.sh: curl not available, skipping alert" >&2
  exit 0
fi

ESCAPED=$(printf '%s' "$MESSAGE" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n' ' ')
PAYLOAD=$(printf '{"text":"[hadoum:%s] %s"}' "$EVENT" "$ESCAPED")

curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
  -d "$PAYLOAD" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 \
  || echo "notify.sh: failed to deliver alert for event '${EVENT}'" >&2

exit 0
