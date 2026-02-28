# csvAdapter.ts — Interview-Ready Documentation

## 1. 30-Second Elevator Pitch

This file takes a raw CSV file (as a Buffer of bytes) and turns it into clean, validated data that the rest of the app can trust. It strips byte-order marks, normalizes messy headers, validates that required columns exist, spot-checks a sample of rows for data quality, and filters out bad rows while keeping the good ones. It implements the `DataSourceAdapter` interface, which means the route handler that calls it doesn't know or care that the data came from a CSV — it could be swapped for a QuickBooks or Stripe adapter later without changing a single line in the route.

**How to say it in an interview:** "This is a CSV parsing adapter that implements a pluggable DataSourceAdapter interface. It handles BOM stripping, header normalization, two-phase validation (structural then content), and partial-failure recovery — returning valid rows with warnings instead of rejecting the entire file over a few bad rows."

---

## 2. Why This Approach?

### Decision 1: Pluggable adapter interface

**What's happening:** Instead of the route handler knowing how to parse CSVs directly, we hide that behind a `DataSourceAdapter` interface with `parse()` and `validate()` methods. The route just calls `adapter.parse(buffer)` and gets back a `ParseResult`.

Think of a USB port. Your laptop doesn't need to know if you plugged in a keyboard, a mouse, or a hard drive — it just sends and receives data through the same interface. The adapter pattern works the same way: the route handler "plugs in" a CSV adapter now, but a QuickBooks adapter later.

**How to say it in an interview:** "The CSV adapter implements DataSourceAdapter, which is the Strategy pattern. The route handler depends on the interface, not the CSV implementation. Adding financial API imports later means writing a new adapter, not modifying the existing ingestion pipeline."

**Over alternative:** Hardcoding CSV logic into the route handler would be faster to write but creates tight coupling. Every new data source would mean editing the route.

### Decision 2: csv-parse handles header extraction (not naive string splitting)

**What's happening:** Originally, headers were extracted by splitting the first line on commas: `content.split('\n')[0].split(',')`. That breaks on quoted headers like `"Revenue, Q1"` — the comma inside the quotes gets treated as a delimiter, producing `["\"Revenue"`, `" Q1\""]` instead of `["Revenue, Q1"]`.

Now, headers come from `Object.keys(records[0])` when data rows exist, or from a separate `csv-parse` call with `columns: false` for header-only files. csv-parse correctly handles RFC 4180 quoting rules.

**How to say it in an interview:** "Header extraction uses csv-parse's own parser rather than naive string splitting. A split on commas breaks on quoted headers like `'Revenue, Q1'` — the comma inside the quotes gets treated as a delimiter. Delegating to csv-parse handles all RFC 4180 edge cases."

**Over alternative:** The naive `split(',')` was simpler but incorrect for any header containing commas, quotes, or escaped characters. This was caught in code review as a critical bug.

### Decision 3: Sample-based row validation (100 rows max)

**What's happening:** Instead of validating every single row (up to 50,000), we check the first 100. If more than half of those fail, the whole file is rejected.

Data quality problems are almost always systemic — if the date column uses "Jan 15, 2025" format, that's wrong in row 1 and wrong in row 50,000. Checking 100 rows catches systemic issues while keeping validation fast. The 50% threshold means "more of your data is bad than good, so this file probably has the wrong format."

**How to say it in an interview:** "Row validation uses statistical sampling — 100 rows — to detect systemic data quality issues without scanning the full dataset. The 50% failure threshold distinguishes 'wrong format' from 'a few typos,' which determines whether to reject the file or accept it with warnings."

**Over alternative:** Full-scan validation would catch every bad row but adds latency proportional to file size. For non-technical users waiting on an upload, speed matters.

### Decision 4: Synchronous parsing with csv-parse/sync

**What's happening:** The entire CSV is parsed in one blocking call. No streaming, no chunks, no callbacks.

