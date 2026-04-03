import { Router } from 'express';
import type { Response } from 'express';
import { ANALYTICS_EVENTS } from 'shared/constants';

import type { SubscriptionTier } from 'shared/types';

import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { subscriptionGate, type TieredRequest } from '../middleware/subscriptionGate.js';
import { rateLimitAi } from '../middleware/rateLimiter.js';
import { aiSummariesQueries } from '../db/queries/index.js';
import { dbAdmin } from '../lib/db.js';
import { trackEvent } from '../services/analytics/trackEvent.js';
import { streamToSSE } from '../services/aiInterpretation/streamHandler.js';
import { withRlsContext } from '../lib/rls.js';
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

  const cached = await withRlsContext(orgId, authedReq.user.isAdmin, (tx) =>
    aiSummariesQueries.getCachedSummary(orgId, rawId, tx),
  );
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

  await new Promise<void>((resolve, reject) => {
    rateLimitAi(req, res, (err?: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });

  if (res.headersSent) return;

  // streaming runs outside the RLS transaction (holding a tx for 3-15s would starve the pool).
  // dbAdmin bypasses RLS — safe because the route is auth-gated and orgId comes from the JWT.
  const ok = await streamToSSE(req, res, orgId, rawId, tier, dbAdmin);

  if (ok) {
    trackEvent(orgId, userId, ANALYTICS_EVENTS.AI_SUMMARY_COMPLETED, { datasetId: rawId });
  }
});

export { aiSummaryRouter };
