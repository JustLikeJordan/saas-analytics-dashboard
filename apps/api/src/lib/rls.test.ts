import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();
const mockTransaction = vi.fn();

vi.mock('./db.js', () => ({
  db: {
    transaction: mockTransaction,
  },
}));

vi.mock('drizzle-orm', () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      _tag: 'sql',
      strings: [...strings],
      values,
    }),
    {
      raw: (query: string) => ({ _tag: 'sql.raw', query }),
    },
  ),
}));

const { withRlsContext } = await import('./rls.js');

describe('withRlsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (fn) => {
      const tx = { execute: mockExecute };
      return fn(tx);
    });
  });

  it('sets org_id and is_admin via SET LOCAL before running the callback', async () => {
    const callOrder: string[] = [];
    mockExecute.mockImplementation(() => { callOrder.push('setLocal'); });

    await withRlsContext(42, false, async () => {
      callOrder.push('callback');
      return 'result';
    });

    expect(callOrder).toEqual(['setLocal', 'setLocal', 'callback']);
  });

  it('passes the transaction to the callback function', async () => {
    let receivedTx: unknown;

    await withRlsContext(1, false, async (tx) => {
      receivedTx = tx;
      return null;
    });

    expect(receivedTx).toHaveProperty('execute', mockExecute);
  });

  it('returns the callback result', async () => {
    const result = await withRlsContext(1, false, async () => 'hello');
    expect(result).toBe('hello');
  });

  it('sets org_id as a string value in raw SQL', async () => {
    await withRlsContext(99, false, async () => null);

    const firstCall = mockExecute.mock.calls[0]![0];
    expect(firstCall.query).toContain("'99'");
  });

  it('sets is_admin to "true" for admin users', async () => {
    await withRlsContext(1, true, async () => null);

    const secondCall = mockExecute.mock.calls[1]![0];
    expect(secondCall.query).toContain("'true'");
  });

  it('sets is_admin to "false" for non-admin users', async () => {
    await withRlsContext(1, false, async () => null);

    const secondCall = mockExecute.mock.calls[1]![0];
    expect(secondCall.query).toContain("'false'");
  });

  it('propagates errors from the callback (fail-closed)', async () => {
    await expect(
      withRlsContext(1, false, async () => {
        throw new Error('query failed');
      }),
    ).rejects.toThrow('query failed');
  });

  it('propagates errors from SET LOCAL (fail-closed)', async () => {
    mockExecute.mockRejectedValueOnce(new Error('SET LOCAL failed'));

    await expect(
      withRlsContext(1, false, async () => 'should not reach'),
    ).rejects.toThrow('SET LOCAL failed');
  });

  it('rejects non-finite orgId values', async () => {
    await expect(
      withRlsContext(NaN, false, async () => null),
    ).rejects.toThrow('orgId must be a finite number');

    await expect(
      withRlsContext(Infinity, false, async () => null),
    ).rejects.toThrow('orgId must be a finite number');
  });

  it('rejects non-boolean isAdmin values', async () => {
    await expect(
      withRlsContext(1, 'true' as unknown as boolean, async () => null),
    ).rejects.toThrow('isAdmin must be a boolean');
  });

  it('org A context does not bleed into org B calls', async () => {
    const orgIds: string[] = [];
    mockExecute.mockImplementation((stmt: { query: string }) => {
      const match = stmt.query?.match(/current_org_id = '(\d+)'/);
      if (match) orgIds.push(match[1]!);
    });

    await withRlsContext(10, false, async () => 'orgA');
    await withRlsContext(20, false, async () => 'orgB');

    expect(orgIds).toEqual(['10', '20']);
  });
});
