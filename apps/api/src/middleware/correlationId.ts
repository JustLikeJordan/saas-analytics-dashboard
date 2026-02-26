import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
      log: typeof logger;
    }
  }
}

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function correlationId(req: Request, res: Response, next: NextFunction) {
  const raw = req.headers['x-correlation-id'];
  const supplied = Array.isArray(raw) ? raw[0] : raw;
  const id = typeof supplied === 'string' && UUID_PATTERN.test(supplied) ? supplied : randomUUID();
  req.correlationId = id;
  req.log = logger.child({ correlationId: id });
  res.setHeader('x-correlation-id', id);
  next();
}
