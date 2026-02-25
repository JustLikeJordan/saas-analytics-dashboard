import Redis from 'ioredis';
import { env } from '../config.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableOfflineQueue: false, // fail fast when Redis is down — rate limiter needs this for fail-open
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info({}, 'Redis connected');
});

export async function checkRedisHealth(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
  const start = Date.now();
  try {
    await redis.ping();
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', latencyMs: Date.now() - start };
  }
}
