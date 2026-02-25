# invites.ts — interview-ready documentation

## Section 1: 30-second elevator pitch

This file defines two Express routers for invite links — one protected (requires auth + owner role) for creating invites, one public (no auth) for validating invite tokens. Think of it as a ticket booth with two windows: the back office where the manager creates tickets, and the front door scanner where anyone checks if their ticket is valid.

**How to say it in an interview:** "This is a split-router pattern — the protected POST route for invite creation sits behind authMiddleware and roleGuard, while the public GET route for token validation is mounted before auth. Zod validates both request bodies and URL params, and the service layer handles all business logic."

---

## Section 2: Why this approach?

### Decision 1: Two separate routers in one file

Instead of one router, we export `inviteRouter` (mounted under authMiddleware in `protected.ts`) and `publicInviteRouter` (mounted directly in `index.ts` before auth). Keeps invite-related routes together while respecting the auth boundary.

**How to say it in an interview:** "Splitting into two routers keeps all invite routes in one file for discoverability while mounting them at different points in the middleware chain."

### Decision 2: URL construction in the route handler

The route handler builds `${env.APP_URL}/invite/${token}`. The service just returns the raw token. This keeps the service URL-agnostic — if we added a CLI or mobile deep link, only the route handler changes.

---

## Section 3: Code walkthrough

### GET /invites (lines 14-20) — protected
Owner-only listing of active (unexpired, unused) invites. Delegates to `getActiveInvitesForOrg` with the JWT's `org_id`. Returns the raw array — the frontend uses it to show how many invites are outstanding.

### POST /invites (lines 23-42)
Owner-only route. Validates body with Zod (`createInviteSchema` — optional `expiresInDays` 1-30). Calls `generateInvite` with org_id, user_id, and optional expiry. Returns 201 with full invite URL, raw token, and expiry.

The non-obvious part: `parseInt(user.sub, 10)` converts the JWT subject (string) back to a number for the database.

### GET /invites/:token (lines 48-62)
Public route — no auth, because people clicking invite links haven't logged in yet. Validates URL param with Zod. Returns only org name and expiry — no internal identifiers exposed.

---

## Section 4: Complexity and trade-offs

Both routes are thin — validation + service call + response formatting. No direct database access. The `roleGuard('owner')` means only org owners can create invites — the "org member" in the acceptance criteria means "a person belonging to the org with the owner role."

**How to say it in an interview:** "Routes are thin wrappers — Zod validation, service delegation, response formatting. Business logic lives in the service layer."

---

## Section 5: Patterns worth knowing

### Split-router pattern
Two routers from one file, mounted at different middleware chain points. Feature cohesion without auth leakage.

**Interview-ready line:** "The split-router pattern keeps feature cohesion while respecting middleware boundaries."

### Zod validation at the boundary
Validate at the HTTP handler so the service layer can trust its inputs. `safeParse` returns a discriminated union instead of throwing.

**Interview-ready line:** "We validate at the system boundary so the service layer can trust its inputs."

---

## Section 6: Interview questions

### Q1: "Why is the validation endpoint public?"
"The invite flow starts with an unauthenticated user clicking a link. They need to see the org name before signing in. Making validation auth-required would force login before the user knows which org they're joining."

### Q2: "What prevents creating invites for other orgs?"
"Two layers: authMiddleware extracts org_id from the JWT, and the `generateInvite` call uses `user.org_id` from the token — not from the request body."

---

## Section 7: Data structures

Thin route layer — no notable algorithms. Zod schema validation is O(n) on schema fields, effectively constant.

---

## Section 8: Impress the interviewer

### Minimal data exposure on public endpoints
The public GET returns only `orgName` and `expiresAt` — not invite ID, org ID, or creator info. Public endpoints return the minimum needed for the UI.

How to bring it up: "Public endpoints return the minimum data for the UI to function. Internal identifiers stay server-side."
