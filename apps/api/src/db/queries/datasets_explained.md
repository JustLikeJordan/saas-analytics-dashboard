# datasets.ts — Interview-Ready Documentation

## Elevator Pitch

Query functions for the `datasets` table that handle CRUD operations and the demo mode state machine. The key function is `getUserOrgDemoState()`, which determines whether a *user* org sees its own data or falls back to the seed demo org. The `UserOrg` prefix is intentional — it signals this function only handles user orgs (2 of 4 states), not the seed-demo org. Under Option C (our architecture), user orgs only ever hit two states: `empty` (no data uploaded yet → show seed data) or `user_only` (has data → show user data).

## Why This Approach

**`getUserOrgDemoState` returns a 4-state enum but only 2 states matter for user orgs.** The architecture defines `seed_only`, `seed_plus_user`, `user_only`, and `empty`. We expose the full enum type for forward compatibility, but the detection logic is simple: does this org have any non-seed dataset? If yes → `user_only`. If no → `empty`. The caller (dashboard service layer) decides what to do with the result — this function doesn't fetch seed data itself.

**Detection uses `isSeedData = false` check, not counting rows.** A single `findFirst` query looking for any user-uploaded dataset is faster than `COUNT(*)` and gives us the same binary answer. If even one non-seed dataset exists, the org has its own data.

## Code Walkthrough

**`createDataset(orgId, data, client?)`** — Inserts a dataset and returns the created row. `orgId` is always required (tenant isolation). `isSeedData` defaults to `false` in the schema but can be overridden by the seed script. The optional `client` parameter accepts either the global `db` connection or a `DbTransaction` handle — both expose the same `.insert()` interface, so the function doesn't need to know which it got. The default `= db` means existing callers don't break. When a caller needs atomicity (e.g., creating a dataset and inserting rows together), it passes its transaction handle: `createDataset(orgId, data, tx)`.

**`getDatasetsByOrg(orgId)`** — Returns all datasets for an org, newest first. Used by the dashboard to list uploaded files and by the demo mode logic to determine available data sources.

**`getUserOrgDemoState(orgId)`** — The demo mode state machine. Queries for a single non-seed dataset. If found, the org has its own data (`user_only`). If not, the org is empty and the dashboard should fall back to seed data (`empty`). The other two enum values (`seed_only`, `seed_plus_user`) only apply to the seed-demo org itself.

**`getSeedDataset(orgId)`** — Finds the seed dataset for an org. Used by Story 2.5 (CSV upload) to determine if seed data should be replaced when the user uploads their own data. Returns `undefined` if no seed dataset exists.

## Complexity & Trade-offs

**`getUserOrgDemoState` is O(1)** — `findFirst` with a simple equality check on indexed columns. No aggregation, no joins.

**What you'd say in an interview:** "The function returns a typed enum rather than a boolean so that future features (like mixed seed + user data) don't require a signature change. But in practice, user orgs only hit two of the four states — the others are architectural placeholders."

## Patterns Worth Knowing

- **Transaction propagation via optional parameter** — `createDataset` accepts an optional `client` so callers control transaction boundaries. The function stays simple; the caller decides the scope. This is the standard "unit of work" pattern without framework magic.
- **Default parameter = backward-compatible change** — `client = db` means zero callers break when this parameter is added. Callers that need a transaction opt in explicitly.
- **State machine as a query result** — instead of storing state explicitly, we derive it from the data. No extra column to keep in sync, no state transitions to manage.
- **Barrel-imported query modules** — all functions are consumed via `import { datasetsQueries } from '../db/queries/index.js'`, keeping the import path consistent across the codebase.
- **`orgId` on every function** — application-level tenant isolation that mirrors the RLS policies at the database level. Defense in depth.

## Interview Questions

**Q: Why derive demo mode state from data instead of storing it?**
A: Derived state can't go stale. If you stored "demo_mode = empty" as a column, you'd need to update it every time a dataset is created or deleted. The query approach always reflects the current truth.

**Q: What happens if the user deletes all their datasets?**
A: `getUserOrgDemoState` would return `empty` again, and the dashboard would fall back to seed data. The transition is automatic — no manual state management.

**Q: Why does `getSeedDataset` exist separately from `getUserOrgDemoState`?**
A: Different consumers, different data needs. `getUserOrgDemoState` answers "should I show seed or user data?" (binary decision). `getSeedDataset` returns the actual dataset record, needed by CSV upload (Story 2.5) to implement the "replace seed data" flow.

## Data Structures

**DemoModeState enum:**
```typescript
type DemoModeState = 'seed_only' | 'seed_plus_user' | 'user_only' | 'empty';
// User orgs: only 'empty' or 'user_only'
// Seed-demo org: 'seed_only' (always has seed data, never gets user uploads)
```

## Impress the Interviewer

The 4-state enum with 2 active states is a pragmatic design decision. You could argue it's YAGNI (You Aren't Gonna Need It) for the two unused states, but the cost is a single `z.enum()` declaration — zero runtime overhead. If the product ever supports mixed seed + user data (the `seed_plus_user` state), the type system already handles it. It's the kind of forward-compatible design that costs nothing today but saves a breaking change later.
