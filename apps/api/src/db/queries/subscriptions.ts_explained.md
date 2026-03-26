# subscriptions.ts (queries) — Explained

## Elevator Pitch

This is the data access layer for subscription state. Six functions that answer two questions: "what tier is this org on?" and "how do we update their subscription?" The star of the show is `getActiveTier` — a single query that handles four subscription states (active, canceled-but-paid, fresh checkout, expired) with one SQL WHERE clause. Everything else is straightforward CRUD, except the idempotency trick in `updateSubscriptionStatus`.

**How to say it in an interview:** "This module encapsulates all subscription-related database operations behind a query layer. The key function, `getActiveTier`, uses a compound WHERE clause with OR branches to determine access rights across all subscription states — including the tricky 'canceled but still within the paid period' case."

## Why This Approach

The query layer exists for encapsulation. Services never touch the `db` object directly — they call these functions. This means if the subscription table schema changes (a column rename, a new status value), only this file needs to update.

`getActiveTier` is the most interesting decision. You could store a computed `isActive` boolean on the subscription record and update it via a cron job. But that introduces a consistency window — what if the cron hasn't run yet? Instead, we compute access at query time using the current date. The source of truth is `status` + `currentPeriodEnd` + `now()`, evaluated fresh on every call.

The `upsertSubscription` function uses `ON CONFLICT DO UPDATE` on `orgId`, which means each org can have exactly one subscription row. This is a deliberate one-to-one constraint — the data model doesn't support having both a "pro" and an "enterprise" subscription on the same org simultaneously. Simpler than a subscription history table, and sufficient for a two-tier system.

## Code Walkthrough

**`getActiveTier(orgId)`** — The access gatekeeper. Returns `'pro'` or `'free'`. The WHERE clause has two OR branches:

1. **Active branch**: `status = 'active'` AND (`currentPeriodEnd > now()` OR `currentPeriodEnd IS NULL`). The null check handles the moment between checkout completion and the first `subscription.updated` webhook — there's a brief window where the period hasn't been populated yet. Without `isNull`, a freshly-upgraded user would be told they're on Free.

2. **Canceled branch**: `status = 'canceled'` AND `currentPeriodEnd IS NOT NULL` AND `currentPeriodEnd > now()`. The user canceled, but they've already paid through the period. Access continues until the date passes. The `IS NOT NULL` guard prevents a theoretical edge case where a canceled subscription somehow has no period end — in that case, we err toward denying access rather than granting it forever.

The `try/catch` returns `'free'` on any error. This handles the case where the subscriptions table doesn't exist yet (pre-migration), and also provides a safe fallback for transient database errors. Failing open to free tier is the correct default — better to give someone limited access than to crash the app.

**`upsertSubscription(params)`** — Insert-or-update using PostgreSQL's `ON CONFLICT DO UPDATE`. Conflicts on `orgId` (unique index). The `returning()` call gives back the upserted row so the caller can verify it worked.

**`updateSubscriptionPeriod(stripeSubscriptionId, currentPeriodEnd)`** — Simple date update, keyed on the Stripe subscription ID. Called on every `subscription.updated` webhook to keep period dates fresh.

**`updateSubscriptionStatus(stripeSubscriptionId, status, currentPeriodEnd?)`** — The idempotent one. Updates status and optionally the period end date. The WHERE clause includes `ne(subscriptions.status, status)` — if the subscription is already in the target status, the update matches zero rows. This means duplicate webhooks are database no-ops. No error, no side effects, no wasted writes.

The conditional spread `...(currentPeriodEnd && { currentPeriodEnd })` only includes the period end in the SET clause if it's provided. This lets callers update status alone without touching the period.

**`getSubscriptionByStripeId` / `getSubscriptionByOrgId`** — Lookup functions. One by Stripe's ID (for webhook processing), one by our org ID (for API responses). Both return the first match or null.

## Complexity and Trade-offs

**`getActiveTier` evaluated at query time**: Every API call that checks tier runs this query. That's a database round-trip per request. For a high-traffic app, you'd cache this in Redis with a short TTL and invalidate on webhook. But at MVP scale, this is the simpler approach and avoids cache-coherency bugs.

**Idempotent status update via WHERE**: The `ne()` trick means you can't easily count how many webhooks actually changed something vs. were replays. If you needed that metric, you'd check the affected row count. But for correctness, the approach is rock-solid.

**One subscription per org**: The `ON CONFLICT` on `orgId` enforces this at the database level. If we ever need subscription history, we'd need a separate table. The current design prioritizes simplicity.

