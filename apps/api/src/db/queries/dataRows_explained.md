# dataRows.ts — Interview-Ready Documentation

## Elevator Pitch

Query functions for the `data_rows` table — bulk insertion and flexible reads with optional dataset filtering. These functions are pure data access: they don't know about demo mode, seed data, or which datasets to include. The service layer above decides which `datasetIds` to pass based on the user's demo mode state.

## Why This Approach

**Optional `datasetIds` filter instead of embedding demo mode logic.** Each query function accepts an optional array of dataset IDs. The caller (service layer) determines the right dataset IDs based on `getDemoModeState()` — if the user's org is `empty`, the service passes the seed-demo org's dataset IDs; if `user_only`, it passes the user's own. This keeps the query layer ignorant of business rules and makes each function independently testable.

**Batch insert for seed data and CSV uploads.** `insertBatch` takes an array of rows and does a single bulk INSERT. For 72 seed rows, this is one query instead of 72 — a 72x reduction in database round-trips.

## Code Walkthrough

**`insertBatch(orgId, datasetId, rows)`** — Maps each input row onto the full column set (adding `orgId` and `datasetId`), then does a single Drizzle `insert().values().returning()`. Returns early with an empty array if no rows are provided — no unnecessary DB call.

**`getByDateRange(orgId, startDate, endDate, datasetIds?)`** — Uses Drizzle's `between()` operator for the date range. Conditionally adds an `inArray(datasetId, ...)` filter if dataset IDs are provided. Results are ordered by date ascending for charting.

**`getByCategory(orgId, category, datasetIds?)`** — Same pattern as `getByDateRange` but filters by category name. Both functions build a conditions array dynamically and spread it into `and()`.

**`getRowsByDataset(orgId, datasetId)`** — Returns all rows for a specific dataset. Used by the dataset detail view and the CSV export feature.

## Complexity & Trade-offs

**`insertBatch` is O(n)** where n = number of rows. Single bulk INSERT, single round-trip. PostgreSQL handles batches of thousands of rows efficiently.

**Date filtering uses the `(org_id, date)` compound index.** The `idx_data_rows_org_id_date` B-tree index serves both equality on `org_id` and range on `date` in a single index scan. Worth noting: if future features use `date_trunc('month', date)` in WHERE clauses, the function call bypasses this index — you'd need a functional index.

## Patterns Worth Knowing

- **Dynamic condition building** — push conditions into an array, spread into `and()`. Avoids nested ternaries or multiple query variants.
- **Optional filters via `inArray`** — Drizzle's `inArray()` handles the SQL `IN (...)` clause. When `datasetIds` is undefined, the condition is simply not added.
- **Data access layer separation** — query functions return raw database results. Parsing `amount` strings to numbers, aggregating by category, or calculating trends happens in the service layer.

## Interview Questions

**Q: Why not filter by demo mode state directly in the query?**
A: Separation of concerns. The query layer doesn't know what demo mode is — it just filters by `orgId` and optionally by `datasetIds`. The service layer decides which datasets are relevant. This means you can reuse `getByDateRange` for any purpose (reports, exports, admin views) without coupling it to demo mode logic.

**Q: What's the risk with the `between()` date filter?**
A: PostgreSQL's `BETWEEN` is inclusive on both ends. If you pass `startDate = 2025-01-01` and `endDate = 2025-01-31`, you get all of January including the 31st. This is correct for calendar-based financial data. The risk would be with timestamps where `BETWEEN` might miss the last day — but we use the `date` type (no time component), so this isn't an issue.

**Q: Why return `rows` from `insertBatch` instead of just a count?**
A: The caller might need the generated IDs (for logging, response payloads, or follow-up operations). Returning the inserted rows costs almost nothing with PostgreSQL's `RETURNING` clause — it's not a second query.

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
