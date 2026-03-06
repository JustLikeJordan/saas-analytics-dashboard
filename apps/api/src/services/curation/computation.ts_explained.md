# computation.ts — Explained

## 1. 30-Second Elevator Pitch

This file is the statistical engine behind the curation pipeline. It takes raw user data (rows from a CSV upload), crunches numbers across five dimensions — totals, averages, trends, anomalies, and category breakdowns — and spits out a flat array of `ComputedStat[]` objects. That array is *all* the rest of the system ever sees. Raw data stops here. The LLM that writes plain-English summaries never touches a single `DataRow`. That boundary is the whole point.

**What's happening:** A module that transforms raw financial data into statistical summaries.
**How to say it in an interview:** "Layer 1 of our curation pipeline enforces a privacy boundary — it's the only module that receives raw data, and its output is purely statistical. TypeScript's discriminated union types make it impossible for downstream consumers to access individual records."

---

## 2. Why This Approach?

### Pure functions, no side effects

Every function in this file takes data in, returns data out. No database calls, no logging, no mutation of inputs. This makes testing trivial — you don't need mocks, stubs, or a running server. You feed in rows, you assert on the output.

**How to say it:** "We kept the computation layer pure so it's deterministic and trivially testable. No I/O, no side effects — just math."

### Configurable trend threshold via opts parameter

`computeStats` accepts an optional second argument: `opts?: { trendMinPoints?: number }`. The default is 3 (you need at least 3 data points for a meaningful trend). The orchestrator passes the actual value from the scoring config: `scoringConfig.thresholds.trendMinDataPoints`.

Why not just import the scoring config directly? Because that would break purity. The scoring config is loaded from a JSON file via `readFileSync` — that's I/O. If computation imported it, you'd need to mock file system calls in every computation test. Instead, the orchestrator reads the config and passes a plain number. Computation doesn't know or care where it came from.

**How to say it:** "The function accepts configuration as parameters instead of importing it directly. This keeps the module pure — no file I/O dependency — while still allowing external configuration through the orchestrator."

### IQR over z-score for anomaly detection

The Interquartile Range method flags outliers by looking at where the middle 50% of data falls, then drawing fences at 1.5x that range above and below. Z-score assumes your data is normally distributed — bell-curve shaped. Small business financial data almost never is. A coffee shop might have 300 days of $800 revenue and one catering order for $12,000. IQR catches that without caring about distribution shape.

**How to say it:** "We chose IQR-based outlier detection because it's distribution-agnostic. Z-score assumes normality, which doesn't hold for typical small business transaction data."

### Local DataRow interface (not imported from the DB layer)

The `DataRow` interface is defined right here in the file, not imported from Drizzle's generated types. That's deliberate. This module doesn't need to know about database column metadata, migration history, or ORM internals. It needs `category`, `date`, `amount`, and optionally `label`. If the DB schema changes a column name, you update the mapping at the call site — this module stays untouched.

**How to say it:** "The computation module defines its own input interface instead of coupling to ORM types. This keeps the statistical logic independent of storage concerns."

### Privacy boundary enforced by types

The pipeline has three layers: computation, scoring, assembly. Only computation receives `DataRow[]`. Scoring and assembly receive `ComputedStat[]` — now a discriminated union where each stat type carries only its own typed details (no raw data fields). There's no way for the LLM prompt assembly layer to accidentally include raw user data because the type system won't allow it.

**How to say it:** "We enforce a privacy boundary through TypeScript's discriminated union types. The assembly layer that builds LLM prompts literally cannot accept raw data — it only takes `ComputedStat[]`. Privacy is structural, not a code review checkbox."

### Amount string parsing

Drizzle ORM returns PostgreSQL `numeric(12,2)` columns as strings, not numbers. This is actually correct behavior — JavaScript's `Number` type can't represent all decimal values precisely, and the ORM doesn't want to silently lose precision. So this module has `parseAmount()` that converts strings to numbers, skipping any that aren't valid. You deal with the conversion at the boundary, once, rather than sprinkling `Number()` calls everywhere.

**How to say it:** "PostgreSQL numeric types come through the ORM as strings to avoid floating-point precision loss. We parse at the boundary in one place and filter invalid values early."

---

## 3. Code Walkthrough

### `parseAmount` (lines 30-33)

A two-line guard. Takes the raw string from the DB, converts to `Number`, and returns `null` if it's `NaN` or `Infinity`. The rest of the module checks for `null` and skips bad rows. Simple, but it prevents garbage from propagating through every calculation.

