#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/apps/api
npx drizzle-kit migrate 2>/dev/null || echo "No pending migrations or migration skipped"
cd /app

echo "Starting API server..."
exec "$@"
