import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

const mockUpsertSubscription = vi.fn();
const mockUpdateSubscriptionPeriod = vi.fn();
const mockUpdateSubscriptionStatus = vi.fn();
const mockGetOrgOwnerId = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock('../../db/queries/index.js', () => ({
  subscriptionsQueries: {
    upsertSubscription: mockUpsertSubscription,
    updateSubscriptionPeriod: mockUpdateSubscriptionPeriod,
    updateSubscriptionStatus: mockUpdateSubscriptionStatus,
  },
  userOrgsQueries: {
    getOrgOwnerId: mockGetOrgOwnerId,
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

function fakeSubscriptionUpdatedEvent(overrides = {}): Stripe.Event {
  return {
    id: 'evt_sub_update_123',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_test_789',
        customer: 'cus_test_456',
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: 1735689600, // 2025-01-01T00:00:00Z
        metadata: { orgId: '10' },
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

  describe('customer.subscription.updated', () => {
    it('updates period dates on renewal', async () => {
      await handleWebhookEvent(fakeSubscriptionUpdatedEvent());

      expect(mockUpdateSubscriptionPeriod).toHaveBeenCalledWith(
        'sub_test_789',
        new Date(1735689600 * 1000),
      );
    });

    it('marks subscription as canceled when cancel_at_period_end is true', async () => {
      mockGetOrgOwnerId.mockResolvedValueOnce(1);

      await handleWebhookEvent(fakeSubscriptionUpdatedEvent({
        cancel_at_period_end: true,
      }));

      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith(
        'sub_test_789',
        'canceled',
        new Date(1735689600 * 1000),
      );
    });

    it('fires subscription.cancelled analytics event on cancellation', async () => {
      mockGetOrgOwnerId.mockResolvedValueOnce(1);

      await handleWebhookEvent(fakeSubscriptionUpdatedEvent({
        cancel_at_period_end: true,
      }));

      expect(mockGetOrgOwnerId).toHaveBeenCalledWith(10);
      expect(mockTrackEvent).toHaveBeenCalledWith(
        10,
        1,
        'subscription.cancelled',
        { stripeSubscriptionId: 'sub_test_789' },
      );
    });

    it('reverts status to active on reactivation (cancel_at_period_end false)', async () => {
      await handleWebhookEvent(fakeSubscriptionUpdatedEvent({
        cancel_at_period_end: false,
        status: 'active',
      }));

      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledWith(
        'sub_test_789',
        'active',
        new Date(1735689600 * 1000),
      );
    });

    it('skips past_due status — deferred to Story 5.4', async () => {
      await handleWebhookEvent(fakeSubscriptionUpdatedEvent({
        status: 'past_due',
      }));

      expect(mockUpdateSubscriptionPeriod).not.toHaveBeenCalled();
      expect(mockUpdateSubscriptionStatus).not.toHaveBeenCalled();
    });

    it('is idempotent — duplicate cancellation webhook is a no-op', async () => {
      mockGetOrgOwnerId.mockResolvedValue(1);

      const event = fakeSubscriptionUpdatedEvent({ cancel_at_period_end: true });
      await handleWebhookEvent(event);
      await handleWebhookEvent(event);

      // updateSubscriptionStatus is idempotent at DB level (WHERE status != target)
      // but the handler calls it both times — DB-layer idempotency handles it
      expect(mockUpdateSubscriptionStatus).toHaveBeenCalledTimes(2);
    });

    it('handles missing orgId metadata gracefully', async () => {
      await handleWebhookEvent(fakeSubscriptionUpdatedEvent({
        metadata: {},
      }));

      expect(mockUpdateSubscriptionPeriod).not.toHaveBeenCalled();
      expect(mockUpdateSubscriptionStatus).not.toHaveBeenCalled();
      expect(mockTrackEvent).not.toHaveBeenCalled();
    });

    it('skips analytics event when org owner lookup fails', async () => {
      mockGetOrgOwnerId.mockResolvedValueOnce(null);

      await handleWebhookEvent(fakeSubscriptionUpdatedEvent({
        cancel_at_period_end: true,
      }));

      expect(mockUpdateSubscriptionStatus).toHaveBeenCalled();
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
