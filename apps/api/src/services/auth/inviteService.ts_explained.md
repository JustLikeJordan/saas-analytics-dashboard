# inviteService.ts — interview-ready documentation

## Section 1: 30-second elevator pitch

Picture a house key system for a shared office. The office manager cuts a key (invite token), writes down the key's serial number hash in a ledger (database), and hands the actual key to a friend. When the friend shows up, the front desk hashes the key, matches it against the ledger, checks expiry and usage, and either lets them in or turns them away.

**How to say it in an interview:** "This is the invite link service for our org-based multi-tenant system. It implements a generate-validate-redeem flow where invite tokens are stored as SHA-256 hashes, validated for expiry and single-use constraints, and redeemed to create org memberships."

---

## Section 2: Why this approach?

### Decision 1: SHA-256 hash-before-store

When we generate an invite, we create 32 random bytes for the URL but store only the SHA-256 hash. Same pattern as refresh tokens. A database breach exposes only irreversible hashes.

**How to say it in an interview:** "Invite tokens use hash-before-store. A database breach exposes hashes that can't be reversed into usable invite URLs."

### Decision 2: Single-use tokens

Once redeemed, the token is marked with `usedAt` and `usedBy`. Simpler than "uses remaining" counters and limits blast radius of leaked links.

### Decision 3: Idempotent redemption for existing members

If a user already belongs to the org, we consume the token but skip the membership insert. Returns `{ alreadyMember: true }` — no errors, no duplicates.

---

## Section 3: Code walkthrough

### getActiveInvitesForOrg (lines 8-10)
Thin wrapper that delegates to the query layer's `getActiveInvites`. Filters by org_id, unexpired, unused. Exists to keep the route layer importing from services, not directly from queries — respects the DB encapsulation boundary.

### hashToken (line 12-14)
One-liner: SHA-256 hex digest of a raw string. Used in all three other exported functions.

### generateInvite (lines 12-24)
Creates 32 random bytes, hashes them, computes expiry (default 7 days), stores hash + metadata. Returns raw token + expiry. The caller builds the URL — service stays URL-agnostic.

### validateInviteToken (lines 26-43)
Hashes token, looks up via query layer (JOINs org), checks: exists -> not used -> not expired. Check order matters for UX — "already used" is more actionable than "expired" when both apply.

### redeemInvite (lines 45-59)
Checks existing membership, then branches. Existing: mark used, skip insert. New: add member first, mark used second. Order matters for crash recovery — membership before marking used means a crash leaves the invite "unused" but the user has access. Next attempt hits `alreadyMember`.

---

## Section 4: Complexity and trade-offs

Each function: 1-2 database queries. No transactions in `redeemInvite` — crash recovery handled by idempotency. Public validation endpoint protected by 256-bit token entropy + global rate limiter.

**How to say it in an interview:** "The redeem flow is intentionally not transactional — crash recovery is handled by the idempotency check. The 256-bit token space makes brute-force infeasible."

---

## Section 5: Patterns worth knowing

### Hash-before-store
Store hash, not secret. One-way. Database breach yields nothing usable.

**Interview-ready line:** "Hash-before-store converts a database breach from 'game over' to 'no useful data extracted.'"

### Idempotent operations
`redeemInvite` produces the same result on repeat calls. No duplicate memberships, no confusing errors.

**Interview-ready line:** "Idempotent design prevents user confusion and simplifies error handling."

### Typed error hierarchy
`NotFoundError` (404) and `ValidationError` (400) let the error handler translate domain errors to HTTP responses without conditionals.

**Interview-ready line:** "Typed errors let the error handler translate domain errors into HTTP responses without conditional logic."

---

## Section 6: Interview questions

### Q1: "Why not store the raw token?"
Strong answer: "A database breach or SQL injection would give attackers valid invite URLs if we stored raw tokens. With hashing, the data is useless. This is especially important because invite tokens grant org membership, which could expose sensitive business data."

Red flag answer: "Because it's best practice." — Explain the threat model, not the convention.

### Q2: "Two people click the same invite simultaneously?"
Strong answer: "For the same user: the `user_orgs` unique constraint prevents duplicate memberships. For different users: the first marks the invite used, the second fails at `validateInviteToken` because `usedAt` is set."

### Q3: "How would you add multi-use invites?"
Strong answer: "Add `max_uses` and `use_count` columns. Atomic conditional update. Separate `invite_redemptions` table for audit trail."

---

## Section 7: Data structures

### SHA-256
64-char hex output, one-way, collision-resistant. O(1) for 32-byte tokens.

### randomBytes(32)
256 bits of entropy. 2^256 possible tokens. Brute-force infeasible.

---

## Section 8: Impress the interviewer

### Operation ordering for crash recovery
In `redeemInvite`, membership creation happens before marking the invite used. A crash between them: invite stays "unused," user has membership. Next attempt hits `alreadyMember`. The reverse order would be worse — consumed invite with no membership.

How to bring it up: "I ordered operations so the most important side effect — membership — happens first. If we crash before marking the invite used, the worst case is the invite gets consumed on retry via the idempotency check."

### Token entropy
32 bytes = 256 bits = 2^256 possible tokens. Even at a million guesses per second, expected time to find a valid token exceeds the age of the universe.

How to bring it up: "Invite tokens have 256 bits of entropy — computationally infeasible to brute-force even with the validation endpoint exposed."
