import { describe, it, expect } from 'vitest';

import { computeStats } from './computation.js';
import { StatType } from './types.js';

const fixture = {
  multiCategory: [
    { id: 1, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Sales', parentCategory: null, date: new Date('2026-01-01'), amount: '1000.00', label: 'Widget A', metadata: null, createdAt: new Date() },
    { id: 2, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Sales', parentCategory: null, date: new Date('2026-02-01'), amount: '1500.00', label: 'Widget B', metadata: null, createdAt: new Date() },
    { id: 3, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Sales', parentCategory: null, date: new Date('2026-03-01'), amount: '2000.00', label: 'Widget C', metadata: null, createdAt: new Date() },
    { id: 4, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Sales', parentCategory: null, date: new Date('2026-04-01'), amount: '2500.00', label: 'Widget D', metadata: null, createdAt: new Date() },
    { id: 5, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Marketing', parentCategory: null, date: new Date('2026-01-01'), amount: '500.00', label: 'Ad spend', metadata: null, createdAt: new Date() },
    { id: 6, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Marketing', parentCategory: null, date: new Date('2026-02-01'), amount: '600.00', label: 'Ad spend', metadata: null, createdAt: new Date() },
    { id: 7, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Marketing', parentCategory: null, date: new Date('2026-03-01'), amount: '550.00', label: 'Ad spend', metadata: null, createdAt: new Date() },
    { id: 8, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Marketing', parentCategory: null, date: new Date('2026-04-01'), amount: '700.00', label: 'Ad spend', metadata: null, createdAt: new Date() },
  ],

  singleRow: [
    { id: 1, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Refunds', parentCategory: null, date: new Date('2026-01-01'), amount: '250.00', label: 'Return', metadata: null, createdAt: new Date() },
  ],

  withAnomaly: [
    { id: 1, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Revenue', parentCategory: null, date: new Date('2026-01-01'), amount: '100.00', label: null, metadata: null, createdAt: new Date() },
    { id: 2, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Revenue', parentCategory: null, date: new Date('2026-02-01'), amount: '105.00', label: null, metadata: null, createdAt: new Date() },
    { id: 3, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Revenue', parentCategory: null, date: new Date('2026-03-01'), amount: '98.00', label: null, metadata: null, createdAt: new Date() },
    { id: 4, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Revenue', parentCategory: null, date: new Date('2026-04-01'), amount: '102.00', label: null, metadata: null, createdAt: new Date() },
    { id: 5, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Revenue', parentCategory: null, date: new Date('2026-05-01'), amount: '500.00', label: null, metadata: null, createdAt: new Date() },
  ],

  withNaN: [
    { id: 1, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Sales', parentCategory: null, date: new Date('2026-01-01'), amount: 'not-a-number', label: null, metadata: null, createdAt: new Date() },
    { id: 2, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Sales', parentCategory: null, date: new Date('2026-02-01'), amount: '100.00', label: null, metadata: null, createdAt: new Date() },
  ],

  negativeAmounts: [
    { id: 1, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Expenses', parentCategory: null, date: new Date('2026-01-01'), amount: '-200.00', label: null, metadata: null, createdAt: new Date() },
    { id: 2, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Expenses', parentCategory: null, date: new Date('2026-02-01'), amount: '-150.00', label: null, metadata: null, createdAt: new Date() },
    { id: 3, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Expenses', parentCategory: null, date: new Date('2026-03-01'), amount: '-300.00', label: null, metadata: null, createdAt: new Date() },
  ],

  allSameAmount: [
    { id: 1, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Fees', parentCategory: null, date: new Date('2026-01-01'), amount: '50.00', label: null, metadata: null, createdAt: new Date() },
    { id: 2, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Fees', parentCategory: null, date: new Date('2026-02-01'), amount: '50.00', label: null, metadata: null, createdAt: new Date() },
    { id: 3, orgId: 1, datasetId: 1, sourceType: 'csv' as const, category: 'Fees', parentCategory: null, date: new Date('2026-03-01'), amount: '50.00', label: null, metadata: null, createdAt: new Date() },
  ],
};

describe('computeStats', () => {
  it('returns empty array for empty dataset', () => {
    const result = computeStats([]);
    expect(result).toEqual([]);
  });

  it('produces totals for each category', () => {
    const stats = computeStats(fixture.multiCategory);
    const totals = stats.filter((s) => s.statType === StatType.Total);

    const salesTotals = totals.filter((s) => s.category === 'Sales');
    expect(salesTotals.length).toBeGreaterThanOrEqual(1);

    const salesTotal = salesTotals.find((s) => s.details.scope === 'category');
    expect(salesTotal?.value).toBe(7000);

    const marketingTotal = totals.find(
      (s) => s.category === 'Marketing' && s.details.scope === 'category',
    );
    expect(marketingTotal?.value).toBe(2350);
  });

  it('produces overall total', () => {
    const stats = computeStats(fixture.multiCategory);
    const overallTotal = stats.find(
      (s) => s.statType === StatType.Total && s.category === null,
    );
    expect(overallTotal?.value).toBe(9350);
  });

  it('produces averages for each category and overall', () => {
    const stats = computeStats(fixture.multiCategory);
    const avgs = stats.filter((s) => s.statType === StatType.Average);

    const salesAvg = avgs.find(
      (s) => s.category === 'Sales' && s.details.scope === 'category',
    );
    expect(salesAvg?.value).toBe(1750);

    const overallAvg = avgs.find((s) => s.category === null);
    expect(overallAvg?.value).toBeCloseTo(1168.75);
  });

  it('produces trends with slope for categories with ≥3 data points', () => {
    const stats = computeStats(fixture.multiCategory);
    const trends = stats.filter((s) => s.statType === StatType.Trend);

    const salesTrend = trends.find((s) => s.category === 'Sales');
    expect(salesTrend).toBeDefined();
    expect(salesTrend!.value).toBeGreaterThan(0);
    expect(salesTrend!.details).toHaveProperty('slope');
    expect(salesTrend!.details).toHaveProperty('growthPercent');
  });

  it('detects anomalies via IQR for categories with ≥3 data points', () => {
    const stats = computeStats(fixture.withAnomaly);
    const anomalies = stats.filter((s) => s.statType === StatType.Anomaly);

    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    const bigAnomaly = anomalies.find((s) => s.value === 500);
    expect(bigAnomaly).toBeDefined();
    expect(bigAnomaly!.details).toHaveProperty('direction', 'above');
  });

  it('produces category breakdown with percentages', () => {
    const stats = computeStats(fixture.multiCategory);
    const breakdowns = stats.filter(
      (s) => s.statType === StatType.CategoryBreakdown,
    );

    expect(breakdowns.length).toBeGreaterThanOrEqual(2);
    const salesBreakdown = breakdowns.find((s) => s.category === 'Sales');
    expect(salesBreakdown).toBeDefined();
    expect(salesBreakdown!.details).toHaveProperty('percentage');
  });

  it('handles single-row category — total and average only, no trend/anomaly', () => {
    const stats = computeStats(fixture.singleRow);

    const totals = stats.filter((s) => s.statType === StatType.Total);
    expect(totals.length).toBeGreaterThanOrEqual(1);

    const trends = stats.filter((s) => s.statType === StatType.Trend);
    expect(trends).toHaveLength(0);

    const anomalies = stats.filter((s) => s.statType === StatType.Anomaly);
    expect(anomalies).toHaveLength(0);
  });

  it('skips rows with unparseable amounts', () => {
    const stats = computeStats(fixture.withNaN);

    const salesTotal = stats.find(
      (s) =>
        s.statType === StatType.Total &&
        s.category === 'Sales' &&
        s.details.scope === 'category',
    );
    expect(salesTotal?.value).toBe(100);
  });

  it('handles negative amounts correctly', () => {
    const stats = computeStats(fixture.negativeAmounts);

    const total = stats.find(
      (s) =>
        s.statType === StatType.Total &&
        s.category === 'Expenses' &&
        s.details.scope === 'category',
    );
    expect(total?.value).toBe(-650);

    const avg = stats.find(
      (s) =>
        s.statType === StatType.Average &&
        s.category === 'Expenses' &&
        s.details.scope === 'category',
    );
    expect(avg?.value).toBeCloseTo(-216.67, 1);
  });

  it('handles all-same-amount data — no anomalies, flat trend', () => {
    const stats = computeStats(fixture.allSameAmount);

    const anomalies = stats.filter((s) => s.statType === StatType.Anomaly);
    expect(anomalies).toHaveLength(0);

    const trend = stats.find(
      (s) => s.statType === StatType.Trend && s.category === 'Fees',
    );
    if (trend && trend.statType === StatType.Trend) {
      expect(trend.details.slope).toBeCloseTo(0, 5);
    }
  });

  it('never leaks DataRow fields into ComputedStat output', () => {
    const stats = computeStats(fixture.multiCategory);

    for (const stat of stats) {
      const keys = Object.keys(stat);
      expect(keys).not.toContain('orgId');
      expect(keys).not.toContain('datasetId');
      expect(keys).not.toContain('id');
      expect(keys).not.toContain('label');
      expect(keys).not.toContain('metadata');

      const detailKeys = Object.keys(stat.details);
      expect(detailKeys).not.toContain('orgId');
      expect(detailKeys).not.toContain('datasetId');
      expect(detailKeys).not.toContain('rows');
    }
  });

  it('respects trendMinPoints option — suppresses trends below threshold', () => {
    const stats = computeStats(fixture.multiCategory, { trendMinPoints: 5 });
    const trends = stats.filter((s) => s.statType === StatType.Trend);

    // multiCategory has 4 rows per category — below threshold of 5
    expect(trends).toHaveLength(0);
  });

  it('uses absolute values for category breakdown percentages with negative amounts', () => {
    const stats = computeStats(fixture.negativeAmounts);
    const breakdowns = stats.filter(
      (s) => s.statType === StatType.CategoryBreakdown,
    );

    for (const bd of breakdowns) {
      const pct = bd.details.percentage as number;
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });
});
