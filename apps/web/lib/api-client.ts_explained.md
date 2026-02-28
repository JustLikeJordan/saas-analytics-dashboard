# api-client.ts — Interview-Ready Documentation

> Source file: `apps/web/lib/api-client.ts` (82 lines)

---

## 1. 30-Second Elevator Pitch

This is the browser's HTTP client for talking to the backend. Instead of using `fetch()` directly everywhere, all Client Components go through this wrapper which handles two things automatically: (1) it always sends cookies (so auth tokens travel with every request), and (2) if the server says "your token expired" (401), it silently tries to refresh the token and retries the original request — the user never sees an interruption.

**How to say it in an interview:** "This is a typed API client with transparent token refresh. On a 401, it deduplicates concurrent refresh attempts using a shared promise, retries the failed request once with fresh credentials, and either succeeds silently or surfaces the error. It's the client-side half of the JWT refresh rotation flow."

---

## 2. Why This Approach?

### Decision 1: Silent refresh with one retry instead of preemptive refresh

**What's happening:** Some apps watch the token's expiration time and refresh *before* it expires. We take a simpler approach: just try the request, and if you get a 401, refresh then retry. It's like driving until the gas light comes on rather than refueling every 100 miles — simpler, fewer moving parts, and the failure mode (one extra round-trip) is cheap.

**How to say it in an interview:** "We use reactive refresh on 401 instead of proactive timer-based refresh. It's simpler, avoids clock-skew bugs between client and server, and the worst case is one additional round-trip — negligible latency for a much simpler implementation."

**Over alternative:** Timer-based preemptive refresh requires tracking token expiration, parsing the JWT on the client (which means exposing its structure), and handling clock drift between client and server.

### Decision 2: Shared promise for concurrent refresh deduplication

**What's happening:** Imagine three API calls all getting 401 at the same time. Without deduplication, all three would try to refresh the token simultaneously — and with refresh token rotation, only the first one would succeed (the others would present an already-consumed token). The module-level `refreshPromise` variable ensures only one refresh is in flight at a time. All concurrent callers share the same promise.

**How to say it in an interview:** "Concurrent 401s share a single refresh promise via a module-level variable. This prevents a thundering herd of refresh requests, which is critical with token rotation — only the first refresh succeeds, subsequent ones would trigger reuse detection."

**Over alternative:** Without deduplication, N concurrent 401s trigger N refresh calls. With single-use tokens, the second refresh would look like a replay attack and revoke ALL the user's sessions — a catastrophic false positive.

### Decision 3: BFF-routed requests via `/api` prefix

**What's happening:** The client sends requests to `/api/...` — which is the same origin as the Next.js frontend. Next.js route handlers at `app/api/...` forward these to the Express backend. This means the browser never talks to the Express server directly. It's like sending mail through your company's mailroom instead of directly to a partner's office — the mailroom handles forwarding and keeps things organized.

**How to say it in an interview:** "All API traffic routes through Next.js BFF route handlers at `/api/*`. This keeps the backend URL private, enables httpOnly cookie forwarding without CORS, and gives us a single origin — no cross-origin issues."

**Over alternative:** Direct browser-to-Express calls require CORS configuration, expose the API URL, and can't use httpOnly cookies for auth (since they're cross-origin).

---

## 3. Code Walkthrough

### Type definitions (lines 11-24)

`ApiResponse<T>` and `ApiError` define the API's response envelope. Every successful response wraps data in `{ data: T }`, every error follows `{ error: { code, message } }`. Having these types here means every caller gets type safety on the response without importing from the backend.

### The refresh deduplication singleton (lines 26-38)

`refreshPromise` is a module-level variable — it lives outside any function, so it's shared across all calls to `apiClient`. When null, no refresh is happening. When set, it holds the in-flight refresh promise that all concurrent callers can `await`.

`attemptRefresh()` does a simple POST to the refresh endpoint with `credentials: 'include'` (sends cookies). Returns `true`/`false` — no error thrown, just a boolean. The `catch` returns `false` because a failed refresh (network error, revoked token) just means "don't retry."

### The main `apiClient` function (lines 40-76)

