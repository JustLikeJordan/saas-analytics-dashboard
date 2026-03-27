# Story 5.3: Subscription Status Verification

Status: done

<!-- Validated: 2026-03-26. 2 critical + 3 enhancements applied. All 4 steps: Create ✓ → Validate ✓ → Dev → Code Review -->

## Story

As the **system**,
I want to verify subscription status before granting access to Pro-only features,
so that only paying organizations receive premium capabilities.

## Acceptance Criteria

1. **Given** a user requests a Pro-only feature (full AI summary), **When** the API processes the request, **Then** the subscription status is verified against the `subscriptions` table before granting access (FR31), **And** the subscription gate annotates (does not block) — free tier gets truncated response + `upgrade_required` SSE event.

2. **Given** a subscription record exists, **When** the status is checked, **Then** the system considers: active, canceled-but-within-period, expired, and failed states, **And** only active or within-period subscriptions grant Pro access.

## Tasks / Subtasks

- [x] **Task 1: Create `useSubscription` client hook** (AC: 1, 2)
  - [x] Create `apps/web/lib/hooks/useSubscription.ts`
  - [x] Use SWR to fetch `/api/subscriptions` (GET) — same endpoint BillingContent already uses
  - [x] Return `{ tier: SubscriptionTier, isLoading: boolean, isPro: boolean, mutate }` — `isPro` is a convenience boolean (`tier === 'pro'`)
  - [x] `mutate` exposed so callers can trigger revalidation (e.g., after checkout return)
  - [x] SWR config: `revalidateOnFocus: true` — ensures tier updates when user returns from Stripe Portal/Checkout
  - [x] Only fetch when authenticated — accept `enabled?: boolean` option, skip fetch when false (anonymous visitors shouldn't hit this endpoint)
  - [x] Accept `fallbackData?: SubscriptionTier` option — passed through to SWR's `fallbackData` for SSR hydration (used by DashboardShell in Task 3)
  - [x] Default `tier` to `'free'` while loading (before SWR resolves) — safe for gating logic, matches server-side default
  - [x] Parse the nested API response shape: `/api/subscriptions` returns `{ data: { tier } }`, not a flat `{ tier }`
  - [x] Type import: `import type { SubscriptionTier } from 'shared/types'`

- [x] **Task 2: Refactor BillingContent to use `useSubscription` hook** (AC: 1)
  - [x] Replace inline SWR call in `apps/web/app/billing/BillingContent.tsx` with `useSubscription({ enabled: true })`
  - [x] Remove local `fetcher` function and raw SWR import
  - [x] Use `tier`, `isLoading` from hook (isPro available but not needed — existing JSX uses tier string comparisons)
  - [x] Behavior must remain identical — this is a pure refactor with no UI changes

- [x] **Task 3: Add subscription status to DashboardShell** (AC: 1, 2)
  - [x] `DashboardShell` already receives `tier` as a prop from the server-side `DashboardPage`
  - [x] For authenticated users, add `useSubscription({ enabled: hasAuth, fallbackData: tier })` in `DashboardShell` (client component) to enable real-time tier awareness via SWR's `revalidateOnFocus`
  - [x] The `fallbackData` option passes the server-fetched `tier` prop through to SWR — no loading flash on initial render, SWR revalidates in background
  - [x] Pass the client-resolved `tier` to `useAiStream` and upgrade CTA components so they reflect current subscription state without a full page reload

- [x] **Task 4: Harden `getActiveTier()` for expired and failed states** (AC: 2)
  - [x] Current `getActiveTier()` already handles `active` and `canceled-but-within-period` (Story 5.2)
  - [x] Verify behavior for `expired` status: should return `'free'` — currently works by exclusion (only `active` and `canceled` with valid period match), but add an explicit test
  - [x] Verify behavior for `past_due` status: should return `'free'` — same exclusion logic, add explicit test
  - [x] Verify behavior for `canceled` with `currentPeriodEnd` in the past: should return `'free'` — the `gt(currentPeriodEnd, now)` check handles this, add explicit test
  - [x] **No code changes to `getActiveTier()` expected** — this task is about adding missing test coverage for the status matrix documented in AC 2

- [x] **Task 5: Add `subscription.status_checked` analytics event** (AC: 1)
  - [x] Add `SUBSCRIPTION_STATUS_CHECKED: 'subscription.status_checked'` to `ANALYTICS_EVENTS` in `packages/shared/src/constants/index.ts`
  - [x] In `subscriptionGate.ts`, after resolving the tier, call `trackEvent(orgId, userId, SUBSCRIPTION_STATUS_CHECKED, { tier, source: 'gate' })` — fire-and-forget
  - [x] **Only fire for authenticated requests** (skip when no `orgId`) to avoid noise from anonymous seed-data viewers
  - [x] This gives visibility into how often the gate runs and what tiers it resolves — feeds Epic 7 analytics completeness (Story 7.4)

- [x] **Task 6: Tests** (AC: 1, 2)
  - [x] `apps/web/lib/hooks/useSubscription.test.ts`:
    - [x] `it('returns free tier when no subscription exists')`
    - [x] `it('returns pro tier for active subscription')`
    - [x] `it('skips fetch when enabled is false')`
    - [x] `it('defaults to free while loading')`
    - [x] `it('uses fallbackData when provided')`
    - [x] `it('exposes mutate for manual revalidation')`
  - [x] `apps/api/src/db/queries/subscriptions.test.ts` (extend existing):
    - [x] `it('returns free for expired subscription')` — status `'expired'`, any period
    - [x] `it('returns free for past_due subscription')` — status `'past_due'`, any period
    - [x] `it('returns free for canceled subscription with period in the past')` — confirms time-based exclusion
  - [x] `apps/api/src/middleware/subscriptionGate.test.ts` (extend existing):
    - [x] `it('fires subscription.status_checked analytics event for authenticated requests')`
    - [x] `it('skips analytics event for unauthenticated requests')`
  - [x] Verify all existing tests still pass unchanged — 649 tests (370 API + 279 web), 0 regressions

## Dev Notes

### Architecture Compliance

- **Subscription gate is ANNOTATING, not blocking for AI endpoints**: `subscriptionGate.ts` sets `req.subscriptionTier` and always calls `next()`. The AI summary route reads this annotation to decide stream length. This is a core architecture decision (project-context.md lines 470-477) — do NOT change this behavior.
- **`getActiveTier()` checks local DB, never Stripe API**: Webhook-synced state. The gate must be fast (no external calls). This is already correct.
- **BFF proxy pattern**: Frontend calls `/api/subscriptions` (Next.js route handler) → proxies to Express `/subscriptions/tier`. Never call Express directly from client components.
- **Dual API client**: Server Components use `apiServer` (direct Docker call `http://api:3001`). Client Components use SWR hitting `/api/*` proxy routes. The `useSubscription` hook is client-side, so it uses the proxy path.
- **No new env vars needed**: All subscription config exists in `config.ts`.
- **No CORS**: BFF proxy = same-origin. Don't add it.

### Existing Code to Reuse (DO NOT reinvent)

| What | Where | Why |
|------|-------|-----|
| `subscriptionGate` middleware | `apps/api/src/middleware/subscriptionGate.ts` | Already works — extend with analytics, don't restructure |
| `getActiveTier()` | `apps/api/src/db/queries/subscriptions.ts` | Already handles active + canceled-within-period. No code changes — only test coverage. |
| `GET /subscriptions/tier` | `apps/api/src/routes/subscriptions.ts` | API endpoint already exists, returns `{ data: { tier } }` |
| BFF proxy route | `apps/web/app/api/subscriptions/route.ts` | GET handler already proxies to Express tier endpoint |
| `fetchTier()` in DashboardPage | `apps/web/app/dashboard/page.tsx:34-43` | Server-side tier fetch — becomes `fallbackData` for SWR |
| SWR pattern in BillingContent | `apps/web/app/billing/BillingContent.tsx:13` | Currently fetches `/api/subscriptions` inline — refactor to shared hook |
| `trackEvent()` | `apps/api/src/services/analytics/trackEvent.ts` | Fire-and-forget pattern with `.catch()` internal |
| `ANALYTICS_EVENTS` | `packages/shared/src/constants/index.ts` | Add alongside existing `SUBSCRIPTION_CANCELLED` |
| `SubscriptionTier` type | `packages/shared/src/types/subscription.ts` | Already exported: `'free' \| 'pro'` |

### Patterns Established in Stories 5.1 and 5.2

- **Lazy Stripe init**: `getStripe()` pattern — not relevant here (no Stripe calls), but don't create any.
- **Webhook-synced DB state**: `getActiveTier()` reads from PostgreSQL, not Stripe. Webhooks keep DB in sync. Gate relies on this.
- **SWR for subscription state**: BillingContent already uses SWR to fetch tier. The `useSubscription` hook extracts this into a reusable pattern.
- **`TieredRequest` type**: Already defined in `subscriptionGate.ts` — extends `Request` with `subscriptionTier`.
- **Test mocking**: `vi.mock('../db/queries/index.js')` pattern used by existing `subscriptionGate.test.ts`.

### Critical Implementation Details

**`useSubscription` hook shape:**
```typescript
interface UseSubscriptionOptions {
  enabled?: boolean;      // skip fetch for anonymous users
  fallbackData?: SubscriptionTier; // server-fetched tier for SSR hydration (avoids loading flash)
}

interface UseSubscriptionResult {
  tier: SubscriptionTier;  // defaults to 'free' while loading — safe for gating logic
  isPro: boolean;
  isLoading: boolean;
  mutate: () => Promise<void>;
}
```

**SWR response parsing:**
The BFF proxy at `/api/subscriptions` returns `{ data: { tier: 'free' | 'pro' } }`. The hook's SWR fetcher must extract `tier` from this nested shape — don't assume a flat response.

**Default `tier` while loading:** Return `'free'` as the initial value before SWR resolves. This matches `subscriptionGate.ts` which also defaults to `'free'` on any failure. Downstream consumers can safely use `tier` without null-checking.

**SWR `fallbackData` pattern for DashboardShell:**
The dashboard SSR already fetches tier via `apiServer('/subscriptions/tier')` (line 79 of `page.tsx`). Pass this as `fallbackData` to `useSubscription` via the `fallbackData` option so there's no loading flash on initial render. Example: `useSubscription({ enabled: hasAuth, fallbackData: tier })`. SWR then revalidates in the background on focus, keeping the tier fresh without a page reload.

**`revalidateOnFocus` note:**
`revalidateOnFocus: true` is SWR's default behavior — you don't need to set it explicitly. It's documented here because it's the mechanism that makes the Checkout → return flow work: user goes to Stripe, pays, returns to the app, SWR refetches on window focus. The webhook fires nearly instantly (`checkout.session.completed`), so by the time the user returns, the DB has the new subscription. Same applies to Stripe Portal → cancel → return.

**Analytics event volume and gate scope:**
`subscriptionGate` middleware is applied to the AI summary route specifically — it does NOT run on every Express route. So `subscription.status_checked` fires once per dashboard load per authenticated user (when the AI summary endpoint is hit). Volume is modest. Don't batch or debounce — fire-and-forget is fine.

**What `getActiveTier()` already covers (Story 5.2):**
| Status | currentPeriodEnd | Result | Why |
|--------|-----------------|--------|-----|
| `active` | future | `pro` | Active subscription |
| `active` | null | `pro` | Fresh checkout, webhook hasn't populated period yet |
| `canceled` | future | `pro` | User canceled but paid through period |
| `canceled` | past | `free` | Period expired after cancellation |
| `canceled` | null | `free` | Edge case — defensively handled |
| `expired` | any | `free` | Not matched by either OR branch |
| `past_due` | any | `free` | Not matched — deferred to Story 5.4 for webhook handling |
| No record | — | `free` | Empty result set |
| DB error | — | `free` | Catch block returns free |

Task 4 adds explicit test coverage for the rows marked "Not matched" — confirms they return `free` by exclusion, not by accident.

### What This Story Does NOT Include

- Payment failure webhook handling (`invoice.payment_failed`) — that's Story 5.4
- Pro access revocation toast notification — that's Story 5.4
- Stripe Portal or Checkout session creation — that's Story 5.1 (done)
- Webhook handler changes — that's Stories 5.1/5.2 (done)
- Any changes to `getActiveTier()` logic — only test coverage additions
- Blocking behavior (403 responses) for any endpoint — the gate annotates only

### Project Structure Notes

**New files to create:**
```
apps/web/lib/hooks/useSubscription.ts          — Shared SWR hook for subscription tier
apps/web/lib/hooks/useSubscription.test.ts      — Hook unit tests
```

**Files to modify:**
```
apps/web/app/billing/BillingContent.tsx          — Refactor to use useSubscription hook
apps/web/app/dashboard/DashboardShell.tsx        — Add useSubscription for real-time tier (if client component)
apps/api/src/middleware/subscriptionGate.ts       — Add analytics event tracking
apps/api/src/middleware/subscriptionGate.test.ts  — Add analytics event tests
apps/api/src/db/queries/subscriptions.test.ts     — Add expired/past_due/past-period test cases
packages/shared/src/constants/index.ts            — Add SUBSCRIPTION_STATUS_CHECKED constant
```

### Testing Strategy

**Frontend (Vitest + React Testing Library):**
```
apps/web/lib/hooks/useSubscription.test.ts
  describe('useSubscription')
    it('returns free tier when no subscription exists')
    it('returns pro tier for active subscription')
    it('skips fetch when enabled is false')
    it('exposes mutate for manual revalidation')
```

**Backend (Vitest):**
```
apps/api/src/db/queries/subscriptions.test.ts (extend)
  describe('getActiveTier — status matrix')
    it('returns free for expired subscription')
    it('returns free for past_due subscription')
    it('returns free for canceled subscription with past period')

apps/api/src/middleware/subscriptionGate.test.ts (extend)
  describe('analytics tracking')
    it('fires subscription.status_checked for authenticated requests')
    it('skips analytics for unauthenticated requests')
```

**What NOT to test:**
- Stripe API calls — no Stripe interaction in this story
- Webhook handling — covered by Stories 5.1/5.2
- SSE streaming behavior — covered by Story 3.3
- BFF proxy route — already exists, no changes

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 5.3 acceptance criteria, lines 1135-1152]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR31 status verification mapping, line 1247]
- [Source: _bmad-output/project-context.md — subscription gate annotating behavior, lines 470-477]
- [Source: _bmad-output/project-context.md — dual API client pattern, lines 383-386]
- [Source: _bmad-output/project-context.md — SWR patterns, lines 184-188]
- [Source: apps/api/src/middleware/subscriptionGate.ts — existing gate middleware, 31 lines]
- [Source: apps/api/src/db/queries/subscriptions.ts — getActiveTier with full status handling, lines 10-33]
- [Source: apps/api/src/routes/subscriptions.ts — GET /tier endpoint, line 11-15]
- [Source: apps/web/app/api/subscriptions/route.ts — BFF proxy GET handler, lines 25-34]
- [Source: apps/web/app/dashboard/page.tsx — server-side fetchTier, lines 34-43]
- [Source: apps/web/app/billing/BillingContent.tsx — inline SWR tier fetch, line 13]
- [Source: _bmad-output/implementation-artifacts/5-2-subscription-lifecycle-management.md — Story 5.2 patterns, dev notes, and "useSubscription not needed until 5.3" note at line 179]
- [Source: packages/shared/src/types/subscription.ts — SubscriptionTier type definition]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- SWR cache deduplication between tests caused false failures — fixed by wrapping renderHook in SWRConfig with fresh `provider: () => new Map()`
- `ANALYTICS_EVENTS.SUBSCRIPTION_STATUS_CHECKED` resolved to `undefined` in tests until shared package was rebuilt (`pnpm --filter shared build`)
- Pre-existing type-check errors — not caused by this story, not addressed:
  - `src/routes/subscriptions.test.ts` (TS18046 on `unknown` json)
  - `src/routes/stripeWebhook.test.ts` (TS18046 on `unknown` json)
  - `src/db/queries/subscriptions.test.ts:145,152` (TS2532 + TS2339 in WHERE clause structural test from Story 5.2)

