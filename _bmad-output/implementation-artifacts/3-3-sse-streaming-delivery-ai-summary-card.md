# Story 3.3: SSE Streaming Delivery & AI Summary Card

Status: done

## Story

As a **business owner**,
I want to see the AI summary appearing in real time as it streams,
So that I get immediate feedback and don't stare at a blank screen.

## Acceptance Criteria

1. **SSE streaming on cache miss** — Given I request an AI summary on the dashboard, when the summary is not cached (or cache is stale), then the AI summary streams via Server-Sent Events (SSE) with first token visible within 2 seconds (NFR2, FR19) and total generation completes within 15 seconds (NFR3).

2. **Streaming cursor and progressive text** — Given the AI summary is streaming, when I view the `AiSummaryCard`, then a blinking cursor indicates active streaming, text appears progressively with max 65ch line width, 17px/1.8 line-height on desktop, 16px/1.6 on mobile (FR18), and `aria-live="polite"` is set for screen reader accessibility.

3. **Post-completion actions** — Given streaming completes, when the full summary is visible, then post-completion actions (Share + Transparency buttons) fade in after streaming ends, and the `ai.summary_completed` analytics event fires.

4. **Trust Blue design** — Given the AI summary card renders, when the design is applied, then it uses the Trust Blue design direction with Warm Advisory left-border accent, shadcn/ui + Tailwind CSS v4 + Radix UI accessibility primitives.

5. **Cache-hit instant load** — Given a cached summary exists and is not stale, when I visit the dashboard, then the cached summary loads instantly without streaming.

6. **Reduced motion** — Given `prefers-reduced-motion: reduce` is active, when the streaming cursor renders, then the cursor is visible but static (no blink animation).

## Tasks / Subtasks

