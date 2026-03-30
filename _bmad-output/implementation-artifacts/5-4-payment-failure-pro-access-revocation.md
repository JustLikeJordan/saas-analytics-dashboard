# Story 5.4: Payment Failure & Pro Access Revocation

Status: done

<!-- Validated: 2026-03-29. 2 critical + 6 enhancements applied. All 4 steps: Create done -> Validate done -> Dev -> Code Review -->

## Story

As the **system**,
I want to revoke Pro access when payment fails,
so that the subscription model is enforced fairly.

## Acceptance Criteria

1. **Given** a Pro subscriber's payment fails, **When** Stripe sends a `invoice.payment_failed` webhook, **Then** the `subscriptions` record is updated to `past_due` status (FR30), **And** Pro access is revoked -- the org reverts to free tier (verified via `getActiveTier()` exclusion logic from Story 5.3).

2. **Given** a subscription lapses mid-session, **When** the webhook fires, **Then** the current session continues uninterrupted until the next page load, **And** on next dashboard visit, a toast notification appears: "Your Pro subscription has ended. You're now on the free plan.", **And** the AI summary reverts to free preview (~150 words + blur).

## Tasks / Subtasks

- [x] **Task 1: Handle `invoice.payment_failed` webhook** (AC: 1)
  - [x] Add `case 'invoice.payment_failed'` to `handleWebhookEvent` switch in `webhookHandler.ts`
  - [x] Extract `subscription` ID from the invoice event object (`event.data.object.subscription`)
  - [x] Look up the subscription row by `stripeSubscriptionId` using existing `getSubscriptionByStripeId()`
  - [x] Call `updateSubscriptionStatus(stripeSubscriptionId, 'past_due')` -- this already exists and is idempotent (WHERE clause skips if already `past_due`)
  - [x] Fire `SUBSCRIPTION_PAYMENT_FAILED` analytics event (fire-and-forget)
  - [x] Log with structured Pino: `logger.info({ orgId, stripeSubscriptionId }, 'Payment failed -- subscription marked past_due')`
  - [x] Remove the `past_due` early-return guard from `handleSubscriptionUpdated` (line 66-68) -- this was a "deferred to Story 5.4" placeholder
  - [x] Add an `else if (subscription.status === 'past_due')` branch to `handleSubscriptionUpdated` so that `customer.subscription.updated` with `past_due` status also sets the status (not just period dates). Without this branch, the handler updates period dates but falls through both `cancelAtPeriodEnd` and `active` branches without setting status.

- [x] **Task 2: Handle `customer.subscription.deleted` webhook** (AC: 1)
  - [x] Add `case 'customer.subscription.deleted'` to the switch
  - [x] Stripe sends this when a subscription is fully terminated (after all retries exhausted, or manual cancellation past period)
  - [x] For `customer.subscription.deleted`, `event.data.object` is a `Stripe.Subscription` with `metadata.orgId` available directly (same as `subscription.updated`). No DB lookup needed -- extract `orgId` from `subscription.metadata.orgId`
  - [x] Call `updateSubscriptionStatus(stripeSubscriptionId, 'expired')` -- same idempotent pattern
  - [x] Fire `SUBSCRIPTION_EXPIRED` analytics event
  - [x] Log: `logger.info({ orgId, stripeSubscriptionId }, 'Subscription deleted -- marked expired')`

- [x] **Task 3: Add analytics event constants** (AC: 1)
  - [x] Add `SUBSCRIPTION_PAYMENT_FAILED: 'subscription.payment_failed'` to `ANALYTICS_EVENTS` in `packages/shared/src/constants/index.ts`
  - [x] Add `SUBSCRIPTION_EXPIRED: 'subscription.expired'` to `ANALYTICS_EVENTS`

- [x] **Task 4: Install toast library and add Toaster provider** (AC: 2)
  - [x] Install `sonner` in `apps/web` -- shadcn/ui's recommended toast library
  - [x] Add `<Toaster />` from sonner to `apps/web/app/layout.tsx` inside the body, after other providers
  - [x] Position: `position="bottom-right"` on desktop, sonner auto-stacks on mobile
  - [x] Use `richColors` prop for styled variants