The file is already fully in memory as a Buffer from multer's `memoryStorage()`. There's no I/O to make async. Sync parsing is simpler — no callback chains, no backpressure management. The 50,000 row limit bounds worst-case to roughly 200ms of blocking.

**How to say it in an interview:** "Sync parsing is justified here because the file is already buffered in memory and the row limit bounds CPU time. If we needed larger files or higher concurrency, I'd switch to streaming with csv-parse's async API and move the work to a worker thread."

**Over alternative:** Streaming would prevent event loop blocking but adds complexity for a bounded problem.

### Decision 5: Partial success with filtered rows

**What's happening:** If some rows fail validation but fewer than 50% of the sample, the adapter filters out bad rows, keeps the good ones, and adds a warning. The user sees "15 rows skipped: validation errors in rows 3, 7, 12, 45, 98."

Rejecting an entire 10,000-row file because 5 rows have typos is terrible UX. The adapter lets good data through and communicates what was dropped.

**How to say it in an interview:** "The adapter recovers gracefully from partial failures. Bad rows are filtered out using a Set for O(1) membership checks, the valid subset is returned, and warnings describe exactly which rows were skipped."

---

## 3. Code Walkthrough

### Block 1: Constants (lines 10-14)

Five configuration values govern the adapter's behavior. `REQUIRED_COLUMNS` and `OPTIONAL_COLUMNS` define the schema contract. `ALL_KNOWN_COLUMNS` combines them for the header map builder. `MAX_ROWS` caps at 50,000 to prevent memory exhaustion. `VALIDATION_SAMPLE_SIZE` limits row-level validation to 100 rows.

The `as const` assertions give these arrays literal element types — TypeScript knows `REQUIRED_COLUMNS[0]` is specifically `'date'`, not `string`.

### Block 2: Utility functions (lines 16-37)

Four small, pure functions:

- **`stripBom`** — Checks if the first character is the Unicode BOM (`U+FEFF`) and slices it off. Excel on Windows prepends this to UTF-8 files. Without stripping, the first header becomes `\uFEFFdate` and fails the column check.
- **`normalizeHeader`** — Trim and lowercase. Turns `" Date "` into `"date"`.
- **`isValidDate`** — Trims, constructs a `Date`, checks if it's valid. Accepts any format `new Date()` understands.
- **`isValidAmount`** — Strips commas (for `"1,234.56"`), checks if the result is a valid number.

### Block 3: validateHeaders (lines 39-53)

Checks that every required column exists in the normalized header list. Returns a `ValidationResult` with specific error messages listing both the missing column and the actual columns present.

### Block 4: validateRowValues (lines 55-106)

The sample-based row validator. Iterates through `min(rows.length, 100)` rows, checking date, amount, and category values. Each failed row gets its number pushed to `skippedRows`. The `rowNum = i + 2` offset matches spreadsheet row numbering (header = row 1, data starts row 2).

### Block 5: buildHeaderMap (lines 113-122)

Creates a `Map<string, string>` from normalized names back to original headers. csv-parse uses original header strings as row object keys, so we need this reverse mapping. Only known columns (required + optional) get entries — unknown columns are ignored.

### Block 6: csvAdapter.parse (lines 124-207)

The main pipeline. First, csv-parse runs with `columns: true` to get keyed row objects. Then headers are extracted — from `Object.keys(records[0])` when data rows exist, or from a separate `columns: false` parse for header-only files. This two-path approach avoids the naive `split(',')` bug on quoted headers.

Five guard clauses handle edge cases in sequence:
1. Empty file -> warning
2. No data rows (headers only) -> warning
3. Too many rows (>50K) -> warning
4. Missing required columns -> silent rejection
5. >50% row failure rate -> silent rejection

If all guards pass, bad rows are filtered via a `Set` for O(1) lookup, warnings describe skipped rows, and the valid subset is returned.

### Block 7: csvAdapter.validate (lines 209-211)

Thin wrapper around `validateHeaders`. Exists because the `DataSourceAdapter` interface requires it as a separate method — the route handler calls it independently.

