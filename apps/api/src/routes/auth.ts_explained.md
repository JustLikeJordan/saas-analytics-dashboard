# routes/auth.ts — Interview-Ready Documentation

## Section 1: 30-Second Elevator Pitch

This file is the HTTP layer for authentication — the actual endpoints that the browser talks to. Think of it as a reception desk at a secure building. One window starts the Google sign-in process, another handles the callback when Google sends you back, a third exchanges your expiring badge for a fresh one, and a fourth lets you leave and hands back your badge. Under the hood, it stores credentials in secure cookies rather than handing them directly to the browser's JavaScript.

**How to say it in an interview:** "This is the Express router defining the four auth endpoints — initiate OAuth, handle callback, refresh tokens, and logout. It manages httpOnly cookies for token storage and delegates business logic to the auth service layer, keeping routes thin."

---

## Section 2: Why This Approach?

### Decision 1: httpOnly cookies over localStorage for tokens

**What's happening:** When the server gives you an access token, it has to store it somewhere in your browser. localStorage is the obvious choice — it's easy to read and write from JavaScript. But that's exactly the problem: if an attacker injects a script into your page (XSS attack), they can read localStorage and steal your tokens. httpOnly cookies can't be read by JavaScript at all — the browser automatically sends them with every request, but no script can touch them.

**How to say it in an interview:** "We store tokens in httpOnly cookies rather than localStorage to mitigate XSS. Even if an attacker injects JavaScript into the page, they can't exfiltrate the tokens because the httpOnly flag makes them invisible to client-side code."

**Over alternative:** localStorage is simpler to implement (no cookie configuration needed) but fundamentally vulnerable to XSS. A single XSS vulnerability in any dependency becomes a full account takeover.

### Decision 2: SameSite 'lax' with cookie-based CSRF state

**What's happening:** `sameSite: 'lax'` tells the browser: "send this cookie on normal navigation (clicking links) but not on cross-origin POST requests." This prevents most CSRF attacks automatically. We add the OAuth state parameter as a second layer of defense specifically for the OAuth callback flow.

**How to say it in an interview:** "We use SameSite lax cookies as the primary CSRF defense, supplemented by the OAuth state parameter for the callback flow. Lax is more practical than strict — strict blocks cookies on legitimate top-level navigations from external links."

**Over alternative:** `sameSite: 'strict'` would break logins when clicking a link to the app from an email or Slack message. `sameSite: 'none'` requires `Secure` and offers no CSRF protection.

### Decision 3: Zod validation at the route boundary

**What's happening:** The callback endpoint validates its input (`code` and `state` parameters) using a Zod schema before doing anything else. This is the system boundary — data coming from the outside world. Everything after validation can trust the data shape is correct.

**How to say it in an interview:** "We validate all external input at the route boundary using Zod schemas. This creates a trust boundary — code inside the service layer can assume valid inputs, which eliminates defensive checks scattered throughout the codebase."

**Over alternative:** Validating deep inside the service layer means every function needs to handle invalid input. Validating at the boundary centralizes it and keeps business logic clean.

### Decision 4: Express 5 implicit promise rejection forwarding

**What's happening:** Notice there are no `try/catch` blocks around the `async` route handlers. In Express 4, an unhandled promise rejection in an async handler would crash the process. Express 5 automatically catches promise rejections and forwards them to the error handler middleware. This is why the handlers can just `throw` errors and trust they'll be caught.

**How to say it in an interview:** "Express 5 automatically forwards promise rejections from async route handlers to the error middleware, so we don't need try/catch blocks or wrapper functions like express-async-errors. Thrown errors flow cleanly through the error handling pipeline."

**Over alternative:** Express 4 required wrapping every async handler in try/catch or using a wrapper library. Express 5 eliminates this boilerplate.

---

## Section 3: Code Walkthrough

### Block 1: Imports (lines 1-16)

Standard Express types, the auth service functions, refresh token queries (for logout), and shared constants/schemas. The import from `shared/schemas` gives us the Zod validation schema — same schema could be used on the frontend for client-side validation too.

### Block 2: Cookie helpers (lines 20-39)

