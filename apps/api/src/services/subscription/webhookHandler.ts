import type Stripe from 'stripe';

import { ANALYTICS_EVENTS } from 'shared/constants';
import { subscriptionsQueries, userOrgsQueries } from '../../db/queries/index.js';
import { trackEvent } from '../analytics/trackEvent.js';
import { logger } from '../../lib/logger.js';

// Stripe SDK v20 moved current_period_end to SubscriptionItem,
// but the webhook event payload still includes it at the subscription level
type SubscriptionWebhookPayload = Stripe.Subscription & {
  current_period_end: number;
};

export async function handleWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as SubscriptionWebhookPayload);
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

async function handleSubscriptionUpdated(subscription: SubscriptionWebhookPayload) {
  const stripeSubscriptionId = subscription.id;
  const orgId = Number(subscription.metadata?.orgId);
  const cancelAtPeriodEnd = subscription.cancel_at_period_end;
  const currentPeriodEnd = new Date(subscription.current_period_end * 1000);

  if (!orgId) {
    logger.error({ subscriptionId: stripeSubscriptionId }, 'Missing orgId metadata in subscription.updated');
    return;
  }

  if (subscription.status === 'past_due') {
    logger.info({ orgId, stripeSubscriptionId }, 'Subscription past_due — deferred to Story 5.4');
    return;
  }

  // always keep period dates fresh regardless of cancellation state
  const rowsUpdated = await subscriptionsQueries.updateSubscriptionPeriod(stripeSubscriptionId, currentPeriodEnd);
  if (rowsUpdated === 0) {
    logger.warn({ orgId, stripeSubscriptionId }, 'subscription.updated received but no matching subscription row — possible out-of-order webhook');
  }

  if (cancelAtPeriodEnd) {
    await subscriptionsQueries.updateSubscriptionStatus(stripeSubscriptionId, 'canceled', currentPeriodEnd);

    const ownerId = await userOrgsQueries.getOrgOwnerId(orgId);
    if (ownerId) {
      trackEvent(orgId, ownerId, ANALYTICS_EVENTS.SUBSCRIPTION_CANCELLED, { stripeSubscriptionId });
    } else {
      logger.warn({ orgId, stripeSubscriptionId }, 'No org owner found — skipping cancellation analytics');
    }

    logger.info({ orgId, stripeSubscriptionId, cancelAtPeriodEnd }, 'Subscription canceled');
  } else if (subscription.status === 'active') {
    // user reactivated before period ended
    await subscriptionsQueries.updateSubscriptionStatus(stripeSubscriptionId, 'active', currentPeriodEnd);
    logger.info({ orgId, stripeSubscriptionId }, 'Subscription reactivated');
  }
}