- [x] **Task 5: Detect downgrade and show toast** (AC: 2)
  - [x] In `DashboardShell.tsx`, track the previous tier value using a `useRef`
  - [x] When `useSubscription` returns `tier` that transitions from `'pro'` to `'free'`, fire the toast: `toast.warning("Your Pro subscription has ended. You're now on the free plan.")` -- use `warning` not `info` since payment failure is worth amber/yellow urgency styling
  - [x] Only fire once per transition -- the ref prevents repeated toasts on re-renders
  - [x] The AI summary already respects `tier` from `useSubscription` -- it will automatically show the free preview (~150 words + blur) because `AiSummaryCard` reads `tier` prop from `DashboardShell`
  - [x] SWR's `revalidateOnFocus: true` (default) means: user is on dashboard, payment fails, webhook fires, DB updated to `past_due`, user switches tabs and returns, SWR refetches `/api/subscriptions`, `getActiveTier()` returns `'free'` (past_due not matched by active/canceled OR branches), tier transition detected, toast fires

- [x] **Task 6: Tests** (AC: 1, 2)
  - [x] `apps/api/src/services/subscription/webhookHandler.test.ts` (extend):
    - [x] `describe('invoice.payment_failed')`:
      - [x] `it('updates subscription to past_due status')`
      - [x] `it('fires subscription.payment_failed analytics event')`
      - [x] `it('is idempotent -- duplicate webhook is a no-op at DB level')`
      - [x] `it('handles missing subscription gracefully')`
    - [x] `describe('customer.subscription.deleted')`:
      - [x] `it('updates subscription to expired status')`
      - [x] `it('fires subscription.expired analytics event')`
      - [x] `it('handles missing subscription gracefully')`
    - [x] Update existing `past_due` test: the "skips past_due status -- deferred to Story 5.4" test now needs to verify that `past_due` IS handled (status update + period update)
    - [x] **Fix existing "unhandled event types" test** (line 208): it currently uses `invoice.payment_failed` as its example event type. Change to a genuinely unhandled type (e.g., `payment_intent.succeeded`)
    - [x] Extend the `subscriptionsQueries` mock object to include `getSubscriptionByStripeId: mockGetSubscriptionByStripeId` and add `const mockGetSubscriptionByStripeId = vi.fn()` declaration
  - [x] `apps/web/app/dashboard/DashboardShell.test.tsx` (**new file**):
    - [x] `it('shows toast when tier transitions from pro to free')`
    - [x] `it('does not show toast on initial load as free')`
    - [x] `it('does not show toast when tier stays pro')`

## Dev Notes

### Architecture Compliance

- **Webhook route is already wired**: `stripeWebhookRouter` in `routes/stripeWebhook.ts` handles signature verification and calls `handleWebhookEvent()`. New event types only need a `case` in the switch -- no route changes needed.
- **Subscription gate is ANNOTATING, not blocking**: `subscriptionGate.ts` sets `req.subscriptionTier` via `getActiveTier()`. When status is `past_due`, `getActiveTier()` already returns `'free'` by exclusion (only `active` and `canceled-within-period` match the OR branches). No changes to `getActiveTier()` or the gate.
- **BFF proxy pattern**: Frontend calls `/api/subscriptions` -> Next.js route handler -> Express `/subscriptions/tier`. No changes to this chain.
- **No CORS**: Same-origin BFF proxy. Don't add it.
- **Express middleware chain order**: Stripe webhook route is already mounted BEFORE the JSON body parser (uses `express.raw()`). No changes needed.

### Existing Code to Reuse (DO NOT reinvent)

| What | Where | Why |
|------|-------|-----|
| `handleWebhookEvent` switch | `apps/api/src/services/subscription/webhookHandler.ts` | Add new cases -- don't restructure |
| `updateSubscriptionStatus()` | `apps/api/src/db/queries/subscriptions.ts:79` | Idempotent update (WHERE status != target). Works for `past_due` and `expired` |
| `getSubscriptionByStripeId()` | `apps/api/src/db/queries/subscriptions.ts:100` | Look up subscription row by Stripe ID for orgId extraction |
| `getActiveTier()` | `apps/api/src/db/queries/subscriptions.ts:10` | Already returns `'free'` for `past_due` -- no changes needed |
| `trackEvent()` | `apps/api/src/services/analytics/trackEvent.ts` | Fire-and-forget pattern |
| `useSubscription` hook | `apps/web/lib/hooks/useSubscription.ts` | SWR-based tier detection with `revalidateOnFocus` |
| `DashboardShell` | `apps/web/app/dashboard/DashboardShell.tsx:128` | Already uses `useSubscription({ enabled: hasAuth, fallbackData: serverTier })` |
| `AiSummaryCard` | `apps/web/app/dashboard/AiSummaryCard.tsx` | Already reads `tier` prop -- free preview auto-applies |
| Test factory `fakeSubscriptionUpdatedEvent` | `webhookHandler.test.ts:47` | Pattern reference for new factories (see below) |

