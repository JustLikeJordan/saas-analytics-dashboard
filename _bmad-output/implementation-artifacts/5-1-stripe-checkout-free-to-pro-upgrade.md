# Story 5.1: Stripe Checkout & Free-to-Pro Upgrade

Status: done

<!-- Note: Validation is REQUIRED. Every story must complete all 4 steps: Create → Validate → Dev → Code Review. -->

## Story

As an **org owner**,
I want to upgrade my organization from Free to Pro tier via Stripe Checkout,
so that I can unlock full AI analysis for my business data.

## Acceptance Criteria

1. **Given** I am an authenticated org owner on the free tier, **When** I click the upgrade CTA (from AiSummaryCard or billing page), **Then** I am redirected to a Stripe Checkout session in test mode with production-identical code (FR28), **And** the `/billing` action route is protected by `proxy.ts`.

2. **Given** Stripe Checkout completes successfully, **When** the success callback fires, **Then** a `subscriptions` table record is created linking the Stripe subscription to my org, **And** my org's tier is updated to Pro, **And** the `subscription.upgraded` analytics event fires.

3. **Given** I return to the dashboard after upgrading, **When** the AI summary loads, **Then** the full AI summary streams without the ~150 word truncation or blur overlay, **And** the UpgradeCta from Story 3.5 is enabled and navigates to the billing flow (replacing the disabled "Pro plan coming soon" state).

4. **Given** the Stripe integration is called, **When** the request is made, **Then** timeout handling and structured error responses are in place (NFR20).

5. **Given** the `subscriptions` table is created, **When** database security is configured, **Then** RLS policies are applied to `subscriptions` scoped by `org_id`.

## Tasks / Subtasks

- [x] **Task 0: Install `stripe` npm package** (AC: 1, 2, 4)
  - [x] `pnpm add stripe --filter api` — stripe v20.4.1 installed
  - [x] SDK is typed — no `@types/stripe` needed.

- [x] **Task 1: Create `services/subscription/stripeService.ts`** (AC: 1, 4)
  - [x] Lazy Stripe SDK init via `getStripe()` — avoids module-scope side effects in tests
  - [x] `createCheckoutSession(orgId, userId)`: metadata correlation, customer reuse, ExternalServiceError wrapping
  - [x] `createPortalSession(stripeCustomerId)`: Stripe Customer Portal session
  - [x] `services/subscription/index.ts` barrel re-export

- [x] **Task 2: Create `services/subscription/webhookHandler.ts`** (AC: 2)
  - [x] `handleWebhookEvent(event)` with `checkout.session.completed` handler
  - [x] Idempotent upsert via `subscriptionsQueries.upsertSubscription()`
  - [x] Fires `subscription.upgraded` analytics event
  - [x] Structured Pino logging for each event type

- [x] **Task 3: Create `routes/stripeWebhook.ts`** (AC: 2, 4)
  - [x] `POST /webhooks/stripe` with `express.raw()` body parser
  - [x] Signature verification via `getStripe().webhooks.constructEvent()`
  - [x] Mounted in `index.ts` before `express.json()` middleware

- [x] **Task 4: Extend `routes/subscriptions.ts`** (AC: 1)
  - [x] `POST /checkout` and `POST /portal` routes with `roleGuard('owner')`
  - [x] Uses `Number(user.sub)` for userId (JWT uses `sub` string, not `id`)

- [x] **Task 5: Extend `db/queries/subscriptions.ts`** (AC: 2)
  - [x] `upsertSubscription()` with idempotency check (skips if already in target status)
  - [x] `getSubscriptionByOrgId()` for portal session customer reuse

- [x] **Task 6: Add RLS migration for `subscriptions` table** (AC: 5)
  - [x] `0011_add-rls-subscriptions.sql` — tenant isolation + admin bypass, mirrors 0010 pattern

- [x] **Task 7: Add `STRIPE_PRICE_ID` to config** (AC: 1)
  - [x] Added to `config.ts` Zod schema and `.env.example`
  - [x] Success/cancel URLs derived from existing `APP_URL` — no extra config needed

- [x] **Task 8: Create BFF proxy route `apps/web/app/api/subscriptions/route.ts`** (AC: 1)
  - [x] POST (checkout/portal via `?action=` param) and GET (tier) — mirrors shares pattern

- [x] **Task 9: Create `/billing` page** (AC: 1, 3)
  - [x] Server component shell + `BillingContent` client component
  - [x] Free tier: upgrade CTA → Stripe Checkout. Pro tier: manage subscription → Stripe Portal

