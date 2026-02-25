# api-server.ts -- Interview-Ready Documentation

> Source file: `apps/web/lib/api-server.ts` (75 lines)

---

## 1. 30-Second Elevator Pitch

This is the server-side HTTP client for calling the Express API from Next.js Server Components. It runs on the server, inside Docker, and talks to the Express backend over the internal network -- the browser never sees this traffic. The big thing it does beyond a raw `fetch` is structured error handling: when the API returns an error, `ApiServerError` preserves the machine-readable code, HTTP status, and details from the response body. The old version threw `new Error('API error: 401 Unauthorized')` and all that structured information was gone. Now callers can catch a typed error and decide what to do based on `err.code` or `err.statusCode`.

**How to say it in an interview:** "This is a typed server-side API client for a BFF architecture. It makes internal service-to-service calls within Docker networking, forwards cookies from the incoming request for auth, and wraps fetch errors in a structured `ApiServerError` that preserves the API's error envelope -- code, status, and details. It's the server-side counterpart to the browser's `apiClient`, which handles different concerns like silent token refresh."

---

## 2. Why This Approach?

### Decision 1: Separate server client from browser client

**What's happening:** There are two files that talk to the same Express API -- `api-client.ts` for Client Components (runs in the browser) and this file for Server Components (runs on the Node.js server). They exist separately because the two environments have fundamentally different needs.

The browser client sends requests to `/api/*` on the same origin (BFF proxy), uses `credentials: 'include'` so the browser attaches cookies automatically, and handles silent token refresh on 401. None of that applies server-side. Server Components don't have a browser cookie jar -- they receive cookies in the incoming HTTP request and have to manually forward them. They don't need refresh logic because they're not long-lived sessions. And they can call the Express API directly on the internal Docker network (`http://api:3001`) instead of going through the Next.js proxy.

Think of it like two employees at the same company. One works in the office (server) and walks down the hall to talk to the API team directly. The other works remotely (browser) and has to go through the company VPN (the BFF proxy) and re-authenticate periodically. Same destination, different paths.

**How to say it in an interview:** "We split the API clients because their execution contexts are fundamentally different. The server client makes direct internal calls with forwarded cookies and no refresh logic. The browser client routes through the BFF proxy with automatic cookie handling and transparent 401 retry. Sharing one client would mean runtime checks everywhere for 'am I in a browser?' -- that's fragile."

**Over alternative:** A single isomorphic client (like Axios with adapters) sounds elegant but ends up full of `typeof window !== 'undefined'` checks and conditional logic for cookies, refresh, and URL resolution. Two simple clients are easier to reason about than one complex one.

### Decision 2: Custom `ApiServerError` class instead of plain `Error`

**What's happening:** The Express API returns errors in a structured JSON format: `{ error: { code: "VALIDATION_ERROR", message: "...", details: {...} } }`. If we just throw `new Error(response.statusText)`, the caller only gets a string. All that useful structure is gone.

`ApiServerError` preserves everything. A Server Component rendering a page can catch the error and check `err.code === 'NOT_FOUND'` to show a 404 page, or `err.statusCode === 403` to redirect to an access-denied screen. Before this change, the code threw `new Error('API error: 401 Unauthorized')` and you'd have to parse that string to figure out what happened -- brittle and ugly.

**How to say it in an interview:** "We introduced `ApiServerError` to preserve the API's structured error envelope across the service boundary. Server Components can pattern-match on error codes and status to render appropriate UI -- a 404 page, a login redirect, inline validation feedback. With a plain `Error`, all that context collapsed into a string."

### Decision 3: Defensive JSON parsing on error responses

**What's happening:** When the API returns a non-OK response, the code tries to parse the body as JSON. But it wraps that in a try/catch because not every error response is JSON. If the Express server times out, Nginx might return an HTML error page. If the container is down, you might get a connection reset with no body at all. The catch block just moves on, and the `ApiServerError` gets fallback values (`'UNKNOWN_ERROR'` for code, `'API error: ${status}'` for message).

It's like opening a package that might or might not contain a letter. You try to read it, but if it's empty or full of packing peanuts instead, you don't crash -- you just note "unknown contents" and move on.

**How to say it in an interview:** "Error responses aren't guaranteed to be JSON -- proxy timeouts, container crashes, and load balancer errors can produce HTML or empty bodies. We defensively attempt JSON parsing and fall back to generic values. This prevents the error handler from itself throwing an unhandled parse error, which would mask the original problem."

### Decision 4: `cache: 'no-store'` on every request

**What's happening:** Next.js aggressively caches fetch requests in Server Components by default -- it's one of the framework's optimization features. But our API returns user-specific, session-specific data. Caching it would mean User A might see User B's data if the same Server Component renders for both. Setting `cache: 'no-store'` tells Next.js "never cache this fetch, always go to the network."

