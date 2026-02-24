import type { Config } from 'drizzle-kit';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL is required for drizzle-kit');

export default {
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: dbUrl,
  },
} satisfies Config;
