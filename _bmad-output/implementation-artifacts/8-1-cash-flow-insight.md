# Story 8.1: Cash Flow Insight — Trailing Burn/Surplus Stat Type

Status: review

<!-- Note: Validation is REQUIRED. Every story must complete all 4 steps: Create → Validate → Dev → Code Review. -->
<!-- Post-MVP story. Epic 8 opened 2026-04-18 for post-MVP extensions to the curation pipeline and delivery layer. -->

## Story

As a **small business owner**,
I want the AI to tell me whether I'm burning cash or building surplus over recent months,
so that I understand my current cash position without waiting for my accountant.

## Business Context

Cash flow is the #1 financial anxiety for small business owners and is already a first-class field on `BusinessProfile.topConcern` (`'cash_flow'`). Until now the curation pipeline has had nothing concrete to say about it — the AI has been inferring cash position indirectly from margin trend and totals. This story adds a dedicated `CashFlow` stat type so the LLM gets an explicit, scored signal for burn vs. surplus without relying on inference.

This is the foundation for two follow-up stories:

- **Story 8.2** — Cash Balance UX + Runway Months (adds owner-provided balance; computes `runway_months = cashBalance / monthlyBurn`)
- **Story 8.3** — Forward Cash Flow Forecast (extends `SeasonalProjection` to project next 1–3 months of net cash flow)

The Weekly Email Digest (GTM Week 3) will consume this stat as one of its three bullets — the digest is blocked by this story.

## Acceptance Criteria

1. **CashFlow stat type exists and is wired into the pipeline** — Given an organization has at least 3 months of CSV data with `parentCategory === 'Income'` and `parentCategory === 'Expenses'` rows, when `computeStats()` runs, then a new `StatType.CashFlow` is computed from a trailing window (default 3 months, configurable via `opts.cashFlowWindow`). The stat carries `monthlyNet`, `trailingMonths`, `direction` ∈ `{'burning', 'surplus', 'break_even'}`, `monthsBurning`, and a full `recentMonths` breakdown (each with `month`, `revenue`, `expenses`, `net`). (FR23)

2. **Aggregation uses the median of the window's monthly nets** — Given the window has N monthly net values, when `monthlyNet` is computed, then it is the median of those nets (not mean). Rationale: a single outlier month (unexpected equipment purchase, seasonal windfall) should not flip the direction. Use `median` from `simple-statistics` (already imported in `computation.ts`).

3. **Break-even threshold suppresses the insight** — Given `avgMonthlyRevenue > 0` and `|monthlyNet| < 0.05 × avgMonthlyRevenue` over the window, when the stat is computed, then `direction === 'break_even'` and `computeCashFlow` returns `[]`. Rationale: a restaurant with $40k monthly revenue swinging ±$500 is noise, not a cash signal. When `avgMonthlyRevenue <= 0` (degenerate case — no income at all in the window), `computeCashFlow` also returns `[]`: the threshold is ill-defined, and a business with no revenue is either a data gap or a story the AI should not editorialize on.

4. **Zero-revenue month in the window suppresses the insight** — Given any month in the window has `revenue === 0`, when the stat is computed, then `computeCashFlow` returns `[]`. Rationale: a revenue gap is a data gap, not a real burn signal (business closure, missing upload, seasonal closure — never something the AI should editorialize on).

5. **Scoring reflects urgency when burning, without inverting the margin/cash-flow relationship** — Given a stat with `direction === 'burning'` and `monthsBurning >= 2`, when `scoreInsights()` runs, then `actionabilityScore` returns `0.9` (tying `MarginTrend` when shrinking), `noveltyScore` returns `≥ 0.7`, and `specificityScore` returns `0.85` (matching `SeasonalProjection` for stats that carry exact month labels and amounts). Rationale: margin compression is the leading signal, cash burn is the trailing consequence — scoring them equal rather than elevating cash flow above margin prevents an unacknowledged reordering that would resurface in code review. Surplus direction scores moderate (not urgent but still useful context).

6. **Assembly renders the stat into the LLM prompt** — Given a `CashFlowStat` passes into `assembly.ts`, when `formatStat()` renders it, then output is one line containing signed `monthlyNet`, window size, direction, `monthsBurning`, and the relevance score — matching the existing format convention of other stat types.

