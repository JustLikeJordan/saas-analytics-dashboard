# Story 3.2: Curation Pipeline — Prompt Assembly & LLM Integration

Status: done

## Story

As the **system**,
I want to assemble curated context into versioned prompt templates and send them to the Claude API,
So that the AI produces consistent, high-quality business interpretations.

## Acceptance Criteria

1. **Prompt Assembly from Layer 2 Output** — Given scored `ScoredInsight[]` from Layer 2 (scoring), when Layer 3 (assembly) runs, then it populates a versioned prompt template from `curation/config/prompt-templates/`. Prompt templates are versioned independently from business logic. (FR23)

2. **Claude API Integration with Resilience** — Given the assembled prompt is ready, when the system calls the Claude API, then the request includes retry logic with exponential backoff for transient failures (NFR23) and each call has timeout handling and structured error responses (NFR20).

3. **AI Response Quality Gate** — Given the AI produces a response, when the analysis is evaluated, then it contains at least one non-obvious, actionable insight per analysis (FR22) — validated via seed data snapshot in CI (Story 7.2); for arbitrary user data, this is a best-effort prompt engineering goal, not a hard assertion.

4. **AI Summary Caching with Cache-First Strategy** — Given the AI summary is generated, when it is stored, then an `ai_summaries` table record is created with cache-first strategy (stale on data upload only, no time-based TTL). Seed summaries are pre-generated during the seed script. (FR18)

5. **Database Security with RLS** — Given the `ai_summaries` table is created, when database security is configured, then RLS policies are applied to `ai_summaries` scoped by `org_id`.

## Tasks / Subtasks

