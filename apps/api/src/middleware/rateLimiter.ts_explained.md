# middleware/rateLimiter.ts — Interview-Ready Documentation

## Section 1: 30-Second Elevator Pitch

This file protects the API from abuse by limiting how many requests any single client can make per minute. It sets up three tiers: auth endpoints (10 requests/min per IP), AI endpoints (5 requests/min per user), and everything else (60 requests/min per IP). The limits live in Redis so they work across multiple server processes, but every limiter has an in-memory fallback so the system keeps running even if Redis goes down. When a client hits the limit, they get a 429 with a `Retry-After` header telling them when to try again.

**How to say it in an interview:** "This is a 3-tier rate limiting middleware using Redis as the shared counter store. Each tier targets a different abuse vector — brute-force login, AI cost abuse, and general DDoS. It uses the fail-open pattern with in-memory insurance so Redis outages degrade rate limiting to per-process instead of blocking all traffic."

---

## Section 2: Why This Approach?

### Decision 1: Redis-backed rate limiting with in-memory insurance

**What's happening:** Rate limiting needs shared state. If you have 4 server processes behind a load balancer and each one counts independently, a client could make 4x the allowed requests by hitting different processes. Redis gives you a single counter that all processes share. But what if Redis dies? The `insuranceLimiter` option in `rate-limiter-flexible` automatically falls back to per-process memory counters. Not as accurate as shared Redis counters, but way better than no limits at all.

**How to say it in an interview:** "Redis provides distributed rate limiting across all server instances. The memory fallback ensures we degrade gracefully during Redis outages — we lose cross-process coordination but maintain per-process limits. This is the fail-open pattern: infrastructure failure loosens the throttle rather than blocking legitimate traffic."

**Over alternative:** A pure in-memory approach (no Redis) would be simpler but gives inaccurate limits in multi-process deployments. A hard Redis dependency (no fallback) would reject all requests during Redis downtime, turning a cache outage into a full service outage.

### Decision 2: Three separate tiers instead of one global limit

**What's happening:** Auth endpoints need tight limits because brute-force attacks hammer login routes. AI endpoints need tight limits because each request costs real money (LLM API calls). Public endpoints like the dashboard can be more generous. Lumping them all under one limit would either be too loose for auth/AI or too strict for general browsing.

**How to say it in an interview:** "The three tiers map to three different threat models. Auth: credential stuffing at 10/min. AI: cost-based abuse at 5/min per user. Public: general DDoS at 60/min. A one-size-fits-all limit can't serve all three because the risk profiles and costs per request are completely different."

**Over alternative:** A single global limit is simpler to reason about but can't express "AI calls are 12x more expensive than page loads." Per-route limits would give maximum control but are tedious to maintain and easy to misconfigure.

### Decision 3: Keying AI limits by user ID, not IP

**What's happening:** The auth and public tiers key by IP address — if you don't know who the client is, IP is the best identifier you've got. But the AI tier runs after `authMiddleware`, which means you know the user. Keying by user ID is more accurate: it prevents a single user from burning through AI quota even if they switch IPs (VPN, mobile network handoff). It also avoids punishing multiple legitimate users behind the same corporate NAT.

**How to say it in an interview:** "AI rate limits key by authenticated user ID because IP-based limiting has two problems at this layer: shared IPs (corporate NAT) unfairly throttle multiple users, and VPNs let a single user evade IP-based limits. Since the AI middleware runs after auth, we have the user identity and should use it."

**Over alternative:** IP-keying would be simpler (no type assertion, no auth dependency) but wrong for the use case. A user behind a corporate proxy would burn through the limit for their entire office, while an attacker with rotating IPs would bypass it entirely.

### Decision 4: Fail-open on unexpected errors

**What's happening:** Look at the `.catch` blocks — there's an `instanceof RateLimiterRes` check. When a client exceeds the limit, the library rejects the promise with a `RateLimiterRes` object (which contains the retry timing). But the `.catch` can also fire for unexpected errors (Redis connection failures, serialization bugs). For those, the code logs a warning and calls `next()` — letting the request through. Blocking legitimate traffic because of a bug in rate limiting would be worse than temporarily having no rate limits.

**How to say it in an interview:** "The catch block distinguishes between 'client hit the limit' (RateLimiterRes) and 'something broke' (any other error). Rate limit violations get a 429. Infrastructure errors fail open — the request passes through. Blocking legitimate users due to a Redis hiccup is a worse outcome than temporarily relaxed rate limits."

