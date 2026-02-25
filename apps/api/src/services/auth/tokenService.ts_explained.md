# tokenService.ts — Interview-Ready Documentation

## Section 1: 30-Second Elevator Pitch

Imagine a theme park wristband system. When you enter the park (log in), you get two wristbands: a day pass (access token) that expires in 15 minutes and must be renewed, and a season pass card (refresh token) that lasts a week but gets swapped for a new one each time you use it. This file handles creating, verifying, and rotating those wristbands — making sure only legitimate visitors get in.

**How to say it in an interview:** "This is the JWT token service that implements a short-lived access token with refresh token rotation. Access tokens are HS256-signed JWTs carrying org and role claims, while refresh tokens are cryptographically random values stored as SHA-256 hashes. Rotation ensures each refresh token is single-use, which enables reuse detection for stolen tokens."

---

## Section 2: Why This Approach?

### Decision 1: jose library over jsonwebtoken

**What's happening:** There are two popular JWT libraries in Node.js. The older one, `jsonwebtoken`, has been around forever but uses Node's older crypto APIs. `jose` is newer, uses the Web Crypto API standard, and is ESM-native (modern JavaScript module format). Think of it as the difference between a flip phone and a smartphone — both make calls, but the newer one fits better into the modern ecosystem.

**How to say it in an interview:** "We chose jose over jsonwebtoken because it's ESM-native, aligns with the Web Crypto API standard, and has zero dependencies. It also gives us consistent JWT handling on both server and edge runtimes, which matters for Next.js."

**Over alternative:** `jsonwebtoken` requires CommonJS (`require`), doesn't work in edge runtimes, and its API predates async/await.

### Decision 2: HS256 symmetric signing over RS256 asymmetric

**What's happening:** There are two main ways to sign a JWT. HS256 uses one shared secret key — the same key signs and verifies. RS256 uses a key pair — a private key signs, a public key verifies. HS256 is simpler and faster. RS256 is needed when different services verify tokens independently (microservices). Since our API is a single Express server, HS256 is the right choice — less complexity, same security.

**How to say it in an interview:** "HS256 is appropriate here because token signing and verification happen on the same server. RS256 adds key management complexity that only pays off in microservice architectures where multiple services need to independently verify tokens without sharing a secret."

**Over alternative:** RS256 would require managing a key pair, key rotation, and publishing the public key via JWKS — unnecessary overhead for a monolithic API.

### Decision 3: Refresh token rotation (single-use tokens)

**What's happening:** Every time the client uses a refresh token to get new tokens, the old refresh token is revoked and a brand-new one is issued. It's like a ticket that self-destructs after one use. If someone steals your refresh token and uses it, the next time you try to use yours, the system sees the old token was already consumed — that's a red flag indicating theft.

**How to say it in an interview:** "Refresh token rotation means each token is single-use. When a token is presented, we revoke it and issue a fresh pair. This enables reuse detection — if a revoked token is presented again, we know it was stolen, and we can take defensive action like revoking all tokens for that user."

**Over alternative:** Long-lived, reusable refresh tokens are simpler but mean a stolen token grants persistent access until it expires (potentially weeks).

### Decision 4: Storing hashes instead of raw tokens

**What's happening:** When we create a refresh token, we generate 32 random bytes (the raw token sent to the user) and store its SHA-256 hash in the database. When the user presents the token later, we hash it again and look up the hash. It's the same principle behind password hashing: if someone steals your database, the hashes are worthless without the originals.

**How to say it in an interview:** "Refresh tokens are stored as SHA-256 hashes, not plaintext. A database breach exposes hashes that can't be reversed to obtain the original tokens, so stolen database records can't be used to impersonate users."

**Over alternative:** Storing raw tokens means a database dump gives the attacker valid session tokens for every user. This is a critical vulnerability that hashing eliminates entirely.

### Decision 5: Claims-based access token with embedded role and org

**What's happening:** The access token JWT contains `org_id`, `role`, and `isAdmin` directly in its payload. This means the API can check permissions by just reading the token — no database query needed. It's like an employee badge that shows your name, department, and clearance level right on the front.

