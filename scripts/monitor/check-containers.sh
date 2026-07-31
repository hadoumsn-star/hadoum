#!/bin/sh
# Host-side monitoring check, meant to run on a schedule on the deploy host
# (cron, or a scheduled step in a workflow that SSHes in - see
# docs/monitoring.md). Alerts on: container restarts, unhealthy containers,
# disk usage above threshold, and the database being unreachable.
#
# Usage:
#   PROJECT_NAME=hadoum-prod ./scripts/monitor/check-containers.sh
#   PROJECT_NAME=hadoum-development ./scripts/monitor/check-containers.sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_NAME="${PROJECT_NAME:-hadoum-prod}"
DISK_WARNING_PERCENT="${DISK_WARNING_PERCENT:-90}"
STATE_FILE="$ROOT_DIR/.monitor_state.${PROJECT_NAME}"

alert() {
  "$ROOT_DIR/scripts/notify.sh" "$1" "$2" || true
}

CONTAINERS=$(docker ps -a --filter "label=com.docker.compose.project=${PROJECT_NAME}" --format '{{.Names}}')
if [ -z "$CONTAINERS" ]; then
  echo "No containers found for project '${PROJECT_NAME}' - nothing to check."
  exit 0
fi

mkdir -p "$(dirname "$STATE_FILE")"
[ -f "$STATE_FILE" ] || : > "$STATE_FILE"

echo "==> Checking containers for project ${PROJECT_NAME}..."
for name in $CONTAINERS; do
  STATUS=$(docker inspect --format '{{.State.Status}}' "$name")
  RESTARTS=$(docker inspect --format '{{.RestartCount}}' "$name")
  HEALTH=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$name")

  PREVIOUS_RESTARTS=$(grep -E "^${name}=" "$STATE_FILE" | tail -1 | cut -d= -f2 || echo "")
  if [ -n "$PREVIOUS_RESTARTS" ] && [ "$RESTARTS" -gt "$PREVIOUS_RESTARTS" ] 2>/dev/null; then
    echo "  ${name}: restart count increased (${PREVIOUS_RESTARTS} -> ${RESTARTS})"
    alert "container_restart" "${name} (${PROJECT_NAME}) restarted: count went from ${PREVIOUS_RESTARTS} to ${RESTARTS}."
  fi

  if [ "$STATUS" != "running" ]; then
    echo "  ${name}: status=${STATUS} (not running)"
    alert "container_down" "${name} (${PROJECT_NAME}) is not running (status: ${STATUS})."
  elif [ "$HEALTH" = "unhealthy" ]; then
    echo "  ${name}: health=unhealthy"
    alert "health_failure" "${name} (${PROJECT_NAME}) reports unhealthy via its Docker healthcheck."
  else
    echo "  ${name}: status=${STATUS}, health=${HEALTH}, restarts=${RESTARTS}"
  fi

  TMP_STATE="${STATE_FILE}.tmp"
  { grep -vE "^${name}=" "$STATE_FILE" 2>/dev/null || true; echo "${name}=${RESTARTS}"; } > "$TMP_STATE"
  mv "$TMP_STATE" "$STATE_FILE"
done

echo "==> Checking disk usage..."
# Use the second-to-last field (Capacity) rather than a fixed column index:
# the Filesystem column can contain spaces (e.g. some mount setups), which
# would otherwise shift positional fields.
DISK_USED_PERCENT=$(df -P / | tail -1 | awk '{gsub("%","",$(NF-1)); print $(NF-1)}')
echo "  / is ${DISK_USED_PERCENT}% used (warning threshold: ${DISK_WARNING_PERCENT}%)"
if [ "$DISK_USED_PERCENT" -ge "$DISK_WARNING_PERCENT" ] 2>/dev/null; then
  alert "disk_usage" "Disk usage on deploy host is ${DISK_USED_PERCENT}% (threshold ${DISK_WARNING_PERCENT}%)."
fi

echo "==> Checking database reachability..."
DB_CONTAINER=$(echo "$CONTAINERS" | grep postgres || true)
if [ -n "$DB_CONTAINER" ]; then
  if ! docker exec "$DB_CONTAINER" pg_isready >/dev/null 2>&1; then
    echo "  ${DB_CONTAINER}: not ready"
    alert "database_unavailable" "Database container ${DB_CONTAINER} (${PROJECT_NAME}) is not accepting connections (pg_isready failed)."
  else
    echo "  ${DB_CONTAINER}: ready"
  fi
fi

echo "==> Monitoring check complete."
