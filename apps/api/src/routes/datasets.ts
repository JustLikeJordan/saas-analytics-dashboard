import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { MAX_FILE_SIZE, ANALYTICS_EVENTS } from 'shared/constants';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { ValidationError } from '../lib/appError.js';
import { csvAdapter } from '../services/dataIngestion/index.js';
import { normalizeRows } from '../services/dataIngestion/normalizer.js';
import { trackEvent } from '../services/analytics/trackEvent.js';
import { logger } from '../lib/logger.js';
import type { PreviewData } from '../services/adapters/index.js';
import { normalizeHeader } from '../services/dataIngestion/csvAdapter.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const csvTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (csvTypes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new ValidationError(`We expected a .csv file, but received a ${file.mimetype} file.`));
    }
  },
});

function handleMulterError(err: unknown, _req: Request, _res: Response, next: NextFunction) {
  if (err && typeof err === 'object' && 'code' in err) {
    const multerErr = err as { code: string; message: string };
    if (multerErr.code === 'LIMIT_FILE_SIZE') {
      return next(new ValidationError('File size exceeds 10MB limit. Try splitting your data into smaller files.'));
    }
  }
  next(err);
}

function inferColumnType(value: string): 'date' | 'number' | 'text' {
  const trimmed = value.trim().replace(/,/g, '');
  if (!isNaN(Number(trimmed)) && trimmed !== '') return 'number';
  const d = new Date(trimmed);
  if (!isNaN(d.getTime()) && trimmed.length >= 8) return 'date';
  return 'text';
}

function buildColumnTypes(rows: Record<string, string>[], headers: string[]): Record<string, 'date' | 'number' | 'text'> {
  const types: Record<string, 'date' | 'number' | 'text'> = {};
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    // Sample first non-empty value to infer type
    const sample = rows.find((r) => r[header]?.trim())?.[ header] ?? '';
    types[normalized] = inferColumnType(sample);
  }
  return types;
}

export const datasetsRouter = Router();

datasetsRouter.post(
  '/',
  upload.single('file'),
  handleMulterError,
  async (req: Request, res: Response) => {
    const { user } = req as AuthenticatedRequest;
    const orgId = user.org_id;
    const userId = parseInt(user.sub, 10);

    if (!req.file) {
      throw new ValidationError('No file provided. Select a CSV file to upload.');
    }

    const fileName = req.file.originalname;
    logger.info({ orgId, userId, fileName, size: req.file.size }, 'CSV upload received');

    const parseResult = csvAdapter.parse(req.file.buffer);

    // Check for file-level issues (empty, header-only, too many rows)
    if (parseResult.rows.length === 0 && parseResult.warnings.length > 0) {
      throw new ValidationError(parseResult.warnings[0] ?? 'Validation failed', { fileName });
    }

    // Check for header validation failures
    const headerValidation = csvAdapter.validate(parseResult.headers);
    if (!headerValidation.valid) {
      throw new ValidationError('CSV validation failed', {
        errors: headerValidation.errors,
        fileName,
      });
    }

    // Check if >50% row failure caused parse to return empty rows
    if (parseResult.rows.length === 0 && parseResult.rowCount > 0) {
      throw new ValidationError(
        'More than half the rows had validation errors. Check your data format and try again.',
        { fileName },
      );
    }

    const normalizedRows = normalizeRows(parseResult.rows, parseResult.headers);
    const sampleRows = parseResult.rows.slice(0, 5);
    const columnTypes = buildColumnTypes(parseResult.rows, parseResult.headers);

    const preview: PreviewData = {
      headers: parseResult.headers.map(normalizeHeader),
      sampleRows,
      rowCount: parseResult.rowCount,
      validRowCount: parseResult.rows.length,
      skippedRowCount: parseResult.rowCount - parseResult.rows.length,
      columnTypes,
      warnings: parseResult.warnings,
      fileName,
    };

    trackEvent(orgId, userId, ANALYTICS_EVENTS.DATASET_UPLOADED, {
      rowCount: parseResult.rowCount,
      fileName,
    });

    logger.info(
      { orgId, fileName, rowCount: parseResult.rowCount, validRows: normalizedRows.length },
      'CSV validated',
    );

    res.json({ data: preview });
  },
);
