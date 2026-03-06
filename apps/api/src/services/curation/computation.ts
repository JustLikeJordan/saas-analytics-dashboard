import {
  sum,
  mean,
  median,
  standardDeviation,
  linearRegression,
  quantile,
  min,
  max,
} from 'simple-statistics';

import type { ComputedStat } from './types.js';
import { StatType } from './types.js';

interface DataRow {
  category: string;
  parentCategory?: string | null;
  date: Date;
  amount: string;
  label?: string | null;
  metadata?: unknown;
  [key: string]: unknown;
}

interface CategoryGroup {
  amounts: number[];
  timeSeries: [number, number][];
}

function parseAmount(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function groupByCategory(rows: DataRow[]): Map<string, CategoryGroup> {
  const groups = new Map<string, CategoryGroup>();

  for (const row of rows) {
    const amt = parseAmount(row.amount);
    if (amt === null) continue;

    let group = groups.get(row.category);
    if (!group) {
      group = { amounts: [], timeSeries: [] };
      groups.set(row.category, group);
    }

    group.amounts.push(amt);
    group.timeSeries.push([row.date.getTime(), amt]);
  }

  return groups;
}

function computeTotals(
  groups: Map<string, CategoryGroup>,
  allAmounts: number[],
): ComputedStat[] {
  const stats: ComputedStat[] = [];

  for (const [cat, group] of groups) {
    stats.push({
      statType: StatType.Total,
      category: cat,
      value: sum(group.amounts),
      details: { scope: 'category', count: group.amounts.length },
    });
  }

  if (allAmounts.length > 0) {
    stats.push({
      statType: StatType.Total,
      category: null,
      value: sum(allAmounts),
      details: { scope: 'overall', count: allAmounts.length },
    });
  }

  return stats;
}

function computeAverages(
  groups: Map<string, CategoryGroup>,
  allAmounts: number[],
): ComputedStat[] {
  const stats: ComputedStat[] = [];

  for (const [cat, group] of groups) {
    const med = median(group.amounts);
    stats.push({
      statType: StatType.Average,
      category: cat,
      value: mean(group.amounts),
      comparison: med,
      details: { scope: 'category', median: med },
    });
  }

  if (allAmounts.length > 0) {
    const med = median(allAmounts);
    stats.push({
      statType: StatType.Average,
      category: null,
      value: mean(allAmounts),
      comparison: med,
      details: { scope: 'overall', median: med },
    });
  }

  return stats;
}

function computeTrends(
  groups: Map<string, CategoryGroup>,
  minPoints: number,
): ComputedStat[] {
  const stats: ComputedStat[] = [];

  for (const [cat, group] of groups) {
    if (group.timeSeries.length < minPoints) continue;

    const sorted = [...group.timeSeries].sort((a, b) => a[0] - b[0]);
    const reg = linearRegression(sorted);

    const firstVal = sorted[0]![1];
    const lastVal = sorted[sorted.length - 1]![1];
    const growthPercent = firstVal !== 0 ? ((lastVal - firstVal) / Math.abs(firstVal)) * 100 : 0;

    stats.push({
      statType: StatType.Trend,
      category: cat,
      value: reg.m,
      details: {
        slope: reg.m,
        intercept: reg.b,
        growthPercent,
        dataPoints: sorted.length,
        firstValue: firstVal,
        lastValue: lastVal,
      },
    });
  }

  return stats;
}

function detectAnomalies(groups: Map<string, CategoryGroup>): ComputedStat[] {
  const stats: ComputedStat[] = [];

  for (const [cat, group] of groups) {
    if (group.amounts.length < 3) continue;

    const sorted = [...group.amounts].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;

    // all identical values — no anomalies possible
    if (iqr === 0) continue;

    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    for (const amt of group.amounts) {
      if (amt < lower || amt > upper) {
        const catMean = mean(group.amounts);
        const catStd = standardDeviation(group.amounts);
        const zScore = catStd > 0 ? (amt - catMean) / catStd : 0;

        stats.push({
          statType: StatType.Anomaly,
          category: cat,
          value: amt,
          comparison: catMean,
          details: {
            direction: amt > upper ? 'above' : 'below',
            zScore,
            iqrBounds: { lower, upper },
            deviation: amt - catMean,
          },
        });
      }
    }
  }

  return stats;
}

function computeCategoryBreakdowns(
  groups: Map<string, CategoryGroup>,
): ComputedStat[] {
  const stats: ComputedStat[] = [];

  let totalAbsolute = 0;
  for (const group of groups.values()) {
    totalAbsolute += group.amounts.reduce((acc, n) => acc + Math.abs(n), 0);
  }

  if (totalAbsolute === 0) return stats;

  for (const [cat, group] of groups) {
    const catAbsolute = group.amounts.reduce((acc, n) => acc + Math.abs(n), 0);
    const percentage = (catAbsolute / totalAbsolute) * 100;
    const catSum = sum(group.amounts);

    stats.push({
      statType: StatType.CategoryBreakdown,
      category: cat,
      value: catSum,
      details: {
        percentage,
        absoluteTotal: catAbsolute,
        transactionCount: group.amounts.length,
        min: min(group.amounts),
        max: max(group.amounts),
      },
    });
  }

  return stats;
}

export function computeStats(
  rows: DataRow[],
  opts?: { trendMinPoints?: number },
): ComputedStat[] {
  if (rows.length === 0) return [];

  const groups = groupByCategory(rows);

  const allAmounts: number[] = [];
  for (const group of groups.values()) {
    allAmounts.push(...group.amounts);
  }

  if (allAmounts.length === 0) return [];

  const trendMinPoints = opts?.trendMinPoints ?? 3;

  return [
    ...computeTotals(groups, allAmounts),
    ...computeAverages(groups, allAmounts),
    ...computeTrends(groups, trendMinPoints),
    ...detectAnomalies(groups),
    ...computeCategoryBreakdowns(groups),
  ];
}
