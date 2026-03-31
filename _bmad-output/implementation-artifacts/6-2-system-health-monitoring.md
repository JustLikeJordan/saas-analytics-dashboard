# Story 6.2: System Health Monitoring

Status: done

<!-- Note: Validation is REQUIRED. Every story must complete all 4 steps: Create → Validate → Dev → Code Review. -->

## Story

As a **platform admin**,
I want to view system health status including database, AI service, and uptime,
So that I can proactively identify and address issues.

## Acceptance Criteria

1. **Given** I am on the admin dashboard, **When** I view the system health panel, **Then** I see real-time status for: database connectivity, AI service (Claude API) availability, Redis connectivity, and application uptime (FR32)
2. **Given** a service is degraded or unavailable, **When** the health check detects the issue, **Then** the status indicator reflects the degraded state with a clear label
3. **Given** the health check runs, **When** it queries each service, **Then** each check has timeout handling — a slow response is reported as degraded, not hung
4. **Given** the health panel is visible, **When** time passes, **Then** the health data refreshes on a reasonable interval without requiring manual refresh

## Tasks / Subtasks

- [x] Task 1: Create admin health service (AC: 1, 2, 3)
  - [x] 1.1 Create `services/admin/healthService.ts` — orchestrates all health checks with per-check timeout
  - [x] 1.2 Add Claude API health check — add exported `checkClaudeHealth()` to `claudeClient.ts`. Use `client.models.list({ limit: 1 })` (lightweight, no token cost) with 5s timeout. Do NOT send a `messages.create` call (wastes tokens). Return shape: `{ status: 'ok' | 'error', latencyMs: number }` matching existing health functions.
  - [x] 1.3 Write database health check inline in `healthService.ts` — import `db` from `lib/db.js` and `sql` from `drizzle-orm`, replicate the `SELECT 1` pattern from `routes/health.ts`. Do NOT modify `routes/health.ts`. Reuse `checkRedisHealth()` from `lib/redis.ts` directly.
  - [x] 1.4 Add application uptime via `process.uptime()` — format as human-readable string
  - [x] 1.5 Each check wrapped in `Promise.race` with a configurable timeout (5s default). Timeout = `{ status: 'degraded', latencyMs: timeoutMs }`
  - [x] 1.6 Return type: `SystemHealth { services: Record<string, ServiceStatus>, uptime: { seconds: number, formatted: string }, timestamp: string }`
- [x] Task 2: Create admin health API endpoint (AC: 1, 3)
  - [x] 2.1 Add `GET /admin/health` to `routes/admin.ts` (already gated by `roleGuard('admin')` at the router level)
  - [x] 2.2 Response shape: `{ data: SystemHealth }` per project convention
  - [x] 2.3 Route tests — verify 403 for non-admin, 200 for admin, correct response shape with all 3 services + uptime
- [x] Task 3: Create BFF proxy route (AC: 1)
  - [x] 3.1 Create `app/api/admin/health/route.ts` — proxy GET to Express `/admin/health`, forward cookies
  - [x] 3.2 Follow exact pattern from `app/api/admin/orgs/route.ts`
- [x] Task 4: Create SystemHealthPanel client component (AC: 1, 2, 4)
  - [x] 4.1 Create `app/admin/SystemHealthPanel.tsx` — Client Component using shadcn Card + Table
  - [x] 4.2 Status indicators: green dot for `ok`, yellow for `degraded`, red for `error` — use CSS background colors. Add `aria-label` per indicator, `role="status"` + `aria-live="polite"` on panel container so screen readers announce refreshes. Status dot icons get `aria-hidden="true"` (text label conveys the status).
  - [x] 4.3 Display: service name, status badge, latency (ms), last checked timestamp
  - [x] 4.4 Display uptime in human-readable format (e.g., "2d 14h 32m")
  - [x] 4.5 Use SWR with `refreshInterval: 30000` for auto-refresh (already a project dependency). Gives deduplication, error state, `isLoading`, and revalidation for free.
  - [x] 4.6 Show a skeleton/loading state when SWR has no data yet (initial mount) — Card with pulsing placeholder rows matching the 3-service table layout. On fetch error, show last known data with an "unable to refresh" warning — don't blank the panel.
- [x] Task 5: Integrate into admin page (AC: 1)
  - [x] 5.1 Add `SystemHealthPanel` to `app/admin/page.tsx` — place above the org/user tables, below stat cards
  - [x] 5.2 The health panel is a Client Component (needs state for polling), so page.tsx passes no server-fetched health data. The panel fetches its own data on mount.
- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Unit tests for `healthService.ts` — mock each check (db, redis, claude), verify timeout handling, verify degraded status on timeout, verify overall status logic
  - [x] 6.2 Route tests for `GET /admin/health` — 403 non-admin, 200 admin, response shape validation. Extend the existing `vi.mock('../services/admin/index.js')` in `admin.test.ts` to include the health service export, or mock `healthService` separately if imported directly.
  - [x] 6.3 Component tests for `SystemHealthPanel` — renders all services, shows correct status colors, handles loading state, handles error state

## Dev Notes

### Architecture Compliance

**Extend existing admin infrastructure — don't create new patterns:**
- `routes/admin.ts` already has `adminRouter` with 3 endpoints. Add `GET /health` here — it inherits `roleGuard('admin')` from the router mount in `protected.ts` (line: `protectedRouter.use('/admin', roleGuard('admin'), adminRouter)`)
- `services/admin/` already has `adminService.ts`. Create a separate `healthService.ts` — health checks are a different concern from data aggregation
- BFF proxy follows `app/api/admin/orgs/route.ts` exactly

**Reuse existing health check functions:**
- `checkRedisHealth()` from `apps/api/src/lib/redis.ts` (line 19) — returns `{ status: 'ok' | 'error', latencyMs: number }`. Import and use directly.
- For database: write the check inline in `healthService.ts`. Import `db` from `lib/db.js` and `sql` from `drizzle-orm`, replicate the 6-line `SELECT 1` pattern from `routes/health.ts`. Do NOT modify `routes/health.ts` — zero regression risk.
- Do NOT import from `db/index.ts` — that barrel is for query functions only. Import `db` from `lib/db.js`.

**Type widening — `degraded` only comes from timeouts:**
- The existing `checkRedisHealth` and `checkDatabaseHealth` return `{ status: 'ok' | 'error' }` — a narrower type than the story's `ServiceStatus` (`'ok' | 'degraded' | 'error'`).
- The `degraded` status is applied exclusively by the `withTimeout` wrapper when a check exceeds the timeout threshold.
- Do NOT modify the existing function signatures to add `degraded`. Widen the type at the health service layer.

**Claude API health check — add `checkClaudeHealth()` to `claudeClient.ts`:**
- Add an exported function to `claudeClient.ts` (keeps the client encapsulated):
```typescript
export async function checkClaudeHealth(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
  const start = Date.now();
  try {
    await client.models.list({ limit: 1 });
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', latencyMs: Date.now() - start };
  }
}
```
- `models.list()` returns a `PagePromise` — pass `{ limit: 1 }` to fetch a single model as proof of connectivity. Alternatively, `client.models.retrieve(env.CLAUDE_MODEL)` validates both connectivity AND that the configured model exists.
- Do NOT make a `messages.create` call — that consumes tokens on every 30s health poll.

**`withTimeout` and abandoned promises:**
- `Promise.race` doesn't cancel the losing promise. The underlying check continues executing after timeout.
- This is safe because: PostgreSQL has its own `connect_timeout`, Redis has `maxRetriesPerRequest: 3`, and the Anthropic SDK has `timeout: 15_000`. All are longer than the 5s health timeout, so abandoned promises resolve/reject on their own.
- For extra safety on the Claude check, pass `AbortController.signal` via `RequestOptions` if the SDK supports it.

### Frontend Patterns

**SystemHealthPanel is a Client Component:**
- The admin page (`page.tsx`) is a Server Component that fetches org/user data server-side
- Health data needs polling, so the panel must be a Client Component
- Don't server-fetch health data in page.tsx — let the panel manage its own data lifecycle
- This matches how the rest of the app works: RSC for initial data, Client Components for dynamic/polling needs

**shadcn components available (from Epic 6 prep):**
- Card, CardHeader, CardTitle, CardContent — for the health panel container
- Table, TableHeader, TableRow, TableHead, TableBody, TableCell — for service status rows
- Button — not needed unless you add a manual "refresh now" button (optional, nice-to-have)

**Status indicator pattern:**
- Use a small colored circle (8x8px `rounded-full`) with a status label next to it
- Colors: `bg-green-500` for ok, `bg-yellow-500` for degraded, `bg-red-500` for error
- Include `aria-label` on each status: "Database: healthy", "Redis: degraded", etc.
- Use tabular numbers (`fontFeatureSettings: '"tnum"'`) for latency values — same pattern as stat cards in page.tsx

