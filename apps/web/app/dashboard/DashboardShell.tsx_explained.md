# DashboardShell.tsx — Interview-Ready Documentation

> Source file: `apps/web/app/dashboard/DashboardShell.tsx` (~207 lines)

---

## 1. 30-Second Elevator Pitch

DashboardShell is the top-level client component that owns the dashboard's data lifecycle, filter state, and loading presentation. It accepts server-fetched `initialData` as a prop, hands it to SWR as `fallbackData` so the page renders instantly with zero loading spinners, then quietly revalidates in the background. Filter state (date range preset + expense category) is encoded directly into the SWR cache key — when filters change, the key changes, SWR treats it as a new request, and charts update with filtered data.

Story 2.8 added three meaningful pieces to that foundation: a `DemoModeBanner` that replaces the old inline demo indicator and renders conditionally based on a 4-state enum from the API, an `AiSummarySkeleton` that appears above the chart grid during initial cold loads, and a FilterBar skeleton (three pill-shaped placeholders) that fills the filter row while data is in flight. The shell now has five distinct visual states: initial-loading-skeleton, loaded-with-data, filtered-empty, no-data-empty, and error — plus two overlay-style additions (the banner and AI skeleton) that sit on top of those states.

**How to say it in an interview:** "DashboardShell bridges server and client rendering by passing server-fetched data into SWR's fallbackData. Filter state is encoded into the SWR cache key so filter changes trigger automatic refetches. Story 2.8 added a proper DemoModeBanner driven by a 4-state enum, an AiSummarySkeleton for cold load feedback, and a FilterBar skeleton so nothing janks during initial data fetch."

---

## 2. Why This Approach?

### Decision 1: SWR fallbackData for zero-flash hydration

**What's happening:** The parent server component fetches chart data during SSR and passes it as `initialData`. DashboardShell feeds that into SWR's `fallbackData` option. SWR treats it as the initial cache value — the component renders immediately with real data instead of showing a loading skeleton. After hydration, SWR revalidates in the background on tab focus.

**How to say it in an interview:** "fallbackData seeds SWR's cache with server-fetched data. The component hydrates with content already in place — no layout shift, no loading state on first paint. It's the stale-while-revalidate pattern applied to SSR hydration."

**Over alternative:** Using `useSWR` without fallback would show a skeleton on first client render, even though the data was already fetched on the server. Two-pass rendering for no reason. Using React Server Components alone would mean no client-side revalidation — stale data until a full page refresh.

### Decision 2: Class component error boundary in a functional codebase

**What's happening:** React still has no hook equivalent for `componentDidCatch` or `getDerivedStateFromError`. If a chart component throws during render, you need a class component to catch it. `ChartErrorBoundary` is a 30-line class that catches render errors, shows a fallback UI with a retry button, and exposes an `onRetry` prop that triggers SWR's `mutate()`.

**How to say it in an interview:** "Error boundaries require class components — React doesn't expose catch-during-render via hooks. This is the one place in the codebase where a class component is justified. The retry callback triggers SWR's mutate, which re-fetches and re-renders."

**Over alternative:** Letting chart errors propagate to the root error boundary would blank the entire page. Wrapping each chart individually would mean duplicate boundary code. One boundary around the grid is the right granularity — charts fail together, retry together.

### Decision 3: Skipping sm: breakpoint — mobile-first with md: jump

**What's happening:** The chart grid uses `grid gap-4 md:grid-cols-2 md:gap-6`. There's no `sm:` breakpoint. On mobile (< 768px), charts stack vertically. At `md:` (768px+), they go side-by-side. The `sm:` breakpoint (640px) is skipped because there's nothing useful to do at that width — a two-column chart grid at 640px would make each chart too narrow to read.

**How to say it in an interview:** "I skip the sm: breakpoint because charts need minimum width to be legible. The jump from single-column to two-column happens at md: (768px), where each chart gets at least 350px. The sm: range (640-767px) doesn't warrant a different layout."

**Over alternative:** Using `sm:grid-cols-2` would cram charts into roughly 300px columns on a 640px screen. The axes, labels, and tooltips would overlap or truncate.

### Decision 4: Five-tier visual states (not three)