**Over alternative:** Fail-closed (reject on error) is appropriate for high-security systems like banking APIs. For a SaaS analytics dashboard, availability matters more than perfect rate limiting — especially since the AI tier already has cost controls at the service layer.

---

## Section 3: Code Walkthrough

### Block 1: Imports (lines 1-6)

Express types, the `rate-limiter-flexible` library (provides both Redis and memory implementations), the shared Redis client, the Pino logger, and the rate limit constants from the shared package. The `AuthenticatedRequest` type comes from the auth middleware — it adds a `.user` property to the standard Express `Request`.

The constants import is worth noting: limits aren't hardcoded here. They're defined once in `packages/shared/src/constants/index.ts` and shared between frontend (for displaying limit info) and backend (for enforcement). Changing a limit means changing one number in one place.

### Block 2: Memory fallback limiters (lines 8-22)

Three `RateLimiterMemory` instances, one per tier. Same limits as the Redis versions — the only difference is these counters live in the Node.js process memory instead of Redis. If you have 4 API processes, each one tracks its own counts independently. That means a client could theoretically make 4x the intended limit across processes, but that's an acceptable trade-off vs. total failure.

The `duration` field wants seconds, but `RATE_LIMITS.auth.windowMs` is in milliseconds (the `Ms` suffix is the hint), so we divide by 1000.

### Block 3: Redis-backed limiters (lines 24-46)

Three `RateLimiterRedis` instances. Each gets:
- `storeClient: redis` — the shared ioredis connection (configured with `enableOfflineQueue: false` so it fails fast instead of queueing commands when disconnected)
- `keyPrefix` — separates the three tiers in Redis. Auth counts go under `rl_auth:`, AI under `rl_ai:`, public under `rl_public:`. Without prefixes, an IP hitting auth and public endpoints would share one counter.
- `points` and `duration` — same as memory, pulled from shared constants
- `insuranceLimiter` — the automatic fallback. If the `.consume()` call to Redis throws (not a rate limit rejection, but an actual error), `rate-limiter-flexible` retries against the memory limiter instead.

### Block 4: sendRateLimited helper (lines 48-54)

Formats the 429 response. Two things worth noticing:

1. `Retry-After` header — tells the client (and well-behaved bots/crawlers) exactly how many seconds to wait before retrying. `Math.ceil` rounds up because you'd rather tell the client to wait 3 seconds than 2.7 (partial seconds aren't valid in `Retry-After`).

2. The response body follows the project's standard error format: `{ error: { code: string, message: string } }`. The `RATE_LIMITED` code lets the frontend distinguish rate limiting from other 429 sources (if any) and show a specific UI message.

### Block 5: rateLimitAuth (lines 56-70)

Express middleware for auth routes (login, register, token refresh). Keys by `req.ip` — at this point the user isn't authenticated, so IP is all we have. The `?? 'unknown'` fallback handles edge cases where Express can't determine the IP (unlikely in production behind a reverse proxy, but possible in test environments).

The `.catch` block has the fail-open pattern: if `rlRes` is a `RateLimiterRes`, the client hit the limit and gets a 429. If it's anything else (Redis error, network timeout), log and let the request through.

### Block 6: rateLimitAi (lines 72-91)

The most interesting middleware. Two things make it different:

First, the type assertion `req as AuthenticatedRequest`. This middleware is designed to run after `authMiddleware` in the route chain, so `req.user` should exist. But the function signature uses the base `Request` type for Express middleware compatibility. The assertion bridges that gap.

Second, the key selection: `authedReq.user?.sub ?? req.ip ?? 'unknown'`. It prefers user ID, falls back to IP if the user somehow isn't set. The warning log on line 77 catches the fallback case — if you're seeing that warning in production, something is wrong with your middleware ordering (this middleware got called before auth). It's a canary, not just a fallback.

### Block 7: rateLimitPublic (lines 93-106)

Same structure as `rateLimitAuth`, just wired to the public limiter (60 req/min). Applied to general API routes like the dashboard data endpoints.

### Block 8: Test exports (line 109)

Exporting the limiter instances lets tests call `.consume()` and `.delete()` directly to set up rate limit scenarios without making HTTP requests. Practical, low-ceremony testability.

---

## Section 4: Complexity and Trade-offs

