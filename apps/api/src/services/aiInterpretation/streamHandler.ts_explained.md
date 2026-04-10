# streamHandler.ts — Interview-Ready Documentation

## 1. Elevator Pitch

This file orchestrates real-time AI summary delivery over Server-Sent Events (SSE). When a user requests an AI interpretation and there's no cached version, `streamToSSE` takes over: it runs the curation pipeline to build a privacy-safe prompt, streams Claude's response chunk by chunk to the browser, caches the result, and handles six failure modes — client disconnect, timeout with partial delivery, timeout with no text, pipeline errors, free-tier truncation, and classified API errors. It returns `Promise<StreamOutcome>` — a struct with `ok: boolean` and optional `usage: { inputTokens, outputTokens }` — so the caller can gate analytics events and log token metrics.

**How to say it in an interview:** "I built the SSE streaming handler that connects the AI curation pipeline to the browser. It manages the full lifecycle — prompt assembly, chunked delivery, free-tier truncation, cache-after-stream, and graceful degradation. The return type is a structured `StreamOutcome` rather than a plain boolean, so the caller gets both the success signal and token usage data for analytics without needing side channels or shared state. Error handling is split into two phases: pipeline failures get caught before Claude is ever called, and stream failures use instanceof checks against Anthropic SDK error classes for precise error code mapping."

## 2. Why This Approach

**SSE over WebSockets.** SSE fits perfectly — one-directional server-to-client stream. WebSockets would add protocol overhead, reconnection complexity, and a separate upgrade path. SSE rides on regular HTTP, flows through proxies naturally, and the browser's `fetch` API handles it cleanly.

**How to say it:** "SSE is the right tool for unidirectional streaming. We don't need bidirectional communication, so WebSockets would add complexity without benefit."

**`mapStreamError` with instanceof over string matching.** The previous approach (`isRetryable`) checked error message strings to classify errors — fragile and imprecise. `mapStreamError` uses `instanceof` checks against the Anthropic SDK's typed error classes: `RateLimitError`, `AuthenticationError`, `APIConnectionTimeoutError`, etc. Each maps to a specific SSE error code with a retryability flag. The client gets actionable information, not just "something went wrong."

**How to say it:** "I replaced string-based error matching with instanceof checks against the SDK's error hierarchy. This gives the client precise error codes — RATE_LIMITED vs AI_UNAVAILABLE vs AI_AUTH_ERROR — with correct retryability flags."

**Over alternative:** String matching (`err.message.includes('rate')`) is fragile across SDK versions and locales. Discriminated error classes are the SDK's contract.

**Two-phase error handling.** Pipeline errors (curation failure, prompt assembly) are caught separately from stream errors (Claude API issues). If the pipeline blows up, we send `PIPELINE_ERROR` before Claude is ever called — no wasted API calls. If the stream fails, we send a classified error from `mapStreamError`.

**How to say it:** "Errors are split into pipeline phase and stream phase. Pipeline failures short-circuit before the LLM call, saving API costs and giving more specific error codes."

**`safeEnd()` double-end guard.** Three things can end the response: successful completion, timeout, and error handling. If timeout fires at the exact moment the stream completes, both paths try to call `res.end()`. Calling `res.end()` twice throws in Node. The `ended` flag + `safeEnd()` wrapper makes every end-path idempotent.

**How to say it:** "I use a boolean guard to make `res.end()` idempotent. Timeout and completion can race — without the guard, you'd get a Node crash from double-ending the response."

**`StreamOutcome` struct over bare boolean.** The function used to return `Promise<boolean>` — `true` for success, `false` for failure. But the caller (aiSummary route) now needs token usage data for analytics events (`inputTokens`, `outputTokens`). Options: (1) out-parameter, (2) shared mutable state, (3) return a struct. The struct is cleanest — `{ ok: true, usage: { inputTokens, outputTokens } }` on full success, `{ ok: true }` on free-tier truncation (we aborted before getting final usage), `{ ok: false }` on any failure. The optional `usage` field means the caller can spread it into analytics metadata without null checks.

