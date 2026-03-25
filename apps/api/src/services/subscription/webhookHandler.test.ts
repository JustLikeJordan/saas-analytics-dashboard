import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

const mockUpsertSubscription = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock('../../db/queries/index.js', () => ({
  subscriptionsQueries: {
    upsertSubscription: mockUpsertSubscription,
  },
}));

vi.mock('../analytics/trackEvent.js', () => ({
  trackEvent: mockTrackEvent,
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { handleWebhookEvent } = await import('./webhookHandler.js');

function fakeCheckoutEvent(overrides = {}): Stripe.Event {
  return {
    id: 'evt_test_123',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_123',
        customer: 'cus_test_456',
        subscription: 'sub_test_789',
        metadata: { orgId: '10', userId: '1' },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

describe('webhookHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkout.session.completed', () => {
    it('upserts subscription and fires analytics event', async () => {
      mockUpsertSubscription.mockResolvedValueOnce({ id: 1 });

      await handleWebhookEvent(fakeCheckoutEvent());

      expect(mockUpsertSubscription).toHaveBeenCalledWith({
        orgId: 10,
        stripeCustomerId: 'cus_test_456',
        stripeSubscriptionId: 'sub_test_789',
        status: 'active',
        plan: 'pro',
        currentPeriodEnd: null,
      });

      expect(mockTrackEvent).toHaveBeenCalledWith(
        10,
        1,
        'subscription.upgraded',
        { stripeSessionId: 'cs_test_123' },
      );
    });

    it('is idempotent — calling twice does not error', async () => {
      mockUpsertSubscription.mockResolvedValue({ id: 1 });

      await handleWebhookEvent(fakeCheckoutEvent());
      await handleWebhookEvent(fakeCheckoutEvent());

      expect(mockUpsertSubscription).toHaveBeenCalledTimes(2);
    });

    it('skips processing when metadata is missing orgId', async () => {
      await handleWebhookEvent(fakeCheckoutEvent({ metadata: {} }));

      expect(mockUpsertSubscription).not.toHaveBeenCalled();
      expect(mockTrackEvent).not.toHaveBeenCalled();
    });
  });

  describe('unhandled event types', () => {
    it('logs and returns without error', async () => {
      const event = { id: 'evt_test', type: 'invoice.payment_failed', data: { object: {} } } as unknown as Stripe.Event;

      await expect(handleWebhookEvent(event)).resolves.toBeUndefined();
      expect(mockUpsertSubscription).not.toHaveBeenCalled();
    });
  });
});
