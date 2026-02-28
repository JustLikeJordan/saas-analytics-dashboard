import { z } from 'zod';

export const revenueTrendPointSchema = z.object({
  month: z.string(),
  revenue: z.number(),
});

export const expenseBreakdownItemSchema = z.object({
  category: z.string(),
  total: z.number(),
});

export const chartDataSchema = z.object({
  revenueTrend: z.array(revenueTrendPointSchema),
  expenseBreakdown: z.array(expenseBreakdownItemSchema),
  orgName: z.string(),
  isDemo: z.boolean(),
});
