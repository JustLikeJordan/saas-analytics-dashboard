# Story 1.6: Cross-Cutting Infrastructure Foundation

Status: done

## Story

As a **developer**,
I want CI running lint and type checks from day 1 with a README scaffold and analytics event tracking foundation,
So that code quality, documentation, and usage tracking are established from the start.

## Acceptance Criteria

1. **Given** code is pushed to the repository **When** GitHub Actions runs **Then** the CI pipeline executes lint + typecheck stages (FR37 partial) **And** the pipeline fails fast on lint or type errors

2. **Given** the repository exists **When** I open `README.md` **Then** it contains the case-study format scaffold: section headers (Overview, Problem, Solution, Architecture, Tech Stack, Screenshots, Getting Started, Demo) with placeholder content (FR38 partial)

3. **Given** the analytics foundation is built **When** I inspect the analytics service **Then** an `analytics_events` table migration exists with the event schema (event_name, org_id, user_id, metadata jsonb, timestamp) **And** a `trackEvent()` service function exists using dot-notation, past-tense naming convention (FR40 partial)

4. **Given** the `analytics_events` table is created **When** database security is configured **Then** RLS policies are applied to `analytics_events` scoped by `org_id` (admin queries bypass RLS via dedicated admin query path)

## Tasks / Subtasks

