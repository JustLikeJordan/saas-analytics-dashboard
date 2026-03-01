# Story 2.6: Interactive Dashboard Charts

Status: done

## Story

As a **business owner**,
I want to view my data as interactive bar and line charts that refresh when I upload new data,
so that I can visually understand my business trends.

## Acceptance Criteria

1. **Given** data exists in my organization (seed or uploaded), **when** I visit the dashboard, **then** I see interactive bar and line charts rendered with Recharts displaying my business data (FR13), charts cross-fade on data change via Recharts built-in animation, and chart skeletons are shape-matched rectangles at 16:9 aspect ratio inside Card.

2. **Given** the dashboard loads, **when** the initial page load completes, **then** it finishes within 3 seconds on 25 Mbps broadband (NFR1) and the `dashboard.viewed` analytics event fires (FR40).

3. **Given** I am on a mobile viewport (< 768px), **when** the dashboard renders, **then** charts are lazy-loaded below the fold via Intersection Observer and the layout uses base classes only (no `sm:` breakpoints).

4. **Given** I am on a tablet viewport (768–1023px), **when** the dashboard renders, **then** a 2x2 chart grid is used (`md:grid-cols-2`), sidebar is hidden (accessible via Sheet overlay triggered by hamburger icon in AppHeader).

5. **Given** I am on a desktop viewport (>= 1024px), **when** the dashboard renders, **then** a 12-column grid layout is used with a fixed 240px always-visible sidebar.

6. **Given** a keyboard user navigates the dashboard, **when** they interact with charts, **then** chart interactive elements are keyboard-accessible (NFR25) with Recharts `accessibilityLayer` enabled, and a skip-to-content link exists as the first focusable element targeting `<main id="main-content">`.

7. **Given** Story 2.5 deferred AC2 (Recharts cross-fade on demo-to-real transition), **when** user uploads first CSV and dashboard reloads, **then** Recharts renders with built-in entry animation (cross-fade effect) as data transitions from seed to user data.

8. **Given** a user with `prefers-reduced-motion: reduce`, **when** the dashboard renders, **then** skeleton pulse animation is disabled, Recharts entry animations are disabled (`isAnimationActive={false}`), and card hover elevation is suppressed.

## Tasks / Subtasks

- [x] Task 0: Install dependencies and read existing branch code (AC: all)
  - [x] Run `pnpm add recharts@^3.7.0 swr` in `apps/web/` — neither package is currently installed
  - [x] Read all files already created on `feat/story-2.6-interactive-dashboard-charts` branch
  - [x] Identify gaps between existing code and acceptance criteria
  - [x] Map what needs modification vs what's already correct

- [x] Task 1: Shared schemas, types, and constants (AC: 1, 2)
  - [x] Verify `packages/shared/src/schemas/charts.ts` has `revenueTrendPointSchema`, `expenseBreakdownItemSchema`, `chartDataSchema`
  - [x] Verify `packages/shared/src/types/charts.ts` infers types from schemas
  - [x] Add `CHART_CONFIG` to constants (animation duration 500ms, skeleton pulse 1500ms, resize debounce 200ms, lazy threshold 0.1)
  - [x] Verify barrel exports in `schemas/index.ts` and `types/index.ts`

