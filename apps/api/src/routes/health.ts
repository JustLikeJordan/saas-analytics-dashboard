import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../lib/db.js';
import { checkRedisHealth } from '../lib/redis.js';

const router = Router();

// liveness — is the process alive? Never check external deps here.
// A failed liveness probe restarts the container, so keep it trivial.
router.get('/health/live', (_req, res) => {
  res.json({ status: 'ok' });
});

// readiness — can this instance serve traffic? Check DB + Redis.
// A failed readiness probe stops routing traffic but doesn't restart.
router.get('/health/ready', async (_req, res) => {
  const [dbHealth, redisHealth] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

  const ready = dbHealth.status === 'ok' && redisHealth.status === 'ok';

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    services: { database: dbHealth, redis: redisHealth },
  });
});

// backward-compatible combined check (used by Docker healthcheck + E2E wait loop)
router.get('/health', async (_req, res) => {
  const [dbHealth, redisHealth] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

  const status = dbHealth.status === 'ok' && redisHealth.status === 'ok' ? 'ok' : 'degraded';

  res.status(status === 'ok' ? 200 : 503).json({
    status,
    services: { database: dbHealth, redis: redisHealth },
    timestamp: new Date().toISOString(),
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
