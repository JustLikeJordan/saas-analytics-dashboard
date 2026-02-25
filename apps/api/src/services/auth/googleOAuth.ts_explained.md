# googleOAuth.ts — interview-ready documentation

## Section 1: 30-second elevator pitch

You know the "Sign in with Google" button on websites? This file is everything that happens behind the scenes when someone clicks it. It builds the URL that sends you to Google, handles the response when Google sends you back, verifies you are who you say you are, and if you're brand new, creates your account, organization, and membership all at once.

**How to say it in an interview:** "This implements the OAuth 2.0 authorization code flow with Google. It handles the full lifecycle — generating the auth URL, exchanging the authorization code for tokens, verifying the Google ID token via JWKS, and provisioning new users with a default organization on first login."

---

## Section 2: Why this approach?

### Decision 1: Authorization code flow over implicit flow
What's happening: OAuth has multiple "flows" — ways to exchange credentials. The implicit flow sends the token directly in the URL redirect (fast but less secure). The authorization code flow sends a temporary code that your server exchanges for tokens in a server-to-server call. It's like the difference between handing cash through a window (implicit) versus getting a receipt that you redeem at a secure counter (authorization code).

**How to say it in an interview:** "We use the authorization code flow because the token exchange happens server-to-server — the access token never touches the browser. The implicit flow exposes tokens in URL fragments, which are vulnerable to browser history leaks and referrer header exposure."

Over alternative: Implicit flow is deprecated by OAuth 2.1 for exactly these security reasons. PKCE (Proof Key for Code Exchange) is the other option, mainly for public clients (SPAs with no backend). Since we have a backend, the standard authorization code flow is sufficient.

### Decision 2: Verifying Google ID tokens with JWKS instead of calling the userinfo API

What's happening: When Google sends back an ID token, we can verify it two ways: call Google's API to ask "is this token valid?" (network call), or verify the cryptographic signature ourselves using Google's published public keys (local verification). We chose the second approach. It's like verifying a government ID by checking the hologram yourself instead of calling the government every time.

**How to say it in an interview:** "We verify Google ID tokens locally using JWKS rather than calling Google's userinfo endpoint. This eliminates a network round-trip, reduces our dependency on Google's API availability, and the jose library handles key caching and rotation automatically."

Over alternative: The userinfo API is simpler to implement but adds latency and creates a runtime dependency on Google's API. If Google's API goes down, our logins break. With JWKS verification, we only need Google's keys, which are cached.

### Decision 3: Auto-provisioning user + org on first login

What's happening: There's no separate "sign up" step. The first time you sign in with Google, the system creates your user account, a default organization named after you, and makes you the owner — all in one flow. It's like a hotel that assigns you a room the moment you walk in, no reservation needed.

**How to say it in an interview:** "First-time users are auto-provisioned during the OAuth callback — user, organization, and owner membership are created atomically. This eliminates the sign-up/sign-in distinction and reduces friction to a single 'Sign in with Google' click."

Over alternative: A separate registration flow adds friction and requires managing partial states (user exists but no org, etc.). For a SaaS targeting small business owners, minimizing onboarding steps directly impacts conversion.

### Decision 4: Slug generation with collision handling

What's happening: Each organization gets a URL-friendly slug (`janes-org`). The system tries the obvious slug first, then adds random suffixes if there's a collision, and falls back to a fully random slug after 3 attempts. It's like choosing a username — try your preferred one, then try it with numbers, and if all else fails, let the system pick.

**How to say it in an interview:** "Slug generation uses a progressive fallback strategy — preferred slug, then suffixed variants, then fully random. This balances user-friendliness with guaranteed uniqueness under concurrent registration."

Over alternative: UUIDs as slugs guarantee uniqueness but are ugly in URLs. Sequential numbering (`janes-org-2`) leaks information about how many collisions occurred.

### Decision 5: Profile sync on returning user login

