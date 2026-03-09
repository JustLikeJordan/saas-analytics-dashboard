# Story 3.4: AI Summary Timeout & Error Handling

Status: done

## Story

As a **user**,
I want graceful handling when the AI service is slow or unavailable,
So that I never see a broken interface or lose access to my dashboard.

## Acceptance Criteria

1. **Timeout with partial results** -- Given AI generation exceeds 15 seconds (measured from SSE headers flush, including pipeline execution time), when the timeout boundary is reached, then the system terminates the request and displays partial results if available, or a graceful timeout message (NFR18). A horizontal rule appears followed by "We focused on the most important findings to keep things quick" message (per UX spec -- reframes timeout as intentional curation, not failure). Partial results are NOT cached.

2. **Graceful degradation on service unavailable** -- Given the AI service is unavailable, when I visit the dashboard, then a graceful degradation message is displayed, not a broken UI (NFR17). Charts and data remain fully accessible -- the AI section shows the error state, not the whole page.

3. **Retry with backoff** -- Given a transient AI failure occurs, when the retry logic activates, then the Anthropic SDK handles exponential backoff server-side (2 retries, 1s/3s per NFR23). The client tracks retry count (max 3) and shows the AiSummaryCard in its error state with a "Try again" button. Client retries are immediate — backoff is SDK-level, not client-level.

4. **Six AiSummaryCard states** -- Given the AiSummaryCard has 6 states, when I inspect the component, then all states are structurally defined: skeleton (connecting), streaming, complete, timeout, error, free preview (type + code path exists as placeholder for Story 3.5, renders nothing until then).

## Tasks / Subtasks