**How to say it in an interview:** "We embed authorization claims directly in the JWT so permission checks are stateless — no database round-trip needed for every API call. The trade-off is that role changes don't take effect until the next token refresh, but with 15-minute access tokens, the staleness window is acceptable."

**Over alternative:** Looking up permissions from the database on every request adds latency and database load. The 15-minute token lifetime limits how stale permissions can get.

---

## Section 3: Code Walkthrough

### Block 1: Imports and constants (lines 1-16)

Pulls in `SignJWT` and `jwtVerify` from jose for JWT operations, Node's built-in `crypto` for hashing and random bytes, and the app's config/logging/error infrastructure. The `JWT_ALG` constant locks the algorithm to HS256 — this prevents algorithm confusion attacks where an attacker tricks the server into using a weaker algorithm.

`getSecret()` encodes the JWT secret as a `Uint8Array`, which is what jose's Web Crypto API expects. This runs on every sign/verify call, but `TextEncoder.encode` is essentially free — no caching needed.

### Block 2: signAccessToken (lines 18-34)

Builds a JWT with org and role claims, sets the user ID as `sub` (subject — a standard JWT field), timestamps it, and signs it. The fluent builder pattern (`.setProtectedHeader().setSubject().setIssuedAt()...`) is jose's API design — each method returns `this` so you can chain calls.

The non-obvious part: `setExpirationTime('15m')` accepts human-readable duration strings. jose parses this internally and sets the `exp` claim as a Unix timestamp.

### Block 3: verifyAccessToken (lines 37-44)

Verifies the JWT signature and expiration, then validates the claims through `jwtPayloadSchema.parse()` — a Zod schema that enforces the expected shape at runtime. The `catch` block swallows *all* verification errors (expired, bad signature, malformed) and throws a single `AuthenticationError`. This is deliberate — you don't want to leak information about *why* a token failed (that helps attackers).

The non-obvious part: using `jwtPayloadSchema.parse()` instead of raw type assertions (`as JwtPayload`) means that if the JWT payload is structurally wrong — missing `sub`, wrong type for `org_id`, etc. — we get a clear Zod error caught by the same catch block. TypeScript's `as` keyword trusts the developer blindly; Zod actually checks at runtime.

### Block 4: generateRefreshToken (lines 52-56)

Generates 32 cryptographically random bytes (256 bits of entropy — effectively unguessable) and computes the SHA-256 hash. Returns both — the raw value goes to the client cookie, the hash goes to the database.

### Block 5: createTokenPair (lines 58-80)

The orchestrator: signs an access token, generates a refresh token, stores the hash with an expiration date, and returns both tokens. The expiration is calculated by adding 7 days to `new Date()`.

The logging at the end (`logger.info({ userId, orgId }, 'Token pair created')`) follows the Pino structured logging convention — object first, message second. This makes log entries searchable by `userId` in production.

### Block 6: rotateRefreshToken (lines 76-116)

The most complex function. It:
1. Hashes the incoming token and looks it up (active tokens only)
2. If not found, performs reuse detection — looks up the hash against *all* tokens (including revoked ones) via `findAnyByHash`. If a revoked token matches, that means the same token was presented twice: either by an attacker replaying a stolen token, or by the legitimate user whose token was already consumed by the attacker. Either way, it's a security incident — we revoke ALL tokens for that user across all orgs as a defensive measure.
3. Revokes the old token (marking it consumed)
4. Fetches fresh user data (role may have changed since the last token was issued)
5. Verifies the user still has membership in the claimed org
6. Issues a brand new token pair

The non-obvious part: re-fetching user data on every rotation ensures the new access token has current claims. If a user was promoted from `member` to `owner` since their last login, the new token reflects that immediately.

The reuse detection logs with a truncated hash prefix (`hash.slice(0, 8)`) — enough to correlate events in logs without leaking the full hash.

---

## Section 4: Complexity and Trade-offs

