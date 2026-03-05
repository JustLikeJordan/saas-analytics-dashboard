import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB query layer — orchestrator calls it
vi.mock('../../db/queries/index.js', () => ({
  dataRowsQueries: {
    getRowsByDataset: vi.fn(),
  },
}));

// Mock logger to avoid config.ts env validation
vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Mock readFileSync for scoring config
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() =>
    JSON.stringify({
      version: '1.0',
      topN: 8,
      weights: { novelty: 0.35, actionability: 0.40, specificity: 0.25 },
      thresholds: { anomalyZScore: 2.0, trendMinDataPoints: 3, significantChangePercent: 10 },
    }),
  ),
}));

import { dataRowsQueries } from '../../db/queries/index.js';
import { runCurationPipeline } from './index.js';

const fixtureRows = [
  { id: 1, orgId: 1, datasetId: 1, sourceType: 'csv', category: 'Sales', parentCategory: null, date: new Date('2026-01-01'), amount: '1000.00', label: 'A', metadata: null, createdAt: new Date() },
  { id: 2, orgId: 1, datasetId: 1, sourceType: 'csv', category: 'Sales', parentCategory: null, date: new Date('2026-02-01'), amount: '1500.00', label: 'B', metadata: null, createdAt: new Date() },
  { id: 3, orgId: 1, datasetId: 1, sourceType: 'csv', category: 'Sales', parentCategory: null, date: new Date('2026-03-01'), amount: '2000.00', label: 'C', metadata: null, createdAt: new Date() },
  { id: 4, orgId: 1, datasetId: 1, sourceType: 'csv', category: 'Marketing', parentCategory: null, date: new Date('2026-01-01'), amount: '500.00', label: 'D', metadata: null, createdAt: new Date() },
  { id: 5, orgId: 1, datasetId: 1, sourceType: 'csv', category: 'Marketing', parentCategory: null, date: new Date('2026-02-01'), amount: '600.00', label: 'E', metadata: null, createdAt: new Date() },
  { id: 6, orgId: 1, datasetId: 1, sourceType: 'csv', category: 'Marketing', parentCategory: null, date: new Date('2026-03-01'), amount: '550.00', label: 'F', metadata: null, createdAt: new Date() },
];

describe('runCurationPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('orchestrates computation → scoring end-to-end', async () => {
    vi.mocked(dataRowsQueries.getRowsByDataset).mockResolvedValue(fixtureRows as any);

    const insights = await runCurationPipeline(1, 1);

    expect(dataRowsQueries.getRowsByDataset).toHaveBeenCalledWith(1, 1);
    expect(insights.length).toBeGreaterThan(0);
    expect(insights.length).toBeLessThanOrEqual(8);

    for (const insight of insights) {
      expect(insight).toHaveProperty('stat');
      expect(insight).toHaveProperty('score');
      expect(insight).toHaveProperty('breakdown');
      expect(insight.stat).toHaveProperty('statType');
      expect(insight.stat).toHaveProperty('value');
    }
  });

  it('returns sorted by score descending', async () => {
    vi.mocked(dataRowsQueries.getRowsByDataset).mockResolvedValue(fixtureRows as any);

    const insights = await runCurationPipeline(1, 1);

    for (let i = 1; i < insights.length; i++) {
      expect(insights[i - 1]!.score).toBeGreaterThanOrEqual(insights[i]!.score);
    }
  });

  it('returns empty array for empty dataset', async () => {
    vi.mocked(dataRowsQueries.getRowsByDataset).mockResolvedValue([]);

    const insights = await runCurationPipeline(1, 1);
    expect(insights).toEqual([]);
  });

  it('never leaks DataRow references into output', async () => {
    vi.mocked(dataRowsQueries.getRowsByDataset).mockResolvedValue(fixtureRows as any);

    const insights = await runCurationPipeline(1, 1);

    for (const insight of insights) {
      const statKeys = Object.keys(insight.stat);
      expect(statKeys).not.toContain('orgId');
      expect(statKeys).not.toContain('datasetId');
      expect(statKeys).not.toContain('id');
      expect(statKeys).not.toContain('label');
      expect(statKeys).not.toContain('metadata');
    }
  });
});