- [x] **Task 10: Wire up `UpgradeCta` and `handleUpgrade`** (AC: 3)
  - [x] `handleUpgrade` → `router.push('/billing')`, removed disabled/disabledTooltip props
  - [x] Added `useRouter` mock to `AiSummaryCard.test.tsx` to fix 28 broken tests

- [x] **Task 11: Add `SUBSCRIPTION_UPGRADED` analytics event constant** (AC: 2)
  - [x] Added after `SUBSCRIPTION_UPGRADE_INTENDED` in shared constants

- [x] **Task 12: Add subscription schemas to shared package** (AC: 1)
  - [x] `checkoutSessionSchema` and `subscriptionStatusSchema` in shared schemas

- [x] **Task 13: Tests** (AC: 1-5)
  - [x] `stripeService.test.ts` (5 tests): checkout creation, customer reuse, portal, error wrapping
  - [x] `webhookHandler.test.ts` (4 tests): checkout.session.completed, missing metadata, analytics event
  - [x] `stripeWebhook.test.ts` (3 tests): missing sig, invalid sig, valid sig → 200
  - [x] `subscriptions.test.ts` (7 tests): GET /tier, POST /checkout, POST /portal, auth/role guards
  - [x] Fixed lazy Stripe init to prevent `aiSummary.test.ts` regression (eager constructor side effect)

## Dev Notes

### Architecture Compliance

- **Stripe webhook route BEFORE JSON parser**: `index.ts` line 21 has a TODO comment marking exactly where to mount it. The route uses `express.raw()` for raw body — Stripe signature verification requires the unparsed body.
- **Express middleware chain order**: correlationId → stripe webhook (raw body) → JSON parser → cookieParser → pino-http → routes → errorHandler. This is specified in architecture and CLAUDE.md.
- **Services import from `db/queries/` barrel**: `stripeService.ts` and `webhookHandler.ts` import from `db/queries/index.ts`, never `db/index.ts`.
- **Routes are thin**: `routes/subscriptions.ts` validates input, calls service, returns response. No Stripe SDK calls in routes.
- **Error chain**: service throws `ExternalServiceError` → Express 5 auto-catches → `errorHandler` formats structured JSON. No manual try/catch in async route handlers.
- **Subscription gate already works**: `subscriptionGate.ts` and `subscriptionsQueries.getActiveTier()` are fully implemented. Once a real subscription record exists in the DB with `status: 'active'` and valid `current_period_end`, the gate returns `'pro'`. No changes to the gate needed.
- **BFF proxy pattern**: browser → Next.js `/api/subscriptions` → Express `/subscriptions/checkout`. Browser never calls Express directly. Cookies forwarded via proxy.
- **`proxy.ts` already protects `/billing`**: it's in `PROTECTED_ROUTES` array at line 5. No changes needed.
- **Config-driven env access**: all Stripe keys read through `config.ts` Zod validation. Never `process.env.STRIPE_*`.
- **Test mode with production-identical code**: Stripe test mode uses `sk_test_*` keys. The code path is identical — only the keys differ between environments. No conditional logic for test vs production.

### Existing Code to Reuse (DO NOT reinvent)