### Block 8: Test exports (line 215)

Utility functions exported for direct unit testing. Production code imports `csvAdapter`, test code can also import individual helpers like `stripBom`, `normalizeHeader`, and `buildHeaderMap`.

---

## 4. Complexity and Trade-offs

**Sample validation is a bet.** Checking 100 rows assumes data quality problems are consistent. If a CSV has problems only in rows 40,000-50,000, the sample won't catch it. For SMB-scale data from single exports, this is acceptable. Full-scan validation would catch everything but adds latency proportional to file size.

**Synchronous parsing blocks the event loop.** For a 50,000-row file, that's maybe 200ms of CPU time where no other requests get handled. The 50K row limit bounds the worst case. For higher concurrency or larger files, you'd switch to streaming + worker threads.

**The 50% threshold is a judgment call.** There's no theoretically correct answer. You'd tune it based on user support tickets — if users complain about rejected files that were "mostly fine," lower it. If they complain about garbage data, raise it.

**Two-path header extraction adds a conditional.** The `if (records.length > 0)` branch uses `Object.keys`, the else branch re-parses with `columns: false`. This exists because csv-parse in `columns: true` mode doesn't expose raw headers when there are no data rows. The two paths handle the same concern (get headers) via different mechanisms, which is worth noting for maintainability.

**How to say it in an interview:** "The trade-offs are sample size vs. validation thoroughness, sync vs. async parsing, and strict vs. lenient thresholds. Each favors user experience over theoretical correctness, which is the right call for an SMB product."

---

## 5. Patterns and Concepts Worth Knowing

### Adapter Pattern

A structural pattern where you wrap a specific implementation behind a common interface. Like a power adapter between your laptop charger and a foreign wall outlet. Here, `csvAdapter` translates CSV files into `ParseResult` objects, and future adapters translate other sources into the same shape.

**Where it appears:** `csvAdapter` satisfies `DataSourceAdapter`. The route handler calls interface methods without knowing the source format.

**Interview-ready line:** "The CSV adapter implements DataSourceAdapter, which is the Adapter pattern. Adding new data sources means writing a new adapter without modifying the existing route handler."

### Early Return / Guard Clause

Instead of deeply nested if-else blocks, the `parse` method checks failure conditions at the top and returns immediately. The happy path flows through without indentation.

**Where it appears:** Lines 128, 154, 163, 176, 184 — five early returns before the happy path.

**Interview-ready line:** "The parse function uses guard clauses to handle edge cases first: empty file, no data rows, row limit, missing columns, high failure rate. The successful path runs at base indentation."

### Postel's Law (Robustness Principle)

"Be conservative in what you send, be liberal in what you accept." BOM markers? Strip them. Uppercase headers? Normalize them. Commas in numbers? Remove them. Extra columns? Ignore them. Quoted commas in headers? Handle them correctly. The output is strict and consistent; the input is as permissive as possible.

**Where it appears:** `stripBom`, `normalizeHeader`, `isValidAmount` (comma stripping), `relax_column_count` option, csv-parse quoted header handling.

**Interview-ready line:** "The adapter follows Postel's Law — liberal in what it accepts, conservative in what it produces. It normalizes BOM markers, header casing, number formatting, quoted headers, and inconsistent column counts so the downstream pipeline gets clean data regardless of input quality."

### Two-Phase Validation

Header validation (structural) and row validation (content) are separate functions with separate concerns. Headers are binary — pass or fail. Rows are graduated — partial failure is acceptable.

**Where it appears:** `validateHeaders` gates `validateRowValues`. If headers fail, row validation never runs.

**Interview-ready line:** "Validation is split into structural and content phases. Structural validation is a hard gate. Content validation is soft — partial failure produces warnings, not rejection."

---

## 6. Potential Interview Questions

### Q1: "Why use synchronous CSV parsing instead of streaming?"

**Context if you need it:** Tests understanding of sync vs. async trade-offs and when blocking is acceptable.

