import { eq, asc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { dataRows } from '../schema.js';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Aggregates an org's data_rows into chart-ready structures:
 * - revenueTrend: monthly income totals, chronological (year-aware)
 * - expenseBreakdown: total per expense category, descending by amount
 *
 * Runs a single query, aggregates in JS. Good enough for <50k rows;
 * move to SQL GROUP BY if this becomes a bottleneck.
 */
export async function getChartData(orgId: number) {
  const rows = await db.query.dataRows.findMany({
    where: eq(dataRows.orgId, orgId),
    orderBy: asc(dataRows.date),
  });

  // keyed as "YYYY-MM" for correct chronological sorting across years
  const revenueByMonth = new Map<string, number>();
  const expenseTotals = new Map<string, number>();

  for (const row of rows) {
    const amount = parseFloat(row.amount);

    if (row.parentCategory === 'Income') {
      const key = `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}`;
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + amount);
    } else if (row.parentCategory === 'Expenses') {
      expenseTotals.set(row.category, (expenseTotals.get(row.category) ?? 0) + amount);
    }
  }

  const revenueTrend = [...revenueByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, revenue]) => {
      const monthIdx = parseInt(key.split('-')[1]!, 10) - 1;
      const year = key.split('-')[0];
      return {
        month: `${MONTH_LABELS[monthIdx]} ${year}`,
        revenue: Math.round(revenue * 100) / 100,
      };
    });

  const expenseBreakdown = [...expenseTotals.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  return { revenueTrend, expenseBreakdown };
}
