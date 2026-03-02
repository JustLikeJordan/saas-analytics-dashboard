# interface.ts — Interview-Ready Documentation

> Source file: `apps/api/src/services/adapters/interface.ts` (43 lines)

---

## 1. 30-Second Elevator Pitch

This file defines the contract that every data source must implement. Right now there's only one adapter — CSV — but the architecture is designed so a QuickBooks or Stripe adapter could plug in later without changing anything in the route handler. The route handler calls `adapter.parse()` and `adapter.validate()`, and it has no idea what's behind those methods. This file is the seam between "where data comes from" and "what we do with it."

**How to say it in an interview:** "This is the adapter interface that decouples data ingestion from processing. Route handlers depend on the contract, not the implementation. Adding a new data source means writing a new adapter that satisfies these types — zero changes to existing code."

---

## 2. Why This Approach?

### Decision 1: Separate interfaces instead of one big blob

**What's happening:** There are five distinct interfaces here: `ColumnValidationError`, `ValidationResult`, `ParsedRow`, `ParseResult`, and `PreviewData`. Each represents one step of the pipeline. Errors are separate from results, parsed rows are separate from the metadata around them. You could lump everything into one "UploadResult" type, but then every consumer would get fields it doesn't care about.

**How to say it in an interview:** "Each interface maps to a pipeline stage. Separating them means a function that only needs validation results doesn't depend on preview-specific fields. Narrow types reduce coupling between pipeline stages."

**Over alternative:** A single `UploadResult` interface with every field. Violates interface segregation — a validate-only consumer shouldn't know about `previewToken`.

### Decision 2: `DataSourceAdapter` interface with two methods

**What's happening:** The adapter contract requires just two methods: `parse(buffer)` and `validate(headers)`. Parse takes raw bytes and returns structured rows. Validate checks that required columns exist. Keeping them separate lets you validate first (cheap) and parse only if validation passes (expensive). The route handler calls `validate(headers)` before doing the full row parse.

**How to say it in an interview:** "The adapter exposes parse and validate as separate methods. This lets the route handler fail fast on missing columns before doing a full parse — a cheap check gates the expensive operation."

**Over alternative:** A single `process()` method that validates internally. The caller loses control over when to short-circuit. You'd parse 50K rows only to discover the headers are wrong.

### Decision 3: `ParsedRow` as a string-keyed record, not a strict shape

**What's happening:** `ParsedRow` is `{ [column: string]: string }` — a loose shape. This is intentional. Different data sources have different columns. A CSV adapter might produce `{ date, amount, category }`. A future bank adapter might produce `{ transaction_date, debit, credit, memo }`. The adapter normalizes its source into this generic shape, and the downstream pipeline handles the mapping to domain types.

**How to say it in an interview:** "ParsedRow uses an index signature because adapters can produce arbitrary columns. The adapter normalizes its source into a flat record — downstream code maps to domain types. This keeps the interface generic enough for future data sources."

**Over alternative:** A strict `{ date: string; amount: string; category: string }` shape. Works for CSV, breaks when you add a bank statement adapter with different columns.

---

## 3. Code Walkthrough

### ColumnValidationError (lines 1-5)

The shape of a single column-level error. `column` identifies which column failed, `message` is human-readable, `row` is optional (for row-level errors vs. header-level errors). Used in both the API error response and the frontend error display — the shared type ensures they agree on the shape.

### ValidationResult (lines 7-10)

A pass/fail wrapper. `valid: boolean` gates the fast path. If false, `errors` contains one or more `ColumnValidationError` entries. The route handler checks `valid` before proceeding to parse — this is the cheap pre-flight check.

### ParsedRow (lines 12-14)

A single row as a string-keyed record. All values are strings — type coercion (string to number, string to Date) happens later in the pipeline, not in the adapter. This keeps the adapter's job simple: turn raw bytes into structured strings.

### ParseResult (lines 16-21)

The output of `adapter.parse()`. Contains the normalized `headers` array, all `rows`, a `rowCount` for display, and `warnings` for non-fatal issues (like "2 rows had blank dates and were skipped"). Warnings don't prevent the upload — they surface in the preview UI so the user knows what was dropped.

### PreviewData (lines 23-33)

