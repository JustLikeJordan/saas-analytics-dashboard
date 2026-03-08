# claudeClient.ts -- Interview-Ready Documentation

## 1. 30-Second Elevator Pitch

This module wraps the Anthropic SDK to call Claude's API for generating business data interpretations. It has two entry points: `generateInterpretation()` for cache population (non-streaming, full response at once) and `streamInterpretation()` for real-time delivery to users (chunk-by-chunk via a callback). Both share the same client, model config, and error handling patterns. The SDK handles retries and timeouts natively.

**How to say it in an interview:** "We have two LLM call paths in one module -- a synchronous path for cache population and a streaming path for real-time user delivery. Both share the same client and error classification. The streaming function accepts an `onText` callback and an `AbortSignal` for cooperative cancellation. This separation lets us test, monitor, and swap the LLM provider independently."

## 2. Why This Approach

### Decision 1: Two call paths, one module

`generateInterpretation()` uses `messages.create()` (non-streaming) for cache population -- the full response gets stored before any user sees it. `streamInterpretation()` uses `messages.stream()` for real-time delivery -- chunks flow to the user via SSE as they arrive. Both live in the same module because they share the client singleton, model config, and error classification logic. Splitting them into separate files would duplicate the client setup and error handling.

**How to say it:** "We have a synchronous path for background cache population and a streaming path for real-time delivery. They share the same client and error handling, but use different SDK methods."

### Decision 2: SDK-native retry instead of custom logic

The Anthropic SDK has built-in retry with exponential backoff for 5xx errors, rate limits (429), and network failures. We configure `maxRetries: 2` and `timeout: 15_000` and let the SDK handle the rest. Writing custom retry logic would add complexity without adding value -- the SDK authors understand their API's failure modes better than we do.

### Decision 3: Error classification by retryability

Errors are split into two categories: non-retryable (401 auth, 400 bad request) logged at `error` level, and retryable (everything else) logged at `warn` level. The distinction matters for monitoring -- `error` level means "something is broken and needs human attention" (like a rotated API key), while `warn` means "transient failure that resolved or will resolve."

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

Same error classification as `generateInterpretation`, with one addition: if `signal.aborted` is true when the catch block fires, we log at info level (not error) and rethrow. Client-initiated cancellation isn't an error -- it's normal behavior when users navigate away.

## 4. Complexity and Trade-offs

**Time complexity:** One API call per invocation. The SDK may make up to 3 total attempts (1 original + 2 retries) with exponential backoff.

**Trade-off -- timeout of 15 seconds:** This matches the architecture's NFR3 for total generation budget. The SDK's timeout covers the full request including retries. If the first attempt times out and the SDK retries, the second attempt gets a fresh 15-second window. For seed data generation (in `seed.ts`), we use a longer 30-second timeout since it runs once during setup, not on the hot path.

**Trade-off -- singleton client:** Creating the client at module load time means configuration is locked in at startup. If you wanted to change the API key at runtime, you'd need to restart the process. For this application, that's fine -- API keys don't change mid-session.

## 5. Patterns Worth Knowing

**Structured error hierarchy:** The `ExternalServiceError` class produces a 502 status code (Bad Gateway), which is semantically correct -- our server is healthy, but an upstream service failed. The centralized error handler in Express formats this into the standard `{ error: { code, message } }` response shape.

**Log level as severity signal:** Using `error` vs `warn` isn't just cosmetic. In production monitoring (Datadog, PagerDuty, etc.), you'd typically alert on `error` level but not `warn`. A burst of 401s means your API key is invalid and needs immediate attention. A burst of 429s means you're hitting rate limits and should probably back off, but it's not an emergency.

**Content block type guard:** Claude's response isn't always text. It can include tool_use blocks, thinking blocks, or other types. The `block?.type === 'text'` guard handles this gracefully. Most tutorials skip this check, which can cause runtime crashes on unexpected response shapes.

## 6. Interview Questions

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

This module demonstrates a clean separation of LLM interaction modes. The non-streaming path (`generateInterpretation`) handles cache population -- one call per data upload, full response stored for future requests. The streaming path (`streamInterpretation`) handles the real-time user experience -- when a cache miss occurs, the user sees text appearing as Claude generates it.

The architectural insight: most requests never trigger an LLM call. The cache-first strategy means 100 users viewing the same dataset don't make 100 API calls. Only the first user (or after a data upload invalidates the cache) triggers the streaming path. Everyone else gets instant JSON.

The abort signal propagation in `streamInterpretation` is worth highlighting. When a user navigates away, the cancellation flows: React unmount → `AbortController.abort()` → BFF request teardown → Express `req.close` → `signal.abort` event → `stream.abort()` → HTTP request to Claude cancelled. Four layers, one cancellation mechanism, zero leaked resources.