**How to say it in an interview:** "We disable Next.js fetch caching because our API returns user-specific data gated by auth cookies. Default caching could serve stale or cross-user data. The API-level cache (`ai_summaries` table) handles caching at the appropriate layer."

---

## 3. Code Walkthrough

### Type definitions (lines 12-23)

```ts
interface ApiResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

These mirror the Express API's response contract. `ApiResponse<T>` is the success shape -- every successful response wraps its payload in `{ data: T }`. `ApiErrorBody` is the error shape. These are duplicated from the browser client (`api-client.ts`), which also defines them locally. They're simple enough that sharing them through the `packages/shared` package isn't worth the coupling.

### The `ApiServerError` class (lines 25-35)

```ts
export class ApiServerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiServerError';
  }
}
```

This is a custom error type -- extending JavaScript's built-in `Error` gives you a stack trace and compatibility with `try/catch`. The `public readonly` on constructor parameters is a TypeScript shorthand that declares and assigns instance properties in one line. After construction, the error carries:

- `code` -- machine-readable string like `'VALIDATION_ERROR'` or `'NOT_FOUND'`
- `message` -- human-readable text (inherited from `Error`)
- `statusCode` -- HTTP status (401, 404, 500, etc.)
- `details` -- optional structured data (e.g., which fields failed validation)

All properties are `readonly` because errors are facts about what happened -- they shouldn't change after creation.

### The `apiServer` function (lines 37-75)

Three phases:

**Phase 1: Make the request (lines 41-56)**

```ts
let response: Response;
try {
  response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.cookies ? { Cookie: options.cookies } : {}),
      ...options?.headers,
    },
    cache: 'no-store',
  });
} catch {
  throw new ApiServerError('NETWORK_ERROR', 'API request failed', 0);
}
```

The `try/catch` around `fetch` handles network-level failures -- the Express container is down, DNS resolution fails, connection refused. These aren't HTTP errors (there's no response at all), so they get a special `'NETWORK_ERROR'` code and status `0`.

The `cookies` option is a custom extension on top of `RequestInit`. Server Components get cookies from the incoming request (via Next.js's `cookies()` function) and pass them here as a string. The header spread order matters: `Content-Type` is the default, `Cookie` is conditionally added, and `options?.headers` comes last so callers can override anything.

**Phase 2: Handle error responses (lines 58-72)**

```ts
if (!response.ok) {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // non-JSON response (timeouts, proxy errors, etc.)
  }

  throw new ApiServerError(
    body?.error?.code ?? 'UNKNOWN_ERROR',
    body?.error?.message ?? `API error: ${response.status}`,
    response.status,
    body?.error?.details,
  );
}
```

This is the defensive parsing discussed in the decisions above. The nullish coalescing chain (`body?.error?.code ?? 'UNKNOWN_ERROR'`) safely navigates through any combination of missing pieces. If `body` is null (JSON parse failed), or `body.error` is missing (unexpected response shape), or `body.error.code` is undefined -- all of those collapse to `'UNKNOWN_ERROR'`. No crash, always a valid `ApiServerError`.

**Phase 3: Return success (line 74)**

```ts
return response.json() as Promise<ApiResponse<T>>;
```

If the response is OK, parse and return the JSON typed as `ApiResponse<T>`. The generic `T` flows from the call site: `apiServer<User[]>('/users')` returns `Promise<ApiResponse<User[]>>`.

---

## 4. Complexity and Trade-offs

### Runtime Complexity

All O(1) for the code itself. One `fetch` call, one conditional JSON parse, a few property accesses. The network call dominates everything -- the internal Docker network hop to Express is typically under 5ms on the same machine, but it's still orders of magnitude slower than any JavaScript the function runs.

### Trade-offs

| Choice | Benefit | Cost |
|--------|---------|------|
| Separate client from `api-client.ts` | Each client is simple and focused | Duplicated type definitions, two files to maintain |
| Custom `ApiServerError` class | Structured error info survives the service boundary | Callers need to import and catch a specific type |
| Defensive JSON parsing on errors | Handles proxy/timeout/crash error bodies gracefully | A few extra lines; error path is slightly slower |
| `cache: 'no-store'` hardcoded | Prevents cross-user data leakage | Loses Next.js caching benefits; every call hits the network |
| No retry logic (unlike browser client) | Simpler code, SSR requests are one-shot | A transient failure on a page render surfaces immediately |

### Why no retry logic?

The browser client retries on 401 because it can silently refresh the token and the user never notices. Server Components don't have that option -- they're rendering a page in response to a single HTTP request. If the API call fails, the right move is to show an error page or redirect, not to stall the page render with retries. The retry/refresh concern lives in the browser where it belongs.

**How to say it in an interview:** "The server client is deliberately simple -- no retries, no refresh. Server-rendered pages are one-shot: if the API is down, show an error page. The browser client handles retries because it has a long-lived session where transparent recovery makes sense. Putting retry logic in both clients would mean duplicating the refresh flow in an environment where it doesn't work the same way."

---

## 5. Patterns and Concepts Worth Knowing

### BFF (Backend for Frontend) Internal Call

The Next.js server acts as a middle layer between the browser and the Express API. When the browser requests a page, the Server Component calls the Express API internally (server-to-server), assembles the HTML, and sends it to the browser. The browser never knows the Express API exists.

**Where it appears:** `API_INTERNAL_URL` is `http://api:3001` -- a Docker internal hostname. The browser can't resolve `api:3001`. Only the Next.js container can.

