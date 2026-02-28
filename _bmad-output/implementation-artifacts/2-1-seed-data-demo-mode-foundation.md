# Story 2.1: Seed Data & Demo Mode Foundation

Status: done

## Story

As a **first-time visitor**,
I want to see a populated dashboard with sample business data immediately,
So that I can understand the product's value before uploading my own data.

## Acceptance Criteria

1. **Given** the application starts with a fresh database **When** the seed script runs (via Docker entrypoint) **Then** a seed `datasets` record is created with `is_seed_data: true` **And** seed `data_rows` are inserted with realistic small-business financial data including deliberate anomalies (seasonal spike, category drop, unusual ratio) that will produce 2+ actionable AI insights when the curation pipeline processes them (see Story 3.1; anomalies validated via seed snapshot in Story 7.2)

2. **Given** an authenticated user's org has no datasets **When** the demo mode state machine evaluates **Then** `getDemoModeState(orgId)` returns `empty` **And** the dashboard falls back to the seed-demo org. **Given** an authenticated user's org has ≥1 dataset **When** the demo mode state machine evaluates **Then** `getDemoModeState(orgId)` returns `user_only` **And** the dashboard shows user data. The full 4-state enum (`seed_only`, `seed_plus_user`, `user_only`, `empty`) is implemented for architecture compatibility, but user orgs only hit `empty` or `user_only` under Option C.

3. **Given** the database schema needs data tables **When** migrations run **Then** `datasets` table is created (with `org_id`, `is_seed_data` boolean, metadata) **And** `data_rows` table is created (with `category`, `parent_category`, `metadata` jsonb, `source_type` enum) **And** normalized schema supports hierarchical categories

4. **Given** the dashboard is never empty (NFR19) **When** any user visits the dashboard **Then** seed data is always available as a fallback (note: AI summary card deferred to Story 3.2 — dashboard shows seed charts but no AI interpretation until then)

5. **Given** the `datasets` and `data_rows` tables are created **When** database security is configured **Then** RLS policies are applied to both tables scoped by `org_id`

## Tasks / Subtasks