Three phases:
1. **Initial request** — Sends the request with cookies and JSON headers.
2. **401 recovery** — If unauthorized, attempts a silent refresh. The `if (!refreshPromise)` check ensures only the first 401 triggers the actual refresh call. The `.finally(() => { refreshPromise = null })` resets the singleton after the refresh completes (success or failure). If refresh succeeded, retries the original request.
3. **Error handling** — If the response is still not OK, attempts to parse the JSON error body inside a try/catch. Not every non-2xx response comes from our Express API — a 502 Bad Gateway or gateway timeout from a reverse proxy returns HTML, not JSON. Without the try/catch, `response.json()` would throw a `SyntaxError` on HTML responses, crashing the error handler itself. The catch silently falls back to the generic status-code message. Either way, the outer `throw new Error(msg)` always fires.

The `credentials: 'include'` on every fetch is critical — without it, the browser won't send cookies on same-origin requests (it's the default behavior, but being explicit prevents subtle bugs if defaults change).

---

## 4. Complexity and Trade-offs

**At most one retry:** The client retries exactly once after a successful refresh. If the retry also returns 401, it throws — no infinite loops. This is a deliberate bounded-retry strategy.

**No queuing:** Failed requests during a refresh aren't queued and replayed. Only the request that triggered the 401 gets retried. Other concurrent requests that also got 401 will each individually wait for the shared refresh promise, then retry themselves. This is simpler than a queue but means N failed requests trigger N retries after the refresh.

**Module-level state:** `refreshPromise` is a module singleton — it persists across the component lifecycle. In a React app with hot module replacement during development, this state resets on HMR, which could cause a brief double-refresh. Not a real problem in production.

**How to say it in an interview:** "The main trade-off is simplicity over sophistication. We don't preemptively refresh, don't queue failed requests, and limit retries to one. The deduplication singleton is the one piece of coordination that prevents the thundering-herd problem with token rotation."

---

## 5. Patterns and Concepts Worth Knowing

### Module Singleton

A variable declared at the module level (outside any function or class) that acts as shared state for all code in that module. In ES modules, each file is its own scope, so `refreshPromise` is private to this file but shared across all callers of `apiClient`.

**Where it appears:** `let refreshPromise: Promise<boolean> | null = null` on line 26.

**Interview-ready line:** "The module singleton pattern gives us shared state without a class or context provider. All calls to `apiClient` share the same `refreshPromise`, which prevents concurrent refresh races."

### Transparent Retry (Interceptor Pattern)

Automatically handling certain failure modes (like expired tokens) without the caller needing to know. The caller just calls `apiClient('/users')` — if the token expired, the refresh-and-retry happens invisibly.

**Where it appears:** The 401 check and retry logic in `apiClient`.

**Interview-ready line:** "The transparent retry pattern means component code doesn't need to handle token expiration — `apiClient` intercepts the 401, refreshes silently, and retries. Components just see either the data or an error, never the auth machinery."

### Promise Deduplication

Multiple concurrent triggers of the same async operation share a single execution rather than each spawning their own. The "if null, create; otherwise reuse" pattern.

**Where it appears:** The `if (!refreshPromise) { refreshPromise = attemptRefresh()... }` block.

**Interview-ready line:** "Promise deduplication prevents the thundering herd problem — multiple concurrent 401s coalesce into a single refresh request. This matters with refresh token rotation, where concurrent refreshes would trigger reuse detection and revoke all sessions."

### Defensive Parsing

Attempting an operation that might fail (parsing an HTTP body as JSON) inside a try/catch, with a safe fallback. The goal isn't to suppress errors silently — it's to let the outer error handling still fire, just with less detail.

**Where it appears:** The try/catch around `response.json()` in the error block (lines 70-77).

**Interview-ready line:** "Defensive parsing lets the happy-path JSON extraction fail gracefully when a reverse proxy returns an HTML error page. The catch block doesn't swallow the error — it lets the status-code fallback message through while still throwing to the caller."

---

## 6. Potential Interview Questions

### Q1: "What happens if three API calls all get 401 at the same time?"

**Context if you need it:** This tests whether you understand the deduplication mechanism and why it matters with token rotation.

**Strong answer:** "All three hit the `if (!refreshPromise)` check. The first one creates the refresh promise. The other two find it already set, so they await the same promise. When the refresh completes, all three retry their original requests with the new cookie. Without this deduplication, three refresh calls would fire — and with single-use tokens, only the first would succeed. The other two would look like replay attacks."