**Interview-ready line:** "This is the internal leg of the BFF pattern. Server Components call the Express API via Docker networking, which keeps the API URL private and eliminates CORS entirely. The browser only talks to Next.js."

### Typed Error Propagation

Instead of losing error context when crossing a service boundary (Express -> Next.js), we parse the API's structured error body and re-throw it as a typed local error. The information survives the hop.

**Where it appears:** The `ApiServerError` constructor populates from `body?.error?.code`, `body?.error?.message`, etc.

**Interview-ready line:** "We preserve the API's error envelope across the service boundary by parsing the JSON error body into a typed `ApiServerError`. This lets Server Components make decisions based on error code and status rather than parsing error message strings."

### Generic Type Parameter Flow

The function signature `apiServer<T>(path): Promise<ApiResponse<T>>` lets the caller specify what type of data they expect. TypeScript carries `T` through the promise chain so the call site gets type-safe access to the response data without any casts.

**Where it appears:** `apiServer<User[]>('/users')` returns `Promise<ApiResponse<User[]>>`, so `.data` is `User[]`.

**Interview-ready line:** "The generic flows from the call site through the fetch to the return type. Callers get full type safety on the response without runtime overhead -- it's erased at compile time."

### Defensive Optional Chaining with Nullish Coalescing

The pattern `body?.error?.code ?? 'UNKNOWN_ERROR'` handles multiple failure modes in a single expression. If `body` is null (JSON parse failed) or `body.error` is undefined (unexpected shape) or `code` is missing, you get a sensible fallback. No nested `if` statements, no try/catch.

**Where it appears:** The `ApiServerError` construction on lines 66-71.

**Interview-ready line:** "Optional chaining with nullish coalescing gives us a clean fallback chain for error responses that might be partial, malformed, or non-JSON. It replaces what would otherwise be a deeply nested conditional."

---

## 6. Potential Interview Questions

### Q1: "Why does this file exist separately from the browser API client?"

**Context if you need it:** The interviewer wants to know if you understand the difference between server-side and client-side execution in a Next.js app.

**Strong answer:** "Server Components and Client Components run in fundamentally different environments. The server client calls the Express API directly on the Docker network -- it can't use browser cookies or the BFF proxy. The browser client routes through `/api/*` and handles silent token refresh, which doesn't make sense server-side where there's no persistent session. Two simple clients are easier to reason about than one client with environment checks everywhere."

**Red flag answer:** "We just haven't gotten around to combining them." -- This suggests you don't understand the architectural reasons for the split.

### Q2: "What happens if the Express container is completely down?"

**Context if you need it:** This probes your understanding of the two distinct error paths -- network failure vs. HTTP error.

**Strong answer:** "The `fetch` call itself throws -- not an HTTP error, a network error. No `Response` object at all. The catch block on line 54 catches this and throws an `ApiServerError` with code `'NETWORK_ERROR'` and status `0`. The calling Server Component can check for that code to render an appropriate error state or fallback UI. Without this catch, the unhandled fetch rejection would crash the page render with a cryptic Node.js error."

**Red flag answer:** "It returns a 500." -- No, there's no response. The distinction between "the server responded with an error" and "the server didn't respond at all" is an important one.

### Q3: "Why `cache: 'no-store'`? What would happen without it?"

**Context if you need it:** This tests your knowledge of Next.js fetch caching behavior.

**Strong answer:** "Next.js caches fetch results in Server Components by default as part of its static optimization. Our API returns user-specific data -- org dashboards, subscription status, AI summaries. Without `no-store`, the first user's data could be cached and served to subsequent users rendering the same route. This is a data isolation bug in a multi-tenant app. We disable the cache here and let the API layer handle caching at the right granularity -- the `ai_summaries` table, for example."

**Red flag answer:** "We always want fresh data." -- True but shallow. The real issue is cross-user data leakage in a multi-tenant context.

### Q4: "Why is the `cookies` option added as a custom property instead of just using headers?"