**How to say it:** "I changed the return type from boolean to a structured outcome so the caller gets both the success signal and token counts in one value. It's cleaner than out-parameters or shared state, and the optional usage field naturally handles cases where tokens aren't available — like free-tier truncation where we abort before the final message."

**Cache-after-stream.** We stream to the client first, then cache. The user gets the fastest possible response. If caching fails, the user still got their summary. The next request just regenerates.

## 3. Code Walkthrough

### Helper functions (lines 11-36)

**`writeSseEvent`** — One function that knows about SSE wire format: `event: <name>\ndata: <json>\n\n`. The double newline terminates the event.

**`mapStreamError`** — Takes unknown error, returns `SseErrorEvent` with `code`, `message`, and `retryable`. The instanceof check order matters: `APIConnectionTimeoutError` extends `APIConnectionError`, so the timeout check must come first. If you flip them, timeouts would match the parent class and get the wrong code.

The mapping:
- `APIConnectionTimeoutError` → `TIMEOUT` (retryable)
- `APIConnectionError` → `AI_UNAVAILABLE` (retryable)
- `InternalServerError` → `AI_UNAVAILABLE` (retryable)
- `RateLimitError` → `RATE_LIMITED` (not retryable — SDK already retried)
- `AuthenticationError` → `AI_AUTH_ERROR` (not retryable — broken config)
- `BadRequestError` → `STREAM_ERROR` (not retryable — bad prompt)
- Everything else → `STREAM_ERROR` (retryable — benefit of the doubt)

### streamToSSE — setup (lines 38-71)

**SSE headers (44-48).** `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no` (for nginx). `flushHeaders()` tells the client "start reading now" instead of waiting for the first chunk.

**Cancellation backbone (50-71).** Single `AbortController` handles timeout and disconnect. `setTimeout` at `AI_TIMEOUT_MS` (15s) calls `controller.abort()`. `req.on('close')` does the same for client disconnect.

**Double-end guard (54-60).** `let ended = false` + `safeEnd()` wrapper. Every exit path calls `safeEnd()` instead of `res.end()` directly. If the flag is already true, the function is a no-op.

### Pipeline phase (lines 73-98)

Separate try/catch from the stream phase. Three steps:
1. `runCurationPipeline(orgId, datasetId)` — compute stats from raw data
2. `assemblePrompt(insights)` — build the LLM prompt (privacy boundary — raw data stays on this side)
3. `transparencyMetadataSchema.parse(metadata)` — Zod-validate the metadata

If any of these throw, we send `PIPELINE_ERROR` without ever calling Claude. The client disconnect guard runs before the error write — no point writing to a closed connection.

### Stream phase (lines 100-183)

**onText callback (106-109).** Guards against `clientDisconnected || ended` before every write. The `ended` guard is new — it prevents writes after timeout has already ended the response.

**Empty response check (117-126).** After streaming completes, if `result.fullText` is empty, we send `EMPTY_RESPONSE` instead of caching an empty summary. This catches the edge case where Claude acknowledges the prompt but produces no content.

**Success path (128-145).** Send `done` event with usage stats, `safeEnd()`, then cache the full text inside a try/catch — if the DB write fails, the user already has their response, so we log a warning and move on. Return `true`.

**Error handling (141-182).** Five branches, all returning `false`:
1. **Client disconnected** → log info, bail quietly
2. **Timeout + text accumulated** → send `partial` with full accumulated text, send `done` with `reason: 'timeout'`, `safeEnd()`. The user gets something rather than nothing.
3. **Timeout + no text** → send `TIMEOUT` error (retryable). Nothing to salvage.
4. **Already ended** → bail (another path already handled it)
5. **Any other error** → `mapStreamError()` classifies it, send the mapped error event

The `timedOut` + `accumulatedText` combination is the most interesting path. If Claude has generated 80% of the summary when the 15-second timer fires, throwing it away would waste 12 seconds of generation. Instead, we deliver what we have with a `partial` event, followed by `done` with `reason: 'timeout'` so the client knows it's incomplete.

