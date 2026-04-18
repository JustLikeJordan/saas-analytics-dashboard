import type { Request, Response, NextFunction } from 'express';
import { Sentry } from '../lib/sentry.js';
import { AppError, ExternalServiceError, ProgrammerError } from '../lib/appError.js';
import { logger } from '../lib/logger.js';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const log = req.log ?? logger;

  if (err instanceof AppError) {
    // ProgrammerErrors are real bugs — treat them like unhandled errors at the
    // logging + telemetry layer, but still route through the AppError branch
    // so the response shape stays consistent.
    if (err instanceof ProgrammerError) {
      Sentry.captureException(err, {
        level: 'error',
        extra: { code: err.code, devMessage: err.devMessage },
      });
      log.error({ err, devMessage: err.devMessage }, 'Programmer error');
    } else {
      // ExternalServiceErrors (Stripe down, Claude timeout) are worth tracking
      if (err instanceof ExternalServiceError) {
        Sentry.captureException(err, {
          level: 'warning',
          extra: { code: err.code, statusCode: err.statusCode },
        });
      }
      log.warn({ err, statusCode: err.statusCode }, err.message);
    }

    const safeDetails = err instanceof ExternalServiceError ? undefined : err.details;

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(safeDetails !== undefined && { details: safeDetails }),
      },
    });
    return;
  }

  // unhandled errors — these are real bugs
  Sentry.captureException(err);
  log.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