**Fail-open vs. fail-closed:** The biggest design decision in this file. Fail-open means Redis outages relax rate limiting. Fail-closed would mean Redis outages block all requests. For most SaaS products, an attacker getting slightly more requests through is less damaging than a full outage for all users. But if you're protecting a financial transaction endpoint, you might choose fail-closed.

**Per-process memory fallback accuracy:** With N processes and a 10 req/min limit, a determined attacker could make up to 10N requests per minute during Redis downtime. In practice, this matters less than it sounds — DDoS-level attacks need other defenses anyway (WAF, CDN-level blocking), and the memory fallback handles casual abuse just fine.

**IP-based limits and shared IPs:** Auth and public tiers key by IP. Users behind corporate NATs or shared WiFi share an IP and therefore share a rate limit bucket. A busy office could burn through 60 public requests/min collectively. This is a known trade-off — IP-level granularity is the best you can do without authentication.

**The type assertion in rateLimitAi:** The `req as AuthenticatedRequest` cast is a small lie — TypeScript can't verify at compile time that `authMiddleware` ran first. It's the middleware equivalent of "trust me, I ordered these correctly." The runtime guard (`if (!authedReq.user?.sub)`) catches ordering mistakes at runtime, so it's not truly unsafe, just not provable statically.

**How to say it in an interview:** "The central trade-off is availability vs. protection accuracy. Fail-open with memory fallback means we never block legitimate users due to infrastructure problems, but we accept temporarily weaker rate limiting. For the AI tier specifically, there's a second cost control layer at the service level, so rate limiting isn't the only defense against cost overruns."

---

## Section 5: Patterns and Concepts Worth Knowing

### Fail-Open vs. Fail-Closed

Two philosophies for handling infrastructure failures. Fail-open: when the protection system breaks, allow requests through (prioritize availability). Fail-closed: when it breaks, block everything (prioritize security). Most web services choose fail-open for rate limiting because a brief period of higher traffic is less damaging than a total outage.

**Where it appears:** Every `.catch` block — if the error isn't a `RateLimiterRes`, the request passes through.

**Interview-ready line:** "Rate limiting is fail-open in this system. A Redis outage degrades rate limiting to per-process memory counters rather than blocking all traffic. The AI service layer has its own cost controls as a secondary defense."

### Sliding Window Rate Limiting

The `rate-limiter-flexible` library uses a sliding window algorithm internally. Unlike fixed windows (where the counter resets at the top of every minute), a sliding window tracks the timestamp of each request and counts how many fall within the last N seconds. This prevents the "boundary burst" problem where a client sends 10 requests at 0:59 and 10 more at 1:01, getting 20 through in 2 seconds despite a 10/min limit.

**Where it appears:** The `RateLimiterRedis` instances. The library handles the algorithm — the configuration just says "points and duration."

**Interview-ready line:** "The rate limiters use a sliding window, which prevents burst attacks at window boundaries. A fixed-window approach would allow double the limit if requests are timed to straddle the reset point."

### Insurance/Fallback Pattern

A strategy where a primary mechanism has a secondary backup that activates automatically on failure. The key design constraint: the fallback should be strictly worse (less accurate, less coordinated) but never harmful. Memory-based counting is less accurate than Redis (per-process instead of global) but never blocks legitimate requests.

**Where it appears:** `insuranceLimiter` option on each `RateLimiterRedis`.

**Interview-ready line:** "Each Redis limiter has an in-memory insurance limiter. If Redis fails, the library automatically falls back to process-local counting. Accuracy degrades — a client could hit N times the limit across N processes — but availability is preserved."

### Separation of Middleware by Security Tier

Rather than one rate limiter with complex internal routing, the code exports three independent middleware functions. The route file decides which limiter to attach to which route. This makes the middleware chain readable — when you see `rateLimitAi` on a route, you know exactly which tier applies without reading conditional logic.

**Where it appears:** Three exports: `rateLimitAuth`, `rateLimitAi`, `rateLimitPublic`.

**Interview-ready line:** "Rate limiting is split into three exported middleware functions instead of one configurable function. This makes the route definitions self-documenting — you can see the tier directly in the middleware chain — and avoids branching logic inside a single middleware."

---

## Section 6: Potential Interview Questions

### Q1: "Why use Redis for rate limiting instead of just in-memory counters?"