**Auto-refresh approach:**
- SWR with `refreshInterval: 30000` — already a project dependency, handles deduplication, error state, `isLoading`
- Fetch from `/api/admin/health` (BFF proxy)
- Show a loading skeleton on initial mount (Card with pulsing rows matching the 3-service table)
- On fetch error, show last known data with an "unable to refresh" warning — don't blank the panel
- The admin error boundary (`error.tsx`) catches unhandled render errors. The SystemHealthPanel should catch fetch/render errors internally and show a degraded state rather than letting errors propagate to the page-level boundary.

### Data Shapes

**ServiceStatus (shared or inline):**
```typescript
interface ServiceStatus {
  status: 'ok' | 'degraded' | 'error';
  latencyMs: number;
}

interface SystemHealth {
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    claude: ServiceStatus;
  };
  uptime: {
    seconds: number;
    formatted: string; // "2d 14h 32m"
  };
  timestamp: string; // ISO 8601
}
```

**API response:**
```typescript
// GET /admin/health → { data: SystemHealth }
```

### Timeout Pattern

```typescript
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  const timeout = new Promise<T>((resolve) =>
    setTimeout(() => resolve(fallback), timeoutMs),
  );
  return Promise.race([fn(), timeout]);
}
```

Each health check gets wrapped: `withTimeout(() => checkRedisHealth(), 5000, { status: 'degraded', latencyMs: 5000 })`. Run all checks in parallel with `Promise.all`.

### Previous Story Intelligence (Story 6.1)

**Patterns established:**
- Admin route tests use `supertest` with mocked auth middleware (`vi.mock`)
- Admin component tests use React Testing Library with mock data passed as props
- BFF proxy pattern: forward cookies via `request.headers.get('cookie')`, use `webEnv.API_INTERNAL_URL`
- `extractIsAdmin()` utility exists in `lib/auth-utils.ts` — use for any JWT claim extraction
- shadcn Table pattern established in AdminOrgTable.tsx — follow same structure
- Stat cards use `fontFeatureSettings: '"tnum"'` for tabular numbers
- `Intl.DateTimeFormat` instances hoisted to module level (code review finding M4)

**Gotchas from 6.1:**
- Test setup needs `afterEach(cleanup)` — already fixed in `apps/web/test/setup.ts`
- Admin layout mirrors dashboard layout — `/admin` is a sibling, not a child of `/dashboard`
- Don't hand-write TypeScript types — infer from Zod schemas or define in a types file

### File Locations

**Backend:**
- `apps/api/src/services/admin/healthService.ts` — NEW (health check orchestration)
- `apps/api/src/services/aiInterpretation/claudeClient.ts` — MODIFY (add exported `checkClaudeHealth()`)
- `apps/api/src/routes/admin.ts` — MODIFY (add `GET /admin/health` endpoint)
- `apps/api/src/routes/admin.test.ts` — MODIFY (add health endpoint tests)
- `apps/api/src/services/admin/index.ts` — MODIFY (add healthService barrel export)

**Frontend:**
- `apps/web/app/api/admin/health/route.ts` — NEW (BFF proxy)
- `apps/web/app/admin/SystemHealthPanel.tsx` — NEW (Client Component)
- `apps/web/app/admin/SystemHealthPanel.test.tsx` — NEW (component tests)
- `apps/web/app/admin/page.tsx` — MODIFY (add SystemHealthPanel)
- `apps/web/app/admin/types.ts` — MODIFY (add SystemHealth types)

**Tests:**
- `apps/api/src/services/admin/healthService.test.ts` — NEW
- `apps/api/src/routes/admin.test.ts` — MODIFY (add health route tests)
- `apps/web/app/admin/SystemHealthPanel.test.tsx` — NEW

### What NOT To Do

- **Don't make a real Claude messages.create call for health** — that costs tokens. Use `models.list()` or a similar zero-cost endpoint
- **Don't modify the existing `GET /health` route** — it's used by Docker health checks and CI. Add a separate admin-only endpoint
- **Don't server-fetch health data in page.tsx** — the panel needs client-side polling, let it manage its own data
- **Don't add WebSocket or SSE for health updates** — simple polling at 30s is fine for an admin panel
- **Don't add pagination to the health panel** — there are exactly 3 services, this is a fixed list
- **Don't create a new admin route file** — add the endpoint to the existing `routes/admin.ts`
- **Don't bypass the BFF proxy** — all browser requests go through Next.js `/api/*` routes, never directly to Express

### Project Structure Notes

