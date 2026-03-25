import { and, eq, gt, isNull, or } from 'drizzle-orm';

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
          // null currentPeriodEnd = just-completed checkout (period populated by subscription.updated webhook)
          or(gt(subscriptions.currentPeriodEnd, new Date()), isNull(subscriptions.currentPeriodEnd)),
        ),
      )
      .limit(1);
    return result.length > 0 ? 'pro' : 'free';
  } catch {
    // table may not exist yet pre-Epic 5 — all users are free
    return 'free';
  }
}

interface UpsertSubscriptionParams {
  orgId: number;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: string;
  plan: string;
  currentPeriodEnd: Date | null;
}

export async function upsertSubscription(params: UpsertSubscriptionParams) {
  const [result] = await db
    .insert(subscriptions)
    .values({
      orgId: params.orgId,
      stripeCustomerId: params.stripeCustomerId,
      stripeSubscriptionId: params.stripeSubscriptionId,
      status: params.status,
      plan: params.plan,
      currentPeriodEnd: params.currentPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.orgId,
      set: {
        stripeCustomerId: params.stripeCustomerId,
        stripeSubscriptionId: params.stripeSubscriptionId,
        status: params.status,
        plan: params.plan,
        currentPeriodEnd: params.currentPeriodEnd,
        updatedAt: new Date(),
      },
    })
    .returning();
  return result;
}

export async function getSubscriptionByOrgId(orgId: number) {
  const result = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .limit(1);
  return result[0] ?? null;
}
