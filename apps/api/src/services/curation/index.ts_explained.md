# `index.ts` — Curation Pipeline Orchestrator

## 1. 30-Second Elevator Pitch

This file is the front door to the curation pipeline. It fetches raw data rows from the database, runs them through two processing layers (computation, then scoring), and hands back ranked insights. Think of it like a factory foreman: it doesn't do any of the actual work itself, but it knows the order of operations and keeps a log of progress. At ~25 lines, it's intentionally thin — the real logic lives in `computation.ts` and `scoring.ts`.

**How to say it in an interview:** "The curation pipeline orchestrator coordinates a multi-stage data transformation. It's responsible for sequencing, logging, and providing a single entry point — while delegating domain logic to pure functions in separate modules."

## 2. Why This Approach?

**Orchestrator stays dumb on purpose.** The function doesn't compute anything or decide what's interesting. It calls `computeStats`, then `scoreInsights`, and that's it. This makes each layer independently testable. You can unit-test `computeStats` with fake rows and never worry about database connections or logging noise.

**Only the orchestrator logs.** The inner layers (`computation.ts`, `scoring.ts`) are pure functions — same input, same output, no side effects. Logging is a side effect, so it lives here. This is a deliberate architectural choice: if you scatter `logger.info` calls throughout pure functions, you make them harder to test and harder to reason about.

**Re-exports create a clean public API.** The last two lines (`export type` and `export`) mean downstream code can `import { ScoredInsight } from './curation'` without reaching into internal files. If you later reorganize the internals, consumers don't break.

## 3. Code Walkthrough

The file does five things in order:

1. **Fetch rows** — `dataRowsQueries.getRowsByDataset(orgId, datasetId)` pulls all data rows for a given org and dataset from Postgres. The `orgId` parameter is there for multi-tenant isolation — every query in this codebase is scoped to an org.

2. **Early return on empty** — If there are zero rows, return an empty array immediately. No point running statistical computations on nothing.

3. **Layer 1: Computation** — `computeStats(rows)` crunches the raw data into `ComputedStat[]`. These are things like averages, totals, growth rates — statistical facts about the data.

4. **Layer 2: Scoring** — `scoreInsights(stats)` takes those computed stats and ranks them by how interesting or actionable they are. The output is `ScoredInsight[]`, sorted by relevance.

5. **Structured logging at each step** — Three `logger.info` calls track the pipeline's progress with machine-readable context (`rowCount`, `statCount`, `insightCount`). This is Pino structured logging — you pass an object first, then a message string.

**How to say it in an interview:** "The pipeline follows a sequential transformation pattern: raw rows become computed statistics, which become scored insights. Each transformation is a pure function call, and the orchestrator handles I/O and observability."

## 4. Complexity and Trade-offs

**Time complexity** depends entirely on the inner layers. This function itself is O(1) overhead — it's just three function calls and three log statements. The real cost is in `computeStats` (likely O(n) over rows) and `scoreInsights` (likely O(n log n) if it sorts).

**Trade-off: eagerly loading all rows.** `getRowsByDataset` pulls everything into memory at once. For an SMB analytics tool with CSV uploads, this is fine — datasets are small (hundreds to low thousands of rows). For millions of rows, you'd want streaming or pagination. The team made a conscious choice to keep it simple for the MVP.

**Trade-off: no parallelism.** Layer 2 depends on Layer 1's output, so you can't run them concurrently. That's not a limitation of the design — it's the nature of the problem. You can't score insights you haven't computed yet.

## 5. Patterns and Concepts Worth Knowing

**Pipeline pattern.** Data flows through a sequence of transformations, each producing the input for the next. You'll see this everywhere: Unix pipes, ETL systems, compiler passes, middleware chains. The key property is that each stage has a well-defined input and output type.

**Barrel exports.** The `export type { ... } from './types.js'` lines make this file a barrel — a single import point that re-exports from internal modules. It hides the internal file structure from consumers.

**Pure functions with an impure shell.** The orchestrator is the impure shell (it does I/O: database reads, logging). The layers it calls are pure (deterministic, no side effects). This separation is borrowed from functional programming and makes testing dramatically easier.

**Structured logging.** Instead of `logger.info('started pipeline for org 5')`, you pass `{ orgId: 5 }` as a separate object. Log aggregation tools (Datadog, Grafana) can then filter and query on `orgId` directly, without parsing strings.

## 6. Potential Interview Questions

**Q: Why not put the logging inside `computeStats` and `scoreInsights`?**
A: Those are pure functions — same input always produces the same output, no side effects. Logging is a side effect. Keeping side effects in the orchestrator means the core logic stays testable without mocking a logger. You can call `computeStats` in a unit test and assert on its return value without worrying about log output.

**Q: How would you add a third layer (like LLM assembly)?**
A: You'd add a Layer 3 call after `scoreInsights`, passing the `ScoredInsight[]` into an assembly function. The orchestrator pattern makes this straightforward — just add another step and another log line. The architecture already anticipates this: `assembly.ts` will accept `ComputedStat[]` (not raw `DataRow[]`) to enforce a privacy boundary where raw data never reaches the LLM.

**Q: What happens if `getRowsByDataset` throws?**
A: The error propagates up to the caller. This is Express 5, which auto-forwards promise rejections to the error handler. There's no try-catch here because there's nothing useful this function can do about a database failure — the right place to handle it is the centralized error handler.

**Q: Why pass `orgId` when `datasetId` alone could identify the data?**
A: Multi-tenant isolation. Every database query is scoped by `orgId` to prevent one organization from accidentally (or maliciously) accessing another's data. Even if `datasetId` is unique globally, the `orgId` check is a defense-in-depth measure.

## 7. Data Structures & Algorithms Used

- **`DataRow[]`** — The raw rows from the database. Flat records with column names and values.
- **`ComputedStat[]`** — Output of Layer 1. Each stat represents a computed fact (e.g., "revenue grew 12% month-over-month"). These are structured objects, not raw numbers.
- **`ScoredInsight[]`** — Output of Layer 2. Each insight wraps a `ComputedStat` with a relevance score and ranking metadata. This is what downstream consumers (like the AI assembly layer) use to decide what's worth mentioning.

No complex algorithms in this file. The orchestrator is glue code. The algorithmic work happens in the layers it calls.

## 8. Impress the Interviewer

**"The privacy boundary is architectural, not just policy."** The curation pipeline is designed so that `assembly.ts` (Layer 3, coming in Story 3.2) accepts `ComputedStat[]` — never `DataRow[]`. Raw customer data physically cannot reach the LLM because the type system won't allow it. This is privacy-by-architecture: you don't rely on developers remembering not to pass raw data. The compiler enforces it.

**"Observability belongs at the boundary, not in the core."** Pure functions are silent. The orchestrator — the only impure piece — owns all the logging. This means you can grep for `curation pipeline started` in production logs and see every pipeline run with its `orgId`, `datasetId`, and row count, without the noise of internal debug logs from computation or scoring. It's a pattern that scales well: as you add layers, you add one log line per layer in one file.