**What's happening:** Before Story 2.8, the dashboard had three rendering branches. Now there are five, with two overlays that sit across multiple branches:

1. **Initial-loading-skeleton** — `isLoading && !hasData`. Shows ChartSkeleton pairs inside the error boundary, a FilterBar skeleton above, and the AiSummarySkeleton above the chart grid.
2. **Loaded-with-data** — charts render. AiSummarySkeleton disappears. DemoModeBanner may be visible.
3. **Filtered-empty** — data exists but current filters exclude everything, showing "No data matches these filters" with a reset button.
4. **No-data-empty** — no data at all, showing upload CTA.
5. **Error** — ChartErrorBoundary fallback with a retry button.

The `DemoModeBanner` and `AiSummarySkeleton` are overlays, not branches — they appear on top of states 1 and 2 depending on `demoState` and `isLoading`.

**How to say it in an interview:** "I distinguish between five visual states rather than just 'loading / data / empty.' The DemoModeBanner and AiSummarySkeleton are orthogonal to that — they render based on their own conditions across multiple states. It keeps each concern at the right level."

### Decision 5: DemoModeBanner driven by 4-state enum instead of boolean

**What's happening:** The old code used `data.isDemo` (a boolean) to show a simple `<p>` tag below the org name. Story 2.8 replaces that with a `DemoModeBanner` component that accepts a `demoState` prop typed as `DemoModeState` — a 4-value union: `seed_only`, `seed_plus_user`, `user_only`, `empty`. The banner component decides what to render (or whether to render at all) based on that state. The `seed_plus_user` and `user_only` states return null — no banner. The `seed_only` state shows a dismissible notice. The `empty` state shows a CTA to get started.

**How to say it in an interview:** "I replaced a boolean demo flag with a 4-state enum. A boolean can't express 'has user data but is also viewing seed data' vs. 'has only seed data' vs. 'has neither.' The enum lets the banner show the right message or hide entirely without DashboardShell needing to know which case it is."

**Over alternative:** Keeping the boolean and conditionally rendering different messages in DashboardShell would mean DashboardShell knows too much about demo state semantics. That logic belongs in the banner component.

### Decision 6: Filter state encoded in SWR cache key

**What's happening:** Instead of managing filter state separately from data fetching, filters are encoded directly into the SWR key string. `buildSwrKey()` converts `FilterState` into query params like `/dashboard/charts?from=2025-12-01&to=2026-03-01&categories=Payroll`. When filters change, the key changes, SWR sees a new cache entry, and fires a fresh request. Old filter combinations stay in SWR's cache, so switching back is instant.

**How to say it in an interview:** "Filters are encoded into the SWR cache key rather than managed as separate state that triggers fetches. This gives us automatic cache per filter combination — switching between 'Last 3 months' and 'Last year' serves from cache after the first load."

**Over alternative:** Keeping filter state separate and calling `mutate()` on change would work but loses the per-key caching benefit. Every filter change would refetch even if we'd seen that combination before.

### Decision 7: FilterBar skeleton matches pill shape, not generic rectangles

**What's happening:** The FilterBar skeleton (shown when `isLoading && hasAnyData && !hasData`) renders three rounded shapes: two `w-[120px] rounded-full` divs and one `w-[80px] rounded-md` div. These dimensions aren't arbitrary — they match the approximate shape of the actual FilterBar's date preset dropdown, category dropdown, and reset button. When the real FilterBar renders, nothing jumps.

**How to say it in an interview:** "The FilterBar skeleton matches the real component's shape so the layout is stable when real filters appear. Skeleton fidelity matters — a generic gray box that snaps to a different-shaped filter control causes layout shift."

### Decision 8: AiSummarySkeleton above charts, outside the error boundary

**What's happening:** `AiSummarySkeleton` renders with `{isLoading && !hasData && <AiSummarySkeleton className="mb-6" />}` — it's positioned inside the `<section>` but outside `ChartErrorBoundary`. This is deliberate. The AI summary panel will be a separate UI concern from the chart grid. Putting it inside the error boundary would mean a chart render error could mask the AI section. Putting it outside means each area fails independently.

