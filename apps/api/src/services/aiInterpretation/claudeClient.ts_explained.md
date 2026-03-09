# claudeClient.ts -- Interview-Ready Documentation

## 1. 30-Second Elevator Pitch

This module wraps the Anthropic SDK to call Claude's API for generating business data interpretations. It has two entry points: `generateInterpretation()` for cache population (non-streaming, full response at once) and `streamInterpretation()` for real-time delivery to users (chunk-by-chunk via a callback). Both share the same client and model config, though their error handling diverges intentionally — the non-streaming path wraps errors for Express middleware, while the streaming path re-throws raw SDK errors so the SSE handler can discriminate by type. The SDK handles retries and timeouts natively.

**How to say it in an interview:** "We have two LLM call paths in one module — a synchronous path for cache population and a streaming path for real-time user delivery. They share the same client but handle errors differently: the non-streaming path wraps in ExternalServiceError for Express middleware, while the streaming path re-throws raw Anthropic errors so the SSE handler can do instanceof checks for precise error code mapping."

## 2. Why This Approach

### Decision 1: Two call paths, one module

`generateInterpretation()` uses `messages.create()` (non-streaming) for cache population -- the full response gets stored before any user sees it. `streamInterpretation()` uses `messages.stream()` for real-time delivery -- chunks flow to the user via SSE as they arrive. Both live in the same module because they share the client singleton, model config, and error classification logic. Splitting them into separate files would duplicate the client setup and error handling.

**How to say it:** "We have a synchronous path for background cache population and a streaming path for real-time delivery. They share the same client and error handling, but use different SDK methods."

### Decision 2: SDK-native retry instead of custom logic

The Anthropic SDK has built-in retry with exponential backoff for 5xx errors, rate limits (429), and network failures. We configure `maxRetries: 2` and `timeout: 15_000` and let the SDK handle the rest. Writing custom retry logic would add complexity without adding value -- the SDK authors understand their API's failure modes better than we do.

### Decision 3: Divergent error strategies by call path

`generateInterpretation` wraps all errors in `ExternalServiceError` (producing a 502 response) because it flows through Express's centralized error middleware. `streamInterpretation` re-throws raw SDK errors — `throw err` instead of `throw new ExternalServiceError(...)`. Why? Because once SSE headers are flushed, the streaming handler can't use HTTP status codes. It needs the original Anthropic error types (`RateLimitError`, `AuthenticationError`, `APIConnectionTimeoutError`, etc.) for `instanceof` checks that map to specific SSE error codes. Wrapping would erase that type information.

Both paths still classify errors for logging: non-retryable (auth, bad request) at `error` level, retryable (everything else) at `warn` level.

## 3. Code Walkthrough

### Block 1: Client construction (lines 1-12)

The Anthropic client is constructed at module load time with three configuration values from `config.ts`: API key, max retries, and timeout. All come from validated environment variables -- never from `process.env` directly. The client is a singleton, created once and reused across requests.

### Block 2: generateInterpretation (lines 14-42)

The core function. It calls `client.messages.create()` with the configured model, a 1024 max_tokens budget, and the assembled prompt. The response is an array of content blocks -- we extract text from the first block via a type guard (`block?.type === 'text'`). If the response is somehow non-text (like a tool_use block), we return an empty string rather than crashing.

Token usage from `message.usage` is logged for monitoring -- you want to track input/output token counts to catch prompt bloat or unexpectedly long responses.

### Block 3: Error handling (lines 30-42)

The catch block wraps all errors in `ExternalServiceError`, which produces a 502 response. Before wrapping, it classifies the error:

- `AuthenticationError` or `BadRequestError` -> `logger.error` (non-retryable, needs human attention)
- Everything else -> `logger.warn` (retryable failures that the SDK already attempted to retry)

The original error message is preserved in the `details` field for debugging, but never exposed to the end user (the error handler strips internals).

### Block 4: streamInterpretation (added in Story 3.3)

The streaming counterpart to `generateInterpretation`. Key differences:
- Uses `client.messages.stream()` instead of `client.messages.create()`
- Accepts an `onText` callback invoked for each text delta
- Accepts an optional `AbortSignal` for cooperative cancellation
- Returns a `StreamResult` with the full text and usage stats from `stream.finalMessage()`

The abort wiring is worth noting: when the signal fires, we call `stream.abort()` to cancel the in-flight HTTP request to Claude. The `signal.addEventListener('abort', ...)` is registered with `{ once: true }` to avoid leaking listeners. We also clean up the listener when the stream ends naturally via `stream.on('end', ...)`.

Error handling diverges from `generateInterpretation` here (updated in Story 3.4): the catch block re-throws raw errors (`throw err`) instead of wrapping in `ExternalServiceError`. This preserves Anthropic SDK error types so `streamHandler.ts` can do `instanceof` discrimination — mapping `RateLimitError` to `RATE_LIMITED`, `AuthenticationError` to `AI_AUTH_ERROR`, etc. If `signal.aborted` is true when the catch block fires, we log at info level (not error) and rethrow. Client-initiated cancellation isn't an error — it's normal behavior when users navigate away.