- [x] Task 1: Add `streamInterpretation` to claudeClient.ts (AC: #1)
  - [x] 1.1 Add `streamInterpretation(prompt: string, onText: (delta: string) => void): Promise<{ fullText: string; usage: { inputTokens: number; outputTokens: number } }>` alongside existing `generateInterpretation`
  - [x] 1.2 Use `client.messages.stream()` with same model/max_tokens config as existing non-streaming call
  - [x] 1.3 Wire `stream.on('text', (delta) => onText(delta))` for chunk delivery
  - [x] 1.4 Await `stream.finalMessage()` to get usage stats and full text
  - [x] 1.5 Abort stream on caller signal: accept optional `AbortSignal` param, call `stream.abort()` on signal
  - [x] 1.6 Error handling: same pattern as `generateInterpretation` — wrap in `ExternalServiceError`, distinguish auth vs retryable
  - [x] 1.7 Unit tests with mocked SDK stream (mock `.stream()` returning event emitter with `.on()`, `.finalMessage()`)

- [x] Task 2: Create `streamHandler.ts` SSE response handler (AC: #1)
  - [x] 2.1 Create `apps/api/src/services/aiInterpretation/streamHandler.ts`
  - [x] 2.2 Export `streamToSSE(req, res, orgId, datasetId)` — orchestrates the full SSE flow
  - [x] 2.3 Set SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`
  - [x] 2.4 Call `res.flushHeaders()` immediately after setting headers
  - [x] 2.5 Run curation pipeline via `runCurationPipeline()` from `services/curation/index.ts` (computation → scoring → assembly) to get `AssembledContext` with prompt + transparency metadata
  - [x] 2.6 Call `streamInterpretation(prompt, onText)` where `onText` writes `event: text\ndata: {"text":"<delta>"}\n\n` to response
  - [x] 2.7 On stream complete: send `event: done\ndata: {"usage":{...}}\n\n` then `res.end()`
  - [x] 2.8 On error after headers sent: send `event: error\ndata: {"code":"STREAM_ERROR","message":"...","retryable":true|false}\n\n` then `res.end()`. Set `retryable: true` for 5xx/429/network errors, `false` for auth/validation errors.
  - [x] 2.9 Implement 15s timeout via `setTimeout` — if exceeded, send accumulated partial text as `event: partial\n` + `event: done\n` + `res.end()`
  - [x] 2.10 Listen to `req.on('close')` to abort stream + clear timeout
  - [x] 2.11 After successful stream: store full response in `ai_summaries` cache via `aiSummariesQueries.storeSummary()`
  - [x] 2.12 Store transparency metadata alongside content
  - [x] 2.13 Unit tests: successful stream, client disconnect, timeout + partial, error mid-stream

- [x] Task 3: Create `aiSummary.ts` route handler (AC: #1, #5)
  - [x] 3.1 Create `apps/api/src/routes/aiSummary.ts`
  - [x] 3.2 `GET /ai-summaries/:datasetId` — protected route (behind `authMiddleware`)
  - [x] 3.3 Validate `datasetId` param is numeric
  - [x] 3.4 Extract `orgId` from `req.user` (authed request)
  - [x] 3.5 Cache-first: check `aiSummariesQueries.getCachedSummary(orgId, datasetId)` — if hit, return JSON `{ data: { content, metadata, fromCache: true } }`
  - [x] 3.6 Cache miss: call `streamToSSE(req, res, orgId, datasetId)` for SSE streaming
  - [x] 3.7 Apply `rateLimitAi` middleware (per-user, 5/min) — only on the streaming path, not cache hits
  - [x] 3.8 Mount on `protectedRouter` in `routes/protected.ts`
  - [x] 3.9 Fire `AI_SUMMARY_REQUESTED` analytics event at route entry
  - [x] 3.10 Fire `AI_SUMMARY_COMPLETED` analytics event on successful stream completion (in streamHandler)
  - [x] 3.11 Unit tests: cache hit returns JSON, cache miss triggers SSE, rate limit enforcement, invalid datasetId

- [x] Task 4: Create BFF proxy route for SSE passthrough (AC: #1)
  - [x] 4.1 Create `apps/web/app/api/ai-summaries/[datasetId]/route.ts` (dynamic segment matches Express `:datasetId`)
  - [x] 4.2 `GET` handler — extract datasetId from params, proxy to `${API_INTERNAL_URL}/ai-summaries/${datasetId}`
  - [x] 4.3 Pass `cookie` header from request for auth
  - [x] 4.4 Check upstream `Content-Type` — if `text/event-stream`, return `new Response(upstream.body, { headers })` for stream passthrough (do NOT await body)
  - [x] 4.5 If upstream returns JSON (cache hit), forward as JSON
  - [x] 4.6 Set `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`
  - [x] 4.7 Error handling: if upstream fails, return `502` with standard error shape

- [x] Task 5: Create `useAiStream` hook (AC: #1, #2, #5)
  - [x] 5.1 Create `apps/web/lib/hooks/useAiStream.ts`
  - [x] 5.2 Define `StreamState` type: `{ status: 'idle' | 'connecting' | 'streaming' | 'done' | 'error'; text: string; error: string | null }`
  - [x] 5.3 Define `StreamAction` discriminated union: `START | TEXT | DONE | ERROR | CACHE_HIT | RESET`
  - [x] 5.4 Implement `streamReducer` as pure function (export for unit testing)
  - [x] 5.5 Use `fetch` + `ReadableStream` + `TextDecoderStream` to consume SSE (NOT EventSource — need cookie passthrough and abort control)
  - [x] 5.6 Parse SSE lines: buffer incomplete lines, detect `event:` and `data:` prefixes, dispatch to reducer
  - [x] 5.7 First check response `Content-Type` — if JSON (cache hit), dispatch `CACHE_HIT` with full content
  - [x] 5.8 If `text/event-stream`, read stream chunks and dispatch `TEXT` actions
  - [x] 5.9 `AbortController` for cancellation, clean up on unmount via `useEffect` return
  - [x] 5.10 Export hook: `useAiStream(datasetId: number | null)` returning `{ status, text, error, start, cancel }`
  - [x] 5.11 Auto-trigger on mount when `datasetId` is provided (via `useEffect`)
  - [x] 5.12 Fetch URL: /api/ai-summaries/${datasetId} (matches dynamic segment BFF route)
  - [x] 5.13 Unit tests: reducer state transitions, SSE parsing logic

- [x] Task 6: Create `AiSummaryCard` component (AC: #2, #3, #4, #5, #6)
  - [x] 6.1 Create `apps/web/app/dashboard/AiSummaryCard.tsx` as `'use client'` component
  - [x] 6.2 Accept props: `datasetId: number | null`, `cachedContent?: string`
  - [x] 6.3 Use `useAiStream(datasetId)` hook internally
  - [x] 6.4 Render 6 states: idle (nothing), connecting (skeleton + "Analyzing your data..." label), streaming (progressive text + cursor), done (full text + actions), error (error message + retry), cache-hit (instant full text + actions). Skip connecting state entirely when `cachedContent` is provided.
  - [x] 6.5 Streaming cursor: `▋` character with `animate-blink` CSS — respect `motion-reduce:animate-none`
  - [x] 6.6 Typography: `max-w-prose` (65ch), `text-[17px] leading-[1.8] md:text-base md:leading-[1.6]` — wait, desktop is 17px/1.8, mobile is 16px/1.6 per AC. So: base (mobile) `text-base leading-[1.6]`, md+ `text-[17px] leading-[1.8]`
  - [x] 6.7 Trust Blue design: match existing `AiSummarySkeleton` styling — `border-l-4 border-l-primary bg-card rounded-lg shadow-md`
  - [x] 6.8 Post-completion footer: "Powered by AI · How I reached this conclusion" — Share + Transparency buttons fade in with `animate-fade-in` (CSS transition, not JS). "How I reached this conclusion" is a button placeholder for Story 3.6 transparency panel.
  - [x] 6.9 Share button placeholder (Story 4.1 implements actual sharing)
  - [x] 6.10 Transparency button placeholder (Story 3.6 implements actual panel)
  - [x] 6.11 Accessibility: wrap card in `role="region"` with `aria-label="AI business summary"`, `aria-live="polite"` on the text region during streaming, `aria-busy={true}` while status is `connecting` or `streaming`
  - [x] 6.12 Skeleton-to-content crossfade: 150ms `transition-opacity` when transitioning from connecting→streaming state
  - [x] 6.13 Streaming cursor blink: 530ms interval per UX spec
  - [x] 6.14 Paragraph spacing: `[&>p+p]:mt-[1.5em]` for multi-paragraph summaries
  - [x] 6.15 Fire `ai.summary_completed` client-side analytics event via `trackEvent()` when status transitions to `done`

- [x] Task 7: Integrate `AiSummaryCard` into DashboardShell (AC: #5)
  - [x] 7.1 Replace `AiSummarySkeleton` usage in `DashboardShell.tsx` with `AiSummaryCard`
  - [x] 7.2 Add `datasetId` to `ChartData` type (`packages/shared/src/types/index.ts`) — it's populated by the dashboard data fetch, needed to key the AI summary request
  - [x] 7.3 Keep `AiSummarySkeleton` for the connecting state (reuse inside `AiSummaryCard`)
  - [x] 7.4 Position above charts in the dashboard layout (existing `mb-6` placement)
  - [x] 7.5 Anonymous flow: DashboardShell is an RSC — detect no JWT, query `ai_summaries` table directly for seed dataset cached summary, pass as `cachedContent` prop to `AiSummaryCard`. The client-side hook only fires for authenticated users with a `datasetId`.
  - [x] 7.6 If `cachedContent` is provided and no `datasetId`, render the cached text immediately without invoking `useAiStream`

- [x] Task 8: Add SSE event types to shared package (AC: #1)
  - [x] 8.1 Add to packages/shared/src/types/index.ts: SseTextEvent, SseDoneEvent, SseErrorEvent, SsePartialEvent types matching the SSE protocol format
  - [x] 8.2 Import these types in both streamHandler.ts (server write) and useAiStream.ts (client parse) for type-safe SSE serialization/deserialization

- [x] Task 9: Tests (all ACs)
  - [x] 9.1 Backend: `streamHandler.test.ts` — mock SSE response, verify event format, timeout, partial delivery
  - [x] 9.2 Backend: `aiSummary.test.ts` (route) — cache hit path, cache miss SSE trigger, rate limiting
  - [x] 9.3 Backend: `claudeClient.test.ts` — extend existing tests for `streamInterpretation`
  - [x] 9.4 Frontend: `useAiStream.test.ts` — reducer transitions, SSE parsing, abort cleanup
  - [x] 9.5 Frontend: `AiSummaryCard.test.tsx` — render states (connecting, streaming, done, error, cache-hit), cursor visibility, reduced motion, role/aria-label/aria-live/aria-busy attributes

## Dev Notes

### Existing Code to Build On (DO NOT recreate)

**Curation pipeline is complete** — Stories 3.1 and 3.2 built the full pipeline:
```
apps/api/src/services/curation/
├── types.ts           # ComputedStat, ScoredInsight, AssembledContext, TransparencyMetadata
├── computation.ts     # Pure stats (simple-statistics 7.8.x)
├── scoring.ts         # Relevance weights + ranking
├── assembly.ts        # Versioned prompt templates → AssembledContext
├── config/
│   ├── scoring-weights.json
│   └── prompt-templates/v1.md
└── index.ts           # runCurationPipeline() + runFullPipeline()
```

**Claude client exists** at `apps/api/src/services/aiInterpretation/claudeClient.ts` — has `generateInterpretation()` (non-streaming). ADD `streamInterpretation()` alongside it, don't replace.

**Cache queries exist** at `apps/api/src/db/queries/aiSummaries.ts` — `getCachedSummary()`, `storeSummary()`, `markStale()`. Reuse directly.

**AiSummarySkeleton exists** at `apps/web/app/dashboard/AiSummarySkeleton.tsx` — reuse for the connecting/loading state inside AiSummaryCard.

**DashboardShell.tsx** already renders `AiSummarySkeleton` at line 176 — replace with `AiSummaryCard`.

### Architecture Constraints (NON-NEGOTIABLE)

- **Privacy-by-architecture**: The SSE endpoint runs the curation pipeline which produces `ComputedStat[]` → `ScoredInsight[]` → prompt. Raw `DataRow[]` never reaches the LLM. This is enforced by TypeScript types — don't bypass it.
- **BFF proxy pattern**: Browser → Next.js `/api/ai-summaries/[datasetId]` → Express `/ai-summaries/:datasetId`. No direct browser-to-Express calls.
- **Cache-first at route level**: The Express route handler checks the cache FIRST. If cached, return JSON (not SSE). Only stream on cache miss. The BFF proxy must handle both response types.
- **No `res.send()`/`res.json()` after SSE headers**: Once `res.flushHeaders()` is called for SSE, only use `res.write()` and `res.end()`. Express 5 auto-forwards promise rejections, but only before headers are sent — after that, catch errors and send as SSE events.
- **Dashboard is public**: The dashboard page itself is public (no auth redirect). But the AI summary endpoint IS protected (requires JWT). Anonymous visitors see seed data summaries from cache (pre-generated in seed script). The DashboardShell RSC detects no JWT and queries the ai_summaries table directly for the seed dataset cached summary, passing it as `cachedContent` to `AiSummaryCard`. The client-side hook only fires for authenticated users with a `datasetId`.

### Streaming Path (cache miss flow)

```
Browser -> fetch(/api/ai-summaries/42)
  -> Next.js BFF route.ts (passthrough)
    -> Express GET /ai-summaries/:datasetId (cache miss)
      -> streamHandler.streamToSSE()
        -> runCurationPipeline() -> AssembledContext
        -> claudeClient.streamInterpretation(prompt, onText)
          -> Anthropic SDK stream.on(text) -> res.write(SSE event)
        -> stream.finalMessage() -> storeSummary() -> res.end()
  <- SSE events flow back through BFF to browser
    <- useAiStream hook parses SSE -> dispatches to reducer -> AiSummaryCard re-renders
```

### SSE Protocol Format

```
event: text
data: {"text":"chunk of AI response"}

event: text
data: {"text":"more response text"}

event: done
data: {"usage":{"inputTokens":500,"outputTokens":200}}

# On error:
event: error
data: {"code":"STREAM_ERROR","message":"AI generation failed","retryable":true}

# On timeout with partial:
event: partial
data: {"text":"accumulated text so far..."}

event: done
data: {"usage":null}
```

### Anthropic SDK Streaming API (@anthropic-ai/sdk@0.78.0)

```typescript
// Use client.messages.stream() — NOT .create() with stream: true
const stream = client.messages.stream({
  model: env.CLAUDE_MODEL,
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }],
});

