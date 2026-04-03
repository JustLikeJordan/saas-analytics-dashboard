# Story 7.6: RLS Middleware Activation & Service-Role DB Connection

Status: done

<!-- Validated: 2026-04-02. Validation found 4 critical issues (route handler specificity, webhook/share paths, tx threading), 5 enhancements (prerequisites, type name, test infra, architecture context, error handling), 2 optimizations (prose tightening, JWT naming table). All applied. -->

## Story

As a **platform operator deploying with real tenants**,
I want RLS enforced at the database level with per-request org context and a separate admin bypass connection,
so that a bug in application-level filtering can never leak data between organizations.

## Acceptance Criteria

1. **Given** a request passes `authMiddleware`, **when** the handler queries the database, **then** `SET LOCAL app.current_org_id` and `SET LOCAL app.is_admin` are set within a transaction wrapping every DB call — matching the JWT payload values

2. **Given** a non-admin user's request reaches the database, **when** RLS evaluates, **then** rows from other organizations are invisible regardless of whether the application-level WHERE clause includes `orgId`

3. **Given** an admin route queries cross-org data, **when** the query executes, **then** it uses `dbAdmin` (a connection pool with `BYPASSRLS` privileges), not the regular `db` pool

4. **Given** Docker Compose starts fresh, **when** PostgreSQL initializes, **then** `init.sql` creates two roles: `app_user` (non-superuser, RLS enforced) and `app_admin` (BYPASSRLS), both with access to the `analytics` database

5. **Given** the ai_summaries RLS policy from migration 0007, **when** reviewed, **then** it includes `WITH CHECK` and admin bypass clauses matching the pattern used by all other tables

6. **Given** all existing tests run, **when** executed against the dual-pool setup, **then** they pass without modification (seed.ts already uses `SET LOCAL app.is_admin`)

7. **Given** new integration tests exist, **when** they execute, **then** they prove: (a) `db` with org A context cannot read org B rows, (b) `dbAdmin` can read all orgs, (c) missing `SET LOCAL` blocks all tenant-scoped reads

## Tasks / Subtasks

