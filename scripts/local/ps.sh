#!/bin/sh
# Show status of local containers.
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

compose ps
