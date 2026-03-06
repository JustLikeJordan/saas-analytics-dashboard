# claudeClient.ts -- Interview-Ready Documentation

## 1. 30-Second Elevator Pitch

This module wraps the Anthropic SDK to call Claude's API for generating business data interpretations. It does exactly one thing: take an assembled prompt, send it to Claude, and return the text response. No streaming, no caching, no retry logic beyond what the SDK provides natively. The simplicity is intentional -- this is the cache population path, not the user-facing delivery path.

**How to say it in an interview:** "We separated the LLM call into its own module with a single responsibility -- send a prompt, get text back. The SDK handles retries and timeouts natively. Streaming delivery to the user is a different layer entirely. This separation lets us test, monitor, and swap the LLM provider independently."

## 2. Why This Approach

### Decision 1: Non-streaming for cache population

This module uses `messages.create()` (synchronous), not `messages.stream()`. That's because it's called during cache population -- the full response gets stored in `ai_summaries` before any user sees it. Streaming is Story 3.3's concern, where the response flows to the user via SSE. Having two separate paths (populate cache vs. stream to user) keeps each path simple.

**How to say it:** "We cache the full response first, then stream from cache. This means the LLM call happens once per dataset change, not once per page view."

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

## 4. Complexity and Trade-offs

**Time complexity:** One API call per invocation. The SDK may make up to 3 total attempts (1 original + 2 retries) with exponential backoff.

**Trade-off -- timeout of 15 seconds:** This matches the architecture's NFR3 for total generation budget. The SDK's timeout covers the full request including retries. If the first attempt times out and the SDK retries, the second attempt gets a fresh 15-second window. For seed data generation (in `seed.ts`), we use a longer 30-second timeout since it runs once during setup, not on the hot path.

**Trade-off -- singleton client:** Creating the client at module load time means configuration is locked in at startup. If you wanted to change the API key at runtime, you'd need to restart the process. For this application, that's fine -- API keys don't change mid-session.

## 5. Patterns Worth Knowing

**Structured error hierarchy:** The `ExternalServiceError` class produces a 502 status code (Bad Gateway), which is semantically correct -- our server is healthy, but an upstream service failed. The centralized error handler in Express formats this into the standard `{ error: { code, message } }` response shape.

**Log level as severity signal:** Using `error` vs `warn` isn't just cosmetic. In production monitoring (Datadog, PagerDuty, etc.), you'd typically alert on `error` level but not `warn`. A burst of 401s means your API key is invalid and needs immediate attention. A burst of 429s means you're hitting rate limits and should probably back off, but it's not an emergency.

**Content block type guard:** Claude's response isn't always text. It can include tool_use blocks, thinking blocks, or other types. The `block?.type === 'text'` guard handles this gracefully. Most tutorials skip this check, which can cause runtime crashes on unexpected response shapes.

## 6. Interview Questions

**Q: Why not stream the response directly to the user?**
A: We separate cache population from delivery. The LLM call happens once per data upload, and the result is cached in `ai_summaries`. User requests are served from cache (fast) or trigger a fresh generation (slower but still cached for next time). Streaming delivery from cache to the user via SSE is a different layer (Story 3.3). This architecture means 100 users viewing the same dataset don't trigger 100 LLM calls.

**Q: How do you handle API key rotation?**
A: The client is constructed at startup from validated env vars. Key rotation means updating the env var and restarting the service. In a container environment (Docker/K8s), this happens naturally during deployments. For zero-downtime rotation, you'd need a key provider that fetches from a secrets manager -- but that's overengineering for this stage.

**Q: What happens when the LLM returns an unexpected response format?**
A: The type guard `block?.type === 'text'` returns empty string for non-text blocks. The orchestrator stores whatever we get. An empty summary is better than a crash -- the user sees "no analysis available" rather than a 500 error.

## 7. Data Structures

Input: `string` (the assembled prompt from `assembly.ts`)

Output: `string` (the LLM's text response, untruncated)

The module doesn't know about business concepts like insights or summaries -- it's a generic "send prompt, get text" wrapper. The orchestrator gives it meaning by storing the result in `ai_summaries`.

## 8. Impress the Interviewer

The key architectural insight here is that the LLM call is decoupled from the user request cycle. Most AI-powered features call the LLM when the user clicks a button and stream back the response. We took a different approach: the LLM call happens during cache population (either on data upload or seed generation), and user requests are served from cache. This means:

1. **Consistent latency** -- users get cached content instantly instead of waiting 5-15 seconds for LLM generation
2. **Cost control** -- one LLM call per data change, not per page view
3. **Graceful degradation** -- if Claude is down, existing summaries still work

The trade-off is that summaries aren't "live" -- they reflect the data at the time of generation, not real-time. But since our data only changes on CSV upload, this is perfectly fine. The cache invalidation strategy (mark stale on upload) aligns with the data lifecycle.
