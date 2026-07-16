#!/bin/sh
# Stop and remove dev containers/network. Does NOT remove volumes.
# Use dev-reset if you need to wipe the dev database too.
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

compose down
