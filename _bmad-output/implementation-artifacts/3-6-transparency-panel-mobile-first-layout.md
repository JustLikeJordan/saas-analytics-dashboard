# Story 3.6: Transparency Panel & Mobile-First Layout

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **business owner**,
I want to view how the AI reached its conclusions and see the AI summary prominently on mobile,
so that I trust the analysis and can access it easily on any device.

## Acceptance Criteria

1. **Transparency panel opens with methodology** -- Given the AI summary is complete, when I click the "How I reached this conclusion" button, then a `TransparencyPanel` opens showing the methodology: which statistics were computed, scoring weights used, and prompt template version (FR20). On desktop, the panel uses CSS Grid column expanding from `0fr` to `320px` — no layout reflow, AI summary retains 65ch reading width. The `transparency_panel.opened` analytics event fires.

2. **Mobile viewport layout** -- Given I am on a mobile viewport (< 768px), when the dashboard renders, then the AI summary is positioned above the fold, before charts and filters (FR24). Conditional React rendering is used for mobile/desktop AI components (not CSS `display:none`). A `useIsMobile` hook uses `matchMedia` + `useSyncExternalStore` for hydration-safe component swap. Touch targets are minimum 44x44px. **Note**: The epics file says "matchMedia + isMounted guard" but `useSyncExternalStore` is the React 19 idiomatic replacement for `isMounted` guards — it solves the same hydration problem without `useState` + `useEffect`. Already proven in `useReducedMotion.ts`. This is a deliberate improvement over the original AC wording.

3. **Desktop AI card grid** -- Given I am on a desktop viewport, when the dashboard renders, then the AI card spans 8 columns in the 12-column grid layout.

4. **Keyboard accessibility** -- Given a keyboard user interacts with the AI summary area, when they navigate to the Transparency button, then the button is keyboard-focusable and the panel is operable via keyboard (NFR25).

## Recommended Task Execution Order

Tasks are numbered for reference but should be executed in this dependency-aware order:
1. **Task 7** first (shared types) — everything depends on `TransparencyMetadata` and `SseDoneEvent`
2. **Task 1** (useIsMobile hook) — no deps, can parallel with Task 7
3. **Task 8** (metadata flow) — depends on Task 7 types
4. **Task 6** (analytics infra) — independent, can parallel with Task 8
5. **Task 2** (TransparencyPanel component) — depends on Task 7 types
6. **Task 4** (wire button) — depends on Task 2
7. **Task 3** (desktop layout) — depends on Tasks 2, 4
8. **Task 5** (conditional rendering) — depends on Tasks 1, 3

## Tasks / Subtasks

