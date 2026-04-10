# aiSummary.ts — Interview-Ready Documentation

## 1. Elevator Pitch

The AI summary route handler implements a cache-first, quota-gated strategy for serving AI-generated business insights. On cache hit, it returns JSON instantly (cache hits don't count against quota). On cache miss, it checks the per-tier monthly quota (free: 3/month, pro: 100/month), then hands off to the SSE streaming handler for real-time generation. Rate limiting only kicks in on the streaming path. It fires `AI_SUMMARY_REQUESTED` at entry and only fires `AI_SUMMARY_COMPLETED` when `streamToSSE` returns `{ ok: true }` — with token usage metrics (inputTokens, outputTokens, computationTimeMs, tier) attached for cost monitoring.

**How to say it in an interview:** "I built the route handler with a cache-first pattern where cached summaries return JSON and fresh generation streams via SSE. A per-tier monthly quota gate runs after the cache check — so cache hits are free — using a COUNT query against existing analytics events rather than a separate quota table. The completion event carries token usage metrics so we can track AI spend per org and tier without a separate logging system."

## 2. Why This Approach

**Cache-first at the route level.** The cache check happens before any expensive work (rate limiting, streaming). A cache hit is a single DB query + JSON response — fast and cheap. Only on a miss do we spin up the streaming pipeline. This means 90%+ of requests (after first generation) are instant.

**Conditional rate limiting.** Rate limiting AI generation (5/min per user) makes sense — each miss costs an API call to Claude. But rate limiting cache hits would punish users for refreshing the dashboard. The middleware is wrapped in a Promise and called only on the miss path. This is an unusual pattern — most Express apps apply rate limiting as middleware before the handler.

**Promise-wrapped middleware.** Express middleware uses the `(req, res, next)` callback pattern. To use it conditionally inside an async handler, we wrap it in a `new Promise`. The `resolve/reject` in the `next` callback bridges the callback world to the async world. This is a known Express pattern for "I need to call middleware imperatively."

**`res.headersSent` guard.** If `rateLimitAi` sends a 429 response, calling `streamToSSE` would crash (can't set headers twice). The guard checks if the rate limiter already responded. This is defensive programming against the middleware's behavior.

## 3. Code Walkthrough

**Lines 15-54: The route handler.**

The flow is linear and readable:
1. Extract `orgId` and `userId` from the authenticated request
2. Validate `datasetId` — must be a positive integer
3. Fire `AI_SUMMARY_REQUESTED` analytics event (always, regardless of cache)
4. Check cache — if hit, return JSON with `fromCache: true` flag
5. **Quota gate** — count this month's `AI_SUMMARY_COMPLETED` events for this org, compare against `AI_MONTHLY_QUOTA[tier]`. Throw `QuotaExceededError` (402) if exhausted. Runs after cache check so cache hits are free.
6. If miss, wrap rate limiter in Promise, await it
7. Guard against 429 already sent
8. Stream the response via `streamToSSE`, capturing `const outcome = await streamToSSE(...)`
9. Fire `AI_SUMMARY_COMPLETED` only when `outcome.ok` is `true`, with `tier`, `computationTimeMs`, and token usage from `outcome.usage`

Notice there's no try-catch. Express 5 forwards rejected promises to the error handler automatically. The `ValidationError` throw on invalid datasetId gets caught by the centralized `errorHandler` middleware, which returns a proper `{ error: { code, message } }` JSON response.

**The rate limiter wrapping (lines 41-46).** This is the most interview-worthy part:

```typescript
await new Promise<void>((resolve, reject) => {
  rateLimitAi(req, res, (err?: unknown) => {
    if (err) reject(err);
    else resolve();
  });
});
```

`rateLimitAi` is standard Express middleware. By passing a synthetic `next` function that resolves/rejects a promise, we can `await` it inline. If the rate limit is exceeded, the middleware calls `res.status(429).json(...)` directly and calls `next()` without an error. That's why we need the `headersSent` guard afterward.

## 4. Complexity and Trade-offs

**Analytics at entry vs. completion.** `AI_SUMMARY_REQUESTED` fires before the cache check — it tracks intent, not outcome. `AI_SUMMARY_COMPLETED` fires after streaming — it tracks successful generation. The gap between the two (in analytics dashboards) reveals cache hit rate. If requested >> completed, cache is working.

**`trackEvent` is fire-and-forget.** It's not awaited. If the analytics insert fails, the user still gets their summary. Analytics are observability, not business logic — they shouldn't affect the user-facing response.

**Completion event gated on boolean return.** `streamToSSE` returns `Promise<boolean>` — `true` only when the full stream completes and gets cached. The route captures this as `const ok` and only fires `AI_SUMMARY_COMPLETED` when `ok` is `true`. Timeouts with partial delivery, client disconnects, and mid-stream errors all return `false`, so they don't inflate the completion count. This is more precise than the previous approach of always firing after `await streamToSSE()` — you get an accurate success rate in your analytics without any try-catch gymnastics.

## 5. Patterns Worth Knowing

**Cache-aside pattern.** The route checks the cache, and on miss, the stream handler populates it. This is "cache-aside" — the application manages cache reads/writes, not the cache itself. The alternative (write-through or read-through) would couple the cache to the streaming logic more tightly.

**Express 5 async handlers.** Unlike Express 4, version 5 catches rejected promises and forwards them to the error handler. No `express-async-errors` wrapper needed. You can `throw` errors directly, and they'll be caught.

## 6. Interview Questions

**Q: Why not put the rate limiter as route-level middleware?**
A: Cache hits shouldn't count against the rate limit. If the rate limiter runs before the handler, a user who refreshes 6 times in a minute gets blocked — even though 5 of those were instant cache hits costing nothing. Conditional application inside the handler is more fair.

**Q: What happens if `streamToSSE` throws after sending some SSE events?**
A: Once SSE headers are flushed (inside `streamToSSE`), Express can't send a regular error response. The stream handler catches errors internally and sends them as SSE `error` events. The route handler's throw-to-error-handler pattern only works before headers are sent.

**Q: Why fire `AI_SUMMARY_REQUESTED` before the cache check?**
A: It measures demand, not computation. Knowing how many users *want* summaries (regardless of cache) is different from knowing how many summaries were *generated*. The ratio of requested-to-completed is the cache hit rate.

## 7. Data Structures

**Cache response shape:** `{ content: string, transparencyMetadata: Record<string, unknown> }` — the cached summary text and metadata about how it was generated.

**Route response shape (cache hit):** `{ data: { content, metadata, fromCache: true } }` — follows the project's standard `{ data: T }` envelope.

## 8. Impress the Interviewer

**The conditional rate limiting pattern.** Most developers apply rate limiting as middleware. Explain why that's wrong here — cache hits are cheap, streaming is expensive, and you only want to limit the expensive path. This shows you think about rate limiting as a resource protection mechanism, not a blanket policy.

**The headersSent guard.** This is a subtle Express gotcha. Rate limiter middleware can send a 429 response *and* call `next()`. Without the guard, you'd get "Cannot set headers after they are sent." Knowing this edge case shows real Express experience.
