import type { z } from 'zod';
import type {
  sourceTypeSchema,
  demoModeStateSchema,
  datasetSchema,
  dataRowSchema,
  columnValidationErrorSchema,
  csvPreviewDataSchema,
  csvValidationErrorSchema,
} from '../schemas/datasets.js';

export type SourceType = z.infer<typeof sourceTypeSchema>;
export type DemoModeState = z.infer<typeof demoModeStateSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type DataRow = z.infer<typeof dataRowSchema>;
export type ColumnValidationError = z.infer<typeof columnValidationErrorSchema>;
export type CsvPreviewData = z.infer<typeof csvPreviewDataSchema>;
export type CsvValidationError = z.infer<typeof csvValidationErrorSchema>;
