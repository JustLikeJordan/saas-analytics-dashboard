# normalizer.ts — Explained

## 1. 30-Second Elevator Pitch

This file is the translator between "what the CSV parser gives us" and "what the database wants to store." The CSV parser produces rows where every value is a string keyed by the original header text. The database wants typed fields with specific names. The normalizer maps header names, trims whitespace, strips commas from dollar amounts, converts date strings to `Date` objects, and handles optional columns that might not exist. It's 42 lines that turn messy real-world spreadsheet data into a clean, predictable shape.

**How to say it in an interview:** "The normalizer is a data transformation layer that bridges raw CSV output and the database schema. It handles header mapping, type coercion, whitespace cleanup, and graceful handling of optional columns — all without throwing if optional data is missing."

---

## 2. Why This Approach?

### Decision 1: Keep `amount` as a string

**What's happening:** The `amount` field comes in as a string from CSV, and it stays a string after normalization.

**Why it matters:** PostgreSQL's `numeric(12,2)` type stores exact decimals. When Drizzle ORM reads `numeric` columns, it returns strings to avoid JavaScript's floating-point imprecision (`0.1 + 0.2 === 0.30000000000000004`). If we converted to `number` here, we'd lose precision going in, then get a string back coming out. Keeping it as a string throughout means zero precision loss.

**How to say it in an interview:** "We keep amounts as strings because PostgreSQL numeric types return strings through Drizzle ORM. Converting to JavaScript numbers would introduce floating-point precision errors. For financial data, that's not acceptable."

### Decision 2: Separate normalization from validation

**What's happening:** The normalizer doesn't check if dates are valid or amounts are numbers. It just transforms. All validation already happened in the CSV adapter.

**Why it matters:** Single responsibility. The adapter validates, the normalizer transforms. Testing gets simpler because you can test transformation logic without triggering validation. It also means a future QuickBooks adapter can reuse `NormalizedRow` even though its validation rules are completely different.

**How to say it in an interview:** "Validation and normalization are separate concerns. The adapter validates, the normalizer transforms. That separation lets us swap data sources without touching normalization logic."

### Decision 3: Header map lookup instead of assuming key names

**What's happening:** Instead of `row['date']` directly, the normalizer uses `buildHeaderMap` to translate normalized names back to original headers.

**Why it matters:** Users upload CSVs from Excel, Google Sheets, accounting tools — headers come in every capitalization and whitespace variation. The CSV parser uses original headers as row object keys. The header map makes lookups case-insensitive and whitespace-tolerant.

**How to say it in an interview:** "We use a header map indirection layer so column lookups are case-insensitive. This handles the reality that user-uploaded CSVs have inconsistent formatting."

---

## 3. Code Walkthrough

### The NormalizedRow interface (lines 10-17)

The contract between the ingestion pipeline and the persistence layer. Every field maps to a `data_rows` column. The `| null` types on `parentCategory`, `label`, and `metadata` represent optional columns. `metadata` is always `null` for CSV uploads — reserved for financial API integrations in a later milestone.

Think of this interface as a mold at a factory. Raw material (CSV strings) goes in, and every output piece has the exact same shape regardless of input messiness.

### The normalizeRows function (lines 19-42)

First: build the header map once, outside the loop. Then resolve all column names upfront. The `!` assertions on required keys (`dateKey`, `amountKey`, `categoryKey`) are safe because the CSV adapter already validated those headers exist.

Each row gets specific treatment:
- **category**: Trim whitespace. Required, always present.
- **parentCategory**: If the column exists and has a non-empty value, trim it. Otherwise `null`.
- **date**: Trim, construct a `Date`. Validation already confirmed parseability.
- **amount**: Trim, strip commas (`"1,234.56"` → `"1234.56"`).
- **label**: Same optional-column pattern as parentCategory.
- **metadata**: Always `null`. Placeholder for future financial API data.

The `?? ''` fallbacks handle edge cases where a cell is missing entirely (ragged CSV rows).

---

## 4. Complexity and Trade-offs

**Runtime:** O(n) where n is row count. `buildHeaderMap` is O(h) where h is header count (3-5), effectively constant. The `.map()` loop processes each row once with constant-time string operations.

**Memory:** Creates one new `NormalizedRow` per input row. Peak memory is roughly 2x row count during transformation. For 50,000 rows of small objects, that's a few megabytes.

**Non-null assertions are pipeline-dependent.** The `!` on required keys is safe because the CSV adapter guarantees those headers exist. If someone called `normalizeRows` directly without validation, the assertions would hide a bug. Safety depends on pipeline discipline.

**How to say it in an interview:** "It's O(n) — one pass with constant-time work per row. The whole dataset is in memory, which is fine within our 50K row limit. If we needed millions of rows, I'd switch to a streaming transform."

---

## 5. Patterns and Concepts Worth Knowing