## 4. Complexity and Trade-offs

**Time complexity:** Dominated by the Claude API call (3-15 seconds). Pipeline is O(n) on data rows. SSE writes are O(1) per chunk. `mapStreamError` is O(1) — a fixed chain of instanceof checks.

**String concatenation:** `accumulatedText += delta` is O(n^2) over the full stream, but n is 150-500 words. Negligible on modern engines.

**No caching on partial/timeout.** Partial text isn't cached — only complete responses go to `ai_summaries`. If we cached partials, the next visitor would get a truncated summary forever. They'd need to somehow know it's partial and re-generate. Simpler to just not cache and let the next request try fresh.

**instanceof check ordering.** `APIConnectionTimeoutError extends APIConnectionError` means the order of instanceof checks is load-bearing. Swapping them would classify timeouts as connection errors. A comment in the code documents this, but it's still a maintenance hazard if someone reorders the chain.

**How to say it in an interview:** "We deliberately chose not to cache partial results. A complete re-generation on the next request is better than permanently storing a truncated summary. The trade-off is one extra API call, but the alternative is a degraded permanent cache entry."

## 5. Patterns Worth Knowing

**SSE protocol format.** Each event is `event: <name>\ndata: <json>\n\n`. The double newline is the delimiter. Browsers parse this natively with `EventSource`, but we use `fetch` + `ReadableStream` on the client for more control.

**Express 5 and SSE.** After `flushHeaders()`, Express 5's automatic promise rejection forwarding can't help — headers are already sent. That's why errors must be SSE events, not HTTP status codes. This is a common gotcha in SSE implementations.

**How to say it in an interview:** "Once you flush SSE headers, you're committed to the streaming protocol. Errors become SSE events, not HTTP responses. That's why I handle errors manually rather than letting Express's error middleware catch them."

**AbortController propagation.** The signal flows: `setTimeout`/`req.close` → `AbortController` → `streamInterpretation`'s signal → HTTP request cancellation. One mechanism, multiple abort sources.

**Boolean return as outcome signal.** Only the full success path returns `true`. Every failure path returns `false`. The route handler uses this to gate the `AI_SUMMARY_COMPLETED` analytics event.

**Idempotent end via guard flag.** The `safeEnd()` pattern is applicable anywhere multiple async paths might try to finalize a resource. It's simpler than reference counting or mutex-style locks, and works because Node is single-threaded — no actual concurrency, just interleaved async.

**`satisfies` type assertions.** Every SSE event object uses `satisfies SseTextEvent` (or similar). This validates the object matches the shared type at compile time without widening it. If someone adds a required field to `SseErrorEvent`, this file fails to compile.

**Graceful degradation ladder.** Five levels:
1. Success → full stream + cache → `true`
2. Timeout with text → partial delivery → `false`
3. Timeout without text → error event → `false`
4. Classified error → specific error event → `false`
5. Disconnect → silent cleanup → `false`

## 6. Interview Questions

**Q: Why split error handling into pipeline and stream phases?**
A: Different failure modes need different responses. A pipeline failure (DB down, bad data shape) means "we couldn't even build the prompt" — that's `PIPELINE_ERROR`. A stream failure means "Claude had a problem" — that could be rate limiting, auth issues, or timeouts. Splitting them lets the client show more helpful messages and avoids wasting API calls on prompt failures.
*Red flag:* "Just catch everything in one block." You lose the ability to give specific error codes.

**Q: Why does `mapStreamError` check `APIConnectionTimeoutError` before `APIConnectionError`?**
A: `APIConnectionTimeoutError` extends `APIConnectionError`. If you check the parent first, timeouts match the parent's instanceof and get classified as `AI_UNAVAILABLE` instead of `TIMEOUT`. Subclass checks must come before superclass checks in instanceof chains.
*Red flag:* "The order doesn't matter." It does — inheritance hierarchy determines match order.

