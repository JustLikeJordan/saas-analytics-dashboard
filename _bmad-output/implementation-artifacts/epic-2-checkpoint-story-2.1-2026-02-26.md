# Epic 2 Checkpoint — After Story 2.1

**Date:** 2026-02-26
**Stories completed:** 1/8 (Story 2.1: Seed Data & Demo Mode Foundation)
**Type:** Mid-epic checkpoint (not a full retrospective)

---

## Story 2.1 Summary

- **Files changed:** 30 (+3,078 lines)
- **Test growth:** 124 → 165 (+41 tests across 5 new test files)
- **Test files:** 18 API + 1 shared = 19 total
- **Code review findings:** 3 critical + 2 medium + 3 suggestions = 8 total
- **Findings resolved:** 8/8 (all before commit)
- **Docker verification:** Full pass (migrations, seed, idempotency, RLS policies)

---

## Epic 1 Action Item Follow-Up

| # | Action Item | Status | Notes |
|---|------------|--------|-------|
| 1 | Migration journal checklist in story dev notes | Done | Story 2.1 included explicit task 5.3 for manual `_journal.json` entry. Verified at commit time. |
| 2 | Verify shared build runs before lint/type-check in CI | Carried | Turborepo `dependsOn: ["^build"]` works locally. CI pipeline not re-tested this story. |
| 3 | Continue "Previous Story Intelligence" sections | Done | Story 2.1 dev notes included Epic 1 learnings (stale dist, ESM extensions, custom migration patterns). |

| # | Tech Debt Item | Status | Notes |
|---|---------------|--------|-------|
| 1 | Docker compose-up end-to-end verification | Resolved | Full Docker verification in Story 2.1: all 4 containers healthy, health endpoint 200, migrations + seed + idempotency verified. |
| 2 | Shared package missing vitest dep | Resolved | Added vitest as devDependency, created `vitest.config.ts`, 12 shared tests passing. |

All Epic 1 action items either resolved or actively carried forward.

---

## What Worked

1. **Code review caught a production bug before it shipped.** The seed idempotency check ran outside the RLS-bypassed transaction. PostgreSQL's RLS silently filtered rows to zero, so the seed script re-inserted 72 duplicate rows on every container restart. Both review agents (code-reviewer and silent-failure-hunter) independently flagged this as critical. Without the review, this would have caused data duplication in production Docker restarts.

2. **Story dev notes from Epic 1 prevented repeat mistakes.** The "Previous Story Intelligence" pattern flagged the custom migration journal pattern, ESM `.js` extensions, and standalone DB connection strategy before implementation started. Zero time lost to known gotchas.

3. **Parallel review agents found different issues.** The code-reviewer focused on semantic correctness (function naming, state machine coverage). The silent-failure-hunter focused on error propagation (entrypoint.sh swallowing failures, `.finally()` ordering after `process.exit`). Running both in parallel gave broader coverage than either alone.

4. **Docker verification caught development-vs-production gap.** The development compose override uses `command:` which bypasses `entrypoint.sh`. This means the entrypoint (migrations + seed) only runs in production. Knowing this early prevents confusion in later stories.

---

## What We Learned

1. **RLS silently hides data rather than throwing errors.** The idempotency bug was invisible — the seed script didn't crash, it just saw empty results and re-seeded. Any standalone script (seed, migration, CLI tool) that queries RLS-protected tables must either (a) set `app.is_admin` first, or (b) run the query inside a transaction with the admin bypass. This applies to every future story that adds standalone scripts.

2. **Standalone scripts need their own DB connection.** `config.ts` Zod-validates all env vars (CLAUDE_API_KEY, STRIPE_SECRET_KEY, etc.), but scripts running before the app boots only have `DATABASE_URL`. Both `seed.ts` and `migrate.ts` create lightweight `postgres()` + `drizzle()` instances. This pattern should be reused for any future CLI tools.

3. **`getDemoModeState` was a naming trap.** The function returned 2 of 4 enum states, but the generic name didn't communicate the scope. Renaming to `getUserOrgDemoState` made the constraint self-documenting. Lesson: when a function handles a subset of a type's values, the name should say so.

4. **`entrypoint.sh` error handling matters.** Wrapping migration execution in `if ! ... fi` with a "may be no pending migrations" comment silently ate real failures. `set -e` already propagates errors; Drizzle exits 0 when nothing is pending. The guard was unnecessary and dangerous.

---

## Patterns Established for Remaining Epic 2 Stories

| Pattern | First Used | Reuse In |
|---------|-----------|----------|
| Standalone DB connection (scripts) | `seed.ts`, `migrate.ts` | Any future CLI/seed/migration scripts |
| RLS bypass via `SET LOCAL app.is_admin` | Seed script, RLS migration | Any admin operation outside Express middleware |
| Shared Zod schemas for cross-package contracts | `shared/schemas/datasets.ts` | Story 2.2 (CSV upload validation schema) |
| Query barrel pattern (`db/queries/index.ts`) | Story 1.2, extended in 2.1 | Every new query module |
| Idempotent seed with transaction-scoped check | `seed.ts` | Story 7.2 (seed validation) |
| `_explained.md` companion docs | Story 2.1 (4 docs created) | Every substantial code file |

---

## Risks & Watch Items for Remaining Stories

1. **CSV parsing library choice (Story 2.2).** The architecture specifies server-side CSV parsing but doesn't name a library. `papaparse` (browser + node) vs `csv-parse` (node-only) — decision needed early in Story 2.2.

2. **File upload size limits (Story 2.2).** The PRD says 10MB max. Express body-parser default is 100KB. The upload route needs `multer` or equivalent with explicit limits. BFF proxy must also forward the raw body.

3. **Chart library integration (Story 2.6).** The UX spec references Recharts, but the architecture doesn't specify a version. React 19.2 compatibility needs verification before Story 2.6 starts.

4. **Demo mode banner coordination (Story 2.8).** The banner needs to know if the user is seeing seed data or their own data. `getUserOrgDemoState` provides this, but the dashboard page (Story 2.6) needs to call it and pass the state to the banner component. These stories are sequential — 2.6 should expose the state, 2.8 should consume it.

---

## Metrics

| Metric | Epic 1 End | After Story 2.1 | Delta |
|--------|-----------|-----------------|-------|
| Total tests | 124 | 165 | +41 |
| Test files | 15 | 19 | +4 |
| API tests | 124 | 153 | +29 |
| Shared tests | 0 | 12 | +12 |
| DB tables | 7 | 9 | +2 (datasets, data_rows) |
| RLS-protected tables | 5 | 7 | +2 |
| Query modules | 5 | 7 | +2 (datasets, dataRows) |
| Code review findings (total) | 3 (Story 1.6) | 8 | — |
| Critical findings | 0 | 3 | Caught + fixed pre-commit |

---

## Next Steps

1. Create Story 2.2 (CSV Upload & Validation)
2. Carry forward: standalone DB connection pattern, RLS bypass pattern, naming clarity lesson
3. Decision needed early in 2.2: CSV parsing library + file upload middleware