7. **Prompt template guides legal-safe framing** — Given `v1.md` is updated, when the LLM receives cash flow context, then the template instructs framing of the form "you're spending about $X more than you're earning each month, worth reviewing with your accountant" — never "you should cut costs" or any prescriptive imperative. (FR26, existing legal posture from Story 3.2)

8. **Privacy boundary holds** — Given the privacy invariant established in Story 3.1, when `computeCashFlow` runs, then only `computation.ts` touches `DataRow[]`; the function emits `CashFlowStat` with statistical summaries only — no raw row references, no row IDs, no trace-back to original data. The TypeScript discriminated union on `ComputedStat` enforces this at the type level. (FR23, NFR12)

9. **Unit tests cover all documented cases** — Given the computation is a pure function, when `computation.test.ts` runs, then fixtures cover:
   - Burning business (3+ months of losses) → stat emitted, direction `'burning'`, monthsBurning correct
   - Surplus business (all positive nets) → stat emitted, direction `'surplus'`, monthsBurning `0`
   - Mixed window, median cleanly burning (2 burning + 1 small surplus, median net is clearly negative) → stat emitted, direction `'burning'`, monthsBurning `=== 2`
   - Mixed window, median near zero (1 burning + 1 surplus + 1 near-zero, median within ±5% threshold) → suppressed (empty array). This is the break-even companion to the fixture above; the two together prove the suppression-vs-direction boundary.
   - Below-threshold noise → suppressed (empty array)
   - Zero-revenue month in window → suppressed (empty array)
   - Zero-avg-revenue window (all three months have small positive but `mean()` rounds to 0, or a constructed degenerate case) → suppressed (empty array) per the AC #3 guard
   - Service business with expense-only months (all revenue present but expenses near zero) → direction `'surplus'`, specific values asserted. Covers solo consultants and similar patterns.
   - Fewer than 3 months of data → suppressed (empty array)
   - Configurable window N=3 (default): `simple-statistics.median` returns the middle element — assert `monthlyNet` equals the sorted middle net exactly
   - Configurable window N=6: `simple-statistics.median` returns the mean of the two middle elements — assert `monthlyNet` equals `(sorted[2] + sorted[3]) / 2`. This prevents a dev from hand-rolling a "middle element" median and shipping a subtle bug at even window sizes.
   - Median robustness: 2 small-loss months + 1 huge-loss month → mean would show `'burning'` badly; median should show a typical month — assert median is used, not mean

10. **Scoring tests cover urgency grading** — Given `scoring.test.ts`, when it runs, then cases for `'burning'` with `monthsBurning = 2` and `monthsBurning = 3` both score in the top-N, and `'surplus'` scores below but still within the ranked set when novel.

## Tasks / Subtasks

