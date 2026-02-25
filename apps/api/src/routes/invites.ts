import { Router } from 'express';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { roleGuard } from '../middleware/roleGuard.js';
import { generateInvite, validateInviteToken, getActiveInvitesForOrg } from '../services/auth/index.js';
import { env } from '../config.js';
import { createInviteSchema, inviteTokenParamSchema } from 'shared/schemas';
import { ValidationError } from '../lib/appError.js';

export const inviteRouter = Router();

// GET /invites — owner-only, lists active (unexpired, unused) invites
inviteRouter.get('/', roleGuard('owner'), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const invites = await getActiveInvitesForOrg(user.org_id);

  res.json({ data: invites });
});

// POST /invites — owner-only, creates a new invite link
inviteRouter.post('/', roleGuard('owner'), async (req, res: Response) => {
  const { user } = req as AuthenticatedRequest;

  const parsed = createInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid invite parameters', parsed.error.format());
  }

  const { token, expiresAt } = await generateInvite(
    user.org_id,
    parseInt(user.sub, 10),
    parsed.data.expiresInDays,
  );

  const url = `${env.APP_URL}/invite/${token}`;

  res.status(201).json({
    data: { url, token, expiresAt },
  });
});

// public router — no auth required
export const publicInviteRouter = Router();

// GET /invites/:token — validates an invite (anyone can check)
publicInviteRouter.get('/invites/:token', async (req, res: Response) => {
  const parsed = inviteTokenParamSchema.safeParse(req.params);
  if (!parsed.success) {
    throw new ValidationError('Invalid invite token');
  }

  const invite = await validateInviteToken(parsed.data.token);

  res.json({
    data: {
      orgName: invite.org.name,
      expiresAt: invite.expiresAt,
    },
  });
});
