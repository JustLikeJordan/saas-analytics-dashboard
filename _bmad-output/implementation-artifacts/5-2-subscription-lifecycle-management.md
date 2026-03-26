# Story 5.2: Subscription Lifecycle Management

Status: done

<!-- Note: Validation is REQUIRED. Every story must complete all 4 steps: Create → Validate → Dev → Code Review. -->

## Story

As the **system**,
I want to manage subscription renewal and cancellation via Stripe webhooks,
so that subscription state stays synchronized with payment status.

## Acceptance Criteria

1. **Given** a Pro subscriber's subscription renews, **When** Stripe sends a `customer.subscription.updated` webhook with a new `current_period_end`, **Then** the `subscriptions` record is updated with the new period dates (FR29).

2. **Given** a Pro subscriber cancels their subscription, **When** Stripe sends a `customer.subscription.updated` webhook with `cancel_at_period_end: true`, **Then** the subscription is marked as canceled with an end date (FR29), **And** Pro access continues until the end of the paid period, **And** the `subscription.cancelled` analytics event fires.

3. **Given** any Stripe webhook arrives, **When** the handler processes it, **Then** the webhook signature is verified before processing (NFR12), **And** handlers are idempotent — duplicate webhook delivery does not corrupt subscription state (NFR22).

## Tasks / Subtasks

- [x] **Task 0: Migration — add unique constraints for subscriptions table** (AC: 1, 2, 3)
  - [x] Create `apps/api/drizzle/migrations/0012_add-subscription-unique-constraints.sql`
  - [x] `CREATE UNIQUE INDEX "idx_subscriptions_org_id_unique" ON "subscriptions" ("org_id");` — the existing `upsertSubscription()` uses `onConflictDoUpdate({ target: subscriptions.orgId })` which requires a unique constraint. Without this, the upsert fails at runtime (Story 5.1 bug — tests mock the DB so it was never caught).
  - [x] `DROP INDEX IF EXISTS "idx_subscriptions_org_id";` — remove the non-unique index, now replaced by the unique one
  - [x] `CREATE UNIQUE INDEX "idx_subscriptions_stripe_sub_id" ON "subscriptions" ("stripe_subscription_id") WHERE "stripe_subscription_id" IS NOT NULL;` — partial unique index for webhook lookups by Stripe ID. Nullable because free-tier orgs have no Stripe ID.
  - [x] Update `schema.ts`: change `index('idx_subscriptions_org_id')` to `uniqueIndex('idx_subscriptions_org_id_unique')` and add `uniqueIndex` for `stripeSubscriptionId` (with where-not-null if Drizzle supports partial indexes, otherwise standard unique index)

- [x] **Task 1: Add `customer.subscription.updated` handler to `webhookHandler.ts`** (AC: 1, 2, 3)
  - [x] Add `case 'customer.subscription.updated'` to the switch statement, calling `handleSubscriptionUpdated(event.data.object as Stripe.Subscription)`
  - [x] **This is the single canonical event for both renewal and cancellation.** Do NOT also handle `invoice.payment_succeeded` — Stripe fires both on renewal, and `customer.subscription.updated` already carries `current_period_end` directly on the subscription object. Handling both creates redundant processing.
  - [x] Keep existing `checkout.session.completed` handler untouched
  - [x] `default` case continues to log unhandled events

