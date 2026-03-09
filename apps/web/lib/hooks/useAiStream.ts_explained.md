# useAiStream.ts — Interview-Ready Documentation

## 1. Elevator Pitch

A React hook that consumes Server-Sent Events for real-time AI summary streaming. It manages 7 connection states through a reducer, parses the SSE protocol with a line buffer, handles both JSON cache hits and SSE streams from the same endpoint, supports client-side retry with a 3-attempt cap, degrades gracefully on timeout (delivering partial text), and cleans up on unmount or cancellation.

**How to say it in an interview:** "I built a custom React hook that uses `fetch` with `ReadableStream` to consume SSE streams. It manages connection state through a `useReducer` with discriminated union actions — including timeout, retry tracking, and error code propagation. The reducer is exported as a pure function so every state transition can be tested without React."

## 2. Why This Approach

**`useReducer` over `useState`.** Six pieces of state (`status`, `text`, `error`, `code`, `retryable`, `retryCount`) change together and have constraints — you can't be `streaming` with a non-null `error`, and `retryCount` should only increment on retry starts, not fresh starts. A reducer enforces these transitions in one place. With six separate `useState` calls, you'd need to coordinate updates and could end up with impossible state combinations.

**`fetch` over `EventSource`.** `EventSource` is the browser's built-in SSE client, but it has three dealbreakers for this use case:
1. No custom headers — can't pass cookies for auth (credentials mode is limited)
2. No `AbortController` — can't cancel cleanly on unmount
3. Auto-reconnects on error — we want explicit retry control

`fetch` + `ReadableStream` + `TextDecoderStream` gives full control over all three.

**Exported reducer.** The `streamReducer` function is pure — no side effects, no hooks, just `(state, action) => state`. Exporting it means unit tests can verify every state transition without rendering components or mocking `fetch`. This is a testing pattern worth knowing: separate pure logic from effectful hooks.

**`statusRef` for stale closure prevention.** The `start()` and `retry()` callbacks need to read the current status to guard against concurrent calls (`if connecting or streaming, bail out`). But `useCallback` captures state at creation time — if status changes, the callback still sees the old value. `statusRef.current = state.status` on every render keeps a mutable reference that callbacks can read live. The ref doesn't trigger re-renders, but it always reflects the latest status.

**How to say it in an interview:** "I use a ref to mirror the reducer's status so that memoized callbacks can read it without going stale. It's a common pattern when you need both `useCallback` stability and current state in the same function."

**Extracted `fetchStream`.** Both `start()` and `retry()` need the same fetch logic — create AbortController, call endpoint, parse SSE, dispatch actions. Instead of duplicating that in both callbacks, `fetchStream` holds the shared logic. `start()` dispatches `START` (resets retryCount), `retry()` dispatches `START` with `isRetry: true` (increments retryCount), then both call `fetchStream()`. DRY where it matters.

**Content-Type sniffing.** The same endpoint returns JSON for cache hits and `text/event-stream` for fresh generation. Instead of two hooks or two endpoints, we check `Content-Type` and branch. The cache path dispatches `CACHE_HIT` (which jumps straight to `done` status), skipping the entire streaming machinery.

**Line buffering.** SSE chunks don't arrive on clean event boundaries. A chunk might end mid-line: `event: text\ndata: {"tex`. The `parseSseLines` function splits on newlines, processes complete lines, and returns the incomplete remainder as the new buffer. This is a classic stream parsing pattern.

## 3. Code Walkthrough

### Types (lines 5-30)

```typescript
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error' | 'timeout' | 'free_preview';
```

Seven states forming a state machine. The valid transitions are:
- `idle` → `connecting` (START)
- `connecting` → `streaming` (TEXT) or `error` (ERROR)
- `streaming` → `done` (DONE) or `error` (ERROR) or `timeout` (PARTIAL)
- `idle` → `done` (CACHE_HIT — skips the stream entirely)
- `error` → `connecting` (START with isRetry — retry flow)
- `timeout` → `connecting` (START with isRetry — retry after partial)
- any → `idle` (RESET)

`StreamState` has six fields. The new ones from Story 3.4:
- `code: string | null` — error code from the server (e.g., `RATE_LIMITED`, `AI_UNAVAILABLE`)
- `retryable: boolean` — whether the error supports client retry
- `retryCount: number` — how many retry attempts have been made (0 on fresh start)

The `StreamAction` discriminated union has 7 variants. `START` gains `isRetry?: boolean`. `ERROR` gains `code?` and `retryable?`. New `PARTIAL` action carries the authoritative text for timeout delivery. TypeScript's exhaustive switch checking means adding a new action type without handling it is a compile error.

### streamReducer (lines 41-70)

Each case is compact. Key transitions worth noting:

**START:** Spreads `initialState` to reset everything, then conditionally handles `retryCount`. If `isRetry` is true, it increments the previous count. If false (fresh start), it resets to 0. This distinction matters — the UI uses `retryCount >= MAX_RETRIES` to hide the retry button.