### Completion Notes List

- Created `useSubscription` SWR hook with `enabled`, `fallbackData`, and `mutate` support. Defaults to `'free'` while loading — safe for all downstream gating logic.
- Refactored BillingContent from inline SWR to shared hook — removed local fetcher, raw SWR import, and response parsing.
- Added real-time tier awareness to DashboardShell via `useSubscription({ enabled: hasAuth, fallbackData: serverTier })`. Server-fetched tier used as fallbackData for zero-flash hydration; SWR revalidates on focus for Checkout return flow.
- No code changes to `getActiveTier()` — added 3 explicit test cases for expired, past_due, and canceled-with-past-period statuses (all return `'free'` by exclusion).
- Added `subscription.status_checked` analytics event to `subscriptionGate.ts` — fires for authenticated requests only, fire-and-forget via `trackEvent`.
- Total: 11 new tests added (6 hook + 3 query + 2 gate). 649/649 tests pass, 0 regressions. Lint clean.

### File List

**New files:**
- `apps/web/lib/hooks/useSubscription.ts`
- `apps/web/lib/hooks/useSubscription.test.ts`

**Modified files:**
- `apps/web/app/billing/BillingContent.tsx`
- `apps/web/app/dashboard/DashboardShell.tsx`
- `apps/api/src/middleware/subscriptionGate.ts`
- `apps/api/src/middleware/subscriptionGate.test.ts`
- `apps/api/src/db/queries/subscriptions.test.ts`
- `packages/shared/src/constants/index.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- **2026-03-27**: Story 5.3 implemented — subscription status verification with real-time client-side tier awareness, analytics tracking, and full status matrix test coverage.
- **2026-03-27**: Code review — 0 HIGH, 3 MEDIUM, 2 LOW. Fixed: clarified ghost test limitation in subscriptions.test.ts (M1), documented all pre-existing type errors in dev notes (M2), added comment explaining revalidateOnReconnect:false (M3), added dynamic import explanation in hook tests (L2). L1 (missing error state) deferred — not a regression.
