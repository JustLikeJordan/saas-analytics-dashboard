# Story 2.7: Date Range & Category Filters

Status: done

## Story

As a **business owner**,
I want to filter my charts by date range and category,
so that I can focus on specific time periods and business segments.

## Acceptance Criteria

1. **Given** I am viewing the dashboard, **when** I select a date range or category filter, **then** charts update to reflect the filtered data within 500ms (NFR5) (FR14), and the `chart.filtered` analytics event fires.

2. **Given** the FilterBar component is rendered, **when** I scroll the page, **then** the FilterBar sticks below the AppHeader (sticky positioning).

3. **Given** filters are applied, **when** I share or reference the dashboard, **then** the shared `DateRange` type from `packages/shared/src/schemas/filters.ts` is used consistently by FilterBar, DashboardCharts, and backend query params.

4. **Given** a keyboard user navigates the FilterBar, **when** they interact with date range and category controls, **then** all filter controls are keyboard-navigable with visible focus indicators (NFR25).

## Tasks / Subtasks

- [x] Task 1: Shared schemas, types, and constants
  - [x] Create `packages/shared/src/schemas/filters.ts` with DateRange and ChartFilters schemas
  - [x] Extend `packages/shared/src/schemas/charts.ts` with availableCategories and dateRange
  - [x] Add `CHART_FILTERED` to analytics events and `FILTER_DEBOUNCE_MS` to chart config
  - [x] Update barrel exports in schemas/index.ts and types/index.ts

- [x] Task 2: Backend query and route changes (already implemented)
  - [x] Extend `getChartData` with optional filter params (dateFrom, dateTo, categories)
  - [x] Compute availableCategories and dateRange from unfiltered data
  - [x] Apply filters during JS aggregation loop
  - [x] Parse query params in dashboard route (from, to, categories)
  - [x] Fire `chart.filtered` event when filters present

- [x] Task 3: FilterBar component
  - [x] Create `FilterBar.tsx` with date range preset dropdown and category dropdown
  - [x] Active filter badges with × dismiss
  - [x] "Reset filters" ghost button
  - [x] Sticky positioning below AppHeader (`sticky top-14`)
  - [x] Keyboard-navigable dropdowns with visible focus indicators (NFR25)
  - [x] Disabled state when no data available
  - [x] Reduced-motion: badge animation disabled

- [x] Task 4: DashboardShell integration
  - [x] Add filter state (useState<FilterState>)
  - [x] Update SWR cache key to include filter params via buildSwrKey()
  - [x] Update fetchChartData to pass key string directly to apiClient
  - [x] Render FilterBar between header and chart grid (when data exists)
  - [x] Pass availableCategories to FilterBar
  - [x] "No data matches these filters" empty state variant (FilteredEmptyState)

- [x] Task 5: Tests
  - [x] FilterBar render and interaction tests (28 tests)
  - [x] Keyboard navigation tests (Enter, Space, ArrowDown/Up, Escape)
  - [x] DashboardShell mock updated for new FilterBar import path

- [x] Task 6: Companion docs
  - [x] Generated `FilterBar.tsx_explained.md` (8 sections)
  - [x] Updated `DashboardShell.tsx_explained.md` with filter integration

- [x] Task 7: Verification
  - [x] pnpm type-check passes
  - [x] pnpm lint passes
  - [x] pnpm test passes (340 total: 220 API + 120 web)

## Dev Notes

### Architecture Decisions

- **Preset date ranges** instead of date picker — UX spec says MVP-Core uses presets only ("Last month", "Last 3 months", "Last 6 months", "Last year", "All time"). Simpler implementation, matches how SMB owners think about time.
- **Custom accessible dropdowns** instead of Radix UI — only two dropdowns needed, full WAI-ARIA listbox pattern implemented (aria-haspopup, aria-expanded, role=listbox, role=option, keyboard nav). No extra dependency.
- **Filter state in SWR cache key** — `buildSwrKey()` converts FilterState to query params embedded in the SWR key. Each filter combination gets its own cache entry. Switching back to a previous combination serves from cache.
- **Controlled FilterBar** — parent (DashboardShell) owns filter state, passes it down. FilterBar reports changes via callback. Clean separation between UI and data fetching.
- **Three-tier empty state** — loading skeleton / filtered-empty / no-data-at-all. Prevents confusion between "no data uploaded" and "filters too narrow."
- **`null` as "no filter"** — avoids sentinel string bugs. `hasActiveFilters` is a simple null check.
- **Sticky FilterBar** — `sticky top-14` (56px = AppHeader height) with backdrop blur. Negative margins extend background to full width.
- **Badge animation** — 100ms scale-in (`animate-badge-in`), respects `prefers-reduced-motion`.

### Cleanup

Removed stale `filters/` subdirectory (DateRangePicker.tsx, CategorySelect.tsx, FilterBar.tsx) from a prior incomplete implementation. Replaced with single `FilterBar.tsx` at `app/dashboard/FilterBar.tsx`.

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Change Log

**New files:**
- `apps/web/app/dashboard/FilterBar.tsx` — FilterBar component with dropdowns, badges, reset
- `apps/web/app/dashboard/FilterBar.test.tsx` — 28 tests for FilterBar
- `apps/web/app/dashboard/FilterBar.tsx_explained.md` — Interview-ready documentation

**Modified files:**
- `apps/web/app/dashboard/DashboardShell.tsx` — Added filter state, buildSwrKey, FilteredEmptyState, FilterBar integration
- `apps/web/app/dashboard/DashboardShell.test.tsx` — Updated FilterBar mock import path
- `apps/web/app/dashboard/DashboardShell.tsx_explained.md` — Updated with filter integration docs
- `apps/web/app/dashboard/page.tsx` — Added availableCategories and dateRange to EMPTY_CHART_DATA fallback
- `apps/web/app/globals.css` — Added badge-in keyframe animation
- `_bmad-output/implementation-artifacts/2-7-date-range-category-filters.md` — This file

**Deleted files:**
- `apps/web/app/dashboard/filters/FilterBar.tsx` — Stale, replaced
- `apps/web/app/dashboard/filters/DateRangePicker.tsx` — Stale, replaced
- `apps/web/app/dashboard/filters/CategorySelect.tsx` — Stale, replaced