**Strong answer:** "The file is already fully in memory from multer's upload. Sync parsing is simpler — no callback chains, no backpressure. The 50K row limit bounds worst-case to ~200ms of blocking. For a dashboard with moderate concurrency, that's fine. If we needed larger files or higher throughput, I'd switch to streaming with worker threads."

**Red flag answer:** "Sync is always fine because Node.js is single-threaded anyway." Misses that blocking prevents handling other requests.

### Q2: "How does header extraction work for files with quoted commas?"

**Context if you need it:** Tests understanding of CSV edge cases and RFC 4180. An earlier version of this code used naive `split(',')` which broke on headers like `"Revenue, Q1"`.

**Strong answer:** "We delegate header extraction to csv-parse itself. When data rows exist, we read `Object.keys(records[0])` — csv-parse already parsed the headers correctly per RFC 4180. For header-only files, we re-parse with `columns: false` mode to get the raw header array. Both paths handle quoted fields correctly because csv-parse does the heavy lifting."

**Red flag answer:** "We split the first line on commas." That's the bug we fixed. Naive splitting breaks on quoted fields.

### Q3: "What's the BOM marker and why strip it?"

**Context if you need it:** BOMs are a common file processing gotcha, especially for files from Windows/Excel.

**Strong answer:** "The Byte Order Mark is `U+FEFF`, a zero-width character that Excel on Windows prepends to UTF-8 files. It was originally for UTF-16 byte order signaling but is meaningless in UTF-8. Without stripping, the first header becomes `\uFEFFdate` and fails the required column check. One character check, zero cost, prevents a baffling error."

**Red flag answer:** "I'm not sure what that is, but the code handles it." BOMs are common in file processing.

### Q4: "How does the 50% failure threshold work, and how would you validate it?"

**Context if you need it:** Tests ability to reason about heuristics and how you'd iterate on them.

**Strong answer:** "Check 100 rows, reject if >50 fail. High failure rate signals a structural problem — wrong format, wrong file. Whether 50% is right is empirical. I'd log failure rates for every upload and whether users re-upload after rejection. If users get rejected at 55% but the data was mostly usable, the threshold is too strict."

**Red flag answer:** "50% seems reasonable." No ability to evaluate or iterate on a heuristic.

### Q5: "Why does `parse` call `this.validate()` instead of `validateHeaders` directly?"

**Context if you need it:** Tests understanding of interface design and testability.

**Strong answer:** "Two reasons. First, it goes through the interface method, so a decorator or wrapper around the adapter would intercept it. Second, tests can stub `validate` independently of `parse` via `vi.spyOn`. It keeps internal calls consistent with how external consumers use the adapter."

**Red flag answer:** "Personal preference." There are real design reasons.

### Q6: "Why are there two different code paths for extracting headers?"

**Context if you need it:** Tests understanding of the csv-parse library's behavior in different modes.

**Strong answer:** "csv-parse in `columns: true` mode returns keyed objects — the keys are the headers. But when there are no data rows, `records` is empty and there's nothing to call `Object.keys` on. The fallback re-parses with `columns: false` to get a raw array of header strings. Both paths use csv-parse's parser, so quoted headers are handled correctly in either case."

**Red flag answer:** "We could just always use the `columns: false` path." That would lose the keyed row objects we need for data access.

---

## 7. Data Structures & Algorithms Used

### Map (Header Lookup Table)

**What it is:** A key-value store where keys are normalized column names (`"date"`) and values are original header strings (`" Date "`). Think of a hotel front desk — you ask for "Smith" and they look up which room number that maps to.

**Where it appears:** `buildHeaderMap()` on line 113.

**Why this one:** Plain objects would work but `Map` has cleaner semantics — `.get()` returns `undefined` for missing keys (no prototype chain risk), and the intent is clearly "lookup table."

**Complexity:** O(k) to build where k is header count (typically 3-5). O(1) per lookup.

**How to say it in an interview:** "The header map translates normalized column names to original CSV headers. Build is O(k), lookups are O(1). It's the indirection layer that makes the adapter case-insensitive."