**How to say it in an interview:** "The AiSummarySkeleton sits outside the chart error boundary because the AI summary and charts are independent UI regions. A chart crash shouldn't suppress the AI panel, and vice versa."

### Decision 9: useRouter for upload navigation instead of a Link component

**What's happening:** `DemoModeBanner` needs to navigate to `/upload` when the user clicks the "Upload CSV" button. DashboardShell passes `handleUploadClick` — a `useCallback` wrapping `router.push('/upload')` — as the `onUploadClick` prop. This is an imperative navigation call, not a declarative `<Link>`. The banner is deep inside the component tree; passing the router down through props is the right call here rather than giving the banner its own router instance.

**How to say it in an interview:** "I pass a navigation callback down instead of letting the banner own a router. The banner stays a pure presentational component — it fires a callback, DashboardShell decides where to go."

### Decision 10: section element with aria-labelledby

**What's happening:** The chart area is now wrapped in `<section aria-labelledby="dashboard-heading">` where `dashboard-heading` is the `id` on the `<h1>` that shows `data.orgName`. This means screen readers announce the heading when entering the section, giving users context before they encounter the charts.

**How to say it in an interview:** "The section/h1 pairing with aria-labelledby creates a labeled landmark. Screen readers can navigate by landmark and will announce the org name when entering the chart section. It's a small addition with meaningful accessibility impact."

---

## 3. Code Walkthrough

### Imports and interface (lines 1-21)

The imports follow the standard ordering: React, Next.js, third-party (SWR, Lucide), then internal modules. Story 2.8 added `useRouter` from `next/navigation`, `AiSummarySkeleton` from the local dashboard module, and `DemoModeBanner` from `@/components/common`. The `DashboardShellProps` interface still takes `initialData: ChartData`. `ChartData` now includes `demoState: DemoModeState` (a shared schema field added in Story 2.8).

### Constants, buildSwrKey, and fetchChartData (lines 23-45)

`EMPTY_FILTERS` defines the starting state — both `datePreset` and `category` null. `buildSwrKey` converts `FilterState` into a URL string with query params. It calls `computeDateRange` to turn a preset like `'last-3-months'` into `from` and `to` ISO dates, and appends a `categories` param if set. The resulting string (e.g., `/dashboard/charts?from=2025-12-02&to=2026-03-02&categories=Payroll`) becomes the SWR cache key. `fetchChartData` takes this key string and passes it directly to `apiClient` as the request path — the query params travel with it.

### ChartErrorBoundary (lines 47-76)

A class component with minimal state: `{ hasError: boolean }`. `getDerivedStateFromError` flips the flag. The render method shows either the fallback (retry button + message) or `this.props.children`. The retry button resets `hasError` to false and calls `onRetry()` to trigger SWR refetch. The `col-span-full` class on the fallback ensures it spans the entire grid.

### EmptyState and FilteredEmptyState (lines 78-107)

Both are presentational components. `EmptyState` renders when no data exists at all — dashed border, Upload icon, Link to `/upload`. `FilteredEmptyState` renders when data exists but current filters exclude everything — shows a Filter icon and a reset button instead of an upload CTA. The distinction matters: a user who sees "No data matches these filters" has data, they just need to widen their search.

### DashboardShell — state setup (lines 109-147)

The main export. `useRouter` is now initialized at the top alongside `useSidebar`. `filters` state starts at `EMPTY_FILTERS`. SWR is configured with `fallbackData: initialData`, `keepPreviousData: true`, and focus revalidation on.

`handleUploadClick` (lines 139-141) is a new `useCallback` wrapping `router.push('/upload')`. This gets passed to `DemoModeBanner` as `onUploadClick`. Memoized so DemoModeBanner doesn't re-render on unrelated state changes.

Four data presence booleans (lines 143-146): `hasRevenue`, `hasExpenses`, `hasData` (filtered), `hasAnyData` (from initialData, filter-agnostic). `hasAnyData` drives FilterBar and its skeleton — an empty org gets neither.

### DashboardShell — layout (lines 148-205)

**DemoModeBanner (line 150):** Rendered first, outside the max-width container, passing `data.demoState` and `handleUploadClick`. The banner manages its own visibility — DashboardShell doesn't need to know which states show the banner.

