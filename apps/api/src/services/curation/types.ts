import { z } from 'zod';

export const StatType = {
  Total: 'total',
  Average: 'average',
  Trend: 'trend',
  Anomaly: 'anomaly',
  CategoryBreakdown: 'category_breakdown',
} as const;

export type StatType = (typeof StatType)[keyof typeof StatType];

// typed detail shapes per stat — the contract between computation and scoring layers

export interface TotalDetails {
  scope: string;
  count: number;
}

export interface AverageDetails {
  scope: string;
  median: number;
}

export interface TrendDetails {
  slope: number;
  intercept: number;
  growthPercent: number;
  dataPoints: number;
  firstValue: number;
  lastValue: number;
}

export interface AnomalyDetails {
  direction: 'above' | 'below';
  zScore: number;
  iqrBounds: { lower: number; upper: number };
  deviation: number;
}

export interface CategoryBreakdownDetails {
  percentage: number;
  absoluteTotal: number;
  transactionCount: number;
  min: number;
  max: number;
}

interface BaseComputedStat {
  category: string | null;
  value: number;
  comparison?: number;
}

export interface TotalStat extends BaseComputedStat {
  statType: 'total';
  details: TotalDetails;
}

export interface AverageStat extends BaseComputedStat {
  statType: 'average';
  details: AverageDetails;
}

export interface TrendStat extends BaseComputedStat {
  statType: 'trend';
  details: TrendDetails;
}

export interface AnomalyStat extends BaseComputedStat {
  statType: 'anomaly';
  details: AnomalyDetails;
}

export interface CategoryBreakdownStat extends BaseComputedStat {
  statType: 'category_breakdown';
  details: CategoryBreakdownDetails;
}

export type ComputedStat =
  | TotalStat
  | AverageStat
  | TrendStat
  | AnomalyStat
  | CategoryBreakdownStat;

export interface ScoredInsight {
  stat: ComputedStat;
  score: number;
  breakdown: {
    novelty: number;
    actionability: number;
    specificity: number;
  };
}

export const scoringConfigSchema = z.object({
  version: z.string(),
  topN: z.number().int().positive(),
  weights: z.object({
    novelty: z.number().min(0).max(1),
    actionability: z.number().min(0).max(1),
    specificity: z.number().min(0).max(1),
  }).refine(
    (w) => Math.abs(w.novelty + w.actionability + w.specificity - 1.0) < 0.001,
    { message: 'Weights must sum to 1.0' },
  ),
  thresholds: z.object({
    anomalyZScore: z.number().positive(),
    trendMinDataPoints: z.number().int().min(2),
    significantChangePercent: z.number().positive(),
  }),
});

export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

export const transparencyMetadataSchema = z.object({
  statTypes: z.array(z.string()),
  categoryCount: z.number(),
  insightCount: z.number(),
  scoringWeights: z.object({
    novelty: z.number(),
    actionability: z.number(),
    specificity: z.number(),
  }),
  promptVersion: z.string(),
  generatedAt: z.string(),
});

export type TransparencyMetadata = z.infer<typeof transparencyMetadataSchema>;

export interface AssembledContext {
  prompt: string;
  metadata: TransparencyMetadata;
}