Two small functions: `setCookie` and `clearCookie`. These encapsulate the cookie options so every cookie uses consistent security settings. The options:
- `httpOnly: true` — JavaScript can't read the cookie (XSS protection)
- `secure: isProduction` — only send over HTTPS in production (allows HTTP in dev)
- `sameSite: 'lax'` — CSRF protection without breaking navigation
- `path: '/'` — cookie available on all routes
- `maxAge` in seconds × 1000 — Express expects milliseconds

The `clearCookie` helper mirrors the same options minus `maxAge`. The non-obvious part: browsers require the *exact same* flags (httpOnly, secure, sameSite, path) when clearing a cookie. If you clear with different flags, the browser treats it as a different cookie and the old one persists.

### Block 3: GET /auth/google (lines 41-47)

Initiates the OAuth flow. Generates a random state parameter, stores it in a cookie (for CSRF verification later), and returns the Google auth URL for the frontend to redirect to. The cookie expires in 600 seconds (10 minutes) — more than enough for a user to complete the Google consent screen.

Returns `{ data: { url } }` matching the standard API response format. The frontend takes this URL and does `window.location.href = url`.

### Block 4: POST /auth/callback (lines 49-92)

The most complex route. In order:
1. **Validate input** — Zod checks that `code` and `state` are non-empty strings
2. **Verify CSRF** — compares the state parameter from the request body with the one stored in the cookie. If they don't match, someone may be trying a CSRF attack
3. **Clear state cookie** — it's single-use, consumed here
4. **Handle callback** — delegates to `handleGoogleCallback` which does the OAuth exchange, token verification, and user provisioning
5. **Create token pair** — generates our JWT access token and refresh token
6. **Set cookies** — access token (15 minutes), refresh token (7 days)
7. **Return user data** — the response includes user info, org info, and whether this is a new registration

The `membership.role as 'owner' | 'member'` cast is needed because Drizzle's return type is `string` but our `createTokenPair` expects the literal union type.

### Block 5: POST /auth/refresh (lines 94-106)

Reads the refresh token from the cookie, passes it to `rotateRefreshToken` (which validates, revokes, and issues new tokens), and sets the new tokens as cookies. If no refresh token cookie exists, throws immediately.

### Block 6: POST /auth/logout (lines 108-124)

Reads the refresh token cookie, hashes it, finds the matching token in the database, and revokes it. Then clears both cookies. The `if (rawToken)` guard handles the case where the user is already logged out (no cookie present) — we still clear cookies to be safe, but skip the database revocation.

The logger call on successful revocation includes `userId` for audit trail — you can search logs to see when any user logged out.

---

## Section 4: Complexity and Trade-offs

**Cookie vs. header auth:** Cookies are sent automatically on every request, which means the frontend doesn't need to manage token storage or add `Authorization` headers. The trade-off: cookies are tied to the domain and subject to browser quirks (third-party cookie restrictions, size limits). For a BFF (Backend-for-Frontend) architecture where the frontend and API share a domain, cookies are the natural choice.

**Single-session logout:** The logout endpoint revokes one refresh token, not all of them. If the user is logged in on multiple devices, only the current device logs out. This is a deliberate choice — "logout" means "end this session," not "end all sessions." A "logout everywhere" feature would call `revokeAllForUser` instead.

**Cookie clearing must match flags:** If you set a cookie with `httpOnly: true, sameSite: 'lax', path: '/'`, you must clear it with the same flags. This is why `clearCookie` exists as a helper — it ensures consistency. Getting this wrong is a common bug where cookies become "immortal."

**No rate limiting on these routes (yet):** Auth endpoints are prime targets for abuse (credential stuffing, OAuth state brute-forcing). The rate limiting is defined in shared constants (`RATE_LIMITS.auth: 10 req/min`) but not yet implemented on these routes. That's upcoming work.

**How to say it in an interview:** "The main trade-off is cookie-based auth versus bearer tokens. Cookies give us automatic credential transmission and XSS protection through httpOnly, but tie us to same-origin requests. For our BFF architecture where the frontend proxies to the API, this is ideal. The logout is deliberately single-session — multi-device logout is a separate feature."

---

## Section 5: Patterns and Concepts Worth Knowing

### httpOnly Cookies