**Context if you need it:** This tests your understanding of distributed systems. The interviewer wants to hear about multi-process/multi-server deployments.

**Strong answer:** "In-memory counters are process-local. If you have 4 API server instances behind a load balancer, each one counts independently, so a client gets 4x the intended limit. Redis provides a shared counter that all instances read and write atomically. It's the same reason you'd use Redis for session storage — you need state that survives load-balancer routing."

**Red flag answer:** "Redis is faster." — Redis is fast, but that's not the reason. The reason is shared state across processes. A single-process app wouldn't need Redis for this at all.

### Q2: "What happens to rate limiting if Redis goes down?"

**Context if you need it:** This is the fail-open question. The interviewer wants to know if you've thought about failure modes.

**Strong answer:** "Each Redis limiter has an in-memory insurance limiter configured with the same limits. When a Redis operation throws an error (not a rate limit rejection, but an actual connection failure), the library retries against the memory fallback. Rate limiting becomes per-process instead of global, which means limits are less strict by a factor of N (number of processes), but no requests are blocked due to the outage. The Redis client is also configured with `enableOfflineQueue: false`, which forces it to fail fast instead of buffering commands during disconnection."

**Red flag answer:** "All requests would be blocked." — That would be fail-closed, and it's not what this code does. Or "I don't know" — fail-open is a standard pattern worth knowing.

### Q3: "Why does the AI rate limiter key by user ID instead of IP?"

**Context if you need it:** Tests whether you understand the trade-offs between IP and user identity for rate limiting.

**Strong answer:** "Two reasons. First, multiple users can share an IP — think of a corporate office behind a NAT. IP-keying would unfairly throttle the whole office when one person hits the limit. Second, a single user can easily switch IPs with a VPN or mobile network handoff, bypassing IP-based limits. Since the AI middleware runs after authentication, we have the user's identity and should use it. IP-based fallback is still there for edge cases where the user identity is missing."

**Red flag answer:** "User ID is just more accurate." — Technically true but doesn't explain *why* it's more accurate or what specific problems IP-keying causes.

### Q4: "What's the purpose of the Retry-After header?"

**Context if you need it:** This comes up in API design discussions. The interviewer wants to know you think about client experience, not just server-side enforcement.

**Strong answer:** "It tells the client exactly how many seconds to wait before retrying. Well-behaved API clients (and crawlers) respect this header and back off automatically instead of hammering the server in a retry loop. It's defined in HTTP RFC 6585 for 429 responses. The code uses `Math.ceil` to round up to whole seconds since the header value must be an integer."

**Red flag answer:** "It's just a hint for the client." — Technically correct but dismissive. The header is part of the HTTP spec for 429 responses and is expected by well-behaved clients.

### Q5: "How would you test this middleware?"

**Context if you need it:** Tests your approach to testing infrastructure code that depends on external services.

**Strong answer:** "Three levels. Unit tests: the limiter instances are exported, so I can call `.consume()` directly against the memory fallback to test the counting logic without Redis. Integration tests: spin up a Redis container (or use the test Docker Compose) and verify the middleware returns 429 after exceeding the limit, with the correct Retry-After header and error body. Edge case tests: mock the Redis client to throw errors and verify the fail-open behavior — the request should pass through and the warning should be logged."

**Red flag answer:** "Just send a bunch of requests and check if you get a 429." — This tests the happy path but misses the more interesting failure scenarios (Redis down, missing user on AI tier, IP fallback).

---

## Section 7: Data Structures & Algorithms Used

### Sliding Window Counter (Redis-backed)

**What it is:** A rate limiting algorithm that counts events within a sliding time window. Instead of a fixed bucket that resets every 60 seconds, the window slides forward with time. Under the hood, `rate-limiter-flexible` uses Redis sorted sets — each request adds an entry with the current timestamp as the score, and a count query filters entries older than the window. Expired entries are cleaned up atomically.

**Where it appears:** Every `RateLimiterRedis` instance uses this internally. You don't configure the algorithm — it's the library's default.

**Why this one:** Fixed-window counters have a boundary burst problem. If the window resets at :00 and a client sends 10 requests at :59, then 10 more at :01, they get 20 requests in 2 seconds despite a 10/min limit. Sliding windows eliminate this by looking at the previous 60 seconds from the current moment, not the current calendar minute.

