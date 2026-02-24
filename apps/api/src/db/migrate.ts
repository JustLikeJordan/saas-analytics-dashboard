import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL is required for migrations');
  process.exit(1);
}

const migrationClient = postgres(dbUrl, { max: 1 });

async function runMigrations() {
  const db = drizzle(migrationClient);

  console.log('Running database migrations...');
  await migrate(db, { migrationsFolder: './drizzle/migrations' });
  console.log('Migrations completed successfully');

  await migrationClient.end();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
