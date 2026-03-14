import { Router } from 'express';
import type { Response } from 'express';
import { ANALYTICS_EVENTS } from 'shared/constants';

import type { SubscriptionTier } from 'shared/types';

import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { subscriptionGate, type TieredRequest } from '../middleware/subscriptionGate.js';
import { rateLimitAi } from '../middleware/rateLimiter.js';
import { aiSummariesQueries } from '../db/queries/index.js';
import { trackEvent } from '../services/analytics/trackEvent.js';
import { streamToSSE } from '../services/aiInterpretation/streamHandler.js';
import { ValidationError } from '../lib/appError.js';
import { logger } from '../lib/logger.js';

const aiSummaryRouter = Router();

aiSummaryRouter.get('/:datasetId', subscriptionGate, async (req, res: Response) => {
  const authedReq = req as AuthenticatedRequest;
  const orgId = authedReq.user.org_id;
  const userId = Number(authedReq.user.sub);
  const rawId = Number(req.params.datasetId);
  const tier: SubscriptionTier = (req as TieredRequest).subscriptionTier ?? 'free';

  if (!Number.isInteger(rawId) || rawId <= 0) {
    throw new ValidationError('Invalid datasetId');
  }

  trackEvent(orgId, userId, ANALYTICS_EVENTS.AI_SUMMARY_REQUESTED, { datasetId: rawId });

  const cached = await aiSummariesQueries.getCachedSummary(orgId, rawId);
  if (cached) {
    logger.info({ orgId, datasetId: rawId }, 'AI summary cache hit');
    res.json({
      data: {
        content: cached.content,
        metadata: cached.transparencyMetadata,
        fromCache: true,
      },
    });
    return;
  }

  // rate limit only on fresh generation
  await new Promise<void>((resolve, reject) => {
    rateLimitAi(req, res, (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // if rateLimitAi already sent a 429, stop
  if (res.headersSent) return;

  const ok = await streamToSSE(req, res, orgId, rawId, tier);

  if (ok) {
    trackEvent(orgId, userId, ANALYTICS_EVENTS.AI_SUMMARY_COMPLETED, { datasetId: rawId });
  }
});

export { aiSummaryRouter };