### Patterns Established in Stories 5.1-5.3

- **Idempotent webhooks**: `updateSubscriptionStatus` has `WHERE status != target` -- replay is a no-op. Use the same pattern for `past_due` and `expired`.
- **Analytics fire-and-forget**: `trackEvent(orgId, userId, EVENT_NAME, metadata)` -- don't await, don't catch.
- **Webhook metadata for orgId**: `subscription.metadata.orgId` is set during checkout (Story 5.1). For `invoice.payment_failed`, the orgId comes from looking up the subscription row by `stripeSubscriptionId`, not from the invoice directly.
- **Test mocking**: `vi.mock('../../db/queries/index.js')` pattern with `mockUpsertSubscription`, `mockUpdateSubscriptionStatus`, etc.
- **SWR `fallbackData` pattern**: Server-fetched tier passed as `fallbackData` to `useSubscription` for zero-flash hydration. SWR revalidates on focus.

### Critical Implementation Details

**`invoice.payment_failed` event shape (Stripe SDK v20):**
```typescript
// event.data.object is a Stripe.Invoice
const invoice = event.data.object as Stripe.Invoice;
const stripeSubscriptionId = typeof invoice.subscription === 'string'
  ? invoice.subscription
  : invoice.subscription?.id ?? null;
```
The `subscription` field on an Invoice can be a string ID or an expanded object. Always handle both per Stripe SDK conventions.

**Stripe retry behavior:** Stripe sends `invoice.payment_failed` on each payment retry attempt (typically 3-4 attempts over ~3 weeks via Smart Retries). The idempotent `updateSubscriptionStatus` handles this naturally -- the first event sets `past_due`, subsequent events are no-ops at the DB level (WHERE clause skips if already `past_due`).

**orgId extraction from invoice:**
The invoice object does NOT have `metadata.orgId` like the subscription does. You must look up the subscription row by `stripeSubscriptionId` to get the `orgId`:
```typescript
const sub = await subscriptionsQueries.getSubscriptionByStripeId(stripeSubscriptionId);
if (!sub) { logger.warn(...); return; }
const orgId = sub.orgId;
```

**Removing the past_due guard:**
Line 66-68 of `webhookHandler.ts` currently returns early for `past_due`:
```typescript
if (subscription.status === 'past_due') {
  logger.info({ orgId, stripeSubscriptionId }, 'Subscription past_due -- deferred to Story 5.4');
  return;
}
```
Remove this block and add an `else if (subscription.status === 'past_due')` branch that calls `updateSubscriptionStatus(stripeSubscriptionId, 'past_due', currentPeriodEnd)`. Without this branch, `handleSubscriptionUpdated` updates period dates via `updateSubscriptionPeriod` but falls through both the `cancelAtPeriodEnd` and `active` branches -- the status never gets set to `past_due` from this handler. The `invoice.payment_failed` handler also sets `past_due`, but `customer.subscription.updated` may arrive first due to webhook ordering.

**Toast library (sonner):**
No toast library is currently installed. The architecture doc references `<Toaster>` in `layout.tsx` but it hasn't been set up yet. Install `sonner` (shadcn/ui's recommended choice):
```bash
pnpm --filter web add sonner
```
Import in layout.tsx:
```typescript
import { Toaster } from 'sonner';
// In the body:
<Toaster position="bottom-right" richColors />
```

**Test factory for `invoice.payment_failed`:**
```typescript
function fakeInvoicePaymentFailedEvent(overrides = {}): Stripe.Event {
  return {
    id: 'evt_inv_fail_123',
    type: 'invoice.payment_failed',
    data: {
      object: {
        id: 'in_test_123',
        subscription: 'sub_test_789', // string ID, not expanded object
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}
```
Note: `event.data.object` is a `Stripe.Invoice` (not Subscription). The `subscription` field is a string ID here. The handler must look up the subscription row via `getSubscriptionByStripeId()` to get `orgId`.

