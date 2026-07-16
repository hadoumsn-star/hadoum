#!/bin/sh
# Tail logs for all dev services, or pass a service name: ./logs.sh api
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

compose logs -f --tail=200 "$@"