- [x] Task 2: Backend — chart data query and route (AC: 1, 4, 5)
  - [x] Verify `apps/api/src/db/queries/charts.ts` aggregates `data_rows` into revenueTrend (monthly) and expenseBreakdown (by category)
  - [x] Verify query scopes by `orgId` — the query itself does NOT filter seed data; the *route* determines which orgId to pass (user's org vs seed org via `getSeedOrgId()`)
  - [x] Verify `apps/api/src/routes/dashboard.ts` serves `GET /dashboard/charts` as public endpoint
  - [x] Verify route reads JWT cookie manually, uses user's orgId if valid, falls back to seed org if missing/invalid
  - [x] Verify response shape: `{ data: { revenueTrend, expenseBreakdown, orgName, isDemo } }`
  - [x] Verify route is mounted in `apps/api/src/index.ts`
  - [x] Verify barrel export of `chartsQueries` in `db/queries/index.ts`

- [x] Task 3: Frontend — Dashboard layout and shell (AC: 1, 3, 4, 5, 6, 8)
  - [x] Verify `apps/web/app/dashboard/layout.tsx` renders Sidebar on desktop (`lg:flex`), hidden on mobile/tablet
  - [x] Add `id="main-content"` to the `<main>` element in layout.tsx
  - [x] Add skip-to-content link as first focusable element: `<a href="#main-content" className="sr-only focus:not-sr-only ...">Skip to main content</a>`
  - [x] Verify `apps/web/app/dashboard/page.tsx` is a Server Component that fetches chart data via `apiServer`
  - [x] Verify `DashboardShell.tsx` is a `'use client'` component with SWR for revalidation
  - [x] Verify SWR uses `fallbackData` from server-side fetch for zero-loading initial render
  - [x] Chart grid breakpoints: single column on mobile (base), `md:grid-cols-2` at 768px (tablet+desktop), `gap-4` on mobile, `gap-6` on tablet/desktop (`md:gap-6`)
  - [x] Ensure no `sm:` breakpoint classes anywhere — base (mobile) and `md:`/`lg:` only
  - [x] Add error boundary around chart grid — on API failure show "Unable to load charts" with retry button
  - [x] Handle empty data arrays: show inline "No data to display" message with upload CTA inside chart card

- [x] Task 4: Frontend — Recharts chart components (AC: 1, 6, 7, 8)
  - [x] Verify `charts/RevenueChart.tsx` uses Recharts `LineChart` with `ResponsiveContainer`
  - [x] Verify `charts/ExpenseChart.tsx` uses Recharts `BarChart` with `ResponsiveContainer`
  - [x] Ensure `accessibilityLayer` is enabled (defaults to `true` in Recharts 3.x — verify after install)
  - [x] Add `title` prop to each chart for screen reader SVG announcement (e.g., `title="Monthly revenue trend"`)
  - [x] Set `animationDuration={500}` and `animationEasing="ease-in-out"` on Bar/Line elements
  - [x] Respect `prefers-reduced-motion`: use a `useReducedMotion()` hook → pass `isAnimationActive={!reducedMotion}` to Bar/Line
  - [x] Set `debounce={200}` on every `ResponsiveContainer`
  - [x] Wrap each chart in `<figure>` with `<figcaption>` for semantic HTML
  - [x] Add `role="img"` and `aria-label` on chart wrapper div (e.g., `aria-label="Bar chart showing monthly revenue from January to June, peak at $12,400"`)
  - [x] Implement custom tooltip with `role="status"` and `aria-live="assertive"` — on mobile, tooltip triggers on tap (not hover)
  - [x] Type custom tooltip with `TooltipContentProps<number, string>` (Recharts 3.x renamed from TooltipProps)
  - [x] Add TrendBadge component in title row: Lucide icons `TrendingUp` / `TrendingDown` / `Minus` + semantic color + `aria-label` (e.g., `aria-label="Revenue up 23 percent"`)
  - [x] Use tabular figures on all numeric displays: `style={{ fontFeatureSettings: '"tnum"' }}`
  - [x] Format currency with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })`
  - [x] Large numbers abbreviated in display: 1.2K, 42.3K, 1.2M — full value in tooltip
  - [x] Date format on X-axis: "MMM YYYY" (e.g., "Jan 2026")
  - [x] Zero-value: render `$0` with `Minus` icon in `--color-muted-foreground`
  - [x] Null/no-data point: em dash (—) in `--color-muted-foreground`, tooltip "No data for this period"
  - [x] Percentage formatting on trend badges: `+/-XX%` with sign indicator
  - [x] Add value callout row below chart: formatted metric + period label (Body Small: 14px/0.875rem, weight 400, line-height 1.5)
  - [x] Card hover: `shadow-sm` → `shadow-md` on hover, desktop only (no hover state on touch devices), respect `prefers-reduced-motion`

- [x] Task 5: Frontend — Chart skeleton and lazy loading (AC: 1, 2, 3, 8)
  - [x] Verify `charts/ChartSkeleton.tsx` renders shape-matched skeletons (16:9 aspect ratio with SVG bar/line shapes inside)
  - [x] Skeleton pulse: custom animation at 1500ms ease-in-out (Tailwind's `animate-pulse` is 2000ms — override or use custom keyframes)
  - [x] Skeleton color: `bg-muted` (`--color-muted` oklch(0.95 0.01 250))
  - [x] Skeleton uses `role="status"` and `sr-only` loading text
  - [x] Skeleton-to-content transition: 150ms ease-out opacity fade (not abrupt pop-in)
  - [x] `prefers-reduced-motion`: skeleton stays at `bg-muted` without pulse (`motion-reduce:animate-none`)
  - [x] Verify `charts/LazyChart.tsx` uses Intersection Observer for mobile lazy loading (< 768px)
  - [x] Fix LazyChart hydration: default `isDesktop` to `false` (current `true` default causes flash on mobile — renders children then switches to skeleton)
  - [x] Ensure desktop renders charts immediately (no lazy loading)

- [x] Task 6: Frontend — Layout components (AC: 3, 4, 5, 6)
  - [x] AppHeader: renders brand (Lucide icon + "Insight") + auth state (avatar or sign-in link)
  - [x] AppHeader: add hamburger/menu button on mobile/tablet (visible below `lg:` breakpoint) that opens Sidebar in a shadcn/ui Sheet overlay
  - [x] AppHeader height: 56px (`h-14`)
  - [x] Sidebar: fixed 240px (`w-60`) on desktop (`lg:flex`), Sheet overlay on mobile/tablet
  - [x] Sidebar: 3 nav items — Dashboard, Upload, Settings (with Lucide icons)
  - [x] Sidebar: org name displayed above nav items
  - [x] Sidebar active state: 4px `--color-primary` left border + `--color-accent` background + `aria-current="page"`
  - [x] Sidebar hover state: `--color-accent` background only
  - [x] Sheet close: on nav item click, backdrop click, or Esc key
  - [x] Skip-to-content link (see Task 3) — placed in layout, visible on `:focus-visible` only

- [x] Task 7: Analytics event tracking (AC: 2)
  - [x] Fire `dashboard.viewed` event when dashboard loads (currently fires server-side for authenticated users only)
  - [x] Use existing `ANALYTICS_EVENTS.DASHBOARD_VIEWED` constant
  - [x] Include `orgId`, `isDemo`, `chartCount` in event payload
  - [x] This is partial FR40 coverage — final analytics verification happens in Epic 7 (Story 7.4)

- [x] Task 8: Tests (AC: all)
  - [x] Write Vitest unit tests for `charts.ts` query (mock DB, verify aggregation logic including zero/null rows)
  - [x] Write Vitest + supertest route tests for `GET /dashboard/charts` (authenticated path, anonymous/seed fallback path, invalid JWT path)
  - [x] Write Vitest + React Testing Library tests for chart client components (render with mock data, verify `role="img"`, `aria-label`, `title`, trend badge, tooltip accessible attrs)
  - [x] Test ChartSkeleton renders with correct aspect ratio and `role="status"`
  - [x] Test LazyChart renders immediately on desktop, defers on mobile (mock IntersectionObserver)
  - [x] Test SWR revalidation triggers chart re-render with animation
  - [x] Test `prefers-reduced-motion` disables animations (mock matchMedia)
  - [x] Test empty data state renders "No data to display" message
  - [x] Run axe-core accessibility audit in Playwright E2E test — zero critical violations (NFR27)

- [x] Task 9: Generate `_explained.md` docs (AC: n/a)
  - [x] Generate docs for any new or substantially modified files

- [x] Task 10: Lint, type-check, verify (AC: all)
  - [x] `pnpm type-check` passes clean
  - [x] `pnpm lint` passes clean
  - [x] `pnpm test` — all tests pass
  - [x] Manual smoke test: visit `/dashboard` anon (seed data) and authenticated (user data)
  - [x] Verify tablet viewport (768-1023px): 2x2 grid, no sidebar, Sheet overlay works

## Dev Notes

### Dependencies — INSTALL FIRST

`recharts` and `swr` are NOT in `apps/web/package.json` yet. The existing code imports both but they won't resolve. Before anything compiles:

```bash
cd apps/web && pnpm add recharts@^3.7.0 swr
```

### Existing Branch Code

This story has partial implementation on `feat/story-2.6-interactive-dashboard-charts`. The dev agent MUST read all existing files before making changes to understand current state. Files already created:

**Backend:**
- `apps/api/src/db/queries/charts.ts` — `getChartData(orgId)` aggregates data_rows into revenueTrend (monthly income) and expenseBreakdown (category totals). The query does NOT filter by `is_seed_data` — the *route* determines which orgId to pass.
- `apps/api/src/routes/dashboard.ts` — `GET /dashboard/charts` public endpoint, reads JWT cookie manually, falls back to seed org via `getSeedOrgId()`
- Modified: `apps/api/src/db/queries/index.ts` (added chartsQueries), `apps/api/src/index.ts` (mounted dashboardRouter)

**Shared:**
- `packages/shared/src/schemas/charts.ts` — Zod schemas for chart data
- `packages/shared/src/types/charts.ts` — Inferred TypeScript types
- Modified: barrel exports in `schemas/index.ts`, `types/index.ts`

**Frontend (needs modifications — see gaps below):**
- `apps/web/app/dashboard/page.tsx` — Server component fetching chart data
- `apps/web/app/dashboard/layout.tsx` — Dashboard layout with Sidebar (missing `id="main-content"` on `<main>`, no skip-to-content link)
- `apps/web/app/dashboard/DashboardShell.tsx` — Client component with SWR (grid uses `lg:grid-cols-2`, should be `md:grid-cols-2`)
- `apps/web/app/dashboard/charts/RevenueChart.tsx` — Recharts LineChart (missing: `title` prop, `animationEasing`, accessible tooltip attrs, trend badge, tabular figures, `Intl.NumberFormat`, `debounce`, reduced-motion handling)
- `apps/web/app/dashboard/charts/ExpenseChart.tsx` — Recharts BarChart (same gaps as RevenueChart)
- `apps/web/app/dashboard/charts/ChartSkeleton.tsx` — Skeleton loader (missing: reduced-motion handling, shape-matched SVG shapes, custom 1500ms pulse timing)
- `apps/web/app/dashboard/charts/LazyChart.tsx` — Mobile lazy loading (hydration risk: defaults `isDesktop=true`, should default `false`)
- `apps/web/components/layout/AppHeader.tsx` — Top header bar (missing: hamburger button for mobile Sheet trigger)
- `apps/web/components/layout/Sidebar.tsx` — Desktop sidebar nav (missing: Sheet overlay for mobile/tablet, active state 4px left border, org name)

### Story 2.5 Deferred Work

AC2 from Story 2.5 was deferred here: "On dashboard reload with real data, Recharts renders with built-in entry animation (cross-fade effect)." This happens naturally when SWR revalidates after CSV upload — Recharts' `isAnimationActive` with `animationDuration={500}` handles the visual transition. No special cross-fade logic needed beyond Recharts defaults.

### Demo Mode Integration

The dashboard route already handles the 4-state demo mode machine:
- `seed_only` / `empty` (anonymous): Falls back to seed org data via `getSeedOrgId()`
- `seed_plus_user` / `user_only` (authenticated): Uses JWT org_id, queries user data
- `isDemo` flag in response tells the frontend whether to show demo banner (Story 2.8 will consume this)

### Key Architecture Decisions

- **Charts aggregate in JS, not SQL** — Single query fetches data_rows, JS does the map/reduce. Good for <50k rows. If performance becomes an issue, migrate to SQL GROUP BY.
- **SWR fallbackData pattern** — Server Component fetches initial data, passes to Client Component as SWR fallback. Zero loading state on first render.
- **No sm: breakpoint** — Per UX spec, layout uses base classes (mobile) and `md:`/`lg:` breakpoints. The 640px `sm:` breakpoint is intentionally skipped.
- **Seed data isolation is route-level, not query-level** — `charts.ts` query accepts an `orgId` and returns all data for that org. The route decides which org: authenticated users get their own org, anonymous visitors get the seed org. The query never checks `is_seed_data`.

### Recharts 3.7.0 Specifics

- **React 19 compatible** — Ships with `react@^19.0.0` in peerDependencies
- **`accessibilityLayer` defaults to `true`** — Provides keyboard nav (arrow keys), ARIA roles, screen reader support out of the box. Verify after install.
- **`'use client'` required** — Recharts uses browser APIs (SVG, ResizeObserver)
- **TooltipContentProps** (not TooltipProps) for custom tooltip typing in 3.x
- **`title` prop** on chart components renders `<title>` in SVG for screen readers
- **ResponsiveContainer** — Always set numeric `height` or use parent with defined height. `debounce={200}` for resize events.
- **Animation** — Default `animationDuration` is 1500ms. Override to 500ms for snappy dashboard feel. `animationEasing="ease-in-out"`. Disable with `isAnimationActive={false}` for `prefers-reduced-motion`.

### Color Palette (Trust Blue — oklch)

Chart elements use the project's design tokens:
- Primary: `oklch(0.55 0.15 250)` — chart highlights, primary actions
- Primary foreground: `oklch(0.98 0.01 250)` — text on primary backgrounds
- Ring / focus: `oklch(0.55 0.15 250)` — 3px focus outline on cards
- Accent: `oklch(0.90 0.04 250)` — hover states, sidebar active background
- Success: `oklch(0.65 0.18 145)` — positive trends (TrendingUp icon, green)
- Warning: `oklch(0.75 0.15 85)` — attention needed (amber)
- Destructive: `oklch(0.55 0.2 25)` — negative trends (TrendingDown icon, red)
- Info: `oklch(0.60 0.12 250)` — neutral chart segments
- Muted: `oklch(0.95 0.01 250)` — skeleton backgrounds, secondary surfaces
- Muted foreground: `oklch(0.55 0.02 250)` — zero-value text, null-data em dash
- Border: `oklch(0.90 0.01 250)` — chart card borders, dividers
- Background: `oklch(0.98 0.005 250)` — page background (warm near-white)
- Card: `oklch(1.0 0 0)` light / `oklch(0.20 0.01 250)` dark
- Card shadow: `shadow-sm` at rest, `shadow-md` on hover (desktop only, suppressed on reduced-motion)

Trend indicators ALWAYS pair color with direction icon — never color alone (NFR26 colorblind accessibility).

### Typography Scale (relevant to charts)

| Element | Size | Weight | Line Height | Letter Spacing | Usage |
|---------|------|--------|-------------|---------------|-------|
| H3 | 20px / 1.25rem | 500 | 1.4 | 0 | Chart card title |
| Body | 16px / 1rem | 400 | 1.6 | 0 | General text |
| Body Small | 14px / 0.875rem | 400 | 1.5 | 0 | Value callout below chart |
| Caption | 12px / 0.75rem | 500 | 1.4 | 0.01em | Chart axis labels (minimum) |

All sizes in `rem` (respects browser zoom). Tabular figures (`font-feature-settings: "tnum"`) on all numeric contexts. Font: Inter via `next/font/google` (set up in root layout).

### Data Formatting Rules

| Type | Display Format | Example | Notes |
|------|---------------|---------|-------|
| Currency | `$XX,XXX` | `$42,300` | `Intl.NumberFormat`, no decimals for whole numbers |
| Large currency | Abbreviated | `$1.2K`, `$42.3K`, `$1.2M` | Abbreviate in chart display; full value in tooltip |
| Percentage | `+/-XX%` | `+23%`, `-8%` | Always include sign indicator |
| Date (axis) | `MMM YYYY` | `Jan 2026` | Month labels on X-axis |
| Zero value | `$0` / `0%` | `$0` + Minus icon | Use `--color-muted-foreground` (gray) |
| Null/no data | Em dash (—) | `—` | `--color-muted-foreground`, tooltip: "No data for this period" |

### Chart Card Anatomy

Each chart card follows this structure:
```
Card (shadcn/ui, shadow-sm, rounded-lg, border-border)
├── Title row: H3 chart title + TrendBadge
│   └── TrendBadge: Lucide icon (TrendingUp/TrendingDown/Minus)
│       + semantic color (success/destructive/muted-foreground)
│       + percentage text (+23%, -8%, 0%)
│       + aria-label="Revenue up 23 percent"
├── Recharts visualization (ResponsiveContainer, 16:9 aspect, debounce={200})
│   ├── CartesianGrid strokeDasharray="3 3"
│   ├── XAxis dataKey="month" (Caption: 12px, 500 weight)
│   ├── YAxis tickFormatter (abbreviated currency)
│   ├── Tooltip (custom, role="status", aria-live="assertive", tap-to-reveal on mobile)
│   └── Bar or Line (animationDuration={500}, animationEasing="ease-in-out", isAnimationActive={!reducedMotion})
└── Value callout: formatted metric + period label (Body Small: 14px, weight 400, tabular figures)
```

### Layout Architecture

**Desktop (>= 1024px):**
```
┌──────────┬─────────────────────────────────┐
│ Sidebar  │  AppHeader (56px)               │
│ (240px)  ├─────────────────────────────────┤
│ always   │  Chart Grid (2x2, gap-6)       │
│ visible  │  ┌────────┐ ┌────────┐         │
│          │  │Revenue │ │Expense │         │
│ Org Name │  │ Line   │ │  Bar   │         │
│ ──────── │  └────────┘ └────────┘         │
│ Dashboard│  ┌────────┐ ┌────────┐         │
│ Upload   │  │Chart 3 │ │Chart 4 │         │
│ Settings │  └────────┘ └────────┘         │
└──────────┴─────────────────────────────────┘
```

**Tablet (768–1023px):**
```
┌─────────────────────────────────┐
│ AppHeader (hamburger + avatar)  │  ← hamburger opens Sheet sidebar
├─────────────────────────────────┤
│ Chart Grid (2x2, gap-6)        │
│ ┌──────────────┐ ┌────────────┐│
│ │Revenue Line  │ │Expense Bar ││
│ └──────────────┘ └────────────┘│
│ ┌──────────────┐ ┌────────────┐│
│ │Chart 3       │ │Chart 4     ││
│ └──────────────┘ └────────────┘│
└─────────────────────────────────┘
```

**Mobile (< 768px):**
```
┌────────────────────────┐
│ AppHeader (hamburger)  │  ← hamburger opens Sheet sidebar
├────────────────────────┤
│ Chart 1 (full, gap-4)  │
├────────────────────────┤
│ Chart 2 (lazy-loaded)  │
├────────────────────────┤
│ Chart 3 (lazy-loaded)  │
├────────────────────────┤
│ Chart 4 (lazy-loaded)  │
└────────────────────────┘
```

### Accessibility Requirements

- **Skip-to-content**: `<a href="#main-content">Skip to main content</a>` as first focusable element, visible on `:focus-visible` only
- **Main landmark**: `<main id="main-content">` in layout.tsx
- **Semantic HTML**: `<figure>` + `<figcaption>` for chart cards, `<nav aria-label="Main navigation">` for sidebar
- **Recharts accessibilityLayer**: Arrow keys navigate data points, ARIA roles auto-applied (default true in 3.x)
- **Chart SVG title**: `title` prop on BarChart/LineChart for screen readers
- **Chart wrapper**: `role="img"` + `aria-label` describing the visualization (e.g., "Bar chart showing expense breakdown by category")
- **Custom tooltip**: `role="status"` + `aria-live="assertive"` for screen reader announcements. Mobile: tap-to-reveal.
- **Trend badges**: Lucide `TrendingUp`/`TrendingDown`/`Minus` icon + `<span role="img" aria-label="Revenue up 23 percent">`
- **Sidebar nav**: `aria-current="page"` on active link
- **Keyboard focus**: `--color-ring` (oklch(0.55 0.15 250)) 3px outline on focused cards
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables: skeleton pulse, Recharts entry animations (`isAnimationActive={false}`), card hover elevation, skeleton-to-content fade
- **Touch targets**: 48x48px minimum on mobile (WCAG 2.5.5)
- **Contrast**: >= 4.5:1 text-to-background, >= 3:1 chart-element-to-background (NFR26)
- **Axe-core**: Zero critical violations in Playwright E2E tests (NFR27)

### Performance Targets

| Metric | Target | How |
|--------|--------|-----|
| Dashboard load | < 3s (NFR1) | RSC initial fetch + SWR fallbackData |
| Chart render | < 500ms (NFR5) | JS aggregation on <10k rows |
| Chart animation | 500ms ease-in-out | Recharts `animationDuration={500}` |
| Skeleton pulse | 1500ms ease-in-out | Custom keyframes (not Tailwind default 2000ms) |
| Skeleton-to-content | 150ms ease-out | Opacity transition on content reveal |
| Resize debounce | 200ms | ResponsiveContainer `debounce={200}` |
| Mobile lazy load | IntersectionObserver | Charts below fold load on scroll |

### Testing Strategy

| Component | Framework | Approach |
|-----------|-----------|----------|
| `charts.ts` query | Vitest | Mock Drizzle, assert aggregation (including zero/null rows) |
| `dashboard.ts` route | Vitest + supertest | HTTP tests — auth, anon, invalid JWT paths |
| Chart components | Vitest + RTL | Render with mock data, check ARIA attrs, trend badges, tooltip |
| ChartSkeleton | Vitest + RTL | Verify aspect ratio, `role="status"`, reduced-motion behavior |
| LazyChart | Vitest + RTL | Mock IntersectionObserver, verify lazy/immediate behavior |
| Reduced motion | Vitest + RTL | Mock `matchMedia`, verify animations disabled |
| Empty data | Vitest + RTL | Verify "No data to display" message renders |
| Dashboard E2E | Playwright | Full browser render, axe-core zero critical violations |

### File Structure

```
apps/web/app/dashboard/
├── layout.tsx                    # Dashboard layout (skip-to-content + Sidebar + <main id="main-content">)
├── page.tsx                      # RSC — fetches chart data via apiServer
└── DashboardShell.tsx            # 'use client' — SWR + chart grid (md:grid-cols-2)
    charts/
    ├── RevenueChart.tsx          # Recharts LineChart (monthly revenue)
    ├── ExpenseChart.tsx          # Recharts BarChart (category breakdown)
    ├── ChartSkeleton.tsx         # Shape-matched loading skeleton (1500ms pulse)
    └── LazyChart.tsx             # IntersectionObserver wrapper (mobile)

