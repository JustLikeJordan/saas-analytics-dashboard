import type { AnalyticsEventName } from 'shared/constants';
import { logger } from '../../lib/logger.js';
import { analyticsEventsQueries } from '../../db/queries/index.js';

/**
 * Fire-and-forget event tracker. Logs errors but never throws —
 * analytics failures must not block user-facing operations.
 */
export function trackEvent(
  orgId: number,
  userId: number,
  eventName: AnalyticsEventName,
  metadata?: Record<string, unknown>,
): void {
  analyticsEventsQueries
    .recordEvent(orgId, userId, eventName, metadata)
    .catch((err) => {
      logger.error({ err, orgId, userId, eventName }, 'Failed to record analytics event');
    });
}