**Time complexity:** `createTokenPair` is O(1) relative to data size — one insert, one crypto operation. `rotateRefreshToken` makes 4 database queries sequentially (find token, revoke token, find user, find memberships), so it's O(4) database round-trips. This could be optimized with a single JOIN query, but clarity wins over micro-optimization at this scale.

**Reuse detection is fully implemented:** When a revoked token is presented, the system looks it up via `findAnyByHash` (which ignores revocation status), identifies the user, and revokes ALL their tokens across all orgs. This is the nuclear option — it forces re-authentication on every device. The rationale: if a token was replayed, you can't know which party (attacker or legitimate user) is the one presenting it, so the safest response is to invalidate everything and let the legitimate user re-authenticate.

**Race condition in rotation:** If a user has two browser tabs and both try to refresh simultaneously, one will succeed and the other will find a revoked token. This looks like reuse to the system. In practice, the frontend should coordinate refreshes (only one in-flight at a time), but the backend should handle this gracefully rather than triggering false alarms.

**JWT statelessness trade-off:** Once an access token is issued, it's valid for 15 minutes even if the user's role changes or they're banned. There's no "revoke this specific access token" mechanism — you'd need a token blacklist (stored in Redis) for that. The 15-minute window is the accepted trade-off.

**How to say it in an interview:** "The main trade-off is JWT statelessness — we accept a 15-minute window where an access token can't be individually revoked. For most scenarios, this is fine. For critical operations like account bans, we'd add a Redis-backed token blacklist as defense-in-depth. The rotation reuse detection auto-revokes all sessions on replay, which is the most defensive response — we accept some false positives from tab concurrency in exchange for strong theft response."

---

## Section 5: Patterns and Concepts Worth Knowing

### JSON Web Tokens (JWT)

A JWT is a digitally signed JSON object that's compact enough to send in HTTP headers or cookies. It has three parts separated by dots: `header.payload.signature`. The header says which algorithm was used, the payload contains your data (claims), and the signature proves nobody tampered with it. Think of it as a sealed envelope — anyone can read the letter (the payload isn't encrypted), but the seal proves it came from the right sender.

**Where it appears:** `signAccessToken` creates JWTs, `verifyAccessToken` validates them.

**Interview-ready line:** "JWTs give us stateless authentication — the server doesn't need to look up a session store on every request. The token itself carries the user's identity and permissions, verified by the cryptographic signature."

### HMAC Signing (HS256)

HMAC is a way to create a "fingerprint" of data using a secret key. HS256 means "HMAC using SHA-256." The same key both creates and verifies the fingerprint. If even one bit of the payload changes, the fingerprint won't match, so tampering is detected.

**Where it appears:** `JWT_ALG = 'HS256'`, used in `signAccessToken` and `verifyAccessToken`.

**Interview-ready line:** "HS256 is a symmetric signing algorithm — the same secret signs and verifies. It's faster than asymmetric alternatives and appropriate when signing and verification happen on the same server."

### Refresh Token Rotation

A security pattern where each refresh token can only be used once. Using it consumes the old one and produces a new pair. If a stolen token is reused, the system can detect the anomaly.

**Where it appears:** `rotateRefreshToken` — revokes old, issues new.

**Interview-ready line:** "Refresh token rotation limits the blast radius of a stolen token to a single use. Combined with reuse detection, it converts a silent compromise into a detectable event."

### Hash-Before-Store

Storing a one-way hash of a secret instead of the secret itself. The hash can't be reversed, so a database breach doesn't expose the original values. Same principle as password hashing, but for tokens.

**Where it appears:** `generateRefreshToken` returns both `raw` and `hash`; only the hash is stored.

**Interview-ready line:** "We hash refresh tokens before storage using SHA-256. This is a defense-in-depth measure — even a full database dump doesn't give an attacker usable session tokens."

### Claims-Based Authorization

Embedding permission data (roles, org membership) directly in the auth token so the server can make access decisions without hitting the database.

**Where it appears:** `signAccessToken` embeds `org_id`, `role`, and `isAdmin` in the JWT payload.

**Interview-ready line:** "Claims-based auth eliminates per-request database lookups for permissions. The trade-off is staleness — claims are refreshed on rotation, not in real-time — but with 15-minute tokens, the window is acceptable."

