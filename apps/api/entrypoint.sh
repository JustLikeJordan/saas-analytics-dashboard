#!/bin/sh
set -e

echo "Running database migrations..."
cd /app/apps/api
if ! ./node_modules/.bin/drizzle-kit migrate; then
  echo "WARNING: drizzle-kit migrate exited non-zero (may be no pending migrations)"
fi
cd /app

echo "Starting API server..."
exec "$@"
