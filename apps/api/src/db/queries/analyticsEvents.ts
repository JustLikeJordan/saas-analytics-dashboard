import { eq, desc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { analyticsEvents } from '../schema.js';
import type { AnalyticsEventName } from 'shared/constants';

export async function recordEvent(
  orgId: number,
  userId: number,
  eventName: AnalyticsEventName,
  metadata?: Record<string, unknown>,
) {
  const [event] = await db
    .insert(analyticsEvents)
    .values({ orgId, userId, eventName, metadata: metadata ?? null })
    .returning();
  if (!event) throw new Error('Insert failed to return analytics event');
  return event;
}

interface GetEventsOpts {
  limit?: number;
  offset?: number;
}

export async function getEventsByOrg(orgId: number, opts: GetEventsOpts = {}) {
  const { limit = 50, offset = 0 } = opts;

  return db.query.analyticsEvents.findMany({
    where: eq(analyticsEvents.orgId, orgId),
    orderBy: desc(analyticsEvents.createdAt),
    limit,
    offset,
  });
}
