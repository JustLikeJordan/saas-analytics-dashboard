# logout/route.ts — Interview-Ready Documentation

> Source file: `apps/web/app/api/auth/logout/route.ts` (22 lines)

---

## 1. 30-Second Elevator Pitch

This BFF proxy route handles sign-out. When the user clicks "Logout," the frontend calls `POST /api/auth/logout`. This route forwards the request (with the auth cookies) to the Express backend, which revokes the refresh token in the database and returns Set-Cookie headers that clear both cookies. The browser processes those headers and the user is logged out — cookies deleted, refresh token revoked, session over.

**How to say it in an interview:** "This is the BFF proxy for logout. It forwards cookies to the Express backend, which revokes the refresh token and returns Set-Cookie headers with expired dates to clear the browser's auth cookies. It's a two-step invalidation — server-side revocation plus client-side cookie clearing."

---

## 2. Why This Approach?

### Decision: Server-side revocation + cookie clearing, not just cookie deletion

**What's happening:** A naive logout would just delete the cookies from the browser. But the refresh token in the database would still be valid — if someone had copied it (e.g., from a compromised device), they could still use it. The Express backend revokes the token in the database (setting `revokedAt`), so even a stolen copy becomes useless. Then it sends expired-cookie headers to clear the browser's copies.

**How to say it in an interview:** "Logout is both server-side and client-side. We revoke the refresh token in the database to prevent reuse from compromised copies, and clear browser cookies to end the local session. Either one alone has gaps — together they're thorough."

**Over alternative:** Client-side-only logout (just deleting cookies) leaves the refresh token valid in the database — a stolen token could still be used from another device.

---

## 3. Code Walkthrough

### The POST handler (lines 4-22)

Same structure as the refresh and callback routes:
1. **Read cookies** — Grabs the Cookie header (contains the refresh token and possibly the access token).
2. **Forward to backend** — POSTs to `/auth/logout` with the cookies.
3. **Relay response** — Copies the response body, status code, and Set-Cookie headers (which clear the cookies by setting them with past expiration dates).

The backend is responsible for:
- Extracting the refresh token from the cookie
- Hashing it and revoking it in the database
- Returning `Set-Cookie` headers with `Max-Age=0` or expired `Expires` dates to delete the browser cookies

---

## 4. Complexity and Trade-offs

**The access token lingers:** Even after logout, any previously-issued access tokens remain valid until they expire (up to 15 minutes). This is a fundamental JWT trade-off — access tokens are stateless and can't be individually revoked without a blacklist. For most apps, 15 minutes of residual access is acceptable.

**No client-side cleanup in the proxy:** The route doesn't clear any client-side state (React state, sessionStorage). That's the caller's responsibility — the logout button should also clear app state and redirect to the login page.

**How to say it in an interview:** "The proxy handles server-side cleanup via the backend (token revocation + cookie clearing). Client-side state cleanup (React, sessionStorage) is the UI layer's responsibility. The access token remains valid for up to 15 minutes — adding a Redis blacklist would close that gap if needed."

---

## 5. Patterns and Concepts Worth Knowing

### Two-Layer Logout

Proper logout invalidates both the server-side session (revoking the refresh token) and the client-side session (clearing cookies). Either layer alone has a gap — server-only revocation leaves valid cookies in the browser, cookie-only deletion leaves a usable token in the database.

**Where it appears:** The Express backend revokes the token and sends expiring Set-Cookie headers. This route relays both actions to the browser.

**Interview-ready line:** "Logout is a two-layer operation — revoke the refresh token server-side so stolen copies are useless, and clear cookies client-side so the browser session ends immediately. The BFF proxy relays both in a single round-trip."

---

## 6. Potential Interview Questions

### Q1: "A user logs out but an attacker already has their access token. What can the attacker do?"

**Strong answer:** "The access token is valid for up to 15 minutes. The attacker can make API calls during that window. The refresh token is revoked, so when the access token expires, the attacker can't renew it. To close this window immediately, you'd need a Redis-backed token blacklist checked on every authenticated request."

**Red flag answer:** "Nothing, they're fully logged out." — Access tokens are stateless. Logout doesn't invalidate them.

---

## 7. Data Structures & Algorithms Used

No meaningful data structures. Simple request forwarding.

---

## 8. Impress the Interviewer

### The Revocation + Clearing Double-Lock

**What's happening:** The backend does two things in the logout flow: (1) marks the refresh token as revoked in the database (`revokedAt` timestamp), and (2) sends Set-Cookie headers with expired dates to clear the browser cookies. These are independent safety mechanisms — revocation prevents database-level token reuse, cookie clearing ends the browser-level session.

**Why it matters:** If you only clear cookies, a stolen refresh token hash still has a valid database record. If you only revoke server-side, the browser still has valid-looking cookies that would fail on next use (confusing UX). The double approach is clean from both security and UX perspectives.

**How to bring it up:** "Logout uses a double-lock pattern — server-side revocation makes stolen tokens unusable, and cookie clearing provides immediate UX feedback that the session is ended. Neither alone is sufficient, but together they cover both the security and usability angles."
