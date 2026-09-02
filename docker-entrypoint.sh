#!/bin/sh
set -e

# Create the schema from the Drizzle schema file — the containerized equivalent of
# the `npm run db:push` step in the README. Idempotent: on an existing database
# there is nothing to apply and this is a no-op. --force keeps it non-interactive.
echo "==> Applying database schema to ${DATABASE_PATH}"
npx drizzle-kit push --force --config=drizzle.config.ts

# Default funds are seeded by src/lib/server/db/index.ts on first boot, once the
# tables above exist.
echo "==> Starting server on port ${PORT:-3000}"
exec node build
