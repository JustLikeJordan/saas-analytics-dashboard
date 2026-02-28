# dataRows.ts — Interview-Ready Documentation

## Elevator Pitch

Query functions for the `data_rows` table — chunked bulk insertion and flexible reads with optional dataset filtering. These functions are pure data access: they don't know about demo mode, seed data, or which datasets to include. The service layer above decides which `datasetIds` to pass based on the user's demo mode state.

`insertBatch` chunks large payloads to stay within PostgreSQL's wire protocol limits and accepts an optional transaction client — so callers control whether the insert happens inside a larger atomic operation.

## Why This Approach

**Optional `datasetIds` filter instead of embedding demo mode logic.** Each query function accepts an optional array of dataset IDs. The caller (service layer) determines the right dataset IDs based on `getDemoModeState()` — if the user's org is `empty`, the service passes the seed-demo org's dataset IDs; if `user_only`, it passes the user's own. This keeps the query layer ignorant of business rules and makes each function independently testable.

**Chunked inserts to avoid PostgreSQL's 65,535-parameter limit.** PostgreSQL's wire protocol encodes the number of bind parameters as a 16-bit unsigned integer — max value 65,535. A CSV upload with 50,000 rows and 8 columns per row would need 400,000 parameters in a single INSERT. That crashes the connection before the query even reaches the planner. Chunking at 1,000 rows keeps each batch at ~8,000 parameters, well clear of the ceiling.

**How to say it in an interview:** "PostgreSQL's wire protocol caps bind parameters at 65,535 — a 16-bit limit baked into the protocol, not a server config. A 50k-row CSV with 8 columns would need 400k parameters. We chunk at 1,000 rows to stay safely under the limit while minimizing round-trips."

**Transaction-aware via an optional `client` parameter.** `insertBatch` defaults to the singleton `db` instance, but any caller can pass a Drizzle transaction object instead. This lets the route layer wrap a multi-step operation (create dataset + insert rows) in a single transaction without `insertBatch` needing to know it's inside one.

## Code Walkthrough

**`BATCH_SIZE = 1_000`** — Module-level constant. The `1_000` uses TypeScript's numeric separator for readability. You'd tune this down if your column count grows (more parameters per row = smaller safe batch).

**`insertBatch(orgId, datasetId, rows, client?)`** — Returns early if `rows` is empty. Then loops in steps of `BATCH_SIZE`, slicing a chunk on each iteration. Each chunk gets mapped to full column objects (adding `orgId` and `datasetId`), then inserted via `client.insert()`. No `.returning()` — returns `void`. The caller doesn't need inserted row IDs.

**How to say it in an interview:** "We chunk using a stride-based loop — `i` starts at 0, increments by `BATCH_SIZE`, and `slice(i, i + BATCH_SIZE)` gives us the window. The last chunk handles itself naturally because `slice` never throws when `end` exceeds array length."

**`client: typeof db | DbTransaction = db`** — The union type means "either the global database connection or an active transaction object." Both expose the same `.insert()` API. The default `= db` means most callers never pass this argument.

**`getByDateRange(orgId, startDate, endDate, datasetIds?)`** — Uses Drizzle's `between()` operator for the date range. Conditionally adds an `inArray(datasetId, ...)` filter if dataset IDs are provided. Results are ordered by date ascending for charting.

**`getByCategory(orgId, category, datasetIds?)`** — Same pattern as `getByDateRange` but filters by category name. Both functions build a conditions array dynamically and spread it into `and()`.

**`getRowsByDataset(orgId, datasetId)`** — Returns all rows for a specific dataset. Used by the dataset detail view and the CSV export feature.

## Complexity & Trade-offs

**`insertBatch` is O(n)** where n = number of rows, split across `ceil(n / 1000)` database round-trips. For 72 seed rows that's one round-trip. For 50,000 CSV rows it's 50 round-trips — still fast on a local connection.

**Date filtering uses the `(org_id, date)` compound index.** The `idx_data_rows_org_id_date` B-tree index serves both equality on `org_id` and range on `date` in a single index scan. Worth noting: if future features use `date_trunc('month', date)` in WHERE clauses, the function call bypasses this index — you'd need a functional index.

## Patterns Worth Knowing

- **Transaction propagation via optional parameter** — instead of a DI container or middleware, the caller passes its transaction handle down. Drizzle's `db` and `DbTransaction` share the same query interface, so the receiving function needs no branching logic.
- **Default parameter = safe default** — `client = db` follows the "open by default" convention. New call sites that need a transaction opt in explicitly; existing call sites don't change.
- **Dynamic condition building** — push conditions into an array, spread into `and()`. Avoids nested ternaries or multiple query variants.
- **Optional filters via `inArray`** — Drizzle's `inArray()` handles the SQL `IN (...)` clause. When `datasetIds` is undefined, the condition is simply not added.
- **Data access layer separation** — query functions return raw database results. Parsing `amount` strings to numbers, aggregating by category, or calculating trends happens in the service layer.

## Interview Questions

**Q: Why not filter by demo mode state directly in the query?**
A: Separation of concerns. The query layer doesn't know what demo mode is — it just filters by `orgId` and optionally by `datasetIds`. The service layer decides which datasets are relevant. This means you can reuse `getByDateRange` for any purpose (reports, exports, admin views) without coupling it to demo mode logic.

**Q: What's the risk with the `between()` date filter?**
A: PostgreSQL's `BETWEEN` is inclusive on both ends. If you pass `startDate = 2025-01-01` and `endDate = 2025-01-31`, you get all of January including the 31st. This is correct for calendar-based financial data. The risk would be with timestamps where `BETWEEN` might miss the last day — but we use the `date` type (no time component), so this isn't an issue.

**Q: Why does PostgreSQL care about the number of parameters?**
A: The wire protocol (v3) encodes parameter count as a 16-bit unsigned integer — max 65,535. This isn't a server config limit; it's baked into the protocol format. A single INSERT with 50k rows and 8 columns needs 400k parameter slots, which overflows that field. The connection throws before the query reaches the planner.

**Q: How does `client: typeof db | DbTransaction = db` enable transactions?**
A: Both `db` and a Drizzle transaction object implement the same interface — `insert`, `query`, `select`. `insertBatch` just calls `client.insert()` and doesn't care which one it has. The caller wraps the whole operation in `db.transaction(async (tx) => { await insertBatch(..., tx); })` and everything inside sees the same transaction. If any step throws, Drizzle rolls back.

## Data Structures

**Insert row shape:**
```typescript
{
  category: string,             // 'Revenue', 'Payroll', etc.
  date: Date,                   // pg date type → midnight UTC
  amount: string,               // '12000.00' — numeric(12,2) requires strings
  parentCategory?: string,      // 'Income', 'Expenses'
  label?: string,               // optional row label
  metadata?: Record<string, unknown>,  // flexible JSON storage
}
```

## Impress the Interviewer

The dynamic condition pattern (`conditions.push()` + `and(...conditions)`) is clean but has a subtle correctness guarantee: Drizzle's `and()` with a single element returns that element (not `AND(x)` which some ORMs produce). With zero elements, `and()` returns `undefined`, which Drizzle treats as "no WHERE clause" — you'd get all rows for the org. The `orgId` condition is always present as the first element, so the array is never empty.
