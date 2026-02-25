# login/route.ts — Interview-Ready Documentation

> Source file: `apps/web/app/api/auth/login/route.ts` (21 lines)

---

## 1. 30-Second Elevator Pitch

This is a BFF (Backend-For-Frontend) proxy route. When the browser calls `GET /api/auth/login`, this route handler forwards the request to the Express API backend, copies any Set-Cookie headers from the response (like the OAuth CSRF state cookie), and returns the result to the browser. The browser never knows the Express API exists — it just talks to Next.js.

**How to say it in an interview:** "This is a BFF proxy route that forwards the login initiation to the Express backend and relays Set-Cookie headers back to the browser. It enables same-origin auth cookie management without CORS."

---

## 2. Why This Approach?

### Decision 1: BFF proxy instead of direct API calls

**What's happening:** The browser calls `/api/auth/login` on the same domain as the Next.js app. This Next.js route handler then calls the Express API on an internal URL (`API_INTERNAL_URL`). This is the BFF pattern — the browser talks to a "friendly" server on its own domain, which relays to the real API. Think of it as a receptionist taking your message and passing it to the person you actually want to talk to.

**How to say it in an interview:** "The BFF pattern lets us use httpOnly cookies for auth since everything is same-origin. The browser never calls the Express API directly, so we avoid CORS configuration and keep the API URL private."

**Over alternative:** Direct browser-to-Express calls would require CORS, expose the API URL, and make httpOnly cookie management much harder across different origins.

### Decision 2: Forwarding Set-Cookie headers explicitly

**What's happening:** The Express API response includes `Set-Cookie` headers (for the OAuth state cookie). But Next.js's `NextResponse.json()` doesn't automatically copy those headers. We loop through them with `response.headers.getSetCookie()` and append each one manually. Without this, the browser would never receive the cookies.

**How to say it in an interview:** "Set-Cookie headers need manual forwarding because NextResponse.json() creates a new response — it doesn't inherit headers from the upstream fetch. The getSetCookie() method returns all Set-Cookie headers as an array, which we relay individually."

---

## 3. Code Walkthrough

### The GET handler (lines 4-21)

1. **Forward to backend** — Calls the Express API's `/auth/google` endpoint using the internal URL from config. No body or cookies to forward on this initial request.
2. **Error check** — If the backend returns an error, wraps it in the standard API error format (`{ error: { code, message } }`) with a 502 (Bad Gateway) status.
3. **Cookie relay** — Loops through `response.headers.getSetCookie()` and appends each cookie to the Next.js response. This matters for the OAuth state cookie that the backend sets.
4. **Return data** — Returns the JSON body (containing the Google auth URL) to the browser.

The 502 status code is deliberate — it means "the proxy (Next.js) got a bad response from the upstream server (Express)." This is semantically correct for a proxy error.

---

## 4. Complexity and Trade-offs

**No request timeout:** The fetch to the Express API has no timeout. If the backend hangs, this route handler hangs too. For MVP, the default Node.js timeout is acceptable. In production, you'd add an AbortController with a 5-10s timeout.

**No retry:** A single failed backend call returns an error immediately. The frontend (LoginButton) shows the error and lets the user retry manually.

**How to say it in an interview:** "The proxy is deliberately thin — forward the request, relay cookies, return the response. No retries, no transformation. Complexity lives in the Express backend, not the proxy layer."

---

## 5. Patterns and Concepts Worth Knowing

### BFF Proxy Pattern

A Next.js route handler that sits between the browser and the backend API. The browser never calls the backend directly. This enables same-origin cookies, hides the API URL, and eliminates CORS.

**Where it appears:** This entire file is a BFF proxy route.

**Interview-ready line:** "The BFF proxy is a same-origin relay — the browser talks to Next.js at `/api/auth/login`, which forwards to the Express API internally. This enables httpOnly cookie auth without CORS."

---

## 6. Potential Interview Questions

### Q1: "Why relay cookies manually instead of using a more automated proxy?"

**Strong answer:** "Next.js route handlers create fresh NextResponse objects. The upstream fetch response's headers aren't automatically carried over. The manual relay is explicit and gives us control over which headers to forward — we only forward Set-Cookie, not potentially sensitive internal headers."

**Red flag answer:** "Next.js does it automatically." — It doesn't. This is a common gotcha.

### Q2: "What does `getSetCookie()` return and why not just use `get('Set-Cookie')`?"

**Strong answer:** "A response can have multiple Set-Cookie headers (one per cookie). `headers.get('Set-Cookie')` concatenates them into one string, which breaks cookie parsing. `getSetCookie()` returns an array of individual header values, each preserved exactly as the server sent them."

**Red flag answer:** "They're the same thing." — `get()` mangles multiple Set-Cookie headers. `getSetCookie()` is the correct API.

---

## 7. Data Structures & Algorithms Used

No meaningful data structures. The route handler is a simple pass-through.

---

## 8. Impress the Interviewer

### The getSetCookie() Gotcha

**What's happening:** HTTP allows multiple `Set-Cookie` headers in a single response. The standard `Headers.get()` method joins them with a comma, which breaks cookie parsing (cookies can legitimately contain commas in date values). `getSetCookie()` was specifically added to the Headers API to handle this edge case correctly.

**Why it matters:** This is a subtle bug that can silently break auth. If the backend sets two cookies (access_token and refresh_token), `get('Set-Cookie')` would mangle them into one unparseable header. Knowing about `getSetCookie()` shows awareness of real-world HTTP edge cases.

**How to bring it up:** "We use `getSetCookie()` instead of `get('Set-Cookie')` because the standard `get()` method joins multiple Set-Cookie headers with commas, which breaks cookie parsing. It's a well-known HTTP edge case — `getSetCookie()` was added to the Fetch API specifically to solve it."
