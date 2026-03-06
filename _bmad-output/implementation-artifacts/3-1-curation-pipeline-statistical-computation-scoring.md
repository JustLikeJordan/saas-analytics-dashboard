# Story 3.1: Curation Pipeline — Statistical Computation & Scoring

Status: done

## Story

As the **system**,
I want to compute statistical analysis locally and score findings by significance,
So that only the most relevant curated context is sent to the AI service, never raw data.

## Acceptance Criteria

1. **Curation Pipeline Execution** — Given an organization has data (seed or uploaded), when the curation pipeline runs, then Layer 1 (computation) calculates statistics using simple-statistics 7.8.x: totals, averages, trends, anomalies, category breakdowns. Layer 2 (scoring) ranks computed stats by configurable weights stored as JSON config (tunable without code changes). The top-scored findings are passed forward. (FR23)

2. **Tunable Scoring Configuration** — Given the scoring weights config exists, when a developer adjusts weights, then scoring behavior changes without code modifications — only JSON config changes needed.

3. **Privacy-by-Architecture Output** — Given the computation layer receives data, when it produces `ComputedStat[]` output, then the output contains statistical summaries only — no `DataRow[]` objects. `assembly.ts` accepts `ComputedStat[]`, not `DataRow[]`. This constraint is enforced at the TypeScript type level.

## Tasks / Subtasks

