import { Router } from 'express';
import type { Request, Response } from 'express';
import { AUTH, ANALYTICS_EVENTS } from 'shared/constants';
import { verifyAccessToken } from '../services/auth/tokenService.js';
import { chartsQueries, orgsQueries } from '../db/queries/index.js';
import { trackEvent } from '../services/analytics/trackEvent.js';
import { logger } from '../lib/logger.js';

const dashboardRouter = Router();

// public — unauthenticated visitors get seed org
dashboardRouter.get('/dashboard/charts', async (req: Request, res: Response) => {
  let orgId: number;
  let orgName: string;
  let isDemo = true;
  let authedUser: { userId: number; orgId: number } | null = null;

  const token = req.cookies?.[AUTH.COOKIE_NAMES.ACCESS_TOKEN];

  if (token) {
    try {
      const payload = await verifyAccessToken(token);
      orgId = payload.org_id;
      authedUser = { userId: Number(payload.sub), orgId: payload.org_id };

      const org = await orgsQueries.findOrgById(orgId);
      orgName = org?.name ?? 'Your Organization';
      isDemo = false;
    } catch {
      // expired or invalid token — fall through to seed org
      orgId = await orgsQueries.getSeedOrgId();
      orgName = 'Sunrise Cafe';
    }
  } else {
    orgId = await orgsQueries.getSeedOrgId();
    orgName = 'Sunrise Cafe';
  }

  const chartData = await chartsQueries.getChartData(orgId);

  if (authedUser) {
    trackEvent(authedUser.orgId, authedUser.userId, ANALYTICS_EVENTS.DASHBOARD_VIEWED, {
      isDemo,
      chartCount: chartData.revenueTrend.length + chartData.expenseBreakdown.length,
    });
  }

  logger.info({ orgId, isDemo }, 'Dashboard charts served');

  res.json({
    data: {
      ...chartData,
      orgName,
      isDemo,
    },
  });
});

export default dashboardRouter;
