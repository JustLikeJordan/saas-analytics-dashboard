# analytics.ts — Interview Companion Doc

## 1. Elevator Pitch

A single function that sends analytics events from the browser without blocking the UI or risking errors. It fires off a `fetch` call, deliberately ignores the response, and swallows any failures. Seventeen lines, zero drama.

## 2. Why This Approach

Analytics data is valuable but never worth degrading user experience. If your analytics call fails — network hiccup, server down, timeout — the user shouldn't notice. They definitely shouldn't see an error.

The function returns `void`, not `Promise<void>`. That's intentional. By not returning the promise, callers *can't* accidentally `await` it and introduce latency or error surface into their UI code. The `.catch(() => {})` at the end is the safety net — it prevents unhandled promise rejections from bubbling up to the console or crashing React error boundaries.

The endpoint is `/api/analytics`, not `http://localhost:3001/analytics`. This project uses a BFF (Backend-for-Frontend) proxy pattern: the browser talks to Next.js routes at the same origin, and Next.js forwards requests to Express on the backend. Because everything stays same-origin, you don't need CORS headers, preflight requests, or any cross-origin configuration. The cookie (`credentials: 'same-origin'`) just works — the browser attaches httpOnly auth cookies automatically since the request goes to the same domain that set them.

## 3. Code Walkthrough

The whole file is one exported function. Here's what matters:

- **`fetch('/api/analytics', ...)`** — Sends a POST to the Next.js API route (same origin). Next.js proxies this to the Express backend. The browser never talks to Express directly.
- **`credentials: 'same-origin'`** — Tells the browser to include cookies for this request. Since the request is same-origin, this forwards the JWT cookie so the backend can identify the user. Without this, the analytics event would be anonymous.
- **`.catch(() => {})`** — Empty catch. This isn't lazy error handling — it's the *correct* error handling. Analytics failures should be invisible. The empty arrow function prevents unhandled promise rejection warnings.
- **Return type `void`** — Not `Promise<void>`. The function kicks off the fetch and returns immediately. Callers treat it like a synchronous side-effect.

## 4. Complexity / Trade-offs

**Time complexity**: O(1) per call. It's a single HTTP request.

**Trade-offs you should be ready to discuss**:

- **No retry logic.** If the request fails, that event is lost. For product analytics, this is acceptable — you're measuring trends, not exact counts. A 1-2% loss rate from network blips doesn't change your dashboards.
- **No batching.** Each call triggers its own HTTP request. If you were tracking hundreds of events per page, you'd want to batch them (queue events, flush every N seconds). For this app's usage patterns, one-at-a-time is fine.
- **No response handling.** The function doesn't check status codes. A 500 from the server? Swallowed. A 401 because the session expired? Swallowed. This is by design — but it means you can't use this function for anything where delivery confirmation matters.

## 5. Patterns Worth Knowing

**Fire-and-forget.** You'll see this pattern anywhere reliability isn't worth the cost of waiting: logging, analytics, cache warming, notification sends. The key signature is: call an async operation, don't `await` it, catch errors silently. In interview terms, you're trading *guaranteed delivery* for *non-blocking execution*.

**BFF proxy.** The browser only talks to Next.js. Next.js talks to Express. This eliminates an entire category of problems — CORS configuration, cookie domain mismatches, exposing internal service URLs to the client. One origin, one set of cookies, no preflight OPTIONS requests.

**Defensive void return.** Returning `void` instead of `Promise<void>` is a form of API design. It makes the "don't await this" intention impossible to violate. You literally can't write `await trackClientEvent(...)` and have TypeScript treat it as meaningful.

## 6. Interview Questions

**Q: Why not `await` the fetch call?**
A: Analytics should never add latency to user interactions. If a button click tracks an event and then navigates, you don't want the navigation waiting on a network round-trip. Fire-and-forget lets the UI proceed instantly.

**Q: Isn't an empty `.catch()` bad practice?**
A: Usually, yes — you lose debugging information. Here it's the right call. Analytics failures aren't actionable at the client level. If you wanted observability, you could log to `console.debug` inside the catch, but even that's optional since the backend already monitors its own error rates.

**Q: Why `credentials: 'same-origin'` instead of `'include'`?**
A: `'include'` sends cookies on cross-origin requests too — which you'd need if the browser hit the Express API directly. Since this project uses a BFF proxy and the request stays same-origin, `'same-origin'` is the tighter, more correct option. It signals intent: "this request doesn't leave our domain."

**Q: What would you change if analytics delivery became business-critical?**
A: Three things. First, batch events and flush on an interval or on `visibilitychange` (user leaves the tab). Second, use `navigator.sendBeacon()` for the flush — it survives page unloads. Third, add a small IndexedDB queue so events persist across page loads if the flush fails.

## 7. Data Structures

Minimal here. The function takes an `eventName` string and an optional `metadata` record (string keys, unknown values). These get JSON-serialized into the request body as `{ eventName, metadata }`. The backend `analytics_events` table stores these with a timestamp, user ID (from the cookie), and org ID.

## 8. Impress the Interviewer

The thing worth pointing out isn't the code — it's the architecture that makes it so simple. In a typical SPA-to-API setup, this function would need CORS headers, a separate cookie domain configuration, possibly a preflight cache, and error handling for cross-origin failures. The BFF proxy pattern collapses all of that. Same-origin means the browser's default security model works *for* you instead of against you.

If the interviewer asks about scaling this, mention the **beacon API**. `navigator.sendBeacon()` is purpose-built for analytics: it's fire-and-forget at the browser level, survives page unloads, and doesn't block the unload event. The reason this file uses `fetch` instead is that `sendBeacon` doesn't support custom headers or credentials in all cases — but it's the natural evolution if you need unload-safe tracking.
