# formatters.ts — Explained

## 1. Elevator Pitch

This file holds the pure formatting and trend-computation functions that every chart component in the dashboard relies on. It converts raw numbers into human-readable currency strings and percentage badges, and it computes period-over-period trends from time-series data. Because these are pure functions with zero side effects, they're trivially testable and highly reusable.

## 2. Why This Approach

**Singleton `Intl.NumberFormat` instead of per-call construction.** Creating an `Intl.NumberFormat` object is expensive — the browser has to resolve locale data, parse options, and build internal formatter state. If you called `new Intl.NumberFormat(...)` inside `formatCurrency` every time a tooltip rendered, you'd pay that cost on every hover event. By declaring `currencyFull` once at module scope (line 1), every call to `formatCurrency` and `formatAbbreviated` reuses the same instance. This is the singleton pattern applied to an expensive resource.

**Pure functions over a formatter class.** A class with methods would work, but there's no shared mutable state here. Plain exports are simpler, tree-shake better, and don't force consumers to instantiate anything.

**Separated trend functions per data shape.** `computeTrend` works on `{ revenue: number }[]` (time-series, last two points), while `computeExpenseTrend` works on `{ total: number }[]` (category breakdown, top two by value). They look similar, but the sorting logic in `computeExpenseTrend` is fundamentally different from the index-based access in `computeTrend`. Merging them into a generic function would obscure that difference.

## 3. Code Walkthrough

**Lines 1-9: `currencyFull` and `formatCurrency`.** The singleton formatter is configured for USD with no decimal places — small business owners reading "$12,450" don't need cents. `formatCurrency` is just a thin wrapper so consumers import a function, not a raw `Intl.NumberFormat` instance.

*What's happening:* Module-level singleton avoids repeated object construction.
*How to say it:* "We hoist the Intl.NumberFormat to module scope so it's constructed once, then shared across all calls — same idea as a database connection pool but for locale formatting."

**Lines 11-20: `formatAbbreviated`.** This is the Y-axis tick formatter. It uses threshold-based abbreviation: values >= 1M get an "M" suffix, >= 1K get "K", and anything smaller falls through to the full formatter. The `Math.abs` / sign extraction handles negative values without duplicating the threshold logic.

*What's happening:* Tiered abbreviation with sign preservation.
*How to say it:* "It's a simple magnitude check with extracted sign — O(1) branching, no string parsing."

**Lines 22-25: `formatPercent`.** Prefixes positive values with "+" for trend badges. `Math.round` avoids noisy decimals like "+14.28571%".

**Lines 27-35: `computeTrend`.** Takes a time-ordered array, grabs the last two points, and returns percentage change. Returns `null` when there aren't enough data points — this lets the UI decide what to render (the `TrendBadge` component hides itself on null). The `prev === 0` guard prevents division by zero.

**Lines 37-46: `computeExpenseTrend`.** Different from `computeTrend` because expense data is category-based, not time-ordered. It sorts by `total` descending, then compares the top two categories. The spread operator on line 40 (`[...data].sort(...)`) avoids mutating the input array.

*What's happening:* Non-destructive sort to find top-two categories.
*How to say it:* "We copy before sorting to preserve referential integrity of the original data — the component might re-render with the same array reference."

## 4. Complexity & Trade-offs

Everything here is O(1) or O(n log n) at worst.

- `formatCurrency`, `formatAbbreviated`, `formatPercent`: O(1) per call.
- `computeTrend`: O(1) — just array index access.
- `computeExpenseTrend`: O(n log n) because of the sort. For the 5-10 expense categories this dashboard shows, that's irrelevant. If it ever handled thousands of categories, you'd swap to a two-pass linear scan for the top-two values.

**Trade-off:** `computeExpenseTrend` allocates a new array every call via the spread-sort. That's intentional — purity over micro-optimization. The alternative (mutating in place) saves one allocation but creates a class of bugs where component re-renders see stale sorted data.

## 5. Patterns Worth Knowing

- **Module-level singleton** — constructing `Intl.NumberFormat` once at import time. This pattern works for any expensive-to-create, stateless, thread-safe object. In an interview, compare it to object pooling.
- **Null as "not enough data" signal** — `computeTrend` returns `number | null`, pushing the "what to render" decision to the UI layer. This keeps the formatter logic free of rendering concerns.
- **Non-destructive sort** — `[...data].sort()` instead of `data.sort()`. A staple of functional programming in JS. The original array is never touched.

## 6. Interview Questions

**Q: Why not create the `Intl.NumberFormat` inside `formatCurrency`?**
A: `Intl.NumberFormat` construction parses locale data and builds internal state — it's the expensive part. The `.format()` call itself is cheap. Moving the constructor to module scope means you pay the cost once at import time, not on every tooltip hover or axis tick render. This is essentially the singleton pattern applied to an immutable resource.

**Q: What happens if `computeTrend` receives an empty array or a single-element array?**
A: It returns `null` on line 28. The early return guard `data.length < 2` covers both cases. The calling component (`TrendBadge`) treats `null` as "nothing to display," so the badge hides itself. No crash, no NaN, no misleading "0% change."

**Q: Why does `computeExpenseTrend` sort instead of just comparing the last two elements?**
A: Expense data is category-based (Marketing, Payroll, Rent, etc.), not time-ordered. There's no meaningful "last two" — you want the top two by value. The sort finds them. It's different from `computeTrend`, which operates on time-ordered revenue data where index position has meaning.

**Q: Could you make `computeTrend` and `computeExpenseTrend` generic?**
A: You could accept a key-extractor function — something like `computeTrend(data, item => item.revenue)`. But the two functions have genuinely different algorithms (index-based vs. sort-based), so a generic version would need a strategy parameter too. At that point the abstraction costs more clarity than it saves duplication. Two small focused functions are easier to understand and maintain.

## 7. Data Structures

**Input to `computeTrend`:** `{ revenue: number }[]` — time-ordered monthly revenue points. The function only cares about the last two elements, so the full array shape doesn't matter much.

**Input to `computeExpenseTrend`:** `{ total: number }[]` — category expense items. Order doesn't matter because the function sorts internally.

**All return types are primitives** — `string` for formatters, `number | null` for trend computations. No custom data structures. This keeps the API surface minimal and composable.

## 8. Impress the Interviewer

- **"Intl.NumberFormat is one of the most-misused browser APIs."** Most codebases create a new instance every render. Mention that the spec explicitly says these objects are designed for reuse, and that V8 caches some locale data but still pays constructor overhead. The singleton pattern here isn't premature optimization — it's using the API as intended.

- **"Returning null instead of 0 or a default string is a deliberate API design choice."** Zero percent change and "not enough data to compute a trend" are semantically different. Collapsing them into the same value (0) would make the UI lie. `null` forces the consumer to handle the distinction, which is the right pressure.

- **"The spread-sort idiom is about referential stability in React."** If you mutate the original array, React's shallow comparison might miss the change (same reference, different order). Or worse, a parent component's memoized value becomes stale. Copying before sorting is a one-line insurance policy against an entire category of rendering bugs.