stream.on('text', (delta: string, snapshot: string) => {
  // delta = new chunk, snapshot = accumulated text
  onText(delta);
});

stream.on('error', (err) => { /* AnthropicError */ });

// Resolves after all text events + message_stop
const finalMessage = await stream.finalMessage();
// finalMessage.usage.input_tokens, finalMessage.usage.output_tokens

// Abort: stream.abort() — cancels in-flight HTTP request
```

SDK retry behavior is built-in: 2 retries with exponential backoff for 5xx, 429, network errors. Does NOT retry 4xx (except 429).

### React SSE Consumption Pattern

Use `fetch` + `ReadableStream` — NOT `EventSource`. Reasons:
- `EventSource` is GET-only, no custom headers, no abort control
- `fetch` with `ReadableStream` + `TextDecoderStream` gives full control
- Cookies flow naturally with `credentials: 'same-origin'`
- `AbortController` propagates cleanly through BFF to Express to SDK

```typescript
const res = await fetch(`/api/ai-summaries/${datasetId}`, {
  signal: controller.signal,
  credentials: 'same-origin',
});

if (res.headers.get('content-type')?.includes('application/json')) {
  // cache hit — instant load
  const json = await res.json();
  dispatch({ type: 'CACHE_HIT', content: json.data.content });
  return;
}