**Catch-all error handling in getActiveTier**: The bare `catch` swallows all errors, not just "table doesn't exist." A database timeout, a connection pool exhaustion, or a malformed query would all silently return `'free'`. This is arguably too permissive — you might want to log the error before returning the fallback. But the Story 5.1 rationale was "never block the user," which this achieves.

## Patterns Worth Knowing

**Compound WHERE with OR for state machines**: The `getActiveTier` query is a textbook example of encoding business rules in SQL. Rather than loading the subscription and checking conditions in TypeScript, the database does the work. This is faster (one round-trip, no data transfer for non-matching rows) and more correct (no race conditions between reading and checking).

**Idempotent writes via conditional WHERE**: Adding `WHERE status != $target` to an UPDATE is a pattern for making writes safe to replay. It's simpler than checking first (`SELECT` then `UPDATE`) because there's no race window between the check and the write.

**Upsert for one-to-one relationships**: `INSERT ... ON CONFLICT DO UPDATE` guarantees exactly one row per org, enforced at the database level. It's atomic — no race condition between a "does it exist?" check and an insert.

**Fail-open access control**: `getActiveTier` returns `'free'` on error rather than throwing. This is a deliberate choice — the free tier is functional (users see charts, get limited AI), so failing open means degraded service instead of no service.

## Interview Questions

**Q: Why compute tier at query time instead of storing a boolean?**
A: A stored `isActive` boolean requires a process to keep it current — either a cron job (consistency lag) or triggers (complexity). Computing from `status + currentPeriodEnd + now()` is always correct, because the inputs are authoritative and `now()` is free. The trade-off is a database query per check, which you'd cache at scale.

**Q: What happens if two webhooks update the same subscription concurrently?**
A: Both run `updateSubscriptionPeriod` (idempotent — last writer wins, same data). For `updateSubscriptionStatus`, the `ne()` WHERE means only one of them will match if they're setting the same status. If they're setting different statuses, that's a real race, but Stripe sends events in order per subscription, so this shouldn't happen in practice.

**Q: Why does `getActiveTier` catch all errors instead of specific ones?**
A: The original motivation was pre-migration safety — the table might not exist yet. But it also provides a fallback for transient DB errors. The "fail to free" policy means users see limited functionality instead of a crash. In production, you'd want to log the error before returning the fallback, to avoid masking real database problems.

**Q: How would you extend this for a third tier (Enterprise)?**
A: The `plan` column already supports arbitrary strings. `getActiveTier` would return `'enterprise' | 'pro' | 'free'` and add a check for `plan = 'enterprise'` in the WHERE clause. The type would change from `SubscriptionTier = 'free' | 'pro'` to include the new value. The upsert and status updates wouldn't change at all.

## Data Structures

```typescript
// The return type — defined in shared/types, re-exported here
type SubscriptionTier = 'free' | 'pro';

// Upsert params — everything needed to create or update a subscription
interface UpsertSubscriptionParams {
  orgId: number;              // FK to orgs table, also the upsert conflict target
  stripeCustomerId: string;   // Stripe's cus_xxx ID
  stripeSubscriptionId: string; // Stripe's sub_xxx ID
  status: string;             // 'active', 'canceled', 'past_due', etc.
  plan: string;               // 'pro' (only value for now)
  currentPeriodEnd: Date | null; // null during checkout→updated gap
}

// The getActiveTier WHERE clause, in pseudo-SQL:
// WHERE org_id = $orgId
//   AND (
//     (status = 'active' AND (current_period_end > NOW() OR current_period_end IS NULL))
//     OR
//     (status = 'canceled' AND current_period_end IS NOT NULL AND current_period_end > NOW())
//   )
// LIMIT 1
```

## Impress the Interviewer

The `getActiveTier` query is the behavioral keystone of the subscription system. Every other function writes data, but this one makes the access decision. If you drew it on a whiteboard, you'd show a 2x2 matrix: status (active/canceled) vs. period (valid/expired/null). Three of the four cells grant access, one denies it. The canceled+null cell also denies, as a safety net against data anomalies.

The `ne()` trick in `updateSubscriptionStatus` is worth explaining as a general pattern. It turns any status update into an idempotent operation without requiring application-level dedup. If an interviewer asks "how do you handle duplicate webhooks?", pointing to a single `WHERE` clause is more convincing than describing an event processing pipeline.

One more thing: the module re-exports `SubscriptionTier` from the shared package. This means consumers can `import { getActiveTier, SubscriptionTier } from './subscriptions'` without needing to know about the shared package. Small ergonomic choice, but it keeps the import graph clean for downstream code.