**DONE:** Has a guard — `if (state.status === 'timeout') return state`. When the server sends a `partial` event followed by a `done` event, the DONE should not overwrite the timeout status. Without this guard, the state machine would jump from `timeout` to `done`, losing the timeout UI context.

**PARTIAL:** Sets `status: 'timeout'` and `text: action.text`. The text is *authoritative* — it replaces whatever was accumulated via TEXT actions, rather than appending. This is because the server sends the full accumulated text in the partial event, giving the client one source of truth.

**ERROR:** Now stores `code` and `retryable` from the action, defaulting to `null` and `false`. The text is preserved from the previous state — if the stream was mid-way through when the error hit, the accumulated text stays.

### parseSseLines (lines 72-115)

The SSE protocol parser. Changed in Story 3.4 to handle two new event types:
- `partial` → dispatches `PARTIAL` action (was treated as `TEXT` before)
- `error` → now extracts `code` and `retryable` from the JSON payload (was only extracting `message`)

The structure: split on `\n`, pop the last element as remainder, track `currentEvent` across lines, JSON-parse data payloads, dispatch actions. The `try/catch` around `JSON.parse` silently skips malformed lines — defensive but intentional, since the parser can't do anything useful with bad JSON.

### Hook body (lines 119-212)

**`statusRef` (lines 122-123).** Mirrors `state.status` into a ref on every render. Callbacks read `statusRef.current` instead of closing over `state.status`.

**`fetchStream` (lines 130-181).** The shared fetch logic. Creates an AbortController, fetches the endpoint, handles error responses (dispatches ERROR with code/retryable from the response body), detects cache hits via Content-Type, and runs the SSE read loop. The error response handling now extracts structured error info from the JSON body.

**`start` (lines 183-188).** Guards against concurrent calls via `statusRef`. Dispatches `START` (retryCount resets to 0), then calls `fetchStream()`.

**`retry` (lines 190-195).** Same guard as `start`, but dispatches `START` with `isRetry: true` (retryCount increments). The caller doesn't need to track retry count — the hook manages it.

**Auto-trigger effect (lines 198-203).** When `datasetId` is non-null, `start()` fires on mount. Cleanup calls `cancel()`.

**Return value (lines 205-212).** Spreads state and adds `start`, `cancel`, `retry`, and `maxRetriesReached: state.retryCount >= MAX_RETRIES`. The `maxRetriesReached` is a computed property — the component doesn't need to know `MAX_RETRIES` is 3.

## 4. Complexity and Trade-offs

**String concatenation in the reducer.** `state.text + action.delta` is O(n) per append, O(n^2) total over a stream. For AI summaries of 150-500 words (~2-10KB), this is negligible. A `string[]` joined at the end would be O(n) total, but adds complexity for no measurable benefit at this scale.

**Retry count lives in the reducer, not the hook.** The `retryCount` is part of `StreamState`, making it testable through the pure reducer. The alternative — a separate `useRef` in the hook body — would work but would mean the retry count can't be tested without rendering the hook.

**`statusRef` duplicates state.** Having both `state.status` and `statusRef.current` is intentional redundancy. The ref exists solely for memoized callbacks to read current status without re-creating on every state change. It's a correctness-over-elegance tradeoff — without it, `start()` and `retry()` would see stale status values from their closure.

**PARTIAL overwrites TEXT accumulation.** When the server sends a `partial` event, it includes the full accumulated text — the reducer uses this as the authoritative value rather than what the client accumulated via TEXT deltas. This means a dropped TEXT delta doesn't cause mismatched text. The server is the source of truth.

**Single-buffer SSE parsing.** The parser uses string splitting, not a proper state machine. For well-formed SSE from our own server, this is fine. Since we control both ends and the BFF proxy sits in between, this is an acceptable tradeoff.

## 5. Patterns Worth Knowing

**Discriminated union + exhaustive switch.** TypeScript narrows the `action` type inside each `case` branch. If you add `| { type: 'PAUSE' }` to `StreamAction` without adding a case, `tsc` warns about unhandled branches. This is the state machine pattern at the type level.

**How to say it in an interview:** "The reducer uses TypeScript discriminated unions so every state transition is type-checked. Adding a new action without handling it is a compile error."

**Ref as live state mirror (statusRef).** `useCallback` captures variables at creation time. If the callback depends on a value that changes between renders, it sees stale data. The `statusRef` pattern — `useRef` that's updated on every render — gives callbacks a mutable window into current state without breaking memoization.

**How to say it in an interview:** "I use a ref to mirror reducer state so memoized callbacks can read current values without going stale. It's the standard escape hatch for the useCallback-captures-stale-state problem."

**ReadableStream + TextDecoderStream pipeline.** `res.body.pipeThrough(new TextDecoderStream())` is the Web Streams API for transforming byte streams. The pipe creates backpressure — if the consumer is slow, the producer pauses.