- [x] **Task 2: Implement `handleSubscriptionUpdated()` function** (AC: 1, 2, 3)
  - [x] Extract from `Stripe.Subscription` object: `id` (stripeSubscriptionId), `metadata.orgId`, `current_period_end` (Unix timestamp), `cancel_at_period_end`, `status`
  - [x] Convert period: `new Date(subscription.current_period_end * 1000)`
  - [x] **Missing metadata guard**: if `!orgId`, log error with `{ subscriptionId: subscription.id }` and return early (same pattern as `handleCheckoutCompleted`)
  - [x] **`past_due` guard**: if `subscription.status === 'past_due'`, log info and return — deferred to Story 5.4
  - [x] **Cancellation branch**: if `cancel_at_period_end === true`, call `updateSubscriptionStatus(stripeSubscriptionId, 'canceled', currentPeriodEnd)` and fire analytics event
  - [x] **Reactivation branch**: if `cancel_at_period_end === false` AND `status === 'active'`, call `updateSubscriptionStatus(stripeSubscriptionId, 'active', currentPeriodEnd)` — handles user un-canceling before period ends
  - [x] **Period update**: always call `updateSubscriptionPeriod(stripeSubscriptionId, currentPeriodEnd)` to keep dates fresh regardless of cancellation state
  - [x] Pino logging for each branch: `logger.info({ orgId, stripeSubscriptionId, cancelAtPeriodEnd }, 'Subscription canceled')` etc.

- [x] **Task 3: Handle cancellation analytics `userId` problem** (AC: 2)
  - [x] `analytics_events.userId` is NOT NULL (`schema.ts` line 104-106), but cancellation webhooks don't carry `userId` — Stripe Customer Portal doesn't pass it back
  - [x] Look up the org owner: query `user_orgs` table for matching `orgId` with `role = 'owner'`, take the first result
  - [x] Add `getOrgOwnerId(orgId): Promise<number | null>` to `db/queries/userOrgs.ts` (or whichever file owns user-org queries)
  - [x] Re-export from `db/queries/index.ts`
  - [x] If owner lookup returns null, log warning and skip the analytics event — don't throw
  - [x] `trackEvent()` is fire-and-forget (returns void, catches errors internally) — match this pattern

- [x] **Task 4: Add new query functions to `db/queries/subscriptions.ts`** (AC: 1, 2)
  - [x] `updateSubscriptionPeriod(stripeSubscriptionId: string, currentPeriodEnd: Date)` — `UPDATE subscriptions SET current_period_end = $1, updated_at = NOW() WHERE stripe_subscription_id = $2`
  - [x] `updateSubscriptionStatus(stripeSubscriptionId: string, status: string, currentPeriodEnd?: Date)` — idempotent: `UPDATE subscriptions SET status = $1, current_period_end = COALESCE($2, current_period_end), updated_at = NOW() WHERE stripe_subscription_id = $3 AND status != $1`
  - [x] `getSubscriptionByStripeId(stripeSubscriptionId: string)` — lookup by Stripe ID for webhook correlation
  - [x] Re-export all from `db/queries/index.ts` barrel

- [x] **Task 5: Add analytics event constants** (AC: 2)
  - [x] Add `SUBSCRIPTION_CANCELLED: 'subscription.cancelled'` to `ANALYTICS_EVENTS` in `packages/shared/src/constants/index.ts`
  - [x] Add `SUBSCRIPTION_RENEWED: 'subscription.renewed'` for observability (optional — log renewal events for future dashboards)

- [x] **Task 6: Update `getActiveTier()` to handle canceled-but-within-period** (AC: 2)
  - [x] Current query (line 15-21 of `subscriptions.ts`): `eq(status, 'active') AND (gt(currentPeriodEnd, now()) OR isNull(currentPeriodEnd))`
  - [x] **Must preserve the IS NULL case for active subscriptions** — a just-completed checkout sets `currentPeriodEnd: null` until the first `customer.subscription.updated` webhook populates it. Dropping IS NULL breaks fresh checkouts.
  - [x] New WHERE clause in Drizzle:
    ```
    and(
      eq(subscriptions.orgId, orgId),
      or(
        // Active: period still valid OR period not yet populated (just-completed checkout)
        and(eq(subscriptions.status, 'active'), or(gt(subscriptions.currentPeriodEnd, new Date()), isNull(subscriptions.currentPeriodEnd))),
        // Canceled but within paid period: access continues until currentPeriodEnd
        and(eq(subscriptions.status, 'canceled'), isNotNull(subscriptions.currentPeriodEnd), gt(subscriptions.currentPeriodEnd, new Date())),
      ),
    )
    ```
  - [x] Import `isNotNull` from `drizzle-orm` if not already imported