---

## Section 6: Potential Interview Questions

### Q1: "What happens if someone steals a user's refresh token?"

**Context if you need it:** This tests your understanding of refresh token rotation and threat modeling. The interviewer wants to see that you've thought about the attacker's path.

**Strong answer:** "If the attacker uses the stolen token first, they get a new token pair and the old token is revoked. When the real user tries to refresh, their token is rejected — and critically, our reuse detection kicks in: we look up the hash against all tokens including revoked ones, find it was already consumed, and immediately revoke ALL tokens for that user across all orgs. This forces re-authentication everywhere, locking out the attacker."

**Red flag answer:** "We use HTTPS so tokens can't be stolen." — This ignores XSS, malware, man-in-the-middle with compromised CAs, and other realistic attack vectors.

### Q2: "Why not just use long-lived access tokens instead of the refresh pattern?"

**Context if you need it:** The interviewer is testing whether you understand the security motivation behind short-lived tokens.

**Strong answer:** "A long-lived access token is a single point of failure — if it's compromised, the attacker has access for the entire lifetime (hours or days). Short-lived tokens limit exposure to 15 minutes. The refresh flow adds a database check on every rotation, which lets us verify the user still exists, hasn't been banned, and still has the right permissions."

**Red flag answer:** "It's best practice." — Always explain *why* something is best practice. The interviewer wants reasoning, not dogma.

### Q3: "How would you add the ability to revoke a specific access token?"

**Context if you need it:** JWTs are stateless — once signed, they're valid until expiration. Revoking them requires adding state back.

**Strong answer:** "I'd add a Redis-backed token blacklist. On revocation, store the token's `jti` (JWT ID) with a TTL matching the token's remaining lifetime. The auth middleware checks Redis before trusting the token. The trade-off is a Redis lookup on every authenticated request, but Redis is fast enough that this adds sub-millisecond latency."

**Red flag answer:** "Delete it from the database." — Access tokens aren't in the database. This reveals a fundamental misunderstanding of JWT architecture.

### Q4: "What's the risk if the JWT_SECRET is leaked?"

**Context if you need it:** This is a critical security scenario. The secret is the one thing protecting the entire auth system.

**Strong answer:** "If the HS256 secret leaks, anyone can forge valid JWTs with any claims — effectively becoming any user with any role. Mitigation: rotate the secret immediately (which invalidates all existing tokens, forcing re-login), audit logs for unusual access patterns during the exposure window, and consider moving to RS256 where the signing key is more naturally isolated."

**Red flag answer:** "Re-deploy with a new secret." — This addresses the fix but not the blast radius assessment. The interviewer wants to hear that you'd also investigate what happened during the exposure.

### Q5: "Two browser tabs refresh simultaneously. What happens?"

**Context if you need it:** This is a concurrency question about token rotation.

**Strong answer:** "Tab A's refresh succeeds — old token revoked, new pair issued. Tab B's refresh finds the old token already revoked and gets rejected. Currently this looks like a reuse attack. The fix is frontend coordination — a mutex or queue that ensures only one refresh is in-flight at a time. Alternatively, add a short grace period where a recently-revoked token is still accepted."

**Red flag answer:** "Both would get new tokens." — This ignores the single-use nature of refresh token rotation.

---

## Section 7: Data Structures & Algorithms Used

### SHA-256 Hash Function

**What it is:** A hash function takes input of any length and produces a fixed-length "fingerprint" (64 hex characters for SHA-256). It's one-way — you can't reverse it to get the original input. Think of it as a blender: you can put an apple in and get smoothie out, but you can't un-blend a smoothie back into an apple.

**Where it appears:** `generateRefreshToken` and `rotateRefreshToken` both use `createHash('sha256')`.

**Why this one:** SHA-256 is fast, widely supported, and has no known practical vulnerabilities. For token hashing (not passwords), speed is fine — we don't need the deliberate slowness of bcrypt because tokens have 256 bits of entropy (brute-forcing is infeasible regardless of hash speed).