- `services/admin/healthService.ts` matches the architecture doc's `services/admin/` directory (lines 839-841)
- `routes/health.ts` referenced in architecture (line 803) is the PUBLIC health endpoint — the admin health endpoint lives in `routes/admin.ts`
- Architecture doc maps FR32 to `adminService.ts`, but that file handles org/user aggregation stats. System health is a distinct concern — this story splits it into `healthService.ts` and `SystemHealthPanel` for clearer responsibility

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.2] — acceptance criteria, user story
- [Source: _bmad-output/planning-artifacts/prd.md#FR32] — platform admins view system health status
- [Source: _bmad-output/planning-artifacts/prd.md#FR35] — health check endpoint for monitoring (public, already exists)
- [Source: _bmad-output/planning-artifacts/architecture.md#File Tree] — routes/health.ts, services/admin/
- [Source: apps/api/src/routes/health.ts] — existing public health check (DB + Redis)
- [Source: apps/api/src/lib/redis.ts] — existing `checkRedisHealth()` function
- [Source: apps/api/src/services/aiInterpretation/claudeClient.ts] — Anthropic SDK client setup
- [Source: apps/api/src/routes/admin.ts] — existing admin router (add health endpoint here)
- [Source: apps/web/app/admin/page.tsx] — existing admin page (add SystemHealthPanel)
- [Source: apps/web/app/admin/types.ts] — existing admin types (add SystemHealth types)
- [Source: apps/web/app/api/admin/orgs/route.ts] — BFF proxy pattern to follow
- [Source: _bmad-output/implementation-artifacts/6-1-admin-dashboard-org-user-management.md] — Story 6.1 patterns and learnings

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation, no blockers encountered.

### Completion Notes List

- Built `healthService.ts` with `withTimeout` wrapper around `Promise.race` for per-check timeout handling. `degraded` status only applied by timeout wrapper — existing check functions untouched.
- Added `checkClaudeHealth()` to `claudeClient.ts` using `client.models.list({ limit: 1 })` — zero token cost per poll.
- Database health check written inline in `healthService.ts` replicating `SELECT 1` pattern from `routes/health.ts`. Existing public health route not modified.
- `GET /admin/health` added to existing `adminRouter` — inherits `roleGuard('admin')` from router mount.
- BFF proxy follows exact `app/api/admin/orgs/route.ts` pattern (cookie forwarding, status passthrough).
- `SystemHealthPanel` is a Client Component using SWR with 30s `refreshInterval`. Shows skeleton on initial load, stale data with warning on fetch error. Full a11y: `role="status"`, `aria-live="polite"`, `aria-label` per status indicator, `aria-hidden` on decorative dots.
- Panel placed above org/user tables in admin page per story spec.
- 8 healthService unit tests (all services ok, individual failures, timeout → degraded, parallel execution).
- 3 route tests (200 admin, 403 non-admin, 401 no auth).
- 11 component tests (renders services, status labels, latency, uptime, skeleton, stale data warning, empty error state, a11y attributes, SWR config).
- All 43 API test files pass (410 tests). All 28 web test files pass (306 tests). Zero regressions. Lint clean.
- Pre-existing type errors in `shared/types/transparency.ts` and `json` unknown in test files — not introduced by this story.

### File List

**New files:**
- `apps/api/src/services/admin/healthService.ts`
- `apps/api/src/services/admin/healthService.test.ts`
- `apps/web/app/api/admin/health/route.ts`
- `apps/web/app/admin/SystemHealthPanel.tsx`
- `apps/web/app/admin/SystemHealthPanel.test.tsx`

**Modified files:**
- `apps/api/src/services/aiInterpretation/claudeClient.ts` — added `checkClaudeHealth()`
- `apps/api/src/services/admin/index.ts` — added healthService barrel export
- `apps/api/src/routes/admin.ts` — added `GET /admin/health` endpoint
- `apps/api/src/routes/admin.test.ts` — added health route tests + mock
- `apps/web/app/admin/page.tsx` — added SystemHealthPanel import + placement
- `apps/web/app/admin/types.ts` — added ServiceStatus + SystemHealth interfaces

## Change Log

- 2026-03-30: Implemented Story 6.2 — System Health Monitoring. Full-stack health check panel: healthService with timeout handling, admin-only API endpoint, BFF proxy, SWR-powered Client Component with a11y. 22 tests added across 3 test files.
- 2026-03-30: Code review (Claude Opus 4.6). 1 High + 4 Medium + 3 Low findings. Fixed all HIGH/MEDIUM: (H1) moved duplicate ServiceStatus/SystemHealth types to shared package, (M1) added try-catch to BFF health proxy for upstream failures, (M2) simplified fragile mock implementations in healthService tests to mock return values, (M3) added logger.warn to checkClaudeHealth error path, (M4) exported formatUptime and added 6 unit tests covering edge cases. 416 API tests pass, 306 web tests pass.
