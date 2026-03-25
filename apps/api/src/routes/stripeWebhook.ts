import { Router, type Request, type Response } from 'express';
import express from 'express';

import { env } from '../config.js';
import { getStripe, handleWebhookEvent } from '../services/subscription/index.js';
import { logger } from '../lib/logger.js';

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      res.status(400).json({ error: { code: 'MISSING_SIGNATURE', message: 'Missing stripe-signature header' } });
      return;
    }

    let event;
    try {
      event = getStripe().webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      logger.warn({ err }, 'Stripe webhook signature verification failed');
      res.status(400).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
      return;
    }

    await handleWebhookEvent(event);
    res.json({ received: true });
  },
);
