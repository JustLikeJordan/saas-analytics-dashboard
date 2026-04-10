# Story 6.3: Cross-Organization Analytics Events View

Status: done

<!-- Validated: 2026-03-31. All 4 steps: Create ✓ → Validate ✓ → Dev ✓ → Code Review -->

## Story

As a **platform admin**,
I want to view analytics events across all organizations,
so that I can understand platform usage patterns and identify trends.

## Acceptance Criteria

1. **Paginated Cross-Org Event List** — Given I am on the admin dashboard, when I navigate to the analytics events view, then I see a paginated list of analytics events from all organizations (FR33). Events display: event_name, org name, user email, timestamp, and metadata.

2. **Filtering & Search** — Given the events list is rendered, when I filter events, then I can filter by event type, organization, and date range. Filters apply immediately and reset pagination to page 1.

3. **Admin Query Path (Cross-Org Access)** — Given the analytics events view loads, when data is fetched, then the query uses a cross-org admin query (no `orgId` filter) gated by `roleGuard('admin')` at the route level — consistent with Stories 6.1/6.2. RLS policies exist but runtime context setting (`SET LOCAL app.current_org_id`) is not yet wired in middleware, so application-layer filtering is the actual enforcement. Service-role DB connection deferred until RLS middleware activation (Epic 7 scope).

## Tasks / Subtasks

