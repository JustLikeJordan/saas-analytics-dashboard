# callback/route.ts — Interview-Ready Documentation

> Source file: `apps/web/app/api/auth/callback/route.ts` (24 lines)

---

## 1. 30-Second Elevator Pitch

This is the server-side half of the OAuth callback. After Google redirects the user back with an authorization code, the CallbackHandler component POSTs that code here. This route forwards it to the Express backend (along with the user's cookies, which contain the OAuth state for CSRF verification), gets back the auth tokens as Set-Cookie headers, and relays everything to the browser. It's the mailroom between the browser and the token exchange endpoint.

**How to say it in an interview:** "This BFF proxy route forwards the OAuth authorization code and browser cookies to the Express backend for token exchange. It relays Set-Cookie headers back so the browser stores the access and refresh tokens as httpOnly cookies."

---

## 2. Why This Approach?

### Decision 1: Forwarding cookies explicitly via the Cookie header

**What's happening:** The Express backend needs the browser's cookies (specifically the OAuth `state` cookie for CSRF verification). Server-side fetch doesn't automatically include cookies — it's not a browser, so there's no cookie jar. We manually read the `cookie` header from the incoming request and attach it to the outgoing fetch. It's like copying the return address from one envelope onto another.

**How to say it in an interview:** "Server-side fetch doesn't have a cookie jar, so we manually forward the browser's Cookie header. The Express backend needs it to verify the OAuth state parameter against the session cookie — without it, CSRF verification would fail."

**Over alternative:** Not forwarding cookies would cause the CSRF state check to fail, since the backend wouldn't see the state cookie it set during login initiation.

### Decision 2: Passing through the backend's status code

**What's happening:** `NextResponse.json(data, { status: response.status })` preserves the Express backend's HTTP status code. If the backend returns 400 (bad request) or 401 (invalid code), the browser sees that same status. The login route (GET) uses its own 502 for errors, but this route trusts the backend's status codes since they're semantically accurate.

**How to say it in an interview:** "We preserve the backend's status code rather than wrapping it. The Express backend already uses appropriate HTTP semantics — 400 for invalid codes, 401 for failed verification — and the CallbackHandler checks `response.ok` to determine success or failure."

---

## 3. Code Walkthrough

### The POST handler (lines 4-24)

1. **Read body and cookies** — Parses the JSON body (containing `code` and `state`) and grabs the Cookie header from the incoming request.
2. **Forward to backend** — POSTs to the Express API's `/auth/callback` endpoint with the body, content type, and forwarded cookies.
3. **Relay response** — Copies the response body, status code, and all Set-Cookie headers back to the browser.

The `cookieHeader` defaults to `''` (empty string) if no cookies are present — this prevents sending `Cookie: undefined` to the backend, which some servers reject.

---

## 4. Complexity and Trade-offs

This route is intentionally a thin pass-through. All validation (CSRF check, code exchange, user creation/lookup) happens in the Express backend. The only responsibility here is plumbing — forward data in, relay data out.

**How to say it in an interview:** "The proxy is deliberately thin. It forwards the request body and cookies, relays the response and Set-Cookie headers, and preserves the status code. All business logic lives in the Express backend."

---

## 5. Patterns and Concepts Worth Knowing

### Cookie Forwarding in Server-Side Fetch

Browser fetch automatically includes cookies. Server-side fetch doesn't — there's no implicit cookie jar. When a Next.js route handler needs to forward cookies to the backend, it must read them from the incoming request and attach them as a header on the outgoing fetch.

**Where it appears:** `const cookieHeader = request.headers.get('cookie') ?? ''` → attached to the fetch as `Cookie: cookieHeader`.

**Interview-ready line:** "Server-side fetch is cookie-agnostic, so the BFF proxy manually forwards the browser's Cookie header. You need this for any server-side auth flow that depends on httpOnly cookies."

---

## 6. Potential Interview Questions

### Q1: "What happens if the cookie forwarding is removed?"

**Strong answer:** "The Express backend wouldn't receive the OAuth state cookie, so CSRF verification would fail. The code exchange would be rejected even though the authorization code is valid. It would look like a CSRF attack to the backend."

**Red flag answer:** "The exchange would still work." — Without the state cookie, CSRF verification fails and the request is rejected.

---

## 7. Data Structures & Algorithms Used

No meaningful data structures. Simple request forwarding.

---

## 8. Impress the Interviewer

### Why the Cookie Header Matters for CSRF

**What's happening:** During login initiation, the Express backend generates a random `state` value and stores it in a cookie. When Google redirects back with the same state in the URL, the backend compares URL state vs. cookie state. If they match, the request is legitimate. If not, it's a potential CSRF attack. The cookie forwarding in this proxy is what makes that comparison possible.

**Why it matters:** Without cookie forwarding, the entire CSRF protection mechanism breaks silently. The exchange would fail with an opaque error, and debugging it requires understanding the server-side cookie chain.

**How to bring it up:** "The cookie forwarding is critical for CSRF verification. The backend compares the URL state parameter against the state stored in the cookie — if the proxy doesn't forward the cookie, the check always fails. It's a subtle but essential piece of the OAuth security chain."