- [x] **Task 7: Tests** (AC: 1, 2, 3)
  - [x] Extend `webhookHandler.test.ts` with `describe('customer.subscription.updated')`:
    - [x] `it('updates period dates on renewal')` — verify `updateSubscriptionPeriod` called with correct Date
    - [x] `it('marks subscription as canceled when cancel_at_period_end is true')` — verify `updateSubscriptionStatus` called with 'canceled'
    - [x] `it('fires subscription.cancelled analytics event on cancellation')` — verify `trackEvent` called with owner userId
    - [x] `it('reverts status to active on reactivation (cancel_at_period_end false)')` — verify `updateSubscriptionStatus` called with 'active'
    - [x] `it('skips past_due status — deferred to Story 5.4')` — verify no DB writes, only logging
    - [x] `it('is idempotent — duplicate cancellation webhook is a no-op')` — call twice, same result
    - [x] `it('handles missing orgId metadata gracefully')` — verify logs error, no DB writes
    - [x] `it('skips analytics event when org owner lookup fails')` — mock `getOrgOwnerId` returning null
  - [x] Add `getActiveTier` tests (in existing test file or new `subscriptions.queries.test.ts`):
    - [x] `it('returns pro for active subscription with null currentPeriodEnd')` — fresh checkout case
    - [x] `it('returns pro for canceled subscription within period')`
    - [x] `it('returns free for canceled subscription past period end')`
    - [x] `it('returns free for canceled subscription with null currentPeriodEnd')` — edge case: shouldn't happen but defensively handled
  - [x] Verify all existing `checkout.session.completed` tests still pass unchanged

## Dev Notes

### Architecture Compliance

- **Webhook route already exists and is mounted correctly**: `routes/stripeWebhook.ts` handles signature verification and dispatches to `handleWebhookEvent()`. No changes to the route needed — only the handler switch statement expands.
- **Idempotent via status-transition safety**: `UPDATE subscriptions SET status = $1 WHERE stripe_subscription_id = $2 AND status != $1` — replay is a no-op. No separate event ID tracking table. This is an architecture decision (project-context.md line 479-482).
- **Services import from `db/queries/` barrel**: New query functions go in `db/queries/subscriptions.ts` and re-export through `db/queries/index.ts`.
- **Config-driven env access**: No new env vars needed for this story. All Stripe config already exists in `config.ts`.
- **Pino structured logging**: `logger.info({ orgId, stripeSubscriptionId }, 'Subscription renewed')` — object first, message second.
- **No CORS middleware / BFF proxy**: This story is entirely backend (webhook → DB). No frontend changes. No BFF proxy routes needed.
- **Subscription gate is ANNOTATING only**: `subscriptionGate.ts` reads from DB. Once we update the subscription record, the gate reflects the new state on next request. No middleware changes needed (except `getActiveTier()` query fix in Task 6).

### Pre-existing Bug: Missing Unique Constraint on `org_id`

The `upsertSubscription()` function uses `.onConflictDoUpdate({ target: subscriptions.orgId })`, but the schema only defines a non-unique index on `org_id` (migration 0008, line 13: `CREATE INDEX` not `CREATE UNIQUE INDEX`). PostgreSQL's `ON CONFLICT` requires a unique constraint. This went undetected because Story 5.1 tests mock the DB layer. Task 0 fixes this with a migration that replaces the regular index with a unique one.

### Existing Code to Reuse (DO NOT reinvent)

