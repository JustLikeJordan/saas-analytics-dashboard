# refresh/route.ts — Interview-Ready Documentation

> Source file: `apps/web/app/api/auth/refresh/route.ts` (22 lines)

---

## 1. 30-Second Elevator Pitch

This BFF proxy route handles silent token refresh. When the browser's access token expires, the `apiClient` calls `POST /api/auth/refresh`. This route forwards the request (with the refresh token cookie) to the Express backend, which performs token rotation — revoking the old refresh token, issuing new access and refresh tokens, and returning them as Set-Cookie headers. The browser gets fresh cookies without ever touching the tokens directly.

**How to say it in an interview:** "This is the BFF proxy for token refresh. It forwards the refresh token cookie to the Express backend, which performs rotation — revoking the old token and issuing a new pair. The Set-Cookie headers in the response transparently update the browser's cookies."

---

## 2. Why This Approach?

### Decision: No request body — tokens travel via cookies only

**What's happening:** Unlike the callback route, this POST has no body. The refresh token isn't in the request body — it's in an httpOnly cookie that the browser sends automatically. The backend reads the cookie, hashes it, looks up the hash, and rotates. The browser never has JavaScript access to the refresh token.

**How to say it in an interview:** "The refresh token travels via httpOnly cookie, not in the request body. This eliminates the possibility of XSS-based token theft — JavaScript can't read httpOnly cookies. The proxy forwards the Cookie header, and the backend extracts the token server-side."

**Over alternative:** Sending the refresh token in the POST body would require the JavaScript client to have access to it, which means storing it in localStorage or memory — both vulnerable to XSS.

---

## 3. Code Walkthrough

### The POST handler (lines 4-22)

Identical structure to the callback and logout routes:
1. **Read cookies** — Grabs the Cookie header from the incoming request (contains the refresh token).
2. **Forward to backend** — POSTs to `/auth/refresh` with the cookies.
3. **Relay response** — Copies the response body (success/error), status code, and Set-Cookie headers (new access + refresh tokens).

The Content-Type header is included even though there's no body — this is defensive, ensuring the backend's body parser doesn't reject the request due to a missing content type.

---

## 4. Complexity and Trade-offs

**The rotation happens upstream:** This route doesn't know about token rotation, reuse detection, or any auth logic. It's pure plumbing. The Express backend's `rotateRefreshToken` handles all the security logic — finding the token, revoking it, checking for reuse, issuing new tokens.

**Deduplication happens downstream:** The `apiClient` ensures only one refresh is in-flight at a time (shared promise singleton). Without that client-side deduplication, concurrent 401s would trigger multiple refreshes here, and with token rotation, only the first would succeed.

**How to say it in an interview:** "This route is a thin proxy — the security logic (rotation, reuse detection) lives in the Express backend, and the deduplication lives in the client-side apiClient. The proxy's only job is cookie forwarding and response relay."

---

## 5. Patterns and Concepts Worth Knowing

### httpOnly Cookie Auth Flow

httpOnly cookies can't be read by JavaScript (`document.cookie` skips them). They're sent automatically by the browser on same-origin requests. The entire token lifecycle — creation, refresh, deletion — happens through Set-Cookie headers that the browser processes silently.

**Where it appears:** The refresh token arrives via the Cookie header, new tokens return via Set-Cookie headers.

**Interview-ready line:** "The entire refresh flow is invisible to JavaScript. The browser sends the refresh token cookie automatically, the backend rotates it, and the response's Set-Cookie headers update the browser's cookie jar — all without the client-side code ever touching a token."

---

## 6. Potential Interview Questions

### Q1: "What happens if two tabs trigger a refresh simultaneously?"

**Strong answer:** "The `apiClient` deduplicates on the client side using a shared promise, so normally only one refresh call reaches this route. But if deduplication fails (e.g., different pages with their own apiClient instances), the first refresh succeeds and the second presents an already-consumed token. The backend's reuse detection kicks in, revokes all tokens for the user, and returns 401. The user has to re-authenticate — annoying but secure."

**Red flag answer:** "Both get new tokens." — Impossible with single-use refresh tokens.

---

## 7. Data Structures & Algorithms Used

No meaningful data structures. Simple request forwarding.

---

## 8. Impress the Interviewer

### The Invisible Token Lifecycle

**What's happening:** From the browser's perspective, auth is completely invisible. The browser sends cookies it can't read, receives new cookies it can't read, and the JavaScript client just sees "request succeeded" or "request failed." The entire token lifecycle — access token in a cookie, refresh token in a cookie, rotation via Set-Cookie headers — happens in a layer JavaScript can't access.

**Why it matters:** This eliminates the entire class of XSS-based token theft attacks. Even if an attacker injects JavaScript into the page, they can't read the tokens, can't extract them from the cookie jar, and can't replicate them. The worst they can do is make requests using the existing cookies — which is still bad, but significantly less catastrophic than stealing tokens that could be used from any device.

**How to bring it up:** "The token lifecycle is completely invisible to JavaScript. Even a successful XSS attack can't extract the tokens — they can only make requests in the user's browser context. This is a fundamental security advantage of httpOnly cookies over localStorage or in-memory token storage."
