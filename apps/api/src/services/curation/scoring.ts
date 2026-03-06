import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppError } from '../../lib/appError.js';
import type { ComputedStat, ScoredInsight, ScoringConfig } from './types.js';
import { StatType, scoringConfigSchema } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadConfig(): ScoringConfig {
  const configPath = resolve(__dirname, 'config', 'scoring-weights.json');
  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch (err) {
    throw new AppError(
      'Scoring config missing: scoring-weights.json',
      'CONFIG_ERROR',
      500,
      err,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError(
      'Scoring config is not valid JSON',
      'CONFIG_ERROR',
      500,
    );
  }

  const result = scoringConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError(
      'Scoring config validation failed',
      'CONFIG_ERROR',
      500,
      result.error.issues,
    );
  }

  return result.data;
}

export const scoringConfig = loadConfig();

function noveltyScore(stat: ComputedStat): number {
  switch (stat.statType) {
    case StatType.Anomaly:
      return 0.9;
    case StatType.Trend:
      return Math.abs(stat.details.growthPercent) > scoringConfig.thresholds.significantChangePercent ? 0.8 : 0.4;
    case StatType.CategoryBreakdown:
      return 0.3;
    case StatType.Average:
      return 0.2;
    case StatType.Total:
      return 0.1;
  }
}

function actionabilityScore(stat: ComputedStat): number {
  switch (stat.statType) {
    case StatType.Anomaly:
      return Math.abs(stat.details.zScore) >= scoringConfig.thresholds.anomalyZScore ? 0.9 : 0.5;
    case StatType.Trend:
      return Math.abs(stat.details.growthPercent) > scoringConfig.thresholds.significantChangePercent ? 0.85 : 0.3;
    case StatType.CategoryBreakdown:
      return 0.5;
    case StatType.Average:
      return 0.3;
    case StatType.Total:
      return 0.2;
  }
}

function specificityScore(stat: ComputedStat): number {
  if (stat.category !== null) {
    return stat.statType === StatType.Anomaly ? 0.95 : 0.7;
  }
  return 0.2;
}

export function scoreInsights(stats: ComputedStat[]): ScoredInsight[] {
  if (stats.length === 0) return [];

  const scored: ScoredInsight[] = stats.map((stat) => {
    const nov = noveltyScore(stat);
    const act = actionabilityScore(stat);
    const spec = specificityScore(stat);

    const score =
      nov * scoringConfig.weights.novelty +
      act * scoringConfig.weights.actionability +
      spec * scoringConfig.weights.specificity;

    return {
      stat,
      score,
      breakdown: { novelty: nov, actionability: act, specificity: spec },
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, scoringConfig.topN);
}