**Complexity:** O(n) where n is the input length. For a 64-byte token, this is effectively constant time — microseconds.

**How to say it in an interview:** "We use SHA-256 for token hashing because tokens have high entropy by construction, so we don't need the computational cost of bcrypt. SHA-256 is fast, deterministic, and irreversible — perfect for hash-before-store when the input isn't a low-entropy password."

### Cryptographically Secure Random Bytes

**What it is:** `randomBytes(32)` generates 32 bytes (256 bits) of randomness from the operating system's cryptographic random number generator. This isn't like `Math.random()` — it uses hardware entropy sources and is suitable for security-critical values.

**Where it appears:** `generateRefreshToken` uses `randomBytes(32)`.

**Why this one:** Refresh tokens must be unguessable. 256 bits of cryptographic randomness means there are 2^256 possible tokens — more atoms than exist in the observable universe. An attacker can't brute-force this.

**Complexity:** O(n) where n is the number of bytes requested. For 32 bytes, effectively instant.

**How to say it in an interview:** "We use Node's cryptographic random bytes for token generation — 256 bits of entropy makes brute-force attacks computationally infeasible, unlike pseudo-random generators like Math.random which are predictable."

---

## Section 8: Impress the Interviewer

### Refresh Token Rotation as a Theft Detection Mechanism

**What's happening:** Token rotation isn't just about limiting token lifetime — it's a trip wire. If an attacker uses a stolen token, the legitimate user's next refresh attempt reveals the breach because their token has been consumed.

**Why it matters:** Without rotation, a stolen refresh token grants silent, persistent access for its entire lifetime (7 days). With rotation, the theft becomes detectable the moment either party uses the token — whichever goes second triggers a reuse alert.

**How to bring it up:** "Refresh token rotation serves a dual purpose — it limits the window of token validity and creates a detection mechanism. When a consumed token is replayed, we look it up via `findAnyByHash`, identify the compromised user, and bulk-revoke all their sessions via `revokeAllForUser`. It converts a silent compromise into an automated incident response."

### Structured Security Logging

**What's happening:** The code logs security events with structured data — `logger.warn({ tokenHashPrefix: hash.slice(0, 8) }, ...)` on suspected reuse, `logger.info({ userId, orgId }, ...)` on successful operations. Logging the first 8 characters of the hash is enough to correlate events without exposing the full hash.

**Why it matters:** When a security incident happens at 2am, your logs are your forensic evidence. Structured logging (key-value pairs, not string concatenation) means you can query "show me all events for userId=42 in the last hour" instead of grep-ing through unstructured text.

**How to bring it up:** "We use structured logging for all auth events with just enough data for forensics — user IDs, org IDs, and truncated token hashes. The hash prefix is enough to correlate rotation events without exposing full hashes in logs, which could be a secondary leak vector."

### Claims Refresh on Rotation

**What's happening:** During `rotateRefreshToken`, we don't just reissue the same claims — we fetch fresh user data from the database. This means role changes, profile updates, and even admin flag changes are picked up automatically every time the token rotates.

**Why it matters:** Many implementations blindly copy claims from the old token to the new one, which means a role change doesn't take effect until the refresh token itself expires (potentially days). Our approach ensures claims are never more than one access-token-lifetime stale.

**How to bring it up:** "We re-fetch user data during rotation rather than copying claims from the old token. This means permission changes propagate within one access token lifetime — at most 15 minutes — without requiring the user to log out and back in."

### The Single Secret Risk and Mitigation Path

**What's happening:** HS256 uses a single shared secret for both signing and verification. This is a single point of failure — if the secret leaks, the entire auth system is compromised.

**Why it matters:** Understanding this risk shows you think about operational security, not just code correctness. The mitigation path is well-known: move to RS256 (asymmetric) when you need key isolation, or implement secret rotation with a grace period for existing tokens.

**How to bring it up:** "HS256 is the right choice for a monolithic API, but I'm aware of the single-secret risk. If we moved to a microservice architecture, we'd switch to RS256 so services can verify tokens with a public key without needing access to the signing secret. For now, the secret is managed through environment variables with restricted access."
