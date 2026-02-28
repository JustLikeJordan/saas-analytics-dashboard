export interface ColumnValidationError {
  column: string;
  message: string;
  row?: number;
}

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

export interface PreviewData {
  headers: string[];
  sampleRows: ParsedRow[];
  rowCount: number;
  validRowCount: number;
  skippedRowCount: number;
  columnTypes: Record<string, 'date' | 'number' | 'text'>;
  warnings: string[];
  fileName: string;
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