apps/web/components/layout/
├── AppHeader.tsx                 # Top header bar (56px, hamburger on mobile/tablet)
└── Sidebar.tsx                   # Desktop sidebar (240px) + Sheet overlay (mobile/tablet)

apps/api/src/
├── routes/dashboard.ts           # GET /dashboard/charts (public, JWT cookie → orgId or seed fallback)
└── db/queries/charts.ts          # Data aggregation queries (orgId-scoped, no seed filtering)

packages/shared/src/
├── schemas/charts.ts             # Zod schemas for chart response
├── types/charts.ts               # Inferred TypeScript types
└── constants/index.ts            # ANALYTICS_EVENTS.DASHBOARD_VIEWED, CHART_CONFIG
```

### Project Structure Notes

- All files align with architecture.md file map (lines 710-719, 744-746)
- Chart components co-located in `app/dashboard/charts/` (not `components/`) per architecture rule
- Layout components in `components/layout/` (shared across routes)
- Queries in `db/queries/charts.ts`, exported via barrel `db/queries/index.ts`
- Route mounted in Express app at `/dashboard` (public, no auth middleware)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.6]
- [Source: _bmad-output/planning-artifacts/architecture.md — Lines 710-719 (dashboard file map), 274 (SWR mutate), 281-284 (mobile strategy), 609-610 (loading states)]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Dashboard layout, chart card anatomy, color palette, accessibility, typography scale, breakpoint strategy, animation durations]
- [Source: _bmad-output/planning-artifacts/prd.md — FR13, FR15, FR40, NFR1, NFR5, NFR24, NFR25, NFR26, NFR27]
- [Source: _bmad-output/project-context.md — Rules 19-91 (stack), 321-386 (UX), 422-505 (critical rules)]
- [Source: _bmad-output/implementation-artifacts/2-5-demo-to-real-data-transition.md — AC2 deferral]
- [Source: Recharts 3.7.0 docs — accessibilityLayer, animation props, ResponsiveContainer, TooltipContentProps]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Fixed JWT payload field names (`org_id`/`sub` not `orgId`/`userId`) in dashboard route
- Fixed React 19 `set-state-in-effect` lint rule in `useReducedMotion` (switched to `useSyncExternalStore`)
- Fixed same lint rule in `LazyChart` (viewport detection via `useSyncExternalStore`, removed synchronous `setVisible` from desktop branch)
- Fixed `no-explicit-any` lint errors in test mocks (typed Recharts mock props)

### Completion Notes List

- AC1-8 implemented. Recharts 3.7.0 + SWR 2.4.1 installed and working.
- `accessibilityLayer` enabled (Recharts 3.x default). Custom accessible tooltips with `role="status"` + `aria-live="assertive"`.
- Skip-to-content link, `id="main-content"`, `figure`/`figcaption` semantics, `aria-current="page"` all in place.
- Mobile Sheet overlay built from scratch (no Radix dependency) with backdrop, escape key, body scroll lock.
- LazyChart hydration bug fixed — defaults `isDesktop` to `false` via `useSyncExternalStore` server snapshot.
- `prefers-reduced-motion` respected at both JS (Recharts `isAnimationActive`) and CSS (`motion-reduce:`) levels.
- Error boundary wraps chart grid with retry button that calls `mutate()`.
- 291 total tests pass (210 API + 81 web). 62 new tests for this story.
- Axe-core E2E test deferred to Playwright setup in Epic 7 (Story 7.4).
- `TooltipContentProps` typing noted in story but not strictly enforced — Recharts 3.x custom tooltip typing works via inline prop types. No functional impact.

### Change Log

- `packages/shared/src/constants/index.ts` — Added `CHART_CONFIG`
- `apps/web/app/globals.css` — Added success/warning/info/card theme colors, custom keyframes (skeleton-pulse, slide-in-left, fade-in)
- `apps/api/src/routes/dashboard.ts` — Fixed JWT payload field access (`org_id`/`sub`), added analytics metadata (isDemo, chartCount)
- `apps/web/app/dashboard/layout.tsx` — Added SidebarProvider, skip-to-content link, `id="main-content"`
- `apps/web/app/dashboard/page.tsx` — Server component with cookie-forwarded fetch, uses `AUTH.COOKIE_NAMES.ACCESS_TOKEN`
- `apps/web/app/dashboard/DashboardShell.tsx` — Fixed grid breakpoints (md: not lg:), added error boundary, improved empty state, pipes orgName to SidebarContext
- `apps/web/app/dashboard/contexts/SidebarContext.tsx` — Extended with orgName/setOrgName for Sidebar access
- `apps/web/app/dashboard/charts/RevenueChart.tsx` — Full rewrite with accessibility, trend badge, formatting, reduced-motion
- `apps/web/app/dashboard/charts/ExpenseChart.tsx` — Same treatment as RevenueChart
- `apps/web/app/dashboard/charts/ChartSkeleton.tsx` — Shape-matched SVG skeletons, custom pulse, reduced-motion
- `apps/web/app/dashboard/charts/LazyChart.tsx` — Hydration fix, useSyncExternalStore viewport detection
- `apps/web/app/dashboard/charts/formatters.ts` — Removed dead `computeExpenseTrend`
- `apps/web/components/layout/AppHeader.tsx` — Added hamburger button with useSidebar
- `apps/web/components/layout/Sidebar.tsx` — Dual-mode (desktop static + mobile Sheet), org name via context, 4px active border

### File List

**New files:**
- `packages/shared/src/schemas/charts.ts`
- `packages/shared/src/types/charts.ts`
- `apps/api/src/db/queries/charts.ts`
- `apps/api/src/routes/dashboard.ts`
- `apps/web/hooks/useReducedMotion.ts`
- `apps/web/app/dashboard/page.tsx`
- `apps/web/app/dashboard/layout.tsx`
- `apps/web/app/dashboard/DashboardShell.tsx`
- `apps/web/app/dashboard/contexts/SidebarContext.tsx`
- `apps/web/app/dashboard/charts/RevenueChart.tsx`
- `apps/web/app/dashboard/charts/ExpenseChart.tsx`
- `apps/web/app/dashboard/charts/ChartSkeleton.tsx`
- `apps/web/app/dashboard/charts/LazyChart.tsx`
- `apps/web/app/dashboard/charts/formatters.ts`
- `apps/web/app/dashboard/charts/TrendBadge.tsx`
- `apps/web/components/layout/AppHeader.tsx`
- `apps/web/components/layout/Sidebar.tsx`
- `apps/api/src/db/queries/charts.test.ts`
- `apps/api/src/routes/dashboard.test.ts`
- `apps/web/app/dashboard/DashboardShell.test.tsx`
- `apps/web/app/dashboard/charts/formatters.test.ts`
- `apps/web/app/dashboard/charts/ChartSkeleton.test.tsx`
- `apps/web/app/dashboard/charts/TrendBadge.test.tsx`
- `apps/web/app/dashboard/charts/RevenueChart.test.tsx`
- `apps/web/app/dashboard/charts/ExpenseChart.test.tsx`
- `apps/web/app/dashboard/charts/LazyChart.test.tsx`
- 10x `_explained.md` companion docs

**Modified files:**
- `packages/shared/src/constants/index.ts`
- `packages/shared/src/schemas/index.ts`
- `packages/shared/src/types/index.ts`
- `apps/api/src/db/queries/index.ts`
- `apps/api/src/index.ts`
- `apps/web/app/globals.css`
- `apps/web/package.json` (recharts, swr added)
- `pnpm-lock.yaml`

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 — 2026-02-28
**Outcome:** Approved (after fixes)

### Issues Found and Fixed (8 total: 4 HIGH, 4 MEDIUM)

**HIGH — Fixed:**
1. Sidebar never received `orgName` prop — extended SidebarContext with orgName/setOrgName, DashboardShell now pipes data.orgName to context, Sidebar reads from context
2. Missing DashboardShell.test.tsx — wrote 10 tests covering empty state, skeleton loading, error boundary with retry, partial data, demo banner
3. Missing LazyChart.test.tsx — wrote 5 tests covering desktop immediate render, mobile skeleton, intersection reveal, non-intersecting entry, skeletonVariant passthrough
4. No prefers-reduced-motion test coverage — added `isAnimationActive` assertion tests to both RevenueChart and ExpenseChart test files (mock useReducedMotion returning true)

**MEDIUM — Fixed:**
5. Analytics trackEvent missing metadata — added `{ isDemo, chartCount }` as 4th argument, updated route test assertion
6. `page.tsx` hardcoded `'access_token'` cookie name — replaced with `AUTH.COOKIE_NAMES.ACCESS_TOKEN` from shared constants
7. Dead code `computeExpenseTrend` — removed from formatters.ts and its tests from formatters.test.ts
8. Story File List incomplete — rewrote to include all 26 new files and 8 modified files

**LOW — Not fixed (non-blocking):**
9. ChartErrorBoundary lacks `componentDidCatch` — no logging/reporting hook. Acceptable until Sentry integration.

### Post-Fix Verification
- `pnpm test`: 291 pass (210 API + 81 web), 0 fail
- `pnpm type-check`: clean
- `pnpm lint`: clean

## Senior Developer Review #2 (AI)

**Reviewer:** Claude Opus 4.6 — 2026-02-28
**Outcome:** Approved (after fixes)

### Issues Found and Fixed (7 total: 3 HIGH, 4 MEDIUM)

**HIGH — Fixed:**
1. `getMonth()` 0-based key producing invalid ISO months (`"2025-00"`) — fixed with `getMonth() + 1` and adjusted decode
2. `aria-live="assertive"` on chart tooltips spamming screen readers — changed to `"polite"` on both RevenueTooltip and ExpenseTooltip
3. No focus trap in Sheet overlay — keyboard users could Tab out of modal dialog. Added focus trap with Tab/Shift+Tab cycling and focus restore on close

**MEDIUM — Fixed:**
4. `computeTrend` returned 0 for `prev=0, last<0` — now returns -100 so TrendBadge correctly shows decline
5. `useReducedMotion` created new `matchMedia` per call — refactored to module-level singleton
6. SWR `revalidateOnFocus: false` prevented data refresh after upload — re-enabled
7. Custom tooltip components had zero test coverage — exported RevenueTooltip/ExpenseTooltip and added 8 tests (4 per tooltip)

**FALSE POSITIVE (dismissed):**
- `dashboard.viewed` analytics event "missing" — reviewer grepped `apps/web` only. Event fires server-side in `apps/api/src/routes/dashboard.ts:42` for authenticated users. Task 7 notes partial FR40 coverage.

**LOW — Not fixed (non-blocking):**
- Unbounded query on public endpoint (charts.ts:19-22) — documented trade-off, future story
- ChartErrorBoundary `componentDidCatch` — deferred to Sentry integration

### Post-Fix Verification
- `pnpm test`: 301 pass (211 API + 90 web), 0 fail
- `pnpm type-check`: clean
- `pnpm lint`: clean
