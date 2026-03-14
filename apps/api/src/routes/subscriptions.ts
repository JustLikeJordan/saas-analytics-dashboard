import { Router, type Response } from 'express';

import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { subscriptionsQueries } from '../db/queries/index.js';

export const subscriptionsRouter = Router();

subscriptionsRouter.get('/tier', async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;
  const tier = await subscriptionsQueries.getActiveTier(user.org_id);
  res.json({ data: { tier } });
});
