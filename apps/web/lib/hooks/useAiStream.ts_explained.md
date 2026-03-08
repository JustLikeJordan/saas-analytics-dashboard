# useAiStream.ts — Interview-Ready Documentation

## 1. Elevator Pitch

A React hook that consumes Server-Sent Events for real-time AI summary streaming. It manages 5 connection states through a reducer, parses the SSE protocol with a line buffer, handles both JSON cache hits and SSE streams from the same endpoint, and cleans up gracefully on unmount or cancellation.

**How to say it in an interview:** "I built a custom React hook that uses `fetch` with `ReadableStream` to consume SSE streams. It manages connection state through a `useReducer` with discriminated union actions, handles two response formats from one endpoint, and the reducer is exported as a pure function for isolated testing."

## 2. Why This Approach

**`useReducer` over `useState`.** Three pieces of state (`status`, `text`, `error`) change together and have constraints (you can't be `streaming` with a non-null `error`). A reducer enforces these transitions in one place. With three separate `useState` calls, you'd need to coordinate updates and could end up with impossible state combinations.

**`fetch` over `EventSource`.** `EventSource` is the browser's built-in SSE client, but it has three dealbreakers for this use case:
1. No custom headers — can't pass cookies for auth (credentials mode is limited)
2. No `AbortController` — can't cancel cleanly on unmount
3. Auto-reconnects on error — we want explicit retry control

`fetch` + `ReadableStream` + `TextDecoderStream` gives full control over all three.

**Exported reducer.** The `streamReducer` function is pure — no side effects, no hooks, just `(state, action) => state`. Exporting it means unit tests can verify every state transition without rendering components or mocking `fetch`. This is a testing pattern worth knowing: separate pure logic from effectful hooks.

**Content-Type sniffing.** The same endpoint returns JSON for cache hits and `text/event-stream` for fresh generation. Instead of two hooks or two endpoints, we check `Content-Type` and branch. The cache path dispatches `CACHE_HIT` (which jumps straight to `done` status), skipping the entire streaming machinery.

**Line buffering.** SSE chunks don't arrive on clean event boundaries. A chunk might end mid-line: `event: text\ndata: {"tex`. The `parseSseLines` function splits on newlines, processes complete lines, and returns the incomplete remainder as the new buffer. This is a classic stream parsing pattern.

## 3. Code Walkthrough

### Types (lines 5-19)

```typescript
export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'done' | 'error';
```

Five states forming a state machine. The valid transitions are:
- `idle` → `connecting` (START)
- `connecting` → `streaming` (TEXT) or `error` (ERROR)
- `streaming` → `done` (DONE) or `error` (ERROR)
- `idle` → `done` (CACHE_HIT — skips the stream entirely)
- any → `idle` (RESET)

The `StreamAction` discriminated union has 6 variants. TypeScript's exhaustive switch checking means adding a new action type without handling it is a compile error.

### streamReducer (lines 23-38)

Each case is one line. That's the beauty of reducers for state machines — every transition is explicit and visible. Notice `TEXT` spreads the existing state and appends the delta — this preserves the `error: null` from the previous state. `CACHE_HIT` creates a fresh state with `status: 'done'` directly, because cached content doesn't go through the intermediate states.

### parseSseLines (lines 40-79)

This is the SSE protocol parser. The SSE spec says events look like:
```
event: text
data: {"text":"hello"}

```

Two fields (`event:` and `data:`), separated by a blank line. The function:
1. Splits input on `\n`
2. Pops the last element (might be incomplete — save as remainder)
3. Tracks `currentEvent` across lines
4. When it hits a `data:` line, JSON-parses the payload and dispatches based on the event type
5. Returns the remainder for the next chunk

The `partial` event type is interesting — it dispatches as `TEXT`, not a special action. From the UI's perspective, partial text looks the same as streamed text. The difference is purely semantic.

### useAiStream hook (lines 81-151)

**`start` callback (90-140).** The fetch sequence:
1. Abort any previous stream (idempotent — `cancel()` checks `abortRef.current`)
2. Dispatch `START` → status becomes `connecting`
3. Create new `AbortController`, stash in ref
4. `fetch` with `credentials: 'same-origin'` (cookies flow through the BFF proxy)
5. Check `res.ok` — non-2xx dispatches `ERROR`
6. Check `Content-Type` — JSON means cache hit, dispatch `CACHE_HIT` and return early
7. Otherwise, pipe through `TextDecoderStream`, read chunks in a loop, buffer and parse SSE lines
8. After the loop, flush any remaining buffer content

The `TextDecoderStream` handles UTF-8 decoding of the raw bytes. Without it, multi-byte characters split across chunks would produce garbled text.

**Auto-trigger effect (143-148).** When `datasetId` is non-null, `start()` fires on mount. The cleanup function calls `cancel()`, which aborts the fetch. This means navigating away from the dashboard cleanly cancels any in-flight stream — no orphaned requests.

**AbortError handling (137).** When the user navigates away, `cancel()` aborts the fetch, which throws an `AbortError`. We silently swallow it — there's no point dispatching `ERROR` to a component that's unmounting.

## 4. Complexity and Trade-offs

**String concatenation in the reducer.** `state.text + action.delta` is O(n) per append, O(n^2) total over a stream. For AI summaries of 150-500 words, this is ~2-10KB of text — the V8 engine handles this without breaking a sweat. A `string[]` joined at the end would be O(n) total, but adds complexity for no measurable benefit at this scale.

**No retry logic.** The hook dispatches `ERROR` and leaves retry to the UI layer (the `start` function is exposed for this). Baking retry with exponential backoff into the hook would be more robust, but the current approach keeps the hook simple and lets Story 3.4 add configurable retry behavior without reworking the hook's internals.

**Single-buffer SSE parsing.** The parser uses string splitting, not a proper state machine. For well-formed SSE from our own server, this is fine. A malicious or buggy server could craft payloads that break the parser. Since we control both ends and the BFF proxy sits in between, this is an acceptable tradeoff.

## 5. Patterns Worth Knowing

**Discriminated union + exhaustive switch.** TypeScript narrows the `action` type inside each `case` branch. If you add `| { type: 'PAUSE' }` to `StreamAction` without adding a case, `tsc` warns about unhandled branches (with `--noImplicitReturns` or a default throw). This is the state machine pattern at the type level.

**ReadableStream + TextDecoderStream pipeline.** `res.body.pipeThrough(new TextDecoderStream())` is the Web Streams API for transforming byte streams. The pipe creates backpressure — if the consumer (our read loop) is slow, the producer (the network) pauses. In practice, parsing SSE lines is much faster than network delivery, so backpressure doesn't activate.

**Ref as mutable container.** `abortRef` stores the current `AbortController` without triggering re-renders. If we used `useState`, changing the controller would re-render the component, which would re-run the effect, which would abort the stream, which would... infinite loop. Refs are the escape hatch for mutable state that doesn't affect rendering.

**Effect cleanup for resource management.** The `useEffect` return function calls `cancel()`, which aborts the fetch. This is React's lifecycle hook for cleanup — it runs on unmount and before the effect re-runs (if deps change). Without it, navigating away would leave an orphaned HTTP connection and a state update on an unmounted component.

## 6. Interview Questions

**Q: Why `useReducer` instead of `useState` for the stream state?**
A: Three reasons. First, the state transitions have constraints — you can't be `streaming` with a non-null `error`. A reducer enforces these in one place. Second, multiple state fields change together on each action. Third, the reducer is a pure function I can unit test without React. A strong answer also mentions that `useReducer` is the React-recommended approach when "the next state depends on the previous one."
Red flag: "I always use `useState` because it's simpler."

**Q: What happens if the component unmounts during streaming?**
A: The effect cleanup calls `cancel()`, which aborts the `AbortController`. The fetch throws `AbortError`, which the catch block silently swallows (checks `err.name === 'AbortError'`). No state dispatch happens on the unmounted component.
Red flag: "React handles that automatically" — it doesn't. Without abort, you'd get a "can't perform a React state update on an unmounted component" warning.

**Q: Why not use `EventSource`?**
A: Three reasons: no cookie/credential support for our auth model, no `AbortController` for clean cancellation, and auto-reconnect behavior we don't want. `fetch` + `ReadableStream` gives us full control. The tradeoff is we implement SSE parsing ourselves — about 40 lines of code.
Red flag: "What's EventSource?"

**Q: How would you add retry with exponential backoff?**
A: I'd add a `retryCount` to `StreamState` and a `RETRY` action. On `ERROR`, if `retryable` is true and `retryCount < maxRetries`, dispatch `RETRY` (which sets status back to `connecting` and increments the count). The `start` function would check the retry count and add `2^retryCount * baseDelay` via `setTimeout`. The hook already exposes `start` for manual retry — this just automates it.

**Q: What if an SSE chunk splits a multi-byte UTF-8 character?**
A: `TextDecoderStream` handles this. It maintains internal state across chunks and only emits complete characters. If a chunk ends mid-character, the partial bytes are buffered internally until the next chunk completes the character. This is why we pipe through `TextDecoderStream` before our line parser.

**Q: Can two streams run concurrently from this hook?**
A: No, by design. `start()` calls `cancel()` first, aborting any existing stream before starting a new one. The `abortRef` only holds one controller at a time. This prevents duplicate streams if `datasetId` changes rapidly.

## 7. Data Structures

**`StreamState`:** A flat object with three fields. `status` is the state machine position. `text` accumulates the full response (appended per `TEXT` action). `error` is nullable — only non-null in the `error` status.

**Line buffer (string):** The `buffer` variable in `start()` and the `remainder` return from `parseSseLines`. Holds incomplete SSE lines between chunks. This is a classic producer-consumer buffer — the network produces arbitrary chunks, the parser consumes complete lines.

**`abortRef` (React ref):** A mutable container holding the current `AbortController` or `null`. Not part of React's state — changing it doesn't trigger re-renders. This is the canonical React pattern for "I need to hold a value that changes over time but doesn't affect what I render."

## 8. Impress the Interviewer

**The exported reducer pattern.** Mention that `streamReducer` is exported and tested independently from the hook. Show that you understand the value of separating pure logic from effectful code. The reducer tests don't need `@testing-library/react`, don't need to mock `fetch`, and run in milliseconds. This is a testability decision, not an accident.

**Content-Type polymorphism.** The same endpoint, same fetch call, handles two response formats. Point out that this simplifies the client — one hook, one URL, one component. The alternative (two hooks or two fetch calls) would mean duplicated error handling, duplicated loading states, and a conditional render that decides which hook to use.

**The buffer-and-remainder pattern.** SSE parsing with `parseSseLines` returning the unprocessed remainder is a standard streaming parser technique. If you've seen this in protocol implementations, mention it. The key insight: you never know where chunk boundaries fall, so you must handle partial input gracefully.

**Race condition prevention.** The `start()` function calls `cancel()` before creating a new AbortController. This means rapid `datasetId` changes (e.g., user switches datasets quickly) can't create orphaned streams. Each new stream cleanly kills the previous one. In an interview about React async patterns, this is gold — most developers forget to cancel the previous request.
