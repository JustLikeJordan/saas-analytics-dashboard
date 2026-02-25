# route.ts (BFF invite proxy) — interview-ready documentation

## Section 1: 30-second elevator pitch

This is the middleman between the browser and the Express API for invite operations. GET fetches active invites, POST creates a new one. Both forward cookies and return whatever the API sends back, status code and all. It's the same pattern as every other BFF proxy in the app — a transparent passthrough on the same origin.

**How to say it in an interview:** "This is a Next.js route handler implementing the BFF proxy pattern. It forwards invite requests to the Express API with cookie passthrough, keeping the API's origin private and avoiding CORS entirely."

---

## Section 2: Why this approach?

### Decision 1: Explicit cookie forwarding

The `request.headers.get('cookie')` extraction and re-attachment is necessary because server-side `fetch` in Next.js doesn't automatically include browser cookies. The browser sends cookies to the Next.js origin, but the proxy must manually attach them to the outbound request.

**How to say it in an interview:** "Server-side fetch doesn't inherit browser cookies. We manually extract and forward them so the Express API sees the same auth context as the browser."

### Decision 2: Status code passthrough

`{ status: response.status }` preserves the Express API's status codes — 201 for creation, 403 for non-owners, 400 for validation errors. The frontend `apiClient` wrapper relies on these codes to distinguish success from failure.

---

## Section 3: Code walkthrough

### GET handler (lines 4-12)
Forwards to Express `/invites` with cookies. No request body. Returns the JSON response and status code directly.

### POST handler (lines 14-27)
Reads JSON body from the request, forwards to Express with `Content-Type: application/json` and cookies. Returns the response as-is.

Both handlers are structurally identical except POST includes a body. This is intentional — BFF proxies should be boring.

---

## Section 4: Complexity and trade-offs

O(1) per request — one inbound, one outbound, one response. The main risk is the proxy adding latency. In production, the API runs on the same network (or same machine via Docker), so the overhead is negligible.

Missing: Set-Cookie header forwarding. If the Express API ever sets cookies on invite routes (it doesn't currently), they'd be lost. The auth routes handle this explicitly — invite routes don't need it.

---

## Section 5: Patterns worth knowing

### BFF proxy pattern
The browser talks to Next.js at `localhost:3000/api/*`. Next.js forwards to Express at `localhost:3001/*`. Same-origin means no CORS headers needed. The Express URL stays private.

**Interview-ready line:** "BFF proxy keeps the API origin private, eliminates CORS, and lets us forward httpOnly cookies without exposing them to client-side JavaScript."

---

## Section 6: Interview questions

### Q1: "Why not call the Express API directly from the browser?"
**Strong answer:** "Three reasons: CORS configuration would be needed, httpOnly cookies from a different origin require specific CORS headers, and the internal API URL would be exposed to the browser."

### Q2: "What happens if the Express API is down?"
**Strong answer:** "The fetch call throws a network error. The Next.js handler would return a 500 by default. In production, you'd want to catch this and return a structured error response."

---

## Section 7: Data structures

No notable data structures — pure passthrough.

---

## Section 8: Impress the interviewer

### The BFF is a security boundary
Even if an attacker can run JavaScript on the page (XSS), they can only make same-origin requests to `/api/*`. They can't discover or directly hit the internal Express URL. This limits the attack surface.

How to bring it up: "The BFF acts as a security boundary — even under XSS, attackers can only reach the public proxy endpoints, not the internal API directly."
