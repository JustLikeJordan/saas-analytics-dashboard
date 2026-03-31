import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();
const mockCheckRedisHealth = vi.fn();
const mockCheckClaudeHealth = vi.fn();

vi.mock('../../lib/db.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

vi.mock('../../lib/redis.js', () => ({
  checkRedisHealth: (...args: unknown[]) => mockCheckRedisHealth(...args),
}));

vi.mock('../aiInterpretation/claudeClient.js', () => ({
  checkClaudeHealth: (...args: unknown[]) => mockCheckClaudeHealth(...args),
}));

const { getSystemHealth, formatUptime } = await import('./healthService.js');

beforeEach(() => vi.clearAllMocks());

describe('getSystemHealth', () => {
  function allHealthy() {
    mockExecute.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockCheckRedisHealth.mockResolvedValueOnce({ status: 'ok', latencyMs: 1 });
    mockCheckClaudeHealth.mockResolvedValueOnce({ status: 'ok', latencyMs: 10 });
  }

  it('returns ok for all services when everything is healthy', async () => {
    allHealthy();

    const health = await getSystemHealth();

    expect(health.services.database.status).toBe('ok');
    expect(health.services.redis.status).toBe('ok');
    expect(health.services.claude.status).toBe('ok');
    expect(health.uptime.seconds).toBeGreaterThanOrEqual(0);
    expect(health.uptime.formatted).toMatch(/\d+m/);
    expect(health.timestamp).toBeTruthy();
  });

  it('returns error when database is down', async () => {
    mockExecute.mockRejectedValueOnce(new Error('connection refused'));
    mockCheckRedisHealth.mockResolvedValueOnce({ status: 'ok', latencyMs: 1 });
    mockCheckClaudeHealth.mockResolvedValueOnce({ status: 'ok', latencyMs: 10 });

    const health = await getSystemHealth();

    expect(health.services.database.status).toBe('error');
    expect(health.services.redis.status).toBe('ok');
    expect(health.services.claude.status).toBe('ok');
  });

  it('returns error when redis is down', async () => {
    mockExecute.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockCheckRedisHealth.mockResolvedValueOnce({ status: 'error', latencyMs: 5 });
    mockCheckClaudeHealth.mockResolvedValueOnce({ status: 'ok', latencyMs: 10 });

    const health = await getSystemHealth();

    expect(health.services.database.status).toBe('ok');
    expect(health.services.redis.status).toBe('error');
    expect(health.services.claude.status).toBe('ok');
  });

  it('returns error when claude API is down', async () => {
    mockExecute.mockResolvedValueOnce([{ '?column?': 1 }]);
    mockCheckRedisHealth.mockResolvedValueOnce({ status: 'ok', latencyMs: 1 });
    mockCheckClaudeHealth.mockResolvedValueOnce({ status: 'error', latencyMs: 50 });

    const health = await getSystemHealth();

    expect(health.services.database.status).toBe('ok');
    expect(health.services.redis.status).toBe('ok');
    expect(health.services.claude.status).toBe('error');
  });

  it('returns degraded when a check exceeds timeout', async () => {
    // db check will exceed the 50ms timeout
    mockExecute.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 200)));
    mockCheckRedisHealth.mockResolvedValueOnce({ status: 'ok', latencyMs: 1 });
    mockCheckClaudeHealth.mockResolvedValueOnce({ status: 'ok', latencyMs: 10 });

    const health = await getSystemHealth(50);

    expect(health.services.database.status).toBe('degraded');
    expect(health.services.database.latencyMs).toBe(50);
  });

  it('returns all services as degraded when all checks timeout', async () => {
    const slow = () => new Promise((resolve) => setTimeout(resolve, 200));
    mockExecute.mockImplementation(slow);
    mockCheckRedisHealth.mockImplementation(slow);
    mockCheckClaudeHealth.mockImplementation(slow);

    const health = await getSystemHealth(50);

    expect(health.services.database.status).toBe('degraded');
    expect(health.services.redis.status).toBe('degraded');
    expect(health.services.claude.status).toBe('degraded');
  });

  it('formats uptime correctly', async () => {
    allHealthy();

    const health = await getSystemHealth();

    expect(health.uptime.seconds).toBeGreaterThanOrEqual(0);
    expect(typeof health.uptime.formatted).toBe('string');
    expect(health.uptime.formatted).toMatch(/\d+m/);
  });

  it('runs all checks in parallel', async () => {
    let concurrency = 0;
    let maxConcurrency = 0;

    const trackConcurrency = () =>
      new Promise<{ status: 'ok'; latencyMs: number }>((resolve) => {
        concurrency++;
        maxConcurrency = Math.max(maxConcurrency, concurrency);
        setTimeout(() => {
          concurrency--;
          resolve({ status: 'ok', latencyMs: 1 });
        }, 10);
      });

    mockExecute.mockImplementation(trackConcurrency);
    mockCheckRedisHealth.mockImplementation(trackConcurrency);
    mockCheckClaudeHealth.mockImplementation(trackConcurrency);

    await getSystemHealth();

    expect(maxConcurrency).toBe(3);
  });
});

describe('formatUptime', () => {
  it('returns 0m for zero seconds', () => {
    expect(formatUptime(0)).toBe('0m');
  });

  it('returns minutes only for sub-hour durations', () => {
    expect(formatUptime(150)).toBe('2m');
  });

  it('returns hours and minutes', () => {
    expect(formatUptime(7_260)).toBe('2h 1m');
  });

  it('returns days, hours, and minutes', () => {
    expect(formatUptime(90_120)).toBe('1d 1h 2m');
  });

  it('omits hours when exactly on a day boundary', () => {
    expect(formatUptime(86_400)).toBe('1d 0m');
  });

  it('handles fractional seconds from process.uptime()', () => {
    expect(formatUptime(3661.78)).toBe('1h 1m');
  });
});
