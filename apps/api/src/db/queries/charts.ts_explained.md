# charts.ts — Interview-Ready Documentation

> Source file: `apps/api/src/db/queries/charts.ts` (97 lines)

---

## 1. 30-Second Elevator Pitch

This file turns raw database rows into chart-ready data. It runs a single query against `data_rows` for a given org (capped at 2,000 rows by default), then does all the filtering and aggregation in JavaScript — grouping revenue by month, totaling expenses by category, and collecting metadata like available categories and date range. The metadata always reflects the full dataset within that window (so filter dropdowns show all options), while the chart data respects whatever date/category filters the user has active. The 2,000-row cap is specific to charts — the curation pipeline uses a separate unbounded query (`getRowsByDataset`) because the AI needs the full picture.

**How to say it in an interview:** "This query module fetches up to 2,000 data_rows for an org, then filters and aggregates in-process. The limit is a chart-specific safeguard — the curation pipeline stays unbounded because the AI needs complete data. Metadata is computed from the full returned set so filter UI always shows complete options."

---

## 2. Why This Approach?

### Decision 1: Single query + JS aggregation instead of SQL GROUP BY

**What's happening:** Instead of writing a SQL query with `GROUP BY month, category` and `WHERE date BETWEEN ... AND ...`, this fetches rows for the org (capped at 2,000) and loops through them in JavaScript. We need two different aggregation passes — one for metadata and one filtered for chart data. In SQL, that's two queries or a CTE. In JS, it's two loops over the same array. The 2,000-row cap keeps memory bounded.

**How to say it in an interview:** "I chose JS aggregation over SQL GROUP BY because I need two aggregation passes — one for metadata and one for filtered chart data. In SQL, that's two queries or a CTE. In JS, it's two loops over the same data. The query is capped at 2,000 rows for charts, so memory is bounded."

**Over alternative:** SQL aggregation would be faster at scale but would require either two queries (one filtered, one unfiltered) or a complex CTE with window functions.

### Decision 2: Row limit for charts, unlimited for curation pipeline

**What's happening:** `getChartData` defaults to 2,000 rows via the `limit` parameter. The curation pipeline uses a different function (`getRowsByDataset` in `dataRows.ts`) that stays unlimited because the AI summary needs the complete dataset for accurate analysis. The chart visualization doesn't need every row — 2,000 data points produce visually identical charts to 50,000 for monthly aggregations.

**How to say it in an interview:** "Two access patterns, two limits. Charts cap at 2,000 rows because monthly aggregation produces the same visual output regardless. The AI curation pipeline stays unlimited because accuracy depends on seeing every data point. The limit is a parameter, not a constant — callers can override it."

**Over alternative:** Applying the same limit to both would either starve the AI pipeline or leave charts unbounded. Separate functions with separate defaults is the right separation.

### Decision 2: ISO string comparison for date filtering

**What's happening:** `isInDateRange` converts dates to ISO strings (`YYYY-MM-DD`) and compares them as strings instead of using `Date.getTime()`. This works because ISO date strings sort lexicographically — `"2025-12-01" < "2026-01-15"` is true. The reason: it sidesteps timezone issues. `Date.getTime()` returns milliseconds in UTC, but the user's date filters come from their browser's timezone. Comparing ISO strings compares calendar dates, not absolute moments.

**How to say it in an interview:** "I compare ISO date strings instead of timestamps to avoid timezone bugs. ISO dates sort lexicographically, and comparing strings means '2026-01-15' is always the same calendar day regardless of timezone. getTime() comparison could include or exclude days at timezone boundaries."

**Over alternative:** Direct `Date.getTime()` comparison. Simpler, but a date row for `2026-01-15T00:00:00Z` could fall outside a filter range of `2026-01-15` if the comparison doesn't account for the time component.

### Decision 3: Metadata from full dataset, chart data from filtered

**What's happening:** The category dropdown in the filter bar needs to show all categories, even when a date filter is active. If you only showed categories present in the filtered data, selecting "Last month" might hide categories that appear in other months — then the user can't select them. So `availableCategories` and `dateRange` are computed from the full row set, while `revenueTrend` and `expenseBreakdown` respect the active filters.

**How to say it in an interview:** "Metadata is always unfiltered so the filter UI shows complete options. If the category list only showed filtered results, selecting a date range could hide categories — making them impossible to select. The filter controls should always reflect the full data space."

**Over alternative:** Computing metadata from filtered data would be simpler but creates a confusing UX where filter options disappear as you add filters.

### Decision 4: Year-aware month labels

