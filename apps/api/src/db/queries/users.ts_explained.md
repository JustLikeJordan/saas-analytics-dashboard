# users.ts (queries) — interview-ready documentation

## Section 1: 30-second elevator pitch

This file is the only way the rest of the application talks to the `users` table. Instead of scattering SQL queries throughout controllers and services, all user database operations live here — finding users by email, Google ID, or primary key, and creating or updating them. It's like having a dedicated librarian for the users table: you ask the librarian for what you need, and they know exactly how to find it.

**How to say it in an interview:** "This is the data access layer for the users table — a query module that encapsulates all user-related database operations. Services call these functions instead of accessing the database directly, which centralizes query logic and makes it testable in isolation."

---

## Section 2: Why this approach?

### Decision 1: Query encapsulation (services never touch the DB directly)

What's happening: The codebase has a rule: services import from `db/queries/`, never from `db/index.ts`. This means if you want to change how users are queried — add caching, switch ORMs, optimize a query — you change one file and nothing else breaks.

**How to say it in an interview:** "We use a query layer that encapsulates all database access. Services depend on query functions, not the ORM directly. This gives us a single place to modify queries, add caching, or swap the data layer without touching business logic."

Over alternative: Inline queries in services work fine for small apps but create coupling — changing the ORM means rewriting every service.

### Decision 2: Cross-org lookups documented as intentional exceptions

What's happening: The JSDoc comments (`/** Cross-org lookup — ... */`) flag that these functions don't filter by `org_id`. Most queries in this app scope to an org for tenant isolation. Users are the exception — during auth flows, you need to find a user by email or Google ID regardless of which org they belong to. The comments prevent a future developer from "fixing" the missing org filter.

**How to say it in an interview:** "User lookups are intentionally cross-org because they're used in authentication flows where the org isn't known yet. The JSDoc comments document this as a deliberate exception to the org-scoping convention, not an oversight."

Over alternative: Requiring an org_id for user lookups would break the login flow — you don't know the user's org until after you find them.

### Decision 3: `.returning()` with destructured first element

What's happening: Drizzle's `.insert().returning()` returns an array (you could insert multiple rows). Since we always insert one user, we destructure the first element: `const [user] = await db.insert(...).returning()`. The `if (!user) throw` guard handles the theoretically-impossible case where the insert succeeds but returns nothing.

**How to say it in an interview:** "We use Drizzle's `.returning()` to get the inserted row back in a single round-trip instead of a separate SELECT. The destructured first element and null check is a defensive pattern for type safety."

Over alternative: INSERT then SELECT by ID requires two queries. `.returning()` does it in one, and PostgreSQL guarantees it returns the inserted row.

---

## Section 3: Code walkthrough

### findUserByEmail, findUserByGoogleId, findUserById (lines 6-24)

Three lookup functions using Drizzle's `query.users.findFirst()`. Each takes a single identifier and returns the first matching user (or `undefined`). `findFirst` translates to `SELECT * FROM users WHERE ... LIMIT 1`. All three are cross-org lookups used during authentication.

### createUser (lines 26-43)

Inserts a new user with required fields (`email`, `name`, `googleId`) and an optional `avatarUrl` (defaulting to `null`). The `?? null` on avatarUrl handles the case where `undefined` is passed — Drizzle distinguishes between `null` (set to NULL) and `undefined` (use default).

### updateUser (lines 45-55)

Updates a user by ID with partial data (only the fields you pass get changed). Sets `updatedAt` to the current timestamp on every update. Returns the updated user via `.returning()`.

---

## Section 4: Complexity and trade-offs

All lookups are O(log n) thanks to the unique indexes on `email`, `googleId`, and the primary key `id`. Even with millions of users, these queries return in under a millisecond.

No pagination or batch operations. This is fine for auth flows (you always look up one user at a time) but would need expansion for admin features like "list all users."

The `updatedAt` is set in application code, not a database trigger. This means direct database updates (via psql or a migration) won't update the timestamp. Acceptable trade-off for simplicity.

**How to say it in an interview:** "All lookups hit unique indexes, so they're O(log n) regardless of table size. The trade-off is no batch operations, which is fine for auth but would need expansion for admin features."

---

## Section 5: Patterns and concepts worth knowing

### Repository / data access pattern

A layer that sits between your business logic and the database. All queries for a specific entity live in one place. The rest of the app doesn't know or care how data is fetched — it just calls functions.

Where it appears: This entire file — it's the "user repository."

**Interview-ready line:** "The query module is a repository layer, decoupling business logic from the ORM. Services call `findUserByEmail()` without knowing or caring whether that's Drizzle, raw SQL, or an API call."

### Null coalescing (`?? null`)

The `??` operator returns the right-hand side when the left-hand side is `null` or `undefined`. `avatarUrl ?? null` normalizes `undefined` (which TypeScript allows for optional parameters) to `null` (which the database column expects).

Where it appears: `createUser` — `avatarUrl: data.avatarUrl ?? null`.

**Interview-ready line:** "We use null coalescing to normalize optional parameters to explicit nulls for the database, since Drizzle treats `undefined` differently from `null` in insert values."

---

## Section 6: Potential interview questions

### Q1: "Why is there no org_id parameter on these lookups?"

Strong answer: "User lookups happen during authentication, before the org context is established. You need to find the user by email or Google ID to determine which org they belong to. The cross-org nature is documented as an intentional exception."

Red flag answer: "We just forgot to add it." — The JSDoc comments explicitly document this as intentional.

### Q2: "What happens if createUser is called with a duplicate email?"

Strong answer: "PostgreSQL's unique constraint on `users.email` throws a constraint violation error. The error handler middleware catches it and returns a 400-level response. We don't check for duplicates first — that would be a race condition. The database constraint is the only reliable way to enforce uniqueness."

Red flag answer: "We should check first with findUserByEmail." — Check-then-insert is a classic race condition. Two requests can both pass the check and then one fails on insert.

### Q3: "How would you add caching to user lookups?"

Strong answer: "I'd add a Redis cache in this query module — check cache first, fall back to database, populate cache on miss. Cache key would be `user:${id}` or `user:email:${email}`. Invalidate on `updateUser` and `createUser`. Since this is the only place user queries happen, the caching logic is contained in one file."

Red flag answer: "Cache at the route level." — Caching at the wrong layer means you cache responses, not data, which is harder to invalidate correctly.

---

## Section 7: Data structures and algorithms used

This file primarily uses Drizzle's query builder to generate SQL. The underlying database operations use B-tree index lookups (O(log n)) for all finds and hash-based equality checks for the unique constraints. No application-level data structures beyond the basic object destructuring.

---

## Section 8: Impress the interviewer

### Query encapsulation enables zero-downtime ORM migration

What's happening: All user queries go through these 5 functions. If you ever needed to switch from Drizzle to Prisma, Knex, or raw SQL, you'd rewrite this one file. Every service continues calling `findUserByEmail()` unchanged.

Why it matters: ORM migrations are expensive refactors in most codebases because queries are scattered everywhere. This encapsulation makes it a contained task.

**How to bring it up:** "The query layer isn't just organization — it's a migration strategy. All database access for users goes through these 5 functions, so swapping the ORM or adding caching is a single-file change with zero impact on business logic."
