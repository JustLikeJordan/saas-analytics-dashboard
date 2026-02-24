#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/apps/api
if ! npx tsx src/db/migrate.ts; then
  echo "WARNING: migration runner exited non-zero (may be no pending migrations)"
fi
cd /app

echo "Starting API server..."
exec "$@"