**FilterBar / FilterBar skeleton (lines 152-169):** A three-way conditional: if `isLoading && hasAnyData && !hasData`, render the pill skeleton. If `hasAnyData` (and not loading), render the real FilterBar. Otherwise null. The skeleton and real FilterBar live at the same vertical position, so the transition is seamless.

**Section element (line 171):** `<section aria-labelledby="dashboard-heading">` wraps everything from the org name heading to the chart grid. The heading's `id="dashboard-heading"` links the two.

**AiSummarySkeleton (line 176):** `{isLoading && !hasData && <AiSummarySkeleton className="mb-6" />}`. Renders above the chart grid, below the org name. Disappears once data arrives. Positioned outside ChartErrorBoundary to keep AI and chart concerns separate.

**Chart area (lines 178-202):** ChartErrorBoundary wraps a four-branch conditional: loading skeleton, filtered-empty, empty, or chart grid. Each branch is self-contained. Charts are wrapped in `LazyChart` for mobile viewport-based lazy loading.

---

## 4. Complexity and Trade-offs

**AiSummarySkeleton is a placeholder.** The AI summary panel doesn't exist yet — the skeleton just reserves space where it will eventually render. This is intentional. The skeleton teaches users to expect an AI section without the API integration being live. The risk is that the skeleton disappears and nothing replaces it — that's acceptable for now because the section is positioned for a future story.

**DemoModeBanner owns all demo state logic.** DashboardShell passes `demoState` and `onUploadClick` and stops caring. The banner decides whether to render, what message to show, when to dissolve. This means DashboardShell is simpler, but it also means you have to look at two files to understand the full demo experience.

**Single error boundary for all charts.** One chart failing takes down the entire grid — both charts show the retry fallback. For a two-chart dashboard this is fine. If the grid grew to 6+ charts, individual boundaries would let healthy charts remain visible.

**revalidateOnFocus enabled.** Focus revalidation is on so returning to the tab picks up fresh data. `revalidateOnReconnect` is off since network reconnection doesn't correlate with data changes. `keepPreviousData: true` prevents skeleton flashes during filter switches.

**No error state for fetch failures after initial load.** If `fetchChartData` fails after hydration, SWR keeps showing the last good data and sets `error` — but there's no error banner. The error boundary only catches render errors, not fetch errors. Worth adding a toast for persistent failures in a future iteration.

**FilterBar skeleton has hardcoded widths.** The `w-[120px]` and `w-[80px]` values approximate the actual FilterBar button sizes. If FilterBar changes shape, the skeleton won't automatically follow. This is a minor maintenance concern, not a bug.

**How to say it in an interview:** "The main trade-offs are skeleton-as-placeholder for the AI section and a shared error boundary for the chart grid. The skeleton is forward-looking — it sets user expectations before the feature ships. The shared boundary is pragmatic for two charts. DemoModeBanner owning its own logic keeps DashboardShell focused on layout and data, but splits demo UX across two files."

---

## 5. Patterns Worth Knowing

### SWR fallbackData (Stale-While-Revalidate Hydration)

`fallbackData` pre-fills SWR's cache before the component mounts. The server component fetches data, passes it as a prop, and SWR uses it as if it was already cached. The component renders with data immediately. SWR can still revalidate in the background — you get SSR speed with client-side freshness.

**Interview-ready:** "fallbackData bridges SSR and client caching. The server fetch seeds SWR's cache, so the client hydrates with real data. No loading skeleton on first render. Background revalidation keeps it fresh without the user noticing."

### Error Boundaries (Class Component Exception)

Error boundaries are the one thing you still need class components for in React. There's no `useErrorBoundary` hook. The pattern: wrap a subtree, catch render errors, show a fallback, optionally expose a reset mechanism. Libraries like `react-error-boundary` wrap this in a nicer API, but the underlying mechanism is still `getDerivedStateFromError`.

**Interview-ready:** "Error boundaries require class components because React's hook system can't intercept render-phase errors. This is a deliberate React API gap — the team has discussed it but hasn't shipped a hook-based alternative."

### Conditional Rendering with Orthogonal Concerns