**What's happening:** Revenue data might span multiple years. The month key format is `YYYY-MM` (e.g., `2025-12`, `2026-01`), and the label includes the year: "Dec 2025", "Jan 2026". Without the year, two Januaries from different years would collide in the chart.

**How to say it in an interview:** "Month keys include the year to prevent collisions across year boundaries. The label format 'Jan 2026' disambiguates when data spans multiple years."

**Over alternative:** Month-only labels like "Jan", "Feb" — works fine for a single year, breaks when data spans a December-to-January boundary.

---

## 3. Code Walkthrough

### Imports and helpers (lines 1-20)

`eq` and `asc` from Drizzle for the query. `ChartFilters` from the shared types package — this is the validated filter shape that the route handler passes in after Zod parsing. `MONTH_LABELS` is a const array for index-to-abbreviation mapping.

`toISODate` (line 11) is a one-liner that slices the first 10 characters of an ISO string — turning `2026-01-15T00:00:00.000Z` into `2026-01-15`. Used by `isInDateRange` to normalize both row dates and filter dates to the same format.

`isInDateRange` (lines 15-20) compares ISO strings. The guard structure (`if from && d < from`) means filters are individually optional — you can have just a start date, just an end date, or both.

### Constants (line 11)

`DEFAULT_CHART_ROW_LIMIT = 2000` — the default cap for chart queries. Exposed as a parameter on `getChartData` so callers can override it (tests pass 500, for instance). The curation pipeline doesn't use this function at all.

### getChartData — metadata pass (lines 34-56)