What's happening: When an existing user logs in, we update their name and avatar from Google's latest data. People change profile pictures, get married and change names — this keeps the app current without the user needing to manually update anything.

**How to say it in an interview:** "We sync profile data from Google on every authentication, so the application always reflects the user's current Google profile without requiring manual updates."

Over alternative: Only syncing on first login means stale profile data. Syncing via a background job adds complexity. Sync-on-login is the simplest approach that keeps data fresh.

---

## Section 3: Code walkthrough

### Block 1: Imports and interfaces (lines 1-23)

Imports jose for JWT verification, crypto for OAuth state generation, and the app's service layer. The two interfaces — `GoogleTokenResponse` and `GoogleUserProfile` — define the shape of Google's API response and our normalized user data. These are local interfaces, not shared types, because they're implementation details of the Google integration.

### Block 2: JWKS setup (line 25)

```ts
const googleJwks = createRemoteJWKSet(new URL(AUTH.GOOGLE_JWKS_URL));
```

This single line does a lot. `createRemoteJWKSet` creates a function that fetches Google's public keys from their JWKS (JSON Web Key Set) endpoint and caches them. When Google rotates their keys (which they do periodically), jose automatically fetches the new ones. This is module-level (runs once at import), so every verification reuses the cached keys.

### Block 3: generateOAuthState (lines 27-29)