**Test factory for `customer.subscription.deleted`:**
```typescript
function fakeSubscriptionDeletedEvent(overrides = {}): Stripe.Event {
  return {
    id: 'evt_sub_del_123',
    type: 'customer.subscription.deleted',
    data: {
      object: {
        id: 'sub_test_789',
        customer: 'cus_test_456',
        status: 'canceled',
        metadata: { orgId: '10' },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}
```
Note: `event.data.object` is a `Stripe.Subscription` (same as `subscription.updated`). `metadata.orgId` is available directly.

**DashboardShell.test.tsx setup notes:**
This is a new test file. DashboardShell has multiple context providers (SidebarContext, SWR) and requires `initialData` with a non-trivial `ChartData` shape. Consider testing the toast logic by mocking `useSubscription` at the module level to control tier transitions, rather than rendering the full component tree. Mock `sonner`'s `toast` export to assert calls.

**Downgrade detection in DashboardShell:**
```typescript
const prevTierRef = useRef(tier);
useEffect(() => {
  if (prevTierRef.current === 'pro' && tier === 'free') {
    toast.warning("Your Pro subscription has ended. You're now on the free plan.");
  }
  prevTierRef.current = tier;
}, [tier]);
```
This fires once per pro->free transition. Safe under React StrictMode -- double-invoke in dev runs the effect twice with the same values, ref stays consistent. The `useSubscription` hook with `revalidateOnFocus` handles the actual data flow: webhook updates DB -> user focuses tab -> SWR refetches -> tier changes -> toast fires.

**What `getActiveTier()` already handles for `past_due`:**
The `past_due` status is NOT matched by either OR branch in `getActiveTier()`:
- Not `active` -> first branch doesn't match
- Not `canceled` -> second branch doesn't match
- Result: empty result set -> returns `'free'`

This means no changes to `getActiveTier()` are needed. Story 5.3 already added explicit test coverage confirming `past_due` returns `'free'`.

### What This Story Does NOT Include

- Grace period (3-day banner before revoking) -- PRD lists this as a Growth-tier enhancement, not MVP
- Stripe Customer Portal session creation -- that's Story 5.1 (done)
- Stripe Checkout session creation -- that's Story 5.1 (done)
- Subscription lifecycle (create, renew, cancel) -- that's Story 5.2 (done)
- Changes to `getActiveTier()` query logic -- already handles `past_due` correctly
- Changes to `subscriptionGate.ts` -- already annotates correctly based on `getActiveTier()` result
- Blocking behavior (403) for any endpoint -- the gate annotates, never blocks AI requests

### Project Structure Notes

**Files to modify:**
```
apps/api/src/services/subscription/webhookHandler.ts   -- Add invoice.payment_failed + customer.subscription.deleted cases, remove past_due guard
apps/api/src/services/subscription/webhookHandler.test.ts -- Add tests for new webhook events
apps/web/app/dashboard/DashboardShell.tsx               -- Add toast on tier downgrade transition
apps/web/app/layout.tsx                                  -- Add <Toaster /> from sonner
packages/shared/src/constants/index.ts                   -- Add SUBSCRIPTION_PAYMENT_FAILED + SUBSCRIPTION_EXPIRED constants
```

**New files:**
```
(none -- all changes extend existing files)
```

**New dependencies:**
```
apps/web: sonner (toast library, shadcn/ui recommended)
```

### Testing Strategy

**Backend (Vitest):**
```
apps/api/src/services/subscription/webhookHandler.test.ts (extend)
  describe('invoice.payment_failed')
    it('updates subscription to past_due status')
    it('fires subscription.payment_failed analytics event')
    it('is idempotent -- duplicate webhook is a no-op')
    it('handles missing subscription gracefully')
  describe('customer.subscription.deleted')
    it('updates subscription to expired status')
    it('fires subscription.expired analytics event')
  existing past_due test: update assertion (no longer deferred)
```

**Frontend (Vitest + React Testing Library):**
```
apps/web/app/dashboard/DashboardShell.test.tsx (new or extend)
  describe('downgrade toast')
    it('shows toast when tier transitions from pro to free')
    it('does not show toast on initial load as free')
    it('does not show toast when tier stays pro')
```

