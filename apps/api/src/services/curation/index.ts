import { logger } from '../../lib/logger.js';
import { dataRowsQueries } from '../../db/queries/index.js';
import { computeStats } from './computation.js';
import { scoreInsights } from './scoring.js';
import type { ScoredInsight } from './types.js';

export async function runCurationPipeline(
  orgId: number,
  datasetId: number,
): Promise<ScoredInsight[]> {
  const rows = await dataRowsQueries.getRowsByDataset(orgId, datasetId);

  if (rows.length === 0) {
    logger.warn({ orgId, datasetId }, 'curation pipeline got 0 rows — dataset may not exist');
    return [];
  }

  logger.info({ orgId, datasetId, rowCount: rows.length }, 'curation pipeline started');

  const stats = computeStats(rows);
  logger.info({ orgId, statCount: stats.length }, 'curation layer 1 complete');

  const insights = scoreInsights(stats);
  logger.info({ orgId, insightCount: insights.length }, 'curation layer 2 complete');

  return insights;
}

export type { ComputedStat, ScoredInsight, ScoringConfig } from './types.js';
export { StatType } from './types.js';
