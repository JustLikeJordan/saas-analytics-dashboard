# streamHandler.ts — Interview-Ready Documentation

## 1. Elevator Pitch

This file orchestrates real-time AI summary delivery over Server-Sent Events (SSE). When a user requests an AI interpretation of their business data and there's no cached version, `streamToSSE` takes over: it runs the curation pipeline to build a privacy-safe prompt, streams the Claude API response chunk by chunk to the browser, caches the result, and handles three failure modes gracefully — client disconnect, timeout with partial delivery, and mid-stream errors.

**How to say it in an interview:** "I built the SSE streaming handler that connects the AI curation pipeline to the browser. It manages the full lifecycle — prompt assembly, chunked delivery, cache-after-stream, and graceful degradation on timeout or disconnect."

## 2. Why This Approach

**SSE over WebSockets.** SSE fits the use case perfectly — it's a one-directional server-to-client stream. WebSockets would add protocol overhead, reconnection complexity, and require a separate upgrade path. SSE rides on regular HTTP, flows through proxies naturally, and the browser's `fetch` API handles it cleanly.

**Headers before content.** The function calls `res.flushHeaders()` immediately after setting SSE headers. This is load-bearing. Express buffers headers until the first `res.write()` by default. Flushing early tells the client "this is a stream, start reading now" rather than waiting for the first chunk. `X-Accel-Buffering: no` does the same for nginx reverse proxies.

**AbortController as the cancellation backbone.** A single AbortController handles both timeout and client disconnect. The timeout `setTimeout` calls `controller.abort()`. The `req.on('close')` listener does the same. The Claude SDK's `stream.abort()` is wired to this signal. One mechanism, three abort sources, zero race conditions.

**Cache-after-stream, not cache-before-stream.** We stream to the client first, then cache. This means the user gets the fastest possible response. If caching fails (DB hiccup), the user still got their summary. The next request just generates fresh — a reasonable tradeoff.

**Structured SSE events.** Each event has a typed name (`text`, `done`, `error`, `partial`) and a JSON data payload. The shared types (`SseTextEvent`, etc.) enforce the contract between this file and the client-side `useAiStream` hook. No stringly-typed protocol.

## 3. Code Walkthrough

### Helper functions (lines 12-20)

```typescript
function writeSseEvent(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
```

SSE protocol requires `event: <name>\ndata: <payload>\n\n`. The double newline terminates the event. JSON serialization handles escaping. Simple function, but it's the only place that knows about SSE wire format.

`isRetryable` classifies errors by message content. Authentication and validation errors aren't retryable — no point hammering the API with bad credentials. Everything else (network, 5xx, rate limits) gets `retryable: true` so the client can offer a retry button.

### streamToSSE (lines 22-110)

The main function. Think of it as a pipeline with four stages:

**Stage 1: Set up SSE connection (28-32).** Set headers, flush them. From this point forward, `res.json()` would throw — you're committed to `res.write()` and `res.end()`.

**Stage 2: Wire up cancellation (34-48).** Create an AbortController. Start a 15-second timeout (from `AI_TIMEOUT_MS` shared constant). Listen for client disconnect. Both abort sources clear state and signal the abort.

**Stage 3: Run pipeline and stream (50-83).** This is the happy path:
1. `runCurationPipeline(orgId, datasetId)` — computes stats from raw data, scores them by relevance
2. `assemblePrompt(insights)` — builds the LLM prompt from scored insights (privacy boundary — raw data never crosses this line)
3. `streamInterpretation(prompt, onText, signal)` — streams Claude's response, calling `onText` for each chunk
4. Each `onText` callback writes an SSE `text` event to the response
5. On completion: send `done` event, end response, cache the full text

Notice the `clientDisconnected` guard inside the `onText` callback. Without it, writing to a closed response throws. The boolean flag is cheaper than checking `res.writableEnded` on every chunk.

**Stage 4: Error handling (86-109).** Three branches:
- Client disconnected → log and bail quietly
- Timeout with accumulated text → send `partial` event with what we have, then `done`. The user gets something rather than nothing.
- Any other error → send `error` event with retryability flag

The timeout-with-partial pattern is the most interesting. If Claude is 12 seconds in and has generated 80% of the summary, throwing it away and showing an error would be a bad experience. Instead, we deliver what we have. The `done` event signals "no more data" even though it's incomplete — the client handles this gracefully.

## 4. Complexity and Trade-offs

**Time complexity:** Dominated by the Claude API call — typically 3-15 seconds. The curation pipeline is O(n) on data rows. SSE writes are O(1) per chunk.

**String concatenation:** `accumulatedText += delta` is O(n^2) over the full stream, but "n" here is the Claude response length (~150-500 words). On modern engines with string rope optimizations, this is negligible.

**Known tradeoff — no retry on pipeline failure.** If `runCurationPipeline` throws (DB down, no data), we send an SSE error event. We don't retry. Retrying a DB query that just failed is usually pointless until something changes — and the client has a retry button.