### `groupByCategory` (lines 35-53)

This is the data preparation step. It walks through every row, parses the amount, and groups rows by their `category` field into a `Map<string, CategoryGroup>`. Each `CategoryGroup` holds two things: a plain `amounts` array (for sums, means, anomaly detection) and a `timeSeries` array of `[timestamp, amount]` pairs (for trend analysis).

Think of it like sorting receipts into labeled folders. Each folder gets the dollar amounts and the dates.

**What's happening:** Grouping rows by category into a Map.
**How to say it:** "We do a single pass over the data to build a Map of category groups, which gives us O(1) lookups and avoids re-scanning for each stat type."

### `computeTotals` (lines 55-80)

Sums amounts per category, then computes an overall total. Each result is a `ComputedStat` with `statType: 'total'`. The `details` object is typed as `TotalDetails` — carrying `scope` and `count`.

### `computeAverages` (lines 82-111)

Computes both `mean` and `median` for each category and overall. The median is cached in a local `const med` variable to avoid computing it twice (median involves sorting the array internally). The cached value goes into both the `comparison` field and `details.median`. The `comparison` field is a standardized slot that the scoring layer can use without digging into details.

**What's happening:** Mean and median per category, with the median result cached.
**How to say it:** "We cache the median computation since it requires an internal sort. The median appears in both the comparison field (for scoring) and the details (for the LLM prompt)."

### `computeTrends` (lines 113-143)

This is where linear regression enters. For each category with enough data points (controlled by the `minPoints` parameter, default 3), it sorts the time series chronologically, runs `linearRegression` from simple-statistics, and records the slope. A positive slope means the category's amounts are generally increasing over time. It also calculates a simple growth percentage from first to last value.

**What's happening:** Fitting a line through time-ordered data points to detect upward or downward trends.
**How to say it:** "We use least-squares linear regression on the time series to compute a slope for each category. The slope becomes the stat's primary value, and we include growth percentage for human-readable context."

The `minPoints` guard (line 118) is important. Linear regression on two points always gives a perfect fit — the line goes through both dots. That tells you nothing. Three points minimum means the regression has at least some signal. This threshold is now configurable via the `opts` parameter — the orchestrator passes `scoringConfig.thresholds.trendMinDataPoints`.

### `detectAnomalies` (lines 145-184)

The IQR method in action. For each category with at least 3 data points:

1. Compute Q1 (25th percentile) and Q3 (75th percentile)
2. Calculate IQR = Q3 - Q1
3. If IQR is 0 (all values identical), skip — there can't be outliers
4. Set fences: lower = Q1 - 1.5 * IQR, upper = Q3 + 1.5 * IQR
5. Any amount outside those fences is an anomaly

For each anomaly found, it also computes the z-score. Wait — didn't we just say IQR is better than z-score? Yes, for *detection*. But z-score is still useful for *describing* how far off an outlier is. "This value is 3.2 standard deviations above the mean" is a meaningful sentence to include in an AI summary.

**How to say it:** "We detect anomalies using the IQR method for robustness, then annotate each outlier with its z-score so the downstream summary can describe the magnitude of deviation."

### `computeCategoryBreakdowns` (lines 187-219)

Computes what percentage of the total each category represents. Uses absolute values for the percentage calculation — if you have $5,000 in revenue and -$2,000 in refunds, refunds should show as ~29% of activity, not negative. Each breakdown includes min, max, and transaction count.

### `computeStats` — the orchestrator (lines 221-245)

The single exported function. It:
1. Bails early if there are no rows
2. Groups everything by category
3. Flattens all amounts into one array (for overall stats)
4. Bails if no amounts parsed successfully
5. Reads `opts?.trendMinPoints ?? 3` for the configurable trend threshold
6. Calls all five computation functions and spreads the results into one flat array

No conditional logic about which stats to compute. Every dataset gets all five types. The scoring layer decides which ones matter most.

**What's happening:** The function accepts an optional `opts` parameter for configuration (currently just `trendMinPoints`). This keeps the function pure — it receives all configuration as arguments rather than importing config files.
**How to say it:** "The computation function is externally configurable through an options parameter while maintaining purity. The orchestrator reads the scoring config and passes relevant thresholds as plain values."

---

## 4. Complexity and Trade-offs