The five-state branching for charts and the two-overlay approach for DemoModeBanner and AiSummarySkeleton are orthogonal. The banner doesn't care whether we're loading or filtered-empty — it renders based on `demoState`. The AiSummarySkeleton doesn't care about filter state — it renders based on `isLoading && !hasData`. Keeping these conditions separate prevents an explosion of nested conditionals.

**Interview-ready:** "I separate chart state branches from overlay conditions. The banner and skeleton are independent of the chart state machine — they evaluate their own conditions. It avoids nesting five states inside two overlays inside each other."

### 4-State Enums for Progressive State Machines

`DemoModeState = 'seed_only' | 'seed_plus_user' | 'user_only' | 'empty'` models how a new user transitions through onboarding: starts with only seed data, eventually has both, then moves to user-only data. A boolean can't express all four states — it can only tell you "is demo or not," which collapses two distinct states (`seed_plus_user` and `user_only`) into one.

**Interview-ready:** "When you have more than two meaningful states, reach for an enum instead of a boolean. A boolean is a type-level lie when you have four distinct cases — the fourth case will either be a bug or a weird edge case that never gets handled."

### Skeleton Fidelity and Layout Stability

The FilterBar skeleton uses widths and border-radius values that approximate the real component's shape. When the real FilterBar appears, the layout doesn't shift. The AiSummarySkeleton uses a card-shaped container with realistic text-line proportions. Both skeletons exist to keep layout stable, not just to signal "something is loading."

**Interview-ready:** "A skeleton's job is to prevent layout shift, not just show a spinner. If your skeleton is a generic gray box that snaps to a different-shaped component when content arrives, you've made the UX worse. Match the shape."

### LazyChart Wrapper for Mobile Optimization

Charts are expensive to render. On mobile, where they stack vertically and the second chart is below the fold, `LazyChart` defers rendering until the element scrolls into view. On desktop, both charts are visible at once, so it renders immediately. The wrapper abstracts this concern away from each chart component.

**Interview-ready:** "LazyChart uses IntersectionObserver on mobile to defer below-fold charts. Desktop renders immediately since both charts are in-viewport. The wrapper keeps each chart component unaware of its loading strategy."

---

## 6. Potential Interview Questions

### Q1: "Why use SWR's fallbackData instead of just passing initialData directly?"

**Context if you need it:** The interviewer wants to know why you introduced a caching layer on top of server data.

**Strong answer:** "If I just rendered initialData as a prop, I'd lose client-side caching and revalidation. SWR gives me a cache key that persists across navigations — if the user leaves the dashboard and comes back, SWR can serve from cache instead of re-fetching. fallbackData seeds that cache with server data, so I get instant first paint AND a client cache for subsequent visits."

**Red flag:** "SWR automatically fetches data." — True but misses the point. The question is about why fallbackData specifically, not why SWR.

### Q2: "Why is the error boundary a class component?"

**Context if you need it:** Tests whether you know about React's API limitations.

**Strong answer:** "React has no hook equivalent for getDerivedStateFromError or componentDidCatch. Error boundaries that catch render-phase exceptions can only be implemented as class components. This is a known API gap — the React team has discussed it but hasn't shipped a hook-based alternative. It's the one legitimate reason to still write a class component."

**Red flag:** "I prefer class components for complex logic." — Suggests you don't know why it has to be a class here.

### Q3: "Why did you replace the isDemo boolean with a 4-state DemoModeState enum?"

**Context if you need it:** Tests whether you can articulate when a boolean isn't enough.

**Strong answer:** "A boolean can only express 'is demo' vs. 'not demo.' But there are four distinct cases: only seed data exists, seed plus user data exists, only user data exists, or nothing exists. The 'seed_plus_user' state is particularly important — the user has uploaded data but seed data is still mixed in. The banner should behave differently there than when only seed data exists. A boolean collapses these cases and forces you to handle the edge cases with implicit logic elsewhere."

**Red flag:** "It's more extensible." — True but vague. Give the concrete example.

### Q4: "What happens if the API returns an error during background revalidation?"

**Context if you need it:** Probes your understanding of SWR's error handling.