- [x] Task 1: Define curation pipeline types (AC: #3)
  - [x] 1.1 Create `apps/api/src/services/curation/types.ts` with `ComputedStat`, `ScoredInsight`, `StatType` enum
  - [x] 1.2 Ensure `ComputedStat` carries only statistical summaries — no raw row references, no row IDs, no trace-back to original data. Fields: `statType`, `category`, `value`, `comparison` (optional), `details` (stat-specific metadata)
  - [x] 1.3 `ScoredInsight` must contain ONLY: `stat` (ComputedStat), `score` (number), `breakdown` (object with weight contributions). No raw row references — privacy boundary enforced by type shape
  - [x] 1.4 Add `ScoringConfig` type and `scoringConfigSchema` (Zod 3.x) for runtime validation of JSON config

- [x] Task 2: Implement Layer 1 — Statistical Computation (AC: #1, #3)
  - [x] 2.1 Create `apps/api/src/services/curation/computation.ts` as pure functions
  - [x] 2.2 Install `simple-statistics` 7.8.x (`pnpm --filter api add simple-statistics`)
  - [x] 2.3 Implement `computeStats(rows: DataRow[]): ComputedStat[]` — the only function that touches `DataRow[]`. Drizzle's `numeric(12,2)` returns `amount` as a string — parse to number (`Number(row.amount)`) before passing to simple-statistics functions. Guard against `NaN` (skip rows where parse fails)
  - [x] 2.4 Calculate: totals (sum by category, overall), averages (mean by category, overall), trends (linear regression / growth rates), anomalies (outlier detection via IQR or std dev), category breakdowns (distribution and composition)
  - [x] 2.5 Write unit tests: `computation.test.ts` with fixture data covering each stat type, plus edge cases: empty dataset (returns `[]`), single-row category (total/average only, skip trend/anomaly), category with <3 rows (skip IQR/regression)

- [x] Task 3: Create scoring weights config (AC: #2)
  - [x] 3.1 Create `apps/api/src/services/curation/config/scoring-weights.json` with weight definitions for novelty, actionability, specificity
  - [x] 3.2 Version the config (include a `version` field)

- [x] Task 4: Implement Layer 2 — Scoring & Ranking (AC: #1, #2)
  - [x] 4.1 Create `apps/api/src/services/curation/scoring.ts`
  - [x] 4.2 Implement `scoreInsights(stats: ComputedStat[], config: ScoringConfig): ScoredInsight[]`
  - [x] 4.3 Load config from JSON at module initialization (once, cached). Validate with `scoringConfigSchema` (Zod). If file missing or invalid, throw `AppError` at startup — fail fast. Rank by weighted score, return top-N findings
  - [x] 4.4 Write unit tests: `scoring.test.ts` verifying rank ordering, config tunability, invalid config rejection

- [x] Task 5: Create pipeline orchestrator (AC: #1)
  - [x] 5.1 Create `apps/api/src/services/curation/index.ts` — orchestrates computation → scoring
  - [x] 5.2 Accept `DataRow[]` input, return `ScoredInsight[]` output. Use existing `dataRowsQueries.getRowsByDataset(orgId, datasetId)` from `db/queries/index.ts` barrel — do NOT create a new query function (identical functionality already exists, multi-tenancy enforced)
  - [x] 5.3 Write integration test verifying end-to-end pipeline with fixture data

## Dev Notes

### Architecture Compliance

**Three-Layer Curation Pipeline** — this story implements Layers 1 and 2 only. Layer 3 (assembly — prompt construction for Claude) is Story 3.2. The pipeline orchestrator in `index.ts` should be designed so Story 3.2 can extend it by adding the assembly step.

**Privacy Boundary (NON-NEGOTIABLE):**
- `computation.ts` is the ONLY module that receives `DataRow[]`
- Its output is `ComputedStat[]` — statistical summaries only
- `scoring.ts` receives `ComputedStat[]`, outputs `ScoredInsight[]`
- `assembly.ts` (Story 3.2) will receive `ScoredInsight[]`, NEVER `DataRow[]`
- This is enforced by TypeScript types — not just convention

**Data Flow for This Story:**
```
DataRow[] → computation.ts → ComputedStat[] → scoring.ts → ScoredInsight[]
```

### Edge Case Handling

- **Empty dataset**: `computeStats([])` returns `[]` — not an error, just no insights to score
- **Single-row category**: Compute total and average only. Skip trend detection (needs ≥3 points) and anomaly detection (needs ≥3 points for IQR)
- **Category with <3 rows**: Skip IQR outlier detection and linear regression. Still compute totals, averages, and category breakdown percentages
- **All rows same amount**: Standard deviation = 0, no anomalies flagged. Trend slope = 0 (flat). This is a valid, boring result — not an error
- **Negative amounts**: Valid for expenses. `sum()` and `mean()` handle negatives correctly. Category breakdowns should use absolute values for percentage composition

### Library: simple-statistics 7.8.x

ES6 named imports only — no default export:
```typescript
import { mean, median, standardDeviation, linearRegression, linearRegressionLine, interquartileRange, sum, min, max } from 'simple-statistics';
```

Key functions for each stat type:
- **Totals**: `sum()` on amount arrays, grouped by category
- **Averages**: `mean()`, `median()` on category/overall amounts
- **Trends**: `linearRegression()` + `linearRegressionLine()` on time-series `[x, y]` pairs (x = date as epoch, y = amount)
- **Anomalies**: `standardDeviation()` for z-score outlier detection, or `interquartileRange()` for IQR method. IQR is more robust to skewed data — prefer IQR for financial data.
- **Category breakdowns**: Group by `category` field, compute distribution percentages

**Pure function design** — computation functions must have no side effects, no database calls, no logging of data content. They receive arrays and return arrays.

### Scoring Weights Config Shape

```json
{
  "version": "1.0",
  "topN": 8,
  "weights": {
    "novelty": 0.35,
    "actionability": 0.40,
    "specificity": 0.25
  },
  "thresholds": {
    "anomalyZScore": 2.0,
    "trendMinDataPoints": 3,
    "significantChangePercent": 10
  }
}
```

Weights are multiplied against each `ComputedStat`'s intrinsic scores to produce a final relevance score. `topN` controls how many insights pass to Layer 3. Thresholds gate what qualifies as an anomaly or significant trend.

### Scope Boundaries (What This Story Does NOT Touch)

- **AI summary caching** — `ai_summaries` table, `markStale(orgId)` on upload, cache-first strategy: all Story 3.2
- **Subscription gate** — Free-tier ~150 word truncation + `upgrade_required` SSE event: Story 3.5. This story's pipeline outputs unconditionally
- **Rate limiting** — 5/min/user for AI endpoints: Story 3.3 route handler responsibility
- **SSE streaming** — Story 3.3

### Data Source Awareness

The computation layer works on `data_rows` table data. Key fields:
- `category` (string) — flat categorization
- `parent_category` (string, nullable) — hierarchical grouping (Growth-tier APIs)
- `date` (date) — transaction date
- `amount` (numeric) — monetary value
- `label` (string) — description
- `metadata` (jsonb) — source-specific fields

**Demo mode consideration**: The pipeline is data-source agnostic. `getRowsForCuration(orgId, datasetId)` fetches all rows for the given dataset regardless of `is_seed_data` flag. The caller (route handler in Story 3.2+) decides which dataset to pass. This story's functions don't need to know about demo mode.

### Orchestrator Logging

The `index.ts` orchestrator (not the pure functions) should log pipeline progress:
```typescript
logger.info({ orgId, datasetId, rowCount: rows.length }, 'curation pipeline started');
logger.info({ orgId, statCount: stats.length }, 'curation layer 1 complete');
logger.info({ orgId, insightCount: insights.length, topN: config.topN }, 'curation layer 2 complete');
```
Pure functions (`computation.ts`, `scoring.ts`) must NOT log — they're deterministic and testable without side effects.

### Config Loading Strategy

`scoring.ts` loads `scoring-weights.json` once at module initialization (top-level `const`). This is a new pattern in the codebase — existing config uses env vars via Zod in `config.ts`, but scoring weights belong in a tunable JSON file. Load via `readFileSync` + `JSON.parse` (not ESM JSON import — avoids experimental flag issues). Validated with Zod `scoringConfigSchema` from `types.ts`. If the file is missing or fails validation, the module throws `AppError` immediately — fail fast at import time, not at first scoring call. This means bad config surfaces on server startup, not when a user requests an AI summary.

### Existing Patterns to Follow

**Service pattern** (reference: `apps/api/src/services/dataIngestion/csvAdapter.ts`):
- Domain-focused modules with clear input/output contracts
- Pure validation and transformation logic
- Errors thrown as typed `AppError` subclasses

**Query pattern** (reference: `apps/api/src/db/queries/charts.ts`):
- `orgId` required as first parameter on every query function
- Fetch with Drizzle ORM `db.query` or `db.select`
- Return typed results

**Test pattern** (reference: `apps/api/src/services/dataIngestion/csvAdapter.test.ts`):
- Co-located test files (`computation.test.ts` next to `computation.ts`)
- Vitest with `describe/it/expect`
- `vi.clearAllMocks()` in `beforeEach`
- Fixture data as typed constants, not JSON files
- No `__mocks__/` directories — use `vi.mock()` inline

**Import order**:
1. Node standard library (`node:` prefix)
2. Third-party packages (`simple-statistics`)
3. (blank line)
4. Internal imports (`../../db/queries/index.js`)

**Logging** (for orchestrator, not pure functions):
```typescript
import { logger } from '../../lib/logger.js';
logger.info({ orgId, datasetId, statCount: stats.length }, 'curation pipeline completed');
```

**Error handling**: Catch specific errors you can handle. Let everything else propagate. No catch-log-rethrow.

### Project Structure Notes

All new files go under `apps/api/src/services/curation/`:
```
apps/api/src/services/curation/
├── types.ts               # ComputedStat, ScoredInsight, StatType, ScoringConfig
├── computation.ts         # Pure stats (simple-statistics 7.8.x)
├── computation.test.ts    # Unit tests for computation
├── scoring.ts             # Relevance weights + ranking
├── scoring.test.ts        # Unit tests for scoring
├── index.ts               # Pipeline orchestrator (computation → scoring)
├── index.test.ts          # Integration test for full pipeline (including empty dataset edge case)
└── config/
    └── scoring-weights.json  # Tunable weights (novelty, actionability, specificity)
```

Existing query reused (no new query needed):
```
apps/api/src/db/queries/dataRows.ts  # getRowsByDataset() already exists — use directly
```

**Alignment with architecture.md**: File names match architecture exactly (`computation.ts`, `scoring.ts`, `index.ts`). The `assembly.ts` and `config/prompt-templates/` are deferred to Story 3.2.

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Curation Pipeline Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Boundaries]
- [Source: _bmad-output/planning-artifacts/architecture.md#Database Tables]
- [Source: _bmad-output/planning-artifacts/architecture.md#Service Architecture]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3 Story 3.1]
- [Source: _bmad-output/planning-artifacts/prd.md#FR23 — Local stats + curated LLM context]
- [Source: _bmad-output/project-context.md#Privacy-by-architecture]

### Previous Story Intelligence (from Epic 2)

**Gotchas to avoid:**
- **V8 Date permissiveness**: `new Date("hello 1")` returns a valid date. Pre-gate date parsing with regex validation before passing to simple-statistics trend analysis.
- **Stale shared/dist**: After any changes to `packages/shared`, run `pnpm --filter shared build`. If adding shared types (unlikely for this story — curation types are service-internal), rebuild first.
- **Timing-safe comparisons**: Not relevant for this story (no auth/hash operations).
- **jsdom 28 + Node 22**: Test environment is already configured. No special setup needed for pure function tests.

**What worked well in Epic 2:**
- Co-located test files with fixture constants (not JSON files)
- Pure function design made testing straightforward
- `vi.clearAllMocks()` in `beforeEach` for clean test isolation

### Git Intelligence

Recent commit patterns from Epic 2:
- `feat:` prefix for new functionality
- `fix:` for corrections found in code review
- `docs:` for `_explained.md` updates
- Conventional commits, imperative mood, lowercase, <72 chars

Expected commits for this story:
```
feat: add curation pipeline types (ComputedStat, ScoredInsight)
feat: implement statistical computation layer with simple-statistics
feat: implement scoring layer with configurable weights
feat: add curation pipeline orchestrator
```

### Technical Specifics

**simple-statistics 7.8.x** — Zero dependencies, ~20KB minified. ESM and CJS dual-published. All functions accept plain arrays of numbers. Key API:

| Function | Input | Output | Use Case |
|----------|-------|--------|----------|
| `sum(arr)` | `number[]` | `number` | Category/overall totals |
| `mean(arr)` | `number[]` | `number` | Category/overall averages |
| `median(arr)` | `number[]` | `number` | Median amounts (robust to outliers) |
| `standardDeviation(arr)` | `number[]` | `number` | Anomaly detection (z-score) |
| `interquartileRange(arr)` | `number[]` | `number` | Anomaly detection (IQR method) |
| `linearRegression(pairs)` | `[number, number][]` | `{m, b}` | Trend slope + intercept |
| `linearRegressionLine(params)` | `{m, b}` | `(x) => y` | Predict values on trend line |
| `quantile(arr, p)` | `number[], number` | `number` | Q1/Q3 for IQR bounds |
| `min(arr)` / `max(arr)` | `number[]` | `number` | Range calculations |

**IQR outlier detection** (preferred for financial data):
```typescript
const q1 = quantile(amounts, 0.25);
const q3 = quantile(amounts, 0.75);
const iqr = q3 - q1;
const lower = q1 - 1.5 * iqr;
const upper = q3 + 1.5 * iqr;
// Values outside [lower, upper] are outliers
```

### Critical Rules Checklist

- [ ] No `process.env` — all env through `config.ts`
- [ ] No `console.log` — Pino structured logging only
- [ ] `org_id` on every database query
- [ ] `ComputedStat[]` output — no `DataRow[]` leakage past computation layer
- [ ] `amount` parsed from string to number before simple-statistics calls (Drizzle numeric returns string)
- [ ] Scoring weights in JSON config — no hardcoded weights
- [ ] Pure functions in computation layer — no side effects
- [ ] Co-located tests with `.test.ts` suffix
- [ ] Import order: stdlib → third-party → (blank line) → internal
- [ ] Error classes from `lib/appError.ts`
- [ ] Conventional commit messages

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- TypeScript type-check caught `Object is possibly 'undefined'` on array access in sorted time-series — fixed with non-null assertions on guarded arrays
- TypeScript type-check caught Drizzle's `metadata: unknown` vs `Record<string, unknown> | null` mismatch — relaxed the local DataRow interface to accept `unknown`
- Integration test needed logger mock because `logger.ts` imports `config.ts` which validates env vars at import time — consistent with all other test files in the project

### Completion Notes List
- Task 1: Defined `ComputedStat`, `ScoredInsight`, `StatType` const object, `ScoringConfig` type + `scoringConfigSchema` Zod validator. Privacy boundary enforced by type shape — no raw data fields exist on output types
- Task 2: Implemented `computeStats()` as pure functions using simple-statistics 7.8.x. Covers totals, averages, trends (linear regression), anomalies (IQR method), and category breakdowns. 13 unit tests covering all stat types + edge cases (empty, single-row, NaN amounts, negatives, all-same-amount). Amount string→number parsing with NaN guard
- Task 3: Created scoring-weights.json with version 1.0, topN=8, weights (novelty 0.35, actionability 0.40, specificity 0.25), thresholds (anomalyZScore 2.0, trendMinDataPoints 3, significantChangePercent 10)
- Task 4: Implemented `scoreInsights()` with intrinsic scoring functions (novelty, actionability, specificity) combined via configurable weights. Config loaded once at module init via readFileSync + Zod validation — fail-fast on bad config. 9 unit tests covering ranking, weight tunability, invalid config rejection, privacy check
- Task 5: Created pipeline orchestrator `runCurationPipeline(orgId, datasetId)` that fetches rows via existing `dataRowsQueries.getRowsByDataset()`, runs computation → scoring, logs progress. 4 integration tests including end-to-end, sorting, empty dataset, and privacy leak check. Re-exports types for downstream consumers
- All 26 test files pass (245 tests), zero regressions. TypeScript type-check clean

### File List
- apps/api/src/services/curation/types.ts (new)
- apps/api/src/services/curation/computation.ts (new)
- apps/api/src/services/curation/computation.test.ts (new)
- apps/api/src/services/curation/scoring.ts (new)
- apps/api/src/services/curation/scoring.test.ts (new)
- apps/api/src/services/curation/index.ts (new)
- apps/api/src/services/curation/index.test.ts (new)
- apps/api/src/services/curation/config/scoring-weights.json (new)
- apps/api/src/services/curation/types.ts_explained.md (new)
- apps/api/src/services/curation/computation.ts_explained.md (new)
- apps/api/src/services/curation/scoring.ts_explained.md (new)
- apps/api/src/services/curation/index.ts_explained.md (new)
- apps/api/package.json (modified — added simple-statistics dependency)

### Change Log
- 2026-03-05: Implemented Story 3.1 — Curation Pipeline Statistical Computation & Scoring. Created 3-layer pipeline types, pure-function statistical computation (simple-statistics 7.8.x), configurable scoring with JSON weights + Zod validation, and pipeline orchestrator. 26 tests added across 3 test files. Privacy-by-architecture enforced at type level — DataRow[] never leaves computation.ts
- 2026-03-06: Code review fixes — 2 MEDIUM, 3 LOW issues resolved. (M1) Wired trendMinDataPoints config into computation via opts parameter. (M2) Replaced untyped Record details with discriminated union per StatType. (L1) Cached median() in computeAverages. Added 1 test for trendMinPoints. 246 tests passing, type-check clean.
