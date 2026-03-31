import { Router, type Response } from 'express';
import { z } from 'zod';
import { getOrgsWithStats, getUsers, getOrgDetail, getSystemHealth } from '../services/admin/index.js';
import { ValidationError } from '../lib/appError.js';

const orgIdParam = z.coerce.number().int().positive();

function parseOrgId(raw: string): number {
  const result = orgIdParam.safeParse(raw);
  if (!result.success) throw new ValidationError('Invalid org ID');
  return result.data;
}

export const adminRouter = Router();

adminRouter.get('/orgs', async (_req, res: Response) => {
  const { orgs, stats } = await getOrgsWithStats();
  res.json({ data: orgs, meta: { total: orgs.length, stats } });
});

adminRouter.get('/users', async (_req, res: Response) => {
  const users = await getUsers();
  res.json({ data: users, meta: { total: users.length } });
});

adminRouter.get('/orgs/:orgId', async (req, res: Response) => {
  const orgId = parseOrgId(req.params.orgId);
  const org = await getOrgDetail(orgId);
  res.json({ data: org });
});

adminRouter.get('/health', async (_req, res: Response) => {
  const health = await getSystemHealth();
  res.json({ data: health });
});
