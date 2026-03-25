import type Stripe from 'stripe';

import { ANALYTICS_EVENTS } from 'shared/constants';
import { subscriptionsQueries } from '../../db/queries/index.js';
import { trackEvent } from '../analytics/trackEvent.js';
import { logger } from '../../lib/logger.js';

export async function handleWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    default:
      logger.info({ eventType: event.type }, 'Unhandled Stripe webhook event');
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const orgId = Number(session.metadata?.orgId);
  const userId = Number(session.metadata?.userId);

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id ?? null;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id ?? null;

  if (!orgId || !userId || !customerId || !subscriptionId) {
    logger.error({ sessionId: session.id, metadata: session.metadata, customerId, subscriptionId }, 'Missing required fields in checkout session');
    return;
  }

  await subscriptionsQueries.upsertSubscription({
    orgId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    status: 'active',
    plan: 'pro',
    currentPeriodEnd: null, // populated by subscription.updated webhook in Story 5.2
  });

  trackEvent(orgId, userId, ANALYTICS_EVENTS.SUBSCRIPTION_UPGRADED, {
    stripeSessionId: session.id,
  });

  logger.info({ orgId, userId, sessionId: session.id }, 'Checkout completed — org upgraded to Pro');
}