- [x] Task 1: Verify Docker compose-up end-to-end (Epic 1 tech debt) (AC: #4)
  - [x] 1.1 Run `docker compose up` and verify all 4 services start (web, api, db, redis). **Pass criteria:** all 4 containers reach "healthy" or "running" state within 60s. **Fail criteria:** any container exits with non-zero code, or healthcheck fails after 3 retries.
  - [x] 1.2 Verify `GET http://localhost:3001/health` returns 200 with `{ status: "ok" }`
  - [x] 1.3 If failures: document the issue, attempt to fix, re-verify. If blocked by Docker Desktop/networking (same as Epic 1), document the blocker and proceed — do not gate the entire story on Docker.

- [x] Task 2: Add `source_type` enum + `datasets` table to schema (AC: #3)
  - [x] 2.1 Add `sourceTypeEnum` pgEnum to `schema.ts`: `csv`, `quickbooks`, `xero`, `stripe`, `plaid`
  - [x] 2.2 Add `datasets` table: id, org_id, name (varchar 255), source_type, is_seed_data (boolean default false), uploaded_by (nullable user_id FK), created_at
  - [x] 2.3 Add `datasetsRelations` — one org, one uploaded_by user, many data_rows

- [x] Task 3: Add `data_rows` table to schema (AC: #3)
  - [x] 3.1 Add `data_rows` table: id, org_id (FK orgs), dataset_id (FK datasets cascade), source_type, category (varchar 255), parent_category (varchar 255 nullable), date (pg `date` type, not timestamp — no timezone ambiguity for financial calendar dates), amount (numeric(12,2)), label (varchar 255 nullable), metadata (jsonb nullable), created_at
  - [x] 3.x Add `numeric` and `date` to schema.ts pg-core imports (currently missing)
  - [x] 3.2 Add indexes: `idx_data_rows_org_id_date` (compound), `idx_data_rows_dataset_id`, `idx_data_rows_category`
  - [x] 3.3 Add `dataRowsRelations` — one dataset, one org
  - [x] 3.4 Update existing `orgsRelations` and `usersRelations` to include datasets

- [x] Task 4: Generate Drizzle migration (AC: #3)
  - [x] 4.1 Run `pnpm --filter api db:generate` with dummy `DATABASE_URL`
  - [x] 4.2 Verify generated SQL creates both tables with correct columns and indexes
  - [x] 4.3 Verify `_journal.json` has a new entry (idx: 5)

- [x] Task 5: Add RLS policies for `datasets` and `data_rows` (AC: #5)
  - [x] 5.1 Create custom migration `0006_add-rls-datasets-datarows.sql`
  - [x] 5.2 Follow pattern from `0001_add-rls-policies.sql`: tenant isolation + admin bypass for both tables
  - [x] 5.3 Add manual `_journal.json` entry for custom migration (idx: 6)
  - [x] 5.4 **Checklist:** Verify migration journal entry exists (retro action item)

- [x] Task 6: Create dataset query functions (AC: #1, #2, #4)
  - [x] 6.1 Create `apps/api/src/db/queries/datasets.ts` — `createDataset`, `getDatasetsByOrg`, `getDemoModeState`, `getSeedDataset`
  - [x] 6.2 `getDemoModeState` returns `DemoModeState` — for user orgs, effectively `empty` or `user_only` (see Option C in dev notes)
  - [x] 6.3 Add `getSeedOrgId()` and `resetSeedOrgCache()` to **`queries/orgs.ts`** (not datasets.ts — it's an org lookup). `getSeedOrgId()` calls `findOrgBySlug(SEED_ORG.slug)`, caches the ID in a module-level variable, throws if seed org absent. `resetSeedOrgCache()` clears the cached value — needed for tests that truncate tables between runs.
  - [x] 6.4 All query functions except `getSeedOrgId` require `orgId` parameter
  - [x] 6.5 Export from `apps/api/src/db/queries/index.ts` barrel

- [x] Task 7: Create data rows query functions (AC: #1)
  - [x] 7.1 Create `apps/api/src/db/queries/dataRows.ts` — `insertBatch`, `getByDateRange`, `getByCategory`, `getRowsByDataset`
  - [x] 7.2 All query functions require `orgId` parameter
  - [x] 7.3 `getByDateRange` and `getByCategory` accept optional `datasetIds` filter — caller decides which datasets to include (demo mode logic stays in service layer, not here)
  - [x] 7.4 Export from `apps/api/src/db/queries/index.ts` barrel

- [x] Task 8: Create shared schemas for datasets (AC: #3)
  - [x] 8.1 Create `packages/shared/src/schemas/datasets.ts` — `sourceTypeSchema`, `datasetSchema`, `dataRowSchema`, `demoModeStateSchema`
  - [x] 8.2 Export types from `packages/shared/src/types/index.ts`
  - [x] 8.3 Re-export from `packages/shared/src/schemas/index.ts`
  - [x] 8.4 Rebuild shared: `pnpm --filter shared build`

- [x] Task 9: Create seed data script (AC: #1, #4)
  - [x] 9.1 Create `apps/api/src/db/seed.ts` — **own DB connection** (same pattern as `migrate.ts`). Cannot import `lib/db.ts` because it imports `config.ts`, which Zod-validates ALL env vars (CLAUDE_API_KEY, STRIPE_SECRET_KEY, etc.) and crashes when they're absent. Seed script reads `process.env.DATABASE_URL` directly and creates a standalone `drizzle()` instance with the schema import. Same exception comment as migrate.ts.
  - [x] 9.2 Design 12 months of realistic small-business financial data (revenue, expenses, payroll, marketing, rent, supplies)
  - [x] 9.3 Include deliberate anomalies: (a) seasonal revenue spike in December, (b) marketing spend drop in Q3, (c) unusual payroll-to-revenue ratio in one month
  - [x] 9.4 Seed into a dedicated org identified by slug (`seed-demo`) — created if absent via upsert (`ON CONFLICT (slug) DO NOTHING`), looked up by slug on subsequent runs. Upsert prevents race condition if two containers start simultaneously. Anonymous dashboard queries find seed data via this slug, not a hardcoded org_id.
  - [x] 9.5 Idempotent: look up org by slug, check if seed dataset exists before inserting — skip gracefully if already seeded
  - [x] 9.6 RLS bypass: all seed inserts run inside a **single transaction** that begins with `SET LOCAL app.is_admin = 'true'`. `SET LOCAL` scopes the admin flag to the transaction only. The transaction wrapper also provides connection affinity — `SET LOCAL` and subsequent inserts must share the same DB connection. Seed script uses raw Drizzle `db.insert()` calls directly (not query module functions from `db/queries/`) because: (a) query functions import `lib/db.ts` which triggers `config.ts` validation, (b) the seed script's standalone db instance can't be injected into query functions without an optional tx parameter on every function. Direct Drizzle calls inside the seed script's own transaction are simpler and correct.
  - [x] 9.7 All seed data `amount` values must be **strings** (e.g., `'12500.00'`, not `12500`). Drizzle's `numeric` type maps to PostgreSQL `NUMERIC` which requires string input — passing numbers silently truncates or errors.
  - [x] 9.8 Log seed actions via console (not Pino — same reasoning as migrate.ts: Pino is app-level, seed runs before Express boots)

- [x] Task 10: Update Docker entrypoint to run seed (AC: #1)
  - [x] 10.1 Add seed script execution after migrations in `entrypoint.sh`: `echo "Running seed..." && npx tsx src/db/seed.ts` (same tsx runner as migrate.ts). Place after the migration line and before the server start line.
  - [x] 10.2 Ensure seed script handles the case where DB is already seeded (idempotent — logs "already seeded" and exits 0)

- [x] Task 11: Add demo mode constants to shared package (AC: #2)
  - [x] 11.1 Add `DEMO_MODE_STATES` constant to `packages/shared/src/constants/index.ts`
  - [x] 11.2 Add `SEED_ORG` constant (`{ slug: 'seed-demo', name: 'Sunrise Cafe' }`) for seed data org identification
  - [x] 11.3 Rebuild shared: `pnpm --filter shared build`

- [x] Task 12: Write tests (AC: #1, #2, #3, #5)
  - [x] 12.0 Add `vitest` as devDependency to `packages/shared` + create `vitest.config.ts` (Epic 1 retro tech debt #2 — `pnpm test` fails at root without this)
  - [x] 12.1 Unit tests for `getDemoModeState` — test `empty` and `user_only` states (the two states user orgs hit under Option C)
  - [x] 12.2 Unit tests for `getSeedOrgId` + `resetSeedOrgCache` in `orgs.test.ts` — cache behavior, cache reset, throws when absent
  - [x] 12.3 Unit tests for `getSeedDataset` — returns seed dataset when present, null when absent
  - [x] 12.4 Unit tests for `createDataset` — verify org_id and is_seed_data are set
  - [x] 12.5 Unit tests for `insertBatch` — verify bulk insertion
  - [x] 12.6 Unit tests for seed script — verify idempotency, verify RLS bypass (`SET LOCAL app.is_admin`), verify 72 rows generated, verify amounts are strings, verify anomaly data points present
  - [x] 12.7 Schema validation tests for shared dataset schemas (in `packages/shared/` — now possible with vitest added)

- [x] Task 13: Generate `_explained.md` docs for new files

- [x] Task 14: Verify lint + type-check pass
  - [x] 14.1 `pnpm turbo lint`
  - [x] 14.2 `pnpm turbo type-check`
  - [x] 14.3 `pnpm test`

- [x] Task 15: Update sprint status

## Dev Notes

### What Already Exists (from Epic 1 — Stories 1.1-1.6)

**DO NOT recreate or modify these (unless adding to them):**

- `apps/api/src/db/schema.ts` — 6 tables defined (users, orgs, user_orgs, refresh_tokens, org_invites, analytics_events). **Add datasets + data_rows here.**
- `apps/api/src/db/queries/index.ts` — barrel exports 6 query modules. **Add datasetsQueries + dataRowsQueries exports.**
- `apps/api/src/lib/logger.ts` — Pino logger, ready to use
- `apps/api/src/lib/db.ts` — Drizzle db instance. **WARNING:** imports `config.ts` which validates ALL env vars. Seed script and migrate.ts cannot use this — they create their own connections.
- `apps/api/src/lib/appError.ts` — AppError hierarchy (ValidationError, NotFoundError, etc.)
- `apps/api/src/config.ts` — Zod-validated env config (never use `process.env` in app code). **Exception:** `seed.ts` and `migrate.ts` read `process.env.DATABASE_URL` directly because config.ts requires CLAUDE_API_KEY, STRIPE_SECRET_KEY, etc. which aren't available in the migration/seed context.
- `apps/api/src/db/migrate.ts` — Migration runner
- `apps/api/entrypoint.sh` — Docker entrypoint (runs migrate.ts, then starts server). **Add seed.ts call here.**
- `packages/shared/src/constants/index.ts` — has ANALYTICS_EVENTS, ROLES, AUTH, INVITES. **Add DEMO_MODE_STATES + SEED constants here.**
- `packages/shared/src/schemas/auth.ts` — Zod schemas for auth. **Create datasets.ts alongside this.**
- `packages/shared/src/schemas/index.ts` — Re-exports auth schemas. **Add datasets exports.**
- `packages/shared/src/types/index.ts` — Re-exports auth types. **Add dataset types.**
- `turbo.json` — Turborepo pipeline, tasks with `dependsOn: ["^build"]`
- `.github/workflows/ci.yml` — lint + typecheck CI pipeline

### Critical Architecture Constraints

1. **Integer IDs, not UUIDs** — Every table uses `integer().primaryKey().generatedAlwaysAsIdentity()`. Follow this pattern for datasets and data_rows.

2. **org_id on every tenant table** — Both datasets and data_rows need org_id as a required foreign key. data_rows also needs dataset_id.

3. **Query modules require orgId** — Every exported query function takes `orgId` as a parameter. No exceptions. This is the application-level org scoping that complements RLS.

4. **Services import from `db/queries/` barrel** — Never import `db/index.ts` directly. The seed script is the one exception — it creates its own DB connection and uses raw Drizzle calls (see constraints 17–18). All other code must use the query barrel.

5. **ESM `.js` extensions required** — All local imports in the API app need `.js` suffix (e.g., `import { db } from '../../lib/db.js'`).

6. **Pino logging convention** — Object first, message second: `logger.info({ orgId, datasetName }, 'Seed dataset created')`.

7. **No `process.env` in app code** — All env access through `config.ts`. **Exception:** `seed.ts` and `migrate.ts` read `process.env.DATABASE_URL` directly (see constraint 17).

8. **pnpm@10.30.2** — Specified in root `packageManager` field.

9. **Custom Drizzle migrations need manual `_journal.json` entries** — The RLS migration is custom SQL (not auto-generated). Must manually add an entry to `_journal.json` after creating the file. The `tag` field must exactly match the filename minus the `.sql` extension (e.g., file `0006_add-rls-datasets-datarows.sql` → tag `0006_add-rls-datasets-datarows`). Mismatched tags cause the migration runner to skip the file silently. **This is a retro action item — double-check before marking done.**

10. **`numeric(12,2)` for money, `date` for calendar dates** — The `amount` column uses `numeric` with precision (returns strings from Drizzle — parse in service code, not query layer). The `date` column uses PostgreSQL's `date` type (`date('date', { mode: 'date' })`) — not `timestamp`. Financial data is calendar-based (Jan 15 is Jan 15 everywhere), so timezone-aware timestamps add complexity with no benefit. Drizzle's `date()` with `mode: 'date'` returns JS `Date` objects set to midnight UTC.

11. **`source_type` enum at two levels** — The enum appears on both `datasets` (collection-level) and `data_rows` (row-level). This is intentional — a dataset might be CSV, but future Growth-tier features could merge rows from multiple sources into one view.

12. **Seed data residency — hybrid global + transparent fallback (Option C).** Seed data lives in ONE place: a dedicated org with slug `seed-demo` (name "Sunrise Cafe"). No per-org copies. Two consumption paths:
    - **Anonymous visitors:** No JWT → `findOrgBySlug('seed-demo')` → read seed data directly.
    - **Authenticated users with empty org:** JWT gives `orgId` → `getDemoModeState(orgId)` returns `empty` → dashboard/service falls back to seed-demo org data transparently.
    - FR11 "replaces seed data" means the dashboard *switches what it reads* (user org instead of seed-demo org) — not a database deletion.
    - Never hardcode an org_id — auto-increment IDs depend on insertion order. Always look up by slug.
    - The seed-demo org has no `user_orgs` membership (no owner). This is intentional — it's a system resource, not a real org. Downstream code that queries org members must handle this edge case or simply never query the seed org for membership.

13. **`getDemoModeState` is a view-layer helper, not a state machine over seed rows.** For user orgs, it returns `user_only` or `empty` — there's no seed data IN user orgs to detect. The 4-state architecture values (`seed_only`, `seed_plus_user`, `user_only`, `empty`) collapse to two effective states for user orgs: `empty` (show seed-demo fallback) and `user_only` (show user data). `seed_only` and `seed_plus_user` only apply to the seed-demo org itself (and are largely academic). Expose the function as returning the full `DemoModeState` enum for compatibility, but document that user orgs will only ever return `empty` or `user_only`.

14. **Anonymous dashboard data path needs `getSeedOrgId()`.** The seed script creates the org; the dashboard needs to find it. Add `getSeedOrgId()` to `queries/orgs.ts` (not datasets.ts — it's an org lookup alongside `findOrgBySlug`). It calls `findOrgBySlug(SEED_ORG.slug)` and returns the org's integer ID. Cache the result in-process (the seed org ID never changes at runtime). Export a `resetSeedOrgCache()` for tests that truncate tables between runs.

15. **Compound index on `(org_id, date)` won't help `date_trunc()` queries.** The `idx_data_rows_org_id_date` B-tree index serves equality + range queries (`WHERE org_id = X AND date BETWEEN Y AND Z`). If Story 2.7 (filters) uses `date_trunc('month', date)` in a WHERE clause, the function call bypasses the index. Fine for seed data (72 rows), but document for Story 2.7 — may need a functional index or pre-aggregation for larger user datasets.

16. **RLS bypass in seed script.** The seed script runs via Docker entrypoint — outside Express middleware that sets `app.current_org_id`. RLS tenant isolation policies evaluate `org_id = current_setting('app.current_org_id', true)::integer`, which returns NULL when the setting isn't set → all inserts blocked. Fix: execute `SET LOCAL app.is_admin = 'true'` inside a transaction before any inserts. This triggers the admin bypass policy. `SET LOCAL` scopes the setting to the current transaction only — no leakage.

17. **Seed script creates its own DB connection.** Same pattern as `migrate.ts` — reads `process.env.DATABASE_URL` directly, creates a standalone `drizzle()` instance with the schema import. Cannot use `lib/db.ts` because it imports `config.ts`, which Zod-validates ALL env vars (CLAUDE_API_KEY, STRIPE_SECRET_KEY, etc.) and crashes in Docker when only DATABASE_URL is available. Uses `console.log`/`console.error` for output (not Pino — same reasoning as migrate.ts).

18. **Seed script uses raw Drizzle calls, not query functions.** The query functions in `db/queries/*.ts` import `lib/db.ts` → `config.ts` → crash. The seed script uses its own drizzle instance directly (`db.insert(orgs).values(...)`, `db.insert(datasets).values(...)`, etc.) inside its transaction. This is the only acceptable place to bypass the query barrel.

### Database Schema Details

**`datasets` table:**
```typescript
export const datasets = pgTable(
  'datasets',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    name: varchar({ length: 255 }).notNull(),
    sourceType: sourceTypeEnum('source_type').default('csv').notNull(),
    isSeedData: boolean('is_seed_data').default(false).notNull(),
    uploadedBy: integer('uploaded_by')
      .references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_datasets_org_id').on(table.orgId),
  ],
);
```

**`data_rows` table:**
```typescript
export const dataRows = pgTable(
  'data_rows',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    orgId: integer('org_id')
      .notNull()
      .references(() => orgs.id, { onDelete: 'cascade' }),
    datasetId: integer('dataset_id')
      .notNull()
      .references(() => datasets.id, { onDelete: 'cascade' }),
    sourceType: sourceTypeEnum('source_type').default('csv').notNull(),
    category: varchar({ length: 255 }).notNull(),
    parentCategory: varchar('parent_category', { length: 255 }),
    date: date('date', { mode: 'date' }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    label: varchar({ length: 255 }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_data_rows_org_id_date').on(table.orgId, table.date),
    index('idx_data_rows_dataset_id').on(table.datasetId),
    index('idx_data_rows_category').on(table.category),
  ],
);
```

**`source_type` enum:**
```typescript
export const sourceTypeEnum = pgEnum('source_type', ['csv', 'quickbooks', 'xero', 'stripe', 'plaid']);
```

### Demo Mode State Machine (Option C — Hybrid)

```typescript
type DemoModeState = 'seed_only' | 'seed_plus_user' | 'user_only' | 'empty';
```

The enum retains all 4 values for compatibility with the architecture spec. In practice under Option C:

**For user orgs** (the common case):
| Effective state | Condition | Dashboard behavior |
|----------------|-----------|-------------------|
| `empty` | Org has zero datasets | Falls back to seed-demo org data. Banner: "You're viewing sample data — upload your own to get started" |
| `user_only` | Org has ≥1 dataset (all `is_seed_data = false`) | Shows user data. No banner. |

`seed_only` and `seed_plus_user` are technically possible only for the seed-demo org itself (which always has seed data and never gets user uploads). They exist in the enum but user orgs will never hit them.

**Detection logic** (in `getDemoModeState`):
```typescript
// For a given orgId:
// 1. Check if org has ANY datasets with is_seed_data = false
// 2. If yes → 'user_only'
// 3. If no → 'empty' (caller decides whether to fall back to seed-demo org)
```

**`getSeedOrgId()` helper** — bridges anonymous/empty-org paths to seed data:
```typescript
// Looks up the seed-demo org by slug, caches the ID in-process
// Returns the orgId for the seed-demo org
// Throws if seed org doesn't exist (seed script hasn't run)
```

**Dashboard consumption flow:**
1. Anonymous → no JWT → `getSeedOrgId()` → fetch data from seed org
2. Authenticated → JWT `orgId` → `getDemoModeState(orgId)`
   - `empty` → `getSeedOrgId()` → fetch data from seed org, show banner
   - `user_only` → fetch data from user's org, no banner

### RLS Migration Pattern

Follow exact pattern from `0001_add-rls-policies.sql`:

```sql
ALTER TABLE "datasets" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "datasets_tenant_isolation" ON "datasets"
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true)::integer)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::integer);

CREATE POLICY "datasets_admin_bypass" ON "datasets"
  FOR ALL
  USING (COALESCE(current_setting('app.is_admin', true)::boolean, false) = true);

ALTER TABLE "data_rows" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_rows_tenant_isolation" ON "data_rows"
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true)::integer)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::integer);

CREATE POLICY "data_rows_admin_bypass" ON "data_rows"
  FOR ALL
  USING (COALESCE(current_setting('app.is_admin', true)::boolean, false) = true);
```

### Deferred: Seed AI Summary Pre-Generation

The architecture (line 215) specifies that the seed script "pre-generates AI summary stored in `ai_summaries` table (zero LLM calls for anonymous visitors)." This story does NOT create the `ai_summaries` table or pre-generate summaries — that belongs to Story 3.2 (Curation Pipeline — Prompt Assembly & LLM Integration). Until Story 3.2 is complete, the anonymous dashboard will show seed charts but no AI summary card. The seed script created here will be **extended** in Story 3.2 to call the curation pipeline and store the seed AI summary.

### Seed Data Design

12 months of data (Jan–Dec 2025) for a fictional coffee shop ("Sunrise Cafe"). Categories:

| Category | Monthly Range | Anomaly |
|----------|---------------|---------|
| Revenue | $12,000–$18,000 | December spike to $28,000 (holiday season) |
| Payroll | $5,500–$6,500 | October: $9,200 (unusual ratio to revenue) |
| Marketing | $800–$1,200 | Q3 drop: Jul/Aug/Sep at $200–$300 |
| Rent | $3,000 (flat) | None |
| Supplies | $1,500–$2,500 | Tracks revenue roughly |
| Utilities | $400–$600 | Winter months higher |

These anomalies produce insight-worthy patterns:
- Seasonal revenue spike → "December revenue grew 65% over average — holiday traffic drove this"
- Marketing spend drop → "Marketing spend fell 75% in Q3 — correlates with flattening revenue in Q4?"
- Payroll anomaly → "October payroll-to-revenue ratio hit 55% vs. typical 38% — investigate hiring or overtime"

### Shared Schema Pattern

**File:** `packages/shared/src/schemas/datasets.ts`

```typescript
import { z } from 'zod';

export const sourceTypeSchema = z.enum(['csv', 'quickbooks', 'xero', 'stripe', 'plaid']);

export const demoModeStateSchema = z.enum(['seed_only', 'seed_plus_user', 'user_only', 'empty']);

export const datasetSchema = z.object({
  id: z.number().int(),
  orgId: z.number().int(),
  name: z.string().min(1).max(255),
  sourceType: sourceTypeSchema,
  isSeedData: z.boolean(),
  uploadedBy: z.number().int().nullable(),
  createdAt: z.coerce.date(),
});

export const dataRowSchema = z.object({
  id: z.number().int(),
  orgId: z.number().int(),
  datasetId: z.number().int(),
  sourceType: sourceTypeSchema,
  category: z.string().min(1).max(255),
  parentCategory: z.string().max(255).nullable(),
  date: z.coerce.date(), // pg date type → JS Date (midnight UTC)
  amount: z.string(), // numeric(12,2) returns string from Drizzle — parse in service layer
  label: z.string().max(255).nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.coerce.date(),
});
```

### Query Functions Pattern

**datasets.ts** — Follow `orgInvites.ts` import pattern:
```typescript
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { datasets, dataRows } from '../schema.js';
```

Four functions in `datasets.ts`:
1. `createDataset(orgId, data)` — INSERT returning
2. `getDatasetsByOrg(orgId)` — SELECT all datasets for org, ordered by created_at desc
3. `getDemoModeState(orgId)` — Returns `DemoModeState` (`empty` or `user_only` for user orgs)
4. `getSeedDataset(orgId)` — Returns the seed dataset if it exists (for replacement logic in Story 2.5)

Two functions added to `queries/orgs.ts`:
5. `getSeedOrgId()` — Calls `findOrgBySlug(SEED_ORG.slug)`, caches result in module-level variable. Returns org ID. Throws if seed org absent.
6. `resetSeedOrgCache()` — Clears the cached seed org ID. Called in tests between runs that truncate tables.

**dataRows.ts** — Pure data access. No demo mode logic here — the service layer decides which dataset IDs to query based on `getDemoModeState()`.
1. `insertBatch(orgId, datasetId, rows)` — Bulk INSERT of data_rows
2. `getByDateRange(orgId, startDate, endDate, datasetIds?)` — SELECT with date filter, optional dataset ID filter (caller passes the right IDs)
3. `getByCategory(orgId, category, datasetIds?)` — SELECT filtered by category, optional dataset ID filter
4. `getRowsByDataset(orgId, datasetId)` — SELECT all rows for a specific dataset

### Testing Strategy

**Unit tests for query functions (mock db):**
- `getDemoModeState` — 2 tests: `empty` (no datasets) and `user_only` (has datasets). The other two enum values (`seed_only`, `seed_plus_user`) are architectural completeness — user orgs never hit them under Option C.
- `getSeedDataset` — verify returns seed dataset when present, null when absent
- `createDataset` — verify org_id and is_seed_data are set
- `insertBatch` — verify batch insertion calls db.insert with correct values

**Unit tests for seed script:**
- Mock the standalone drizzle instance (seed.ts creates its own connection, doesn't use query functions)
- Verify happy path: org absent → upsert org → create dataset → insert 72 rows inside transaction → log success
- Verify idempotency: org exists, seed dataset exists → skip, log "already seeded"
- Verify RLS bypass: `SET LOCAL app.is_admin = 'true'` executed as first statement in transaction
- Verify correct number of rows generated (12 months * 6 categories = 72 rows)
- Verify anomaly data points are present (December revenue, Q3 marketing, October payroll)
- Verify all amount values are strings (no numeric literals)

**Unit tests for `getSeedOrgId` + `resetSeedOrgCache` (in queries/orgs.test.ts):**
- Returns org ID when seed org exists
- Returns cached ID on second call (mock `findOrgBySlug` called only once)
- `resetSeedOrgCache()` clears cache — next call hits DB again
- Throws when seed org doesn't exist

### File Placement

```
apps/api/src/db/
├── schema.ts                                 # MODIFY — add sourceTypeEnum, datasets, data_rows
├── queries/
│   ├── orgs.ts                               # MODIFY — add getSeedOrgId, resetSeedOrgCache
│   ├── datasets.ts                           # NEW — createDataset, getDatasetsByOrg, getDemoModeState, getSeedDataset
│   ├── dataRows.ts                           # NEW — insertBatch, getByDateRange, getByCategory, getRowsByDataset
│   └── index.ts                              # MODIFY — add datasetsQueries + dataRowsQueries exports
├── seed.ts                                   # NEW — standalone seed script (own DB connection, not lib/db.ts)

apps/api/drizzle/migrations/
├── 0005_*.sql                                # NEW — auto-generated schema migration (datasets + data_rows + source_type enum)
├── 0006_add-rls-datasets-datarows.sql        # NEW — custom RLS migration

apps/api/entrypoint.sh                        # MODIFY — add seed.ts execution after migrations

packages/shared/src/
├── schemas/
│   ├── datasets.ts                           # NEW — sourceTypeSchema, datasetSchema, dataRowSchema, demoModeStateSchema
│   └── index.ts                              # MODIFY — add datasets exports
├── types/
│   └── index.ts                              # MODIFY — add Dataset, DataRow, SourceType, DemoModeState types
├── constants/
│   └── index.ts                              # MODIFY — add DEMO_MODE_STATES, SEED_ORG constants

Tests:
├── apps/api/src/db/queries/orgs.test.ts      # NEW — getSeedOrgId + resetSeedOrgCache tests
├── apps/api/src/db/queries/datasets.test.ts  # NEW
├── apps/api/src/db/queries/dataRows.test.ts  # NEW
├── apps/api/src/db/seed.test.ts              # NEW
```

### Previous Story Intelligence

From Epic 1 (Stories 1.1–1.6):

- **ESM `.js` extensions** — All API local imports need `.js` suffix. This bites every new file.
- **Stale `packages/shared/dist/`** — After modifying shared package files, always run `pnpm --filter shared build`. Forgetting causes phantom import errors in apps/web and apps/api.
- **Drizzle migration generation** — `pnpm --filter api db:generate` needs `DATABASE_URL` env var even for offline schema generation. Pass `DATABASE_URL=postgres://x@x/x pnpm --filter api db:generate`.
- **Custom SQL migrations** — Placed manually, need manual `_journal.json` entry. The migration runner (`migrate.ts`) reads the journal to determine which migrations to run. Missing entries = silently skipped migrations. **Code review caught this in Story 1.6 — mandatory checklist item.**
- **`vi.mock` pattern** — Mock at module level, import after. Use the pattern from Story 1.6:
  ```typescript
  vi.mock('../../db/queries/datasets.js', () => ({
    createDataset: vi.fn(),
    getDemoModeState: vi.fn(),
  }));
  ```
- **`createTestApp()` helper** — exists at `apps/api/src/test/helpers/testApp.ts` for route testing. Not needed for this story (no routes), but will be needed in Story 2.2.
- **Integer IDs everywhere** — Don't accidentally use UUIDs. The architecture mentions UUIDs in some places but the codebase uses integer auto-increment.
- **Docker compose-up never verified** — This is Task 1. The Epic 1 retro flagged this as tech debt folded into Story 2.1.
- **Drizzle `numeric()` returns strings** — When reading `amount` from data_rows, the value comes back as a string. Parse with `parseFloat()` or `Number()` in service code, not in the query layer.

### Deferred: API Route for Seed Data

This story creates the data layer (tables, queries, seed script) but no Express route or Next.js API route to serve seed data to the frontend. That belongs to Story 2.6 (Interactive Dashboard Charts), which will create the `GET /datasets` route and dashboard RSC that calls `getSeedOrgId()` for anonymous/empty-org visitors. The query functions built here are designed to be consumed by that story.

### Recommended Task Execution Order

Task numbering doesn't imply strict ordering. Dependencies require this sequence:
1. **Tasks 2–3** (schema tables) → **Task 4** (migration) → **Task 5** (RLS)
2. **Tasks 8, 11** (shared schemas + constants) → rebuild shared
3. **Tasks 6–7** (query functions — import shared types)
4. **Task 9** (seed script — standalone, uses raw Drizzle) → **Task 10** (entrypoint)
5. **Task 12** (tests) → **Task 14** (lint/type-check/test)
6. **Tasks 1, 13, 15** (Docker verification, docs, sprint status — can slot in anywhere)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Database Schema]
- [Source: _bmad-output/planning-artifacts/architecture.md#Demo Mode State Machine]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Ingestion]
- [Source: _bmad-output/planning-artifacts/architecture.md#Curation Pipeline Architecture]
- [Source: _bmad-output/implementation-artifacts/epic-1-retro-2026-02-26.md#Action Items]
- [Source: apps/api/src/db/schema.ts — existing table definition pattern]
- [Source: apps/api/drizzle/migrations/0001_add-rls-policies.sql — RLS pattern]
- [Source: apps/api/src/db/queries/orgInvites.ts — query function pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Drizzle migration generation required dummy DATABASE_URL — used `DATABASE_URL=postgres://x@x/x pnpm --filter api db:generate`
- Custom RLS migration needed manual `_journal.json` entry (idx: 6) — verified present
- Shared package rebuild required after adding dataset schemas/constants

### Completion Notes List

- All 15 task groups implemented (Tasks 1-15)
- Docker compose-up verification (Task 1) documented — Epic 1 tech debt item addressed
- Schema: `sourceTypeEnum` pgEnum + `datasets` + `data_rows` tables added to `schema.ts`
- Drizzle migration `0005_*.sql` auto-generated for schema changes
- Custom RLS migration `0006_add-rls-datasets-datarows.sql` created with tenant isolation + admin bypass
- Query functions: 4 in `datasets.ts`, 4 in `dataRows.ts`, 2 added to `orgs.ts` (`getSeedOrgId`, `resetSeedOrgCache`)
- Seed script (`seed.ts`): standalone DB connection, 72 rows (12 months x 6 categories), idempotent, RLS bypass via `SET LOCAL app.is_admin = 'true'`
- Shared package: `sourceTypeSchema`, `demoModeStateSchema`, `datasetSchema`, `dataRowSchema` + `DEMO_MODE_STATES`, `SEED_ORG` constants
- Demo mode: 4-state enum implemented, user orgs effectively hit `empty` or `user_only` under Option C
- All amounts stored as strings per Drizzle numeric(12,2) convention
- `entrypoint.sh` updated to run seed after migrations
- Vitest added to `packages/shared` (Epic 1 retro tech debt #2)

### File List

**New files:**
- `apps/api/src/db/queries/datasets.ts` — createDataset, getDatasetsByOrg, getDemoModeState, getSeedDataset
- `apps/api/src/db/queries/dataRows.ts` — insertBatch, getByDateRange, getByCategory, getRowsByDataset
- `apps/api/src/db/seed.ts` — standalone seed script with own DB connection
- `apps/api/drizzle/migrations/0005_*.sql` — datasets + data_rows schema migration
- `apps/api/drizzle/migrations/0006_add-rls-datasets-datarows.sql` — RLS policies
- `packages/shared/src/schemas/datasets.ts` — Zod schemas for dataset types
- `packages/shared/src/types/datasets.ts` — TypeScript types inferred from schemas
- Test files for queries and seed script

**Modified files:**
- `apps/api/src/db/schema.ts` — added sourceTypeEnum, datasets, data_rows tables + relations
- `apps/api/src/db/queries/orgs.ts` — added getSeedOrgId, resetSeedOrgCache
- `apps/api/src/db/queries/index.ts` — added dataset + dataRow query exports
- `apps/api/entrypoint.sh` — added seed.ts execution
- `packages/shared/src/constants/index.ts` — added DEMO_MODE_STATES, SEED_ORG
- `packages/shared/src/schemas/index.ts` — added dataset schema exports
- `packages/shared/src/types/index.ts` — added dataset type exports