**Complexity:** O(1) amortized per `.consume()` call — Redis sorted set operations (ZADD + ZRANGEBYSCORE + ZREMRANGEBYSCORE) are O(log N) where N is the number of entries in the window, but N is bounded by the rate limit itself (max 60), making it effectively constant.

**How to say it in an interview:** "The library uses sliding window counters backed by Redis sorted sets. Each request adds a timestamped entry, and the count is the number of entries within the last 60 seconds. This prevents boundary bursts that fixed-window counters allow."

### Hash Map (In-Memory Fallback)

**What it is:** `RateLimiterMemory` uses a JavaScript Map internally to store counters per key. Each entry holds the remaining points and the expiry timestamp. When the insurance limiter activates, it's operating on this local Map instead of Redis.

**Where it appears:** The three `*Fallback` instances (lines 9-22).

**Why this one:** In-memory Maps are the simplest counter store. No network calls, no serialization, no failure modes. The trade-off is that the data is process-local and lost on restart. For a fallback that only activates during Redis outages, that's fine.

**Complexity:** O(1) for consume and check operations. Memory usage is bounded by the number of unique keys (IPs or user IDs) times the entry size. Expired entries are lazily cleaned.

**How to say it in an interview:** "The memory fallback uses a process-local hash map. It sacrifices cross-process accuracy for zero-dependency reliability — there's no scenario where it can fail, which is exactly what you want in a fallback."

---

## Section 8: Impress the Interviewer

### enableOfflineQueue: false Is the Hidden Key to Fail-Open

**What's happening:** The Redis client (in `lib/redis.ts`) is configured with `enableOfflineQueue: false`. By default, ioredis buffers commands when the connection is lost and replays them when it reconnects. For most use cases that's great — your data eventually gets written. But for rate limiting, it's a disaster. A buffered `.consume()` call would block the request handler indefinitely, waiting for a Redis reconnection that might take 30 seconds. With offline queue disabled, a Redis disconnect immediately throws an error, which triggers the insurance limiter, which responds in microseconds.

**Why it matters:** Fail-open rate limiting requires fast failure detection. If the Redis client silently queues commands, the fail-open path never activates and requests hang instead. This config option is the difference between "graceful degradation" and "mysterious timeouts during Redis maintenance."

**How to bring it up:** "The Redis client is configured with enableOfflineQueue disabled, which is what makes the fail-open pattern actually work. Without it, ioredis silently buffers commands during disconnection, and the rate limiter would hang instead of falling back to memory. It's one of those config options that's easy to overlook but makes or breaks the resilience story."

### The instanceof Check Is Doing Double Duty

**What's happening:** In each `.catch` block, `rlRes instanceof RateLimiterRes` distinguishes two completely different rejection reasons: (1) the client exceeded the limit (the library rejects with a RateLimiterRes containing the retry timing), or (2) something broke internally (Redis error, network timeout, serialization bug). These two cases need opposite handling — one should block the request, the other should let it through. Without the instanceof check, you'd either block all requests on Redis failure (treating errors as rate limits) or let rate-limited clients through (treating rate limits as errors).

**Why it matters:** Most rate limiting tutorials show a simple `if (error) return 429`. That approach conflates infrastructure failure with legitimate rate limiting, and in production the distinction matters a lot. This code handles both cases correctly with a clean pattern.

**How to bring it up:** "The catch block uses instanceof to distinguish between rate limit rejections and infrastructure errors. The library rejects with a RateLimiterRes when the limit is exceeded, but with a plain Error when Redis fails. Getting this distinction wrong means either blocking all users during a Redis outage or letting abusers through during normal operation. It's a two-line check, but it's the core of the fail-open contract."

### Constants Come from the Shared Package, Not Hardcoded

**What's happening:** The limits (10, 5, 60 requests per minute) are defined in `packages/shared/src/constants/index.ts` and imported here. This means the frontend could also import these same constants to display "you have X requests remaining" or show the right error message when a 429 comes back. It also means changing a limit is a one-line change in one file, not a grep-and-replace across the codebase.

**Why it matters:** In a monorepo, shared constants are one of the simplest ways to keep frontend and backend in sync. It's not rocket science, but it signals that you think about system-level consistency, not just the file you're editing.

**How to bring it up:** "Rate limit values are imported from the shared constants package rather than hardcoded. The same constants are available to the frontend for displaying limit info in the UI. It's a monorepo benefit — one source of truth for values that both sides of the stack need to agree on."
