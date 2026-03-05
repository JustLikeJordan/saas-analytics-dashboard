# Story 2.8: Loading States & Demo Mode Banner

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want to see clear loading indicators while data loads and know when I'm viewing demo data,
so that I understand the system state and am never confused about what I'm seeing.

## Acceptance Criteria

1. **Given** the dashboard is loading data, **when** charts and content are being prepared, **then** skeleton loading states are displayed (FR15), including AI summary skeleton with 4 text lines at descending widths (100%, 90%, 95%, 60%), and `prefers-reduced-motion` uses solid `--color-muted` without pulse animation.

2. **Given** I am viewing seed/demo data, **when** the dashboard renders, **then** a DemoModeBanner component is displayed as an informational indicator (not a nag) (FR17), and the banner auto-dissolves on first real upload with a 300ms ease-out fade.

3. **Given** the page loads, **when** accessibility is evaluated, **then** semantic HTML elements are used (nav, main, article, section, button) (NFR24), and a skip-to-content link exists as the first focusable element targeting `<main id="main-content">` (NFR25).

## Tasks / Subtasks

- [x]Task 1: Create `AiSummarySkeleton` component (AC: #1)
  - [x]Build `apps/web/app/dashboard/AiSummarySkeleton.tsx` — 4 text-line skeleton with descending widths (100%, 90%, 95%, 60%) inside a Card with left-border accent
  - [x]Use existing `animate-skeleton-pulse` keyframe from globals.css (1500ms ease-in-out infinite)
  - [x]Add `motion-reduce:animate-none` on all animated elements, fall back to solid `--color-muted`
  - [x]Add `role="status"` + `aria-label="Loading AI summary"`
  - [x]Write Vitest tests for AiSummarySkeleton render, reduced-motion class presence, accessibility attributes

- [x]Task 2: Create `DemoModeBanner` component (AC: #2)
  - [x]Build `apps/web/components/common/DemoModeBanner.tsx`
  - [x]Props: `demoState: 'seed_only' | 'seed_plus_user' | 'user_only' | 'empty'`, `onUploadClick: () => void`
  - [x]State-dependent messages:
    - `seed_only`: "You're viewing sample data — upload your own CSV to see real insights" + "Upload CSV" primary button
    - `empty`: "Get started — upload a CSV to see AI-powered insights" + "Upload CSV" primary button
    - `seed_plus_user` / `user_only`: renders `null` (no banner)
  - [x]Session-dismissible via `useState` (not permanent — returns on next visit for `seed_only`)
  - [x]Dismiss button with `aria-label="Dismiss sample data notice"`
  - [x]`role="status"`, `aria-live="polite"` for accessibility
  - [x]Auto-dissolve animation: 300ms ease-out (fade + height collapse) — add `@keyframes banner-dissolve` to globals.css
  - [x]`motion-reduce:` dissolve at 0ms (instant)
  - [x]Write Vitest tests for all 4 demo states, dismiss behavior, accessibility attributes, reduced-motion

- [x]Task 3: Add `demoState` to shared schemas and API response (AC: #2)
  - [x]Extend `packages/shared/src/schemas/charts.ts` — add `demoState` field using `demoModeStateSchema` (already exists in `datasets.ts`) to `ChartData`
  - [x]Update `apps/api/src/routes/dashboard.ts` — derive `demoState` with this specific mapping:
    - Anonymous/expired-JWT users (seed org path): hard-code `demoState: 'seed_only'` — the seed org always has seed data, never user uploads. Do NOT call `getUserOrgDemoState()` on the seed org — that function only handles user orgs and would incorrectly return `'empty'`.
    - Authenticated users (real org path): call `getUserOrgDemoState(orgId)` from `datasetsQueries` — returns `'user_only'` or `'empty'`
    - Import `datasetsQueries` alongside existing `chartsQueries` and `orgsQueries` in the dashboard route
  - [x]Update `apps/web/app/dashboard/page.tsx` — add `demoState: 'empty'` to `EMPTY_CHART_DATA` fallback constant (type-check will fail without it, same pattern as Story 2.7 adding `availableCategories`)
  - [x]Update `apps/api/src/routes/dashboard.test.ts` — add `demoState` to `chartFixture` and add assertions for `demoState` field in response
  - [x]Update `apps/web/app/dashboard/DashboardShell.test.tsx` — add `demoState` to both `fullData` and `emptyData` test fixtures (type-check breaks otherwise)

- [x]Task 4: Integrate into DashboardShell (AC: #1, #2)
  - [x]Import and render `AiSummarySkeleton` — show when `isLoading && !hasData`, positioned where AiSummary will eventually render (above charts per UX spec)
  - [x]Import and render `DemoModeBanner` — positioned below AppHeader, above AI summary area (per UX spec layout)
  - [x]Replace the existing inline `<p>` demo indicator with `DemoModeBanner` component
  - [x]Pass `demoState` from `data.demoState` to DemoModeBanner
  - [x]Wire `onUploadClick` to `router.push('/upload')` — import `useRouter` from `next/navigation` (new import for DashboardShell; existing nav uses `Link` from `next/link`, this callback needs imperative navigation)
  - [x]Handle auto-dissolve: when `demoState` transitions from `seed_only` to `seed_plus_user` (after SWR revalidation post-upload), trigger the dissolve animation then unmount. Note: the UX spec pairs this dissolve with a Toast ("Your data is ready — viewing real insights now", 5s auto-dismiss). Toast infrastructure does not exist yet — **defer Toast to a future story** when Toast is built. The banner dissolve alone is sufficient feedback for now.
  - [x]Update DashboardShell tests — the existing "shows demo banner when isDemo is true" and "hides demo banner when isDemo is false" tests (lines 95-105) will break because the inline `<p>` text they assert on is being replaced by the mocked `DemoModeBanner` component. Rewrite these assertions to verify `DemoModeBanner` receives the correct `demoState` prop instead.

- [x]Task 5: Add FilterBar skeleton (AC: #1)
  - [x]Add a `FilterBarSkeleton` inline in DashboardShell (2 pill shapes 120px x 36px + 1 button shape) — show when `isLoading` and `hasAnyData`
  - [x]No sticky positioning needed on the skeleton — there's no content to scroll past during initial load. Regular flow positioning is correct.
  - [x]Use `animate-skeleton-pulse` + `motion-reduce:animate-none`
  - [x]Test skeleton appears during loading state

- [x]Task 6: Semantic HTML audit (AC: #3)
  - [x]Verify dashboard layout.tsx already has `<main id="main-content">` — it does (confirmed in analysis)
  - [x]Verify skip-to-content link exists in layout.tsx — it does (confirmed: `<a>Skip to main content</a>` with sr-only + focus ring)
  - [x]Audit DashboardShell for semantic elements: ensure charts are in `<section>`, demo banner uses appropriate roles
  - [x]Add any missing semantic wrappers (article, section, nav) where appropriate

- [x]Task 7: Companion docs (AC: all)
  - [x]Generate `AiSummarySkeleton.tsx_explained.md`
  - [x]Generate `DemoModeBanner.tsx_explained.md`
  - [x]Update `DashboardShell.tsx_explained.md` with skeleton and banner integration

- [x]Task 8: Verification (AC: all)
  - [x]`pnpm type-check` passes
  - [x]`pnpm lint` passes
  - [x]`pnpm test` passes (all existing + new tests)

## Dev Notes

### Architecture Decisions

- **DemoModeBanner is a proper component, not inline text.** The current implementation is just a `<p>` tag in DashboardShell. The UX spec calls for a full component with state-dependent messaging, dismiss behavior, dissolve animation, and accessibility attributes. Build it in `components/common/` — this will be the first real file in that directory (currently only has `.gitkeep`). No existing pattern file to reference there, but follow the same conventions as `components/layout/` files.

- **AiSummarySkeleton is purpose-built, not a generic Skeleton primitive.** The UX spec says "Custom text-line skeletons with varied widths... ours mimic the shape of real text paragraphs." Build a dedicated component rather than a generic `<Skeleton>` wrapper — there's no need for a shared primitive yet (no other consumers).

- **`demoState` exposed as an enum, not just `isDemo` boolean.** The UX spec's DemoModeBanner has different messages per state (`seed_only` vs `empty`). The `demoModeStateSchema` exists in `packages/shared/src/schemas/datasets.ts`. However, the existing `getUserOrgDemoState()` query in `db/queries/datasets.ts` only handles user orgs — it returns `'user_only'` or `'empty'`, never `'seed_only'` or `'seed_plus_user'`. For anonymous users hitting the seed org, hard-code `'seed_only'` in the route — don't call that function on the seed org or you'll get `'empty'` (wrong).

- **Session-dismissible banner, not permanent dismiss.** UX spec says: "Dismissible per session (not permanently — returns on next visit for `seed_only`)." Use `useState` — no localStorage, no cookie, no server state. Simple.

- **Auto-dissolve on state transition is the key UX moment.** When SWR revalidates after upload and `demoState` changes from `seed_only` to `seed_plus_user`, the banner should dissolve with the 300ms animation. The UX spec pairs this with a Toast ("Your data is ready — viewing real insights now", 5s auto-dismiss), but Toast infrastructure doesn't exist yet. **Toast is deferred** — the banner dissolve alone is sufficient for this story. When Toast is built (likely Epic 3 or 7), the "aha moment" pairing can be completed.

- **FilterBar skeleton is inline, not a separate component.** It's 3 pill-shaped divs — not worth a separate file. Render conditionally in DashboardShell when loading.

### Existing Patterns to Follow

- **ChartSkeleton pattern** (`apps/web/app/dashboard/charts/ChartSkeleton.tsx`): Uses `animate-skeleton-pulse` class, `motion-reduce:animate-none`, `role="status"`, `aria-label`. Also imports `cn()` from `@/lib/utils` for conditional class merging. Follow this exact pattern for AiSummarySkeleton and DemoModeBanner (use `cn()` for animation state classes).
- **Animation keyframes** (`apps/web/app/globals.css`): `--animate-skeleton-pulse` already defined (1.5s ease-in-out infinite, opacity 1→0.4→1). `--animate-fade-in` already defined (150ms ease-out). Add `banner-dissolve` following the same pattern.
- **Card styling**: AI summary card uses `border-left: 4px solid hsl(var(--primary))` + `shadow-md`. Regular chart cards use `shadow-sm`. The skeleton should match the AI summary card styling.
- **Breakpoint strategy**: Base classes = mobile, `md:` = 768px tablet/desktop. No `sm:` prefix usage.
- **Component test pattern**: Co-located `*.test.tsx`, Vitest + React Testing Library, `vi.mock()` inline. See `FilterBar.test.tsx` (28 tests) for reference.
- **Controlled components**: DashboardShell owns state, passes down via props. DemoModeBanner reports via callbacks.

### File Structure

**New files:**
- `apps/web/app/dashboard/AiSummarySkeleton.tsx` — AI summary loading skeleton
- `apps/web/app/dashboard/AiSummarySkeleton.test.tsx` — Tests
- `apps/web/app/dashboard/AiSummarySkeleton.tsx_explained.md` — Interview docs
- `apps/web/components/common/DemoModeBanner.tsx` — Demo mode banner component
- `apps/web/components/common/DemoModeBanner.test.tsx` — Tests
- `apps/web/components/common/DemoModeBanner.tsx_explained.md` — Interview docs

**Modified files:**
- `packages/shared/src/schemas/charts.ts` — Add `demoState` to ChartData schema
- `packages/shared/src/types/index.ts` — Re-export updated ChartData type (if needed)
- `apps/api/src/routes/dashboard.ts` — Include `demoState` in response, import `datasetsQueries`
- `apps/api/src/routes/dashboard.test.ts` — Add `demoState` to `chartFixture`, test `demoState` field
- `apps/web/app/dashboard/page.tsx` — Add `demoState: 'empty'` to `EMPTY_CHART_DATA` fallback
- `apps/web/app/dashboard/DashboardShell.tsx` — Integrate AiSummarySkeleton, DemoModeBanner, FilterBarSkeleton; remove inline `<p>` demo indicator; add `useRouter` import from `next/navigation`
- `apps/web/app/dashboard/DashboardShell.test.tsx` — Add `demoState` to test fixtures, rewrite demo banner assertions (existing tests at lines 95-105 break when `<p>` replaced by mocked component)
- `apps/web/app/dashboard/DashboardShell.tsx_explained.md` — Update docs
- `apps/web/app/globals.css` — Add `banner-dissolve` keyframe

### Library & Framework Requirements

- **No new dependencies.** Everything uses existing Tailwind CSS animations, React state, and SWR revalidation.
- **Tailwind CSS 4**: CSS-based `@theme` and `@keyframes` — not `tailwind.config.js`.
- **React 19.2**: `useState` for local dismiss state. No `useEffect` for animation — CSS handles it.
- **SWR**: `keepPreviousData: true` already set in DashboardShell — skeleton only shows on initial load, not filter changes.

### Testing Requirements

- **AiSummarySkeleton tests**: Renders 4 skeleton lines, correct widths, `role="status"`, `aria-label`, `motion-reduce:animate-none` classes present.
- **DemoModeBanner tests**: Renders correct message for `seed_only`, renders correct message for `empty`, renders null for `seed_plus_user`/`user_only`, dismiss button hides banner, accessibility attributes (`role="status"`, `aria-live="polite"`, dismiss `aria-label`), reduced-motion behavior.
- **DashboardShell integration tests**: AiSummarySkeleton shows during loading, DemoModeBanner renders when `isDemo` and `demoState` is `seed_only`, banner absent when `demoState` is `user_only`, FilterBarSkeleton shows during loading.

### Previous Story Intelligence (2.7)

**From Story 2.7 (Date Range & Category Filters):**
- Custom accessible dropdowns built without Radix UI — follow this "build minimal, no extra deps" pattern.
- Filter state in SWR cache key via `buildSwrKey()` — skeleton should NOT re-show when switching filters (SWR `keepPreviousData` handles this).
- Three-tier empty state pattern (loading/filtered-empty/no-data) — this story adds a fourth visual state: skeleton.
- Badge animation (`animate-badge-in`) added to globals.css — follow same pattern for `banner-dissolve`.
- `motion-reduce:animate-none` used consistently across all animated elements.
- Total tests at end of 2.7: 340 (220 API + 120 web). This story should add ~30-40 new tests.

### Git Intelligence

**Recent commit patterns:**
- Feature branches named `feat/story-X.Y-description`
- Conventional commits: `feat:`, `fix:`, `docs:` prefixes
- Stories implemented atomically in feature branches, merged via PR
- Code review findings addressed in separate `fix:` commits

### Project Context Reference

- **Project context**: `_bmad-output/project-context.md` (~251 rules, all sections)
- **Architecture**: `_bmad-output/planning-artifacts/architecture.md`
- **UX spec**: `_bmad-output/planning-artifacts/ux-design-specification.md`
- **PRD**: `_bmad-output/planning-artifacts/prd.md`
- **CLAUDE.md**: Root project instructions (mandatory rules)

### References

- [Source: epics.md — Story 2.8 acceptance criteria]
- [Source: prd.md — FR15, FR17, NFR24, NFR25]
- [Source: ux-design-specification.md — Loading & Empty States (lines 1703-1726)]
- [Source: ux-design-specification.md — DemoModeBanner component (lines 1451-1472)]
- [Source: ux-design-specification.md — Animation & Transition Patterns (lines 1779-1797)]
- [Source: ux-design-specification.md — Hydration Strategy (lines 1888-1897)]
- [Source: ux-design-specification.md — Dashboard Layout Zones (lines 736-791, 1816-1855)]
- [Source: project-context.md — Animation Durations, Breakpoint Strategy, Demo Mode State Machine]
- [Source: DashboardShell.tsx — Current inline demo indicator (lines 153-157)]
- [Source: ChartSkeleton.tsx — Skeleton pattern reference]
- [Source: globals.css — Existing animation keyframes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Lint fix: React 19 `react-hooks/refs` rule prohibits `useRef` access during render. Refactored DemoModeBanner from `useRef` + `useEffect` to `useState`-based "adjusting state during render" pattern (React-recommended for prop-derived state).
- Lint fix: React 19 `react-hooks/set-state-in-effect` rule prohibits `setState` inside `useEffect`. Same refactor addressed both issues.

### Completion Notes List

- **Task 1**: Created `AiSummarySkeleton` — 4-line text skeleton with descending widths (100/90/95/60%), left-border accent card styling (border-l-4 border-l-primary, shadow-md), animate-skeleton-pulse, motion-reduce support, role="status". 6 tests.
- **Task 2**: Created `DemoModeBanner` — state-dependent messaging for seed_only/empty, session-dismissible via useState, auto-dissolve on state transition (300ms CSS animation via banner-dissolve keyframe), accessibility (role="status", aria-live="polite", dismiss aria-label), motion-reduce support. 10 tests.
- **Task 3**: Added `demoState` to shared `chartDataSchema` (reusing existing `demoModeStateSchema` from datasets.ts), updated API route to derive demoState (seed org → hard-coded 'seed_only', authed user → getUserOrgDemoState()), added demoState to EMPTY_CHART_DATA fallback, updated API tests with mock + assertions, updated DashboardShell test fixtures.
- **Task 4**: Integrated AiSummarySkeleton (shows when isLoading && !hasData), DemoModeBanner (receives data.demoState, onUploadClick → router.push('/upload')), replaced inline `<p>` demo indicator. Added useRouter import. Rewrote DashboardShell demo banner tests to assert on mocked DemoModeBanner props instead of inline text.
- **Task 5**: Added inline FilterBar skeleton (3 pill-shaped divs: 2x120px rounded-full + 1x80px rounded-md), shows when isLoading && hasAnyData && !hasData. No separate component file needed.
- **Task 6**: Verified layout.tsx has `<main id="main-content">` and skip-to-content link. Wrapped DashboardShell chart area in `<section aria-labelledby="dashboard-heading">`.
- **Task 7**: Generated _explained.md docs for AiSummarySkeleton, DemoModeBanner, and updated DashboardShell docs. All 8-section interview format.
- **Task 8**: pnpm type-check (4/4 tasks pass), pnpm lint (4/4 tasks pass), pnpm test (358 tests pass: 218 API + 140 web). Zero regressions.

### Change Log

- 2026-03-05: Story 2.8 implementation complete. Added AiSummarySkeleton, DemoModeBanner, FilterBar skeleton, demoState to ChartData schema + API route, semantic HTML audit, companion docs. 358 tests pass.
- 2026-03-05: Code review — 7 findings (1 HIGH, 3 MEDIUM, 3 LOW). All fixed: (1) auto-dissolve animation now stores previous message and renders a dedicated dissolve path before early-return checks; (2) added 5 auto-dissolve transition tests; (3) strengthened reduced-motion tests with specific class assertions; (4) isolated getUserOrgDemoState in nested try-catch with 'empty' fallback + test; (5) added overflow:hidden to both keyframe states; (6) bumped max-height to 200px for mobile; (7) added skeleton-title testid + test. 365 tests pass (220 API + 145 web).

### File List

**New files:**
- `apps/web/app/dashboard/AiSummarySkeleton.tsx`
- `apps/web/app/dashboard/AiSummarySkeleton.test.tsx`
- `apps/web/app/dashboard/AiSummarySkeleton.tsx_explained.md`
- `apps/web/components/common/DemoModeBanner.tsx`
- `apps/web/components/common/DemoModeBanner.test.tsx`
- `apps/web/components/common/DemoModeBanner.tsx_explained.md`

**Modified files:**
- `packages/shared/src/schemas/charts.ts` — Added demoState field (imports demoModeStateSchema from datasets)
- `apps/api/src/routes/dashboard.ts` — Added demoState derivation (seed_only for anonymous, getUserOrgDemoState for authed), added datasetsQueries import, DemoModeState type import
- `apps/api/src/routes/dashboard.test.ts` — Added mockGetUserOrgDemoState, datasetsQueries to mock, demoState assertions
- `apps/web/app/dashboard/page.tsx` — Added demoState: 'empty' to EMPTY_CHART_DATA
- `apps/web/app/dashboard/DashboardShell.tsx` — Integrated AiSummarySkeleton, DemoModeBanner, FilterBar skeleton; replaced inline `<p>` demo indicator; added useRouter, section wrapper
- `apps/web/app/dashboard/DashboardShell.test.tsx` — Added mocks for AiSummarySkeleton, DemoModeBanner, next/navigation; updated fixtures with demoState; rewrote demo banner tests; added skeleton tests
- `apps/web/app/dashboard/DashboardShell.tsx_explained.md` — Updated with Story 2.8 changes
- `apps/web/app/globals.css` — Added banner-dissolve keyframe and animate-banner-dissolve theme variable