**Time complexity:** One pass for grouping (O(n)), then each stat function iterates the groups. Linear regression is O(k) per category where k is the number of points. The quantile calculations sort internally, so anomaly detection is O(k log k) per category. Overall: O(n log n) worst case if one category holds all the data.

**Memory:** The `groupByCategory` pass creates a copy of every amount and timestamp. For a 10,000-row CSV, that's ~10,000 numbers and ~10,000 timestamp-amount pairs — maybe 300KB. Not a concern.

**Trade-off — precision vs. simplicity:** `parseAmount` uses JavaScript's `Number()`, which is IEEE 754 double-precision. For financial data, you lose precision past ~15 significant digits. But this module is computing *statistics*, not ledger balances. The precision loss in a mean or standard deviation is negligible.

**Trade-off — single pass vs. multiple passes:** We iterate the groups map once per stat type (5 times). We could do one pass and compute everything simultaneously, but the code would be a tangled mess. Five clean passes over a Map of maybe 10-20 categories is nothing. Clarity wins over micro-optimization here.

**Trade-off — no streaming:** The entire `DataRow[]` array must fit in memory. For the MVP (CSV uploads, max ~50,000 rows), this is fine. If the product grows to handle millions of rows, you'd need a streaming/chunked approach.

**Trade-off — opts parameter:** The options parameter adds a small amount of API surface. The alternative was importing the scoring config directly, but that would couple this pure module to file I/O. A plain parameter keeps testing trivial — no mocks needed.

---

## 5. Patterns and Concepts Worth Knowing

### The Transform Pipeline pattern

Data flows in one direction: raw rows -> grouped data -> statistical summaries. Each step narrows what downstream consumers can see. This is a common pattern in data engineering — you'll hear it called ETL (Extract, Transform, Load) in broader contexts. Here it's more like "Transform and Seal."

### Map as a grouping structure

Using `Map<string, CategoryGroup>` instead of a plain object (`Record<string, CategoryGroup>`) is a deliberate choice. Maps preserve insertion order, have a cleaner API for iteration (`for...of`), and don't have prototype pollution concerns. When you need to group things by a string key, `Map` is almost always the right call.

### Structural typing as a privacy mechanism

TypeScript uses structural typing — if an object has the right shape, it fits the type. By defining `ComputedStat` as a discriminated union without any raw data fields, you've made it structurally impossible for raw data to flow downstream unless someone deliberately circumvents the type system. That's a strong guarantee for a dynamic language ecosystem.

### IQR (Interquartile Range) outlier detection

Think of lining up all your values from smallest to largest. Q1 is the value at the 25% mark, Q3 at the 75% mark. The IQR is the distance between them — the "middle half" of your data. The 1.5x multiplier is a convention from John Tukey's work in the 1970s. Values beyond Q1 - 1.5*IQR or Q3 + 1.5*IQR are considered outliers. This is the same math behind box-and-whisker plots.

### Linear regression (least squares)

Given a scatter of points, linear regression finds the line y = mx + b that minimizes the total squared distance from each point to the line. The slope `m` tells you the trend direction and rate. In this code, x is a Unix timestamp and y is a dollar amount, so the slope represents "dollars per millisecond of change." Not super intuitive on its own — that's why the code also computes `growthPercent` for the LLM to use.

### Configuration as parameters (dependency injection lite)

`computeStats` accepts thresholds as an `opts` parameter rather than importing config. This is a lightweight form of dependency injection — the caller decides the values, the function just uses them. It keeps the function testable without mocks and decoupled from the config loading mechanism.

---

## 6. Potential Interview Questions

### "Why define DataRow locally instead of importing the Drizzle type?"

Decoupling. The computation module shouldn't break or need changes when the database schema evolves. It defines the minimal interface it needs. If a column gets renamed in the DB, you update the mapping at the call site, not inside the statistical logic. This follows the Interface Segregation Principle — depend on the smallest interface you actually need.

### "Why IQR instead of z-score for outlier detection?"

Z-score assumes normal distribution. Financial transaction data is typically skewed — lots of regular-sized transactions and occasional large ones. IQR is non-parametric (no distribution assumptions). It's also what box plots use, so the results are visually intuitive. We still compute z-scores for each detected outlier to describe magnitude, but detection uses IQR.

### "How would you handle a dataset with millions of rows?"

The current approach loads all rows into memory. For millions of rows, you'd move to a streaming approach — compute running sums, counts, and sorted samples for quantile estimation. Libraries like `t-digest` can approximate percentiles in a single pass with bounded memory. You'd also consider pushing some aggregation to PostgreSQL with `GROUP BY` queries rather than pulling raw rows into Node.

