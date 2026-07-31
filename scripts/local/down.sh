#!/bin/sh
# Stop and remove local containers/network. Does NOT remove volumes.
# Use reset.sh if you need to wipe the local database too.
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

compose down
