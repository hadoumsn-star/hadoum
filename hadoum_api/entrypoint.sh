#!/bin/sh
set -e
echo "â–¶ Syncing database schema..."
npx prisma db push --accept-data-loss
echo "â–¶ Starting API on port ${PORT:-3001}..."
exec node dist/main
