# dashboard.ts — Interview-Ready Documentation

> Source file: `apps/api/src/routes/dashboard.ts` (93 lines)

---

## 1. 30-Second Elevator Pitch

This is the API route that serves chart data for the dashboard. It has one endpoint — `GET /dashboard/charts` — and it's intentionally public. Unauthenticated visitors see seed data ("Sunrise Cafe"), authenticated users see their own org's data. Filter parameters from the query string are validated through the shared Zod schema before touching the database. The route also fires analytics events for authenticated users, tracking both page views and filter usage.

**How to say it in an interview:** "This route serves chart data as a public endpoint — no auth required. Unauthenticated users get seed data for onboarding, authenticated users get their org's data. Query string filters are Zod-validated at the route boundary, and analytics events track both page views and filter interactions."

---

## 2. Why This Approach?

### Decision 1: Public endpoint with optional authentication

**What's happening:** Most API endpoints check auth and return 401 if the token is missing. This one doesn't. If there's no token (or the token is invalid), it falls through to serving seed org data. Think of it like a store with a demo display — anyone can browse the sample, but if you log in, you see your own stuff.

**How to say it in an interview:** "The dashboard endpoint is intentionally public. Missing or invalid tokens fall through to seed data instead of returning 401. This lets unauthenticated visitors experience the product without signing up — a deliberate onboarding decision."

**Over alternative:** Requiring auth and showing an empty state to unauthenticated visitors. That's a cold landing page with nothing to see — higher bounce rate, lower conversion.

### Decision 2: Zod validation at the route boundary via shared schema

**What's happening:** Query parameters arrive as raw strings. Instead of validating them inline with `if (typeof query.from === 'string' && isValidDate(query.from))`, the route maps them into a raw object and runs `chartFiltersSchema.safeParse()`. If validation fails, filters are silently cleared — the user gets unfiltered data instead of an error. The schema lives in the `shared/schemas` package, which means the frontend and backend agree on what valid filters look like.

**How to say it in an interview:** "I validate filters through the shared Zod schema at the route boundary. Invalid filters degrade to unfiltered data rather than returning errors — the user sees their full dataset instead of a 400 page. The schema is shared between frontend and backend, so validation rules stay in sync."

**Over alternative:** Inline validation with `if/else` chains. Repetitive, easy to get wrong, and the rules wouldn't be shared with the frontend. Another alternative is returning 400 for invalid filters — but malformed query params from browser navigation shouldn't break the page.

### Decision 3: Silent degradation on invalid filters

**What's happening:** `parseFilterParams` returns empty values if `safeParse` fails. The route handler calls `hasFilters()` to check if any filters survived validation. If not, it passes `undefined` to the chart query — which returns unfiltered data. No error response, no redirect. The user just sees all their data.

**How to say it in an interview:** "Invalid filters degrade silently to unfiltered results. I'd rather show all data than show an error for a malformed query string. Filter validation is strict enough to prevent injection but lenient enough to not break bookmarked URLs."

**Over alternative:** Returning 400 on invalid filters. This breaks bookmarked/shared URLs if the filter format ever changes. Browser history, shared links, and search engine bots shouldn't get error pages.

### Decision 4: Analytics events are fire-and-forget

**What's happening:** `trackEvent` is called without `await`. The analytics call runs in the background — the response doesn't wait for it. If analytics fails, the chart data still arrives on time. Analytics is important for understanding user behavior, but it should never slow down the primary user experience.

**How to say it in an interview:** "Analytics events are fire-and-forget — not awaited. They're important for product insights but never on the critical path. A failed analytics call shouldn't delay chart rendering."

**Over alternative:** Awaiting `trackEvent`. Adds latency to every dashboard load for zero user benefit. Errors in the analytics service would cascade to the dashboard endpoint.

---

## 3. Code Walkthrough

### Imports (lines 1-8)

Express router and types, shared constants and schemas, then internal services and queries. The barrel import from `db/queries/index.js` (as `chartsQueries` and `orgsQueries`) follows the project's import boundary rule — routes never import directly from `db/index.ts`.

### parseFilterParams (lines 12-29)

Transforms raw Express query params into a validated filter object. Three steps:

1. **Extract** — Maps `query.from`, `query.to`, and `query.categories` to a raw object. Categories arrive as a comma-separated string and get split into an array, capped at 20 items (defense against oversized filter lists).

2. **Validate** — `chartFiltersSchema.safeParse(raw)` runs Zod validation. The schema coerces strings to Dates for `dateFrom`/`dateTo` and validates array constraints on categories.

3. **Degrade** — If validation fails, returns all undefined. No error thrown, no 400 response. The caller gets "no filters," which means unfiltered data.

### hasFilters (lines 31-33)

A guard function that checks if any filter survived validation. Used to decide whether to pass filters to the query and whether to fire a `CHART_FILTERED` analytics event. Without this, every unfiltered page view would fire a filter event with empty values.

### GET /dashboard/charts handler (lines 36-90)

The main route. Three phases:

