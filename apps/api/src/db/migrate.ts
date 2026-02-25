// Standalone migration script — runs before the Express app boots (via Docker entrypoint).
// CLAUDE.md exceptions:
//   - process.env: config.ts validates ALL env vars (REDIS_URL, CLAUDE_API_KEY, etc.)
//     which aren't available in the migration context. Direct access is intentional.
//   - console.log: Pino is an app-level logger tied to the Express lifecycle.
//     Migration scripts use console for operational output before the app starts.
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL; // eslint-disable-line no-restricted-syntax
if (!dbUrl) {
  console.error('DATABASE_URL is required for migrations'); // eslint-disable-line no-console
  process.exit(1);
}

const migrationClient = postgres(dbUrl, { max: 1 });

async function runMigrations() {
  const db = drizzle(migrationClient);

  console.info('Running database migrations...'); // eslint-disable-line no-console
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  console.info('Migrations completed successfully'); // eslint-disable-line no-console

  await migrationClient.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err); // eslint-disable-line no-console
  process.exit(1);
});
