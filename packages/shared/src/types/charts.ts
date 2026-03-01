import type { z } from 'zod';
import type {
  revenueTrendPointSchema,
  expenseBreakdownItemSchema,
  chartDataSchema,
} from '../schemas/charts.js';

export type RevenueTrendPoint = z.infer<typeof revenueTrendPointSchema>;
export type ExpenseBreakdownItem = z.infer<typeof expenseBreakdownItemSchema>;
export type ChartData = z.infer<typeof chartDataSchema>;