- [x] Task 1: Create GitHub Actions CI workflow (AC: #1)
  - [x]1.1 Create `.github/workflows/ci.yml` — pnpm setup, dependency cache, lint + typecheck
  - [x]1.2 Trigger on push to `main` and pull_request to `main`
  - [x]1.3 Verify pipeline passes on current codebase

- [x] Task 2: Rewrite README with case-study scaffold (AC: #2)
  - [x]2.1 Replace current placeholder `README.md` with section headers and TK placeholders
  - [x]2.2 Sections: Overview, Problem, Solution, Architecture, Tech Stack, Screenshots, Getting Started, Demo

- [x] Task 3: Add `analytics_events` table to Drizzle schema (AC: #3)
  - [x]3.1 Add table definition + indexes to `apps/api/src/db/schema.ts`
  - [x]3.2 Add relations to existing relations block
  - [x]3.3 Run `pnpm --filter api db:generate` to create versioned migration

- [x] Task 4: Add RLS policies for `analytics_events` and `org_invites` (AC: #4)
  - [x]4.1 Create custom migration: tenant isolation + admin bypass for both tables
  - [x]4.2 Follow exact pattern from `0001_add-rls-policies.sql`

- [x] Task 5: Create analytics query functions (AC: #3)
  - [x]5.1 Create `apps/api/src/db/queries/analyticsEvents.ts` — `recordEvent`, `getEventsByOrg`
  - [x]5.2 Export from `apps/api/src/db/queries/index.ts` barrel

- [x] Task 6: Create `trackEvent` service (AC: #3)
  - [x]6.1 Create `apps/api/src/services/analytics/trackEvent.ts`
  - [x]6.2 Fire-and-forget wrapper: catches errors, logs them, never blocks caller

- [x] Task 7: Add event name constants to shared package (AC: #3)
  - [x]7.1 Add `ANALYTICS_EVENTS` constant to `packages/shared/src/constants/index.ts`
  - [x]7.2 Rebuild shared package: `pnpm --filter shared build`

- [x] Task 8: Write tests (AC: #3, #4)
  - [x]8.1 Create `apps/api/src/services/analytics/trackEvent.test.ts`
  - [x]8.2 Test: records event with correct fields
  - [x]8.3 Test: handles missing metadata gracefully
  - [x]8.4 Test: catches and logs DB errors without throwing (fail-open)

- [x] Task 9: Generate `_explained.md` docs for new files

- [x] Task 10: Update sprint status

## Dev Notes

### What Already Exists (from Stories 1.1-1.5)

**DO NOT recreate or modify these (unless adding to them):**

- `apps/api/src/db/schema.ts` — 5 tables defined (users, orgs, user_orgs, refresh_tokens, org_invites). Add analytics_events here.
- `apps/api/src/db/queries/index.ts` — barrel exports 5 query modules. Add analyticsEvents export here.
- `apps/api/src/lib/logger.ts` — Pino logger, ready to use
- `apps/api/src/lib/db.ts` — Drizzle db instance
- `apps/api/src/lib/appError.ts` — AppError hierarchy (ValidationError, NotFoundError, etc.)
- `apps/api/src/config.ts` — Zod-validated env config
- `packages/shared/src/constants/index.ts` — has INVITES constant. Add ANALYTICS_EVENTS here.
- `turbo.json` — already defines `lint`, `type-check`, `test`, `build` tasks with correct dependencies
- Root `package.json` — scripts already map to turbo commands (`pnpm lint` → `turbo lint`)

### Critical Architecture Constraints

1. **Integer IDs, not UUIDs** — The architecture doc mentions UUIDs for analytics_events, but the actual codebase uses `integer().primaryKey().generatedAlwaysAsIdentity()` on every table. Follow the established pattern.

2. **Query modules import from `../../lib/db.js`** — All query files use this pattern. Services import from the `db/queries/` barrel, never `db/index.ts`.

3. **ESM `.js` extensions required** — API app uses `"type": "module"`. All local imports need `.js` suffix.

4. **Fail-open analytics** — `trackEvent()` must never throw. Wrap the DB insert in try/catch, log errors with Pino, return void. Analytics tracking is observational — it should never break a user's upload, login, or AI request.

5. **Pino logging** — Object first, message second: `logger.info({ orgId, eventName }, 'Event tracked')`. Never string concatenation.

6. **No `process.env` in application code** — All env access through `apps/api/src/config.ts`.

7. **Express middleware chain** — The analytics service is called from route handlers, not middleware. Route handlers call `trackEvent()` after business logic completes.

8. **pnpm@10.30.2** — Specified in root `packageManager` field. GitHub Actions must use this exact version.

### CI Pipeline Details

**File:** `.github/workflows/ci.yml`

**Actions to use:**
- `actions/checkout@v5`
- `pnpm/action-setup@v4` with `version: 10` (reads exact version from `packageManager` field)
- `actions/setup-node@v4` with `node-version: '22'` and `cache: 'pnpm'`

**Commands:**
```bash
pnpm install --frozen-lockfile
pnpm turbo lint
pnpm turbo type-check
```

**Trigger:**
```yaml
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
```

**Notes:**
- `turbo lint` runs `eslint` in both `apps/web` and `apps/api`
- `turbo type-check` runs `tsc --noEmit` in all three packages
- `packages/shared` builds first as a dependency (Turborepo handles this via `dependsOn: ["^build"]`)
- Single job for now — later epics add test, seed-validation, E2E, and Docker smoke stages
- No secrets needed for lint + typecheck — no DB, no Redis, no API keys

### Analytics Events Schema

**Add to `apps/api/src/db/schema.ts`:**

```typescript
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventName: varchar('event_name', { length: 100 }).notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_analytics_events_org_id').on(table.orgId),
    index('idx_analytics_events_event_name').on(table.eventName),
    index('idx_analytics_events_created_at').on(table.createdAt),
  ],
);
```

**Add relations:**
```typescript
export const analyticsEventsRelations = relations(analyticsEvents, ({ one }) => ({
  org: one(orgs, {
    fields: [analyticsEvents.orgId],
    references: [orgs.id],
  }),
  user: one(users, {
    fields: [analyticsEvents.userId],
    references: [users.id],
  }),
}));
```

**Import `jsonb` from `drizzle-orm/pg-core`** — not currently imported in schema.ts.

### RLS Migration Pattern

**Follow exact pattern from `0001_add-rls-policies.sql`:**

```sql
-- Enable RLS
ALTER TABLE "analytics_events" ENABLE ROW LEVEL SECURITY;

-- Tenant isolation
CREATE POLICY "analytics_events_tenant_isolation" ON "analytics_events"
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true)::integer)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::integer);

-- Admin bypass
CREATE POLICY "analytics_events_admin_bypass" ON "analytics_events"
  FOR ALL
  USING (COALESCE(current_setting('app.is_admin', true)::boolean, false) = true);
```

Also add the same for `org_invites` (deferred from Story 1.5 — noted in their dev notes):
```sql
ALTER TABLE "org_invites" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_invites_tenant_isolation" ON "org_invites"
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true)::integer)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::integer);

CREATE POLICY "org_invites_admin_bypass" ON "org_invites"
  FOR ALL
  USING (COALESCE(current_setting('app.is_admin', true)::boolean, false) = true);
```

### Event Name Constants

**Add to `packages/shared/src/constants/index.ts`:**

```typescript
export const ANALYTICS_EVENTS = {
  DATASET_UPLOADED: 'dataset.uploaded',
  DASHBOARD_VIEWED: 'dashboard.viewed',
  CHART_FILTERED: 'chart.filtered',
  AI_SUMMARY_VIEWED: 'ai_summary.viewed',
  AI_PREVIEW_VIEWED: 'ai_preview.viewed',
  TRANSPARENCY_PANEL_OPENED: 'transparency_panel.opened',
  INSIGHT_SHARED: 'insight.shared',
  INSIGHT_EXPORTED: 'insight.exported',
  SUBSCRIPTION_UPGRADED: 'subscription.upgraded',
} as const;
```

### trackEvent Service Pattern

**File:** `apps/api/src/services/analytics/trackEvent.ts`

```typescript
import * as analyticsQueries from '../../db/queries/analyticsEvents.js';
import { logger } from '../../lib/logger.js';

export async function trackEvent(
  orgId: number,
  userId: number,
  eventName: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await analyticsQueries.recordEvent(orgId, userId, eventName, metadata);
  } catch (err) {
    logger.error({ err, orgId, userId, eventName }, 'Failed to record analytics event');
  }
}
```

No return value. No re-throw. The caller never awaits the result in production paths — they can fire-and-forget with `void trackEvent(...)` or `trackEvent(...).catch(() => {})` depending on context.

### Query Functions Pattern

**File:** `apps/api/src/db/queries/analyticsEvents.ts`

Follow the same import pattern as `orgInvites.ts`:
```typescript
import { eq, and, gte, desc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { analyticsEvents } from '../schema.js';
```

Two functions:
1. `recordEvent(orgId, userId, eventName, metadata?)` — INSERT + returning
2. `getEventsByOrg(orgId, opts?)` — SELECT with optional eventName filter, date range, ordered by createdAt desc

### Testing Strategy

**Unit tests for `trackEvent.ts`:**
- Mock `analyticsQueries.recordEvent` via `vi.mock`
- Mock logger via `vi.mock`
- Test: calls recordEvent with correct args
- Test: on DB error, logs error and does not throw
- Test: works without metadata param

**Pattern (from Story 1.5 tests):**
```typescript
vi.mock('../../db/queries/analyticsEvents.js', () => ({
  recordEvent: vi.fn(),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));
```

### README Scaffold Structure

Overwrite current `README.md` with section headers. Use HTML comments for placeholders (not visible on GitHub). Sections:

1. `# SaaS Analytics Dashboard` — one-line description
2. `## Overview` — TK
3. `## Problem` — TK
4. `## Solution` — TK
5. `## Architecture` — TK (diagram placeholder)
6. `## Tech Stack` — can list actual stack now (Next.js 16, Express 5, PostgreSQL 18, etc.)
7. `## Screenshots` — TK (placeholder for hero screenshot)
8. `## Getting Started` — `docker compose up` with brief instructions
9. `## Demo` — TK

### File Placement

```
.github/workflows/
├── ci.yml                                    # NEW — lint + typecheck pipeline

README.md                                     # REWRITE — case-study scaffold

apps/api/src/db/
├── schema.ts                                 # MODIFY — add analyticsEvents table + relations

apps/api/drizzle/migrations/
├── 0003_*.sql                                # NEW — auto-generated schema migration
├── 0004_add-rls-analytics-invites.sql        # NEW — custom RLS migration

apps/api/src/db/queries/
├── analyticsEvents.ts                        # NEW — recordEvent, getEventsByOrg
├── index.ts                                  # MODIFY — add analyticsEventsQueries export

apps/api/src/services/analytics/
├── trackEvent.ts                             # NEW — fire-and-forget event tracking
├── trackEvent.test.ts                        # NEW — 3+ unit tests

packages/shared/src/constants/
├── index.ts                                  # MODIFY — add ANALYTICS_EVENTS constant
```

### Previous Story Intelligence

From Stories 1.1-1.5:
- ESM imports need `.js` extensions in the API app
- `packages/shared/dist/` can get stale — rebuild with `pnpm --filter shared build` after modifying shared
- Drizzle migrations: run `pnpm --filter api db:generate` after schema changes, then `pnpm --filter api db:migrate:run` to apply
- Custom SQL migrations (like RLS) are placed manually in `apps/api/drizzle/migrations/` with the next sequential number
- vi.mock pattern: mock at module level, import after — use dynamic `await import()` if needed
- `createTestApp()` helper exists at `apps/api/src/test/helpers/testApp.ts` for route testing
- Code review findings from Story 1.5: always add rate limiting on public endpoints, strip sensitive fields from API responses, protect new routes in `proxy.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.6]
- [Source: _bmad-output/planning-artifacts/architecture.md#CI/CD Pipeline]
- [Source: _bmad-output/planning-artifacts/architecture.md#Analytics Events]
- [Source: _bmad-output/planning-artifacts/architecture.md#Database Schema]
- [Source: _bmad-output/project-context.md#Testing]
- [Source: apps/api/drizzle/migrations/0001_add-rls-policies.sql — RLS pattern]
- [Source: apps/api/src/db/queries/orgInvites.ts — query function pattern]
- [Source: apps/api/src/db/schema.ts — table definition pattern]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- ESLint 9 required flat config files for api + shared packages (created `eslint.config.js` for both)
- `correlationId.ts` namespace augmentation required eslint-disable for `@typescript-eslint/no-namespace`
- `migrate.ts` had stale eslint-disable directives from rules not in the new flat config
- Drizzle `db:generate` needs DATABASE_URL even for offline schema generation — passed dummy URL
- Migration 0003 picked up previously-untracked `org_invites` table alongside `analytics_events`
- `org_invites` RLS was deferred from Story 1.5 — caught up in migration 0004

### Completion Notes List
- All 4 acceptance criteria met
- CI pipeline: lint + typecheck on push/PR to main
- README: case-study scaffold with TK placeholders
- Analytics foundation: schema, migration, RLS, query module, service, shared constants, tests
- Event names typed via `AnalyticsEventName` union derived from `ANALYTICS_EVENTS` constant
- `trackEvent()` returns `void` (not `Promise<void>`) — true fire-and-forget
- 124 tests pass (all existing + 4 new)
- `pnpm turbo lint` and `pnpm turbo type-check` both pass across all 4 packages

### File List
**Created:**
- `.github/workflows/ci.yml`
- `apps/api/eslint.config.js`
- `packages/shared/eslint.config.js`
- `apps/api/drizzle/migrations/0003_nervous_dorian_gray.sql`
- `apps/api/drizzle/migrations/0004_add-rls-analytics-invites.sql`
- `apps/api/src/db/queries/analyticsEvents.ts`
- `apps/api/src/services/analytics/trackEvent.ts`
- `apps/api/src/services/analytics/trackEvent.test.ts`
- `apps/api/src/db/queries/analyticsEvents.ts_explained.md`
- `apps/api/src/services/analytics/trackEvent.ts_explained.md`

**Modified:**
- `README.md` (rewritten with case-study scaffold)
- `apps/api/src/db/schema.ts` (added analyticsEvents table + relations)
- `apps/api/src/db/queries/index.ts` (added analyticsEventsQueries export)
- `packages/shared/src/constants/index.ts` (added ANALYTICS_EVENTS + AnalyticsEventName type)
- `apps/api/src/middleware/correlationId.ts` (eslint-disable for namespace)
- `apps/api/src/middleware/rateLimiter.test.ts` (prefer-const fix)
- `apps/api/src/db/migrate.ts` (removed stale eslint-disable directives)
- `packages/shared/src/constants/index.ts_explained.md` (updated with analytics events)
- `apps/api/src/db/schema.ts_explained.md` (updated with analytics table)