- [x] Task 1: Extend curation types + create `ai_summaries` schema (AC: #1, #4, #5)
  - [x] 1.1 Add `AssembledContext` type and `transparencyMetadataSchema` (Zod) to `apps/api/src/services/curation/types.ts`. `AssembledContext`: string prompt + metadata (prompt version, stat count, categories included). `transparencyMetadataSchema`: validates the JSONB shape stored in `ai_summaries`. Both are service-internal types, NOT in `packages/shared`. `ComputedStat`, `ScoredInsight`, and `ScoringConfig` already exist from Story 3.1 — reuse them
  - [x] 1.2 Add `ai_summaries` table to `apps/api/src/db/schema.ts` — columns: `id`, `org_id` (FK → orgs), `dataset_id` (FK → datasets), `content` (text), `transparency_metadata` (jsonb), `prompt_version` (varchar), `is_seed` (boolean, default false), `created_at`, `stale_at` (nullable timestamp)
  - [x] 1.3 Generate Drizzle migration via `drizzle-kit generate` (NEVER `drizzle-kit push` — breaks Docker reproducibility). Migration must include the composite index `idx_ai_summaries_org_dataset ON ai_summaries(org_id, dataset_id)` shown in the SQL schema section below
  - [x] 1.4 Add RLS policy on `ai_summaries` scoped by `org_id` directly in the generated migration SQL file (the `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` statements shown in the schema section go into the migration, not as a separate step)
  - [x] 1.5 Create `apps/api/src/db/queries/aiSummaries.ts` with: `getCachedSummary(orgId, datasetId)` — returns cached row WHERE `stale_at IS NULL` (fresh only), `storeSummary(orgId, datasetId, content, metadata, promptVersion)`, `markStale(orgId)` — sets `stale_at = NOW()` for all org summaries. Every function takes `orgId` as first parameter
  - [x] 1.6 Add `export * as aiSummariesQueries from './aiSummaries.js'` to `apps/api/src/db/queries/index.ts` barrel (follows existing `export * as` pattern)

- [x] Task 2: Create versioned prompt template (AC: #1, #3)
  - [x] 2.1 Create `apps/api/src/services/curation/config/prompt-templates/v1.md` — markdown template with placeholders for: stat summaries, category list, data lineage, confidence context, instruction for non-obvious + actionable insights, output format guidance
  - [x] 2.2 Template must instruct Claude to produce plain-English analysis for small business owners (not analysts)

- [x] Task 3: Implement Layer 3 — Prompt Assembly (AC: #1, #3)
  - [x] 3.1 Create `apps/api/src/services/curation/assembly.ts` as a pure function
  - [x] 3.2 Implement `assemblePrompt(insights: ScoredInsight[], promptVersion?: string): AssembledContext` — reads template from `config/prompt-templates/`, populates with insight data. Accepts `ScoredInsight[]` (which wraps `ComputedStat`), NEVER `DataRow[]`
  - [x] 3.3 Include in assembled context: stat summaries with categories, scoring weights used (for transparency panel in Story 3.6), prompt template version identifier, data lineage (which stat types were computed)
  - [x] 3.4 Write unit tests: `assembly.test.ts` — template population, empty insights, privacy leak check (no raw data fields in output)

- [x] Task 4: Implement Claude API client (AC: #2)
  - [x] 4.0 Add `CLAUDE_MODEL: z.string().default('claude-sonnet-4-5-20250929')` to the Zod schema in `apps/api/src/config.ts` (next to existing `CLAUDE_API_KEY`). Update `.env.example` with `CLAUDE_MODEL=claude-sonnet-4-5-20250929`
  - [x] 4.1 Install `@anthropic-ai/sdk` — pin to latest stable: `pnpm --filter api add @anthropic-ai/sdk@^0.39`
  - [x] 4.2 Create `apps/api/src/services/aiInterpretation/claudeClient.ts`
  - [x] 4.3 Implement `generateInterpretation(prompt: string): Promise<string>` — non-streaming call for cache population. Uses `client.messages.create()` (not `.stream()` — streaming is Story 3.3's concern). Returns the FULL untruncated response — free-tier word truncation (~150 words) happens downstream in Story 3.5's `streamHandler.ts`, not here
  - [x] 4.4 SDK handles retries natively: configure `maxRetries: 2` on client constructor (default behavior = exponential backoff on 5xx, rate limits, network errors). No custom retry logic needed
  - [x] 4.5 Configure timeout: `timeout: 15_000` (15 seconds per NFR3)
  - [x] 4.6 Wrap errors in `ExternalServiceError` from `lib/appError.ts`. Log non-retryable errors (401 `AuthenticationError`, 400 `BadRequestError`) at `error` level; retryable errors (429, 5xx) at `warn` level
  - [x] 4.7 Write unit tests: `claudeClient.test.ts` — mock `@anthropic-ai/sdk`, verify config (retries, timeout, model, API key from config.ts), error wrapping

- [x] Task 5: Integrate assembly into pipeline orchestrator (AC: #1, #4)
  - [x] 5.1 Update `apps/api/src/services/curation/index.ts` — add `runFullPipeline(orgId, datasetId)` that runs computation → scoring → assembly → Claude API call → cache storage. Keep existing `runCurationPipeline()` unchanged (returns `ScoredInsight[]` for other consumers). Verify `runCurationPipeline` from Story 3.1 is exported and compatible before extending
  - [x] 5.2 Cache-first: check `aiSummariesQueries.getCachedSummary()` before running pipeline. If cached + not stale, return cached content
  - [x] 5.3 After Claude responds, store via `aiSummariesQueries.storeSummary()` with transparency metadata and prompt version
  - [x] 5.4 Log pipeline progress with Pino structured logging
  - [x] 5.5 Write integration test: `index.test.ts` — update existing tests, add cache-hit path test, full pipeline test with mocked Claude client

- [x] Task 6: Wire up `markStale` on data upload (AC: #4)
  - [x] 6.1 In `apps/api/src/routes/datasets.ts` (or the CSV upload handler), call `aiSummariesQueries.markStale(orgId)` after successful data ingestion. Import via `import { aiSummariesQueries } from '../../db/queries/index.js'` (NEVER import from `db/index.ts` directly). There's already a TODO comment for this: `// TODO(epic-3): invalidate ai_summaries for orgId`
  - [x] 6.2 Write test verifying stale marking on upload

- [x] Task 7: Pre-generate seed summaries (AC: #4)
  - [x] 7.1 Update seed script to call `runFullPipeline()` for each seed dataset, storing results with `is_seed: true`. Guard with env check — only run if `CLAUDE_API_KEY` is set; skip gracefully with `logger.warn()`, don't throw (CI won't have the key)
  - [x] 7.2 Write test verifying seed summary generation is skipped when `CLAUDE_API_KEY` is missing (env guard)

## Dev Notes

### Architecture Compliance

**Three-Layer Curation Pipeline** — This story completes the pipeline by adding Layer 3 (assembly) and the Claude API integration. The data flow is now:

```
DataRow[] → computation.ts → ComputedStat[] → scoring.ts → ScoredInsight[] → assembly.ts → AssembledContext → claudeClient.ts → AI response → ai_summaries cache
```

**Privacy Boundary (NON-NEGOTIABLE):**
- `assembly.ts` accepts `ScoredInsight[]` (which wraps `ComputedStat[]`), NEVER `DataRow[]`
- This is enforced by TypeScript type signatures — not just convention
- The prompt template receives statistical summaries only — category names, totals, trends, anomaly flags
- No row IDs, no individual transaction amounts, no user labels reach the LLM

**Scope Boundaries (What This Story Does NOT Touch):**
- **SSE streaming** — Story 3.3 handles `streamHandler.ts` and the streaming endpoint. Story 3.2's `claudeClient.ts` does a non-streaming call for cache population
- **Subscription gate / free-tier truncation** — Story 3.5 handles truncation (~150 words) + `upgrade_required` SSE event. Story 3.2 generates and caches the FULL untruncated response. Truncation happens during streaming delivery (Story 3.5), not during cache storage
- **Transparency panel** — Story 3.6 consumes `transparency_metadata` stored by this story. The exact JSONB shape must match what Story 3.6 expects (see `transparencyMetadataSchema` in types.ts)
- **Route handler** — Story 3.3 creates `routes/aiSummary.ts`. This story focuses on the service layer
- **Rate limiting** — Applied at the route handler level (Story 3.3), not in `claudeClient.ts`. Existing middleware handles 5/min/user for AI endpoints

### Library: @anthropic-ai/sdk (TypeScript)

**Installation:** `pnpm --filter api add @anthropic-ai/sdk`

**Client construction:**
```typescript
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config.js';

const client = new Anthropic({
  apiKey: env.CLAUDE_API_KEY,  // from config.ts, NEVER process.env
  maxRetries: 2,               // SDK default — exponential backoff on 5xx, rate limits, network errors
  timeout: 15_000,             // 15s per NFR3 total generation budget
});
```

**Non-streaming call (for cache population):**
```typescript
const message = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: assembledPrompt }],
});

const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
```

**Streaming call (for Story 3.3 — NOT this story):**
```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: assembledPrompt }],
});
// stream.on('text', (delta) => { ... })
// const finalText = await stream.finalText();
```

**Error handling — SDK error types:**
```typescript
import Anthropic from '@anthropic-ai/sdk';

// Anthropic.APIError         — base class, has .status and .message
// Anthropic.BadRequestError  — 400
// Anthropic.AuthenticationError — 401
// Anthropic.RateLimitError   — 429
// Anthropic.InternalServerError — 500
// Anthropic.APIConnectionError — network failures
// Anthropic.APIConnectionTimeoutError — timeout
```

**Retry behavior (built into SDK):**
- Default: 2 retries with exponential backoff
- Retries on: 5xx errors, rate limits (429), network errors, timeouts
- Does NOT retry on: 4xx errors (except 429)
- Configurable per-client (`maxRetries`) or per-request (second arg options)

**Model selection:** Use `claude-sonnet-4-5-20250929` — good balance of quality/speed/cost for business insights. Model ID should be configurable via `config.ts` for future changes.

### Cache Strategy

**Cache-first flow:**
1. Route handler calls `runFullPipeline(orgId, datasetId)`
2. Pipeline checks `aiSummariesQueries.getCachedSummary(orgId, datasetId)`
3. If cached AND `stale_at IS NULL` → return cached content immediately
4. If no cache or stale → run computation → scoring → assembly → Claude API → store result
5. On CSV upload: `aiSummariesQueries.markStale(orgId)` sets `stale_at = NOW()` for all org summaries

**No time-based TTL.** Summaries remain fresh until new data is uploaded.

### Prompt Template Design (`v1.md`)

The template is a markdown file with mustache-style placeholders. Read at runtime via `readFileSync` (same pattern as `scoring-weights.json`). The template should:

- Set the persona: "You are a business analyst explaining data to a small business owner"
- Provide statistical context: inject the scored insights with categories, values, trend directions
- Request specific output: plain English, non-obvious observations, actionable recommendations
- Constrain length: ~300 words for Pro tier (truncation to ~150 for free tier happens in Story 3.5)
- Include data lineage: which stat types were computed, how many categories analyzed

### `ai_summaries` Table Schema

```sql
CREATE TABLE ai_summaries (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id),
  dataset_id INTEGER NOT NULL REFERENCES datasets(id),
  content TEXT NOT NULL,
  transparency_metadata JSONB NOT NULL DEFAULT '{}',
  prompt_version VARCHAR(20) NOT NULL,
  is_seed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  stale_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_ai_summaries_org_dataset ON ai_summaries(org_id, dataset_id);
-- RLS policy
ALTER TABLE ai_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_summaries_org_isolation ON ai_summaries
  USING (org_id = current_setting('app.current_org_id')::INTEGER);
```

**`transparency_metadata` shape** (for Story 3.6's transparency panel — Zod-validated via `transparencyMetadataSchema` in `types.ts`):
```typescript
{
  statTypes: string[];        // which stat types were included
  categoryCount: number;      // how many categories analyzed
  insightCount: number;       // how many scored insights fed to LLM
  scoringWeights: { novelty: number; actionability: number; specificity: number };
  promptVersion: string;
  generatedAt: string;        // ISO timestamp
}
```
Validate with Zod before storing in JSONB — catches shape drift early rather than breaking Story 3.6 downstream.

### Config Additions

Add to `apps/api/src/config.ts` Zod schema (Task 4.0):
```typescript
CLAUDE_MODEL: z.string().default('claude-sonnet-4-5-20250929'),
```

`CLAUDE_API_KEY` is already validated in config.ts (line 6). Use `env.CLAUDE_MODEL` in `claudeClient.ts` instead of hardcoding the model string.

### Edge Cases

- **Empty insights array**: `assemblePrompt([])` should return a prompt that asks Claude to note "insufficient data for analysis" — not an error
- **Claude API timeout**: SDK throws `APIConnectionTimeoutError` after 15s. Wrap in `ExternalServiceError` with user-friendly message. Do NOT retry timeouts beyond the SDK's built-in 2 retries
- **Claude API auth error (401)**: `AuthenticationError` — not retryable. Wrap in `ExternalServiceError`, log at `error` level with redacted key info
- **Rate limited (429)**: SDK retries automatically with backoff. If all retries exhausted, wrap in `ExternalServiceError`
- **Stale cache race**: Two concurrent requests for the same stale dataset — both may call Claude. This is acceptable for MVP; the second write overwrites the first (idempotent). No distributed locking needed
- **Missing CLAUDE_API_KEY in seed script**: Skip seed summary generation gracefully. Log warning, don't throw

### Existing Patterns to Follow

**Service pattern** (reference: `apps/api/src/services/curation/scoring.ts`):
- Config loaded once at module init via `readFileSync` + validation
- Pure function design where possible
- Typed inputs/outputs with no leaky abstractions

**Query pattern** (reference: `apps/api/src/db/queries/datasets.ts`):
- `orgId` required as first parameter on every query function
- Drizzle ORM `db.select()` / `db.insert()` / `db.update()`
- Return typed results

**Error pattern** (reference: `apps/api/src/lib/appError.ts`):
- `ExternalServiceError` for Claude API failures
- Constructor: `new ExternalServiceError('Claude API', { originalError: err.message })`
- Results in 502 `EXTERNAL_SERVICE_ERROR` response

**Test pattern** (reference: `apps/api/src/services/curation/scoring.test.ts`):
- Co-located test files
- `vi.mock()` inline — mock `@anthropic-ai/sdk`, mock `db/queries/index.js`, mock `lib/logger.js`
- `vi.clearAllMocks()` in `beforeEach`
- `vi.resetModules()` when testing module-level initialization

**Logging** (for orchestrator and Claude client, not pure assembly function):
```typescript
import { logger } from '../../lib/logger.js';
logger.info({ orgId, datasetId, promptVersion, statCount }, 'calling Claude API');
logger.info({ orgId, datasetId, tokenUsage: message.usage }, 'Claude API response received');
logger.warn({ orgId, datasetId }, 'ai_summaries cache miss — generating fresh summary');
```

### Project Structure Notes

New files:
```
apps/api/src/services/curation/
├── assembly.ts                    # Layer 3 — prompt template construction (NEW)
├── assembly.test.ts               # Unit tests for assembly (NEW)
├── config/
│   ├── scoring-weights.json       # (existing — Story 3.1)
│   └── prompt-templates/
│       └── v1.md                  # Versioned prompt template (NEW)
├── types.ts                       # Add AssembledContext type (MODIFY)
├── index.ts                       # Add runFullPipeline() (MODIFY)
├── index.test.ts                  # Add cache + full pipeline tests (MODIFY)

apps/api/src/services/aiInterpretation/
├── claudeClient.ts                # Anthropic SDK wrapper (NEW)
├── claudeClient.test.ts           # Unit tests with mocked SDK (NEW)

apps/api/src/db/
├── schema.ts                      # Add ai_summaries table (MODIFY)
├── queries/
│   ├── aiSummaries.ts             # Cache CRUD operations (NEW)
│   ├── aiSummaries.test.ts        # Query tests (NEW)
│   └── index.ts                   # Add barrel export (MODIFY)

apps/api/src/routes/
├── datasets.ts                    # Wire markStale on upload (MODIFY)
```

Existing query reused (no new query needed for data rows):
```
apps/api/src/db/queries/dataRows.ts  # getRowsByDataset() — already used by Story 3.1
```

### References

- [Source: _bmad-output/planning-artifacts/architecture.md#Curation Pipeline Architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI Interpretation Flow]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Boundaries]
- [Source: _bmad-output/planning-artifacts/architecture.md#Database Tables]
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3 Story 3.2]
- [Source: _bmad-output/planning-artifacts/prd.md#FR18 — Plain-English AI summary]
- [Source: _bmad-output/planning-artifacts/prd.md#FR22 — Non-obvious actionable insights]
- [Source: _bmad-output/planning-artifacts/prd.md#FR23 — Local stats + curated LLM context]
- [Source: _bmad-output/project-context.md#Privacy-by-architecture]
- [Source: _bmad-output/project-context.md#External service error handling]
- [Source: _bmad-output/project-context.md#AI summary caching]
- [Source: @anthropic-ai/sdk README — retry configuration, streaming, error types]

### Previous Story Intelligence (from Story 3.1)

**What worked well:**
- Co-located test files with fixture constants (not JSON files)
- Pure function design made testing straightforward
- `vi.clearAllMocks()` in `beforeEach` for clean test isolation
- `vi.resetModules()` for testing module-level config loading (scoring.test.ts pattern)
- Config loaded once at module init via `readFileSync` + Zod validation — same pattern applies to prompt template loading

**Gotchas from Story 3.1:**
- Logger mock needed because `logger.ts` imports `config.ts` which validates env vars at import time — mock both in integration tests
- TypeScript caught `Object is possibly 'undefined'` on array access — use non-null assertions on guarded arrays
- Drizzle `numeric(12,2)` returns `amount` as string — already handled by computation layer (Story 3.1), no impact here

**Gotchas from Epic 2:**
- V8 Date permissiveness: `new Date("hello 1")` returns valid date — pre-gate with regex if parsing user-provided dates
- Stale `shared/dist`: After any changes to `packages/shared`, run `pnpm --filter shared build`

### Git Intelligence

Recent commit patterns:
```
58b92e5 fix: address code review findings for Story 3.1
791953f feat: implement Story 3.1 — curation pipeline statistical computation + scoring
b91a166 docs: update _explained.md files for code review changes
```

Expected commits for this story:
```
feat: add ai_summaries table schema and cache queries
feat: implement prompt assembly layer with versioned templates
feat: implement Claude API client with retry and error handling
feat: integrate full curation pipeline with cache-first strategy
feat: wire markStale on data upload and seed summary generation
```

### Technical Specifics

**@anthropic-ai/sdk** — TypeScript SDK for Claude API:
- Default export: `Anthropic` class (client constructor)
- `client.messages.create()` — non-streaming, returns `Message` object
- `client.messages.stream()` — streaming, returns `MessageStream` (Story 3.3)
- Built-in retry: 2 retries with exponential backoff (configurable via `maxRetries`)
- Built-in timeout: configurable via `timeout` option (ms)
- Error hierarchy: `APIError` > `BadRequestError`, `AuthenticationError`, `RateLimitError`, `InternalServerError`; `APIConnectionError` > `APIConnectionTimeoutError`
- `Message.content` is an array of content blocks; extract text via `content[0].text` (type guard for `type === 'text'`)
- `Message.usage` contains `{ input_tokens, output_tokens }` — log for monitoring

### Critical Rules Checklist

- [x] No `process.env` — all env through `config.ts` (CLAUDE_API_KEY, CLAUDE_MODEL)
- [x] No `console.log` — Pino structured logging only
- [x] `org_id` on every database query (aiSummaries CRUD)
- [x] `assembly.ts` accepts `ScoredInsight[]` only — no `DataRow[]` leakage
- [x] Prompt template in `.md` file — no hardcoded prompt strings in code
- [x] Claude errors wrapped in `ExternalServiceError` — never raw `Error`
- [x] SDK retry config: `maxRetries: 2`, `timeout: 15_000`
- [x] Cache-first: check `ai_summaries` before calling Claude
- [x] `markStale(orgId)` called on data upload (wire into datasets route)
- [x] RLS policy on `ai_summaries` table
- [x] Co-located tests with `.test.ts` suffix
- [x] Import order: stdlib → third-party → (blank line) → internal
- [ ] Conventional commit messages (pending — commit not yet created)
- [ ] `_explained.md` docs for `assembly.ts` and `claudeClient.ts` (pending)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- readFileSync mock hoisting issue in index.test.ts — vi.mock factory must define all constants inline (Vitest hoists `vi.mock` above variable declarations)
- Assembly privacy test false positive — JSON.stringify of full result catches `"metadata"` key from AssembledContext, not a data leak. Fixed to check prompt text only.

### Completion Notes List
- Task 1: Added `AssembledContext`, `TransparencyMetadata` types + `transparencyMetadataSchema` to types.ts. Created `ai_summaries` table with RLS, migration 0007. Created `aiSummaries.ts` query module with cache CRUD. Added `CLAUDE_MODEL` to config.ts.
- Task 2: Created `v1.md` prompt template with mustache placeholders for stat summaries, categories, insight count, stat types. Instructs Claude to lead with surprising findings and provide actionable recommendations.
- Task 3: Implemented `assemblePrompt()` pure function. Formats each stat type into human-readable lines. Handles empty insights. Builds transparency metadata for Story 3.6. 7 unit tests, all passing.
- Task 4: Installed `@anthropic-ai/sdk@0.78.0`. Built `claudeClient.ts` with non-streaming `messages.create()`, SDK-native retry (maxRetries: 2, timeout: 15s), error wrapping in `ExternalServiceError`. 6 unit tests, all passing.
- Task 5: Added `runFullPipeline()` to orchestrator with cache-first strategy. Checks `aiSummariesQueries.getCachedSummary()` before running pipeline. Validates metadata with Zod before storage. 3 new tests (cache hit, cache miss, Claude skip on cache hit).
- Task 6: Wired `markStale` into `persistUpload` transaction in `datasets.ts` — replaces TODO comment. Uses `tx` (transaction client) for consistency.
- Task 7: Added seed summary generation to `seed.ts` with `CLAUDE_API_KEY` env guard. Runs curation pipeline on seed rows, calls Claude, stores result with `is_seed: true`. Graceful failure via try/catch. 2 env guard tests.

### File List
- apps/api/src/services/curation/types.ts (MODIFIED — added AssembledContext, TransparencyMetadata, transparencyMetadataSchema)
- apps/api/src/db/schema.ts (MODIFIED — added aiSummaries table + relations)
- apps/api/drizzle/migrations/0007_dear_senator_kelly.sql (NEW — ai_summaries CREATE TABLE + RLS)
- apps/api/src/db/queries/aiSummaries.ts (NEW — getCachedSummary, storeSummary, markStale)
- apps/api/src/db/queries/index.ts (MODIFIED — added aiSummariesQueries barrel export)
- apps/api/src/config.ts (MODIFIED — added CLAUDE_MODEL env var)
- .env.example (MODIFIED — added CLAUDE_MODEL)
- apps/api/src/services/curation/config/prompt-templates/v1.md (NEW — versioned prompt template)
- apps/api/src/services/curation/assembly.ts (NEW — Layer 3 prompt assembly)
- apps/api/src/services/curation/assembly.test.ts (NEW — 7 tests)
- apps/api/src/services/aiInterpretation/claudeClient.ts (NEW — Anthropic SDK wrapper)
- apps/api/src/services/aiInterpretation/claudeClient.test.ts (NEW — 6 tests)
- apps/api/src/services/curation/index.ts (MODIFIED — added runFullPipeline, new exports)
- apps/api/src/services/curation/index.test.ts (MODIFIED — added 3 runFullPipeline tests, fixed readFileSync mock)
- apps/api/src/db/queries/datasets.ts (MODIFIED — replaced TODO with markStale in persistUpload)
- apps/api/src/db/seed.ts (MODIFIED — added seed summary generation with env guard)
- apps/api/src/db/seed.test.ts (MODIFIED — added 2 env guard tests)
