import { and, eq, gt } from 'drizzle-orm';

import type { SubscriptionTier } from 'shared/types';

import { db } from '../../lib/db.js';
import { subscriptions } from '../schema.js';

export type { SubscriptionTier };

export async function getActiveTier(orgId: number): Promise<SubscriptionTier> {
  try {
    const result = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.orgId, orgId),
          eq(subscriptions.status, 'active'),
          gt(subscriptions.currentPeriodEnd, new Date()),
        ),
      )
      .limit(1);
    return result.length > 0 ? 'pro' : 'free';
  } catch {
    // table may not exist yet pre-Epic 5 — all users are free
    return 'free';
  }
}