**Strong answer:** "SWR keeps the last successful data in cache and sets the error property. The UI continues showing stale data — the user doesn't see a flash of error state. Currently, this component doesn't surface fetch errors to the user, which is a known gap. I'd add a subtle toast or banner for persistent failures."

**Red flag:** "The error boundary catches it." — Error boundaries catch render errors, not async fetch errors. Different mechanism entirely.

### Q5: "Why is AiSummarySkeleton outside the ChartErrorBoundary?"

**Context if you need it:** Tests understanding of error boundary scope.

**Strong answer:** "The AI summary and chart grid are independent UI regions. If charts throw during render, the error boundary should contain that failure — it shouldn't also suppress the AI summary area. Putting the skeleton outside the boundary means the AI section can fail independently of the chart section. When the AI summary panel is fully implemented, it'll likely have its own error handling."

**Red flag:** "It's just easier to put it outside." — You need to articulate why the boundary granularity matters.

### Q6: "Why use keepPreviousData in the SWR config?"

**Context if you need it:** Checks whether you understand SWR's rendering behavior when cache keys change.

**Strong answer:** "When filters change, the SWR cache key changes, which means SWR treats it as a new request. Without keepPreviousData, the component would flash a loading skeleton while the new data fetches — even though the old data is still perfectly displayable. keepPreviousData holds the previous filter's data on screen until the new response arrives. The user sees a brief stale state instead of a jarring skeleton swap."

**Red flag:** "To avoid re-fetching." — It still re-fetches. keepPreviousData affects what's displayed during the fetch, not whether it happens.

### Q7: "How would you handle the case where one chart fails but the other is fine?"

**Context if you need it:** Tests your understanding of error boundary granularity.

**Strong answer:** "Right now, both charts share one error boundary, so one failure takes down both. For a two-chart layout, that's a reasonable trade-off — the retry re-fetches the shared data anyway. If the grid grew to 6+ charts, I'd wrap each in its own boundary so healthy charts stay visible. The error boundary's onRetry would still call SWR's mutate since they share data."

---

## 7. Data Structures

### ChartData (from shared/types)

**What it is:** The API response shape for the dashboard charts endpoint. Contains `orgName` (string), `isDemo` (boolean), `demoState` (DemoModeState — 4-value union), `revenueTrend` (array of monthly revenue points), `expenseBreakdown` (array of category totals), `availableCategories` (string array for filter dropdowns), and `dateRange` (nullable min/max bounds). Story 2.8 added `demoState` to this type via the shared Zod schema in `packages/shared/src/schemas/charts.ts`.

**Where it appears:** Props interface, SWR generic parameter, the `data` variable throughout rendering. `data.demoState` now drives DemoModeBanner. `data.orgName` drives both the heading and the sidebar context.

**Why this shape:** One API call returns everything the dashboard needs. No waterfall of separate chart requests. The backend aggregates from `data_rows` and returns pre-computed points — the client doesn't do any data transformation.

**How to say it in an interview:** "ChartData is a single payload containing both chart datasets, metadata, and demo state. One request, no client-side aggregation. demoState is a 4-value enum that the DemoModeBanner consumes directly — DashboardShell doesn't interpret it."

### DemoModeState (from shared/types)

**What it is:** `'seed_only' | 'seed_plus_user' | 'user_only' | 'empty'`. A 4-state enum modeled in Zod as `z.enum([...])` in `packages/shared/src/schemas/datasets.ts` and re-exported from the shared types barrel.

**Where it appears:** `ChartData.demoState`, `DemoModeBanner` props interface, the `MESSAGES` map inside DemoModeBanner.

**Why this shape:** The states model the demo data lifecycle. `seed_only` means the org has no user data yet. `seed_plus_user` means the user has uploaded data but seed data still exists in the system. `user_only` means only user-uploaded data. `empty` means nothing. The banner needs all four to show the right message (or no message) at each stage.

**How to say it in an interview:** "DemoModeState is a discriminated union that maps to distinct product states. The backend computes which state applies based on what data rows exist for the org. The frontend consumes it without having to re-derive that logic."

### SWR Cache Entry