| What | Where | Why |
|------|-------|-----|
| `subscriptions` table | `apps/api/src/db/schema.ts:222-238` | Already defined with all columns. Migration `0008` already exists. |
| `subscriptionGate.ts` | `apps/api/src/middleware/subscriptionGate.ts` | Fully implemented — annotates `req.subscriptionTier`. No changes needed. |
| `getActiveTier()` | `apps/api/src/db/queries/subscriptions.ts` | Already queries subscriptions table. Has try/catch fallback for missing table. |
| `SubscriptionTier` type | `packages/shared/src/types/subscription.ts` | `'free' \| 'pro'` — already exported. |
| `subscriptionsRouter` | `apps/api/src/routes/subscriptions.ts` | Already has `GET /tier`. Add POST routes here. |
| `UpgradeCta` component | `apps/web/components/common/UpgradeCta.tsx` | Fully built with disabled/enabled states. Just remove `disabled` prop at call sites. |
| `handleUpgrade` no-op | `apps/web/app/dashboard/AiSummaryCard.tsx:224-226` | Currently empty — wire to `router.push('/billing')`. |
| `SUBSCRIPTION_UPGRADE_INTENDED` | `packages/shared/src/constants/index.ts:45` | Analytics event for pre-checkout intent tracking. Keep — add `SUBSCRIPTION_UPGRADED` alongside it. |
| RLS migration pattern | `apps/api/drizzle/migrations/0010_add-rls-shares.sql` | Copy this pattern for subscriptions RLS. |
| BFF proxy route pattern | `apps/web/app/api/shares/route.ts` | POST handler that proxies to Express with cookie forwarding. Mirror for subscriptions. |
| `ExternalServiceError` | `apps/api/src/lib/appError.ts` | Error class for wrapping Stripe API failures. |
| `trackEvent()` | `apps/api/src/services/analytics/trackEvent.ts` | Fire `subscription.upgraded` event from webhook handler. |
| `env` config | `apps/api/src/config.ts:8-9` | Already has `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Add `STRIPE_PRICE_ID`. |
| Protected router | `apps/api/src/routes/protected.ts:19` | `subscriptionsRouter` already mounted at `/subscriptions` with `authMiddleware`. |

### Patterns Established in Previous Stories

- **`params` is a Promise in Next.js 16**: `const { token } = await params;`
- **BFF proxy route**: `apps/web/app/api/shares/route.ts` — POST handler reads cookies, forwards to Express `API_INTERNAL_URL`, returns response.
- **RLS migration**: `0010_add-rls-shares.sql` — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY; CREATE POLICY ... USING (org_id = current_setting('app.org_id')::integer);`
- **Analytics event tracking**: `trackEvent({ orgId, userId, eventType, metadata })` — fire from service layer, not route handlers.
- **Discriminated union error handling**: `fetchShare()` pattern from Story 4.3 — return `{ status: 'ok' | 'error' }` instead of nested try-catch. Consider for checkout session creation.
- **`motion-reduce:duration-0`** on all animations.
- **`within()` scoping + `afterEach(cleanup)`** in component tests.

### Technical Decisions

- **Stripe test mode is sufficient for portfolio**: Real Stripe test keys (`sk_test_*`, `pk_test_*`) exercise the full Checkout flow — redirects, webhooks, session management. No mock Stripe needed. The hiring manager can see the real flow with test card numbers.
- **Stripe Customer Portal for cancellation**: Architecture specifies no custom cancellation UI. `POST /subscriptions/portal` redirects to Stripe's hosted portal page. This handles cancellation, payment method updates, and invoice history.
- **Webhook before JSON parser**: Stripe requires the raw request body for signature verification. The webhook route must use `express.raw()` and be mounted before `express.json()`. The TODO in `index.ts:21` marks the exact insertion point.
- **`metadata.orgId` on Checkout session**: When Stripe fires `checkout.session.completed`, the webhook handler reads `session.metadata.orgId` to know which org to update. This avoids a database lookup to correlate customer → org.
- **Idempotent webhook handling**: `UPDATE subscriptions SET status = 'active' WHERE stripe_subscription_id = $1 AND status != 'active'` — if the row is already active, the query is a no-op. Stripe may deliver the same webhook multiple times (NFR22).
- **No `useSubscription` hook needed yet**: The billing page is server-rendered. The dashboard already gets tier info from SSE (`upgrade_required` event) and cached content truncation. Story 5.3 will add the subscription verification middleware. For now, the existing `subscriptionGate.ts` handles it.

### What This Story Does NOT Include

- Webhook handlers for `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated` — those are Story 5.2 and 5.4
- Subscription status verification middleware changes — that's Story 5.3
- Payment failure handling / Pro access revocation — that's Story 5.4
- The `useSubscription.ts` hook referenced in the architecture file tree — not needed until Story 5.3
- Stripe Customer Portal for cancellation management — the route is created here but the UI trigger is Story 5.2
- Any changes to `subscriptionGate.ts` — it already works correctly

### Project Structure Notes

**New files to create:**
```
apps/api/src/services/subscription/stripeService.ts     — Stripe Checkout + Portal session creation
apps/api/src/services/subscription/webhookHandler.ts    — Webhook event processing
apps/api/src/services/subscription/index.ts             — Barrel re-export
apps/api/src/routes/stripeWebhook.ts                    — POST /webhooks/stripe (raw body)
apps/api/drizzle/migrations/0011_add-rls-subscriptions.sql — RLS policy
apps/web/app/billing/page.tsx                           — Billing page (subscription status + upgrade)
apps/web/app/api/subscriptions/route.ts                 — BFF proxy for checkout/portal
packages/shared/src/schemas/subscriptions.ts            — Checkout + status schemas
apps/api/src/services/subscription/stripeService.test.ts
apps/api/src/services/subscription/webhookHandler.test.ts
apps/api/src/routes/stripeWebhook.test.ts
```

