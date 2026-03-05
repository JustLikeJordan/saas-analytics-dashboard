import type {
  ColumnValidationError as SharedColumnValidationError,
  CsvPreviewData,
} from 'shared/types';

// Re-export shared types so API-internal code imports from one adapter barrel
export type ColumnValidationError = SharedColumnValidationError;
export type PreviewData = CsvPreviewData;

export interface ValidationResult {
  valid: boolean;
  errors: ColumnValidationError[];
}

export interface ParsedRow {
  [column: string]: string;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  rowCount: number;
  warnings: string[];
}

/**
 * Pluggable data source contract. CSV adapter now, financial API adapters
 * (QuickBooks, Stripe) in Growth tier. Each adapter normalizes its source
 * into the same ParseResult shape so the route handler stays generic.
 */
export interface DataSourceAdapter {
  parse(buffer: Buffer): ParseResult;
  validate(headers: string[]): ValidationResult;
}
