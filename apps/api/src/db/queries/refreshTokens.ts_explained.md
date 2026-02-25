# refreshTokens.ts (queries) — interview-ready documentation

## Section 1: 30-second elevator pitch

This file manages the database side of refresh tokens — the long-lived credentials that keep users logged in for days. It can create a new hashed token record, find a valid one by its hash (checking it hasn't been revoked or expired), find *any* token by hash regardless of status (for reuse detection), revoke a single token, or revoke all of a user's tokens at once. Think of it as the ledger for a coat check — tracking which tickets are outstanding, which have been returned, and providing both a "was this ticket ever issued?" forensic check and a "cancel all tickets" panic button.

**How to say it in an interview:** "This is the data access layer for refresh tokens. It handles creation, lookup with validity checks, forensic lookup for reuse detection, single-token revocation, and bulk revocation for security incidents — all using Drizzle's query builder with composite WHERE conditions."

---

## Section 2: Why this approach?

### Decision 1: Validity checks built into the query, not the service

What's happening: `findByHash` doesn't just look up a token by hash — it also checks `isNull(revokedAt)` and `gt(expiresAt, new Date())` in the same query. This means an invalid token never even reaches the service layer. It's like a bouncer checking your ID at the door — you don't get inside and then get asked to leave.

**How to say it in an interview:** "Token validity is enforced at the query level — the lookup combines hash matching, revocation check, and expiration check in a single WHERE clause. Invalid tokens return `undefined`, so the service layer has a clean binary: found or not found."

Over alternative: Fetching the token by hash and then checking validity in JavaScript adds a database round-trip for tokens that should have been filtered out. The composite WHERE is both cleaner and faster.

### Decision 2: Soft-delete via `revokedAt` timestamp

What's happening: Revoking a token doesn't delete it — it sets `revokedAt` to the current time. The record stays for auditing. You can trace when a token was created, when it was revoked, and by correlation (with logs), why.

**How to say it in an interview:** "We use soft-delete for revocation — setting a timestamp rather than deleting the row. This preserves an audit trail for security forensics while the validity query naturally excludes revoked tokens."

Over alternative: Hard deletion loses the audit trail. You can't answer "when was this token revoked?" if the row is gone.

### Decision 3: Bulk revocation for security incidents

What's happening: `revokeAllForUser` revokes every active token for a user across all orgs. This is the "logout everywhere" nuclear option for security incidents — if you suspect an account is compromised, one call invalidates all sessions on all devices.

**How to say it in an interview:** "Bulk revocation is a security-critical operation — it invalidates all sessions for a user in a single UPDATE query, which is essential for incident response when an account may be compromised."

---

## Section 3: Code walkthrough

### createRefreshToken (lines 5-14)

Stores a new token record with the hash, user/org association, and expiration date. The raw token is never stored — only the SHA-256 hash. Returns the created record via `.returning()`.

### findByHash (lines 16-24)

The hot-path query — called on every token refresh. The `and()` combines three conditions: hash matches, not revoked (`revokedAt IS NULL`), and not expired (`expiresAt > NOW()`). Returns the token record or `undefined`.

The non-obvious part: `new Date()` inside the query creates the comparison time at query execution, not at function definition. The "now" is fresh on every call.

### findAnyByHash (lines 27-31)

The forensic query — used exclusively for reuse detection. Unlike `findByHash`, this one doesn't care if the token is revoked or expired. It just asks "was this hash ever stored?" If yes, someone is replaying a previously-consumed token. The caller (`rotateRefreshToken`) uses the returned record's `userId` to trigger bulk revocation.

The non-obvious part: this is deliberately simple — just `eq(refreshTokens.tokenHash, tokenHash)` with no additional conditions. The simplicity is the point. `findByHash` is optimistic ("find me a valid token"), while `findAnyByHash` is forensic ("has this hash ever existed, regardless of status").

### revokeToken (lines 33-40)

Sets `revokedAt` to the current timestamp for a single token by ID. Returns the updated record. Used during normal token rotation (revoke old, issue new).

### revokeAllForUser (lines 43-48)

The security response function. Revokes all *active* tokens for a user — the `isNull(revokedAt)` condition ensures already-revoked tokens aren't touched (their original revocation timestamp is preserved for forensics). Doesn't return anything because the caller doesn't need the revoked records.

---

## Section 4: Complexity and trade-offs

`findByHash` is O(log n) via the unique index on `tokenHash`. The additional conditions (`revokedAt IS NULL`, `expiresAt > NOW()`) are checked after the index lookup, so they don't add much cost.

The table only grows. Soft-deletes and expired tokens accumulate forever. At scale, you'd need a cleanup job: `DELETE FROM refresh_tokens WHERE revokedAt IS NOT NULL AND revokedAt < NOW() - INTERVAL '30 days'`. Not built yet — fine for MVP.

No transaction coordination with `revokeAllForUser`. If the bulk revocation partially fails, some tokens could remain active. In practice, a single UPDATE hitting all rows for a user_id is atomic in PostgreSQL, so this isn't a real risk.

**How to say it in an interview:** "The main scalability concern is table growth from soft-deleted tokens. A periodic cleanup job would prune expired and revoked tokens older than a retention window — 30 days is typical for security audit requirements."

---

## Section 5: Patterns and concepts worth knowing

### Composite WHERE conditions

Combining multiple conditions with `and()` to create a precise query. Each condition filters further, and the database evaluates them together using the most efficient index path.

Where it appears: `findByHash` uses `and(eq, isNull, gt)`. Contrast with `findAnyByHash`, which uses a single `eq()` — the absence of conditions is a deliberate design choice for forensic queries.

**Interview-ready line:** "The composite WHERE clause in findByHash does three things in one query — hash lookup, revocation check, and expiration check. This keeps invalid tokens out of the application layer entirely. The companion `findAnyByHash` deliberately omits those checks — it's the forensic query for reuse detection, where we need to know if a hash ever existed regardless of status."

### Soft delete

Marking a record as inactive (via a timestamp) instead of deleting it. Queries filter on the soft-delete column to exclude inactive records. The timestamp tells you when it was deactivated.

Where it appears: `revokedAt` column, checked via `isNull(revokedAt)` in queries.

**Interview-ready line:** "Soft delete via `revokedAt` preserves the audit trail while making revoked tokens invisible to validity queries. The timestamp captures when revocation happened, which matters for security incident timelines."

---

## Section 6: Potential interview questions

### Q1: "Why check expiration in the database query instead of in JavaScript?"

Strong answer: "It's more efficient — the database filters expired tokens out before they cross the network boundary. It also prevents a subtle bug: if you fetch a token and then check expiry in JS, there's a tiny window where the token could expire between the fetch and the check. The database check is atomic."

Red flag answer: "It doesn't matter where you check." — It does, both for performance and correctness.

### Q2: "How would you implement a token cleanup job?"

Strong answer: "A scheduled job (cron or pg_cron) that runs `DELETE FROM refresh_tokens WHERE (revokedAt IS NOT NULL AND revokedAt < NOW() - INTERVAL '30 days') OR (expiresAt < NOW() - INTERVAL '1 day')`. The retention window keeps recent revocations for auditing while cleaning up old records. I'd batch the deletes to avoid long-running transactions on large tables."

Red flag answer: "Delete everything that's expired." — Misses the revoked-but-within-audit-window tokens.

### Q3: "What if revokeAllForUser needs to be immediate — how do you handle active access tokens?"

Strong answer: "Refresh token revocation is immediate, but active access tokens are valid until they expire (15 minutes). For truly immediate revocation, you'd add a Redis-backed blacklist of user IDs, checked by the auth middleware. The auth middleware would reject tokens from blacklisted users even if the JWT is otherwise valid."

Red flag answer: "Revoking refresh tokens is enough." — It's not immediate. The attacker has up to 15 minutes to use an already-issued access token.

---

## Section 7: Data structures and algorithms used

The `tokenHash` column uses a unique B-tree index for O(log n) hash lookups. Both `findByHash` and `findAnyByHash` use this same index — the additional conditions in `findByHash` (`revokedAt IS NULL`, `expiresAt > NOW()`) are evaluated as row-level filters after the index lookup. The `userId` index supports the bulk revocation query (`WHERE userId = ?`).

---

## Section 8: Impress the interviewer

### The audit trail is for security forensics

What's happening: Soft-deleted tokens with `revokedAt` timestamps create a timeline of token lifecycle events. Combined with structured logs, you can reconstruct exactly what happened during a security incident: when tokens were created, when they were used, and when they were revoked.

**How to bring it up:** "The soft-delete isn't just for data retention — it creates a forensic timeline. During a security incident, I can query 'show me all tokens for user X, ordered by creation and revocation timestamps' to understand the attacker's session lifecycle and determine the blast radius."

### Bulk revocation is the emergency brake

What's happening: `revokeAllForUser` is designed for incident response. When you detect a compromised account, you need to invalidate every session instantly, across all devices and orgs.

**How to bring it up:** "The bulk revocation function is our incident response tool — one call invalidates all sessions for a compromised account. It's deliberately cross-org because a compromise in one org could mean the attacker has access to all of the user's orgs."
