import type { z } from 'zod';
import type {
  sourceTypeSchema,
  demoModeStateSchema,
  datasetSchema,
  dataRowSchema,
} from '../schemas/datasets.js';

export type SourceType = z.infer<typeof sourceTypeSchema>;
export type DemoModeState = z.infer<typeof demoModeStateSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type DataRow = z.infer<typeof dataRowSchema>;
