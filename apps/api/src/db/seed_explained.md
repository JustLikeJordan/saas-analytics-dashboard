# seed.ts — Interview-Ready Documentation

## Elevator Pitch

The seed script populates a "Sunrise Cafe" demo org with 72 rows of realistic financial data so that first-time visitors see a live dashboard immediately. It runs as a standalone process during Docker startup — before Express boots — and bypasses Row Level Security using a transaction-scoped admin flag. Second runs are idempotent: if the seed org already has data, it logs a message and exits.

## Why This Approach

**Standalone DB connection instead of reusing `lib/db.ts`:** The main database module imports `config.ts`, which Zod-validates every environment variable (CLAUDE_API_KEY, STRIPE_SECRET_KEY, etc.). During Docker startup, only `DATABASE_URL` exists. Rather than weakening the Zod schema with `.optional()` for a single consumer, both `seed.ts` and `migrate.ts` create lightweight `postgres()` + `drizzle()` instances directly. The trade-off is some duplicated connection setup, but it keeps the main config validation strict.

**Raw Drizzle calls instead of query barrel functions:** The query functions in `db/queries/*.ts` import `lib/db.ts`, which pulls in `config.ts` — same crash problem. The seed script uses its own drizzle instance and calls `db.insert()` directly within a transaction. This is the only place in the codebase where bypassing the query barrel is acceptable.

**`ON CONFLICT DO NOTHING` upsert for the org:** If two Docker containers start simultaneously, both might try to create the seed org. `INSERT ... ON CONFLICT (slug) DO NOTHING` prevents duplicate-key errors without requiring advisory locks. If the upsert returns nothing (org already existed), a follow-up query fetches the existing ID.

**`SET LOCAL app.is_admin = 'true'`:** RLS policies evaluate `current_setting('app.current_org_id')`, which is NULL when no Express middleware has set it. All inserts would fail. `SET LOCAL` scopes the admin bypass to the current transaction only — no leakage to subsequent queries on the same connection.

## Code Walkthrough

**`buildSeedRows(orgId, datasetId)`** — Generates 72 data rows (12 months × 6 categories). Three anomalies are baked in: a December revenue spike ($28k vs $12-18k baseline), a Q3 marketing drop ($200-300 vs $800-1200), and an October payroll anomaly ($9.2k vs $5.5-6.5k). These give the AI curation pipeline (Story 3.1) something worth interpreting when it processes the data later. The `lerp()` helper does linear interpolation across months so values aren't all identical.

**`seed()` main function** — Everything happens inside a single transaction:
1. **RLS bypass:** `SET LOCAL app.is_admin = 'true'` — must come first because the `datasets` table has RLS policies. Without this, the idempotency check wouldn't see existing seed data.
2. **Idempotency check:** Look up the seed org by slug. If it exists and already has a seed dataset (`isSeedData: true`), bail out. This means restarting Docker doesn't re-seed.
3. **Org upsert + dataset creation + bulk row insert.** A partial failure rolls back everything — no orphaned data.

**Amount values are strings:** Drizzle's `numeric` type maps to PostgreSQL `NUMERIC`, which expects string input. Passing JavaScript numbers silently truncates decimals or causes type errors. Every amount value here is a quoted string like `'12000.00'`.

## Complexity & Trade-offs

**Time complexity:** O(n) where n = number of seed rows (72). Single bulk INSERT, single transaction — runs in under 100ms.

**What you'd say in an interview:** "The seed script trades some code duplication (its own DB connection) for strict separation of concerns. The main config module validates all env vars at boot — we don't want to weaken that validation just so a pre-boot script can reuse the same client."

**Alternative considered:** Injecting an optional `tx` parameter into every query function so the seed script could pass its own transaction. This would pollute every query function's signature for a single consumer. Direct Drizzle calls inside the seed script are simpler.

## Patterns Worth Knowing

- **Standalone script with own DB connection** — common in migration runners, seed scripts, and CLI tools that run outside the application lifecycle
- **`SET LOCAL` for session variables** — PostgreSQL session variables scoped to a transaction; used for RLS bypass in administrative scripts
- **`ON CONFLICT DO NOTHING` + follow-up SELECT** — idempotent upsert pattern that handles race conditions without advisory locks
- **Idempotency check inside the RLS-bypassed transaction** — a subtle but critical ordering: if you check "does seed data exist?" before bypassing RLS, the query sees nothing (RLS blocks it) and you re-seed every time
- **String amounts for PostgreSQL NUMERIC** — a Drizzle-specific gotcha where the ORM returns/accepts strings for decimal types

## Interview Questions

**Q: Why not just seed the database in a migration?**
A: Migrations are for schema changes — they run once and are tracked in a journal. Seed data is operational: it should be idempotent (re-runnable), and you might want to update seed data without creating a new migration.

**Q: What happens if the seed script crashes halfway through?**
A: Everything is in a single transaction. If any INSERT fails, PostgreSQL rolls back all changes — no partial seed data in the database.

**Q: Why bypass RLS instead of setting the correct org_id?**
A: The seed script creates the org inside the same transaction. RLS evaluates `current_setting('app.current_org_id')` which isn't set yet (no Express middleware running). The admin bypass policy is the correct escape hatch for administrative operations.

## Data Structures

**Seed row shape** (what goes into `data_rows`):
```typescript
{
  orgId: number,
  datasetId: number,
  sourceType: 'csv',
  category: string,        // 'Revenue', 'Payroll', 'Marketing', 'Rent', 'Supplies', 'Utilities'
  parentCategory: string,  // 'Income' or 'Expenses'
  date: Date,              // mid-month (15th) — Date.UTC(2025, monthIndex, 15)
  amount: string,          // numeric(12,2) — always a string like '12000.00'
  label: null,             // unused in seed data
}
```

## Impress the Interviewer

The `lerp` function is a nice detail worth mentioning. Rather than hardcoding 72 individual amounts or using random numbers, linear interpolation across months creates realistic-looking trends. Revenue grows from $12k to $18k over the year (seasonal growth pattern), then the December spike breaks the trend at $28k. This makes the seed data useful for testing anomaly detection in the curation pipeline — the AI has genuine patterns to interpret, not random noise.

The idempotency design handles a subtle Docker edge case: if `docker compose` starts two API replicas simultaneously, both might try to seed. The `ON CONFLICT DO NOTHING` on the org insert + the "already seeded" check means the second replica sees the first's data and skips gracefully. No distributed locks, no coordination — just idempotent operations.

A previous version of this code had a bug worth knowing: the idempotency check ran *outside* the transaction, before the RLS bypass. Since `datasets` has row-level security that checks `current_setting('app.current_org_id')`, and no org_id was set, the query always returned zero rows — meaning the seed ran every time. Moving the check inside the transaction (after `SET LOCAL app.is_admin = 'true'`) fixed it. Good example of why RLS can bite you in administrative scripts if you're not careful about evaluation order.
