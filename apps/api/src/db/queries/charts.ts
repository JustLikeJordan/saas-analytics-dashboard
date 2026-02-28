import { eq, asc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { dataRows } from '../schema.js';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * Aggregates an org's data_rows into chart-ready structures:
 * - revenueTrend: monthly income totals, chronological
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

  const revenueByMonth = new Map<number, number>();
  const expenseTotals = new Map<string, number>();

  for (const row of rows) {
    const amount = parseFloat(row.amount);
    const month = row.date.getMonth();

    if (row.parentCategory === 'Income') {
      revenueByMonth.set(month, (revenueByMonth.get(month) ?? 0) + amount);
    } else if (row.parentCategory === 'Expenses') {
      expenseTotals.set(row.category, (expenseTotals.get(row.category) ?? 0) + amount);
    }
  }

  const revenueTrend = [...revenueByMonth.entries()]
    .sort(([a], [b]) => a - b)
    .map(([monthIdx, revenue]) => ({
      month: MONTH_LABELS[monthIdx],
      revenue: Math.round(revenue * 100) / 100,
    }));

  const expenseBreakdown = [...expenseTotals.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  return { revenueTrend, expenseBreakdown };
}
