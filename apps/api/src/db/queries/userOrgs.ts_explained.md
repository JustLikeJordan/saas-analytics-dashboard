# userOrgs.ts (queries) — Interview-Ready Documentation

## Section 1: 30-Second Elevator Pitch

This file manages the "membership roster" — the join table that connects users to organizations. It handles adding someone to an org, checking if they're already a member, listing all of a user's orgs, and listing all members of an org. It's the many-to-many bridge that makes multi-tenant RBAC work.

**How to say it in an interview:** "This is the data access layer for the user-org membership join table. It encapsulates all membership operations — creating memberships, checking existence, and querying in both directions (user's orgs and org's members) with eager-loaded relations."

---

## Section 2: Why This Approach?

### Decision 1: Bidirectional queries with eager-loaded relations

**What's happening:** `getUserOrgs` returns all orgs for a user *with the org data included* (`with: { org: true }`). `getOrgMembers` returns all members of an org *with the user data included* (`with: { user: true }`). This is called "eager loading" — instead of getting IDs and then making separate queries for the related data, Drizzle JOINs everything in one query.

**How to say it in an interview:** "We use Drizzle's relational queries with eager loading to fetch memberships with their associated org or user data in a single database round-trip, avoiding the N+1 query problem."

**Over alternative:** Without eager loading, you'd get a list of membership records, then query each org/user individually — the classic "N+1 problem" that kills database performance.

### Decision 2: Default role of 'member' with explicit 'owner' override

**What's happening:** `addMember` defaults to the `'member'` role unless you explicitly pass `'owner'`. This means the common case (adding a regular team member) requires less code, while the uncommon case (making someone an owner) is still supported.

**How to say it in an interview:** "The default role is 'member' to follow the principle of least privilege. Owner status must be explicitly granted, which prevents accidental privilege escalation."

---

## Section 3: Code Walkthrough

### addMember (lines 5-16)

Creates a membership record linking a user to an org with a role. The composite unique index on `(userId, orgId)` in the schema prevents duplicate memberships — if you try to add the same user twice, PostgreSQL rejects it.

### findMembership (lines 18-22)

Checks if a specific user belongs to a specific org. Uses `and()` to combine two equality conditions. Returns the membership record or `undefined`. Used for authorization checks: "is this user allowed to access this org?"

### getUserOrgs (lines 25-30)

Returns all org memberships for a user with the full org data eager-loaded. Flagged as a cross-org lookup (intentional exception) because it queries across all orgs for a single user — needed during login to determine which org to log them into.

### getOrgMembers (lines 32-37)

The inverse — returns all members of an org with user data. This one is org-scoped (you pass the orgId), so it's not a cross-org exception. Used for member management features.

---

## Section 4: Complexity and Trade-offs

**`getUserOrgs` and `getOrgMembers` are unbounded** — they return ALL memberships for a user or org. If a user belongs to 1,000 orgs or an org has 10,000 members, this returns everything. Fine for MVP scale (most users have 1-3 orgs, most orgs have < 50 members), but needs pagination for scale.

**No role-change function.** Updating a membership role (promoting member to owner) would need a new function here. It's not built because it's not needed yet — YAGNI.

**How to say it in an interview:** "The queries are unbounded, which is fine for expected scale. I'd add cursor-based pagination before the membership tables grow large enough to impact performance."

---

## Section 5: Patterns and Concepts Worth Knowing

### Join Table / Association Table

A table that exists solely to connect two other tables in a many-to-many relationship. It has no "own" data beyond the foreign keys and metadata (like `role` and `joinedAt`). Think of it as a roster that records which students are in which classes.

**Where it appears:** The entire `user_orgs` table and this query module.

**Interview-ready line:** "The join table with role metadata turns a simple many-to-many into an access control list — each row is both a relationship and a permission grant."

### Eager Loading (with: { org: true })

Instead of loading related data in separate queries, the ORM includes it in the initial query via a JOIN. This solves the N+1 problem where you'd otherwise make 1 query for memberships + N queries for each related org.

**Where it appears:** `getUserOrgs` and `getOrgMembers`.

**Interview-ready line:** "We eager-load related data to avoid N+1 queries. A user with 5 org memberships gets resolved in a single JOINed query rather than 6 separate ones."

---

## Section 6: Potential Interview Questions

### Q1: "What's the N+1 query problem and how does this code avoid it?"

**Strong answer:** "If I fetch 10 memberships and then load each org separately, that's 1 + 10 = 11 queries. With `with: { org: true }`, Drizzle joins the org data in the original query — 1 query total. The N+1 problem is the most common performance issue in ORM-based applications."

**Red flag answer:** "We use eager loading because it's faster." — Correct but doesn't explain the problem being solved.

### Q2: "What happens if addMember is called twice for the same user and org?"

**Strong answer:** "The composite unique index on `(userId, orgId)` causes PostgreSQL to reject the duplicate with a constraint violation. The error propagates through Express 5 to the error handler, which returns a 400-level response. We rely on the database constraint rather than checking first, which is both simpler and race-condition-proof."

**Red flag answer:** "It creates a duplicate membership." — No, the unique index prevents this.

### Q3: "How would you add pagination to getOrgMembers?"

**Strong answer:** "I'd use cursor-based pagination keyed on `userOrgs.id` — pass `after: lastSeenId` and add `where id > lastSeenId` with a `LIMIT`. Cursor pagination is more stable than offset pagination for tables with frequent inserts, because new rows don't shift page boundaries."

**Red flag answer:** "Add LIMIT and OFFSET." — Offset pagination breaks when data changes between pages.

---

## Section 7: Data Structures & Algorithms Used

The composite unique index on `(userId, orgId)` functions as a compound key in a B-tree, enabling O(log n) lookups for specific user-org pairs. The `and()` condition in `findMembership` compiles to `WHERE user_id = ? AND org_id = ?`, which is a single B-tree scan on the composite index.

---

## Section 8: Impress the Interviewer

### The Join Table Is an Access Control List

**What's happening:** `user_orgs` isn't just a relationship table — it's an ACL (Access Control List). The `role` column on each membership record determines what that user can do within that org. This is more flexible than a global role because the same user can be an owner in one org and a member in another.

**How to bring it up:** "The join table doubles as an access control list — each row is both a relationship and a permission grant. A user can have different roles in different orgs, which supports real-world scenarios like a consultant managing multiple client organizations."