**Files to modify:**
```
apps/api/src/index.ts                                   — Mount webhook route before JSON parser
apps/api/src/config.ts                                  — Add STRIPE_PRICE_ID (and optionally STRIPE_SUCCESS_URL, STRIPE_CANCEL_URL)
apps/api/src/routes/subscriptions.ts                    — Add POST /checkout and POST /portal routes
apps/api/src/db/queries/subscriptions.ts                — Add upsertSubscription, getSubscriptionByOrgId
apps/api/src/db/queries/index.ts                        — Re-export new query functions
apps/web/app/dashboard/AiSummaryCard.tsx                — Wire handleUpgrade to router.push('/billing')
packages/shared/src/constants/index.ts                  — Add SUBSCRIPTION_UPGRADED event
packages/shared/src/schemas/index.ts                    — Re-export subscription schemas
docker-compose.yml or .env.example                      — Add STRIPE_PRICE_ID env var
```

### Testing Strategy

**Unit tests:**
- `stripeService.test.ts`: mock `stripe.checkout.sessions.create()`, verify session params (mode, metadata, success/cancel URLs), test error wrapping to `ExternalServiceError`
- `webhookHandler.test.ts`: mock `subscriptionsQueries.upsertSubscription()` and `trackEvent()`, test `checkout.session.completed` processing, verify idempotency (call twice, second is no-op), verify analytics event fires
- `stripeWebhook.test.ts`: mock `stripe.webhooks.constructEvent()`, test valid signature → 200, invalid signature → 400, test event routing to handler
- `subscriptions.test.ts`: test POST /checkout returns checkout URL, test POST /portal returns portal URL, test auth required (401 without token)