The shape that reaches the frontend. Adds `sampleRows` (first N rows for the preview table), `validRowCount` / `skippedRowCount` for the summary, `columnTypes` (inferred types like 'date', 'number', 'text' for the preview badges), `fileName`, and `previewToken` (HMAC-signed token for TOCTOU protection on confirm). This is a superset of `ParseResult` — it includes everything the preview UI needs.

### DataSourceAdapter (lines 40-43)

The contract. `parse(buffer: Buffer)` and `validate(headers: string[])`. That's it. The JSDoc comment calls out the architectural intent: CSV adapter now, financial API adapters in the Growth tier. The comment names QuickBooks and Stripe specifically so a future developer knows this isn't speculative abstraction — there's a product roadmap behind it.

---

## 4. Complexity and Trade-offs

**All types, no runtime cost.** This file compiles to nothing — TypeScript interfaces are erased at runtime. Zero bytes in the production bundle. The entire value is at compile time: type-checking, autocompletion, refactoring safety.

**ParsedRow is stringly-typed.** Every value is a `string`. Downstream code has to coerce amounts to numbers and dates to Date objects. This is deliberate — the adapter doesn't know which columns are numeric — but it shifts validation burden downstream.

**No generics on the adapter.** `DataSourceAdapter` could be generic over the row type (`DataSourceAdapter<Row extends ParsedRow>`). I kept it simple because there's only one adapter today. If a second adapter needs different return types, generics would be the right evolution.

**PreviewData couples backend and frontend.** This interface includes `previewToken`, which is an implementation detail of the server's TOCTOU protection. Moving it to the shared `types` package might be cleaner, but for now it lives here next to the adapter that produces it.

**How to say it in an interview:** "These interfaces compile away entirely — zero runtime cost. The trade-off is stringly-typed row values, which shifts coercion downstream. I chose this because adapters can't know which columns are numeric — that's domain logic, not parsing logic."

---

## 5. Patterns and Concepts Worth Knowing

### Strategy Pattern (Pluggable Adapters)

The Strategy pattern lets you swap algorithms at runtime without changing the code that uses them. Think of it like a universal remote: the remote (route handler) has a "play" button, and the TV brand (adapter) determines what happens when you press it. `DataSourceAdapter` is the remote's interface — the CSV adapter is one brand, a future Stripe adapter is another. The route handler calls `adapter.parse()` without knowing or caring which implementation runs.

**Interview-ready:** "DataSourceAdapter implements the Strategy pattern. The route handler depends on the interface, not a concrete implementation. Swapping CSV for a bank API adapter requires no changes to the route — just a different adapter instance."

### Interface Segregation Principle

One of the five SOLID principles. It says: don't force a class to implement methods it doesn't use. Here, `ValidationResult` and `ParseResult` are separate types instead of one combined type. Code that only validates doesn't depend on parse-specific fields. If they were merged, a validator would "see" fields like `sampleRows` that make no sense in a validation context.

**Interview-ready:** "I split the result types to follow interface segregation. A validate-only consumer doesn't depend on parse-specific fields like sampleRows or previewToken."

### Type Erasure

TypeScript interfaces don't exist at runtime. They're a compile-time tool for catching bugs, guiding autocompletion, and documenting contracts. This file produces zero JavaScript output. The runtime behavior is entirely determined by the classes that implement these interfaces.

**Interview-ready:** "These interfaces are compile-time only — they erase to nothing in the bundle. The entire value is static analysis: type checking, IDE support, and documentation."

---

## 6. Potential Interview Questions

### Q1: "Why not use an abstract class instead of an interface?"

**Context if you need it:** The interviewer is testing whether you understand the difference between TypeScript interfaces and abstract classes.

**Strong answer:** "An abstract class would ship runtime code and force single inheritance. The interface is pure type information — zero runtime overhead. If I needed shared behavior across adapters (like a common logging method), an abstract base class would make sense. Right now each adapter is independent, so an interface is the right tool."

**Red flag:** "Interfaces and abstract classes are basically the same thing." — They're not. Abstract classes produce JavaScript, enforce single inheritance, and can contain implementation.

### Q2: "How would you add a QuickBooks adapter?"

**Context if you need it:** Tests whether the abstraction actually works or is just theoretical.

**Strong answer:** "Create a new class implementing `DataSourceAdapter`. Its `parse()` would call the QuickBooks API, normalize the response into `ParseResult`, and map their fields to our column structure. Its `validate()` would check for required fields in the API response. The route handler doesn't change — I'd inject the adapter based on the data source type."