**Q: What's the `safeEnd()` guard protecting against?**
A: The race between timeout and stream completion. If the timeout fires at the same moment `streamInterpretation` resolves, both the timeout handler and the success path try to call `res.end()`. Node throws on double-end. The `ended` boolean makes it idempotent — first caller wins, second is a no-op.
*Red flag:* "Just use try-catch around res.end()." That hides the real issue and makes the code harder to reason about.

**Q: Why not cache partial results on timeout?**
A: A partial summary cached permanently would give every future visitor a truncated analysis with no way to know it's incomplete. Better to not cache and let the next request generate fresh. The cost is one extra API call; the benefit is no permanently degraded cache entries.
*Red flag:* "Cache everything to save API calls." You'd serve incomplete summaries forever.

**Q: What happens if `storeSummary` fails after the stream completes?**
A: The user already got their full response — it was streamed before caching. A cache miss on the next visit just triggers another stream. The cache write is wrapped in try/catch with `logger.warn` so failures are visible but never crash the handler. User experience over cache consistency.

**Q: Could this function create a memory leak?**
A: The `setTimeout` and `req.on('close')` listener are the two candidates. The timeout is cleared in every code path. The close listener is cleaned up by Express when the request ends. The `accumulatedText` string grows during streaming but is released when the function returns. No persistent references escape the function scope.

## 7. Data Structures

**`accumulatedText` (string):** Grows with each delta. Used for partial delivery on timeout and cache storage on success. Conceptually a StringBuilder, but JS string concatenation is fine at this scale.

**`AbortController` / `AbortSignal`:** The Web Platform's cooperative cancellation primitive. The controller holds the signal. `controller.abort()` sets `signal.aborted = true` and fires the `abort` event on listeners.

**`TransparencyMetadata`:** A Zod-validated object containing prompt version, scoring weights, stat types, and other metadata about how the summary was generated. Stored alongside cached content for the transparency panel.

**`SseErrorEvent`:** The return type of `mapStreamError`. A flat object with `code` (string), `message` (string), and `retryable` (boolean). Defined in `shared/types` so both server and client agree on the shape.

## 8. Impress the Interviewer

**The privacy boundary.** `runCurationPipeline` returns `ScoredInsight[]`, not raw data rows. `assemblePrompt` turns those into a text prompt. At no point does raw customer data touch the LLM. This is privacy-by-architecture, enforced by TypeScript types. If someone tried to pass `DataRow[]` to `assemblePrompt`, the compiler would catch it.

**How to bring it up:** "The curation pipeline computes statistics from raw data, then the assembly step builds a prompt from those statistics. Raw customer data never crosses the LLM boundary — that's enforced by the type system, not just convention."

**The instanceof inheritance trap.** The `APIConnectionTimeoutError extends APIConnectionError` ordering in `mapStreamError` is a real-world bug that people hit. Mention that you documented it in a code comment and tested it with a parameterized `it.each` that covers all 6 error types. This shows you think about inheritance hierarchies in error classification.

**How to bring it up:** "We have a parameterized test that verifies all six Anthropic error types map to the correct SSE codes. The ordering of instanceof checks matters because of the SDK's inheritance hierarchy — I documented why and wrote tests to catch regressions."

**Two-phase error architecture.** Pipeline errors short-circuit before the LLM call. This isn't just about error messages — it saves API costs. If the curation pipeline fails (DB down, no data), there's no point calling Claude. The `PIPELINE_ERROR` code tells the client "the problem is with our data processing, not the AI service."

**How to bring it up:** "I split error handling into pipeline and stream phases. Pipeline failures short-circuit before the API call, which saves both latency and API costs. The client gets a specific PIPELINE_ERROR code instead of a generic failure."

**The timeout partial delivery pattern.** Most streaming implementations treat timeout as binary — succeed or error. This one delivers accumulated text on timeout via a `partial` event, followed by `done` with `reason: 'timeout'`. The client shows what was generated with an "we focused on the most important findings" message. It turns a 15-second wait into something useful instead of wasted time.