Generates 16 random bytes as a hex string. This "state" parameter is sent to Google and returned in the callback — if they don't match, someone's trying a CSRF attack (tricking your browser into completing someone else's OAuth flow).

### Block 4: buildGoogleAuthUrl (lines 31-43)

Constructs the URL that redirects the user to Google's consent screen. The parameters tell Google: which app is asking (`client_id`), where to send the user back (`redirect_uri`), what permissions we need (`scope: openid email profile`), and the CSRF protection state parameter. `access_type: 'offline'` requests a refresh token from Google (not used currently but available for future features). `prompt: 'select_account'` forces the account chooser even if the user is already logged into one Google account.

### Block 5: exchangeCodeForTokens (lines 45-65)

After Google redirects back with a code, this function exchanges it for tokens. It's a server-to-server POST to Google's token endpoint. The non-obvious part: the `Content-Type` is `application/x-www-form-urlencoded`, not JSON — this is a requirement of the OAuth spec. If the exchange fails, we log the error body for debugging but throw a generic `ExternalServiceError` to the client (never leak Google's error details).

### Block 6: verifyGoogleIdToken (lines 67-94)

Verifies the ID token's signature using Google's JWKS, checks the `audience` matches our client ID (prevents token confusion — a token meant for a different app won't be accepted), and accepts both issuer formats Google uses. Extracts the user profile from the JWT claims. The `name ?? email.split('@')[0]` fallback handles the rare case where Google doesn't provide a display name — it uses the email prefix instead.

The catch block re-throws `AuthenticationError` instances (our own errors) but wraps jose verification failures in a generic message. This prevents leaking internal verification details.

### Block 7: slugify + generateUniqueSlug (lines 96-122)

`slugify` is a standard text-to-URL-slug converter — lowercase, strip special characters, collapse hyphens, trim edges, and cap at 40 characters.

`generateUniqueSlug` tries the slug as-is, then adds random 4-hex suffixes (3 attempts), and finally falls back to a fully random slug. The early return pattern keeps it readable — each attempt bails out immediately on success. The `|| 'org'` fallback handles edge cases where the name slugifies to an empty string (e.g., a name entirely in non-Latin characters).

### Block 8: handleGoogleCallback (lines 124-169)

The main orchestrator. It exchanges the code for tokens, verifies the ID token, then branches:

Returning user path: Find by Google ID, update profile, fetch memberships, return the first org membership. The `memberships[0]!` non-null assertion is safe because we just checked `memberships.length === 0` above.

New user path: Create user, generate org name and slug, create org, add user as owner. The order matters — user must exist before you can create a membership.

---

## Section 4: Complexity and trade-offs

JWKS caching: jose handles this automatically — keys are fetched once and cached until they expire or a verification fails (triggering a refresh). In practice, Google rotates keys roughly every 24 hours. This means one network call per day to Google, not one per login.

Slug collision probability: With 4-hex suffix (65,536 possibilities), collisions are rare for reasonable user volumes. The 3-attempt retry covers the unlikely case. The random fallback (`org-<8-hex>`) is virtually collision-proof (4 billion possibilities).

No transaction wrapping: The user -> org -> membership creation in `handleGoogleCallback` isn't wrapped in a database transaction. If org creation succeeds but membership creation fails, you'd have an orphaned org. In practice, this is extremely unlikely (the only failure mode is a database crash mid-operation), and the simplicity trade-off is worth it at MVP scale. A TODO for production hardening.

Google API dependency: If Google's JWKS endpoint is unreachable, logins fail. jose's caching mitigates short outages (cached keys still work), but a sustained Google outage would block new logins. Existing sessions with valid tokens would still work.

**How to say it in an interview:** "The main trade-off is the lack of transactional provisioning — user, org, and membership creation aren't wrapped in a single transaction. The failure window is narrow enough for MVP, but I'd add a transaction before scaling. The JWKS approach gives us resilience against short Google outages through key caching."

---

## Section 5: Patterns and concepts worth knowing

### OAuth 2.0 authorization code flow

OAuth 2.0 is a protocol that lets users log into your app using their existing accounts (Google, GitHub, etc.) without sharing their password with you. The authorization code flow works in three steps: (1) redirect the user to Google, (2) Google redirects back with a temporary code, (3) your server exchanges the code for tokens in a private server-to-server call. The code is single-use and short-lived.

Where it appears: `buildGoogleAuthUrl` (step 1), `exchangeCodeForTokens` (step 3), `handleGoogleCallback` (orchestrates all steps).

**Interview-ready line:** "The authorization code flow keeps tokens out of the browser — the code-to-token exchange happens server-to-server, which is why it's the recommended flow for applications with a backend."

### JSON Web Key Set (JWKS)

A JWKS is a public endpoint that publishes the keys needed to verify JWTs. Think of it as a public directory of notary stamps — anyone can check if a signature is legitimate by looking up the stamp. Google publishes their signing keys at a JWKS URL, and jose fetches and caches them.

Where it appears: `createRemoteJWKSet(new URL(AUTH.GOOGLE_JWKS_URL))` on line 25.

**Interview-ready line:** "We verify Google's ID tokens locally using their JWKS endpoint rather than calling Google's userinfo API. jose handles key caching and automatic rotation, so we avoid a network round-trip on every login."

### State parameter for CSRF protection

CSRF (Cross-Site Request Forgery) is an attack where a malicious site tricks your browser into performing actions on another site. In OAuth, the state parameter prevents an attacker from initiating an OAuth flow and having your browser complete it — the callback checks that the state matches what was sent.

Where it appears: `generateOAuthState` creates it, the route handler validates it.

**Interview-ready line:** "The OAuth state parameter is a cryptographically random value stored in a cookie and sent through the OAuth flow. On callback, we verify it matches — this prevents CSRF attacks where an attacker initiates an OAuth flow and tricks the victim into completing it."

### User provisioning (just-in-time)

Instead of requiring a separate registration step, the system creates all necessary resources (user, org, membership) on first login. This is called "just-in-time provisioning" in enterprise SSO contexts.

Where it appears: The "new user" branch in `handleGoogleCallback`.

**Interview-ready line:** "We use just-in-time provisioning — the first OAuth login creates the full account setup. This eliminates the sign-up/sign-in distinction and reduces onboarding to a single click."

### Progressive fallback

A pattern where you try the ideal option first, then increasingly generic alternatives. Used here for slug generation — preferred slug -> suffixed slug -> random slug.

Where it appears: `generateUniqueSlug`.

**Interview-ready line:** "The slug generator uses progressive fallback — human-readable first choice, random suffix on collision, fully random as a last resort. This balances user experience with guaranteed uniqueness."

---

## Section 6: Potential interview questions

### Q1: "Walk me through the OAuth flow in this application."

Context if you need it: This is the most likely first question. The interviewer wants to see you understand the full round-trip, not just the code.

Strong answer: "The user clicks 'Sign in with Google', which hits our `/auth/google` endpoint. We generate a CSRF state parameter, store it in a cookie, and redirect to Google's consent screen. After the user consents, Google redirects to our callback with an authorization code and the state parameter. Our callback verifies the state matches, exchanges the code for tokens via a server-to-server POST, verifies the ID token's signature using Google's JWKS, and either finds the returning user or provisions a new one. Finally, we issue our own JWT access token and refresh token in httpOnly cookies."

Red flag answer: "Google sends us a token and we use it." — This skips the entire authorization code exchange and shows no understanding of the multi-step flow.

### Q2: "What happens if the org creation succeeds but the membership insert fails?"

Context if you need it: The interviewer is testing your awareness of transactional consistency. They want to see you acknowledge the gap.

Strong answer: "We'd have an orphaned org with no members — a data integrity issue. Currently this isn't wrapped in a transaction, which is a known trade-off for MVP simplicity. The fix is straightforward: wrap the user, org, and membership creation in a database transaction. If any step fails, everything rolls back cleanly."

Red flag answer: "That can't happen." — It absolutely can. Database connections can drop, unique constraint violations can occur if there's a race condition. Acknowledging edge cases shows maturity.

### Q3: "Why verify the Google ID token locally instead of calling Google's userinfo API?"

Context if you need it: Testing your understanding of the trade-off between local crypto verification and network-dependent verification.

Strong answer: "Local JWKS verification eliminates a network round-trip, reduces latency, and removes a runtime dependency on Google's API availability. jose caches the keys and handles rotation automatically. The trade-off is minimal — we still depend on Google's JWKS endpoint, but that's a cold-cache operation that happens roughly once per day."

Red flag answer: "It's more secure." — Both methods are equally secure if implemented correctly. The real reasons are performance and availability.

### Q4: "How would you add support for GitHub OAuth alongside Google?"

Context if you need it: Extension question testing your ability to generalize the existing pattern.

Strong answer: "I'd extract a common OAuth interface with methods like `buildAuthUrl`, `exchangeCode`, and `verifyToken`, then implement Google and GitHub adapters. The `handleCallback` logic would accept a provider parameter and delegate to the appropriate adapter. User matching would use the provider-specific ID (`googleId`, `githubId`) or fall back to email matching for account linking. The database would need a `github_id` column on users."

Red flag answer: "Copy this file and change the URLs." — This works but violates DRY and makes adding a third provider even harder.

### Q5: "What does `prompt: 'select_account'` do and why is it there?"

Context if you need it: A detail question testing whether you understand every parameter in the auth URL.

Strong answer: "It forces Google to show the account picker even if the user is already signed into a single Google account. Without it, Google silently uses the active account, which is a problem when a user has both personal and work Google accounts — they might accidentally sign in with the wrong one. The select_account prompt gives them a choice every time."

Red flag answer: "It's for the login prompt." — Too vague. The interviewer wants the specific behavior difference.

---

## Section 7: Data structures and algorithms

### URL Search Parameters (key-value encoding)

What it is: `URLSearchParams` is a built-in JavaScript class for constructing URL query strings. It handles encoding special characters (spaces become `+` or `%20`), which is critical for OAuth parameters that might contain special characters.

Where it appears: `buildGoogleAuthUrl` and `exchangeCodeForTokens` both use `new URLSearchParams({...})`.

Why this one: The OAuth spec requires `application/x-www-form-urlencoded` format. Hand-building query strings is error-prone — you'd need to manually encode each value. `URLSearchParams` does this correctly by default.

Complexity: O(n) where n is the number of parameters. For ~8 parameters, essentially instant.

**How to say it in an interview:** "We use URLSearchParams for OAuth parameter encoding because it handles special character escaping correctly per the RFC, which is critical for security — improperly encoded parameters can break the OAuth flow or introduce injection vulnerabilities."

### Regex chain (text transformation pipeline)

What it is: The `slugify` function uses 5 chained `.replace()` calls, each with a regular expression. It's a pipeline where each step transforms the text further — lowercase, strip non-alphanumeric, collapse hyphens, trim edges.

Where it appears: `slugify` function (lines 96-104).

Why this one: Regular expressions are the standard tool for text pattern matching. Chaining them is cleaner than a single complex regex because each step has a clear purpose.

Complexity: Each `.replace()` scans the string once — O(n) per step, O(5n) total, which simplifies to O(n). For short strings (names), this is microseconds.

**How to say it in an interview:** "The slugify function uses a regex pipeline — five sequential replacements that each handle one transformation. This is more readable and maintainable than a single monolithic regex."

### Retry with random suffix

What it is: `generateUniqueSlug` uses a bounded retry loop (3 attempts) with random suffixes to resolve slug collisions. Each attempt generates a different random suffix, checking uniqueness against the database.

Where it appears: The `for` loop in `generateUniqueSlug` (lines 113-118).

Why this one: Unbounded retries risk infinite loops. A bounded retry with a guaranteed-unique fallback (`org-<random>`) ensures termination while still trying for human-readable slugs.

Complexity: Worst case: 4 database queries (1 initial + 3 retries). Best case: 1 query (no collision). The random fallback after retries is effectively O(1) for uniqueness checking since the probability of collision with 8 hex chars is ~1 in 4 billion.

**How to say it in an interview:** "The slug generation uses bounded retries with random suffixes, falling back to a fully random slug after 3 attempts. This guarantees termination while maximizing the chance of a human-readable result."

---

## Section 8: Impress the interviewer

### JWKS key rotation is handled automatically

What's happening: `createRemoteJWKSet` from jose doesn't just fetch keys once — it caches them and automatically refetches when a verification fails due to an unknown key ID. Google rotates their signing keys periodically, and this mechanism means our app handles that rotation without any code changes or restarts.

Why it matters: Key rotation is a common source of production outages in OAuth implementations. If you hard-code a public key, your app breaks when Google rotates. The JWKS approach makes rotation invisible.

How to bring it up: "The jose library's JWKS client handles Google's key rotation transparently — it caches keys and auto-refetches when encountering an unknown key ID. This means zero-downtime when Google rotates their signing keys, which they do roughly every 24 hours."

### The state parameter is stored in a cookie, not server memory

What's happening: The CSRF state parameter is stored in an httpOnly cookie, not in server-side session storage. This keeps the server stateless — no need for session stores, sticky sessions, or Redis for OAuth state.

Why it matters: Many OAuth tutorials store the state in a server-side session, which creates a scaling problem — you need session affinity (the callback must hit the same server) or shared session storage. A cookie-based approach works with any number of servers behind a load balancer.

How to bring it up: "The OAuth state is stored in a cookie rather than server-side session storage, which keeps the auth flow completely stateless. This means we can run multiple API instances behind a load balancer without session affinity or shared session stores."

### Defensive profile extraction with fallbacks

What's happening: When extracting the user profile from Google's ID token, the code handles missing fields gracefully — `name ?? email.split('@')[0]` falls back to the email prefix if Google doesn't provide a display name, and `picture ?? null` explicitly handles missing avatars.

Why it matters: Google's ID tokens don't guarantee all fields are present. A Google Workspace admin can restrict which profile fields are shared. If your code assumes `name` always exists, it crashes for users whose admin restricted profile sharing.

How to bring it up: "We defensively extract profile fields from Google's ID token with fallbacks for each one. Google Workspace admins can restrict profile sharing, so we can't assume all fields are present — the fallback to email prefix for missing names prevents crashes for enterprise users with restricted profiles."
