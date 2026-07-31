#!/bin/sh
# Build (if needed) and start the local stack in the background.
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

compose up -d --build
compose ps