- [x] Task 1: Finish `computeCashFlow` business logic (AC: #1, #2, #3, #4)
  - [x] 1.1 Open `apps/api/src/services/curation/computation.ts` — the function stub at the `TODO — your turn` block
  - [x] 1.2 Import `median` from `simple-statistics` (already imported at top of file — no new import)
  - [x] 1.3 Compute `monthlyNet` as `median(recentMonths.map(m => m.net))`
  - [x] 1.4 Compute `avgMonthlyRevenue = mean(recentMonths.map(m => m.revenue))` for the break-even threshold
  - [x] 1.5 Compute `monthsBurning = recentMonths.filter(m => m.net < 0).length`
  - [x] 1.6 Determine `direction` in this exact order (early-return on each guard):
      1. If any `recentMonths[i].revenue === 0` → return `[]` (zero-revenue month, data gap)
      2. If `avgMonthlyRevenue <= 0` → return `[]` (threshold ill-defined, nothing honest to say)
      3. If `|monthlyNet| < 0.05 * avgMonthlyRevenue` → `'break_even'` → return `[]`
      4. If `monthlyNet < 0` → `'burning'`
      5. Else → `'surplus'`
  - [x] 1.7 Return a single `CashFlowStat` with typed `details`: `{ monthlyNet, trailingMonths, direction, monthsBurning, recentMonths }`. Set `category: null` and `value: monthlyNet` to match the shape used by `MarginTrendStat`.

- [x] Task 2: Wire scoring (AC: #5)
  - [x] 2.1 Open `apps/api/src/services/curation/scoring.ts`
  - [x] 2.2 Add a `case StatType.CashFlow` to `noveltyScore`: return `0.85` when `direction === 'burning'` and `monthsBurning >= 2`; `0.7` when `'burning'` and `monthsBurning === 1`; `0.5` when `'surplus'`. (Break-even never reaches this layer — suppressed in computation.)
  - [x] 2.3 Add a `case StatType.CashFlow` to `actionabilityScore`: return `0.9` when `'burning'` and `monthsBurning >= 2` (ties `MarginTrend shrinking` at `scoring.ts:79`); `0.75` when `'burning'` with `monthsBurning === 1`; `0.5` when `'surplus'`. See AC #5 rationale — preserves leading/trailing signal relationship with `MarginTrend`.
  - [x] 2.4 Add a `case StatType.CashFlow` to `specificityScore`: return `0.85` (always). Matches `SeasonalProjection` at `scoring.ts:97` — both stat types carry exact named months and amounts, so the specificity parity is intentional. `MarginTrend` stays at `0.8` because it is window-level, not month-level.

- [x] Task 3: Wire assembly / prompt formatting (AC: #6)
  - [x] 3.1 Open `apps/api/src/services/curation/assembly.ts`
  - [x] 3.2 Add a `case StatType.CashFlow` to `formatStat()` returning a one-line string matching existing conventions. Shape:
    ```
    - [Overall] Cash Flow: {direction} — net ${signedMonthlyNet}/mo over {trailingMonths} months ({monthsBurning} burning, relevance: {score})
    ```
    Example output for a burning business: `- [Overall] Cash Flow: burning — net -$4,230/mo over 3 months (3 burning, relevance: 0.88)`. Note: the em dash in this format is deliberate prompt content going to the LLM — it is NOT user-facing prose. Do not auto-correct to `--` or the existing tests that string-match this shape will fail.
  - [x] 3.3 Add `cash_flow: 'Cash Flow'` to `STAT_TYPE_LABELS` in `apps/web/app/dashboard/TransparencyPanel.tsx`. Without this, the Transparency Panel renders `'cash_flow'` as a raw key. Single-line change; prevents a cosmetic bug report.

- [x] Task 4: Extend prompt template for legal-safe framing and version-bump for cache invalidation (AC: #7)
  - [x] 4.1 Copy `apps/api/src/services/curation/config/prompt-templates/v1.md` to `v1.1.md`. Keep `v1.md` in place untouched (existing cached summaries reference it via `promptVersion` metadata — preserving the file means we don't break a replay of old caches).
  - [x] 4.2 In `v1.1.md`, extend the "rules" section with cash flow guidance under rule #4 ("Make it useful") or as a new dedicated rule. Reinforce the existing legal posture: describe the pattern ("you're spending about $X more than you're earning") and suggest action framing ("worth reviewing with your accountant", "you might want to look into"). Never prescriptive imperatives.
  - [x] 4.3 Add a margin/cash-flow deduplication line: "If both `margin_trend: shrinking` and `cash_flow: burning` appear in the stats, treat them as one pattern (margin compression causing cash burn), not two findings. Lead with margin because it is the earlier signal." Without this the LLM double-counts and reads as redundant to the owner.
  - [x] 4.4 Ensure the guidance lines up with the boundary rules at the top of `v1.1.md` ("Never tell the owner what they should do with their money").
  - [x] 4.5 Update `apps/api/src/services/curation/assembly.ts` `DEFAULT_VERSION` constant from `'v1'` to `'v1.1'` so new summaries pick up the new template. This triggers cache invalidation correctly: cached `ai_summaries` rows carry `promptVersion` in their `metadata` column; the cache-check logic in `services/aiSummary` compares against the current default and treats mismatches as stale. Existing `v1` cached rows continue to render unchanged until the user uploads new data (the intended behavior — no surprise re-generation of paid summaries).

- [x] Task 5: Unit tests — computation (AC: #9)
  - [x] 5.1 Open `apps/api/src/services/curation/computation.test.ts`
  - [x] 5.2 Add a `describe('computeCashFlow', ...)` block with the following fixtures:
    - `burningBusiness`: 3 months, each with revenue < expenses — direction `'burning'`, `monthsBurning === 3`
    - `surplusBusiness`: 3 months, each with revenue > expenses — direction `'surplus'`, `monthsBurning === 0`
    - `mixedWindowBurning`: 2 burning + 1 small surplus, median net cleanly negative → direction `'burning'`, `monthsBurning === 2`
    - `mixedWindowBreakEven`: 1 burning + 1 surplus + 1 near-zero, median within ±5% of avg revenue → suppressed (`[]`). Companion to the fixture above; together they prove the suppression-vs-direction boundary.
    - `belowThreshold`: nets within ±5% of avg revenue → suppressed (`[]`)
    - `zeroRevenueMonth`: one month has `revenue === 0` → suppressed (`[]`)
    - `zeroAvgRevenue`: all months have `revenue === 0` (or constructed so `mean(revenue) === 0` while individual months are nonzero) → suppressed (`[]`) per AC #3 guard
    - `serviceBusiness`: 3 months of revenue with near-zero expenses (solo consultant pattern) → direction `'surplus'`, specific values asserted. Proves the mirror case of zero-revenue suppression is not triggered by zero-expense.
    - `tooFewMonths`: only 2 months of data → suppressed (`[]`)
    - `windowN3`: default window of 3 — `simple-statistics.median` returns the middle element of a sorted array of 3 — assert `monthlyNet === sorted[1]`
    - `windowN6`: `opts.cashFlowWindow: 6` — `simple-statistics.median` returns mean of two middle elements — assert `monthlyNet === (sorted[2] + sorted[3]) / 2`. Prevents a hand-rolled "middle element" median bug at even window sizes.
    - `medianRobustness`: 2 small-loss months + 1 huge-loss month → mean would show `'burning'` badly; median should show a typical month — assert median is used, not mean
  - [x] 5.3 Verify typed details shape: `CashFlowDetails` fields all present, correct types

- [x] Task 6: Unit tests — scoring (AC: #10)
  - [x] 6.1 Open `apps/api/src/services/curation/scoring.test.ts`
  - [x] 6.2 Add test cases: burning+monthsBurning=2 ranks in top-N; burning+monthsBurning=3 ranks higher; surplus still scored, ranks below burning
  - [x] 6.3 Verify config tunability unchanged (adjust weights, scores shift predictably)

- [x] Task 7: Integration test — end-to-end pipeline (AC: #1, #6, #8)
  - [x] 7.1 Open `apps/api/src/services/curation/index.test.ts`
  - [x] 7.2 Add a fixture that simulates a burning business (3 months of Income + Expenses data) and run `computeStats → scoreInsights → assembleContext`
  - [x] 7.3 Assert the final prompt text contains cash flow framing and signed `monthlyNet`
  - [x] 7.4 Assert `TransparencyMetadata.statTypes` includes `'cash_flow'`
  - [x] 7.5 Assert `TransparencyMetadata.promptVersion === 'v1.1'` (regression guard for the Task 4.5 version bump — if someone reverts the bump, this test catches it).
  - [x] 7.6 Verify the privacy boundary concretely: the fixture rows have identifiable `label` strings (e.g., `'Acme Corp invoice #4218'`). Assert the assembled prompt string does NOT contain any of those exact labels. This is stronger than a generic grep — it proves no row-level data leaks through assembly.

## Dev Notes

### Starting State — Pre-existing Scaffold

The following work was done during the design phase and is already in the tree (uncommitted):

**`apps/api/src/services/curation/types.ts`** — already contains:
- `StatType.CashFlow = 'cash_flow'` added to the enum
- `CashFlowDetails` interface (shape documented in AC #1)
- `CashFlowStat` interface extending `BaseComputedStat` with `statType: 'cash_flow'`
- `CashFlowStat` added to the `ComputedStat` discriminated union

**`apps/api/src/services/curation/computation.ts`** — already contains:
- `computeCashFlow(rows, trailingMonths = 3)` function stub
- Monthly aggregation by `YYYY-MM` done (identical pattern to `computeMarginTrend`)
- `recentMonths` array built from the trailing window
- Business logic block marked with `TODO — your turn` returning `[]` (safe no-op)
- Wired into `computeStats()` with `opts.cashFlowWindow = 3` default

**Implication:** Task 1 is the ~10-line fill-in inside the TODO block. All other tasks touch new code in other files. Do not re-scaffold types.ts or the outer function shell — review the existing scaffold first.

### Architecture Compliance

**Three-Layer Curation Pipeline** (from Story 3.1 / 3.2):
- Layer 1 — `computation.ts`: receives `DataRow[]`, emits `ComputedStat[]`. Pure functions. This is where `computeCashFlow` lives.
- Layer 2 — `scoring.ts`: receives `ComputedStat[]`, emits `ScoredInsight[]`. Pure functions. Weight-driven ranking.
- Layer 3 — `assembly.ts`: receives `ScoredInsight[]`, emits `{ prompt, metadata }`. Template-driven.

**Privacy Boundary (NON-NEGOTIABLE)** — enforced by TypeScript discriminated union on `ComputedStat`:
- `computation.ts` is the only module that touches `DataRow[]`
- `CashFlowStat.details.recentMonths` carries aggregated numbers (`revenue`, `expenses`, `net`) and month keys (`YYYY-MM`) only — never row IDs, never row references, never transaction descriptions
- If the dev agent is tempted to add a `rowsUsed` field or similar trace-back, STOP — that is a privacy violation caught in the Story 3.1 pre-mortem

**Aggregation-identifiability edge case** — a single-customer-per-month consulting business would have `recentMonths[i].revenue === <that customer's contract value>`. We consider monthly-bucket aggregation adequate for the privacy boundary because: (a) it's already at Story 3.1's established granularity (other stats expose monthly totals too), (b) the LLM prompt discusses these numbers in plain English, never at row-level fidelity. Finer granularity (weekly, transaction-level) would NOT be adequate — flag it if a future story proposes it.

**Suppression is editorial judgment** — returning `[]` from `computeCashFlow` is not an error path; it is the system choosing not to say something because there is nothing honest to say. This mirrors the pattern from `computeYearOverYear` (suppresses when `Math.abs(changePercent) < 3`) and `computeMarginTrend` (suppresses when prior revenue is zero).

### Library & Framework Requirements

No new dependencies. All libraries already in the workspace:

- **`simple-statistics` 7.8.x** (already at `apps/api/package.json`) — use `median` and `mean` from the existing top-of-file import in `computation.ts`
- **`zod` 3.x** (pinned — do NOT upgrade to 4.x, breaks `drizzle-zod` per CLAUDE.md) — used only if you add runtime schema validation for the new stat type. Optional for this story; type-level safety from the discriminated union is sufficient.
- **Vitest** — existing test framework. Node environment (`apps/api/vitest.config.ts`). Tests co-located as `*.test.ts` — no `__mocks__/` directories (project convention).

### File Structure Requirements

Files to modify:

| File | Change |
|------|--------|
| `apps/api/src/services/curation/computation.ts` | Fill in `computeCashFlow` TODO block (~10 lines) |
| `apps/api/src/services/curation/scoring.ts` | Add `CashFlow` cases to all three score functions |
| `apps/api/src/services/curation/assembly.ts` | Add `CashFlow` case to `formatStat` switch; bump `DEFAULT_VERSION` to `'v1.1'` |
| `apps/api/src/services/curation/config/prompt-templates/v1.1.md` | New template: v1 + cash flow framing + margin/cash-flow dedup guidance |
| `apps/web/app/dashboard/TransparencyPanel.tsx` | Add `cash_flow: 'Cash Flow'` label entry |
| `apps/api/src/services/curation/computation.test.ts` | Add `describe('computeCashFlow', ...)` with 12 fixtures |
| `apps/api/src/services/curation/scoring.test.ts` | Add `CashFlow` scoring cases |
| `apps/api/src/services/curation/index.test.ts` | Add end-to-end burning-business fixture |

Files NOT to modify:
- `packages/shared/src/schemas/businessProfile.ts` — Story 8.2 extends this, not 8.1
- `apps/api/src/db/schema/` — no schema changes for this story (`ai_summaries` cache invalidates via `promptVersion` mismatch — see Task 4.5)
- `apps/api/src/services/curation/config/prompt-templates/v1.md` — preserve as-is; Task 4.1 creates `v1.1.md` alongside it so existing cached `v1`-versioned summaries still have a template to reference if replayed

Files added (net new):
- `apps/api/src/services/curation/config/prompt-templates/v1.1.md` — extended version with cash flow guidance

### Testing Requirements

- **Framework:** Vitest (Node env for API). Run: `pnpm --filter api test` for the API package.
- **Co-location:** Tests sit next to source as `*.test.ts`. No `__mocks__` directories.
- **Coverage expectations:** Every branch in `computeCashFlow` must have a fixture. The suppression branches are the most failure-prone — cover them first.
- **Fixture pattern:** Existing tests build `DataRow[]` with `parentCategory: 'Income' | 'Expenses'`, `amount: string` (Drizzle numeric comes back as string — parse via `Number()` inside computation), `date: Date`. Follow `computeMarginTrend` fixtures in `computation.test.ts` as the template.
- **Integration test:** End-to-end pipeline test in `index.test.ts` exercises `computeStats → scoreInsights → assembleContext`. A burning-business fixture should produce a prompt containing both signed monthly net and legal-safe phrasing hints (the prompt itself is template-driven, so assert on the assembled string).
- **Privacy assertion:** Grep the final prompt string for any row-level data shape (transaction descriptions, row IDs, raw strings that shouldn't be there). Fail the test if found.

### Previous Story Intelligence (from Stories 3.1 and 3.2)

Dev notes and learnings that shape this story:

- **Drizzle `numeric(12,2)` returns `amount` as a string** — `computation.ts` parses via `Number(row.amount)` and guards with `Number.isFinite`. The existing `parseAmount` helper already does this — `computeCashFlow` uses the same pattern. Do NOT re-introduce a float parse.
- **Median-robustness pattern** — Story 3.2 retro flagged that `mean()` alone hid anomaly influence on averages. `Median + comparison: median` became a convention. Follow it here.
- **Suppression over padding** — Story 3.2 retro also established: when a stat has nothing interesting to say, emit `[]` rather than a weak stat. A weak stat dilutes the top-N ranking and steals a slot from something better.
- **Scoring tunability** — weights live in `config/scoring-weights.json` (sums to 1.0, Zod-validated at startup). Cash flow score weights should land at the same order of magnitude as `MarginTrend` for `'burning'` cases; slightly higher for `monthsBurning >= 2` because consecutive loss months are more actionable than a single bad month.
- **Prompt template versioning** — `v1.md` is the current version. For this story we ARE bumping to `v1.1` (Task 4), not because the change is breaking, but because the `ai_summaries` cache keys on `promptVersion` — without a bump, cached summaries generated under `v1` would continue to serve without the new cash flow framing until the user re-uploads data. The bump forces cache misses on affected summaries while preserving `v1.md` as the frozen reference for replay of old metadata.

### Git Intelligence Summary

Recent commits on `main` (as of 2026-04-18):

- `cacaa8c refactor: fingerprint ExternalServiceError by service` — unrelated error handler work
- `6775a70 refactor: fingerprint ProgrammerError by devMessage` — unrelated
- `31d37c4 refactor: finish ProgrammerError wiring in error handler` — unrelated
- `1f96ea0 refactor: requireUser throws 500 not 401 on missing middleware` — unrelated
- `62d00ed refactor: retire AuthenticatedRequest cast, fix QB Retry` — unrelated

**Current uncommitted working tree** (as of story creation):
- `M apps/api/src/middleware/errorHandler.ts` — user's in-progress error-handler refactor (DO NOT TOUCH during this story's dev)
- `M apps/api/src/services/curation/types.ts` — pre-existing scaffold for this story (types + CashFlow enum) — ready for Task 1
- `M apps/api/src/services/curation/computation.ts` — pre-existing scaffold for this story (function stub + aggregation) — ready for Task 1

Dev agent should commit Task 1 separately from the user's error-handler work. Suggest a clean commit sequence:
- `feat(curation): add CashFlow stat type — trailing burn/surplus` — the types.ts scaffold and the computation.ts function body ship together in this commit. The pre-existing uncommitted changes to both files (CashFlow enum entry, CashFlowDetails/CashFlowStat interfaces, computeCashFlow stub with monthly aggregation) are entangled by design — the types define the shape the function returns. Do NOT try to split them into two commits; it's a single logical unit.
- `feat(curation): score and render CashFlow in prompt assembly (v1.1)` — scoring.ts + assembly.ts + v1.1.md + TransparencyPanel.tsx label
- `test(curation): coverage for CashFlow computation and scoring`

Conventional commit prefixes per `CLAUDE.md` (feat/fix/refactor, imperative mood, under 72 chars).

### Latest Technical Specifics

- **`simple-statistics` 7.8.x** — API stable; `median`, `mean` are pure functions, no config needed. No version migration concerns.
- **Vitest** — existing config (`apps/api/vitest.config.ts`) already handles `.ts` imports via Vite. No new setup for this story.
- **Drizzle ORM 0.45.x** — not touched by this story (no query changes). Existing `dataRowsQueries.getRowsByDataset()` barrel export is still the only path to `DataRow[]`.
- **Prompt caching** — relevant after all. The `ai_summaries` table caches by `(datasetId, promptVersion)`. Task 4.5 bumps `DEFAULT_VERSION` from `'v1'` to `'v1.1'` in `assembly.ts`; cached rows under `'v1'` become cache-miss candidates for new summary generation, so cash-flow-aware framing reaches users on their next summary request rather than only after a fresh data upload. Existing `v1` rows continue to render unchanged if read — the cache-check logic should treat version mismatch as stale but fall through to re-generation rather than throwing.

### Project Context Reference

All rules in `/Users/Corey_Lanskey/Projects/portfolio/saas-analytics-dashboard/CLAUDE.md` apply. Non-obvious ones worth re-reading before starting:

- **No `process.env` in application code** — all env via `apps/api/src/config.ts`. This story doesn't touch config but don't drift.
- **No `console.log`** — Pino structured logging only. Cash flow computation has no logging, so irrelevant here.
- **Pino format:** `logger.info({ datasetId, orgId }, 'message')` — structured object first, string last.
- **Privacy-by-architecture** — reinforces AC #8. `assembly.ts` accepts `ComputedStat[]`, not `DataRow[]`. The new stat type must respect this.
- **humanize-code (ALWAYS ON)** — no echo comments, no section headers, concise naming, early returns. The ~10 lines of `computeCashFlow` logic should read like a senior dev wrote them.
- **interview-docs (ALWAYS ON)** — generate `computation.ts_explained.md` (or update the existing one) to cover the new `computeCashFlow` function. Do NOT create a separate `computeCashFlow_explained.md` — one doc per file.
- **Testing** — Vitest, co-located `*.test.ts`. No `__mocks__` directories.

Also see:
- `_bmad-output/project-context.md` — ~228 rules, fully aligned with architecture
- `_bmad-output/planning-artifacts/architecture.md` — curation pipeline section documents the three-layer model this story extends

## Story Completion Status

- **Status:** ready-for-dev
- **Blocks:** Story 8.2 (Cash Balance UX + Runway Months), Story 8.3 (Forward Cash Flow Forecast), GTM Week 3 weekly email digest
- **Blocked by:** none (pre-scaffold already in tree)
- **Estimated scope:** 1.5–2 days (Task 1 = ~12 lines with guards + tests; Tasks 2–4 = ~5 lines each plus prompt template file + cache-version wiring; Tasks 5–7 = bulk of the time on 12 computation fixtures + scoring cases + integration test with promptVersion + privacy-label assertions)
- **Validation owner:** run Story Validation before Dev Story — confirm AC 1-10 all testable, confirm architecture compliance, confirm no FR/NFR regressions

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (1M context) via `/bmad-bmm-dev-story` workflow.

### Debug Log References

None. Test suite went from 619 → 633 tests over three iterations, all green on final run. One TypeScript narrowing issue in the computation test helper (array destructuring produced `CashFlowStat | undefined` against declared `| null` return type) was fixed by switching to a type-predicate filter: `all.filter((s): s is CashFlowStat => ...)`.

### Completion Notes List

- **Task 1 — computeCashFlow body** — Implemented ~15 lines inside the pre-scaffolded TODO block. Five guards in the exact AC-specified order: (1) zero-revenue month, (2) zero-avg-revenue, (3) break-even threshold, (4) burning, (5) surplus. Uses `median` from `simple-statistics` (already imported). Matches `computeMarginTrend`'s `'expanding' as const` narrowing pattern for `direction`.
- **Task 2 — scoring cases** — Added `CashFlow` branches to all three score functions. `actionabilityScore` returns `0.9` for burning+monthsBurning≥2 (ties `MarginTrend shrinking`), `0.75` for single-month burning, `0.5` for surplus. `noveltyScore` 0.85/0.7/0.5 across those three states. `specificityScore` flat `0.85` matching `SeasonalProjection`. Monotonicity vs `MarginTrend` documented inline.
- **Task 3 — assembly formatStat + TransparencyPanel label** — One-line prompt render with signed `monthlyNet` (format: `-$4,230/mo`), direction, months burning, relevance score. `cash_flow: 'Cash Flow'` added to `STAT_TYPE_LABELS`.
- **Task 4 — v1.1 prompt template + DEFAULT_VERSION bump** — Created `v1.1.md` alongside `v1.md` (preserved intact for cache-replay compatibility). New rules: cash flow framing guidance (rule 5) and margin/cash-flow dedup guidance (rule 6). `DEFAULT_VERSION` bumped from `'v1'` to `'v1.1'` in `assembly.ts`. Updated 2 tests that asserted against the old default (assembly.test.ts, index.test.ts); streamHandler.test.ts and aiSummary.test.ts use explicit fixture values so no change needed there.
- **Task 5 — computation tests** — 12 fixtures covering every branch: burning/surplus/mixed-burning/mixed-break-even/below-threshold/zero-revenue-month/zero-avg-revenue/service-business/too-few-months/windowN3/windowN6/median-robustness, plus a `recentMonths` shape leak check.
- **Task 6 — scoring tests** — 4 new tests: CashFlow burning appears in topN, monthsBurning=2 outranks =1, surplus ranks below burning, CashFlow does not invert vs MarginTrend (score delta < 0.05).
- **Task 7 — integration test** — End-to-end burning-business fixture through the full pipeline. Asserts `statTypes` contains `'cash_flow'`, `promptVersion === 'v1.1'`, prompt contains `Cash Flow: burning` + signed monthly net regex, and none of the fixture's identifiable row labels (`'Acme Corp invoice #4218'`, `'Main St landlord wire'`, `'Gusto payroll batch #JK2'`, etc.) survive into the assembled prompt.
- **Interview-docs update** — `computation.ts_explained.md` updated: elevator pitch now covers 9 dimensions (was 8), new `computeCashFlow` entry in the code walkthrough section, two new FAQ entries (median-vs-mean, suppression philosophy).
- **Test suite** — 633 tests passing (previously 619). TypeScript typecheck clean on both `api` and `web` packages. ESLint clean on both packages.
- **Commit sequence** — Three commits landed on `main`: `3a370b6` feat(curation): add CashFlow stat type, `09e40b6` feat(curation): score and render CashFlow in prompt assembly (v1.1), `af3b15a` test(curation): coverage for CashFlow computation, scoring, and e2e.
- **Deferred** — None. All 7 tasks complete with validator-blessed fixes applied before dev.

### File List

**Modified:**
- `apps/api/src/services/curation/types.ts` — CashFlow enum, CashFlowDetails, CashFlowStat in discriminated union (done during story scoping; committed here)
- `apps/api/src/services/curation/computation.ts` — `computeCashFlow` body filled in (~15 lines in the TODO block), `computeStats` already wired with `opts.cashFlowWindow`
- `apps/api/src/services/curation/scoring.ts` — `CashFlow` case added to `noveltyScore`, `actionabilityScore`, `specificityScore`
- `apps/api/src/services/curation/assembly.ts` — `CashFlow` case added to `formatStat`; `DEFAULT_VERSION` bumped `'v1'` → `'v1.1'`
- `apps/web/app/dashboard/TransparencyPanel.tsx` — `cash_flow: 'Cash Flow'` added to `STAT_TYPE_LABELS`
- `apps/api/src/services/curation/computation.test.ts` — 12 new CashFlow fixtures + type-predicate filter helper
- `apps/api/src/services/curation/scoring.test.ts` — 4 new CashFlow scoring tests + CashFlow stat fixtures
- `apps/api/src/services/curation/assembly.test.ts` — updated `promptVersion` expectation from `'v1'` to `'v1.1'`
- `apps/api/src/services/curation/index.test.ts` — updated `promptVersion` expectations from `'v1'` to `'v1.1'`; new cash-flow end-to-end test with privacy-label assertions
- `apps/api/src/services/curation/computation.ts_explained.md` — refreshed interview doc with CashFlow coverage (gitignored, not in the commits)

**Created:**
- `apps/api/src/services/curation/config/prompt-templates/v1.1.md` — new prompt template with cash flow framing + margin/cash-flow dedup guidance; `v1.md` preserved alongside

**Not modified (scope guards held):**
- `packages/shared/src/schemas/businessProfile.ts` — belongs to Story 8.2
- `apps/api/src/db/schema/` — no schema changes; `ai_summaries` cache invalidates via `promptVersion` mismatch
- `apps/api/src/services/curation/config/prompt-templates/v1.md` — preserved for cache-replay compatibility

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-18 | 1.0 | Initial implementation — 7 tasks, 16 new tests, 3 commits | Claude Opus 4.7 via dev-story |
