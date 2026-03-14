# Story 3.5: Free Preview with Upgrade CTA

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **free-tier user**,
I want to see a preview of the AI summary with a prompt to upgrade,
So that I understand the AI's value and am motivated to unlock the full analysis.

## Acceptance Criteria

1. **Backend streams ~150 words then sends upgrade_required** -- Given I am a free-tier user, when I view the AI summary, then the backend streams approximately 150 words then sends an `upgrade_required` SSE event (FR21). The `subscriptionGate.ts` middleware annotates `req.subscriptionTier` on the request object -- it NEVER returns 403 for AI endpoints. The `streamHandler.ts` reads the tier annotation and truncates free-tier streams after ~150 words.

2. **Frontend renders free preview with gradient blur + UpgradeCta** -- Given the frontend receives the `upgrade_required` SSE event, when it renders the AI summary card, then all received words render clearly, followed by a gradient overlay that fades into blurred placeholder text, and an `UpgradeCta` component appears below the blur.

3. **Graceful pre-payment behavior** -- Given Epic 5 (Stripe) is not yet implemented, when the UpgradeCta renders, then the button is disabled with a "Pro plan coming soon" tooltip (per guidance note F4). Clicking logs a `subscription.upgrade_intended` intent event for analytics without navigation. When Epic 5 is implemented (future), the button navigates to the billing/upgrade flow.

4. **Analytics tracking** -- Given the free preview is viewed, when the analytics event fires, then `ai_preview.viewed` is tracked via `trackEvent()` (FR40).

5. **Cached summaries also tier-gated** -- Given a cached AI summary exists and the user is free-tier, when the dashboard loads, then the cached content is truncated client-side at ~150 words with the same blur + UpgradeCta treatment. The cache stores the FULL summary always -- tier gating is a rendering concern, not a storage concern.

## Tasks / Subtasks