// SSE stream
const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += value;
  // parse SSE lines from buffer...
}
```

### Next.js BFF SSE Passthrough

The BFF route handler must NOT await the upstream body for SSE streams. Pass `upstream.body` (a `ReadableStream`) directly to `new Response()`:

```typescript
// If upstream is SSE, passthrough the stream
return new Response(upstream.body, {
  status: 200,
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
});
```

Set `export const runtime = 'nodejs'` (required for streaming) and `export const dynamic = 'force-dynamic'`.

### Rate Limiting

`rateLimitAi` middleware already exists in `apps/api/src/middleware/rateLimiter.ts` — keys by `authedReq.user.sub`, 5 requests per minute. Apply it to the AI summary route, but ONLY on the streaming path (not cache hits). The route handler should check cache first, then apply rate limiting only if a fresh generation is needed.

### Analytics Events

Already defined in `packages/shared/src/constants/index.ts`:
- `AI_SUMMARY_REQUESTED` = `'ai.summary_requested'` — fire at route entry (backend)
- `AI_SUMMARY_COMPLETED` = `'ai.summary_completed'` — fire on successful completion (backend + client)

Use existing `trackEvent()` pattern from other routes. Check how `DATASET_UPLOADED` is tracked for the pattern.

### Subscription Gating (DEFERRED to Story 3.5)

Story 3.3 does NOT implement subscription gating. All users get full streams. Story 3.5 adds `subscriptionGate.ts` middleware that annotates `req.subscriptionTier` and truncates free-tier streams at ~150 words. Build the streaming infrastructure cleanly so Story 3.5 can add truncation logic in `streamHandler.ts` without restructuring.

### What This Story Does NOT Include

- Subscription gating / free-tier truncation → Story 3.5
- Transparency panel → Story 3.6
- Mobile-first AI summary positioning → Story 3.6
- Timeout/error UX states beyond basic error display → Story 3.4
- Share functionality → Story 4.1

### Project Structure Notes

```
# NEW files
apps/api/src/services/aiInterpretation/streamHandler.ts
apps/api/src/services/aiInterpretation/streamHandler.test.ts
apps/api/src/routes/aiSummary.ts
apps/api/src/routes/aiSummary.test.ts
apps/web/app/api/ai-summaries/[datasetId]/route.ts
apps/web/lib/hooks/useAiStream.ts
apps/web/lib/hooks/useAiStream.test.ts
apps/web/app/dashboard/AiSummaryCard.tsx
apps/web/app/dashboard/AiSummaryCard.test.tsx