## 4. Complexity and Trade-offs

**Time complexity:** One API call per invocation. The SDK may make up to 3 total attempts (1 original + 2 retries) with exponential backoff.

**Trade-off -- timeout of 15 seconds:** This matches the architecture's NFR3 for total generation budget. The SDK's timeout covers the full request including retries. If the first attempt times out and the SDK retries, the second attempt gets a fresh 15-second window. For seed data generation (in `seed.ts`), we use a longer 30-second timeout since it runs once during setup, not on the hot path.

**Trade-off -- singleton client:** Creating the client at module load time means configuration is locked in at startup. If you wanted to change the API key at runtime, you'd need to restart the process. For this application, that's fine -- API keys don't change mid-session.

## 5. Patterns Worth Knowing

**Error strategy depends on the consumer.** `generateInterpretation` wraps errors in `ExternalServiceError` (502 Bad Gateway) because Express middleware formats it into the standard `{ error: { code, message } }` JSON response. `streamInterpretation` re-throws raw because its consumer — `streamHandler.ts` — has already flushed SSE headers and can't use HTTP status codes. The SSE handler needs `instanceof` checks against Anthropic SDK classes to map errors to specific codes like `RATE_LIMITED` or `AI_AUTH_ERROR`. Wrapping would erase those types. Same module, two different error contracts, because the transport layer dictates the strategy.

**Log level as severity signal:** Using `error` vs `warn` vs `info` isn't cosmetic. In production monitoring (Datadog, PagerDuty, etc.), you'd typically alert on `error` level but not `warn`. A burst of 401s means your API key is invalid and needs immediate attention. A burst of 429s means you're hitting rate limits and should probably back off, but it's not an emergency. Client-initiated aborts log at `info` — they're expected behavior, not a problem. All log calls follow Pino's structured convention: object first, message string second. So `logger.info({ aborted: true }, 'Claude API stream aborted by client')` rather than interpolating values into the message string.

**Content block type guard:** Claude's response isn't always text. It can include tool_use blocks, thinking blocks, or other types. The `block?.type === 'text'` guard handles this gracefully. Most tutorials skip this check, which can cause runtime crashes on unexpected response shapes.

## 6. Interview Questions

**Q: Why does `streamInterpretation` re-throw raw errors while `generateInterpretation` wraps them?**
A: The two functions have different consumers with different constraints. `generateInterpretation` flows through Express's error middleware, which expects `ExternalServiceError` to produce a 502 JSON response. `streamInterpretation` is called by the SSE handler, which has already flushed headers — it can't send HTTP status codes. The SSE handler needs the raw Anthropic SDK error types (`RateLimitError`, `AuthenticationError`, etc.) for `instanceof` checks that map to specific SSE error codes. Wrapping in `ExternalServiceError` would erase the type information.

**Q: Why have both streaming and non-streaming paths?**
A: Different use cases. `generateInterpretation()` is for cache population (seed script, background jobs) -- we need the full text at once to store it. `streamInterpretation()` is for real-time delivery when a user requests a summary that isn't cached yet. The streaming path delivers text to the user as it's generated, then caches the full result for future requests. Most requests hit the cache and never stream.

**Q: How do you handle API key rotation?**
A: The client is constructed at startup from validated env vars. Key rotation means updating the env var and restarting the service. In a container environment (Docker/K8s), this happens naturally during deployments. For zero-downtime rotation, you'd need a key provider that fetches from a secrets manager -- but that's overengineering for this stage.

**Q: What happens when the LLM returns an unexpected response format?**
A: The type guard `block?.type === 'text'` returns empty string for non-text blocks. The orchestrator stores whatever we get. An empty summary is better than a crash -- the user sees "no analysis available" rather than a 500 error.

## 7. Data Structures

Input: `string` (the assembled prompt from `assembly.ts`)

Output: `string` (the LLM's text response, untruncated)

The module doesn't know about business concepts like insights or summaries -- it's a generic "send prompt, get text" wrapper. The orchestrator gives it meaning by storing the result in `ai_summaries`.

## 8. Impress the Interviewer

The most interesting thing about this module isn't the LLM calls — it's the error handling asymmetry. Both functions call the same API, but their error strategies diverge because they have different consumers. `generateInterpretation` wraps errors for Express middleware. `streamInterpretation` re-throws raw for SSE `instanceof` discrimination. This is the kind of decision that separates production code from tutorial code — the "right" error handling depends on where the error lands, not where it originates.

The architectural insight: most requests never trigger an LLM call. The cache-first strategy means 100 users viewing the same dataset don't make 100 API calls. Only the first user (or after a data upload invalidates the cache) triggers the streaming path. Everyone else gets instant JSON.

The abort signal propagation in `streamInterpretation` is worth highlighting. When a user navigates away, the cancellation flows: React unmount → `AbortController.abort()` → BFF request teardown → Express `req.close` → `signal.abort` event → `stream.abort()` → HTTP request to Claude cancelled. Four layers, one cancellation mechanism, zero leaked resources.