Fetches up to `limit` rows for the org, ordered by date. The `limit` parameter defaults to `DEFAULT_CHART_ROW_LIMIT`. The first loop builds `categorySet` (expense categories only — income isn't filterable by category), `minDate`, and `maxDate`. These become `availableCategories` and `dateRange` in the return value. This pass ignores filters entirely — it sees the whole dataset.

The `parentCategory === 'Expenses'` check on line 44 means only expense categories appear in the filter dropdown. Revenue categories aren't exposed because the revenue chart shows total income, not broken down by source.

### getChartData — filtered aggregation (lines 57-76)

Two maps: `revenueByMonth` and `expenseTotals`. The second loop applies both date range and category filters. Revenue rows (identified by `parentCategory === 'Income'`) are grouped by `YYYY-MM` key. Expense rows are grouped by category name, but only if they pass the `activeCategories` filter.

The `activeCategories` set on line 58 converts the array to a Set for O(1) lookup. If no categories are specified, `activeCategories` is null and the filter is skipped.

### getChartData — output shaping (lines 78-93)

Revenue entries are sorted chronologically (lexicographic sort on `YYYY-MM` keys), then mapped to `{ month: "Jan 2026", revenue: 1234.56 }`. The `Math.round(x * 100) / 100` avoids floating-point display artifacts — `1234.5600000001` becomes `1234.56`.

Expense entries are mapped to `{ category, total }` and sorted by total descending — biggest expenses first. This sort order matches the bar chart's visual hierarchy.

---

## 4. Complexity and Trade-offs

**Fetches up to 2,000 rows.** The query returns at most `limit` rows (default 2,000). This bounds memory usage and keeps the response time predictable. The trade-off: metadata (available categories, date range) reflects the capped window, not the complete dataset. For most orgs with <2K rows, the window is the entire dataset. For larger orgs, the categories and date range might be incomplete — an acceptable trade-off since chart visualization doesn't require every row.

**Two full iterations over the same array.** The metadata loop and aggregation loop are separate. Combining them into a single loop would halve the iteration count but tangle the logic. At 50K rows, the second pass adds ~1ms. Not worth the complexity cost.

**Floating-point rounding.** `Math.round(x * 100) / 100` handles display rounding but doesn't fix accumulation errors. If you sum a thousand `0.01` values, you might get `9.999999999999998` before rounding. For financial reporting that needs penny-perfect accuracy, you'd use integer cents or a decimal library. For chart display, two-decimal rounding is good enough.

**No caching.** Every dashboard load hits the database. SWR caches on the client, but the API always runs the query fresh. Adding a Redis cache keyed by `orgId + filters` would reduce DB load, but data changes only on CSV upload — and the architecture already plans to invalidate on upload. Worth adding when traffic justifies it.

**How to say it in an interview:** "The main trade-off is that metadata reflects a 2,000-row window. For most orgs that's the complete dataset. For larger orgs, the categories and date range might miss rows beyond the cap. The scaling path is clear: move metadata into a cached SQL query and use SQL GROUP BY for the filtered aggregation."

---

## 5. Patterns and Concepts Worth Knowing

### Two-Pass Aggregation

Computing different aggregations over the same dataset in separate passes. The first pass computes metadata (all categories, date range) from the full data. The second pass computes chart values with filters applied. This pattern avoids the complexity of trying to compute both in one loop with conditional logic.

**Interview-ready:** "I separate the metadata and chart aggregation into two passes over the same data. It's clearer than interleaving them, and the performance cost of a second iteration over <50K items is negligible."

### Map-Based Grouping

Using a `Map<string, number>` to group and sum values by key. It's the JavaScript equivalent of SQL's `GROUP BY ... SUM()`. Each row checks whether a key exists, then accumulates. The Map's O(1) get/set makes the overall grouping O(n).

**Interview-ready:** "I use Map-based grouping as an in-process equivalent of SQL GROUP BY. Each row does one O(1) lookup and one accumulation. The total operation is O(n) where n is the row count."

### Set-Based Filtering

Converting an array of categories into a `Set` for O(1) membership checks. Without this, checking `categories.includes(row.category)` on each row would be O(k) per row (where k is the number of filtered categories), making the total O(n*k).

**Interview-ready:** "I convert the category filter array to a Set for O(1) membership checks instead of O(k) array lookups per row. With n rows and k categories, that's O(n) instead of O(n*k)."

### Timezone-Safe Date Comparison

Comparing dates as ISO strings (`YYYY-MM-DD`) instead of timestamps. ISO date strings sort lexicographically, and comparing strings avoids timezone-dependent boundary issues where a date might be "today" in one timezone and "yesterday" in another.

**Interview-ready:** "ISO string comparison is timezone-safe because it compares calendar dates, not absolute moments. A row dated '2026-01-15' is always within a filter range of '2026-01-15' regardless of the server's timezone."

---

## 6. Potential Interview Questions

### Q1: "Why not push the aggregation into SQL?"

**Context if you need it:** Tests whether you understand the trade-off between SQL and application-level aggregation.

**Strong answer:** "I need two aggregation passes — unfiltered for metadata and filtered for charts. In SQL, that's either two queries or a CTE with conditional aggregation. At <50K rows, JS iteration is fast enough that the simplicity of one query with two loops wins. The comment on line 31 documents the scaling threshold — I'd move to SQL GROUP BY if this becomes a bottleneck."

**Red flag:** "SQL is always better for aggregation." — Not when you need two different aggregation contexts from the same data at this scale.

### Q2: "Why cap at 2,000 rows instead of just letting the DB return everything?"

**Context if you need it:** Probes your awareness of bounded resource usage.

**Strong answer:** "2,000 rows is enough for accurate monthly aggregation in a chart — you'll get the same visual output as 50,000 rows because we're summing into monthly buckets. The cap bounds memory and response time. The curation pipeline uses a separate unbounded query because the AI summary needs every data point for accuracy. Different access patterns, different limits."

**Red flag:** "It would be fine without a limit." — unbounded queries are a ticking time bomb as data grows.

### Q3: "Why compare ISO strings instead of timestamps?"

**Context if you need it:** Tests whether the ISO comparison was intentional or accidental.

**Strong answer:** "Timestamp comparison can produce timezone boundary bugs. A row stored as `2026-01-15T00:00:00Z` has a getTime() value that might be January 14th in PST. Comparing ISO date strings compares calendar dates directly — '2026-01-15' is always January 15th regardless of timezone."

**Red flag:** "I didn't think about timezones." — Date bugs are inevitable if you haven't.

### Q4: "Why does metadata ignore filters?"

**Context if you need it:** Tests product awareness alongside technical understanding.

**Strong answer:** "If the category dropdown only showed categories present in filtered data, selecting a date range could hide categories. The user couldn't select a category that existed outside their date range — the filter options would change under them. Full metadata means filter controls always show the complete data space."

**Red flag:** "It was easier to compute from all rows." — True but misses the UX reasoning entirely.

### Q5: "How would you add pagination to the revenue chart?"

**Context if you need it:** Extension question for data with many months.

**Strong answer:** "I'd add offset/limit parameters to the filter schema and apply them after the sort step on revenueTrend. The metadata stays unfiltered, the chart data gets windowed. For the UI, I'd add forward/back controls or make the chart horizontally scrollable. The backend change is minimal — slice the sorted array."

**Red flag:** "Add LIMIT/OFFSET to the SQL query." — That would paginate rows, not months. Revenue aggregation needs all rows for the current page of months.

---

## 7. Data Structures & Algorithms Used

### Map<string, number> — Grouping Accumulator

**What it is:** A Map where the key is a grouping label (like `"2026-01"` for revenue or `"Payroll"` for expenses) and the value is a running total. Each row looks up its key, adds its amount to the existing total (or starts at 0). It's the JavaScript equivalent of `GROUP BY key SUM(amount)` in SQL.

**Where it appears:** `revenueByMonth` (line 61) and `expenseTotals` (line 62).

**Why this one:** Maps have O(1) get/set operations. A plain object (`{}`) would work too, but Map preserves insertion order and avoids prototype pollution issues. For numeric accumulation, Map is the standard choice.

**Complexity:** O(n) total for n rows — one O(1) lookup and one O(1) set per row. The final `.entries()` iteration is O(m) where m is the number of unique keys (months or categories).

**How to say it in an interview:** "Map-based grouping is O(n) for the accumulation pass and O(m) for the output, where m is the number of groups. It's the standard in-memory equivalent of SQL GROUP BY."

### Set<string> — Category Filter

**What it is:** A Set of allowed category names, built from the filter's `categories` array. Sets have O(1) membership checks (`.has()`), which matters when checking every row against the filter.

**Where it appears:** `activeCategories` (line 58).

**Why this one:** Checking `array.includes()` is O(k) per call. With n rows and k categories, that's O(n*k). Converting to a Set once is O(k), then each `.has()` call is O(1), making the total O(n+k) — effectively O(n).

**Complexity:** O(k) to build, O(1) per lookup, O(n) total for n rows.

**How to say it in an interview:** "Converting the category filter to a Set drops the inner loop from O(k) to O(1), making the overall filter pass O(n) instead of O(n*k)."

### Lexicographic Sort on ISO Date Keys

**What it is:** Sorting `YYYY-MM` strings alphabetically, which happens to produce chronological order because ISO dates are zero-padded. `"2025-12"` comes before `"2026-01"` in both alphabetical and chronological order. No need for a custom comparator or date parsing.

**Where it appears:** Line 79: `.sort(([a], [b]) => a.localeCompare(b))`.

**Why this one:** `localeCompare` handles the string comparison correctly. A numeric sort would require parsing the year and month. Since ISO dates are already sortable as strings, this is simpler.

**Complexity:** O(m log m) where m is the number of unique months.

**How to say it in an interview:** "ISO date strings sort lexicographically in chronological order because they're zero-padded. I sort with localeCompare — no date parsing needed."

---

## 8. Impress the Interviewer

### The Comment on Line 31 Is Architecture Documentation

**What's happening:** The JSDoc comment explicitly states: "Runs a single query, filters + aggregates in JS. Good enough for <50k rows; move to SQL GROUP BY if this becomes a bottleneck." This isn't a random comment — it's a scaling contract. It tells the next developer exactly when to refactor and what to refactor to.

**Why it matters:** Most code has zero guidance on its own limitations. When performance degrades, developers guess at the cause. This comment preemptively answers "when should I rewrite this?" — a sign of mature engineering.

**How to bring it up:** "I documented the scaling threshold directly in the function's JSDoc. The next developer doesn't have to profile to discover the limit — the comment says <50K rows and names the alternative approach."

### Metadata Separation Is a Product Decision Encoded in Code

**What's happening:** The split between unfiltered metadata and filtered chart data isn't a technical requirement — it's a product decision. The filter UI should always show all available options so users can explore the full data space. This decision is baked into the code structure (two separate loops), not enforced by a comment.

**Why it matters:** When code structure encodes product decisions, the decisions survive refactoring. A comment saying "don't filter metadata" could be ignored. Two distinct loops with clear separation make it structural — changing one doesn't affect the other.

**How to bring it up:** "The two-pass architecture isn't just for cleanliness — it encodes a product decision. Filter controls should show the full data space regardless of active filters. Separating the passes makes this structural, not just a comment."

### The Rounding Pattern Prevents Chart Display Bugs

**What's happening:** `Math.round(x * 100) / 100` rounds to two decimal places. Without it, floating-point accumulation errors produce values like `$1,234.560000000001` in chart tooltips. The fix is applied at the output boundary — accumulation happens in full precision, rounding happens once at the end.

**Why it matters:** Rounding during accumulation would compound errors. Rounding at the output is correct. It's a small detail, but getting it wrong means users see nonsensical precision in their financial charts — a trust-damaging UX bug.

**How to bring it up:** "I round at the output boundary, not during accumulation. Rounding inside the loop compounds errors — you'd lose pennies over thousands of rows. Rounding once at the end preserves full precision during calculation."