**What NOT to test (and why):**
- Stripe Checkout redirect flow end-to-end — that's Stripe's responsibility, not ours
- Actual Stripe API calls — mock the SDK in tests
- The billing page RSC rendering — visual verification, not worth mocking Next.js internals
- `subscriptionGate.ts` changes — there are none; existing tests cover it

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 5.1 acceptance criteria, lines 1080-1110]
- [Source: _bmad-output/planning-artifacts/architecture.md — subscriptions table schema, line 228]
- [Source: _bmad-output/planning-artifacts/architecture.md — subscription gate behavior, line 262]
- [Source: _bmad-output/planning-artifacts/architecture.md — Stripe webhook handling, line 249]
- [Source: _bmad-output/planning-artifacts/architecture.md — file tree: services/subscription/*, lines 831-834]
- [Source: _bmad-output/planning-artifacts/architecture.md — file tree: routes/subscriptions.ts + stripeWebhook.ts, lines 798-799]
- [Source: _bmad-output/planning-artifacts/architecture.md — middleware chain order, line 173 of project-context.md]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR28-31 mapping, lines 1244-1247]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR12 webhook verification, line 1274]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR22 idempotent webhooks, line 1284]
- [Source: _bmad-output/planning-artifacts/architecture.md — Stripe Customer Portal addition, line 1366]
- [Source: _bmad-output/project-context.md — Stripe webhook before JSON parser, lines 75 and 173]
- [Source: _bmad-output/project-context.md — subscription gate behavior, lines 467-476]
- [Source: _bmad-output/project-context.md — Stripe webhook handling rules, lines 479-487]
- [Source: apps/api/src/index.ts:21 — TODO comment for webhook mount point]
- [Source: apps/api/src/config.ts:8-9 — STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET already in config]
- [Source: apps/api/src/middleware/subscriptionGate.ts — existing implementation, no changes needed]
- [Source: apps/api/src/db/queries/subscriptions.ts — existing getActiveTier(), extend with upsert/get]
- [Source: apps/web/app/dashboard/AiSummaryCard.tsx:224-226 — handleUpgrade no-op placeholder]
- [Source: apps/web/components/common/UpgradeCta.tsx — disabled/enabled API ready]
- [Source: apps/web/proxy.ts:5 — /billing already in PROTECTED_ROUTES]
- [Source: apps/web/app/api/shares/route.ts — BFF proxy route pattern to mirror]
- [Source: apps/api/drizzle/migrations/0010_add-rls-shares.sql — RLS migration pattern]
- [Source: _bmad-output/implementation-artifacts/4-3-shared-insight-card-view.md — previous story patterns and learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Lazy Stripe init refactor: eager `new Stripe()` at module scope caused `aiSummary.test.ts` to crash (transitive import triggered constructor before env mocks). Fixed with `getStripe()` pattern.
- JWT payload uses `sub` (string) not `id`: `subscriptions.ts` route initially passed `user.id` (undefined) to `createCheckoutSession`. Fixed to `Number(user.sub)`.
- `pnpm add stripe --filter @repo/api` failed — package name is `api` not `@repo/api`.

### Completion Notes List

- All 14 tasks (0-13) complete
- 352 API tests pass, 273 web tests pass — zero failures
- 19 new tests added across 4 test files
- Lazy Stripe initialization prevents test pollution across unrelated test suites

### Change Log

| Action | File | What Changed |
|--------|------|--------------|
| created | `apps/api/src/services/subscription/stripeService.ts` | Lazy Stripe init, checkout + portal session creation |
| created | `apps/api/src/services/subscription/webhookHandler.ts` | Webhook event handler for checkout.session.completed |
| created | `apps/api/src/services/subscription/index.ts` | Barrel re-export |
| created | `apps/api/src/routes/stripeWebhook.ts` | POST /webhooks/stripe with raw body + sig verification |
| created | `apps/api/drizzle/migrations/0011_add-rls-subscriptions.sql` | RLS tenant isolation + admin bypass |
| created | `apps/web/app/billing/page.tsx` | Billing page server component shell |
| created | `apps/web/app/billing/BillingContent.tsx` | Billing page client component |
| created | `apps/web/app/api/subscriptions/route.ts` | BFF proxy for checkout/portal/tier |
| created | `packages/shared/src/schemas/subscriptions.ts` | Checkout + status Zod schemas |
| created | `apps/api/src/services/subscription/stripeService.test.ts` | 5 tests |
| created | `apps/api/src/services/subscription/webhookHandler.test.ts` | 4 tests |
| created | `apps/api/src/routes/stripeWebhook.test.ts` | 3 tests |
| modified | `apps/api/package.json` | Added stripe v20.4.1 |
| modified | `apps/api/src/index.ts` | Mounted stripeWebhookRouter before JSON parser |
| modified | `apps/api/src/config.ts` | Added STRIPE_PRICE_ID to Zod schema |
| modified | `apps/api/src/routes/subscriptions.ts` | Added POST /checkout and POST /portal routes |
| modified | `apps/api/src/db/queries/subscriptions.ts` | Added upsertSubscription, getSubscriptionByOrgId |
| modified | `apps/web/app/dashboard/AiSummaryCard.tsx` | Wired handleUpgrade to router.push('/billing') |
| modified | `apps/web/app/dashboard/AiSummaryCard.test.tsx` | Added useRouter mock |
| modified | `apps/api/src/routes/subscriptions.test.ts` | Extended with checkout/portal/role tests |
| modified | `packages/shared/src/constants/index.ts` | Added SUBSCRIPTION_UPGRADED event |
| modified | `packages/shared/src/schemas/index.ts` | Re-exported subscription schemas |
| modified | `.env.example` | Added STRIPE_PRICE_ID placeholder |

### File List

**New files:**
- `apps/api/src/services/subscription/stripeService.ts`
- `apps/api/src/services/subscription/webhookHandler.ts`
- `apps/api/src/services/subscription/index.ts`
- `apps/api/src/routes/stripeWebhook.ts`
- `apps/api/drizzle/migrations/0011_add-rls-subscriptions.sql`
- `apps/web/app/billing/page.tsx`
- `apps/web/app/billing/BillingContent.tsx`
- `apps/web/app/api/subscriptions/route.ts`
- `packages/shared/src/schemas/subscriptions.ts`
- `apps/api/src/services/subscription/stripeService.test.ts`
- `apps/api/src/services/subscription/webhookHandler.test.ts`
- `apps/api/src/routes/stripeWebhook.test.ts`

**Modified files:**
- `apps/api/package.json`
- `apps/api/src/index.ts`
- `apps/api/src/config.ts`
- `apps/api/src/routes/subscriptions.ts`
- `apps/api/src/routes/subscriptions.test.ts`
- `apps/api/src/db/queries/subscriptions.ts`
- `apps/web/app/dashboard/AiSummaryCard.tsx`
- `apps/web/app/dashboard/AiSummaryCard.test.tsx`
- `packages/shared/src/constants/index.ts`
- `packages/shared/src/schemas/index.ts`
- `.env.example`
