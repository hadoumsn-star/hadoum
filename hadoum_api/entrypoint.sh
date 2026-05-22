#!/bin/sh
set -e
echo "▶ Running database migrations..."
npx prisma migrate deploy
echo "▶ Starting API on port ${PORT:-3001}..."
exec node dist/main
