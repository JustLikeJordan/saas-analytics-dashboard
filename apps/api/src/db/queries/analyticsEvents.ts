import { eq, desc, and, gte, lte, count, type SQL } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { analyticsEvents, orgs, users } from '../schema.js';
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

// Cross-org queries — no orgId required. Gated by roleGuard('admin') at route layer.

export interface AdminEventsFilter {
  eventName?: string;
  orgId?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

function buildFilterConditions(opts: AdminEventsFilter): SQL | undefined {
  const conditions: SQL[] = [];

  if (opts.eventName) conditions.push(eq(analyticsEvents.eventName, opts.eventName));
  if (opts.orgId) conditions.push(eq(analyticsEvents.orgId, opts.orgId));
  if (opts.startDate) conditions.push(gte(analyticsEvents.createdAt, opts.startDate));
  if (opts.endDate) conditions.push(lte(analyticsEvents.createdAt, opts.endDate));

  return conditions.length ? and(...conditions) : undefined;
}

export async function getAllAnalyticsEvents(opts: AdminEventsFilter) {
  const { limit = 50, offset = 0 } = opts;
  const where = buildFilterConditions(opts);

  return db
    .select({
      id: analyticsEvents.id,
      eventName: analyticsEvents.eventName,
      orgName: orgs.name,
      userEmail: users.email,
      userName: users.name,
      metadata: analyticsEvents.metadata,
      createdAt: analyticsEvents.createdAt,
    })
    .from(analyticsEvents)
    .innerJoin(orgs, eq(orgs.id, analyticsEvents.orgId))
    .innerJoin(users, eq(users.id, analyticsEvents.userId))
    .where(where)
    .orderBy(desc(analyticsEvents.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getAnalyticsEventsTotal(opts: AdminEventsFilter) {
  const where = buildFilterConditions(opts);

  const [row] = await db
    .select({ value: count() })
    .from(analyticsEvents)
    .where(where);

  return row?.value ?? 0;
}