**Phase 1 — Identity resolution (lines 37-61).** Checks for an access token cookie. If present, verifies it and extracts the org ID. If verification fails (expired, malformed), falls through to seed org. If no token, goes straight to seed org. The `authedUser` variable is set only for valid tokens — used later for analytics.

**Phase 2 — Data fetch (lines 63-64).** Calls `parseFilterParams`, then `getChartData` with the org ID and filters (if any). The `hasFilters(filters) ? filters : undefined` avoids passing an empty filter object to the query layer.

**Phase 3 — Analytics + response (lines 66-89).** Fires `DASHBOARD_VIEWED` for all authenticated page loads, plus `CHART_FILTERED` if filters were active. Then returns the standard API envelope: `{ data: { ...chartData, orgName, isDemo } }`.

The Pino log on line 81 follows the project's structured logging convention — object first, message second.

---

## 4. Complexity and Trade-offs

**Token verification on every request.** The JWT is verified on every chart load, even though the result is the same until the user uploads new data or logs out. A session cache (Redis or in-memory) could skip re-verification for the TTL window. For an MVP with low traffic, the simplicity of per-request verification is fine.

**Seed org lookup on every unauthenticated request.** `getSeedOrgId()` runs a database query to find the seed org. This could be cached at startup since the seed org ID never changes. Low priority — it's a single-row index lookup.

**No rate limiting on this endpoint.** Since it's public, it's theoretically vulnerable to scraping. The project's rate limiting middleware handles this at a higher level (3-tier: auth/AI/public), but this route doesn't have route-specific limits.

**Hardcoded "Sunrise Cafe" fallback name.** If the seed org is renamed in the database, this string is stale. It should come from the seed org record. Minor — but worth noting as tech debt.

**How to say it in an interview:** "The main trade-off is per-request token verification with no session cache. It's simple and correct, but each dashboard load pays the JWT verification cost. For an MVP, that's ~1ms and acceptable. The other gap is the hardcoded seed org name — it should come from the database."

---

## 5. Patterns and Concepts Worth Knowing

### Graceful Degradation

Instead of failing hard on invalid input, the system falls back to a working state. Invalid auth → seed data. Invalid filters → unfiltered data. The user always sees something useful. This is the opposite of "fail fast" — at the API boundary where users interact, graceful degradation is better UX.

**Interview-ready:** "The route degrades gracefully on both auth and filter failures. Invalid tokens serve seed data instead of 401s. Invalid filters serve unfiltered data instead of 400s. The user always sees a functional dashboard."

### Shared Schema Validation (Zod at the Boundary)

Zod schemas live in the `shared` package and are used by both the frontend (to construct valid requests) and the backend (to validate incoming params). This eliminates the class of bugs where the frontend sends a format the backend doesn't expect.

**Interview-ready:** "The filter schema lives in the shared package, used by both sides. The frontend constructs query params using the same schema the backend validates against. Validation rules stay in sync by definition."

### Fire-and-Forget Side Effects

Analytics events are dispatched without awaiting. The Promise floats — if it resolves, great; if it rejects, the error is caught by the global error handler (or lost silently). This keeps analytics off the critical path. The pattern works for any side effect that's important but not essential to the response.

**Interview-ready:** "Analytics events are fire-and-forget. I don't await them because they're not on the critical path — a failed analytics call shouldn't delay chart data. The trade-off is potential data loss if the analytics service is down, but that's acceptable for non-critical telemetry."

### BFF Proxy Pattern (Architectural Context)

This Express route never faces the browser directly. The browser hits Next.js at `/api/dashboard/charts`, and the BFF proxy forwards to Express at `:3001/dashboard/charts`. This is why there's no CORS configuration — it's same-origin from the browser's perspective.

**Interview-ready:** "The Express API sits behind a Next.js BFF proxy. The browser never calls Express directly, which eliminates CORS concerns. Auth cookies flow through the proxy transparently."

---

## 6. Potential Interview Questions

### Q1: "Why is the dashboard endpoint public?"

**Context if you need it:** Tests whether you understand the product decision behind the technical choice.

**Strong answer:** "Unauthenticated visitors see seed data — a populated dashboard with sample business data. It's an onboarding tool. The alternative is showing an empty page or a login wall, which means the user has no idea what the product does before signing up. Seed data lets them experience the value proposition immediately."

**Red flag:** "It should require authentication." — Misses the product reasoning entirely.

### Q2: "What happens if Zod validation fails on the filter params?"

**Context if you need it:** Probes your understanding of the degradation strategy.

**Strong answer:** "The route serves unfiltered data. parseFilterParams returns all undefined, hasFilters returns false, and getChartData runs without filter constraints. The user sees their full dataset. No error response — invalid query params from bookmarks, shared URLs, or browser history shouldn't break the page."

**Red flag:** "It returns a 400 error." — It doesn't, and there's a reason it doesn't.

### Q3: "Why fire analytics without awaiting?"

**Context if you need it:** Tests whether you understand the trade-off between data completeness and response latency.