**Context if you need it:** Checks if you understand the ergonomics of the API and how cookies flow in Server Components.

**Strong answer:** "It's a convenience for callers. Server Components get cookies from Next.js's `cookies()` API as a string. Rather than making every caller manually construct a `Cookie` header, we accept `cookies` as a first-class option and the client handles the header construction. The spread order ensures it can be overridden if needed, and the conditional spread means the `Cookie` header isn't sent at all for unauthenticated endpoints."

**Red flag answer:** "So you don't have to think about headers." -- Partially correct but misses the conditional spread detail and the Server Component cookie flow.

### Q5: "How does this compare to the browser client's error handling?"

**Context if you need it:** Tests whether you understand both clients and can compare design choices.

**Strong answer:** "The browser client throws a plain `Error` with the message string -- `new Error(errorBody.error?.message ?? 'API error: ...')`. The server client throws a structured `ApiServerError` with code, status, and details preserved. The difference is about what the caller can do. Browser-side, errors typically bubble up to an error boundary or toast notification -- the message string is enough. Server-side, the rendering layer needs to decide between a 404 page, a redirect, or an error page -- that requires the status code and error code, not just a message."

**Red flag answer:** "They're basically the same." -- They have the same fetch/parse/throw shape, but the error types carry very different amounts of information, and that's deliberate.

---

## 7. Data Structures & Algorithms Used

### Custom Error Class (extending native Error)

**What it is:** JavaScript's `Error` class gives you a `message` and a `stack` (the call stack at the time the error was created). By extending it, `ApiServerError` adds domain-specific properties -- `code`, `statusCode`, `details` -- while keeping compatibility with `try/catch`, `instanceof`, and stack traces.

**Where it appears:** The `ApiServerError` class on lines 25-35.

**Why this one:** A plain object like `{ code: 'NOT_FOUND', status: 404 }` would carry the same data, but it wouldn't have a stack trace, wouldn't work with `instanceof`, and wouldn't be caught by generic `catch(err)` blocks that check `err instanceof Error`. Extending `Error` gives you the ecosystem integration for free.

**Complexity:** O(1) to create. The only hidden work is stack trace capture, which the JavaScript engine optimizes.

**How to say it in an interview:** "We extend `Error` to get stack traces and `instanceof` support while adding domain-specific fields. It's the standard pattern for typed errors in TypeScript -- you get both the debugging infrastructure of native errors and the structured data your application logic needs."

### Nullish Coalescing Chain (data extraction pattern)

**What it is:** The expression `body?.error?.code ?? 'UNKNOWN_ERROR'` is a chain of optional property accesses that short-circuits to `undefined` at any null/undefined step, then falls back to a default via `??`. It replaces nested `if (body && body.error && body.error.code)` checks.

**Where it appears:** Lines 67-70, constructing the `ApiServerError` from a potentially incomplete error body.

**Why this one:** The API response body might be: (a) valid JSON with the expected shape, (b) valid JSON with an unexpected shape, (c) not JSON at all. One expression handles all three cases without branching.

**Complexity:** O(1) -- just property lookups.

**How to say it in an interview:** "Optional chaining with nullish coalescing is a concise way to extract values from a structure that might be partially present. It's especially useful when parsing responses from external services where you can't guarantee the shape."

---

## 8. Impress the Interviewer

### The Service Boundary Error Problem

"One of the trickiest things in a service-oriented architecture is preserving error context across boundaries. When Service A calls Service B and B returns a structured error, A's HTTP client typically collapses that into `new Error('Request failed with status 401')`. All the machine-readable information -- error codes, field-level validation details, status -- is gone. We solved this by parsing the API's error envelope into a typed `ApiServerError` that preserves everything. Server Components can then pattern-match on `err.code` to render the right UI without string parsing."

### Why Two Clients is Better Than One

"I've seen projects try to build a single isomorphic fetch wrapper that works in both browser and server contexts. It always ends up with runtime environment checks -- `typeof window !== 'undefined'` -- and conditional logic for cookies, retry behavior, and URL resolution. We went with two small, focused clients instead. Each one is about 40-50 lines and does exactly what its environment needs. There's a small amount of type duplication, but the clarity payoff is worth it. When I read `apiServer`, I know exactly what's happening -- no mental model switching."

### The Defensive Error Parsing

"The error response parsing is deliberately paranoid. We try to read the JSON body, but we don't trust it. The Express API should return `{ error: { code, message } }`, but if a proxy times out, or the container crashes mid-response, or a load balancer injects an HTML error page, we need to handle it. The nullish coalescing chain gives us graceful fallbacks at every level. I've seen production outages where an error handler itself threw because it assumed the error response was valid JSON -- our approach prevents that recursive failure."