### Data Transformation Pipeline

This file is one stage in: parse (CSV adapter) → normalize (this file) → persist (Story 2.3). Each stage has a single job and a clear contract. This pattern appears everywhere in backend systems — ETL pipelines, API response formatting, event processing.

**Interview-ready line:** "The normalizer is one stage in a parse → normalize → persist pipeline. Each stage is independently testable and replaceable."

### Indirection via Lookup Map

The header map is a layer between "what we call a column internally" and "what the user called it in their spreadsheet." The same pattern appears in i18n, config management, and ORM column mapping.

### Nullable Types for Schema Evolution

`metadata: null` looks odd for a field that's always null. It's forward-compatibility — the interface matches the database schema, which has a `metadata` JSONB column reserved for financial API data. Including it now means the persistence layer doesn't need to special-case "sometimes this field exists."

---

## 6. Potential Interview Questions

### Q1: "Why is `amount` a string instead of a number?"

**Strong answer:** "JavaScript's `number` type is IEEE 754 double-precision, which can't represent all decimal values exactly. The classic `0.1 + 0.2` problem. PostgreSQL's `numeric` stores exact decimals, and Drizzle returns them as strings. Keeping amount as a string throughout means zero precision loss."

**Red flag:** "I would parse it to a float." — Shows lack of awareness about floating-point issues in financial contexts.

### Q2: "What would break if you skipped the header map and used `row['date']` directly?"

**Strong answer:** "The CSV parser uses original header text as object keys. If the header is `'Date'` or `' date '`, `row['date']` returns `undefined` because JavaScript keys are case-sensitive. The header map normalizes all headers so lookups work regardless of user formatting."

**Red flag:** "Just require lowercase headers." — Shifts burden to the user.

### Q3: "Why are the non-null assertions safe here?"

**Strong answer:** "The CSV adapter validates required headers exist before this function runs. If validation fails, parsing returns empty rows and normalizeRows never executes. The pipeline architecture guarantees these keys are in the map. That said, if someone called this function outside the pipeline, the assertions would mask a runtime error."

**Red flag:** "Non-null assertions are fine, TypeScript handles it." — Misunderstands that `!` bypasses safety.

### Q4: "How would you adapt this for a QuickBooks API?"

**Strong answer:** "The architecture already supports it. A QuickBooks adapter would implement DataSourceAdapter, handle its own parsing, and produce ParsedRow objects. The normalizer works as-is because buildHeaderMap is source-agnostic. The metadata field, always null for CSV, could carry QuickBooks-specific data like transaction IDs."

**Red flag:** "I'd add an if-statement to check the data source type." — Defeats the adapter pattern.

---

## 7. Data Structures & Algorithms Used

### Map (Header Map)

`buildHeaderMap` returns a `Map<string, string>` — normalized names to original headers. O(1) lookups, O(h) to build. Used here with at most 5 entries, so the performance benefit over a plain object is negligible, but the semantic clarity is better.

### Array.prototype.map (Functional Transformation)

The core is a `.map()` call — one `NormalizedRow` per input `ParsedRow`. No mutation, no side effects. Output array has the same length as input.

### String.prototype.replace with Regex

`amountStr.trim().replace(/,/g, '')` strips all commas. The `/g` flag means "every occurrence, not just the first." Without it, `"1,234,567"` becomes `"1234,567"`.

---

## 8. Impress the Interviewer

### Forward-Compatible Without Over-Engineering

The `NormalizedRow` interface and `metadata: null` anticipate financial API adapters without building abstract factories or strategy registries. Just a clean interface and a null field. That's the line between forward-compatible design and premature abstraction.

**How to bring it up:** "The metadata field is always null for CSV, but it matches the database schema that reserves a JSONB column for financial API data. We defined the contract now to avoid a schema migration later, without building anything we don't need yet."

### Pipeline Guarantees Make Non-Null Assertions Safe

In isolation, `!` is a code smell. In a pipeline where stage N only runs if stage N-1 succeeded, you can reason about invariants. The CSV adapter validates required headers exist. The normalizer only processes validated rows. The assertions document that contract at the type level.

**How to bring it up:** "The non-null assertions aren't hope — they're a contract with the upstream validation stage. The adapter guarantees required headers exist before any rows reach the normalizer."

### Keeping Amount as a String Is a Financial-Data Decision

Every junior dev's instinct is to `parseFloat` a number immediately. In financial software, that instinct is wrong. IEEE 754 can't represent most decimal fractions exactly. By keeping amount as a string from CSV through normalization through database insertion, we hand exact arithmetic to PostgreSQL's `numeric` type. Zero precision loss.

**How to bring it up:** "We deliberately keep amount as a string through the entire pipeline. JavaScript's floating-point can't represent all decimals exactly, and for financial data, 'close enough' isn't acceptable. PostgreSQL's numeric type handles exact arithmetic."