### Set (Skipped Row Filter)

**What it is:** An unordered collection that only stores unique values and supports O(1) membership checks. Like a VIP list at a venue — checking if a name is on the list is instant regardless of list size.

**Where it appears:** Line 198 — `const skippedSet = new Set(skippedRows)` used in `records.filter()`.

**Why this one:** The filter runs over every row (up to 50,000). With an Array, each `includes()` is O(s) where s is skipped count. With a Set, each `.has()` is O(1). For 50,000 rows with 50 skipped, that's 2.5M comparisons vs. 50,000 hash lookups.

**Complexity:** O(s) to construct, O(n) to filter. Total O(n + s), simplifies to O(n).

**How to say it in an interview:** "Skipped rows are converted to a Set before filtering for O(1) membership checks. Array.includes would make the filter O(n*s); Set.has makes it O(n)."

### Linear Scan with Early Accumulation

**What it is:** `validateRowValues` iterates through the sample once, collecting errors and skipped row numbers as it goes. Single pass, no backtracking.

**Where it appears:** The for-loop in `validateRowValues`, lines 67-103.

**Why this one:** A multi-pass approach (one loop for dates, one for amounts, one for categories) would traverse the sample 3 times. Single-pass is cleaner and 3x fewer iterations.

**Complexity:** O(s) where s is sample size (max 100). The cap makes this effectively O(1) relative to file size.

---

## 8. Impress the Interviewer

### The Privacy Architecture Connection

This adapter is the entry point of a privacy-by-design pipeline. Raw CSV rows get validated and stored in `data_rows`, but only computed statistics (`ComputedStat[]`) ever reach the AI layer. The adapter validates and stores; a computation layer aggregates; only aggregates reach the LLM prompt assembly. Individual transactions never touch the language model.

**How to bring it up:** "This adapter is the first layer of a privacy-aware data pipeline. Parsed rows get stored, but they never reach the AI model. A downstream computation layer reduces them to aggregates, and only those aggregates enter the LLM prompt."

### csv-parse Handles RFC 4180 So You Don't Have To

**What's happening:** CSV sounds simple, but the spec (RFC 4180) has edge cases: quoted fields containing commas, escaped quotes (`""`), newlines inside quoted fields, BOM markers. An earlier version of this code used `split(',')` for header extraction, which broke on headers like `"Revenue, Q1"`. Delegating to csv-parse handles all of these correctly.

**Why it matters:** Naive CSV parsing is one of those things that works fine in development (where test data is clean) and breaks in production (where real Excel exports have quoted commas, BOMs, and ragged rows). Using a battle-tested parser eliminates an entire class of production bugs.

**How to bring it up:** "I delegate all CSV parsing to csv-parse rather than doing manual string splitting. CSV has enough edge cases — quoted commas, escaped quotes, BOMs, ragged rows — that a battle-tested library is worth the dependency."

### relax_column_count Is the Quiet Hero

The `csv-parse` option `relax_column_count: true` prevents the parser from throwing when a row has more or fewer columns than the header. Excel exports often have trailing commas; accounting tools sometimes omit the last field. Without this option, the parse throws on the first inconsistent row. With it, row-level validation handles the nuance.

**How to bring it up:** "One small but high-impact decision: `relax_column_count: true`. Real CSV files from Excel frequently have inconsistent column counts. Without this, the parser throws on the first ragged row. With it, the adapter handles inconsistency gracefully."

### Error Messages Are a Product Decision

"We expected a column named 'date'. Your file has columns: Date, Amount." Not "Missing required column: date." The messages use "we" (the system) and "your file" (the user's thing). They show what was expected AND what was found. Concrete examples like "Expected format: YYYY-MM-DD (e.g., 2025-01-15)."

**How to bring it up:** "Error messages are written for business owners, not developers. Each includes what was expected, what was found, and where. Row numbers match what the user sees in Excel — header is row 1, data starts at row 2."
