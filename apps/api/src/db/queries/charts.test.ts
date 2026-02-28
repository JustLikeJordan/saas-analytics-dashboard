import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindMany = vi.fn();

vi.mock('../../lib/db.js', () => ({
  db: {
    query: {
      dataRows: { findMany: mockFindMany },
    },
  },
}));

const { getChartData } = await import('./charts.js');

function row(overrides: {
  date: Date;
  amount: string;
  category: string;
  parentCategory: string;
}) {
  return { orgId: 1, ...overrides };
}

describe('getChartData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates income rows into monthly revenue', async () => {
    mockFindMany.mockResolvedValueOnce([
      row({ date: new Date('2025-01-10'), amount: '1000.00', category: 'Sales', parentCategory: 'Income' }),
      row({ date: new Date('2025-01-20'), amount: '500.00', category: 'Sales', parentCategory: 'Income' }),
      row({ date: new Date('2025-02-05'), amount: '750.00', category: 'Sales', parentCategory: 'Income' }),
    ]);

    const result = await getChartData(1);

    expect(result.revenueTrend).toEqual([
      { month: 'Jan', revenue: 1500 },
      { month: 'Feb', revenue: 750 },
    ]);
  });

  it('aggregates expense rows by category sorted descending', async () => {
    mockFindMany.mockResolvedValueOnce([
      row({ date: new Date('2025-01-01'), amount: '200.00', category: 'Rent', parentCategory: 'Expenses' }),
      row({ date: new Date('2025-01-15'), amount: '800.00', category: 'Payroll', parentCategory: 'Expenses' }),
      row({ date: new Date('2025-02-01'), amount: '300.00', category: 'Rent', parentCategory: 'Expenses' }),
    ]);

    const result = await getChartData(1);

    expect(result.expenseBreakdown).toEqual([
      { category: 'Payroll', total: 800 },
      { category: 'Rent', total: 500 },
    ]);
  });

  it('returns empty arrays for no data', async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await getChartData(1);

    expect(result.revenueTrend).toEqual([]);
    expect(result.expenseBreakdown).toEqual([]);
  });

  it('handles rows with zero amounts', async () => {
    mockFindMany.mockResolvedValueOnce([
      row({ date: new Date(2025, 2, 15), amount: '0.00', category: 'Sales', parentCategory: 'Income' }),
      row({ date: new Date(2025, 2, 20), amount: '0.00', category: 'Rent', parentCategory: 'Expenses' }),
    ]);

    const result = await getChartData(1);

    expect(result.revenueTrend).toEqual([{ month: 'Mar', revenue: 0 }]);
    expect(result.expenseBreakdown).toEqual([{ category: 'Rent', total: 0 }]);
  });

  it('separates income and expense rows correctly', async () => {
    mockFindMany.mockResolvedValueOnce([
      row({ date: new Date(2025, 3, 5), amount: '5000.00', category: 'Sales', parentCategory: 'Income' }),
      row({ date: new Date(2025, 3, 10), amount: '1200.00', category: 'Payroll', parentCategory: 'Expenses' }),
      row({ date: new Date(2025, 3, 15), amount: '2000.00', category: 'Consulting', parentCategory: 'Income' }),
      row({ date: new Date(2025, 3, 20), amount: '400.00', category: 'Utilities', parentCategory: 'Expenses' }),
    ]);

    const result = await getChartData(1);

    expect(result.revenueTrend).toEqual([{ month: 'Apr', revenue: 7000 }]);
    expect(result.expenseBreakdown).toEqual([
      { category: 'Payroll', total: 1200 },
      { category: 'Utilities', total: 400 },
    ]);
  });

  it('rounds amounts to 2 decimal places', async () => {
    mockFindMany.mockResolvedValueOnce([
      row({ date: new Date(2025, 5, 5), amount: '33.33', category: 'Sales', parentCategory: 'Income' }),
      row({ date: new Date(2025, 5, 15), amount: '33.33', category: 'Sales', parentCategory: 'Income' }),
      row({ date: new Date(2025, 5, 20), amount: '33.33', category: 'Sales', parentCategory: 'Income' }),
      row({ date: new Date(2025, 6, 5), amount: '10.005', category: 'Supplies', parentCategory: 'Expenses' }),
      row({ date: new Date(2025, 6, 15), amount: '10.005', category: 'Supplies', parentCategory: 'Expenses' }),
    ]);

    const result = await getChartData(1);

    // 33.33 * 3 = 99.99 — already clean, but verifies rounding path runs
    expect(result.revenueTrend).toEqual([{ month: 'Jun', revenue: 99.99 }]);
    // 10.005 + 10.005 = 20.01 after rounding
    expect(result.expenseBreakdown).toEqual([{ category: 'Supplies', total: 20.01 }]);
  });
});
