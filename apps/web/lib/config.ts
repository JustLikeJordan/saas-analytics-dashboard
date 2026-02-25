import { z } from 'zod';

const envSchema = z.object({
  API_INTERNAL_URL: z.string().url().default('http://api:3001'),
  JWT_SECRET: z.string().min(32).optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const webEnv = envSchema.parse({
  API_INTERNAL_URL: process.env.API_INTERNAL_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  NODE_ENV: process.env.NODE_ENV,
});