| What | Where | Why |
|------|-------|-----|
| `handleWebhookEvent()` | `apps/api/src/services/subscription/webhookHandler.ts` | Extend the switch statement — don't create a new handler file |
| `upsertSubscription()` | `apps/api/src/db/queries/subscriptions.ts` | Exists for initial creation. Use targeted UPDATE queries for lifecycle changes. |
| `getActiveTier()` | `apps/api/src/db/queries/subscriptions.ts` | Modify WHERE clause to include canceled-but-within-period |
| `getSubscriptionByOrgId()` | `apps/api/src/db/queries/subscriptions.ts` | Exists — add `getSubscriptionByStripeId()` variant for webhook lookups |
| `trackEvent()` | `apps/api/src/services/analytics/trackEvent.ts` | Fire-and-forget (returns void, `.catch()` internal). Match this pattern. |
| `ANALYTICS_EVENTS` | `packages/shared/src/constants/index.ts` | Add new constants alongside existing `SUBSCRIPTION_UPGRADED` |
| `getStripe()` | `apps/api/src/services/subscription/stripeService.ts` | Lazy Stripe init — already exported, used by webhook route |
| `subscriptions` table schema | `apps/api/src/db/schema.ts:222-238` | All columns exist: `status`, `currentPeriodEnd`, `stripeSubscriptionId` |
| Webhook handler test pattern | `apps/api/src/services/subscription/webhookHandler.test.ts` | Mirror `fakeCheckoutEvent()` pattern for new event types |
| `user_orgs` table | `apps/api/src/db/schema.ts` | For `getOrgOwnerId()` lookup — cancellation analytics needs a userId |

### Patterns Established in Story 5.1

