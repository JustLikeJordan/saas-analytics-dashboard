import { z } from 'zod';

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const chartFiltersSchema = z.object({
  dateRange: dateRangeSchema.optional(),
  categories: z.array(z.string()).optional(),
});
