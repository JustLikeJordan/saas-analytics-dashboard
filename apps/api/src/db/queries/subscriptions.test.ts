import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn() as ReturnType<typeof vi.fn> & { _resultPromise: Promise<unknown[]> };

vi.mock('../../lib/db.js', () => ({
  db: {
    select: () => {
      mockSelect();
      return { from: (...args: unknown[]) => { mockFrom(...args); return { where: (...wArgs: unknown[]) => { mockWhere(...wArgs); return { limit: (n: number) => { mockLimit(n); return mockLimit._resultPromise; } }; } }; } };
    },
  },
}));

vi.mock('../schema.js', () => ({
  subscriptions: {
    orgId: 'org_id',
    status: 'status',
    currentPeriodEnd: 'current_period_end',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => args,
  eq: (a: unknown, b: unknown) => ({ eq: [a, b] }),
  gt: (a: unknown, b: unknown) => ({ gt: [a, b] }),
}));

describe('getActiveTier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pro when active subscription exists', async () => {
    mockLimit._resultPromise = Promise.resolve([{ id: 1 }]);

    const { getActiveTier } = await import('./subscriptions.js');
    const tier = await getActiveTier(1);

    expect(tier).toBe('pro');
  });

  it('returns free when no subscription rows', async () => {
    mockLimit._resultPromise = Promise.resolve([]);

    const { getActiveTier } = await import('./subscriptions.js');
    const tier = await getActiveTier(1);

    expect(tier).toBe('free');
  });

  it('returns free on query error (table does not exist)', async () => {
    mockLimit._resultPromise = Promise.reject(new Error('relation "subscriptions" does not exist'));

    const { getActiveTier } = await import('./subscriptions.js');
    const tier = await getActiveTier(1);

    expect(tier).toBe('free');
  });
});