- **Lazy Stripe init**: `getStripe()` pattern — no module-scope side effects. Don't create a new Stripe instance.
- **Webhook handler switch**: `event.type` → `case 'x': await handleX(event.data.object)`. Follow this exact pattern.
- **Missing metadata guard**: Check required fields before processing. Log error and return early (don't throw).
- **`upsertSubscription()` for initial creation**: But for lifecycle updates, use targeted UPDATE queries — don't re-upsert the entire record on every webhook.
- **Analytics event at end of handler**: `trackEvent(orgId, userId, EVENT_NAME, metadata)` — fire-and-forget, after DB writes succeed.
- **Test mocking pattern**: `vi.mock('../../db/queries/subscriptions')` at top, `mockUpsertSubscription = vi.mocked(subscriptionsQueries.upsertSubscription)` in beforeEach.

### Critical Implementation Details

**Stripe `customer.subscription.updated` event object shape:**
```typescript
// event.data.object is Stripe.Subscription
{
  id: 'sub_xxx',                    // stripeSubscriptionId
  customer: 'cus_xxx',             // stripeCustomerId
  status: 'active' | 'canceled' | 'past_due' | ...,
  cancel_at_period_end: boolean,   // true = user initiated cancellation via Portal
  current_period_end: 1234567890,  // Unix timestamp — convert: new Date(x * 1000)
  metadata: { orgId: '10' },       // set during original checkout session
}
```

**Why only `customer.subscription.updated` and NOT `invoice.payment_succeeded`:**
On renewal, Stripe fires both events. `customer.subscription.updated` already carries `current_period_end` directly on the subscription object — no need to look it up from invoice line items. Handling both creates redundant DB updates. Use `customer.subscription.updated` as the single source of truth for subscription state.

**Cancellation vs. immediate termination:**
- `cancel_at_period_end: true` on `customer.subscription.updated` = user canceled via Portal, access until period end. Our handler sets `status: 'canceled'` in DB.
- Stripe status `'canceled'` (American spelling, not `'cancelled'`) = subscription fully terminated after period end. This transition happens automatically and fires another `customer.subscription.updated`. Story 5.4 handles that terminal state.
- `cancel_at_period_end: false` + `status: 'active'` = user reactivated (un-canceled before period end). Our handler reverts `status: 'active'`.

**`getActiveTier()` fix is the key behavioral change:**
- Current query only grants Pro for `status = 'active'`
- Must ALSO grant Pro for `status = 'canceled' AND currentPeriodEnd > now()` — user paid through the period
- Must PRESERVE `isNull(currentPeriodEnd)` for active status — fresh checkout sets `currentPeriodEnd: null` until first webhook populates it
- Without this fix, canceling immediately revokes access — violating AC 2

**`trackEvent` userId for cancellation:**
- `trackEvent(orgId, userId, eventName, metadata)` requires a non-null userId (schema: `analytics_events.user_id NOT NULL`)
- Cancellation webhooks from Stripe Customer Portal don't carry userId
- Solution: look up org owner from `user_orgs` table — cancellation is an org-level action, attributed to the owner
- If no owner found, skip the analytics event with a warning log

### What This Story Does NOT Include

- Payment failure handling (`invoice.payment_failed`) — that's Story 5.4
- Pro access revocation / revert to free tier — that's Story 5.4
- Toast notifications for subscription changes — that's Story 5.4
- Changes to the billing page UI — billing page from Story 5.1 already links to Stripe Portal
- `useSubscription.ts` hook — not needed until Story 5.3
- Any frontend changes — this is a backend-only webhook story
- `past_due` status handling beyond logging — deferred to Story 5.4

### Project Structure Notes

**New files to create:**
```
apps/api/drizzle/migrations/0012_add-subscription-unique-constraints.sql  — Unique indexes for org_id + stripe_subscription_id
```

**Files to modify:**
```
apps/api/src/db/schema.ts                                 — Update subscriptions table: index → uniqueIndex
apps/api/src/services/subscription/webhookHandler.ts      — Add customer.subscription.updated handler
apps/api/src/db/queries/subscriptions.ts                  — Add updateSubscriptionPeriod, updateSubscriptionStatus, getSubscriptionByStripeId; fix getActiveTier
apps/api/src/db/queries/userOrgs.ts (or equivalent)       — Add getOrgOwnerId for analytics userId lookup
apps/api/src/db/queries/index.ts                          — Re-export new query functions
packages/shared/src/constants/index.ts                    — Add SUBSCRIPTION_CANCELLED, SUBSCRIPTION_RENEWED
apps/api/src/services/subscription/webhookHandler.test.ts — Extend with renewal + cancellation + reactivation tests
```

### Testing Strategy

**Extend `webhookHandler.test.ts` with:**
```
describe('customer.subscription.updated')
  it('updates period dates on renewal')
  it('marks subscription as canceled when cancel_at_period_end is true')
  it('fires subscription.cancelled analytics event on cancellation')
  it('uses org owner userId for cancellation analytics event')
  it('skips analytics event when org owner lookup returns null')
  it('reverts status to active on reactivation')
  it('skips past_due status — deferred to Story 5.4')
  it('is idempotent — duplicate cancellation is a no-op')
  it('handles missing orgId metadata gracefully')
```

**Add `getActiveTier` tests (extend existing or create `subscriptions.queries.test.ts`):**
```
describe('getActiveTier')
  it('returns pro for active subscription with null currentPeriodEnd')
  it('returns pro for canceled subscription within period')
  it('returns free for canceled subscription past period end')
  it('returns free for canceled subscription with null currentPeriodEnd')
```

**What NOT to test:**
- Stripe API calls — mock the event objects, don't call Stripe
- Webhook route / signature verification — already tested in Story 5.1, unchanged
- `subscriptionGate.ts` middleware plumbing — only the underlying query changes

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 5.2 acceptance criteria, lines 1112-1134]
- [Source: _bmad-output/planning-artifacts/architecture.md — webhook idempotency pattern, line 1049]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR29 subscription lifecycle, line 1244]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR12 webhook signature verification]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR22 idempotent webhooks]
- [Source: _bmad-output/project-context.md — Stripe webhook events list, line 482]
- [Source: _bmad-output/project-context.md — subscription gate annotating behavior, lines 470-477]
- [Source: apps/api/src/services/subscription/webhookHandler.ts — existing handler with TODO comment for Story 5.2 at line 36]
- [Source: apps/api/src/db/queries/subscriptions.ts — existing getActiveTier lines 10-29, upsertSubscription lines 40-64]
- [Source: apps/api/src/db/schema.ts:222-238 — subscriptions table (no unique constraint on org_id)]
- [Source: apps/api/src/db/schema.ts:97-116 — analytics_events table (userId NOT NULL at line 104)]
- [Source: apps/api/src/services/analytics/trackEvent.ts — fire-and-forget pattern with .catch()]
- [Source: apps/api/drizzle/migrations/0008_add_subscriptions_table.sql — only CREATE INDEX, not CREATE UNIQUE INDEX]
- [Source: _bmad-output/implementation-artifacts/5-1-stripe-checkout-free-to-pro-upgrade.md — Story 5.1 patterns and learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Stripe SDK v20 removed `current_period_end` from `Stripe.Subscription` type (moved to `SubscriptionItem`). Webhook payload still includes it — added `SubscriptionWebhookPayload` type extension.
- Shared package `dist/` was stale after adding new constants — `pnpm --filter shared build` required before tests resolved the new exports.

### Completion Notes List

- Task 0: Created migration 0012 with unique constraints on `org_id` and partial unique on `stripe_subscription_id`. Updated `schema.ts` to match. Fixes Story 5.1 bug where `upsertSubscription` would fail at runtime due to missing unique constraint.
- Tasks 1-2: Added `customer.subscription.updated` case to webhook switch. Implemented `handleSubscriptionUpdated()` with cancellation, reactivation, past_due guard, and missing metadata guard branches.
- Task 3: Added `getOrgOwnerId()` to `userOrgs.ts` — looks up org owner for cancellation analytics since webhooks don't carry userId. Already re-exported via barrel (namespace export).
- Task 4: Added `updateSubscriptionPeriod()`, `updateSubscriptionStatus()` (idempotent via `ne()` WHERE clause), and `getSubscriptionByStripeId()` to subscriptions queries. Already re-exported via barrel.
- Task 5: Added `SUBSCRIPTION_CANCELLED` constant. `SUBSCRIPTION_RENEWED` removed during code review (dead code — no handler fires it).
- Task 6: Rewrote `getActiveTier()` WHERE clause — now grants Pro for both `active` (with null period support for fresh checkouts) and `canceled` (within paid period). This is the behavioral keystone preventing immediate access loss on cancellation.
- Task 7: Added 8 webhook handler tests + 4 getActiveTier tests. All 364 tests pass, zero regressions.

### Change Log

- 2026-03-25: Story 5.2 implementation complete — all 8 tasks, 12 new tests, 7 files modified, 1 file created.
- 2026-03-26: Code review — 6 fixes applied (1 HIGH, 5 MEDIUM). Schema partial index mismatch fixed, dead SUBSCRIPTION_RENEWED constant removed, getActiveTier Date precision fixed, WHERE clause structure test added, orgsRelations cardinality corrected, zero-row webhook logging added. 365 tests pass.

### File List

**New files:**
- `apps/api/drizzle/migrations/0012_add-subscription-unique-constraints.sql`

**Modified files:**
- `apps/api/src/db/schema.ts` — subscriptions table: uniqueIndex with partial WHERE for stripe_sub_id, orgsRelations many→one
- `apps/api/src/services/subscription/webhookHandler.ts` — customer.subscription.updated handler + zero-row period update logging
- `apps/api/src/db/queries/subscriptions.ts` — updateSubscriptionPeriod (returns row count), getActiveTier (shared Date ref), updateSubscriptionStatus, getSubscriptionByStripeId
- `apps/api/src/db/queries/userOrgs.ts` — added getOrgOwnerId
- `packages/shared/src/constants/index.ts` — added SUBSCRIPTION_CANCELLED
- `apps/api/src/services/subscription/webhookHandler.test.ts` — 8 tests for customer.subscription.updated
- `apps/api/src/db/queries/subscriptions.test.ts` — 5 getActiveTier tests (including WHERE clause structure assertion)