**Red flag:** "I'd add QuickBooks-specific logic to the route handler." — That defeats the entire purpose of the adapter pattern.

### Q3: "Why are all ParsedRow values strings?"

**Context if you need it:** Probes whether the stringly-typed design is intentional.

**Strong answer:** "The adapter's job is parsing, not domain logic. A CSV cell is inherently a string — the adapter can't know which columns should be numbers or dates without domain knowledge. Type coercion happens downstream, closer to the business logic, where the rules live."

**Red flag:** "We should add proper types for each column." — That would couple the adapter to one specific data schema, breaking it for future adapters with different columns.

### Q4: "What would you change if you had five adapters instead of one?"

**Context if you need it:** Tests your ability to evolve a simple design.

**Strong answer:** "I'd add a registry that maps source types to adapter instances — probably a Map or factory function. I might add generics to `DataSourceAdapter<Row>` if different adapters need different ParsedRow shapes. And I'd likely extract a shared validation base if multiple adapters check for the same required columns."

**Red flag:** "Nothing — the interface handles it." — With five adapters, you'd want at least a factory pattern for instantiation.

---

## 7. Data Structures & Algorithms Used

### Index Signature (`{ [column: string]: string }`)

**What it is:** A TypeScript feature that says "this object can have any string keys, and all values are strings." Think of it like a flexible form — you don't know ahead of time which fields it'll have, but you know every answer will be text.

**Where it appears:** `ParsedRow` (line 13).

**Why this one:** Different data sources produce different columns. A rigid type like `{ date: string; amount: string }` would break for a bank adapter that uses `transaction_date` and `debit`. The index signature accommodates any column set.

**Complexity:** O(1) for property access (JavaScript objects are hash maps under the hood).

**How to say it in an interview:** "ParsedRow uses an index signature because adapters produce varying columns. Property access is O(1) — JavaScript objects are implemented as hash maps."

### Discriminated Result Types

**What it is:** `ValidationResult` has a `valid: boolean` that acts as a discriminant. When `valid` is `true`, you know `errors` is empty. When `false`, `errors` is populated. The boolean tells you which "branch" of the type you're in.

**Where it appears:** `ValidationResult` (lines 7-10).

**Why this one:** Instead of throwing exceptions for validation failures (which are expected, not exceptional), the result type makes success and failure explicit in the return value. The caller must handle both cases.

**Complexity:** O(1) — checking a boolean.

**How to say it in an interview:** "ValidationResult uses a boolean discriminant instead of exceptions. Validation failures are expected, not exceptional — encoding them in the return type forces callers to handle both cases."

---

## 8. Impress the Interviewer

### This File Is the Architecture's Extension Point

**What's happening:** The product roadmap includes QuickBooks and Stripe integrations in the Growth tier. This interface is the seam where those integrations will plug in. The route handler already calls `adapter.parse()` and `adapter.validate()` — it doesn't know or care that the current implementation is CSV-specific. When a Stripe adapter ships, the route handler won't change.

**Why it matters:** Most interviewers have seen over-engineered abstractions ("we might need this someday"). This one is different — there's a product roadmap behind it. The JSDoc comment names the specific integrations. That's an abstraction with a clear, documented justification.

**How to bring it up:** "The adapter interface exists because the product roadmap includes financial API integrations — QuickBooks and Stripe in the Growth tier. The route handler already depends on the interface, not the CSV implementation. When those adapters ship, the existing code doesn't change."

### Compile-Time-Only Architecture

**What's happening:** This file produces zero JavaScript. Every interface, every type, every JSDoc comment — erased by the compiler. The architecture enforcement is entirely static. But that doesn't make it less real. A developer who tries to pass wrong types into `parse()` gets a compile error, not a runtime crash in production.

**Why it matters:** Runtime type checking (like Zod at boundaries) costs CPU cycles. Compile-time types cost nothing at runtime. Using both — Zod at the HTTP boundary, TypeScript interfaces between internal modules — gives you safety without overhead.

**How to bring it up:** "This file compiles to zero JavaScript — all the enforcement is static. I use Zod for runtime validation at system boundaries and TypeScript interfaces for internal contracts. The split avoids double-checking: the adapter's output is trusted internally because the type system guarantees its shape."