**Extracted shared logic with semantic dispatch.** `start()` and `retry()` both call `fetchStream()`, but they dispatch different START variants. `start` resets retry count, `retry` increments it. The fetch logic doesn't know or care — it just does the fetch. The semantic difference lives in the dispatch, not the implementation.

**Computed properties in hook returns.** `maxRetriesReached` is derived from `state.retryCount >= MAX_RETRIES`. The component doesn't import `MAX_RETRIES` or do the comparison — the hook owns that policy. If we change the max from 3 to 5, only this file changes.

**Effect cleanup for resource management.** The `useEffect` return function calls `cancel()`, which aborts the fetch. This runs on unmount and before the effect re-runs. Without it, navigating away would leave an orphaned HTTP connection.

## 6. Interview Questions

**Q: Why `useReducer` instead of `useState` for the stream state?**
A: Six pieces of state change together with constraints — you can't be streaming with a non-null error, retryCount only increments on retry starts. A reducer enforces these transitions atomically in one place. The reducer is pure and testable without React.
*Red flag:* "I always use `useState` because it's simpler."

**Q: What is `statusRef` and why do you need it?**
A: `statusRef` mirrors `state.status` into a ref so memoized callbacks (`start`, `retry`) can read the current status without going stale. `useCallback` captures values at creation time. Without the ref, calling `start()` when status is already `connecting` might not see the `connecting` value — it'd see whatever status was when the callback was last created. The ref solves this without breaking memoization.
*Red flag:* "Just remove `useCallback` and read state directly." That causes every child to re-render on every state change.

**Q: How does `retry()` differ from a fresh `start()`?**
A: Both call the same `fetchStream()`. The difference is the START action: `retry` passes `isRetry: true`, which increments `retryCount` in the reducer. `start` resets it to 0. The UI reads `maxRetriesReached` (computed as `retryCount >= 3`) to hide the retry button after 3 attempts.
*Red flag:* "They're the same thing." They share fetch logic but have different retry-count semantics.

**Q: Why does DONE return `state` unchanged when status is `timeout`?**
A: The server sends `partial` then `done` events on timeout. PARTIAL sets status to `timeout`, which triggers timeout-specific UI (partial text + "we focused on the most important findings" message). Without the guard, the trailing DONE would overwrite `timeout` with `done`, and the timeout UI would flash and disappear. It's a state machine invariant — DONE is only meaningful when you're in a state that expects completion.
*Red flag:* "DONE should always set status to done." That breaks the timeout UI.

**Q: What happens if the component unmounts during streaming?**
A: The effect cleanup calls `cancel()`, which aborts the `AbortController`. The fetch throws `AbortError`, which the catch block silently swallows (checks `err.name === 'AbortError'`). No state dispatch happens on the unmounted component.
*Red flag:* "React handles that automatically."

**Q: Why not use `EventSource`?**
A: Three reasons: no cookie/credential support for our auth model, no `AbortController` for clean cancellation, and auto-reconnect behavior we don't want. `fetch` + `ReadableStream` gives full control. The tradeoff is we implement SSE parsing ourselves — about 40 lines of code.

## 7. Data Structures

**`StreamState`:** A flat object with six fields. `status` is the state machine position. `text` accumulates the full response. `error` and `code` are nullable — only non-null in the `error` status. `retryable` indicates if the error supports retry. `retryCount` tracks consecutive retry attempts.

**Line buffer (string):** The `buffer` variable in `fetchStream()` and the `remainder` return from `parseSseLines`. Holds incomplete SSE lines between chunks. Classic producer-consumer buffer pattern.

**`abortRef` (React ref):** A mutable container holding the current `AbortController` or `null`. Changing it doesn't trigger re-renders. Canonical React pattern for mutable values that don't affect rendering.

**`statusRef` (React ref):** Mirrors `state.status` for memoized callbacks to read without stale closures. Updated synchronously on every render via `statusRef.current = state.status`.

## 8. Impress the Interviewer

**The exported reducer pattern.** Mention that `streamReducer` is exported and tested independently from the hook. Show that you understand the value of separating pure logic from effectful code. The reducer tests don't need `@testing-library/react`, don't need to mock `fetch`, and run in milliseconds. This is a testability decision.

**The DONE guard as state machine invariant.** The `if (state.status === 'timeout') return state` check in the DONE handler is a one-line guard that prevents a real bug. Without it, the server's `partial → done` event sequence would cause the timeout UI to flash and disappear. In an interview, this shows you think about event ordering across system boundaries — the server doesn't know what UI state the client is in.

**Two-level retry architecture.** The Anthropic SDK handles server-side retries (maxRetries: 2 with exponential backoff for 5xx/429). This hook handles client-side retries (max 3, user-triggered). They're independent — SDK retries happen within a single `fetchStream` call, hook retries start entirely new calls. Mention this separation if asked about retry strategy.

**Race condition prevention.** Two mechanisms working together: `cancel()` before every new fetch aborts orphaned streams, and `statusRef` guards prevent concurrent `start()`/`retry()` calls. Rapid dataset changes or button mashing can't create duplicate streams or corrupt state.