- [ ] Task 1: Create `subscriptionGate.ts` middleware (AC: #1)
  - [ ] 1.1 Create `apps/api/src/middleware/subscriptionGate.ts` -- Express middleware that annotates `req.subscriptionTier` on the request object. For MVP (pre-Epic 5), ALL authenticated users default to `'free'` since the `subscriptions` table doesn't exist yet. The middleware checks for a subscription record via `db/queries/subscriptions.ts` -- if no record found, defaults to `'free'`. This way Epic 5 only needs to populate the table, not change the middleware logic
  - [ ] 1.2 Type augmentation: extend Express `Request` interface with `subscriptionTier?: 'free' | 'pro'` in a declaration file or inline module augmentation. Place alongside the existing `AuthenticatedRequest` type pattern
  - [ ] 1.3 Create `apps/api/src/db/queries/subscriptions.ts` with `getActiveTier(orgId: number): Promise<'free' | 'pro'>` -- queries `subscriptions` table WHERE `org_id = orgId AND status = 'active' AND current_period_end > now()`. If table doesn't exist or no rows match, returns `'free'`. Use a try/catch for the "table doesn't exist" case so it degrades gracefully pre-Epic 5
  - [ ] 1.4 Export `getActiveTier` from `db/queries/index.ts` barrel
  - [ ] 1.5 Wire middleware into `aiSummary.ts` route -- apply `subscriptionGate` BEFORE the streaming logic but AFTER `authMiddleware`. The route handler reads `req.subscriptionTier` and passes it to `streamToSSE()`
  - [ ] 1.6 Unit tests: middleware sets `req.subscriptionTier` to `'free'` when no subscription exists, sets `'pro'` when active subscription found, defaults to `'free'` on query error

- [ ] Task 2: Enhance `streamHandler.ts` with free-tier truncation (AC: #1)
  - [ ] 2.1 Add `tier` parameter to `streamToSSE()` signature: `streamToSSE(req, res, orgId, datasetId, tier: 'free' | 'pro')`
  - [ ] 2.2 Track word count during streaming: in the `onDelta` callback, split accumulated text by whitespace and count words. When count >= 150 AND tier === 'free', stop forwarding text events to the client
  - [ ] 2.3 On truncation trigger: send `event: upgrade_required\ndata: {"wordCount": <actual>}\n\n` then immediately send `event: done\ndata: {"usage": null, "reason": "free_preview"}\n\n` and call `safeEnd()`. Abort the Claude stream -- no point consuming tokens past the preview
  - [ ] 2.4 **Full text still cached**: even though the client only sees ~150 words, the `storeSummary()` call should use the FULL accumulated text (if the stream completed before abort). If truncation happens mid-stream, cache what we have -- the full text may not be available, and that's OK. On next Pro-tier request, the cache will be stale and regenerated
  - [ ] 2.5 Pro tier: no truncation, full stream as before. The `tier` parameter only affects free-tier behavior
  - [ ] 2.6 Add `SseUpgradeRequiredEvent` type to `packages/shared/src/types/sse.ts`: `{ wordCount: number }`
  - [ ] 2.7 Export the new type from `packages/shared/src/types/index.ts`
  - [ ] 2.8 Unit tests: free tier truncates at ~150 words and sends upgrade_required event, pro tier streams fully, word count tracking accuracy, truncation aborts Claude stream, truncation with timeout interaction (timeout fires before 150 words -- timeout takes precedence)

- [ ] Task 3: Enhance `useAiStream` hook with free_preview state (AC: #2, #5)
  - [ ] 3.1 Add `UPGRADE_REQUIRED` action to `StreamAction` union: `{ type: 'UPGRADE_REQUIRED'; wordCount: number }`
  - [ ] 3.2 Handle `UPGRADE_REQUIRED` in `streamReducer`: set `status: 'free_preview'`, keep existing `text` (the ~150 words already streamed)
  - [ ] 3.3 Parse `event: upgrade_required` in `parseSseLines`: dispatch `UPGRADE_REQUIRED` with `wordCount` from data
  - [ ] 3.4 After `UPGRADE_REQUIRED`, the trailing `done` event should be a no-op (same pattern as timeout -- add `state.status === 'free_preview'` check to `DONE` handler)
  - [ ] 3.5 **Cached content free-tier truncation**: add a `truncateForFreePreview(content: string, wordLimit?: number): { preview: string; isTruncated: boolean }` utility. When the hook receives a `CACHE_HIT` and the caller indicates free tier, dispatch a new action that sets `free_preview` with truncated text. Expose a `subscriptionTier` param or let the component handle truncation
  - [ ] 3.6 Decision: the hook shouldn't know about tiers -- keep it pure SSE state. The `AiSummaryCard` component will handle cached content truncation based on a `tier` prop. The hook just exposes the `free_preview` status when it gets the SSE event
  - [ ] 3.7 Unit tests: reducer handles UPGRADE_REQUIRED (sets free_preview, preserves text), DONE after UPGRADE_REQUIRED is no-op, parseSseLines dispatches UPGRADE_REQUIRED on `event: upgrade_required`

- [ ] Task 4: Create `UpgradeCta` component (AC: #2, #3)
  - [ ] 4.1 Create `apps/web/components/common/UpgradeCta.tsx` -- shared component per UX spec
  - [ ] 4.2 **Overlay variant** (for AiSummaryCard free preview): centered over gradient blur. White Card with "Unlock full analysis" headline + "Get AI-powered insights for your business" subtext + "Upgrade to Pro" primary Button
  - [ ] 4.3 **Inline variant** (for standalone upgrade prompts): full-width Card with left-border accent. Same copy. Button text varies
  - [ ] 4.4 Props: `variant: 'overlay' | 'inline'`, `onUpgrade: () => void`, `disabled?: boolean`, `disabledTooltip?: string`
  - [ ] 4.5 **Pre-Epic 5 behavior**: pass `disabled={true}` and `disabledTooltip="Pro plan coming soon"`. The button is visually present but non-functional. On click of disabled button, fire the analytics intent event (Task 5)
  - [ ] 4.6 Accessibility: button uses `aria-label="Upgrade to Pro subscription"`. In overlay variant, blurred background has `aria-hidden="true"` so screen readers skip to CTA content. Disabled button keeps aria-label + tooltip announced via `aria-describedby`
  - [ ] 4.7 Styling: use shadcn Button `default` variant (primary). Disabled state uses `opacity-60` + `cursor-not-allowed`. Tooltip via shadcn Tooltip component (not custom). Button must meet 44x44px minimum touch target on mobile (WCAG 2.5.5 per UX spec Step 7) -- use `min-h-11 min-w-11` or equivalent padding
  - [ ] 4.8 Unit tests: renders overlay variant with blur background, renders inline variant without blur, disabled state shows tooltip, click fires onUpgrade callback, aria attributes correct

- [ ] Task 5: Enhance `AiSummaryCard` with free_preview state (AC: #2, #3, #4, #5)
  - [ ] 5.1 Add `tier?: 'free' | 'pro'` prop to `AiSummaryCardProps`. Default to `'free'` (safe default for pre-Epic 5)
  - [ ] 5.2 **Free preview state from SSE** (status === 'free_preview'): render the ~150 words of text clearly, then a gradient overlay (`bg-gradient-to-b from-transparent to-card`) that fades into blurred placeholder text (3-4 lines of lorem-style blurred text using `blur-sm`), then the `UpgradeCta` overlay variant centered over the blur. **Appearance is instant** -- no fade-in animation on the blur/UpgradeCta (paywall reveal should be immediate, not delayed). This also avoids needing a `prefers-reduced-motion` override for the reveal itself. Blurred placeholder text must replicate real text styling (Inter, same font-size/line-height) so it reads as "more content behind a paywall"
  - [ ] 5.3 **Cached content free-tier truncation**: when `hasCached` is true AND `tier === 'free'`, truncate `cachedContent` at ~150 words, render the preview text + gradient blur + UpgradeCta. Same visual treatment as SSE free preview
  - [ ] 5.4 Create `truncateAtWordBoundary(text: string, maxWords: number): { preview: string; wasTruncated: boolean }` utility -- split by whitespace, take first `maxWords`, rejoin. Handle edge case where text has fewer words than limit
  - [ ] 5.5 Wire `UpgradeCta` with `disabled={true}` and `disabledTooltip="Pro plan coming soon"` for pre-Epic 5
  - [ ] 5.6 The `onUpgrade` handler: fire `ai_preview.viewed` analytics event (Task 6), and log `subscription.upgrade_intended` for future funnel analysis
  - [ ] 5.7 **Post-completion footer hidden in free_preview state** -- Share and Transparency buttons don't show for free preview (user hasn't seen the full analysis)
  - [ ] 5.8 Replace the existing `if (status === 'free_preview') return null` with the actual free preview UI
  - [ ] 5.9 Unit tests: free_preview from SSE renders text + blur + UpgradeCta, cached content truncation for free tier, pro tier renders full cached content, UpgradeCta disabled with tooltip, analytics event fires on CTA interaction, PostCompletionFooter hidden in free_preview

- [ ] Task 6: Analytics events + shared constants (AC: #4)
  - [ ] 6.1 Add `AI_PREVIEW_VIEWED: 'ai_preview.viewed'` to `ANALYTICS_EVENTS` in `packages/shared/src/constants/index.ts`
  - [ ] 6.2 Add `SUBSCRIPTION_UPGRADE_INTENDED: 'subscription.upgrade_intended'` to `ANALYTICS_EVENTS` (intent tracking for pre-Epic 5 clicks)
  - [ ] 6.3 Add `FREE_PREVIEW_WORD_LIMIT = 150` to `packages/shared/src/constants/index.ts` -- single source of truth for both backend (streamHandler truncation) and frontend (AiSummaryCard cached content truncation). Import this constant everywhere instead of hardcoding 150
  - [ ] 6.4 Fire `ai_preview.viewed` when the free preview state renders (via `useEffect` on status change to `free_preview` or when cached content is truncated). Include `{ datasetId, wordCount }` in metadata
  - [ ] 6.5 Fire `subscription.upgrade_intended` when disabled UpgradeCta is clicked. Include `{ source: 'ai_preview' }` in metadata
  - [ ] 6.6 Frontend analytics: the backend `trackEvent()` function lives at `apps/api/src/services/analytics/trackEvent.ts` with signature `trackEvent(orgId, userId, eventName, metadata?)`. Client-side events reach it via the BFF proxy pattern -- check `apps/web/app/api/analytics/route.ts` (or create if missing) which forwards to `POST /analytics/events` on Express. Look at how `ai.summary_requested` and `ai.summary_completed` are tracked in `DashboardShell.tsx` or `page.tsx` for the established client-side call pattern
  - [ ] 6.7 Unit tests: events fire at correct moments with correct metadata

- [ ] Task 7: Wire subscription tier through the dashboard (AC: #5)
  - [ ] 7.1 The dashboard `page.tsx` (RSC) needs to determine the user's tier. The RSC already reads cookies for auth state — if authenticated, call `apiServer('/subscriptions/tier')` (a new lightweight endpoint that returns `{ data: { tier: 'free' | 'pro' } }`) OR decode the JWT cookie and hardcode `'free'` for pre-Epic 5. Recommended: create the `/subscriptions/tier` endpoint now (returns `{ data: { tier: getActiveTier(orgId) } }`) so the plumbing exists when Epic 5 populates real subscriptions. For anonymous visitors (no JWT cookie), `tier` is `null` — no subscription gate needed
  - [ ] 7.2 Pass `tier` prop from dashboard page → `AiSummaryCard`. For anonymous visitors, don't pass tier (they see full seed summary -- seed data is the "aha moment" per architecture)
  - [ ] 7.3 For SSE streams: the route handler already has the tier from `subscriptionGate.ts` middleware, so the backend handles truncation. The frontend just needs to react to the `upgrade_required` event
  - [ ] 7.4 For cached content: the page passes the full cached content + tier to `AiSummaryCard`, which truncates client-side if `tier === 'free'`
  - [ ] 7.5 **Anonymous visitors see full seed summary** -- no tier gating. The subscription gate only applies to authenticated users. This is critical for the hiring manager experience (Journey 5: `docker compose up` → see full AI summary without auth)

## Dev Notes

### Existing Code to Build On (DO NOT recreate)

**Story 3.3 + 3.4 built the streaming infrastructure** -- this story adds the subscription-aware layer on top.

```
apps/api/src/services/aiInterpretation/
  streamHandler.ts         # ENHANCE with tier-aware truncation at ~150 words
  claudeClient.ts          # No changes needed

apps/api/src/routes/
  aiSummary.ts             # ENHANCE: add subscriptionGate middleware, pass tier to streamToSSE

apps/api/src/middleware/
  authMiddleware.ts        # Existing -- provides req.user with org_id
  rateLimiter.ts           # Existing -- no changes
  (subscriptionGate.ts)    # NEW -- annotates req.subscriptionTier

apps/web/lib/hooks/
  useAiStream.ts           # ENHANCE: add UPGRADE_REQUIRED action + free_preview handling

apps/web/app/dashboard/
  AiSummaryCard.tsx        # ENHANCE: fill in free_preview state with blur + UpgradeCta
  DashboardShell.tsx       # May need tier prop threading
  page.tsx                 # ENHANCE: pass tier prop to AiSummaryCard

apps/web/components/common/
  (UpgradeCta.tsx)         # NEW -- shared upgrade CTA component
```

### Architecture Constraints (NON-NEGOTIABLE)

- **Annotating, NOT blocking**: `subscriptionGate.ts` adds `req.subscriptionTier` to the request. It NEVER returns 403 for AI endpoints. Free tier gets truncated stream + `upgrade_required` SSE event. This is the "show value before asking for anything" UX principle.
- **Cache stores FULL summaries**: Tier gating is a rendering/streaming concern. The `ai_summaries` table always stores complete content. This means a free user who upgrades to Pro immediately sees the full cached summary without waiting for regeneration.
- **Anonymous = full seed summary**: Subscription gate only applies to authenticated users. Anonymous visitors see seed data + full cached seed summary. Never gate the anonymous/demo experience.
- **Dashboard is PUBLIC**: No redirects from `/dashboard`. Auth state controls what data renders, not whether the page renders.
- **Privacy-by-architecture**: The subscription gate sees org_id from JWT claims, queries the subscriptions table, and annotates. It never touches data rows or AI content.

### SSE Protocol Extension

```
# Free-tier truncation (new event):
event: upgrade_required
data: {"wordCount": 152}

event: done
data: {"usage": null, "reason": "free_preview"}

# Pro tier / anonymous seed: unchanged — full stream as before
```

### Subscription Gate Behavior Matrix

| User State | subscriptionTier | AI Stream Behavior | Cached Content |
|---|---|---|---|
| Anonymous (no JWT) | N/A (gate skipped) | N/A (seed summary from cache) | Full seed summary |
| Authenticated, no subscription record | `'free'` | Truncate at ~150 words + upgrade_required | Client truncates at ~150 words |
| Authenticated, active Pro subscription | `'pro'` | Full stream | Full content |
| Authenticated, lapsed Pro (future Epic 5) | `'free'` | Truncate | Client truncates |

### Word Count Truncation Strategy

- Count words by splitting on whitespace: `text.split(/\s+/).length`
- Truncate AFTER the word that crosses the 150 threshold (don't cut mid-word)
- The ~150 is approximate — anywhere from 145-160 is fine. The UX goal is "enough to demonstrate value" (~6-8 lines at 65ch width per UX spec)
- For cached content client-side truncation, use the same word boundary logic

### Pre-Epic 5 Subscription State

The `subscriptions` table schema is defined in the architecture but NOT yet created (that's Epic 5). The `getActiveTier()` query function should handle the "table doesn't exist" case gracefully:

```typescript
// subscriptions.ts query
export async function getActiveTier(orgId: number): Promise<'free' | 'pro'> {
  try {
    const result = await db.select()
      .from(subscriptions)
      .where(and(
        eq(subscriptions.orgId, orgId),
        eq(subscriptions.status, 'active'),
        gt(subscriptions.currentPeriodEnd, new Date()),
      ))
      .limit(1);
    return result.length > 0 ? 'pro' : 'free';
  } catch {
    // table doesn't exist yet (pre-Epic 5) — all users are free
    return 'free';
  }
}
```

**IMPORTANT**: If the `subscriptions` table hasn't been created via migration yet, the Drizzle schema import will fail at compile time. Two approaches:
1. **Create the subscriptions table now** (migration-only, empty table) so the schema compiles. Epic 5 populates it.
2. **Skip the Drizzle query** and hardcode `'free'` with a TODO for Epic 5.

Recommended: Option 1 — create the migration for the `subscriptions` table schema now. It costs nothing to have an empty table, and it means `subscriptionGate.ts` code is production-ready from day one. The schema is already defined in architecture:

```sql
CREATE TABLE subscriptions (
  id SERIAL PRIMARY KEY,  -- use identity column per project convention
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  stripe_customer_id VARCHAR,
  stripe_subscription_id VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'inactive',
  plan VARCHAR NOT NULL DEFAULT 'free',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_org_id ON subscriptions(org_id);
```

Add the Drizzle schema definition to `apps/api/src/db/schema.ts` and generate the migration via `drizzle-kit generate`.

### Free Preview UI (from UX Spec)

**Visual treatment:**
```
┌─────────────────────────────────────────────┐
│▎ AI Business Summary                        │  ← 4px Trust Blue left-border
│                                             │
│  Your revenue grew 12% this quarter,        │  ← Clear text (~150 words)
│  driven primarily by the consulting         │
│  category which saw a 23% increase...       │
│                                             │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← Gradient fade into blur
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                             │
│     ┌───────────────────────────────┐       │
│     │  🔓 Unlock full analysis      │       │  ← UpgradeCta overlay
│     │                               │       │
│     │  Get AI-powered insights      │       │
│     │  for your business            │       │
│     │                               │       │
│     │  [Upgrade to Pro] (disabled)  │       │
│     │   Pro plan coming soon        │       │
│     └───────────────────────────────┘       │
│                                             │
└─────────────────────────────────────────────┘
```

**Gradient + blur implementation:**
- Use `bg-gradient-to-b from-transparent via-card/80 to-card` overlay div positioned absolutely over the last 3-4 lines of text
- Below that, 3-4 lines of blurred placeholder text using `blur-sm` + `select-none` + `aria-hidden="true"`
- The blur area uses the same text styling as the real content so it looks like "more text behind a paywall"
- `UpgradeCta` positioned after the blur area

**Accessibility:**
- Blurred text has `aria-hidden="true"` — screen readers skip it
- UpgradeCta button has `aria-label="Upgrade to Pro subscription"`
- Screen reader flow: clear preview text → UpgradeCta button (skips blur)
- `prefers-reduced-motion: reduce` — blur/gradient appearance is instant (no animation to override), but if any decorative transitions are added (e.g., UpgradeCta hover glow), they must respect the media query with `duration-0` override per UX spec Step 12
- Disabled button tooltip must appear on focus-visible (keyboard), not just hover — shadcn Tooltip handles this by default

### Previous Story Intelligence

**From Story 3.4 (direct dependency):**
- `AiSummaryCard` already has `status === 'free_preview'` returning `null` -- replace with actual UI
- `useAiStream` already has `'free_preview'` in `StreamStatus` union -- just needs the `UPGRADE_REQUIRED` action
- `streamHandler.ts` has the `safeEnd()` + `writeSseEvent()` patterns -- reuse for `upgrade_required` event
- `mapStreamError()` helper exists for error mapping -- no changes needed
- `SsePartialEvent` type pattern in shared/types/sse.ts -- follow for `SseUpgradeRequiredEvent`

**From Story 3.3:**
- SSE event format: `event: <name>\ndata: <json>\n\n` -- follow exactly
- `parseSseLines` in useAiStream.ts dispatches actions based on `currentEvent` -- add `case 'upgrade_required'`
- Claude stream abort pattern: `abortController.abort()` in streamHandler.ts -- reuse for truncation

**From Story 3.2:**
- Claude SDK mock pattern for tests
- `vi.mock` hoisting rules apply

**Testing patterns established across Epic 3:**
- Co-located `.test.ts` files
- `vi.clearAllMocks()` in `beforeEach`
- Mock `../../config.js` for test env values
- Mock `../../lib/logger.js` to suppress output
- Mock `../../db/queries/index.js` for query stubs

### Frontend Analytics Pattern

Check `apps/web/app/dashboard/page.tsx` or `DashboardShell.tsx` for how `dashboard.viewed` is tracked. The client-side analytics likely calls a proxy route that forwards to the Express analytics endpoint. Follow the same pattern for `ai_preview.viewed` and `subscription.upgrade_intended`.

### What This Story Does NOT Include

- **Stripe Checkout integration** -- Epic 5. The UpgradeCta button is disabled until then.
- **Subscription lifecycle management** -- Epic 5.
- **Transparency panel** -- Story 3.6.
- **Mobile-first AI summary layout** -- Story 3.6.
- **Share functionality** -- Epic 4.
- **Real Pro-tier subscription records** -- Epic 5 populates the subscriptions table.

### Project Structure Notes

```
# NEW files
apps/api/src/middleware/subscriptionGate.ts              # Annotating middleware
apps/api/src/middleware/subscriptionGate.test.ts          # Middleware tests
apps/api/src/db/queries/subscriptions.ts                 # Subscription tier query
apps/api/src/db/queries/subscriptions.test.ts            # Query tests
apps/web/components/common/UpgradeCta.tsx                # Shared upgrade CTA
apps/web/components/common/UpgradeCta.test.tsx           # CTA tests
drizzle/XXXX_add_subscriptions_table.sql                 # Migration (if creating table now)

# MODIFIED files
apps/api/src/db/schema.ts                                # Add subscriptions table definition
apps/api/src/db/queries/index.ts                         # Export subscriptions queries
apps/api/src/routes/aiSummary.ts                         # Wire subscriptionGate, pass tier
apps/api/src/routes/aiSummary.test.ts                    # Extend with tier scenarios
apps/api/src/services/aiInterpretation/streamHandler.ts  # Add tier param + truncation
apps/api/src/services/aiInterpretation/streamHandler.test.ts  # Extend with truncation tests
apps/web/lib/hooks/useAiStream.ts                        # Add UPGRADE_REQUIRED action
apps/web/lib/hooks/useAiStream.test.ts                   # Extend with free_preview tests
apps/web/app/dashboard/AiSummaryCard.tsx                 # Fill in free_preview state
apps/web/app/dashboard/AiSummaryCard.test.tsx            # Extend with free_preview tests
apps/web/app/dashboard/page.tsx                          # Pass tier prop
packages/shared/src/types/sse.ts                         # Add SseUpgradeRequiredEvent
packages/shared/src/types/index.ts                       # Export new type
packages/shared/src/constants/index.ts                   # Add analytics events

# COMPANION DOCS (always-on)
apps/api/src/middleware/subscriptionGate.ts_explained.md
apps/web/components/common/UpgradeCta.tsx_explained.md
apps/api/src/services/aiInterpretation/streamHandler.ts_explained.md  # Update existing
apps/web/lib/hooks/useAiStream.ts_explained.md                        # Update existing
apps/web/app/dashboard/AiSummaryCard.tsx_explained.md                 # Update existing
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md -- Epic 3, Story 3.5]
- [Source: _bmad-output/planning-artifacts/architecture.md -- Subscription gate (annotating, not blocking), FR21 mapping, AI summary data flow]
- [Source: _bmad-output/planning-artifacts/architecture.md -- subscriptionGate.ts file placement, subscription table schema, anonymous dashboard access rule]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md -- AiSummary Free Preview state, UpgradeCta component spec (overlay + inline variants), accessibility requirements]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md -- Button hierarchy (disabled state), keyboard flow for UpgradeCta overlay]
- [Source: _bmad-output/planning-artifacts/epics.md -- F4 guidance note: graceful pre-payment behavior]
- [Source: _bmad-output/project-context.md -- Subscription gate rules, SSE streaming rules, analytics event naming]
- [Source: _bmad-output/implementation-artifacts/3-4-ai-summary-timeout-error-handling.md -- streamHandler patterns, useAiStream reducer, AiSummaryCard state machine, testing patterns]
- [Source: _bmad-output/implementation-artifacts/3-3-sse-streaming-delivery-ai-summary-card.md -- SSE event format, parseSseLines, PostCompletionFooter]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
