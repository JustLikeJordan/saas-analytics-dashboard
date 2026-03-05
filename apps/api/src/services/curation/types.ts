import { z } from 'zod';

export const StatType = {
  Total: 'total',
  Average: 'average',
  Trend: 'trend',
  Anomaly: 'anomaly',
  CategoryBreakdown: 'category_breakdown',
} as const;

export type StatType = (typeof StatType)[keyof typeof StatType];

export interface ComputedStat {
  statType: StatType;
  category: string | null;
  value: number;
  comparison?: number;
  details: Record<string, unknown>;
}

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