When a cookie has the `httpOnly` flag, the browser stores it and sends it with every request to the matching domain, but JavaScript running in the page (`document.cookie`, `fetch`) cannot read or modify it. It's like a sealed letter the browser carries back and forth — only the server can open it.

**Where it appears:** `setCookie` function sets `httpOnly: true` on every token cookie.

**Interview-ready line:** "httpOnly cookies eliminate the most common token theft vector — XSS. Even if an attacker injects JavaScript into the page, they can't read the tokens because the httpOnly flag makes them invisible to client-side code."

### BFF (Backend-for-Frontend) Pattern

A pattern where the frontend doesn't talk directly to backend APIs. Instead, it goes through a proxy layer that handles auth, transforms requests, and hides backend complexity. In this app, Next.js proxies requests to Express, so the browser only talks to one origin.

**Where it appears:** Implicitly — these routes exist on the Express server (port 3001), but the browser hits them through Next.js's proxy (port 3000). Same origin = cookies work seamlessly.

**Interview-ready line:** "The BFF pattern means the browser only talks to one origin — the Next.js frontend. Auth cookies set on that origin are automatically included in proxied API calls, which eliminates CORS complexity and the need for explicit Authorization headers."

### Trust Boundary (Input Validation at the Edge)

A trust boundary is the line between "untrusted external data" and "validated internal data." Everything entering the system from the outside (user input, API callbacks) is validated at the boundary. Code inside the boundary can trust the data.

**Where it appears:** `googleCallbackSchema.safeParse(req.body)` validates the callback input before any business logic runs.

**Interview-ready line:** "We validate all external input at the route boundary using Zod schemas. This creates a clear trust boundary — downstream code operates on validated data, eliminating scattered defensive checks."

### Express Router Pattern

Express `Router` creates modular, mountable route handlers. Each router is a mini-application that handles a group of related routes. The main app mounts it with `app.use(authRouter)`.

**Where it appears:** `const router = Router()` and `export default router`.

**Interview-ready line:** "Routes are organized using Express Router for modularity — each feature area (auth, health, etc.) is a separate router mounted on the main app, which keeps the codebase navigable and each router independently testable."

---

## Section 6: Potential Interview Questions

### Q1: "Why use httpOnly cookies instead of localStorage?"

**Context if you need it:** This is a security question that comes up in almost every web auth interview. The interviewer wants to hear about XSS specifically.

**Strong answer:** "httpOnly cookies can't be read by JavaScript, which means XSS attacks can't steal them. With localStorage, a single XSS vulnerability in any dependency gives the attacker your tokens. httpOnly cookies narrow the attack surface — an XSS can still make authenticated requests, but can't exfiltrate tokens for use outside the browser."

**Red flag answer:** "Cookies are more secure." — Too vague. Say *why* they're more secure (httpOnly flag, XSS protection).

### Q2: "What does the sameSite 'lax' flag do?"

**Context if you need it:** SameSite is a cookie attribute that controls when the browser includes the cookie in cross-origin requests. It's one of the newer CSRF defenses.

**Strong answer:** "Lax means the cookie is sent on top-level navigations (clicking a link to our site) but not on cross-origin subresource requests (images, iframes, AJAX from other domains). This prevents CSRF on state-changing POST requests while still allowing users to click links to our app from external sites and arrive authenticated."

**Red flag answer:** "It prevents CSRF." — Technically true but shows no understanding of the mechanism or why 'lax' over 'strict'.

### Q3: "Why isn't there a try/catch around the async route handlers?"

**Context if you need it:** This tests whether you understand Express 5's async error handling, which is a significant change from Express 4.

**Strong answer:** "Express 5 automatically catches promise rejections from async route handlers and forwards them to the error-handling middleware. In Express 4, you'd need try/catch or a wrapper like express-async-errors. The errorHandler middleware at the end of the middleware chain catches everything — AppError subclasses get structured responses, unknown errors get a generic 500."

**Red flag answer:** "We forgot to add error handling." — This shows unfamiliarity with Express 5.

### Q4: "How would you add 'logout everywhere' (all devices)?"

**Context if you need it:** Extension question testing your ability to modify the existing flow.