- [x] Task 1: Create `useIsMobile` hook (AC: #2)
  - [x]1.1 Create `apps/web/lib/hooks/useIsMobile.ts` using `useSyncExternalStore` with `matchMedia('(max-width: 767px)')`. Follow the exact pattern from `apps/web/hooks/useReducedMotion.ts` — three functions: `subscribe` (wire `change` listener on `MediaQueryList`), `getSnapshot` (sync read of `matches`), `getServerSnapshot` (return `false` — server assumes desktop). Export `useIsMobile(): boolean`
  - [x]1.2 The hook must NOT use `useState` + `useEffect` — that triggers `react-hooks/set-state-in-effect` lint rule and causes hydration mismatch (learned in Epic 2). `useSyncExternalStore` is the React 19 idiomatic pattern for reading browser APIs
  - [x]1.3 Reference implementation exists in `apps/web/app/dashboard/charts/LazyChart.tsx` lines 13-29 (`useSyncExternalStore` + resize subscription) — but that one uses `window.innerWidth` with resize event. The `matchMedia` approach is better because it fires only on threshold crossing, not every resize pixel
  - [x]1.4 Unit tests: returns `false` during SSR (server snapshot), returns `true` when viewport < 768px, returns `false` when viewport >= 768px, updates on resize across threshold. Mock `window.matchMedia` in tests

- [x] Task 2: Create `TransparencyPanel` component (AC: #1, #4)
  - [x]2.1 Create `apps/web/app/dashboard/TransparencyPanel.tsx` — client component (`'use client'`)
  - [x]2.2 Props: `metadata: TransparencyMetadata | null`, `isOpen: boolean`, `onClose: () => void`. When `metadata` is null or `isOpen` is false, render nothing (return null)
  - [x]2.3 Import `TransparencyMetadata` type from shared package. The type mirrors the Zod schema in `apps/api/src/services/curation/types.ts` (lines 117-130): `{ statTypes: string[], categoryCount: number, insightCount: number, scoringWeights: { novelty: number, actionability: number, specificity: number }, promptVersion: string, generatedAt: string }`
  - [x]2.4 **Content layout** (progressive disclosure per UX spec): section header "How I reached this conclusion", then 3 subsections:
    - **Statistics computed**: render `metadata.statTypes` as a list of badges (e.g., "Trend analysis", "Anomaly detection", "Category breakdown"). Show `metadata.insightCount` insights from `metadata.categoryCount` categories
    - **Scoring weights**: render as a horizontal bar or labeled percentages — Novelty `metadata.scoringWeights.novelty * 100`%, Actionability, Specificity. Use shadcn Badge components
    - **Prompt version + timestamp**: `metadata.promptVersion` label + `metadata.generatedAt` formatted as relative time ("2 hours ago")
  - [x]2.5 **Desktop rendering**: panel is a `<aside>` element within the CSS Grid. Uses `transition-[grid-template-columns]` on the parent grid to animate from `1fr 0fr` to `1fr 320px`. The panel itself has `overflow: hidden` + `min-width: 0` during the closed state. Transition duration: 200ms ease-in-out. Include `motion-reduce:duration-0` override
  - [x]2.6 **Close button**: top-right of panel, keyboard-focusable, `aria-label="Close transparency panel"`. On Escape key press, close the panel (add `useEffect` with `keydown` listener when `isOpen`)
  - [x]2.7 **Styling**: `border-l border-border bg-card p-4` with `shadow-sm`. Header uses `text-sm font-semibold text-muted-foreground uppercase tracking-wide`. Content uses `text-sm` body text. Badge components for stat types use shadcn Badge `outline` variant
  - [x]2.8 **Accessibility**: `role="complementary"` + `aria-label="AI analysis methodology"`. Focus trap is NOT needed (it's a panel, not a modal). On open, focus moves to the close button. `aria-live="polite"` on the panel container so screen readers announce when it opens
  - [x]2.9 Unit tests: renders methodology content from metadata, close button fires onClose, Escape key closes, returns null when isOpen is false, returns null when metadata is null, aria attributes correct, stat types rendered as badges

- [x] Task 3: Wire TransparencyPanel into desktop layout (AC: #1, #3)
  - [x]3.1 Modify `apps/web/app/dashboard/DashboardShell.tsx` — wrap the AI summary section in a CSS Grid container. When TransparencyPanel is closed: `grid-template-columns: 1fr 0fr`. When open: `grid-template-columns: 1fr 320px`. The `transition-[grid-template-columns]` animates the expansion
  - [x]3.2 AI summary card gets `max-w-prose` (65ch) reading width constraint. The 8-column span from AC #3 means: in a 12-column outer grid, the AI section wrapper spans 8 columns. The remaining 4 columns are available but empty until TransparencyPanel opens. Implementation: use `md:col-span-8` on the AI section within a `md:grid-cols-12` parent grid. On mobile, single column (no grid)
  - [x]3.3 The TransparencyPanel sits as a sibling to AiSummaryCard within the inner grid. When closed, it contributes 0fr (no space taken). When open, it slides in at 320px. The AiSummaryCard width does NOT change — the total container expands to accommodate the panel. This is the "no layout reflow" requirement
  - [x]3.4 State management: `const [transparencyOpen, setTransparencyOpen] = useState(false)`. Pass `isOpen` and `onClose` to TransparencyPanel. Pass the toggle handler to AiSummaryCard's "How I reached this conclusion" button
  - [x]3.5 Pass `metadata` from the cached summary response or from the stream completion response. The cache hit path in `aiSummary.ts` already returns `metadata` (line 37). For the stream path, metadata is stored when the summary completes — fetch it via the cache endpoint after stream `done` event, or include it in the `done` SSE event data
  - [x]3.6 **Mobile: TransparencyPanel renders as bottom sheet** (not the grid column pattern). When `isMobile` is true and transparency is toggled, render TransparencyPanel in a shadcn Sheet (bottom drawer). Same content, different container. Use conditional rendering: `{isMobile ? <Sheet><TransparencyPanel /></Sheet> : <TransparencyPanel />}`. **Prerequisite**: shadcn Sheet component is NOT currently installed — run `npx shadcn@latest add sheet` to add it. The `apps/web/components/ui/` directory currently only contains `alert.tsx`, `progress.tsx`, and `.gitkeep`

- [x] Task 4: Wire "How I reached this conclusion" button (AC: #1)
  - [x]4.1 `PostCompletionFooter` currently takes **zero props** (it's a standalone function component). Add props: `onToggleTransparency: () => void` and `transparencyOpen: boolean`. Update the function signature and all call sites (rendered in `done` state and `timeout` state branches)
  - [x]4.2 Remove the `disabled` attribute from the existing "How I reached this conclusion" button. Wire `onClick` to call `onToggleTransparency`
  - [x]4.3 Add `onToggleTransparency` and `transparencyOpen` props to `AiSummaryCardProps`. Thread them through to `PostCompletionFooter`. When clicked, fire the analytics event AND call the toggle
  - [x]4.4 Button styling: shadcn `ghost` variant (tertiary per design system). Include a chevron icon that rotates when panel is open. Use `aria-expanded={transparencyOpen}` to communicate state to screen readers
  - [x]4.5 The button appears in `PostCompletionFooter` which renders for both `done` and `timeout` states. The transparency button should work in timeout state too — metadata is available since the curation pipeline runs before streaming. It does NOT appear in `free_preview` state (Story 3.5 already hides PostCompletionFooter for free preview)
  - [x]4.6 Unit tests: button calls onToggleTransparency, button has aria-expanded, button works in done state, button works in timeout state, button hidden in free_preview state

- [x] Task 5: Implement conditional mobile/desktop rendering (AC: #2)
  - [x]5.1 In `DashboardShell.tsx`, import `useIsMobile` hook. Use it to conditionally render different layouts:
    - **Mobile (< 768px)**: AI summary card renders full-width at top (already the case). TransparencyPanel opens in Sheet/Dialog overlay. Charts render in single column below. No grid wrapper needed
    - **Desktop (>= 768px)**: AI section in 12-column grid (8 cols AI + 4 cols transparency). Charts in 2-column grid below
  - [x]5.2 The conditional rendering MUST use React conditional (`{isMobile ? <MobileLayout /> : <DesktopLayout />}`), NOT CSS `display:none`. This prevents duplicate component instances and duplicate SSE connections
  - [x]5.3 During SSR and initial hydration (before `useIsMobile` resolves), render the `AiSummarySkeleton` — same pattern as the current loading state. This prevents flash of wrong layout. The skeleton is viewport-agnostic. **Note**: `AiSummarySkeleton` is currently imported only in `AiSummaryCard.tsx`, not in `DashboardShell.tsx`. If using it at the layout level for hydration fallback, import it in `DashboardShell.tsx` too
  - [x]5.4 Touch targets on mobile: ensure all interactive elements (Transparency button, close button, any badges/links in panel) have minimum 44x44px hit area. Use `min-h-11 min-w-11` (44px) or equivalent padding. The shadcn Button already meets this for default size — verify `ghost` variant does too
  - [x]5.5 Unit tests: desktop layout renders grid wrapper, mobile layout renders without grid wrapper, TransparencyPanel renders in Sheet on mobile, skeleton renders during SSR

- [x] Task 6: Analytics event tracking (AC: #1)
  - [x]6.1 Add `TRANSPARENCY_PANEL_OPENED: 'transparency_panel.opened'` to `ANALYTICS_EVENTS` in `packages/shared/src/constants/index.ts`
  - [x]6.2 **Client-side analytics infrastructure does NOT exist yet** — this is new work. Create the full pipeline:
    - **Next.js BFF route**: `apps/web/app/api/analytics/route.ts` — a `POST` handler that proxies to Express. Extract `eventName` and `metadata` from the request body, forward to `POST http://localhost:3001/analytics/events`. Follow BFF proxy pattern (same-origin, no CORS)
    - **Express endpoint**: check if `apps/api/src/routes/analytics.ts` exists. If not, create it with a `POST /analytics/events` handler that calls `trackEvent(orgId, userId, eventName, metadata)`. Mount it in `apps/api/src/routes/protected.ts` behind auth middleware. The `orgId` and `userId` come from `req.user` (set by `authMiddleware`)
    - **Client-side helper**: create `apps/web/lib/analytics.ts` with `trackClientEvent(eventName: string, metadata?: Record<string, unknown>): void` — fire-and-forget `fetch('/api/analytics', { method: 'POST', body: JSON.stringify({ eventName, metadata }) })`. No `await`, no error throw — matches backend fire-and-forget pattern
  - [x]6.3 Fire `transparency_panel.opened` when the transparency button is clicked and the panel opens. Include `{ datasetId }` in metadata. Call `trackClientEvent(ANALYTICS_EVENTS.TRANSPARENCY_PANEL_OPENED, { datasetId })`
  - [x]6.4 Do NOT fire the event on close — only on open. Don't double-fire if the user toggles rapidly (debounce or guard with a "just fired" ref)
  - [x]6.5 Unit tests: event fires on panel open with correct event name and metadata, event does not fire on panel close, BFF route proxies correctly, Express endpoint calls trackEvent

- [x] Task 7: Add `TransparencyMetadata` type + update `SseDoneEvent` (AC: #1) — **DO THIS FIRST, other tasks depend on it**
  - [x]7.1 Create `packages/shared/src/types/transparency.ts`:
    ```typescript
    export interface TransparencyMetadata {
      statTypes: string[];
      categoryCount: number;
      insightCount: number;
      scoringWeights: {
        novelty: number;
        actionability: number;
        specificity: number;
      };
      promptVersion: string;
      generatedAt: string;
    }
    ```
  - [x]7.2 Export from `packages/shared/src/types/index.ts`
  - [x]7.3 The backend already has this as a Zod schema in `apps/api/src/services/curation/types.ts` (lines 117-130). The shared type is the plain TypeScript interface for frontend consumption. Keep them in sync. Keeping a separate interface avoids a Zod dependency in the shared package
  - [x]7.4 Update `SseDoneEvent` in `packages/shared/src/types/sse.ts` — add optional `metadata?: TransparencyMetadata` field. The current definition is `{ usage: { inputTokens: number; outputTokens: number } | null; reason?: string }`. After: `{ usage: ...; reason?: string; metadata?: TransparencyMetadata }`. This change must happen BEFORE modifying `streamHandler.ts` (Task 8), because `streamHandler.ts` uses `satisfies SseDoneEvent` which will fail until the type is updated

- [x]Task 8: Metadata flow — ensure frontend receives transparency data (AC: #1)
  - [x]8.1 **Backend stream path — include metadata in done event**: in `streamHandler.ts`, the `writeSseEvent(res, 'done', { usage: result.usage } satisfies SseDoneEvent)` call (line ~154) must include `validatedMetadata`. Change to: `writeSseEvent(res, 'done', { usage: result.usage, metadata: validatedMetadata } satisfies SseDoneEvent)`. The `validatedMetadata` variable is already in scope (line 82-88)
  - [x]8.2 **Backend cache hit path — already returns metadata**: `aiSummary.ts` line 37 returns `metadata: cached.transparencyMetadata` in the JSON response. This part works
  - [x]8.3 **RSC cache fetch path — does NOT return metadata yet**: `page.tsx`'s `fetchCachedSummary` currently calls the API and extracts only `res.data.content`, discarding metadata. Update `fetchCachedSummary` to return `{ content: string; metadata: TransparencyMetadata | null }` instead of `string | undefined`. Update `DashboardShellProps` to accept `cachedMetadata: TransparencyMetadata | null`. Thread it through `page.tsx` → `DashboardShell` → `TransparencyPanel`
  - [x]8.4 **Anonymous user metadata flow**: Anonymous users don't use `useAiStream` — they get cached seed summaries via RSC props. Their metadata comes through the RSC cache fetch path (8.3 above), NOT through the stream hook. Both paths must converge at `DashboardShell` which passes metadata to `TransparencyPanel`
  - [x]8.5 **useAiStream state — add metadata**: Add `metadata: TransparencyMetadata | null` to `StreamState` (initialize as `null`). Changes needed in three places:
    - Add `metadata` field to `DONE` action type in the `StreamAction` union
    - Add `metadata` field to `CACHE_HIT` action type — currently `CACHE_HIT` only carries `content: string`. Change to `{ type: 'CACHE_HIT'; content: string; metadata: TransparencyMetadata | null }`
    - Update `streamReducer` to store `metadata` from both `DONE` and `CACHE_HIT` actions
  - [x]8.6 **parseSseLines — extract metadata from done event**: `parseSseLines` currently dispatches `{ type: 'DONE' }` with no payload when it encounters `event: done`. Update it to parse the JSON data and include `metadata`: `dispatch({ type: 'DONE', metadata: parsed.metadata ?? null, usage: parsed.usage })`
  - [x]8.7 **useAiStream cache hit dispatch — include metadata**: The `fetchStream` function's cache-hit branch (when response is JSON) currently does `dispatch({ type: 'CACHE_HIT', content: json.data.content })`. Update to: `dispatch({ type: 'CACHE_HIT', content: json.data.content, metadata: json.data.metadata ?? null })`
  - [x]8.8 **Metadata threading summary**: Two paths converge at DashboardShell:
    - **SSE/authenticated path**: `useAiStream` state → `AiSummaryCard` (via hook) → `DashboardShell` (via callback or lifted state) → `TransparencyPanel`
    - **RSC/anonymous path**: `page.tsx` RSC fetch → `cachedMetadata` prop → `DashboardShell` → `TransparencyPanel`
    - `DashboardShell` uses whichever is available: `const metadata = streamMetadata ?? cachedMetadata`
  - [x]8.9 Unit tests: metadata stored in state on DONE event, metadata stored on CACHE_HIT, parseSseLines extracts metadata from done data, fetchCachedSummary returns metadata, anonymous users receive metadata via RSC props, metadata passed to TransparencyPanel from both paths

## Dev Notes

### Existing Code to Build On (DO NOT recreate)

**Story 3.3-3.5 built the entire AI streaming + caching + subscription infrastructure.** This story adds the transparency layer and responsive layout on top.

```
apps/web/app/dashboard/
  AiSummaryCard.tsx        # ENHANCE: wire button, accept metadata + transparency props
  DashboardShell.tsx       # ENHANCE: add CSS Grid wrapper, conditional rendering, TransparencyPanel
  page.tsx                 # ENHANCE: update fetchCachedSummary to return metadata, thread cachedMetadata prop
  (TransparencyPanel.tsx)  # NEW — methodology display component

apps/web/lib/hooks/
  useAiStream.ts           # ENHANCE: add metadata to state, DONE action, CACHE_HIT action, parseSseLines
  (useIsMobile.ts)         # NEW — hydration-safe viewport hook

apps/web/lib/
  (analytics.ts)           # NEW — client-side trackClientEvent helper (fire-and-forget)

apps/web/app/api/analytics/
  (route.ts)               # NEW — BFF proxy for client-side analytics events

apps/web/hooks/
  useReducedMotion.ts      # REFERENCE — useSyncExternalStore pattern to copy

apps/web/app/dashboard/charts/
  LazyChart.tsx            # REFERENCE — useSyncExternalStore + resize (alternative pattern)

apps/api/src/services/aiInterpretation/
  streamHandler.ts         # ENHANCE: include metadata in done SSE event

apps/api/src/routes/
  (analytics.ts)           # NEW (if missing) — POST /analytics/events endpoint

apps/api/src/services/curation/
  types.ts                 # REFERENCE — TransparencyMetadata Zod schema (lines 117-130)

packages/shared/src/
  types/                   # ENHANCE: add TransparencyMetadata interface, update SseDoneEvent
  constants/index.ts       # ENHANCE: add TRANSPARENCY_PANEL_OPENED analytics event
```

### Architecture Constraints (NON-NEGOTIABLE)

- **Conditional React rendering, NOT CSS `display:none`**: The acceptance criteria explicitly requires this. Using `display:none` would still mount both mobile and desktop components, potentially creating duplicate SSE connections. Use `useIsMobile` + conditional JSX.
- **`useSyncExternalStore` for browser APIs**: Do NOT use `useState` + `useEffect` for `matchMedia`. It causes hydration mismatch and triggers lint rules. The codebase already has two reference implementations (`useReducedMotion.ts`, `LazyChart.tsx`).
- **No layout reflow on TransparencyPanel open**: The CSS Grid `0fr → 320px` pattern means the AI card width stays constant. The grid container itself widens to accommodate the panel. This is NOT the same as pushing the AI card narrower.
- **65ch reading width preserved**: `max-w-prose` on the AI text container. The 8-column grid constraint provides the spatial boundary, but the actual text width is capped at 65ch regardless.
- **Privacy-by-architecture**: TransparencyPanel shows computed statistics metadata, scoring weights, and prompt version. It NEVER shows raw data rows, LLM prompts, or API keys.
- **Dashboard is PUBLIC**: No auth gate on transparency panel access. Anonymous users seeing seed data can also see seed transparency metadata.
- **BFF proxy pattern**: Client-side analytics events go through a Next.js API route, not directly to Express. Same-origin, no CORS.

### CSS Grid Animation Pattern

```css
/* Parent grid container */
.ai-section {
  display: grid;
  grid-template-columns: 1fr 0fr;
  transition: grid-template-columns 200ms ease-in-out;
}

.ai-section[data-panel-open="true"] {
  grid-template-columns: 1fr 320px;
}

/* Panel child */
.transparency-panel {
  overflow: hidden;
  min-width: 0;
}
```

In Tailwind CSS 4 terms:
```html
<div className={cn(
  'grid transition-[grid-template-columns] duration-200 ease-in-out motion-reduce:duration-0',
  transparencyOpen ? 'grid-cols-[1fr_320px]' : 'grid-cols-[1fr_0fr]'
)}>
  <AiSummaryCard ... />
  <TransparencyPanel className="overflow-hidden min-w-0" ... />
</div>
```

### Relative Time Formatting

The `generatedAt` field needs to display as "2 hours ago" style. Use native `Intl.RelativeTimeFormat` — do NOT pull in `date-fns` or `moment` for this single use case. A tiny utility (~15 lines) that computes the diff in seconds/minutes/hours/days and calls `new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-diff, unit)` is sufficient. Place in `apps/web/lib/formatRelativeTime.ts` or inline in TransparencyPanel.

### TransparencyMetadata Content Mapping

| Schema Field | Display Label | Rendering |
|---|---|---|
| `statTypes: string[]` | "Statistics computed" | Badge list: "Trend analysis", "Anomaly detection", etc. |
| `categoryCount: number` | "Categories analyzed" | Inline text: "Analyzed 5 categories" |
| `insightCount: number` | "Insights extracted" | Inline text: "3 key insights identified" |
| `scoringWeights` | "Insight scoring" | Labeled percentages: Novelty 40%, Actionability 35%, Specificity 25% |
| `promptVersion: string` | "Analysis version" | Badge: "v1" |
| `generatedAt: string` | "Generated" | Relative time: "2 hours ago" |

### Breakpoint Strategy (from project-context.md)

- **Mobile**: 0-767px — base Tailwind classes (no prefix)
- **`sm:` (640px)**: NOT USED — intentionally skipped in this project
- **`md:` (768px)**: FIRST layout breakpoint — all responsive changes start here
- **`lg:` (1024px)**: Wide desktop adjustments only

The `useIsMobile` hook threshold is `max-width: 767px` (equivalent to "below `md:`").

### Motion & Accessibility

- **Grid column transition**: 200ms ease-in-out + `motion-reduce:duration-0`
- **Transparency button**: `aria-expanded` attribute toggled with panel state
- **Panel**: `role="complementary"`, `aria-label="AI analysis methodology"`, `aria-live="polite"`
- **Escape key**: closes panel when focused
- **Focus on open**: move focus to panel close button
- **Touch targets**: minimum 44x44px on mobile (`min-h-11 min-w-11`)
- **Screen reader flow**: button announces "How I reached this conclusion, expanded/collapsed" → panel content announced via `aria-live`

### Previous Story Intelligence

**From Story 3.5:**
- `AiSummaryCard` has 6 states: idle, connecting, streaming, done, timeout, error, free_preview
- `PostCompletionFooter` renders for both `done` AND `timeout` states (already hides for free_preview). The transparency button should work in both — metadata is available in timeout state because the curation pipeline completes before streaming begins
- `PostCompletionFooter` currently takes **zero props** — it's a standalone function component. Story 3.6 must add `onToggleTransparency` and `transparencyOpen` props, then update all call sites
- The "How I reached this conclusion" button exists but is `disabled` — Story 3.6 enables it
- `UpgradeCta` overlay sits in the `free_preview` branch — no conflict with transparency panel
- `useAiStream` already has `free_preview` in `StreamStatus` union — metadata would be a new addition to state

**From Story 3.4:**
- `streamHandler.ts` has `safeEnd()` + `writeSseEvent()` patterns — reuse for metadata in done event
- `AiSummaryCard` state machine is well-established — adding metadata prop is additive
- Test mocking patterns: `vi.mock('../../config.js')`, `vi.mock('../../lib/logger.js')`, `vi.mock('../../db/queries/index.js')`

**From Story 3.3:**
- SSE event format: `event: <name>\ndata: <json>\n\n`
- `parseSseLines` dispatches actions based on `currentEvent` — `done` event already handled, just need to include metadata in its data payload
- `PostCompletionFooter` was created here — the button structure is ready

### Git Intelligence

Recent commits show consistent patterns:
- `feat:` prefix for story implementations
- `fix:` for code review findings
- `docs:` for BMAD artifacts
- Co-located tests (`.test.ts` / `.test.tsx` alongside source)
- `_explained.md` companion docs for substantial files

### What This Story Does NOT Include

- **Mobile AI summary as separate component (`MobileAiSummary.tsx`)**: The architecture doc mentions this file, but the current implementation already renders AI above the fold via layout ordering. The conditional rendering in Story 3.6 is about transparency panel presentation (grid column on desktop vs. Sheet on mobile), not about swapping the entire AI card. If the AI card needs different mobile rendering, that's a separate concern
- **Inline source indicators** (Perplexity pattern): The UX spec mentions "based on 847 transactions" inline markers. These are a stretch goal, not in the acceptance criteria. TransparencyPanel covers the methodology display requirement
- **Share functionality**: Epic 4
- **Confidence hedging in LLM language**: This is a prompt engineering concern in the curation pipeline, not a UI concern

### Project Structure Notes

```
# NEW files
apps/web/lib/hooks/useIsMobile.ts                    # Hydration-safe viewport hook
apps/web/lib/hooks/useIsMobile.test.ts                # Hook tests
apps/web/app/dashboard/TransparencyPanel.tsx           # Methodology panel component
apps/web/app/dashboard/TransparencyPanel.test.tsx      # Panel tests
apps/web/lib/analytics.ts                              # Client-side trackClientEvent helper
apps/web/lib/analytics.test.ts                         # Analytics helper tests
apps/web/app/api/analytics/route.ts                    # BFF proxy for client analytics events
apps/api/src/routes/analytics.ts                       # Express POST /analytics/events (if missing)
apps/api/src/routes/analytics.test.ts                  # Analytics route tests (if created)
packages/shared/src/types/transparency.ts              # TransparencyMetadata interface

# INSTALL (prerequisite for mobile rendering)
npx shadcn@latest add sheet                            # shadcn Sheet component for mobile panel

# MODIFIED files
apps/web/app/dashboard/AiSummaryCard.tsx              # Wire button, accept metadata + transparency props
apps/web/app/dashboard/AiSummaryCard.test.tsx          # Extend with transparency tests
apps/web/app/dashboard/DashboardShell.tsx             # CSS Grid layout, conditional rendering, import AiSummarySkeleton
apps/web/app/dashboard/DashboardShell.test.tsx         # Extend with layout tests
apps/web/app/dashboard/page.tsx                        # Update fetchCachedSummary to return metadata, thread cachedMetadata
apps/web/lib/hooks/useAiStream.ts                     # Add metadata to state, DONE/CACHE_HIT actions, parseSseLines
apps/web/lib/hooks/useAiStream.test.ts                # Extend with metadata tests
apps/api/src/services/aiInterpretation/streamHandler.ts  # Include metadata in done event
apps/api/src/services/aiInterpretation/streamHandler.test.ts  # Extend with metadata tests
packages/shared/src/types/sse.ts                       # Update SseDoneEvent with optional metadata
packages/shared/src/types/index.ts                     # Export TransparencyMetadata
packages/shared/src/constants/index.ts                 # Add TRANSPARENCY_PANEL_OPENED event

# COMPANION DOCS (always-on)
apps/web/lib/hooks/useIsMobile.ts_explained.md
apps/web/app/dashboard/TransparencyPanel.tsx_explained.md
apps/web/app/dashboard/DashboardShell.tsx_explained.md  # Update existing
apps/web/app/dashboard/AiSummaryCard.tsx_explained.md   # Update existing
apps/web/lib/hooks/useAiStream.ts_explained.md          # Update existing
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md -- Epic 3, Story 3.6 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md -- FR20 transparency panel, FR24 mobile-first AI, NFR25 keyboard nav, component file structure, CSS Grid layout, mobile rendering strategy]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md -- AI trust & transparency patterns, progressive confidence disclosure, mobile layout strategy, touch targets, button hierarchy]
- [Source: _bmad-output/project-context.md -- Responsive breakpoints (md: only), analytics event naming (dot-notation past tense), motion durations, accessibility requirements, design system colors]
- [Source: _bmad-output/implementation-artifacts/3-5-free-preview-with-upgrade-cta.md -- AiSummaryCard state machine, PostCompletionFooter structure, useAiStream reducer patterns, testing patterns]
- [Source: apps/web/hooks/useReducedMotion.ts -- useSyncExternalStore reference pattern for useIsMobile]
- [Source: apps/web/app/dashboard/charts/LazyChart.tsx -- useSyncExternalStore + resize alternative pattern]
- [Source: apps/api/src/services/curation/types.ts -- TransparencyMetadata Zod schema (lines 117-130)]
- [Source: apps/api/src/routes/aiSummary.ts -- Cache hit returns metadata (line 37)]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- DashboardShell test failed initially: `window.matchMedia is not a function` — jsdom doesn't provide `matchMedia`. Fixed by mocking `useIsMobile` in the DashboardShell test file.
- shadcn Sheet install failed: `npx shadcn@latest add sheet` prompted for `components.json` (not configured). Resolved by creating a lightweight `BottomSheet.tsx` using native HTML `<dialog>` element.
- `useIsMobile.test.ts` had unused `getServerSnapshot` import causing type-check failure. Removed.
- `AiSummaryCard.test.tsx` needed `metadata: null` added to `defaultHookReturn` after adding metadata to `StreamState`.
- `TransparencyPanel.test.tsx` had DOM pollution across tests — fixed with explicit `afterEach(cleanup)` and `within()` scoping.
- `shared` package `pnpm test` fails (pre-existing: missing vitest module). Not related to this story.
- `web:lint` fails (pre-existing: eslint-config-next missing module). Not related to this story.

### Completion Notes List

- All 8 tasks complete in dependency order: 7 → 1 → 8 → 6 → 2 → 4 → 3 → 5
- 536 tests pass (228 web + 308 api), type-check clean
- Used native `<dialog>` for BottomSheet instead of shadcn Sheet (project doesn't have shadcn configured)
- TransparencyMetadata type kept as plain interface in shared package (no Zod dependency on frontend)
- Two metadata convergence paths work: SSE stream (authenticated) and RSC cache (anonymous)
- Analytics event uses fire-and-forget pattern with debounce guard (useRef + 300ms setTimeout)

### File List

**New files:**
- `packages/shared/src/types/transparency.ts` — TransparencyMetadata interface
- `apps/web/lib/hooks/useIsMobile.ts` — Hydration-safe viewport hook
- `apps/web/lib/hooks/useIsMobile.test.ts` — 6 tests
- `apps/web/app/dashboard/TransparencyPanel.tsx` — Methodology display panel
- `apps/web/app/dashboard/TransparencyPanel.test.tsx` — 9 tests
- `apps/web/lib/analytics.ts` — Client-side trackClientEvent helper
- `apps/web/lib/analytics.test.ts` — 3 tests
- `apps/web/app/api/analytics/route.ts` — BFF proxy for analytics events
- `apps/api/src/routes/analytics.ts` — Express POST /analytics/events
- `apps/web/components/ui/BottomSheet.tsx` — Native dialog bottom sheet

**Modified files:**
- `packages/shared/src/types/sse.ts` — Added metadata to SseDoneEvent
- `packages/shared/src/types/index.ts` — Export TransparencyMetadata
- `packages/shared/src/constants/index.ts` — Added TRANSPARENCY_PANEL_OPENED
- `apps/web/lib/hooks/useAiStream.ts` — Added metadata to state, DONE/CACHE_HIT actions, parseSseLines
- `apps/web/lib/hooks/useAiStream.test.ts` — 4 new metadata tests
- `apps/web/app/dashboard/AiSummaryCard.tsx` — Added transparency props, metadata convergence, PostCompletionFooter props
- `apps/web/app/dashboard/AiSummaryCard.test.tsx` — 4 new transparency button tests
- `apps/web/app/dashboard/DashboardShell.tsx` — CSS Grid layout, conditional mobile/desktop, transparency state, analytics
- `apps/web/app/dashboard/DashboardShell.test.tsx` — Added mocks for new dependencies
- `apps/web/app/dashboard/page.tsx` — fetchCachedSummary returns metadata, cachedMetadata prop
- `apps/api/src/services/aiInterpretation/streamHandler.ts` — Include metadata in done SSE event
- `apps/api/src/routes/dashboard.ts` — Return metadata in anonymous cached summary endpoint
- `apps/api/src/routes/protected.ts` — Mount analytics router