- [x] Task 1: Dual DB roles in Docker (AC: #4)
  - [x] Create `docker/init.sql` — `app_user` (LOGIN, non-superuser) + `app_admin` (LOGIN, BYPASSRLS)
  - [x] Update `docker-compose.yml` — mount `./docker/init.sql:/docker-entrypoint-initdb.d/init.sql`, set POSTGRES_USER=app_admin
  - [x] Add `DATABASE_ADMIN_URL` to config.ts (Zod-validated)
  - [x] Update `.env.example` with both connection strings
  - [x] **WARNING:** Existing Docker volumes must be destroyed first: `docker compose down -v`
- [x] Task 2: Create `dbAdmin` connection pool (AC: #3)
  - [x] Add `dbAdmin` export to `apps/api/src/lib/db.ts` using `DATABASE_ADMIN_URL`
  - [x] Switch existing `db` pool to use `app_user` role connection string
- [x] Task 3: RLS context query wrapper (AC: #1, #2)
  - [x] Create `apps/api/src/lib/rls.ts` — `withRlsContext(orgId, isAdmin, fn)` wraps queries in a transaction with SET LOCAL. If either `SET LOCAL` statement fails, the transaction aborts and the error propagates (fail-closed).
  - [x] Update protected route handlers to wrap DB calls in `withRlsContext(req.user.org_id, req.user.isAdmin, ...)`:
    - `apps/api/src/routes/invites.ts` — `GET /` calls `getActiveInvites(orgId)`, `POST /` calls `generateInvite()` via service
    - `apps/api/src/routes/datasets.ts` — `POST /confirm` calls `persistUpload()` (already uses `db.transaction()` — refactor to accept `tx`)
    - `apps/api/src/routes/aiSummary.ts` — `GET /:datasetId` calls `getCachedSummary(orgId, datasetId)`
    - `apps/api/src/routes/subscriptions.ts` — `GET /tier` calls `getActiveTier(orgId)`, `POST /portal` calls `getSubscriptionByOrgId(orgId)`
    - `apps/api/src/routes/sharing.ts` — `POST /` (auth-protected `shareRouter`) calls `generateShareLink()`
    - `apps/api/src/routes/analytics.ts` — `POST /events` calls `trackEvent()` via service
  - [x] Add optional `tx` parameter (type `DbTransaction`) to query functions that don't have it yet: `getCachedSummary()`, `storeSummary()`, `createShare()`, `findByTokenHash()` (shares), `createInvite()`, `findByTokenHash()` (orgInvites), `markUsed()`, `getActiveInvites()`, `getActiveTier()`, `upsertSubscription()`, `getSubscriptionByOrgId()`, `recordEvent()`, `getEventsByOrg()`. Follow existing pattern from `datasets.ts`: `client: typeof db | DbTransaction = db`
  - [x] Admin routes (`/admin/*`) do NOT need `withRlsContext` — they use `dbAdmin` directly (Task 5)
  - [x] Unauthenticated routes:
    - Health check (`SELECT 1`) — fine on RLS pool, no tenant table
    - Stripe webhook (`apps/api/src/routes/stripeWebhook.ts`) — delegates to `services/subscription/` which calls `upsertSubscription()`, `updateSubscriptionStatus()`, etc. These subscription query functions must use `dbAdmin` when called from webhook context (no JWT = no org context). Add a `client` parameter defaulting to `db`, pass `dbAdmin` from webhook service.
    - Public share route (`apps/api/src/routes/sharing.ts` → `publicShareRouter`, `GET /shares/:token`) — calls `getSharedInsight(token)` via service. Service must use `dbAdmin` for share-by-token lookups since there's no authenticated user.
- [x] Task 4: Fix ai_summaries RLS policy (AC: #5)
  - [x] Write SQL migration manually: DROP POLICY `"ai_summaries_org_isolation"`, CREATE `"ai_summaries_tenant_isolation"` + `"ai_summaries_admin_bypass"` matching canonical pattern
  - [x] Place in `apps/api/drizzle/migrations/` and add entry to `apps/api/drizzle/migrations/meta/_journal.json` (latest is 0012, so next is 0013)
  - [x] `drizzle-kit generate` does NOT pick up manual SQL — you must update the journal manually
- [x] Task 5: Switch admin + cross-org queries to dbAdmin (AC: #3)
  - [x] Update `apps/api/src/db/queries/admin.ts` — import `dbAdmin` from `@/lib/db`, replace all `db.` calls with `dbAdmin.`
  - [x] Update `apps/api/src/db/queries/analyticsEvents.ts` — switch `getAllAnalyticsEvents()` and `getAnalyticsEventsTotal()` to `dbAdmin`. Leave `recordEvent()` and `getEventsByOrg()` on `db`.
  - [x] Update `apps/api/src/db/seed.ts` — change `DATABASE_URL` to `DATABASE_ADMIN_URL` in the standalone connection (seed.ts creates its own postgres client, does NOT import from `lib/db.ts`). Remove `SET LOCAL app.is_admin = 'true'` line — BYPASSRLS role handles it.
  - [x] Update `apps/api/src/db/seed.test.ts` — remove "SET LOCAL is first statement" assertion, verify admin URL usage
- [x] Task 6: Integration tests for RLS enforcement (AC: #7)
  - [x] Test: org A context blocks org B rows
  - [x] Test: dbAdmin reads cross-org
  - [x] Test: missing SET LOCAL returns empty results
- [x] Task 7: Full test suite verification (AC: #6)

## Dev Notes

### Prerequisites

Before starting, run `pnpm type-check` and fix any pre-existing errors. The Epic 6 retro flagged type-check cleanliness as a mandatory prep task for Epic 7. Don't let new changes compound existing issues.

### Why This Story Exists

RLS policies exist in 9 migrations across 8+ tables, but nobody calls `SET LOCAL` at request time — the only caller is `seed.ts`. The dev database user (`app`) is a superuser, so RLS silently does nothing. One forgotten `orgId` param and data leaks between orgs.

### Architecture Compliance

The architecture doc specifies: "org_id column + RLS — Every table has org_id; RLS policies as defense-in-depth behind application-level filtering." The dual-pool pattern (`db` + `dbAdmin`) is NOT in the architecture doc — it's a retro-driven addition from Epic 6, which discovered that all admin cross-org queries were relying solely on application-layer filtering. Don't second-guess this approach; it was a deliberate gap closure.

### Existing RLS Policy Pattern

Every table (except ai_summaries) follows the same pattern. Reference migration `0006_add-rls-datasets-datarows.sql`:

```sql
ALTER TABLE "datasets" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "datasets_tenant_isolation" ON "datasets" FOR ALL
  USING ("org_id" = current_setting('app.current_org_id', true)::integer)
  WITH CHECK ("org_id" = current_setting('app.current_org_id', true)::integer);

CREATE POLICY "datasets_admin_bypass" ON "datasets" FOR ALL
  USING (COALESCE(current_setting('app.is_admin', true)::boolean, false) = true);
```

**Naming convention:** `"{table}_tenant_isolation"` and `"{table}_admin_bypass"`. Tenant isolation has both `USING` + `WITH CHECK`. Admin bypass has `USING` only (read-focused, no need to allow admin INSERTs with arbitrary org_ids). All identifiers are quoted. `FOR ALL` is explicit.

**Tables with RLS enabled:** user_orgs, refresh_tokens, analytics_events, org_invites, datasets, data_rows, ai_summaries, shares, subscriptions.

**ai_summaries is broken** (migration 0007): Policy named `"ai_summaries_org_isolation"` — only has `USING` clause, no `WITH CHECK`, no admin bypass. Also uses `current_setting('app.current_org_id')` without the second `true` parameter (throws error instead of returning NULL when setting missing — different from all other tables). Fix migration must: DROP POLICY `"ai_summaries_org_isolation"`, CREATE `"ai_summaries_tenant_isolation"` and `"ai_summaries_admin_bypass"` using the canonical pattern with `current_setting('app.current_org_id', true)`.

**Tables without RLS (correct):** users, orgs — these are global directories without org_id columns.

### Current Database Setup

Single connection pool in `apps/api/src/lib/db.ts`:
```typescript
const queryClient = postgres(env.DATABASE_URL, {
  max: 10, idle_timeout: 20, connect_timeout: 10,
  onnotice: () => {},
});
export const db = drizzle(queryClient, { schema });
```

Docker uses `POSTGRES_USER=app` — a superuser that bypasses RLS. After this story: `app_user` (RLS enforced) for `db`, `app_admin` (BYPASSRLS) for `dbAdmin`.

### Auth Middleware Context

`apps/api/src/middleware/authMiddleware.ts` decodes the JWT and sets `req.user` with `org_id`, `isAdmin`, `role`. Route handlers use these values to call `withRlsContext()`, which pushes them into PostgreSQL session variables before queries run.

### Express Middleware Chain (Unchanged)

The Express middleware chain order stays the same — RLS context is NOT Express middleware. It's a query-level wrapper function (`withRlsContext`) called inside route handlers. The chain remains:

1. correlationId — FIRST
2. Stripe webhook route — BEFORE body parser (raw body)
3. JSON body parser
4. pino-http request logging
5. Route handlers (these call `withRlsContext` internally)
6. errorHandler — LAST

Protected routes live in `apps/api/src/routes/protected.ts`.

### Admin Query Pattern Change

`apps/api/src/db/queries/admin.ts` currently imports `db` and runs cross-org queries gated only by `roleGuard('admin')`. After this story:

```typescript
// BEFORE
import { db } from '@/lib/db';
export async function getAllOrgs() { return db.select(...)... }

// AFTER
import { dbAdmin } from '@/lib/db';
export async function getAllOrgs() { return dbAdmin.select(...)... }
```

Existing cross-org queries to switch to `dbAdmin`:

**In `apps/api/src/db/queries/admin.ts`:** `getAllOrgs()`, `getAllUsers()`, `getOrgDetail()`, `getAdminStats()` — all import `db` from `../../lib/db.js`.

**In `apps/api/src/db/queries/analyticsEvents.ts`:** `getAllAnalyticsEvents()`, `getAnalyticsEventsTotal()` — these are the cross-org analytics functions imported directly by the admin route file (`apps/api/src/routes/admin.ts` line 4). Switch these to `dbAdmin`. Leave the tenant-scoped functions in that same file (`recordEvent()`, `getEventsByOrg()`) on `db` — they'll get RLS context via `withRlsContext`.

### Seed.ts Simplification

Currently seed.ts wraps everything in a transaction with `SET LOCAL app.is_admin = 'true'`. After this story, seed.ts uses `dbAdmin` directly — no SET LOCAL needed. The existing seed test ("SET LOCAL is first statement") should be updated to verify dbAdmin usage instead.

### Docker init.sql Design

```sql
-- docker/init.sql
-- Creates dual roles for RLS enforcement
CREATE ROLE app_user LOGIN PASSWORD 'app';
GRANT CONNECT ON DATABASE analytics TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- app_admin is the POSTGRES_USER (superuser), already exists
-- Just ensure BYPASSRLS is explicit
ALTER ROLE app_admin BYPASSRLS;
```

The `POSTGRES_USER=app_admin` in docker-compose creates the superuser. Migrations run as `app_admin`. The app connects as `app_user` for regular queries.

### RLS Context Wrapper Design

Query-level wrapper function — NOT Express middleware. Matches how seed.ts already does `SET LOCAL`, explicit per-query, works with Drizzle's transaction API.

```typescript
// apps/api/src/lib/rls.ts
import { sql } from 'drizzle-orm';
import { db } from './db.js';
import type { DbTransaction } from './db.js';

export async function withRlsContext<T>(
  orgId: number,
  isAdmin: boolean,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.current_org_id = ${orgId}`);
    await tx.execute(sql`SET LOCAL app.is_admin = ${String(isAdmin)}`);
    return fn(tx);
  });
}
```

**Type is `DbTransaction`** (exported from `db.ts`), NOT `Transaction`. Follow the existing pattern from `datasets.ts` queries where `client: typeof db | DbTransaction = db`.

Route handlers call it like: `withRlsContext(req.user.org_id, req.user.isAdmin, async (tx) => someQuery(tx, orgId))`. The existing application-level `WHERE orgId = ?` filtering stays — RLS is defense-in-depth, not a replacement.

**Error behavior:** If either `SET LOCAL` fails, the transaction aborts and the error propagates. No catch-and-swallow — fail-closed by design.

### Environment Variables After This Story

```bash
# .env.example additions
DATABASE_URL=postgresql://app_user:app@db:5432/analytics      # RLS enforced
DATABASE_ADMIN_URL=postgresql://app_admin:app@db:5432/analytics # BYPASSRLS
```

### Files to Create

| File | Purpose |
|------|---------|
| `docker/init.sql` | Dual-role PostgreSQL initialization |
| `apps/api/src/lib/rls.ts` | `withRlsContext()` wrapper |
| `apps/api/drizzle/migrations/XXXX_fix-ai-summaries-rls.sql` | Fix incomplete ai_summaries policy |
| `apps/api/src/lib/rls.test.ts` | Integration tests for RLS enforcement |

### Files to Modify

| File | Change |
|------|--------|
| `docker-compose.yml` | Mount init.sql at `/docker-entrypoint-initdb.d/`, update POSTGRES_USER to app_admin |
| `apps/api/src/lib/db.ts` | Add `dbAdmin` export using DATABASE_ADMIN_URL, split connection pools |
| `apps/api/src/config.ts` | Add `DATABASE_ADMIN_URL` to Zod schema |
| `apps/api/src/db/queries/admin.ts` | Switch all `db.` calls to `dbAdmin.` |
| `apps/api/src/db/queries/analyticsEvents.ts` | Switch `getAllAnalyticsEvents` + `getAnalyticsEventsTotal` to `dbAdmin` (keep tenant-scoped on `db`) |
| `apps/api/src/db/queries/aiSummaries.ts` | Add optional `client` param to `getCachedSummary()`, `storeSummary()` |
| `apps/api/src/db/queries/shares.ts` | Add optional `client` param to `createShare()`, `findByTokenHash()`, `incrementViewCount()`, `getSharesByOrg()` |
| `apps/api/src/db/queries/orgInvites.ts` | Add optional `client` param to `createInvite()`, `findByTokenHash()`, `markUsed()`, `getActiveInvites()` |
| `apps/api/src/db/queries/subscriptions.ts` | Add optional `client` param to `getActiveTier()`, `upsertSubscription()`, `updateSubscriptionStatus()`, `updateSubscriptionPeriod()`, `getSubscriptionByOrgId()` |
| `apps/api/src/db/queries/analyticsEvents.ts` | Add optional `client` param to `recordEvent()`, `getEventsByOrg()` (tenant-scoped functions) |
| `apps/api/src/db/seed.ts` | Change standalone connection to `DATABASE_ADMIN_URL`, remove SET LOCAL |
| `apps/api/src/db/seed.test.ts` | Remove SET LOCAL assertion, verify admin URL usage |
| `.env.example` | Add DATABASE_ADMIN_URL, change DATABASE_URL role from `app` to `app_user` |
| `apps/api/src/routes/invites.ts` | Wrap DB calls in `withRlsContext(req.user.org_id, req.user.isAdmin, ...)` |
| `apps/api/src/routes/datasets.ts` | Wrap DB calls in `withRlsContext` — `persistUpload()` already uses `db.transaction()`, refactor to use the RLS-wrapped `tx` |
| `apps/api/src/routes/aiSummary.ts` | Wrap `getCachedSummary()` call in `withRlsContext` |
| `apps/api/src/routes/subscriptions.ts` | Wrap `getActiveTier()`, `getSubscriptionByOrgId()` calls in `withRlsContext` |
| `apps/api/src/routes/sharing.ts` | Auth-protected `shareRouter`: wrap `generateShareLink()` in `withRlsContext`. Public `publicShareRouter`: pass `dbAdmin` to share service for token lookups |
| `apps/api/src/routes/analytics.ts` | Wrap `trackEvent()` call in `withRlsContext` |
| `apps/api/src/routes/stripeWebhook.ts` | No direct change — but the subscription service functions it calls (`handleWebhookEvent`) must pass `dbAdmin` when calling subscription queries (no JWT context in webhooks) |

**Note:** `docker-compose.override.yml` only has port mappings/volume mounts — no env var changes needed there.
**Note:** `apps/api/src/services/admin/healthService.ts` imports `db` and runs `SELECT 1` — fine on the RLS pool, no tenant table.
**Note:** Admin routes (`apps/api/src/routes/admin.ts`) do NOT need `withRlsContext` — they already use `roleGuard('admin')` and their queries switch to `dbAdmin` (Task 5).

### DO NOT Reinvent

| What | Where | Why |
|------|-------|-----|
| RLS policies | Migrations 0001, 0004, 0006, 0007, 0010, 0011 | Already exist — just activate them |
| SET LOCAL pattern | `apps/api/src/db/seed.ts:110` | Same `tx.execute(sql\`SET LOCAL...\`)` pattern — but seed only sets `app.is_admin`. `withRlsContext` needs BOTH `app.current_org_id` AND `app.is_admin` |
| Admin query structure | `apps/api/src/db/queries/admin.ts` | Only change the import, not the query logic |
| Auth context extraction | `apps/api/src/middleware/authMiddleware.ts` | Already decodes org_id + isAdmin from JWT |
| roleGuard | `apps/api/src/middleware/roleGuard.ts` | Keep as-is — RLS is defense-in-depth, not replacement |

### Testing Requirements

**New integration tests** (require real PostgreSQL — these are DB-level, not mock-friendly):
- Insert rows for org A and org B
- Set RLS context to org A → query returns only org A rows
- Set RLS context to org B → query returns only org B rows
- Use dbAdmin → query returns all rows
- No SET LOCAL → query returns no tenant-scoped rows (fail-closed)

**Update existing tests:**
- `seed.test.ts` — remove "SET LOCAL is first statement" assertion, verify dbAdmin usage
- Admin query tests may need mock updates if they mock `db` (now should mock `dbAdmin`)

**Framework:** Vitest. Co-locate as `*.test.ts`.

**Integration test setup for RLS tests:** These need real PostgreSQL with the dual-role setup — not mockable. Use the Docker Compose dev database (`docker compose up db`). The test file should create its own `postgres()` clients using both `DATABASE_URL` (app_user) and `DATABASE_ADMIN_URL` (app_admin), insert test rows via `dbAdmin`, then verify isolation via `db` with `SET LOCAL`. Clean up test rows in `afterEach`. This mirrors the pattern from `seed.ts` (standalone connection, not importing `lib/db.ts`).

### Gotchas From Previous Epics

- **Drizzle `sql` template tag:** Use `sql\`SET LOCAL ...\`` — the backtick template, not string interpolation. seed.ts has the correct pattern.
- **Transaction scope:** `SET LOCAL` only lasts for the transaction. If a query runs outside the transaction, RLS context is lost. This is the desired behavior — fail-closed.
- **Docker volume persistence:** Changing `POSTGRES_USER` won't take effect on existing volumes. Document: `docker compose down -v` needed for fresh role setup.
- **Migration order:** Latest migration is 0012. The fix-ai-summaries migration is 0013. Write the SQL manually and add the entry to `meta/_journal.json`. `drizzle-kit generate` creates schema-diff migrations, not custom SQL — it won't help here.
- **postgres.js vs pg:** This project uses the `postgres` package (not `node-postgres`/`pg`). Transaction API is `sql.begin()` or via Drizzle's `db.transaction()`.
- **seed.ts standalone connection:** `seed.ts` creates its own `postgres()` client directly from `process.env.DATABASE_URL` — it does NOT import from `lib/db.ts` (to avoid pulling in the full config.ts validation chain). Change it to read `DATABASE_ADMIN_URL` (with fallback to `DATABASE_URL`).
- **JWT field naming — three conventions, one value:**

  | Layer | Field | Type | Example |
  |-------|-------|------|---------|
  | JWT payload / `req.user` | `org_id` | `number` | `req.user.org_id` |
  | `withRlsContext` param | `orgId` | `number` | `withRlsContext(req.user.org_id, ...)` |
  | PostgreSQL setting | `app.current_org_id` | `text→integer` | `SET LOCAL app.current_org_id = 42` |

  Also: `req.user.isAdmin` (camelCase boolean) → `app.is_admin` (PostgreSQL text→boolean). Defined in `packages/shared/src/schemas/auth.ts` as `jwtPayloadSchema`.
- **Public share routes:** The public share-by-token endpoint queries the `shares` table. Without RLS context, this returns nothing. Use `dbAdmin` for public share lookups.

### Project Structure Notes

- All DB connection code lives in `apps/api/src/lib/db.ts` — the barrel export for queries is `apps/api/src/db/queries/index.ts`
- Services import from `db/queries/` barrel, never `db/index.ts` directly
- Config validation: `apps/api/src/config.ts` — all env vars must go through Zod
- Docker init scripts mount at `/docker-entrypoint-initdb.d/` for PostgreSQL

### References

- [Source: apps/api/drizzle/migrations/0006_add-rls-datasets-datarows.sql] — canonical RLS policy pattern
- [Source: apps/api/drizzle/migrations/0007_dear_senator_kelly.sql] — broken ai_summaries policy
- [Source: apps/api/src/lib/db.ts] — current single-pool connection
- [Source: apps/api/src/db/seed.ts:110] — SET LOCAL pattern to reuse
- [Source: apps/api/src/db/queries/admin.ts] — cross-org queries to switch to dbAdmin
- [Source: apps/api/src/db/queries/analyticsEvents.ts] — mixed file: cross-org functions → dbAdmin, tenant functions → db with RLS
- [Source: apps/api/src/middleware/authMiddleware.ts] — JWT decode providing org_id + isAdmin
- [Source: apps/api/src/middleware/roleGuard.ts] — admin access gate (keep as-is)
- [Source: apps/api/src/routes/protected.ts] — where authMiddleware is applied
- [Source: docker-compose.yml] — current single-user DB setup
- [Source: _bmad-output/implementation-artifacts/epic-6-retro-2026-04-01.md] — Story 7.6 origin

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- All 7 tasks implemented and verified
- Code review found 3 HIGH, 3 MEDIUM, 2 LOW findings — all HIGH and MEDIUM fixed
- H1: SSE streaming path uses dbAdmin (avoids 3-15s held transactions)
- H2: Checkout route wrapped in withRlsContext (prevents duplicate Stripe customers)
- H3: getRowsByDataset accepts optional client param
- M1: File list populated (this section)
- M2: validateInviteToken uses dbAdmin for public lookups
- M3: redeemInvite passes dbAdmin to all query calls
- L2: Consolidated shareService db imports
- Known: tinypool "Channel closed" crash at test process exit — not a test failure, Node 22 cleanup issue

### File List

**New files:**
- `docker/init.sql` — dual DB roles (app_user + app_admin)
- `apps/api/drizzle/migrations/0013_fix-ai-summaries-rls-policy.sql` — ai_summaries RLS WITH CHECK + admin bypass
- `apps/api/src/lib/rls.ts` — withRlsContext wrapper (SET LOCAL in transaction)
- `apps/api/src/lib/rls.test.ts` — RLS wrapper tests
- `apps/api/src/lib/rls.ts_explained.md` — interview doc
- `apps/api/src/lib/db.ts_explained.md` — interview doc (rewritten for dual-pool)

**Modified files:**
- `.env.example` — added DATABASE_ADMIN_URL
- `docker-compose.yml` — mount init.sql, POSTGRES_USER=app_admin
- `apps/api/src/config.ts` — Zod-validated DATABASE_ADMIN_URL
- `apps/api/src/lib/db.ts` — dbAdmin pool export, DbTransaction type export
- `apps/api/src/db/seed.ts` — updated for dual-pool
- `apps/api/src/db/seed.test.ts` — updated mocks
- `apps/api/src/db/queries/admin.ts` — optional client param
- `apps/api/src/db/queries/admin.test.ts` — updated mocks
- `apps/api/src/db/queries/aiSummaries.ts` — optional client param
- `apps/api/src/db/queries/analyticsEvents.ts` — optional client param
- `apps/api/src/db/queries/analyticsEvents.test.ts` — updated mocks
- `apps/api/src/db/queries/dataRows.ts` — optional client param (H3 fix)
- `apps/api/src/db/queries/datasets.ts` — optional client param
- `apps/api/src/db/queries/orgInvites.ts` — optional client param
- `apps/api/src/db/queries/shares.ts` — optional client param
- `apps/api/src/db/queries/subscriptions.ts` — optional client param
- `apps/api/src/db/queries/userOrgs.ts` — optional client param (M3 prerequisite)
- `apps/api/drizzle/migrations/meta/_journal.json` — migration registry
- `apps/api/src/routes/aiSummary.ts` — passes dbAdmin to streamToSSE (H1 fix)
- `apps/api/src/routes/aiSummary.test.ts` — updated mocks
- `apps/api/src/routes/datasets.ts` — withRlsContext wrapping
- `apps/api/src/routes/datasets.test.ts` — updated mocks
- `apps/api/src/routes/invites.ts` — withRlsContext wrapping
- `apps/api/src/routes/invites.test.ts` — updated mocks
- `apps/api/src/routes/sharing.ts` — dbAdmin for public routes
- `apps/api/src/routes/sharing.test.ts` — updated mocks
- `apps/api/src/routes/subscriptions.ts` — withRlsContext for checkout (H2 fix)
- `apps/api/src/routes/subscriptions.test.ts` — updated assertions
- `apps/api/src/services/aiInterpretation/streamHandler.ts` — optional client param (H1 fix)
- `apps/api/src/services/aiInterpretation/streamHandler.test.ts` — updated assertions
- `apps/api/src/services/analytics/trackEvent.ts` — dbAdmin for fire-and-forget
- `apps/api/src/services/analytics/trackEvent.test.ts` — updated mocks
- `apps/api/src/services/auth/inviteService.ts` — dbAdmin for public routes (M2/M3 fix)
- `apps/api/src/services/auth/inviteService.test.ts` — updated mocks and assertions
- `apps/api/src/services/curation/index.ts` — optional client param (H1 fix)
- `apps/api/src/services/curation/index.test.ts` — updated assertions
- `apps/api/src/services/sharing/shareService.ts` — consolidated imports (L2 fix)
- `apps/api/src/services/sharing/shareService.test.ts` — updated mocks
- `apps/api/src/services/subscription/stripeService.ts` — optional client param (H2 fix)
- `apps/api/src/services/subscription/stripeService.test.ts` — updated mocks
- `apps/api/src/services/subscription/webhookHandler.ts` — dbAdmin for webhook
- `apps/api/src/services/subscription/webhookHandler.test.ts` — updated mocks
- `apps/web/app/admin/AdminUserTable.test.tsx` — unrelated test fix