### "What makes these functions 'pure' and why does that matter?"

A pure function returns the same output for the same input and produces no side effects — no DB writes, no logging, no mutations of external state. Every function here takes immutable inputs and returns new arrays. This means tests are just input-output assertions (no mocks needed), functions can run in parallel without locks, and bugs are reproducible — feed in the same data, get the same result every time.

### "Why compute all five stat types for every dataset?"

Separation of concerns. This layer's job is computation, not decision-making. The scoring layer ranks which stats are most interesting based on configurable weights. If you skip computing a stat type here, the scoring layer loses the option to surface it. Compute everything, let the scorer filter.

### "Why accept an options parameter instead of importing the scoring config directly?"

Purity. The scoring config is loaded from a JSON file using `readFileSync` — that's file I/O. If computation imported it, every test would need to mock the file system. With the opts parameter, tests just pass `{ trendMinPoints: 5 }` — no mocks, no setup. The orchestrator handles the bridging between config and computation.

### "Walk me through the growth percentage calculation on line 125."

It takes the first and last values in the sorted time series: `((lastVal - firstVal) / |firstVal|) * 100`. The `Math.abs` in the denominator handles negative starting values correctly — if you go from -$100 to $50, that's a 150% change, not -150%. The zero guard prevents division by zero. It's a simple first-to-last comparison, not a regression-based growth rate, which is fine for a high-level summary.

---

## 7. Data Structures & Algorithms

### Map for O(1) grouping

`groupByCategory` builds a `Map<string, CategoryGroup>`. Each row lookup/insert is O(1) amortized. The alternative — filtering the array once per category — would be O(n * c) where c is the number of categories. The Map approach is O(n) total.

### CategoryGroup — dual representation

Each group stores the same data two ways: `amounts: number[]` (for statistical functions that need flat arrays) and `timeSeries: [number, number][]` (for regression, which needs x-y pairs). This costs double memory but avoids reconstructing pairs or stripping timestamps in each stat function. It's a classic space-time trade-off leaning toward simplicity.

### Linear regression (simple-statistics)

The `linearRegression` function computes least-squares fit, returning `{ m: slope, b: intercept }`. The algorithm computes the means of x and y, the covariance of x and y, and the variance of x, then derives the slope as covariance/variance. Time complexity: O(k) where k is the number of points.

### IQR outlier detection

Sorts the amounts array internally (via `quantile`), computes Q1 and Q3, derives fences. The quantile computation involves sorting, which is O(k log k). Then a linear scan checks each value against the fences. Total per category: O(k log k).

### Flat output array (spread concatenation)

The orchestrator spreads five arrays into one: `[...totals, ...averages, ...trends, ...anomalies, ...breakdowns]`. This creates a single flat `ComputedStat[]` — a discriminated union where each element's `statType` tag identifies its variant. The scoring layer can iterate it uniformly using switch cases that narrow to the correct detail type.

---

## 8. Impress the Interviewer

### "This is privacy-by-architecture, not privacy-by-policy."

Most systems rely on code review to make sure nobody accidentally passes PII to an external API. Here, the type system enforces it. `assembly.ts` accepts `ComputedStat[]`, which is a discriminated union of typed stat interfaces — none of which have `DataRow` fields. You'd have to deliberately cast or restructure data to break the boundary.

### "Every function is independently testable with zero infrastructure."

No database, no Redis, no running server. Feed an array of objects into `computeStats`, assert on the output. Feed a Map into `detectAnomalies`, check that outliers are flagged correctly. The new `opts` parameter for `trendMinPoints` is testable the same way — pass `{ trendMinPoints: 5 }` and verify trends are suppressed for categories with 4 rows. No mocks needed.

### "We chose IQR for detection but still report z-scores."

This shows you understand both methods and their trade-offs. IQR is robust for detection in skewed distributions. Z-scores are useful for *communicating* how extreme an outlier is. Using one for detection and the other for description is a thoughtful combination, not a contradiction.

### "The computation layer is deliberately over-inclusive."

It computes every stat type for every category. That feels wasteful until you realize the scoring layer exists specifically to rank and filter. If the computation layer tried to be smart about what to compute, you'd duplicate scoring logic across two layers. Keeping computation exhaustive and scoring selective gives you a clean separation where each layer has exactly one job.