**Post-stream caching is fire-and-forget-ish.** The `storeSummary` call happens after `res.end()`. If it fails, the response already went out fine. But next time, the user gets a fresh stream instead of a cache hit. In practice, this is rare and self-healing.

## 5. Patterns Worth Knowing

**SSE protocol format.** Each event is `event: <name>\ndata: <json>\n\n`. The double newline is the delimiter. Browsers parse this natively with `EventSource`, but we use `fetch` + `ReadableStream` on the client for more control.

**Express 5 and SSE.** After `flushHeaders()`, Express 5's automatic promise rejection forwarding can't help you — headers are already sent. That's why the entire stream logic is wrapped in a manual try-catch. You have to handle errors as SSE events, not HTTP status codes.

**AbortController propagation.** The signal flows: `setTimeout`/`req.close` → `AbortController` → `stream.abort()` (Anthropic SDK) → HTTP request cancellation. This is the Web Platform's standard cancellation primitive. In interviews, knowing this pattern shows you understand modern async JavaScript.

**Graceful degradation ladder.** The function has three levels of degradation:
1. Success → full stream + cache
2. Timeout → partial text delivery
3. Error → error event with retry hint
4. Disconnect → silent cleanup

This is a real-world pattern. Systems that only handle success and total failure frustrate users.

## 6. Interview Questions

**Q: Why not use `res.json()` to send the cached response from this handler?**
A: By the time `streamToSSE` is called, we've already committed to SSE by setting headers and flushing them. You can't switch content types mid-response. The cache check happens in the route handler *before* calling this function. This function only handles the streaming path.

**Q: What happens if the Claude API hangs indefinitely?**
A: The 15-second timeout fires, aborting the stream via `AbortController`. If we've accumulated partial text, we send it as a `partial` event so the user sees something useful. If not, we send an `error` event. The client shows a retry button. No hung connections.

**Q: How do you prevent writing to a closed response after client disconnect?**
A: The `clientDisconnected` boolean is set in the `req.on('close')` handler. The `onText` callback checks this flag before every `res.write()`. The AbortController also cancels the upstream Claude stream, so no more chunks arrive. Belt and suspenders.

**Q: What if `storeSummary` fails after the stream completes?**
A: The user already got their full response — it was streamed before caching. A cache miss on the next visit just means another fresh stream. We log the error but don't propagate it. This is the right tradeoff: user experience over cache consistency.

**Q: Why use `satisfies` instead of `as` for the SSE event objects?**
A: `satisfies` validates the object matches the type at compile time without widening it. If someone adds a required field to `SseTextEvent`, this file fails to compile. `as` would silently allow incomplete objects. It's a strictness-over-convenience choice.

**Q: Could this function create a memory leak?**
Red flag if you say no without thinking. The `setTimeout` and `req.on('close')` listener are the two leak candidates. The timeout is cleared in every code path (success, error, disconnect). The close listener is cleaned up by Express when the request ends. But if `streamInterpretation` hung forever *and* the timeout somehow didn't fire, you'd have a leaked AbortController. In practice, the SDK has its own timeouts.

## 7. Data Structures

**`accumulatedText` (string):** Grows with each `delta` from the Claude stream. Used for two things: partial delivery on timeout, and cache storage on success. Conceptually a StringBuilder, but JS string concatenation is fine at this scale.

**`AbortController` / `AbortSignal`:** The Web Platform's cooperative cancellation primitive. The controller holds the signal. Calling `controller.abort()` sets `signal.aborted = true` and fires the `abort` event on the signal. Anything listening — the Claude SDK, timers, whatever — can react.

**`TransparencyMetadata`:** A Zod-validated object containing prompt version, scoring weights, and other metadata about how the AI summary was generated. Stored alongside the cached content for the transparency panel (Story 3.6).

## 8. Impress the Interviewer

**The privacy boundary.** Point out that `runCurationPipeline` returns `ScoredInsight[]`, not raw data rows. `assemblePrompt` turns those into a text prompt. At no point does raw customer data touch the LLM. This is privacy-by-architecture, enforced by TypeScript types. If someone tried to pass `DataRow[]` to `assemblePrompt`, the compiler would catch it.

**The timeout partial delivery pattern.** Most streaming implementations treat timeout as a binary — you either succeed or you error. This one delivers whatever text accumulated before the timeout. That's 10-12 seconds of AI generation the user would otherwise lose. It's a small thing, but it shows you think about the user's experience at the edge cases, not just the happy path.

**Cache-after-stream ordering.** Caching happens after `res.end()`, not before the stream starts. This means the user's perceived latency is stream latency only — no extra DB round-trip before they see the first token. The cache benefits the *next* visitor, not the current one. In a system interview, this shows you think about latency paths.

**Single cancellation mechanism.** Three different abort sources (timeout, disconnect, manual cancel) all flow through one AbortController. This eliminates an entire class of bugs where one path cleans up but another doesn't. If you're asked about concurrent cleanup strategies, this is a textbook example.
