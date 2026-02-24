import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../lib/db.js';
import { checkRedisHealth } from '../lib/redis.js';

const router = Router();

router.get('/health', async (_req, res) => {
  const [dbHealth, redisHealth] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

  const status = dbHealth.status === 'ok' && redisHealth.status === 'ok' ? 'ok' : 'degraded';

  const statusCode = status === 'ok' ? 200 : 503;

  res.status(statusCode).json({
    data: {
      status,
      services: {
        database: dbHealth,
        redis: redisHealth,
      },
      timestamp: new Date().toISOString(),
    },
  });
});

async function checkDatabaseHealth(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', latencyMs: Date.now() - start };
  }
}

export default router;
