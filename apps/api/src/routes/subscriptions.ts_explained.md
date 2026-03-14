# subscriptions.ts — Interview-Ready Documentation

## 1. Elevator Pitch

A single-endpoint Express router that returns the calling user's subscription tier ('free' or 'pro'). It exists so the Next.js dashboard RSC can fetch the tier at render time and pass it as a prop — the frontend never determines tier on its own, the server is always the source of truth.

**How to say it in an interview:** "This is a thin read endpoint that tells the frontend what subscription tier the authenticated user belongs to. The dashboard's server component calls it during render to decide whether to show full AI summaries or the truncated free preview."

## 2. Why This Approach

**Server-side tier resolution.** The frontend could store tier in a cookie or JWT claim, but that creates staleness problems — if a user upgrades mid-session, the cookie still says 'free'. A fresh API call on every dashboard render guarantees the tier is current. The call is cheap (single indexed query) and happens server-side in the RSC, so it doesn't add client latency.

**Separate from the subscription gate middleware.** The middleware annotates requests to Express API endpoints. This route serves the Next.js RSC, which needs to fetch tier independently — it's not going through Express middleware chain for the AI endpoint, it's building the page. Two different consumers, two different access patterns, but the same underlying query.

**How to say it in an interview:** "The RSC needs the tier to decide what UI to render — full summary card or free preview with upgrade CTA. It can't rely on middleware annotation because it's a separate server-side fetch, not an Express middleware chain."

## 3. Code Walkthrough

### Route definition (lines 8-12)

A single GET handler at `/tier`. Casts `req` to `AuthenticatedRequest` for `user.org_id`, calls the shared `getActiveTier` query, and returns `{ data: { tier } }` — following the project's standard success response format. Express 5 auto-forwards promise rejections, so no try/catch needed here. If the query throws, the global error handler catches it.

The router is mounted at `/subscriptions` in `protected.ts`, making the full path `/subscriptions/tier`.

## 4. Complexity and Trade-offs

**No caching.** Same tradeoff as the subscription gate — one DB query per dashboard load. The RSC calls this once per page render, and since it's server-side, there's no waterfall with client fetches.

**Express 5 implicit error handling.** No try/catch because Express 5 catches rejected promises automatically and forwards them to the error handler. If you're used to Express 4, this looks like a bug. It's not — it's one of the key reasons the project uses Express 5.

## 5. Patterns Worth Knowing

**BFF data fetching.** The Next.js RSC calls this endpoint through `apiServer()`, which hits the Express API on the internal network. The browser never sees this request — it's server-to-server within the BFF (Backend for Frontend) pattern. This is why there's no CORS setup: same-origin by architecture.

**How to say it in an interview:** "The RSC fetches tier from the API during server render. It's an internal server-to-server call — the browser never makes this request directly."

## 6. Interview Questions

**Q: Why not put the tier in the JWT?**
A: JWTs are issued at login and live until expiry. If a user upgrades to Pro, they'd need to re-authenticate to get a new JWT with the updated tier. A fresh API call on each dashboard render always reflects the current subscription state.
*Red flag:* "Just refresh the JWT on upgrade." That adds complexity to the auth flow for something a simple query solves.

**Q: Why is there no error handling in this route handler?**
A: Express 5 auto-catches promise rejections and forwards them to the global error handler. The `async` handler returns a rejected promise on query failure, which Express routes to `errorHandler` middleware. No try/catch needed.

## 7. Data Structures

**Response shape:** `{ data: { tier: SubscriptionTier } }` — matches the project's standard `{ data: T }` envelope.

**SubscriptionTier:** `'free' | 'pro'` from `shared/types`.

## 8. Impress the Interviewer

**The RSC data flow.** Explain the full path: browser requests dashboard → Next.js RSC runs server-side → RSC calls `apiServer('/subscriptions/tier')` → Express returns tier → RSC passes tier as prop to client component → AiSummaryCard decides whether to truncate. No client-side fetch, no loading spinner, no hydration mismatch — the tier is resolved before the HTML leaves the server.

**How to bring it up:** "The subscription tier flows from Express to the RSC as a server-side fetch, then down as a prop. The client never fetches tier directly — it's resolved at render time, so the free preview UI is immediate, not a flash-of-full-content-then-truncate."