# MODIFIED files
apps/api/src/services/aiInterpretation/claudeClient.ts       # add streamInterpretation()
apps/api/src/services/aiInterpretation/claudeClient.test.ts   # add stream tests
apps/api/src/routes/protected.ts                              # mount aiSummary route
apps/web/app/dashboard/DashboardShell.tsx                     # replace skeleton with AiSummaryCard
packages/shared/src/types/index.ts                            # add SSE event types + ChartData.datasetId
```

### Previous Story Intelligence

**From Story 3.1:**
- TypeScript caught `Object is possibly 'undefined'` on array access in sorted time-series — use non-null assertions or runtime guards
- Drizzle's `metadata: unknown` vs `Record<string, unknown> | null` mismatch — relaxed local interface
- Integration tests need logger mock because `logger.ts` imports `config.ts` validating env vars at import time — use `vi.mock('../../config.js', ...)` pattern

**From Story 3.2:**
- `readFileSync` mock hoisting issue — `vi.mock` factory must define all constants inline (Vitest hoists above variable declarations)
- Claude SDK mock pattern: mock `@anthropic-ai/sdk` as default export with `messages: { create: vi.fn() }`. For streaming, mock `messages: { stream: vi.fn() }` returning object with `.on()` and `.finalMessage()` methods
- Assembly privacy test: JSON.stringify caught "metadata" key — check prompt text only, not the full AssembledContext object
- Non-streaming `generateInterpretation` is used by `runFullPipeline()` for cache population. The new streaming path is for real-time delivery to users. Both should coexist.

**Config pattern from Story 3.2:**
```typescript
// config.ts already has:
CLAUDE_API_KEY: z.string(),
CLAUDE_MODEL: z.string().default('claude-sonnet-4-5-20250929'),
```

**Testing patterns established:**
- Co-located `.test.ts` files next to source
- `vi.clearAllMocks()` in `beforeEach`
- Mock `@anthropic-ai/sdk` for Claude tests
- Mock `../../config.js` to provide test env values
- Mock `../../lib/logger.js` to suppress output

### Git Intelligence

Recent commits follow conventional prefix pattern: `feat:`, `fix:`, `docs:`. Stories are implemented in single commits with descriptive messages. Code review findings addressed in follow-up `fix:` commits.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 3, Story 3.3]
- [Source: _bmad-output/planning-artifacts/architecture.md — Curation Pipeline Architecture, SSE streaming, AI Summary Data Flow]
- [Source: _bmad-output/planning-artifacts/architecture.md — Frontend: AiSummary.tsx, useAiStream.ts, BFF proxy routes]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR2 (TTFT < 2s), NFR3 (total < 15s), NFR17 (graceful degradation), NFR18 (timeout + partial), NFR23 (retry + backoff)]
- [Source: packages/shared/src/constants/index.ts — RATE_LIMITS.ai, ANALYTICS_EVENTS, AI_TIMEOUT_MS]
- [Source: apps/api/src/services/aiInterpretation/claudeClient.ts — existing non-streaming pattern]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — AI Summary Card styling, cursor blink 530ms, skeleton crossfade, paragraph spacing, Warm Advisory accent]
- [Source: apps/api/src/services/curation/index.ts — runCurationPipeline(), runFullPipeline()]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- AiSummaryCard.test.tsx: `afterEach(cleanup)` was missing — DOM elements accumulated across tests causing "multiple elements found" errors
- aiSummary.test.ts: had to rewrite from supertest (not installed) to project's `createTestApp` + native `fetch` pattern
- streamHandler.test.ts: fake timers + setTimeout in mock caused deadlock — rewrote to use signal abort listener + `vi.advanceTimersByTimeAsync`
- DashboardShell.test.tsx: mock updated from `AiSummarySkeleton` to `AiSummaryCard`, `datasetId` added to both fixtures

### Completion Notes List

- All 9 ACs covered by 438 passing tests (276 API + 162 web, 0 failures)
- SSE streaming pipeline fully wired: claudeClient → streamHandler → Express route → BFF proxy → useAiStream → AiSummaryCard
- Cache-first pattern at route level — cached summaries return JSON, only stream on cache miss
- Rate limiting applied only on streaming path (not cache hits)
- Public cached summary endpoint added for anonymous visitors
- Privacy-by-architecture maintained — curation pipeline produces ComputedStat[], raw DataRow[] never reaches LLM
- Subscription gating deferred to Story 3.5 as designed

### Change Log

- 2026-03-07: All tasks implemented and tested

### File List

**New files:**
- `apps/api/src/services/aiInterpretation/streamHandler.ts`
- `apps/api/src/services/aiInterpretation/streamHandler.test.ts`
- `apps/api/src/routes/aiSummary.ts`
- `apps/api/src/routes/aiSummary.test.ts`
- `apps/web/app/api/ai-summaries/[datasetId]/route.ts`
- `apps/web/lib/hooks/useAiStream.ts`
- `apps/web/lib/hooks/useAiStream.test.ts`
- `apps/web/app/dashboard/AiSummaryCard.tsx`
- `apps/web/app/dashboard/AiSummaryCard.test.tsx`
- `packages/shared/src/types/sse.ts`

**Modified files:**
- `apps/api/src/services/aiInterpretation/claudeClient.ts` — added `streamInterpretation()`
- `apps/api/src/services/aiInterpretation/claudeClient.test.ts` — added stream tests
- `apps/api/src/routes/protected.ts` — mounted aiSummary router
- `apps/api/src/routes/dashboard.ts` — added `datasetId` to response, added public cached summary endpoint
- `apps/api/src/routes/dashboard.test.ts` — added mocks for new query calls
- `apps/web/app/dashboard/DashboardShell.tsx` — replaced skeleton with AiSummaryCard
- `apps/web/app/dashboard/DashboardShell.test.tsx` — updated mocks and fixtures
- `apps/web/app/dashboard/page.tsx` — added cached summary fetch for anonymous visitors
- `apps/web/app/globals.css` — added blink keyframes animation
- `packages/shared/src/types/index.ts` — added SSE type re-exports
- `packages/shared/src/schemas/charts.ts` — added `datasetId` to chartDataSchema
