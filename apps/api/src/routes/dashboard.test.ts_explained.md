# dashboard.test.ts — Interview-Ready Documentation

## Elevator Pitch

Route-level tests for `GET /dashboard/charts` — the public endpoint that serves chart data to both anonymous visitors (demo data) and authenticated users (their org's data). The tests spin up a real Express app, mock the service and query dependencies, and hit the endpoint with `fetch` to verify the full request lifecycle: cookie parsing, JWT verification, seed org fallback, analytics tracking, and response shape.

This endpoint is unusual because it manually reads the JWT from cookies instead of using `authMiddleware`. It's public by design — anonymous users see demo data, authenticated users see their own. The tests verify both code paths and the graceful degradation when a token is expired or missing.

## Why This Approach

**Real Express app, mocked dependencies.** The test creates a real Express instance via `createTestApp` (which wires up `correlationId`, `json`, `cookieParser`, and `errorHandler`). The route handler runs for real — cookie parsing, async/await flow, response serialization all execute as they would in production. Only the leaf dependencies (token verification, database queries, analytics) are mocked.

**How to say it in an interview:** "We test at the HTTP boundary — the test sends a real HTTP request and gets a real HTTP response. Everything between the request and the mocked service layer runs as production code. This catches issues that unit testing the handler function directly would miss: middleware ordering, cookie parsing, content-type headers, error handler integration."

**Mocking `rateLimiter` as passthrough.** In production, `rateLimitPublic` sits in front of the dashboard route. The rate limiter depends on Redis, which isn't available in the test environment. We replace all three rate limiter exports with `(req, res, next) => next()` — passthrough middleware that calls `next()` immediately. This isolates the test from Redis without changing the route's middleware chain.

**No supertest dependency.** The existing codebase uses Node's `fetch` (available in Node 18+) instead of supertest. The pattern is: start the server on port `0` (OS-assigned), capture the port, build the URL, use `fetch`. Same ergonomics, one fewer dependency.

## Code Walkthrough

**Mock declarations** — Seven mock functions declared at the top, before any `vi.mock` calls. `mockVerifyAccessToken`, `mockGetChartData`, `mockGetSeedOrgId`, `mockFindOrgById`, and `mockTrackEvent` map to the five external calls the route handler makes.

**`vi.mock('../db/queries/index.js')`** — The route imports `chartsQueries` and `orgsQueries` from the barrel file. The mock provides these as objects with the specific functions the route uses. This matches the production import pattern: `chartsQueries.getChartData(orgId)`.

**`chartFixture`** — A minimal but realistic chart data response used across all tests. Defined once, set as the default mock return value in `beforeEach`. Each test that needs different data can override with `mockOnce`.

**"returns seed data for anonymous request"** — No `Cookie` header. The route should call `getSeedOrgId`, use that ID for chart data, and respond with `isDemo: true` and `orgName: 'Sunrise Cafe'` (hardcoded in the route for the seed org fallback path).

**"returns user org data for valid JWT"** — Sends `Cookie: access_token=valid-jwt`. The mock `verifyAccessToken` returns a payload with `org_id: 10`. The route then calls `findOrgById(10)` to get the org name. Asserts `isDemo: false` and verifies `getSeedOrgId` was never called.

**"falls back to seed data on invalid JWT"** — Sends a cookie, but `verifyAccessToken` rejects. The route's catch block should fall through to the seed org path — same behavior as no cookie at all. Verifies the error is swallowed (200 response, not 401).

**"fires trackEvent for authenticated users only"** — Two requests in sequence. First without auth (verifies `trackEvent` not called), then with auth (verifies it was called with the right org ID, user ID, and event name). This confirms the conditional tracking logic.

**"returns correct response shape"** — Verifies the full `{ data: { revenueTrend, expenseBreakdown, orgName, isDemo } }` structure using `toEqual` for an exact match. Catches accidental field additions or omissions.

## Complexity & Trade-offs

Each test makes one HTTP request (O(1)). The `createTestApp` helper starts a real HTTP server, which adds ~50ms overhead in `beforeAll`. That's a one-time cost — individual tests run in single-digit milliseconds.

The "fires trackEvent" test makes two sequential requests and checks mock state between them. This is slightly more coupled than separate tests, but it directly tests the conditional behavior in a single test case, which reads better than two tests that each assert half of the behavior.

## Patterns Worth Knowing

- **`createTestApp` helper** — Wraps the Express app creation, middleware setup, and server boot in a reusable function. Each test file provides a setup callback to mount its specific routes. The helper handles `correlationId`, `json()`, `cookieParser()`, and `errorHandler` — the four middleware that every route needs.
- **Port 0 for dynamic allocation** — `app.listen(0)` tells the OS to pick an available port. Eliminates port conflicts when multiple test files run in parallel.
- **`beforeEach` with default mocks** — Setting `mockGetChartData.mockResolvedValue(chartFixture)` in `beforeEach` means every test gets working defaults. Tests only override the mocks they care about. Reduces boilerplate and makes each test focused on its specific scenario.
- **Cookie-based auth in tests** — Instead of `Authorization: Bearer ...`, this route reads from `req.cookies.access_token`. The test sends `headers: { Cookie: 'access_token=valid-jwt' }` and the mock `verifyAccessToken` doesn't care what the token string is — it returns whatever you told it to.

## Interview Questions

**Q: Why does this route read JWT cookies manually instead of using authMiddleware?**
A: The dashboard is a public page. `authMiddleware` returns 401 for missing tokens — that would block anonymous visitors from seeing demo data. The dashboard route reads the cookie itself, tries to verify it, and falls back to seed data on failure. It's "authenticate if you can, degrade gracefully if you can't."

**Q: Why mock the barrel file (`db/queries/index.js`) instead of individual query modules?**
A: The route imports `chartsQueries` and `orgsQueries` from the barrel. If we mocked `../db/queries/charts.js` directly, the barrel would still try to import the real module (and its real dependencies, like the database connection). Mocking at the barrel level cuts off the entire query layer in one mock declaration.

**Q: The route calls `trackEvent` without awaiting it. How do you test that?**
A: `trackEvent` is fire-and-forget — it returns `void`, not a Promise. The mock captures the call synchronously (the function is called, the mock records the arguments). We assert on `mockTrackEvent` after the response arrives. Since `fetch` waits for the response, and the route calls `trackEvent` before `res.json()`, the mock is guaranteed to have been called by the time we assert.

**Q: What happens if `getSeedOrgId` throws?**
A: The route doesn't catch that error — it bubbles to Express 5's automatic promise rejection handling, then to `errorHandler`, which returns a 500. We don't test this case explicitly because it's a system-level failure (seed data not loaded), not a user-facing scenario.

## Data Structures

**JWT payload shape (from mock):**
```typescript
{
  sub: string,       // user ID as string (JWT convention)
  org_id: number,    // which org the user belongs to
  role: string,      // 'owner' | 'member'
  isAdmin: boolean,  // platform admin flag
}
```

**Response shape:**
```typescript
{
  data: {
    revenueTrend: { month: string, revenue: number }[],
    expenseBreakdown: { category: string, total: number }[],
    orgName: string,
    isDemo: boolean,
  }
}
```

## Impress the Interviewer

The fallback pattern in this route — "try auth, catch and degrade" — is a common production pattern for public pages with optional personalization. Think of an e-commerce homepage: anonymous users see bestsellers, logged-in users see recommendations. The key insight is that the catch block doesn't log an error or return 401. An expired token on a public page is expected behavior, not an error. The test for "falls back to seed data on invalid JWT" explicitly verifies this: the response is 200 with demo data, not an error. If you were reviewing this route in production and saw it return 401 for expired tokens on the dashboard, that would be a bug — you'd be forcing users to re-authenticate just to see the landing page.