**Strong answer:** "I'd add a POST /auth/logout-all endpoint that calls `revokeAllForUser(userId)`, which sets `revokedAt` on all active refresh tokens for that user. The next time any other device tries to refresh, it finds a revoked token and is forced to re-authenticate. I'd also consider adding a `tokenVersion` field to the user table — incrementing it on 'logout all' and checking it during access token verification for immediate invalidation."

**Red flag answer:** "Delete all their cookies." — You can't delete cookies on other devices. Cookies are browser-local. Server-side token revocation is the only cross-device mechanism.

### Q5: "What happens if someone bookmarks the Google OAuth callback URL and visits it later?"

**Context if you need it:** This tests edge-case thinking about the OAuth flow.

**Strong answer:** "The authorization code in the URL is single-use and expires quickly — Google rejects expired codes. Even if the code were valid, the state parameter in the request wouldn't match the state cookie, which was cleared after the original callback. Both protections prevent replay attacks."

**Red flag answer:** "They'd log in again." — Authorization codes are single-use. This answer shows no understanding of OAuth security.

---

## Section 7: Data Structures & Algorithms Used

### Cookie Key-Value Store (browser-managed)

**What it is:** HTTP cookies are essentially a key-value store managed by the browser. The server sets a value (`Set-Cookie: access_token=abc123`), and the browser automatically sends it back on every matching request. You don't control when cookies are sent — the browser decides based on domain, path, and security flags.

**Where it appears:** `setCookie` and `clearCookie` functions manage three cookies: `access_token`, `refresh_token`, and `oauth_state`.

**Why this one:** Cookies are the only browser storage mechanism that supports `httpOnly`. localStorage and sessionStorage are always accessible to JavaScript. For security-sensitive tokens, cookies are the only viable option.

**Complexity:** O(1) for setting and retrieving. Cookie size limit is ~4KB per cookie, which is plenty for JWTs (typically 500-1500 bytes).

**How to say it in an interview:** "We use cookies as the token store because they're the only browser storage mechanism that supports httpOnly, making them immune to JavaScript-based exfiltration."

---

## Section 8: Impress the Interviewer

### Cookie Clearing Requires Flag Consistency

**What's happening:** When you clear a cookie, the browser matches it by name AND flags (path, domain, httpOnly, sameSite). If you set a cookie with `path: '/', httpOnly: true` but try to clear it with different flags, the browser won't find a match and the cookie persists.

**Why it matters:** This is a notoriously subtle bug. Many developers have "immortal cookies" that survive logout because the clear and set flags don't match. The `clearCookie` helper in this file mirrors the same options as `setCookie` to prevent this.

**How to bring it up:** "We use paired set/clear helper functions that share the same cookie options to prevent a common bug — cookies that survive logout because the clear flags don't match the set flags. Browsers match cookies by name plus attributes, so even one mismatched flag means the cookie isn't found."

### Express 5 Promise Handling Eliminates a Whole Category of Bugs

**What's happening:** Every `async` route handler in this file just throws errors directly. In Express 4, an unhandled promise rejection would silently crash or hang the request. Express 5 catches them automatically and routes them to the error handler.

**Why it matters:** "Forgetting to wrap an async handler in try/catch" was one of the most common Express bugs. It would show up as mysterious 502s or hung connections in production. Express 5 eliminates this entire bug category.

**How to bring it up:** "Notice there are no try/catch blocks in the route handlers — that's Express 5's automatic promise rejection forwarding. In Express 4, this would be a ticking time bomb. The migration to Express 5 eliminated an entire category of production bugs related to unhandled async errors."

### Defense in Depth on the OAuth Callback

**What's happening:** The callback route has three layers of protection: (1) Zod validates the input shape, (2) the state parameter prevents CSRF, (3) the authorization code is single-use and server-exchanged. Even if one layer fails, the others catch it.

**Why it matters:** Security engineers talk about "defense in depth" — assuming any single layer can be bypassed, and building multiple overlapping protections. This callback exemplifies the principle.

**How to bring it up:** "The callback has three defense layers — input validation, CSRF state verification, and the inherent security of server-side code exchange. Even if Zod had a bypass bug, the state check catches CSRF. Even if the state check fails, the single-use code limits replay. It's defense in depth, not security by any single mechanism."
