#!/bin/sh
# DESTRUCTIVE (dev only): stops containers and deletes the dev volumes,
# including the dev Postgres data. Equivalent to
# `docker compose -f docker-compose.dev.yml down -v` but with guards
# and an explicit confirmation step.
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

cat <<EOF
=======================================================================
 WARNING: this will run "docker compose down -v" on project '$PROJECT_NAME'.
 It PERMANENTLY DELETES:
   - the dev Postgres volume (hadoum-postgres-dev-data)
   - the dev node_modules volumes
   - the dev containers and network
 This targets ONLY the '$PROJECT_NAME' Compose project (file: $COMPOSE_FILE).
 Production resources (project 'hadoum-prod', volume
 hadoum-postgres-prod-data) are never referenced by this script.
=======================================================================
EOF

printf "Type the project name '%s' to confirm: " "$PROJECT_NAME"
read -r CONFIRM
if [ "$CONFIRM" != "$PROJECT_NAME" ]; then
  echo "Confirmation did not match. Aborted."
  exit 1
fi

compose down -v
echo "Dev environment reset: containers, network and volumes removed."
