import { sql } from 'drizzle-orm';
import type { ServiceStatus, SystemHealth } from 'shared/types';

import { db } from '../../lib/db.js';
import { checkRedisHealth } from '../../lib/redis.js';
import { checkClaudeHealth } from '../aiInterpretation/claudeClient.js';

const DEFAULT_TIMEOUT_MS = 5_000;

async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  const timeout = new Promise<T>((resolve) =>
    setTimeout(() => resolve(fallback), timeoutMs),
  );
  return Promise.race([fn(), timeout]);
}

async function checkDatabaseHealth(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', latencyMs: Date.now() - start };
  }
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

export async function getSystemHealth(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<SystemHealth> {
  const degraded: ServiceStatus = { status: 'degraded', latencyMs: timeoutMs };

  const [database, redis, claude] = await Promise.all([
    withTimeout(() => checkDatabaseHealth(), timeoutMs, degraded),
    withTimeout(() => checkRedisHealth(), timeoutMs, degraded),
    withTimeout(() => checkClaudeHealth(), timeoutMs, degraded),
  ]);

  const uptimeSeconds = process.uptime();

  return {
    services: { database, redis, claude },
    uptime: {
      seconds: Math.floor(uptimeSeconds),
      formatted: formatUptime(uptimeSeconds),
    },
    timestamp: new Date().toISOString(),
  };
}