- [x] 1. Cross-org analytics query (AC: #1, #2, #3)
  - [x] 1.1 Add `getAllAnalyticsEvents(opts)` to `apps/api/src/db/queries/analyticsEvents.ts` — cross-org (no orgId filter), same `db` instance as 6.1/6.2
  - [x] 1.2 Add `getAnalyticsEventsTotal(opts)` for count query (pagination meta)
  - [x] 1.3 Support filters: `eventName`, `orgId`, `startDate`, `endDate`, `limit` (default 50), `offset`
  - [x] 1.4 JOIN orgs (name) and users (email, name) for display fields
  - [x] 1.5 Unit tests for query function — all filter combinations, pagination, empty results
- [x] 2. Admin API endpoint (AC: #1, #2)
  - [x] 2.1 Add `GET /admin/analytics-events` to `apps/api/src/routes/admin.ts` (inherits `roleGuard('admin')`)
  - [x] 2.2 Zod validation on query params: `eventName` (optional enum), `orgId` (optional int), `startDate`/`endDate` (optional ISO dates), `limit` (1-200, default 50), `offset` (min 0)
  - [x] 2.3 Response format: `{ data: AnalyticsEventRow[], meta: { total, pagination: { page, pageSize, totalPages } } }`
  - [x] 2.4 Route handler tests — 200 with valid filters, 400 for bad params, response shape validation
- [x] 3. BFF proxy route (AC: #1)
  - [x] 3.1 Create `apps/web/app/api/admin/analytics-events/route.ts` — forward cookies + query params. NOTE: existing BFF proxies (`app/api/admin/orgs/route.ts`) don't forward query params — this one must. Append `request.nextUrl.search` to the Express URL.
- [x] 4. Frontend: Analytics Events table (AC: #1, #2)
  - [x] 4.1 Add `AnalyticsEventRow` type to `apps/web/app/admin/types.ts`
  - [x] 4.2 Create `apps/web/app/admin/analytics/page.tsx` — RSC page
  - [x] 4.3 Create `apps/web/app/admin/AnalyticsEventsTable.tsx` — Client Component using shadcn Table + Card
  - [x] 4.4 Columns: event name (badge), org name, user email, timestamp (Intl.DateTimeFormat hoisted), metadata (expandable or tooltip)
  - [x] 4.5 Pagination controls — prev/next + page indicator
  - [x] 4.6 Filter bar — event type dropdown (from ANALYTICS_EVENTS constant), org dropdown (fetch org list from existing `/api/admin/orgs` BFF), date range (presets: today, 7d, 30d)
  - [x] 4.7 Add "Analytics" nav link to admin sidebar
  - [x] 4.8 Component tests — render with mock data, pagination, filter submission, loading skeleton, empty state
- [x] 5. Accessibility (AC: #1, #2)
  - [x] 5.1 `aria-label` on filter controls, `role="status"` on pagination summary
  - [x] 5.2 Keyboard navigation through filter controls and pagination

## Dev Notes

### Why No Service-Role DB Connection

The architecture doc specifies a service-role (`dbAdmin`) connection for cross-org queries. We're deferring that to Epic 7 because RLS policies exist in migrations but middleware never calls `SET LOCAL app.current_org_id` — so RLS isn't enforced at runtime. Application-layer filtering via `orgId` params + `roleGuard('admin')` is the actual enforcement, same pattern Stories 6.1/6.2 use successfully.

Cross-org queries just omit the `orgId` filter. The existing `db` instance works because the Docker dev user is a superuser and RLS context is never set. When Epic 7 wires up RLS middleware, we'll add `dbAdmin` as a separate connection with `BYPASSRLS` privileges.

### Existing Code to Reuse — DO NOT Reinvent

| What | Where | Why |
|------|-------|-----|
| Admin router + roleGuard | `routes/admin.ts` + `routes/protected.ts` | Already mounted, just add endpoint |
| BFF proxy pattern | `app/api/admin/orgs/route.ts` | Copy-paste, change URL |
| shadcn Table + Card | `app/admin/AdminOrgTable.tsx` | Exact same wrapping pattern |
| Admin types file | `app/admin/types.ts` | Add `AnalyticsEventRow` alongside existing types |
| Admin layout + sidebar | `app/admin/layout.tsx` | Already has nav structure — add link |
| Zod route param validation | 6.1 code review finding H1 | Use `z.coerce` on query params |
| Intl.DateTimeFormat hoisted | 6.1 code review finding M4 | Module-level, not per-cell |
| SWR polling pattern | `SystemHealthPanel.tsx` (6.2) | If auto-refresh needed |
| ANALYTICS_EVENTS constant | `packages/shared/src/constants/index.ts` | 20 event types, use for dropdown |
| Error boundary | `app/admin/error.tsx` | Already handles admin page errors |
| JWT decode utility | `lib/auth-utils.ts` (6.1) | Extracted in 6.1, reuse in layout if needed |

### What This Story Does NOT Include

- **No schema changes** — `analytics_events` table already exists with indexes on `org_id`, `event_name`, `created_at`
- **No new RLS migration** — RLS context not set at runtime; cross-org queries work with existing `db` instance
- **No real-time updates** — polling or manual refresh is fine; no SSE/WebSocket
- **No event detail modal** — metadata shown inline (expandable row or tooltip)
- **No export/download** — just view and filter
- **No charts/visualizations** — table view only

### Gotchas From Previous Stories

1. **Anonymous volume in Docker** — If new dependencies aren't found in Docker, might be stale `node_modules`. Run `docker compose down -v` then `docker compose up` (caught in Epic 5 retro prep).
2. **Shared package rebuild** — Adding new constants to `packages/shared` no longer requires manual rebuild (fixed in Epic 6 prep — Vitest aliases + tsconfig paths point to source).
3. **Zod validation on query params** — Use `z.coerce.number()` for numeric params from query strings (strings, not numbers). Caught in 6.1 code review.
4. **Hoisted Intl.DateTimeFormat** — Create at module level, not inside render function. Caught in 6.1 code review.

### Project Structure Notes

Backend files follow the established admin pattern:
```
apps/api/src/
  db/queries/
    analyticsEvents.ts    ← EXTEND: add getAllAnalyticsEvents(), getAnalyticsEventsTotal()
  routes/
    admin.ts              ← EXTEND: add GET /analytics-events
```

Frontend files extend the admin dashboard:
```
apps/web/app/
  admin/
    analytics/
      page.tsx              ← NEW: RSC page
    AnalyticsEventsTable.tsx ← NEW: Client Component
    types.ts                ← EXTEND: add AnalyticsEventRow
  api/admin/
    analytics-events/
      route.ts              ← NEW: BFF proxy
```

### References

- [Source: epics.md#Epic 6, Story 6.3] — AC and FR33 requirements
- [Source: architecture.md#Multi-Tenancy] — org_id + RLS pattern, service-role bypass
- [Source: architecture.md#RBAC] — Two-dimensional RBAC, roleGuard('admin')
- [Source: project-context.md#Admin Rules] — proxy.ts protects /admin, DOM-level conditional rendering
- [Source: 6-1 dev notes] — Admin router pattern, BFF proxy, shadcn Table, Zod validation, types extraction
- [Source: 6-2 dev notes] — Health service pattern, SWR polling, a11y patterns
- [Source: epic-5-retro] — Docker anonymous volume gotcha, shared package rebuild fix

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
No debug issues encountered.

### Completion Notes List
- Task 1: Added `getAllAnalyticsEvents()` and `getAnalyticsEventsTotal()` cross-org query functions with shared `buildFilterConditions()` helper. Supports eventName, orgId, startDate, endDate, limit, offset filters. JOINs orgs and users for display fields. 11 unit tests.
- Task 2: Added `GET /admin/analytics-events` endpoint to admin router. Zod-validated query params with `z.coerce` for numeric types. Response includes pagination meta (page, pageSize, totalPages). Parallel data+count fetch via `Promise.all`. 7 route handler tests (200, 403, 401, filters, bad params, pagination math).
- Task 3: Created BFF proxy at `app/api/admin/analytics-events/route.ts`. Key difference from existing proxies: appends `request.nextUrl.search` to forward query params.
- Task 4: Built `AnalyticsEventsTable` client component with shadcn Table+Card, event name badges (color-coded by prefix), expandable metadata via `<details>`, filter bar (event type/org/date presets), prev/next pagination. Added `AnalyticsEventRow` and `AnalyticsEventsMeta` types. Created RSC page at `/admin/analytics`. Added "Analytics" nav link to sidebar. 11 component tests.
- Task 5: Accessibility built into Task 4 — `aria-label` on all filter controls, `role="status"` + `aria-live="polite"` on pagination summary, `aria-label` on pagination buttons, native `<select>` for keyboard nav, `<details>` for accessible metadata expansion.

### File List
- `apps/api/src/db/queries/analyticsEvents.ts` — MODIFIED (added getAllAnalyticsEvents, getAnalyticsEventsTotal, AdminEventsFilter, buildFilterConditions)
- `apps/api/src/db/queries/analyticsEvents.test.ts` — NEW (11 query tests)
- `apps/api/src/routes/admin.ts` — MODIFIED (added GET /analytics-events endpoint with Zod validation)
- `apps/api/src/routes/admin.test.ts` — MODIFIED (added 7 analytics-events route tests)
- `apps/web/app/api/admin/analytics-events/route.ts` — NEW (BFF proxy with query param forwarding)
- `apps/web/app/admin/types.ts` — MODIFIED (added AnalyticsEventRow, AnalyticsEventsMeta)
- `apps/web/app/admin/analytics/page.tsx` — NEW (RSC page)
- `apps/web/app/admin/AnalyticsEventsTable.tsx` — NEW (client component with table, filters, pagination)
- `apps/web/app/admin/AnalyticsEventsTable.test.tsx` — NEW (11 component tests)
- `apps/web/components/layout/Sidebar.tsx` — MODIFIED (added Analytics nav link)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIED (6-3 status: in-progress → review)

## Change Log
- 2026-03-31: Implemented Story 6.3 — cross-org analytics events view with paginated table, filtering by event type/org/date range, and admin sidebar navigation. 29 new tests across API and web.
