# proxy.ts — interview-ready documentation

> Source file: `apps/web/proxy.ts` (46 lines)

---

## 1. 30-second elevator pitch

In Next.js 16, there's a special file called `proxy.ts` (previously `middleware.ts` in older versions) that runs *before* any page renders. Think of it as a security guard at the entrance to a building. Most visitors can walk right in — but if you're heading to a restricted floor (like `/upload`, `/billing`, or `/admin`), the guard checks your badge first. No badge? You get redirected to the sign-in desk.

**How to say it in an interview:** "This is the Next.js 16 edge proxy — it intercepts requests to protected routes, validates the JWT from the cookie, and redirects unauthenticated users to login with a redirect parameter. Non-protected routes pass through untouched, which is why the dashboard stays public."

---

## 2. Why this approach?

### Decision 1: edge-level route protection instead of per-page checks

**What's happening:** Instead of checking authentication inside each protected page component, we check once at the proxy level before the page even starts rendering. It's like having a gate at the parking lot entrance rather than checking tickets at every individual office door — more efficient and harder to forget.

**How to say it in an interview:** "Route protection at the proxy layer means unauthorized requests never reach the page rendering pipeline. It's a single enforcement point rather than scattered checks across components, which reduces the risk of accidentally leaving a route unprotected."

**Over alternative:** Per-page `getServerSideProps` auth checks would work but are repetitive, easy to forget on new pages, and waste server resources rendering pages that will just redirect anyway.

### Decision 2: centralized config via `webEnv` instead of `process.env`

**What's happening:** The JWT secret comes from `webEnv.JWT_SECRET` — an import from `@/lib/config` that validates environment variables through Zod at startup. Using `process.env` directly is tempting but dangerous: if the variable is missing, you get `undefined` and the code silently breaks. With `webEnv`, a missing variable crashes at startup with a clear error message — fail fast, fail loudly.

**How to say it in an interview:** "All environment access goes through a Zod-validated config module. This surfaces misconfiguration at startup rather than letting it silently degrade at runtime — like a missing JWT secret causing auth checks to silently pass."

**Over alternative:** Raw `process.env.JWT_SECRET` would work but gives you `string | undefined`, leading to subtle bugs. The config module guarantees the type and existence.

### Decision 3: Graceful degradation when secret is unavailable

**What's happening:** `getJwtSecret()` returns `null` if the secret isn't set, and the proxy skips JWT verification in that case. This might seem unsafe, but it's deliberate for local development — you might not have all env vars configured, and you still want the app to run. In production, the Zod config validation ensures the secret exists before the app starts.

**How to say it in an interview:** "The null-check on the JWT secret provides graceful degradation during development while production relies on the startup config validation to guarantee it exists. It's defense in depth — two layers of checking."

**Over alternative:** Throwing an error when the secret is missing would crash the proxy on every request during development, making it painful to work on non-auth features.

---

## 3. Code Walkthrough

### Route protection list (line 5)

`PROTECTED_ROUTES` is a simple array of path prefixes. Only `/upload`, `/billing`, and `/admin` are protected. Everything else — including `/dashboard` — passes through. This matches the architecture decision that the dashboard is public (demo mode with seed data for unauthenticated users).

### Secret accessor (lines 7-10)

`getJwtSecret()` wraps the config access and encoding in one place. Returns `null` if the secret isn't available, or a `Uint8Array` (what the jose library expects). The `TextEncoder` converts the string secret into bytes — jose uses the Web Crypto API which works with byte arrays, not strings.

### The proxy function (lines 12-41)

The core logic is a two-step check:
1. **Is this route protected?** — Checks both exact matches (`/upload`) and prefix matches (`/upload/something`) using `.some()` with a startsWith check.
2. **Does the user have a valid token?** — Reads the `access_token` cookie, verifies it with jose. No cookie or bad token → redirect to `/login?redirect=/original-path`.

The redirect parameter (`loginUrl.searchParams.set('redirect', pathname)`) preserves where the user was trying to go, so after login they land on the right page instead of always going to `/dashboard`.

### Matcher config (lines 43-45)

The `config.matcher` tells Next.js which routes this proxy should even run on. This is a performance optimization — the proxy doesn't execute for every request, only for paths matching these patterns. Without it, every static asset, API route, and page load would pass through the proxy function.

---

## 4. Complexity and Trade-offs

**Time complexity:** O(n) where n is the number of protected routes (currently 3). The `.some()` loop is trivially fast. JWT verification is the real cost — one cryptographic operation per protected route request.

**The token-only check:** The proxy validates that the JWT is well-formed and not expired, but it doesn't check roles or org membership. That's intentional — role-based access control happens in the API layer, not the proxy. The proxy's job is binary: authenticated or not.