**What it is:** SWR maintains an internal cache keyed by the first argument to `useSWR` — in this case, the string from `buildSwrKey(filters)`. The cache entry holds the most recent successful response. `fallbackData` seeds this entry before the first fetch.

**Where it appears:** Implicitly — SWR manages this internally. The cache key changes as filters change, giving each filter combination its own cache slot.

**Why this matters:** `mutate()` (called from ChartErrorBoundary's retry) invalidates the current key, triggering a re-fetch for all subscribers of that key.

**How to say it in an interview:** "SWR's cache is keyed by the first argument — a string or array. Any component using the same key shares the same cache entry. mutate() invalidates by key, triggering re-fetch for all subscribers."

---

## 8. Impress the Interviewer

### The fallbackData Pattern Eliminates a Whole Category of UX Problems

**What's happening:** Most SSR + client-data apps have a "hydration flash" — the server renders content, the client hydrates, the data-fetching hook runs, and for a frame or two you see a loading skeleton even though the data was already there. `fallbackData` eliminates this by seeding SWR's cache before the first render. No flash, no layout shift, no CLS penalty.

**Why it matters:** CLS (Cumulative Layout Shift) is a Core Web Vital that affects SEO rankings. A skeleton-to-content swap shifts layout. `fallbackData` means the content is in place from the first client render — measurably better CLS scores.

**How to bring it up:** "I used SWR's fallbackData to eliminate the hydration flash between server render and client data fetch. The server component passes real data into the client component's cache, so there's no skeleton-to-content swap and no CLS hit. It's one of those patterns where you get better UX and better performance metrics simultaneously."

### The Error Boundary + SWR Retry Loop Is Self-Healing

**What's happening:** When a chart throws during render, the error boundary catches it and shows a retry button. The retry does two things: resets the boundary's `hasError` flag and calls `mutate()`. This triggers SWR to re-fetch fresh data and re-render the children. If the error was caused by bad data (like a NaN in the chart), the fresh fetch might fix it. If it was a transient rendering bug, the re-render might clear it. The system self-heals without a full page refresh.

**Why it matters:** Most error boundaries are dead ends — "Something went wrong, refresh the page." This one recovers gracefully because the retry callback hooks into the data layer. It shows you understand error recovery, not just error display.

**How to bring it up:** "The error boundary's retry resets the catch state and triggers SWR's mutate. It re-fetches data and re-renders with fresh state, so a data-driven error can self-correct without a full page reload."

### The DemoModeBanner Dissolve Animation Models a State Transition Visually

**What's happening:** When `demoState` transitions from `seed_only` to anything else, DemoModeBanner doesn't just disappear — it triggers a dissolve animation. A `useEffect` watches for that specific transition, sets `dissolving: true`, and the component applies `animate-banner-dissolve`. When the animation ends, `dismissed` gets set and the banner unmounts. This animation only plays for the `seed_only → *` transition, not for other state changes.

**Why it matters:** State transitions are invisible by default in React — a component either renders or it doesn't. Adding an exit animation for meaningful state changes gives users a visual signal that something changed. It's a small UX detail but it shows you think about the user's mental model, not just the code state.

**How to bring it up:** "The banner uses a dissolve animation specifically when the org transitions from seed-only to having real data. It's not just a fade-out — it's timed to a meaningful product event. When a user's first CSV upload completes and the demo banner dissolves, that's a moment of product clarity. The animation makes it feel intentional."

### Skeleton Placement Communicates Future Features

**What's happening:** `AiSummarySkeleton` appears above the chart grid during initial loads, even though no AI summary feature exists yet in the UI. The skeleton reserves space for a section that will come in a future story. This is deliberate product scaffolding — users see the loading animation, and when the real AI summary panel ships, it fills that space naturally.

**Why it matters:** You don't need all features built before you can communicate their presence. The skeleton tells users "there's an AI feature here" before the feature is ready. It sets expectations, reduces surprise on launch, and keeps the UI layout stable across stories.

**How to bring it up:** "The AiSummarySkeleton is a forward-looking placeholder. The AI summary feature isn't live yet, but the skeleton reserves its space in the layout and gives users a preview of what's coming. When the real panel ships, it drops into place without any layout change."
