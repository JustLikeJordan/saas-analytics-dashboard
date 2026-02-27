import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockFindFirst = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));

vi.mock('../../lib/db.js', () => ({
  db: {
    query: {
      datasets: {
        findMany: mockFindMany,
        findFirst: mockFindFirst,
      },
    },
    insert: vi.fn().mockReturnValue({ values: mockValues }),
  },
}));

const { createDataset, getDatasetsByOrg, getUserOrgDemoState, getSeedDataset } =
  await import('./datasets.js');

describe('datasets queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createDataset', () => {
    it('inserts a dataset with orgId and returns the record', async () => {
      const dataset = { id: 1, orgId: 10, name: 'Q1 Financials', isSeedData: false };
      mockReturning.mockResolvedValueOnce([dataset]);

      const result = await createDataset(10, { name: 'Q1 Financials' });

      expect(result).toEqual(dataset);
    });

    it('passes isSeedData when provided', async () => {
      const dataset = { id: 2, orgId: 10, name: 'Seed', isSeedData: true };
      mockReturning.mockResolvedValueOnce([dataset]);

      const result = await createDataset(10, { name: 'Seed', isSeedData: true });

      expect(result.isSeedData).toBe(true);
    });

    it('throws if insert returns empty', async () => {
      mockReturning.mockResolvedValueOnce([]);

      await expect(createDataset(10, { name: 'Fail' })).rejects.toThrow(
        'Insert failed to return dataset',
      );
    });
  });

  describe('getDatasetsByOrg', () => {
    it('returns datasets for the org', async () => {
      const datasets = [{ id: 1 }, { id: 2 }];
      mockFindMany.mockResolvedValueOnce(datasets);

      const result = await getDatasetsByOrg(10);

      expect(mockFindMany).toHaveBeenCalledOnce();
      expect(result).toEqual(datasets);
    });
  });

  describe('getUserOrgDemoState', () => {
    it('returns "empty" when org has no user datasets', async () => {
      mockFindFirst.mockResolvedValueOnce(undefined);

      const state = await getUserOrgDemoState(10);

      expect(state).toBe('empty');
    });

    it('returns "user_only" when org has a non-seed dataset', async () => {
      mockFindFirst.mockResolvedValueOnce({ id: 1, isSeedData: false });

      const state = await getUserOrgDemoState(10);

      expect(state).toBe('user_only');
    });
  });

  describe('getSeedDataset', () => {
    it('returns seed dataset when present', async () => {
      const seed = { id: 5, orgId: 1, isSeedData: true };
      mockFindFirst.mockResolvedValueOnce(seed);

      const result = await getSeedDataset(1);

      expect(result).toEqual(seed);
    });

    it('returns undefined when no seed dataset', async () => {
      mockFindFirst.mockResolvedValueOnce(undefined);

      const result = await getSeedDataset(1);

      expect(result).toBeUndefined();
    });
  });
});
