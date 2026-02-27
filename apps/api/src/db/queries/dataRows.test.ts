import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();
const mockReturning = vi.fn();
const mockValues = vi.fn(() => ({ returning: mockReturning }));

vi.mock('../../lib/db.js', () => ({
  db: {
    query: {
      dataRows: {
        findMany: mockFindMany,
      },
    },
    insert: vi.fn().mockReturnValue({ values: mockValues }),
  },
}));

const { insertBatch, getByDateRange, getByCategory, getRowsByDataset } =
  await import('./dataRows.js');

describe('dataRows queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('insertBatch', () => {
    it('inserts rows and returns them', async () => {
      const inserted = [{ id: 1 }, { id: 2 }];
      mockReturning.mockResolvedValueOnce(inserted);

      const rows = [
        { category: 'Revenue', date: new Date('2025-01-15'), amount: '12000.00' },
        { category: 'Payroll', date: new Date('2025-01-15'), amount: '5500.00' },
      ];

      const result = await insertBatch(10, 1, rows);

      expect(result).toEqual(inserted);
    });

    it('returns empty array for empty input', async () => {
      const result = await insertBatch(10, 1, []);

      expect(result).toEqual([]);
      expect(mockValues).not.toHaveBeenCalled();
    });
  });

  describe('getByDateRange', () => {
    it('returns rows within date range', async () => {
      const rows = [{ id: 1, amount: '12000.00' }];
      mockFindMany.mockResolvedValueOnce(rows);

      const start = new Date('2025-01-01');
      const end = new Date('2025-03-31');
      const result = await getByDateRange(10, start, end);

      expect(mockFindMany).toHaveBeenCalledOnce();
      expect(result).toEqual(rows);
    });

    it('accepts optional datasetIds filter', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const start = new Date('2025-01-01');
      const end = new Date('2025-12-31');
      await getByDateRange(10, start, end, [1, 2]);

      expect(mockFindMany).toHaveBeenCalledOnce();
    });
  });

  describe('getByCategory', () => {
    it('returns rows for the category', async () => {
      const rows = [{ id: 1, category: 'Revenue' }];
      mockFindMany.mockResolvedValueOnce(rows);

      const result = await getByCategory(10, 'Revenue');

      expect(mockFindMany).toHaveBeenCalledOnce();
      expect(result).toEqual(rows);
    });

    it('accepts optional datasetIds filter', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await getByCategory(10, 'Revenue', [1]);

      expect(mockFindMany).toHaveBeenCalledOnce();
    });
  });

  describe('getRowsByDataset', () => {
    it('returns rows for the dataset', async () => {
      const rows = [{ id: 1 }, { id: 2 }];
      mockFindMany.mockResolvedValueOnce(rows);

      const result = await getRowsByDataset(10, 1);

      expect(mockFindMany).toHaveBeenCalledOnce();
      expect(result).toEqual(rows);
    });
  });
});