**Cookie vs header:** The token is read from a cookie, not an Authorization header. This is the BFF (Backend-For-Frontend) pattern — cookies are automatically sent by the browser, so the frontend never handles tokens directly. Reduces XSS risk since JavaScript can't access httpOnly cookies.

**How to say it in an interview:** "The proxy handles authentication (are you logged in?) but not authorization (do you have permission?). RBAC is enforced at the API layer. This separation keeps the proxy simple and fast while allowing fine-grained permissions on individual API endpoints."

---

## 5. Patterns and Concepts Worth Knowing

### BFF (Backend-For-Frontend) Pattern

A BFF is an intermediate server layer between the browser and the API. Instead of the browser calling the API directly, it calls the BFF (same origin), which forwards requests to the API. This lets you use httpOnly cookies (invisible to JavaScript) for auth, which is more secure than storing tokens in localStorage or memory.

**Where it appears:** The entire proxy file is part of the BFF — it reads cookies that the browser can't access via JavaScript, and it's on the same origin as the frontend.

**Interview-ready line:** "The BFF pattern lets us use httpOnly cookies for JWT storage, which eliminates the XSS token theft vector. The proxy validates the cookie server-side before allowing access to protected routes."

### Edge Middleware / Proxy Pattern

Next.js proxy runs at the edge — before your page's server-side rendering. It can read cookies, redirect, rewrite URLs, or add headers. It's the first code that runs for a matching request.

**Where it appears:** The `proxy()` export and `config.matcher` are Next.js 16 conventions that define edge behavior.

**Interview-ready line:** "Next.js 16 renamed middleware to proxy. It runs at the edge before SSR, so route protection decisions happen before any rendering work — unauthorized requests are redirected without wasting compute."

---

## 6. Potential Interview Questions

### Q1: "Why is the dashboard not protected?"

**Context if you need it:** This is a product architecture question. The interviewer wants to see you understand the business decision, not just the code.

**Strong answer:** "The dashboard is public by design — unauthenticated users see demo data from the seed dataset. This lets potential customers experience the product without signing up, which improves conversion. The AI features behind the paywall are gated at the API level, not the route level."

**Red flag answer:** "We forgot to add it." — Shows you don't understand the product's demo mode strategy.

### Q2: "What happens if the JWT secret changes while users have active tokens?"

**Context if you need it:** This tests your understanding of JWT statelessness and operational concerns.

**Strong answer:** "All existing tokens become invalid immediately — `jwtVerify` will fail because the signature won't match the new secret. Every user gets redirected to login. To do a graceful rotation, you'd support two secrets temporarily — verify against both during a transition window, then drop the old one."

**Red flag answer:** "The tokens still work because they're self-contained." — Shows a misunderstanding. JWTs are self-contained for *claims*, but verification requires the signing secret.

### Q3: "An attacker discovers a protected route you forgot to add to the list. What's the blast radius?"

**Context if you need it:** Defense in depth — what other layers catch this?

**Strong answer:** "The proxy is the first line, but the API layer enforces auth independently — the Express auth middleware checks the JWT on every protected API endpoint. So the attacker can see the page HTML but can't fetch any data. It's a UI exposure, not a data breach. Still, we'd add the route to the protected list as soon as it's discovered."

**Red flag answer:** "They'd have full access." — Ignores the API-level auth layer.

---

## 7. Data Structures & Algorithms Used

This file uses no meaningful data structures beyond a simple array for route matching. The route-matching logic is a linear scan (`.some()` with `.startsWith()`), which is O(n) but n is 3, so this is effectively constant time.

---

## 8. Impress the Interviewer

### The Redirect Preservation Pattern

**What's happening:** When redirecting to login, the proxy appends `?redirect=/original-path` to the login URL. The login page reads this, the LoginButton stores it in sessionStorage, and after the OAuth callback completes, the user is redirected to where they originally wanted to go — not just dumped on `/dashboard`.

**Why it matters:** Without redirect preservation, users who bookmark protected URLs or click links from emails always land on the dashboard after login, which is frustrating. This is a small UX detail that separates production auth from tutorial auth.

**How to bring it up:** "The proxy preserves the user's intended destination through the entire OAuth flow — from proxy redirect, through the login page, across the Google OAuth round-trip, and back to the callback handler. It's a chain of four handoffs that keeps the user's context intact."

### Why matcher Matters for Performance

**What's happening:** The `config.matcher` array tells Next.js to only run the proxy function for requests matching `/upload/*`, `/billing/*`, or `/admin/*`. Without it, the proxy runs on *every* request — including static assets, images, and API routes.

**Why it matters:** In a production app serving hundreds of static assets per page load, running a JWT verification on each one would be pointlessly expensive. The matcher ensures the proxy is surgical, not shotgun.

**How to bring it up:** "The matcher config is a performance optimization — without it, the proxy would run on every request including static assets. By scoping it to only protected route prefixes, we avoid unnecessary JWT verification on the critical path for public pages."