**Strong answer:** "Analytics is valuable but not critical. Awaiting it adds latency to every dashboard load for zero user benefit. If the analytics service is slow or down, the dashboard should still respond quickly. The trade-off is potential event loss during outages, which is acceptable for non-critical telemetry."

**Red flag:** "To make the code simpler." — Missing the performance and reliability reasoning.

### Q4: "How would you handle the case where the seed org doesn't exist?"

**Context if you need it:** Extension question about edge cases.

**Strong answer:** "Currently getSeedOrgId would throw if no seed org exists, and Express 5's automatic promise forwarding would send a 500. I'd add a guard: if no seed org, return an empty chart response with a generic org name. The seed org should always exist in production — it's created by the migration/seed script — but defensive handling prevents a cryptic error."

**Red flag:** "That can't happen." — It can, especially in dev environments or after a bad migration.

### Q5: "Why not use middleware for the auth check instead of inline logic?"

**Context if you need it:** Tests your understanding of why this route handles auth differently.

**Strong answer:** "The standard auth middleware returns 401 on missing/invalid tokens. This route needs to fall through to seed data instead. It's the one endpoint where invalid auth is a valid path, not an error. Forcing it through the standard middleware would require a special 'allow-through' flag, which is more complex than just handling auth inline."

**Red flag:** "I forgot to add the middleware." — It's intentionally omitted, not forgotten.

---

## 7. Data Structures & Algorithms Used

### URLSearchParams Equivalent (Query String Parsing)

**What it is:** Express parses the query string into `req.query`, a plain object where each key maps to a string value. `parseFilterParams` reads specific keys and transforms them — splitting the comma-separated `categories` string into an array, passing date strings to Zod for coercion.

**Where it appears:** `parseFilterParams` (lines 12-29).

**Why this one:** Express handles the parsing automatically. The route's job is mapping raw strings to typed values. Zod's `.coerce.date()` handles string-to-Date conversion, which eliminates manual `new Date()` calls and validates format in one step.

**Complexity:** O(k) where k is the number of categories (split + slice). O(1) for date parsing.

**How to say it in an interview:** "Express parses the query string; Zod coerces and validates the values. Categories are split from a comma-separated string to an array, capped at 20 items for defense against oversized inputs."

### Try-Catch as Control Flow (Auth Resolution)

**What it is:** The `try/catch` around `verifyAccessToken` isn't error handling in the traditional sense — it's control flow. A failed verification is an expected case (expired tokens are normal), and the catch block routes to the seed org path. This is distinct from catching unexpected errors, which would propagate to the global error handler.

**Where it appears:** Lines 44-57.

**Why this one:** JWT verification either succeeds or throws — there's no "invalid but non-throwing" return value from jose. The catch block is the canonical way to handle expected verification failures.

**Complexity:** O(1) — JWT verification is a single HMAC or RSA operation.

**How to say it in an interview:** "The try-catch isn't error handling — it's control flow for expected token failures. Expired tokens are normal, not exceptional. The catch routes to the seed org path instead of returning a 401."

---

## 8. Impress the Interviewer

### The Public Dashboard Is an Onboarding Funnel

**What's happening:** Most SaaS dashboards are behind a login wall. This one is intentionally public. A new visitor lands on the dashboard, sees populated charts with seed data ("Sunrise Cafe"), understands what the product does, then signs up and uploads their own data. The seed data is the product demo — no sales call, no demo video, just the real product with sample data.

**Why it matters:** This is a product-engineering decision, not just a technical one. Talking about it shows you think about conversion funnels, not just API routes. The technical implementation (optional auth with fallback) exists to serve a product goal (reduce friction to first value).

**How to bring it up:** "The dashboard is public by design — it doubles as the product demo. Unauthenticated visitors see seed data, which communicates the product's value without requiring signup. The optional auth pattern makes this possible without duplicating the endpoint."

### Shared Schema Validation Prevents Drift

**What's happening:** The `chartFiltersSchema` lives in `packages/shared/schemas`. The frontend uses it to construct valid filter parameters. The backend uses it to validate incoming parameters. They're literally the same code. If someone adds a new filter type, both sides update automatically.

**Why it matters:** In many projects, frontend and backend validate independently. When one side updates and the other doesn't, you get bugs that only appear in production. Shared schemas make this category of bug impossible.

**How to bring it up:** "The filter schema is shared between frontend and backend — same Zod schema, same package. If someone adds a new filter field, both sides pick it up automatically. No drift, no version mismatch bugs."

### Silent Degradation Is a UX Decision

**What's happening:** Invalid filters don't produce errors — they're silently dropped. The user sees unfiltered data. This matters because query params can become invalid through no fault of the user: bookmarked URLs after a filter format change, shared URLs with typos, browser history from before a schema update.

**Why it matters:** Returning 400 for invalid filters would break bookmarks and shared links. For a dashboard that small business owners check weekly, breaking their saved URL because you changed a filter format is a support ticket waiting to happen.

**How to bring it up:** "I chose silent degradation over strict validation for filters. Invalid params serve unfiltered data instead of errors. Bookmarked URLs and shared links shouldn't break when filter formats evolve — the user sees their data regardless."
