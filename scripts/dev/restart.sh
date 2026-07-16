#!/bin/sh
# Restart dev services (all, or pass a service name: ./restart.sh api).
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

compose restart "$@"