**Red flag answer:** "Each one refreshes independently." — This would cause reuse detection to revoke all the user's tokens, logging them out.

### Q2: "Why `credentials: 'include'` instead of manually attaching an Authorization header?"

**Context if you need it:** The interviewer is testing whether you understand the BFF cookie-based auth pattern vs. the more common bearer token approach.

**Strong answer:** "We use httpOnly cookies for token storage, which the browser sends automatically with `credentials: 'include'`. The client-side JavaScript never has access to the token — it can't read it, can't leak it via XSS. An Authorization header would require storing the token in JavaScript-accessible memory, which is a larger attack surface."

**Red flag answer:** "It's just a convenience thing." — Missing the security rationale entirely.

### Q3: "How would you handle a scenario where the refresh also returns 401?"

**Context if you need it:** This probes error handling and whether the code has infinite retry protection.

**Strong answer:** "`attemptRefresh` catches all errors and returns `false`. If refresh fails, `refreshed` is `false`, so we skip the retry. The original 401 response falls through to the error handler and throws. There's no possibility of an infinite loop — exactly zero or one retries."

**Red flag answer:** "It keeps trying until it works." — Shows you haven't read the bounded-retry logic.

### Q4: "What would you change if this needed to support server-side rendering?"

**Context if you need it:** This tests awareness of client vs. server execution contexts.

**Strong answer:** "This client relies on browser-only APIs — `fetch` with cookies, module-level singleton state. For SSR, we have a separate `api-server.ts` that reads cookies from the incoming request and forwards them manually. The two clients are intentionally separate because their execution contexts are fundamentally different."

**Red flag answer:** "Just use the same client everywhere." — SSR doesn't have browser cookies, the singleton wouldn't work across requests, and `credentials: 'include'` has no meaning server-side.

---

## 7. Data Structures & Algorithms Used

### Promise as a Synchronization Primitive

**What it is:** A Promise in JavaScript represents a future value — something that will either resolve (succeed) or reject (fail). Here, it's used not just for its async value but as a *synchronization mechanism*. Multiple callers can `await` the same promise, and they all resume when it settles. It's like a group of people all waiting for the same traffic light — when it turns green, everyone goes.

**Where it appears:** `refreshPromise` is shared across concurrent `apiClient` calls.

**Why this one:** A Promise naturally deduplicates concurrent work — you create it once, and any number of consumers can `await` it. Alternatives like a mutex or semaphore would add complexity for the same result. The `.finally()` cleanup ensures the singleton resets regardless of success or failure.

**Complexity:** O(1) to check, set, or await the promise. The underlying refresh is one HTTP call regardless of how many callers are waiting.

**How to say it in an interview:** "We use a shared Promise as a coordination primitive — it naturally provides the 'create once, await many' semantics we need for deduplicating concurrent refresh attempts."

---

## 8. Impress the Interviewer

### The Thundering Herd Prevention

**What's happening:** Without deduplication, a page that makes 5 parallel API calls (dashboard loading multiple data sources) would trigger 5 simultaneous refresh attempts if the access token expired. With refresh token rotation, only the first refresh consumes the token — the other 4 would present an already-consumed token, triggering reuse detection and revoking ALL sessions.

**Why it matters:** This isn't a theoretical edge case — it happens on every page load after token expiry. The singleton promise is the difference between an invisible background refresh and logging the user out of every device.

**How to bring it up:** "The deduplication singleton was a deliberate design choice to prevent reuse detection false positives. A dashboard page that fires 5 parallel API calls would trigger 5 refresh attempts without it — and with single-use tokens, that would look like a replay attack and nuke all the user's sessions."

### Why Reactive Over Proactive Refresh

**What's happening:** Proactive refresh (watching a timer, refreshing before expiry) seems cleaner but introduces a whole class of bugs: clock skew between client and server, race conditions between the timer and in-flight requests, and the need to parse the JWT on the client to read the expiration.

**Why it matters:** The reactive approach (try, fail, refresh, retry) has exactly one failure mode — one extra round-trip when the token expires. That's ~100ms of latency every 15 minutes. The simplicity payoff is enormous.

**How to bring it up:** "I chose reactive refresh over proactive because it eliminates an entire class of timing bugs. The worst case is one extra round-trip every 15 minutes — negligible latency for a dramatically simpler implementation that doesn't need to parse JWTs on the client or worry about clock skew."
