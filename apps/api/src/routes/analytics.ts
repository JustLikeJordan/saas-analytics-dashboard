import { Router } from 'express';

import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { trackEvent } from '../services/analytics/trackEvent.js';
import type { AnalyticsEventName } from 'shared/constants';

const analyticsRouter = Router();

analyticsRouter.post('/events', (req, res) => {
  const authedReq = req as AuthenticatedRequest;
  const orgId = authedReq.user.org_id;
  const userId = Number(authedReq.user.sub);
  const { eventName, metadata } = req.body as {
    eventName: string;
    metadata?: Record<string, unknown>;
  };

  if (!eventName || typeof eventName !== 'string') {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'eventName is required' } });
    return;
  }

  trackEvent(orgId, userId, eventName as AnalyticsEventName, metadata);
  res.json({ data: { ok: true } });
});

export { analyticsRouter };
