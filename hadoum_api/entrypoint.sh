#!/bin/sh
set -e
echo "â–¶ Running database migrations..."
npx prisma migrate deploy
echo "â–¶ Starting API on port ${PORT:-3001}..."
exec node dist/main