- [ ] Task 1: Enhance `streamHandler.ts` with timeout + partial result logic (AC: #1)
  - [ ] 1.1 Add 15-second `setTimeout` that fires after `res.flushHeaders()` -- track accumulated text in a `let accumulated = ''` variable, appending each delta as it arrives. Note: the 15s budget includes pipeline execution time (computation + scoring + assembly) before the Claude call starts -- this matches NFR18's "total generation" requirement
  - [ ] 1.2 On timeout: if `accumulated.length > 0`, send `event: partial\ndata: {"text":"<accumulated>"}\n\n` followed by `event: done\ndata: {"usage":null,"reason":"timeout"}\n\n`, then `res.end()` and abort the Claude stream. **Do NOT cache partial results** -- only `storeSummary()` on successful complete stream
  - [ ] 1.3 On timeout with no text received: send `event: error\ndata: {"code":"TIMEOUT","message":"AI generation timed out","retryable":true}\n\n` then `res.end()`
  - [ ] 1.4 Clear the timeout on successful stream completion (`clearTimeout` in the done handler)
  - [ ] 1.5 Clear the timeout on client disconnect (`req.on('close')` handler)
  - [ ] 1.6 Extract timeout duration to `AI_STREAM_TIMEOUT_MS` constant (default `15_000`) -- import from config or define locally for now, Story 3.3 may have already defined this
  - [ ] 1.7 Log timeout events: `logger.warn({ orgId, datasetId, accumulatedLength: accumulated.length }, 'AI stream timed out')`
  - [ ] 1.8 **Guard against double-end**: Track `let ended = false` flag. All paths that call `res.end()` must check `if (ended) return` first, then set `ended = true`. Same guard for `stream.abort()` -- prevents race between timeout handler, completion handler, and `req.on('close')`
  - [ ] 1.9 Unit tests: timeout with partial text, timeout with no text, successful completion clears timeout, client disconnect clears timeout, double-end guard (timeout + completion at same tick)

- [ ] Task 2: Enhance `streamHandler.ts` error handling for mid-stream failures (AC: #2, #3)
  - [ ] 2.1 Wrap the Claude stream setup in try/catch -- errors BEFORE `res.flushHeaders()` should throw normally (Express 5 auto-forwards to errorHandler)
  - [ ] 2.2 Errors AFTER headers sent: catch in `stream.on('error')` handler, send `event: error\ndata: {"code":"STREAM_ERROR","message":"..."}\n\n` then `res.end()` (respecting the `ended` guard from Task 1.8)
  - [ ] 2.3 Distinguish error types from Anthropic SDK: `AuthenticationError` -> `"AI_AUTH_ERROR"`, `RateLimitError` -> `"RATE_LIMITED"`, `APIConnectionError`/`APIConnectionTimeoutError` -> `"AI_UNAVAILABLE"`, other `APIError` -> `"STREAM_ERROR"`
  - [ ] 2.4 For `AI_UNAVAILABLE` errors, include `retryable: true` in the SSE error event data so the client knows to show "Try again"
  - [ ] 2.5 **Curation pipeline errors**: The pipeline (computation/scoring/assembly) runs AFTER `res.flushHeaders()`. Wrap the pipeline call in try/catch and send SSE error event with `code: 'PIPELINE_ERROR'`, `retryable: true`. These are internal errors (bad data shape, missing dataset) -- the user message should be generic: "Something went wrong preparing your analysis"
  - [ ] 2.6 **Empty Claude response fast-fail**: If Claude stream completes with no text events (empty `message.content` array), send an error event immediately with `code: 'EMPTY_RESPONSE'`, `retryable: true` rather than waiting for the 15s timeout. Check this in the `stream.on('message')` handler before sending the `done` event
  - [ ] 2.7 Log all errors with structured Pino: `logger.error({ orgId, datasetId, errorCode, err: err.message }, 'AI stream error')`
  - [ ] 2.8 Unit tests: error before headers (throws), error after headers (SSE error event), each error type maps to correct code, retryable flag, pipeline error after headers, empty response fast-fail

- [ ] Task 3: Enhance `useAiStream` hook with timeout + error + retry states (AC: #1, #3, #4)
  - [ ] 3.1 Add `'timeout'` to `StreamState.status` union: `'idle' | 'connecting' | 'streaming' | 'done' | 'error' | 'timeout'`
  - [ ] 3.2 Add `TIMEOUT` and `PARTIAL` actions to the reducer -- `PARTIAL` sets status to `'timeout'` and stores accumulated text, `TIMEOUT` (no text) sets status to `'error'` with timeout message
  - [ ] 3.3 Parse new SSE events in the stream reader: `event: partial` dispatches `PARTIAL`, `event: error` dispatches `ERROR` (extract `code`, `message`, `retryable` from data). **SSE parser must handle multiple events in a single buffer read** (e.g., mobile tab wakeup delivers buffered `partial` + `done` events in one chunk)
  - [ ] 3.4 Store `retryable: boolean` in state -- derived from the SSE error event's `retryable` field
  - [ ] 3.5 Implement `retry()` function: dispatches `START` directly (skipping `RESET` to avoid a flash of idle state), then calls the internal fetch logic. **Guard against concurrent calls**: if status is already `connecting` or `streaming`, `retry()` is a no-op. Only exposed when `retryable` is true
  - [ ] 3.6 Add retry count tracking: `retryCount` in state, incremented on each `START` action, max 3 retries before disabling retry button
  - [ ] 3.7 Export updated hook: `useAiStream(datasetId)` returning `{ status, text, error, retryable, retryCount, start, cancel, retry }`
  - [ ] 3.8 Unit tests: reducer handles PARTIAL action (timeout with text), ERROR with retryable flag, retry count increment, max retry enforcement, START guard when already connecting, multi-event buffer parsing

- [ ] Task 4: Enhance `AiSummaryCard` timeout + error + retry UI states (AC: #1, #2, #3, #4)
  - [ ] 4.1 **Timeout state** (status === 'timeout'): render the partial text, then a `<hr>` divider with `border-muted` styling, then italicized "We focused on the most important findings to keep things quick" message below (per UX spec -- reframes timeout as intentional curation, not failure). Post-completion actions (Share + Transparency buttons) still appear since partial content is useful. On retry, clear the old partial text and show a fresh skeleton -- don't keep stale partial text visible while a new generation runs
  - [ ] 4.2 **Error state** (status === 'error'): render error card with `border-l-4 border-l-destructive` left accent (distinct from Trust Blue streaming state). Show error icon + user-friendly message (never raw error codes). If `retryable` and `retryCount < 3`, show "Try again" button. If retries exhausted, show "Please try again later"
  - [ ] 4.3 **Error state content**: "Unable to generate AI insights right now. Your data and charts are still available below." -- maintains user confidence that the dashboard works without AI
  - [ ] 4.4 Error messages by code: `TIMEOUT` -> "The analysis took longer than expected", `AI_UNAVAILABLE` -> "AI service is temporarily unavailable", `RATE_LIMITED` -> "Too many requests -- please wait a moment", `PIPELINE_ERROR` -> "Something went wrong preparing your analysis", `EMPTY_RESPONSE` -> "AI produced no results -- please try again", `STREAM_ERROR` / default -> "Something went wrong generating insights"
  - [ ] 4.5 "Try again" button: calls `retry()` from the hook, shows a subtle loading spinner while `status === 'connecting'` after retry
  - [ ] 4.6 **Free preview placeholder** (status === 'free_preview'): just render `null` for now -- Story 3.5 fills this in. Ensure the status union includes it so the component doesn't need restructuring
  - [ ] 4.7 Ensure `aria-live="assertive"` on error states (more urgent than `polite` used during streaming)
  - [ ] 4.8 Reduced motion: timeout divider animation (if any) respects `prefers-reduced-motion`
  - [ ] 4.9 Unit tests: timeout state renders partial text + divider + message, error state renders error card + retry button, retries exhausted hides button, free preview renders nothing, aria-live values per state

- [ ] Task 5: Ensure dashboard isolation -- AI errors never break the page (AC: #2)
  - [ ] 5.1 Verify `ChartErrorBoundary` in `DashboardShell.tsx` does NOT wrap `AiSummaryCard` -- AI errors should be contained within the card's own state, not caught by the chart error boundary
  - [ ] 5.2 Add a lightweight error boundary around `AiSummaryCard` specifically -- if the component itself throws (React render error, not API error), catch it and show the same error state UI. This prevents a rendering bug in the card from crashing the dashboard
  - [ ] 5.3 `AiSummaryCard` should never throw from its render path -- all API errors are handled via the hook's state machine, not exceptions
  - [ ] 5.4 Test: simulate a render error in AiSummaryCard -- verify the error boundary catches it and the rest of the dashboard remains functional

- [ ] Task 6: Tests (all ACs)
  - [ ] 6.1 Backend: `streamHandler.test.ts` -- extend with timeout scenarios (partial text, no text), error type mapping, retryable flag, client disconnect during timeout
  - [ ] 6.2 Frontend: `useAiStream.test.ts` -- extend reducer tests for PARTIAL, TIMEOUT, ERROR with retryable, retry count, max retries
  - [ ] 6.3 Frontend: `AiSummaryCard.test.tsx` -- extend with timeout rendering, error states, retry button, aria-live values, error boundary catch
  - [ ] 6.4 Integration: verify AiSummaryCard error does not propagate to DashboardShell

## Dev Notes

### Existing Code to Build On (DO NOT recreate)

**Story 3.3 builds the streaming infrastructure** -- this story enhances it with resilience. All files below are created in Story 3.3:

```
apps/api/src/services/aiInterpretation/
  claudeClient.ts          # Has generateInterpretation() + streamInterpretation()
  streamHandler.ts         # Has streamToSSE() -- ENHANCE with timeout + error handling

apps/api/src/routes/
  aiSummary.ts             # GET /ai-summaries/:datasetId -- cache-first + SSE

apps/web/lib/hooks/
  useAiStream.ts           # SSE consumer hook -- ENHANCE with timeout/error/retry states

apps/web/app/dashboard/
  AiSummaryCard.tsx        # 6-state component -- ENHANCE timeout + error + retry UI
  DashboardShell.tsx       # Already has ChartErrorBoundary -- verify isolation
```

**Claude client error types** (from `@anthropic-ai/sdk`):
```typescript
Anthropic.AuthenticationError  // 401 -- non-retryable
Anthropic.BadRequestError      // 400 -- non-retryable
Anthropic.RateLimitError       // 429 -- SDK retries, but may exhaust
Anthropic.InternalServerError  // 500 -- SDK retries
Anthropic.APIConnectionError   // network failure -- SDK retries
Anthropic.APIConnectionTimeoutError // extends APIConnectionError -- timeout
Anthropic.APIError             // base class for all API errors
```

**SDK retry behavior**: 2 retries with exponential backoff for 5xx, 429, network errors. Does NOT retry 4xx (except 429). If all retries exhausted, the error propagates to `stream.on('error')`.

**MessageStream abort**: `stream.abort()` cancels the in-flight HTTP request. Also `stream.controller` exposes the underlying `AbortController`. The `abort` event fires with `APIUserAbortError`.

### Architecture Constraints (NON-NEGOTIABLE)

- **No `res.send()`/`res.json()` after SSE headers**: Once `res.flushHeaders()` is called, only use `res.write()` and `res.end()`. Errors after headers must go through SSE events, not HTTP status codes
- **Dashboard is public**: AI errors never redirect. The dashboard page always renders. AI failures affect only the `AiSummaryCard` section
- **API response format**: SSE error events use `{"code": string, "message": string, "retryable"?: boolean}` -- consistent with the REST error shape but delivered over the event stream
- **Express 5 auto-forwards promise rejections**: But only BEFORE headers are sent. After `flushHeaders()`, you must catch errors manually in the stream handler
- **Privacy-by-architecture still applies**: Error handlers must not leak raw data or prompt content in error messages

### SSE Error Event Protocol

```
# Retryable error (network/timeout/5xx):
event: error
data: {"code":"AI_UNAVAILABLE","message":"AI service is temporarily unavailable","retryable":true}

# Non-retryable error (auth/bad request):
event: error
data: {"code":"AI_AUTH_ERROR","message":"AI service configuration error","retryable":false}

# Rate limited:
event: error
data: {"code":"RATE_LIMITED","message":"Too many requests","retryable":false}

# Timeout with partial results:
event: partial
data: {"text":"accumulated text so far..."}

event: done
data: {"usage":null,"reason":"timeout"}

# Timeout with no results:
event: error
data: {"code":"TIMEOUT","message":"AI generation timed out","retryable":true}

# Pipeline error (computation/scoring/assembly failed after headers flushed):
event: error
data: {"code":"PIPELINE_ERROR","message":"Something went wrong preparing your analysis","retryable":true}

# Empty Claude response (0 content blocks):
event: error
data: {"code":"EMPTY_RESPONSE","message":"AI produced no results","retryable":true}
```

### Error-to-Code Mapping (streamHandler.ts)

| Error Source | SSE Code | Retryable | User Message |
|---|---|---|---|
| `APIConnectionTimeoutError` | `TIMEOUT` | true | "The analysis took longer than expected" |
| `APIConnectionError` | `AI_UNAVAILABLE` | true | "AI service is temporarily unavailable" |
| `InternalServerError` | `AI_UNAVAILABLE` | true | "AI service is temporarily unavailable" |
| `RateLimitError` | `RATE_LIMITED` | false | "Too many requests -- please wait a moment" |
| `AuthenticationError` | `AI_AUTH_ERROR` | false | "AI service configuration error" |
| `BadRequestError` | `STREAM_ERROR` | false | "Something went wrong generating insights" |
| Pipeline error (computation/scoring/assembly) | `PIPELINE_ERROR` | true | "Something went wrong preparing your analysis" |
| Empty Claude response (0 content blocks) | `EMPTY_RESPONSE` | true | "AI produced no results -- please try again" |
| Other/unknown | `STREAM_ERROR` | true | "Something went wrong generating insights" |

### Timeout Flow (streamHandler.ts)

```
streamToSSE(req, res, orgId, datasetId)
  |-- let ended = false              // double-end guard (F3)
  |-- let accumulated = ''           // tracks partial text
  |-- res.flushHeaders() (SSE headers)
  |-- Start 15s timeout timer
  |-- try: Run curation pipeline -> get prompt
  |     catch: send SSE error (PIPELINE_ERROR, retryable: true), end (F6)
  |-- Start Claude stream
  |     |-- on('text', delta) -> res.write(SSE text event) + accumulated += delta
  |     |-- on('error', err) -> if (!ended) map to SSE error event, end
  |     |-- on('message', msg) ->
  |     |     if msg.content empty: send error (EMPTY_RESPONSE), end (C2)
  |     |     else: send done event, clearTimeout, end
  |
  |-- [TIMEOUT fires at 15s]
  |     |-- if (ended) return          // guard: completion already handled (F7)
  |     |-- if accumulated.length > 0:
  |     |     send partial event (accumulated text)
  |     |     send done event (usage: null, reason: timeout)
  |     |-- else:
  |     |     send error event (TIMEOUT, retryable: true)
  |     |-- stream.abort(), ended = true, res.end()
  |     |-- Do NOT cache partial results (F2)
  |
  |-- req.on('close') -> if (!ended) stream.abort(), clearTimeout
```

### Client-Side Retry Strategy

- Max 3 retries (tracked in hook state, not exponential backoff on client -- the SDK handles backoff server-side)
- Retry dispatches `START` directly (no `RESET` first) to avoid a flash of idle state between error and connecting
- On retry from timeout state: clear old partial text and show skeleton -- don't keep contradictory partial results visible
- After 3 retries, the button disappears and shows "Please try again later"
- `retryable` flag comes from the SSE error event -- only show retry for retryable errors
- Non-retryable errors (auth, bad request) never show retry -- these are config issues
- **Concurrent call guard**: `start()` / `retry()` are no-ops if status is already `connecting` or `streaming` -- prevents rapid clicks from opening multiple SSE connections

### AiSummaryCard State Machine

```
idle -> connecting (start triggered)
connecting -> streaming (first text chunk received)
connecting -> error (connection failed, pipeline error, empty response)
connecting -> timeout (15s elapsed, no text -- shows as error with TIMEOUT code)
streaming -> done (stream complete)
streaming -> timeout (15s elapsed, partial text available)
streaming -> error (mid-stream failure)
done -> idle (reset)
timeout -> connecting (retry -- clears old partial text, shows skeleton)
error -> connecting (retry, if retryable AND retryCount < 3)

Guards:
- start()/retry() are no-ops when status is connecting or streaming
- retry() is a no-op when !retryable or retryCount >= 3
```

### What This Story Does NOT Include

- **Free-tier truncation / upgrade CTA** -- Story 3.5 adds `subscriptionGate.ts` and the `free_preview` state behavior
- **Transparency panel** -- Story 3.6
- **Share functionality** -- Story 4.1
- **Circuit breaker pattern** -- not needed for MVP. SDK retries + timeout + client retry covers the resilience requirements

### Project Structure Notes

```
# MODIFIED files (all created in Story 3.3)
apps/api/src/services/aiInterpretation/claudeClient.ts        # re-throw raw Anthropic errors from streamInterpretation (don't wrap in ExternalServiceError) so streamHandler can instanceof-check error types
apps/api/src/services/aiInterpretation/streamHandler.ts       # add timeout + error handling
apps/api/src/services/aiInterpretation/streamHandler.test.ts   # extend with timeout/error tests
apps/web/lib/hooks/useAiStream.ts                              # add timeout/error/retry states
apps/web/lib/hooks/useAiStream.test.ts                         # extend reducer tests
apps/web/app/dashboard/AiSummaryCard.tsx                       # add timeout/error/retry UI
apps/web/app/dashboard/AiSummaryCard.test.tsx                  # extend with new state tests
apps/web/app/dashboard/DashboardShell.tsx                      # verify AI error isolation
packages/shared/src/types/sse.ts                               # add SsePartialEvent type + reason field on SseDoneEvent

# NEW files
apps/web/app/dashboard/AiSummaryErrorBoundary.tsx              # lightweight error boundary for AiSummaryCard
```

### Previous Story Intelligence

**From Story 3.3 (direct dependency):**
- `streamHandler.ts` already has basic SSE event format: `event: text\ndata: {...}\n\n` -- extend, don't replace
- `streamHandler.ts` Task 2.8 specifies basic error sending pattern (`event: error`) -- this story makes it comprehensive
- `streamHandler.ts` Task 2.9 specifies 15s timeout concept -- this story implements the full timeout + partial result flow
- `useAiStream` hook uses `useReducer` with `streamReducer` pure function -- add new action types to the reducer
- `AiSummaryCard` renders 6 states -- enhance timeout and error states from basic placeholders to full UX

**From Story 3.2:**
- Claude SDK mock pattern: mock `@anthropic-ai/sdk` as default export. For streaming, mock `messages: { stream: vi.fn() }` returning object with `.on()`, `.abort()`, and `.finalMessage()` methods
- `ExternalServiceError` wrapping pattern in claudeClient.ts -- same error types flow through the stream handler
- Vitest hoisting: `vi.mock` factory must define all constants inline

**From Story 3.1:**
- Logger mock needed: `vi.mock('../../config.js', ...)` + `vi.mock('../../lib/logger.js', ...)` in all integration tests
- `vi.clearAllMocks()` in `beforeEach` for clean isolation

**Config from Story 3.2:**
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

Recent commits follow conventional prefix pattern: `feat:`, `fix:`, `docs:`. Stories implemented in single `feat:` commits. Code review findings addressed in follow-up `fix:` commits.

```
85b239d docs: mark Story 3.2 done in sprint status
06f7502 fix: address code review findings for Story 3.2
488c3c8 feat: implement Story 3.2 -- prompt assembly + LLM integration
58b92e5 fix: address code review findings for Story 3.1
791953f feat: implement Story 3.1 -- curation pipeline statistical computation + scoring
```

### Anthropic SDK Streaming Reference (@anthropic-ai/sdk)

**MessageStream events relevant to error handling:**
```typescript
stream.on('text', (textDelta, textSnapshot) => { ... });  // each text chunk
stream.on('error', (error: AnthropicError) => { ... });    // error during stream
stream.on('abort', (error: APIUserAbortError) => { ... }); // stream aborted
stream.on('end', () => { ... });                           // last event, always fires
stream.on('message', (message: Message) => { ... });       // complete message
```

**Abort mechanism:**
```typescript
stream.abort();              // cancels in-flight HTTP request
stream.controller;           // underlying AbortController
// 'abort' event fires with APIUserAbortError
```

**SDK retry exhaustion**: After `maxRetries: 2` attempts, the error propagates to `stream.on('error')`. The error object retains the original type (`RateLimitError`, `InternalServerError`, etc.) so the stream handler can map it to the correct SSE error code.

### References

- [Source: _bmad-output/planning-artifacts/epics.md -- Epic 3, Story 3.4]
- [Source: _bmad-output/planning-artifacts/architecture.md -- NFR17 (graceful degradation), NFR18 (15s timeout + partial), NFR20 (integration timeout), NFR23 (retry + backoff)]
- [Source: _bmad-output/planning-artifacts/architecture.md -- Error Handling Chain, AppError hierarchy, ExternalServiceError]
- [Source: _bmad-output/planning-artifacts/architecture.md -- SSE streaming fallback, subscription gate annotation]
- [Source: _bmad-output/implementation-artifacts/3-3-sse-streaming-delivery-ai-summary-card.md -- streamHandler.ts Tasks 2.8/2.9, useAiStream StreamState, AiSummaryCard 6 states]
- [Source: _bmad-output/implementation-artifacts/3-2-curation-pipeline-prompt-assembly-llm-integration.md -- Claude SDK error types, retry config]
- [Source: @anthropic-ai/sdk helpers.md -- MessageStream events, abort, error handling]
- [Source: apps/api/src/middleware/errorHandler.ts -- AppError handling pattern]
- [Source: apps/web/app/dashboard/DashboardShell.tsx -- ChartErrorBoundary pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — all tests pass, no runtime debugging needed.

### Completion Notes List

- All 4 ACs implemented and verified
- 66 tests passing (28 backend + 38 frontend)
- Code review: 3 MEDIUM + 3 LOW findings, all fixed

### Validation Record

**Validated:** 2026-03-08
**Result:** PASS with 2 minor findings (both resolved in-artifact)

| # | Finding | Resolution |
|---|---------|------------|
| 1 | Timeout message wording ("interrupted") contradicted UX spec's intentional-curation framing | Updated AC1 and Task 4.1 to use UX spec wording: "We focused on the most important findings to keep things quick" |
| 2 | `claudeClient.ts` not listed as modified file despite needing error type changes for Task 2.3 instanceof checks | Added `claudeClient.ts` to modified files list with note: re-throw raw Anthropic errors from `streamInterpretation` instead of wrapping in `ExternalServiceError` |

### Code Review Record

**Reviewed:** 2026-03-09
**Result:** PASS — 3 MEDIUM + 3 LOW findings, all fixed

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| M1 | MEDIUM | `packages/shared/src/types/sse.ts` missing from story file list | Added to Project Structure Notes |
| M2 | MEDIUM | `AiSummaryErrorBoundary` missing `componentDidCatch` logging | Added `componentDidCatch` with console.error |
| M3 | MEDIUM | `storeSummary` failure unhandled after response ends | Wrapped in try/catch with logger.warn |
| L1 | LOW | `retry()` callback identity changes on every state transition | Noted — no fix needed, refs optimization deferred |
| L2 | LOW | `retryPending` not reset on dataset change | Added reset in datasetId change effect |
| L3 | LOW | Dev Agent Record section empty | Populated all fields |

### File List

**Modified:**
- `apps/api/src/services/aiInterpretation/claudeClient.ts`
- `apps/api/src/services/aiInterpretation/claudeClient.test.ts`
- `apps/api/src/services/aiInterpretation/streamHandler.ts`
- `apps/api/src/services/aiInterpretation/streamHandler.test.ts`
- `apps/web/lib/hooks/useAiStream.ts`
- `apps/web/lib/hooks/useAiStream.test.ts`
- `apps/web/app/dashboard/AiSummaryCard.tsx`
- `apps/web/app/dashboard/AiSummaryCard.test.tsx`
- `apps/web/app/dashboard/DashboardShell.tsx`
- `packages/shared/src/types/sse.ts`

**New:**
- `apps/web/app/dashboard/AiSummaryErrorBoundary.tsx`

**Companion docs (always-on):**
- `apps/api/src/services/aiInterpretation/claudeClient.ts_explained.md`
- `apps/api/src/services/aiInterpretation/streamHandler.ts_explained.md`
- `apps/web/lib/hooks/useAiStream.ts_explained.md`
- `apps/web/app/dashboard/AiSummaryCard.tsx_explained.md`
- `apps/web/app/dashboard/AiSummaryErrorBoundary.tsx_explained.md`
