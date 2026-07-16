#!/bin/sh
# Rebuild dev images (e.g. after changing package.json or a Dockerfile.dev).
set -eu
. "$(dirname "$0")/_common.sh"
require_env_file
guard_no_prod

compose build "$@"