**What NOT to test:**
- Stripe signature verification -- already tested in `stripeWebhook.test.ts`
- `getActiveTier()` with `past_due` -- already tested in Story 5.3
- `subscriptionGate` behavior -- no changes, already tested
- SSE streaming with free tier -- covered by Story 3.5

### References

- [Source: _bmad-output/planning-artifacts/epics.md -- Story 5.4 acceptance criteria, lines 1153-1173]
- [Source: _bmad-output/planning-artifacts/architecture.md -- FR30 payment failure revocation mapping, line 1246]
- [Source: _bmad-output/planning-artifacts/prd.md -- FR30 definition, line 356]
- [Source: _bmad-output/planning-artifacts/prd.md -- Grace period as Growth-tier, line 128]
- [Source: apps/api/src/services/subscription/webhookHandler.ts -- existing webhook switch, past_due guard at line 66]
- [Source: apps/api/src/db/queries/subscriptions.ts -- getActiveTier exclusion logic, lines 10-33]
- [Source: apps/api/src/db/queries/subscriptions.ts -- getSubscriptionByStripeId, lines 100-107]
- [Source: apps/api/src/db/queries/subscriptions.ts -- updateSubscriptionStatus idempotent, lines 79-98]
- [Source: apps/web/lib/hooks/useSubscription.ts -- SWR hook with revalidateOnFocus]
- [Source: apps/web/app/dashboard/DashboardShell.tsx -- useSubscription at line 128, AiSummaryCard tier prop at line 207]
- [Source: apps/api/src/services/subscription/webhookHandler.test.ts -- existing test patterns and factories]
- [Source: _bmad-output/implementation-artifacts/5-3-subscription-status-verification.md -- Story 5.3 patterns and learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Stripe SDK v20 `Invoice` type lacks `subscription` property — added `InvoiceWebhookPayload` intersection type
- `analytics_events.userId` is NOT NULL — used `getOrgOwnerId()` pattern from cancellation handler for webhook-initiated events
- Shared package needed rebuild (`pnpm --filter shared build`) for new constants to resolve in tests

### Completion Notes List

- Added `invoice.payment_failed` webhook handler with DB lookup for orgId (invoice doesn't carry metadata like subscriptions)
- Added `customer.subscription.deleted` webhook handler for terminal subscription states
- Removed past_due early-return guard from `handleSubscriptionUpdated`, added `else if (past_due)` branch
- Added `SUBSCRIPTION_PAYMENT_FAILED` and `SUBSCRIPTION_EXPIRED` analytics event constants
- Installed sonner toast library, added `<Toaster />` to root layout
- Added tier downgrade detection in DashboardShell via `useRef` + `useEffect` pattern
- 10 new backend tests (invoice.payment_failed: 6, customer.subscription.deleted: 3, past_due updated: 1)
- 3 new frontend tests for downgrade toast behavior
- Updated existing "unhandled event types" test to use `payment_intent.succeeded` (was using `invoice.payment_failed`)
- All 661 tests passing (379 API + 282 web), lint clean, no type regressions

### File List

- `apps/api/src/services/subscription/webhookHandler.ts` (modified)
- `apps/api/src/services/subscription/webhookHandler.test.ts` (modified)
- `apps/web/app/dashboard/DashboardShell.tsx` (modified)
- `apps/web/app/dashboard/DashboardShell.test.tsx` (modified)
- `apps/web/app/layout.tsx` (modified)
- `apps/web/components/common/ResponsiveToaster.tsx` (new — review fix M2)
- `apps/web/package.json` (modified — sonner dependency)
- `packages/shared/src/constants/index.ts` (modified)
- `pnpm-lock.yaml` (modified — sonner lockfile)

## Change Log

- 2026-03-29: Implemented Story 5.4 — payment failure webhook handling, subscription deletion, downgrade toast notification. 10 backend + 3 frontend tests added.
- 2026-03-29: Code review fixes — 3M + 4L findings. Added logger.warn for owner-not-found in payment_failed/deleted handlers (M1). Responsive toast position: top-center on mobile per UX spec (M2). Added analytics comment on past_due branch (M3). Added owner-not-found test for invoice.payment_failed (L1). Fixed misleading test name (L2). Added useCreateShareLink mock (L3). Updated File List (L4).
