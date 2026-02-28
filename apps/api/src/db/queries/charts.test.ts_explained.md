# charts.test.ts — Interview-Ready Documentation

## Elevator Pitch

Unit tests for `getChartData`, the function that turns raw `data_rows` into two chart-ready structures: a monthly revenue trend and a category-level expense breakdown. The tests mock the Drizzle `findMany` call and verify that the aggregation logic — month bucketing, category summing, sort order, and rounding — all behave correctly without touching a database.

## Why This Approach

**Mock at the DB layer, test aggregation logic in isolation.** `getChartData` does two things: fetch rows and crunch numbers. The fetch is Drizzle boilerplate — there's no value in testing it against a real database in a unit test. The aggregation logic (month extraction, two separate `Map` accumulators, sorting, rounding) is where bugs hide. Mocking `db.query.dataRows.findMany` lets us feed controlled inputs and assert specific outputs.

**How to say it in an interview:** "We mock the data layer boundary so the test is fast and deterministic. The aggregation logic is pure computation once the rows are loaded — feeding specific row shapes lets us test edge cases like zero amounts and floating-point rounding without database setup."

**`new Date(year, month, day)` instead of date strings.** ISO date strings like `'2025-03-01'` get parsed as UTC midnight. In a negative-offset timezone (US, most of the Americas), `getMonth()` on that date returns February because the local time is still the previous day. Using the `new Date(2025, 2, 15)` constructor creates a local-timezone date, so `getMonth()` always returns the month you intended.

## Code Walkthrough

**`row()` helper** — Factory function that stamps `orgId: 1` onto every row and spreads caller-supplied fields. Keeps each test case's data compact — you only specify what matters for that test.

**"aggregates income rows into monthly revenue"** — Two January rows plus one February row. The test verifies that same-month amounts get summed, different months produce separate entries, and the output is chronologically sorted (Jan before Feb).

**"aggregates expense rows by category sorted descending"** — Two Rent rows and one Payroll row. Verifies category accumulation across multiple rows and descending sort by total. Payroll ($800) should come before Rent ($500).

**"returns empty arrays for no data"** — Edge case: `findMany` returns `[]`. Both output arrays should be empty, not undefined or null.

**"handles rows with zero amounts"** — `parseFloat('0.00')` is `0`, which is falsy but still a valid number. Verifies the aggregation doesn't skip zero-amount rows or treat them as missing.

**"separates income and expense rows correctly"** — Mixed parentCategory values in one month. Income rows go to `revenueTrend`, expense rows go to `expenseBreakdown`. Neither leaks into the other's output.

**"rounds amounts to 2 decimal places"** — Three `33.33` income rows should sum to `99.99`. Two `10.005` expense rows test the `Math.round(x * 100) / 100` rounding — `20.01` not `20.009999...`.

## Complexity & Trade-offs

Each test is O(1) — we're feeding a fixed small array and checking the output. The mock approach means we can't catch Drizzle query builder bugs (wrong `eq()`, wrong `orderBy`), but that's what integration tests are for.

The timezone fix (`new Date(year, month, day)`) makes these tests portable across CI environments running in different timezones. The tradeoff is that you have to remember the 0-indexed month convention — `new Date(2025, 2, 15)` is March 15, not February 15.

## Patterns Worth Knowing

- **Top-level `vi.mock` + dynamic `await import()`** — Vitest needs mocks registered before the module loads. The `vi.mock()` call is hoisted to the top of the file by Vitest's transform. The `await import('./charts.js')` then gets the version with the mocked dependency.
- **Row factory functions** — A lightweight alternative to full fixture files. When each test needs slightly different data, a factory with spread overrides is more readable than importing from a shared fixture.
- **Local-timezone Date constructor** — `new Date(year, month, day)` creates a date in the runtime's local timezone. `new Date('YYYY-MM-DD')` creates a UTC date. When the code under test uses `date.getMonth()` (which reads local timezone), you need local-timezone dates in your test data.

## Interview Questions

**Q: Why not use `new Date('2025-03-15')` instead of `new Date(2025, 2, 15)`?**
A: `new Date('2025-03-15')` is parsed as UTC midnight. The code under test calls `row.date.getMonth()`, which returns the month in the local timezone. In a UTC-5 timezone, UTC midnight March 1st is 7 PM February 28th — so `getMonth()` returns 1 (February), not 2 (March). Using the multi-argument constructor creates the date in local time, making `getMonth()` return the month you see in the constructor call.

**Q: Why mock `db.query.dataRows.findMany` specifically rather than the whole `db` object?**
A: The module under test accesses `db.query.dataRows.findMany` — that's the exact path it traverses. The mock needs to provide this nested structure or the import will fail. We don't mock `db.insert` or `db.select` because `getChartData` doesn't use them.

**Q: How does `Math.round(x * 100) / 100` handle floating-point edge cases?**
A: It works for the common cases we care about — financial data with 2-3 decimal places. There are known edge cases where `x * 100` itself has floating-point drift (e.g., `1.005 * 100 = 100.49999...`), but for our use case where amounts come from a `numeric(12,2)` column and are stored as strings, the parsed values are accurate enough that multiply-round-divide produces correct 2-decimal results.

## Data Structures

**Mock row shape:**
```typescript
{
  orgId: number,
  date: Date,
  amount: string,          // parseFloat'd by the function under test
  category: string,        // used as the expense breakdown key
  parentCategory: string,  // 'Income' or 'Expenses' — determines which bucket
}
```

**Output shape:**
```typescript
{
  revenueTrend: { month: string, revenue: number }[],       // chronological
  expenseBreakdown: { category: string, total: number }[],  // descending by total
}
```

## Impress the Interviewer

The timezone bug that these tests avoid is a real-world CI breaker. Your local machine might run in UTC (Docker, CI runners) or UTC-5 (dev laptop). Tests using ISO date strings pass locally but fail in CI or vice versa, depending on timezone config. The `new Date(year, month, day)` constructor sidesteps this by always creating dates relative to the runtime's timezone — `getMonth()` returns what you wrote. This is a subtle correctness detail that shows you understand how JavaScript's Date API actually works under the hood, not just the happy path.
