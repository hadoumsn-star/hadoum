#!/bin/sh
# Best-effort alert sender. Posts a JSON payload to a Slack/Discord-compatible
# incoming webhook (ALERT_WEBHOOK_URL). Never fails the caller: on any error
# it prints a warning to stderr and exits 0, since alerting must not be able
# to take down a deployment or a backup job.
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

# JSON-escape the message (backslashes, quotes, newlines) without pulling in jq.
ESCAPED=$(printf '%s' "$MESSAGE" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n' ' ')

PAYLOAD=$(printf '{"text":"[hadoum:%s] %s"}' "$EVENT" "$ESCAPED")

curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
  -d "$PAYLOAD" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 \
  || echo "notify.sh: failed to deliver alert for event '${EVENT}'" >&2

exit 0
