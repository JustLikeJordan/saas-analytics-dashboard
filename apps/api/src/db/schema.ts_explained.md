# schema.ts — interview-ready documentation

## Section 1: 30-second elevator pitch

Think of this file as the blueprint for a building. Before you pour concrete or run wires, you need a blueprint that shows every room, door, and connection. This file does exactly that for the database — it defines every table, every column, and every relationship between them, all in TypeScript code instead of raw SQL.

**How to say it in an interview:** "This is the Drizzle ORM schema that defines the entire data model — users, organizations, memberships, and refresh tokens. It's a schema-as-code approach, meaning the database structure lives in TypeScript and is the single source of truth for migrations, queries, and type inference."

---

## Section 2: Why this approach?

### Decision 1: Schema-as-code with Drizzle ORM instead of raw SQL migrations

What's happening: Instead of writing SQL like `CREATE TABLE users (...)` in separate migration files, you define your tables in TypeScript. Drizzle reads this code and generates the SQL for you. It's like writing a recipe in English instead of assembly instructions — same result, way more readable.

**How to say it in an interview:** "We use Drizzle's schema-as-code approach so the database structure is co-located with the application code, giving us type-safe queries and automatic migration generation from a single source of truth."

Over alternative: Raw SQL migrations are more explicit but disconnect the schema from the application. You end up maintaining types separately, which drifts over time.

### Decision 2: `generatedAlwaysAsIdentity()` for primary keys

What's happening: PostgreSQL has a few ways to auto-generate IDs. The older way (`SERIAL`) creates a hidden sequence. The newer way (`GENERATED ALWAYS AS IDENTITY`) is part of the SQL standard and gives you stricter guarantees — you literally can't accidentally insert your own ID value, which prevents a whole class of bugs.

**How to say it in an interview:** "We use IDENTITY columns over SERIAL because they're SQL-standard, prevent manual ID insertion which could cause sequence conflicts, and are the recommended approach in PostgreSQL 10+."

Over alternative: `SERIAL` still works fine but is a PostgreSQL-specific shortcut. UUIDs are another option but add storage overhead and make debugging harder when you're reading logs full of `a3f8c2d1-...` instead of `42`.

### Decision 3: Org-first multi-tenancy with a many-to-many join table

What's happening: Instead of each user belonging to exactly one organization, there's a separate `user_orgs` table that connects users to orgs. One user can belong to multiple orgs, and one org can have multiple users. It's like a school roster — a student can be in multiple clubs, and each club has multiple students. The roster (join table) tracks who's in what.

**How to say it in an interview:** "The data model uses org-first multi-tenancy with a many-to-many relationship through `user_orgs`. Every data table carries an `org_id` for tenant isolation, and the join table supports users belonging to multiple organizations with role-based access control."

Over alternative: A simpler `user.orgId` foreign key locks users to one org permanently. That's fine for some apps, but this SaaS needs to support consultants and partners who manage multiple businesses.

### Decision 4: Storing refresh token hashes, not raw values

What's happening: When a user logs in, they get a refresh token (a long random string). But we don't store that string directly — we store its SHA-256 hash. It's like a coat check: you get a ticket (the raw token), and the coat check has a record (the hash). If someone breaks into the coat check room, they can't use the records to claim your coat. If someone steals your database, the hashed tokens are useless.

**How to say it in an interview:** "Refresh tokens are stored as SHA-256 hashes. If the database is compromised, the attacker can't use the stored hashes to impersonate users — they'd need the original tokens, which only exist in the user's browser cookies."

Over alternative: Storing raw tokens means a database breach = full account takeover for every user. Hashing is a one-line change that eliminates that entire risk.

### Decision 5: Composite unique index on user_orgs

What's happening: The `uniqueIndex('user_orgs_unique_user_org').on(table.userId, table.orgId)` prevents the same user from being added to the same org twice. It's a database-level constraint — even if your application code has a bug, the database itself will reject the duplicate. Belt and suspenders.

**How to say it in an interview:** "We enforce the user-org uniqueness constraint at the database level with a composite unique index, not just in application code. Database constraints are the last line of defense against data integrity bugs."

Over alternative: Relying on application-level checks alone means a race condition (two requests at the same time) could create duplicate memberships.

---

## Section 3: Code walkthrough

### Block 1: Imports (lines 1-12)

Imports Drizzle's PostgreSQL column types and the `relations` helper. Each import maps to a PostgreSQL concept — `pgTable` creates a table, `varchar` maps to `VARCHAR`, `timestamp` to `TIMESTAMP WITH TIME ZONE`, etc.

### Block 2: Enum definition (line 14)

```ts
export const userRoleEnum = pgEnum('user_role', ['owner', 'member']);
```

Creates a PostgreSQL `ENUM` type with two values. This isn't a TypeScript enum — it's an actual database-level type that PostgreSQL enforces. If you try to insert `role = 'superadmin'`, the database rejects it.

### Block 3: Users table (lines 16-29)

The core user entity. Notable columns:
- `googleId` is nullable and unique — users authenticate via Google OAuth, but the column being nullable allows for future auth methods.
- `isPlatformAdmin` is a boolean that's separate from org roles. A user can be a regular member of an org but still have platform-wide admin powers. Two-dimensional RBAC.
- `updatedAt` exists on users but not orgs — users get profile updates, orgs don't change often.

### Block 4: Orgs table (lines 31-36)

Minimal by design — just name, slug, and timestamps. The slug is a URL-friendly identifier (`janes-org`) used in routes. It's unique, so no two orgs share a URL.

### Block 5: User-Orgs join table (lines 38-56)

The many-to-many bridge. The non-obvious part: it has three indexes. The composite unique index prevents duplicates. The two single-column indexes speed up lookups in both directions — "what orgs does this user belong to?" and "who's in this org?" Without these, both queries would require full table scans as the data grows.

`onDelete: 'cascade'` means deleting a user automatically removes all their memberships. No orphaned records.

### Block 6: Refresh tokens table (lines 58-74)

Stores hashed refresh tokens with expiration and revocation tracking. `revokedAt` being nullable is the clever part — a token starts as `null` (active) and gets timestamped when revoked. This is a soft-delete pattern that keeps an audit trail.

Only one index: on `userId`. The `tokenHash` column already has a unique constraint (which creates an implicit index), and lookups by hash are the hot path for token validation.

### Block 7: Relations (lines 76-108)

Drizzle relations are separate from foreign keys. Foreign keys enforce integrity at the database level. Relations tell Drizzle's query builder how to join tables when you write `db.query.users.findFirst({ with: { userOrgs: true } })`. They don't create database constraints — they're purely for the ORM's query API.

---

## Section 4: Complexity and trade-offs

Query performance: All lookups are indexed. Finding a user by email is O(log n) via the unique index (B-tree). The composite unique index on `user_orgs` covers the most common join pattern. This schema handles tens of thousands of orgs comfortably.

What breaks first under scale: The `user_orgs` table. In a system with millions of users across thousands of orgs, this join table grows multiplicatively. The indexes help, but very large join tables can slow down membership checks. At that point you'd add caching (Redis) or denormalize the "primary org" onto the users table.

Known limitations:
- No `updatedAt` on `orgs` — fine for now, but becomes an issue if org settings expand.
- The `revokedAt` soft-delete on refresh tokens means the table only grows. You'd eventually need a cleanup job to purge expired tokens.
- No Row Level Security (RLS) defined in this schema — tenant isolation is enforced in the query layer, not the database. This is a deliberate trade-off for simplicity at MVP scale.

**How to say it in an interview:** "The schema prioritizes correctness and simplicity for an MVP — database-level constraints for integrity, appropriate indexes for the expected query patterns, and a clean multi-tenant model. The main scale concern is the join table growth, which we'd address with caching before restructuring."

---

## Section 5: Patterns and concepts worth knowing

### Schema-as-code

A pattern where your database structure is defined in application code (TypeScript, Python, Ruby, etc.) rather than raw SQL files. The ORM generates migrations from the diff between your code and the actual database. It appears everywhere in this file — the entire file is the schema definition.

**Interview-ready line:** "Schema-as-code gives us type safety, automatic migration generation, and a single source of truth for both database structure and TypeScript types."

### Multi-tenancy (org-per-row)

A way to serve multiple customers from a single database by tagging every row with a tenant identifier (`org_id`). This is the "shared database, shared schema" approach — the simplest and most cost-effective for SaaS. Appears in `userOrgs`, `refreshTokens` (both carry `orgId`).

**Interview-ready line:** "We use row-level multi-tenancy with `org_id` on every tenant-scoped table, enforced through query-layer filtering rather than database-level RLS, which keeps the schema simple for MVP while supporting migration to RLS later."

### Referential integrity with cascading deletes

Foreign keys like `.references(() => users.id, { onDelete: 'cascade' })` tell the database: "if the parent row is deleted, automatically delete all child rows." This prevents orphaned data. Appears on every foreign key in the schema.

**Interview-ready line:** "Cascading deletes ensure data consistency automatically — deleting a user cleans up their memberships and tokens without requiring application-level cleanup code."

### Soft delete pattern

Instead of actually deleting a refresh token row, we set `revokedAt` to the current timestamp. The row stays for auditing. Queries filter on `isNull(revokedAt)` to find active tokens. Appears in the `refreshTokens` table.

**Interview-ready line:** "We use a soft-delete pattern for refresh tokens so we maintain an audit trail of all token activity, which matters for security forensics."

### IDENTITY columns (SQL standard PKs)

`generatedAlwaysAsIdentity()` is the modern PostgreSQL way to auto-increment primary keys. Unlike `SERIAL`, it's part of the SQL standard and prevents manual ID insertion. Appears on every table's `id` column.

**Interview-ready line:** "IDENTITY columns are SQL-standard and prevent accidental manual ID insertion that could cause sequence conflicts — they're the recommended replacement for SERIAL in PostgreSQL 10+."

---

## Section 6: Potential interview questions

### Q1: "Why use a join table instead of putting orgId directly on the users table?"

Context if you need it: This is testing whether you understand the trade-off between simplicity (one-to-many) and flexibility (many-to-many). In SaaS, a consultant might manage multiple client businesses.

Strong answer: "A direct `orgId` on users locks each user to a single organization. The join table supports users belonging to multiple orgs with different roles in each — a common SaaS requirement. It also cleanly separates the user identity from their organizational memberships."

Red flag answer: "Because that's how you do many-to-many relationships." — This restates the pattern without explaining *why* many-to-many was chosen over the simpler option for this specific use case.

### Q2: "What happens if you delete an org? Walk me through the cascade."

Context if you need it: The interviewer wants to see that you understand referential integrity and can trace through foreign key relationships.

Strong answer: "Deleting an org triggers cascading deletes on `user_orgs` (removing all memberships) and `refresh_tokens` (invalidating all sessions for that org). The users themselves survive because the cascade is on `user_orgs`, not `users`. So the user still exists but loses access to that org."

Red flag answer: "It deletes everything related to the org." — Too vague. The interviewer wants to hear you trace the specific foreign key chains.

### Q3: "Why store the token hash instead of the raw refresh token?"

Context if you need it: This is a security question. The interviewer wants to see that you think about database breach scenarios.

Strong answer: "If the database is compromised, hashed tokens are useless to the attacker — they can't reverse a SHA-256 hash to get the original token. The raw token only exists in the user's httpOnly cookie. It's the same principle as password hashing, applied to session tokens."

Red flag answer: "For encryption." — Hashing isn't encryption. Encryption is reversible; hashing isn't. This distinction matters in security discussions.

### Q4: "How would you add Row Level Security to this schema?"

Context if you need it: RLS is a PostgreSQL feature that automatically filters rows based on the current user's context. It moves tenant isolation from the application into the database itself.

Strong answer: "I'd add RLS policies on `user_orgs`, `refresh_tokens`, and future tables like `datasets`. Each policy would check that `org_id` matches the current session's org claim, set via `SET app.current_org_id` at the start of each request. The query layer already scopes by org, so RLS would be a defense-in-depth addition, not a replacement."

Red flag answer: "Just add `WHERE org_id = ?` to every query." — That's what we already do. RLS is about moving that check into the database so even raw SQL access is scoped.

### Q5: "Why are Drizzle relations separate from foreign keys?"

Context if you need it: This tests understanding of ORM internals. Many ORMs conflate these concepts.

Strong answer: "Foreign keys are database constraints — they enforce referential integrity at the PostgreSQL level. Drizzle relations are ORM metadata that tells the query builder how to construct JOINs for the `with` API. You need both: foreign keys for data integrity, relations for ergonomic queries."

Red flag answer: "They do the same thing." — They serve completely different purposes at different layers.

---

## Section 7: Data structures and algorithms used

### B-tree indexes (implicit via unique/index constraints)

What it is: A B-tree is like a phone book — data is sorted so you can quickly jump to the right section instead of reading every page. When you create a `unique()` or `index()` in PostgreSQL, it builds a B-tree behind the scenes.

Where it appears: Every `unique()` constraint (`users.email`, `users.googleId`, `orgs.slug`, `refreshTokens.tokenHash`) and every explicit `index()` creates a B-tree.

Why this one: B-trees handle equality lookups (`WHERE email = ?`) and range queries efficiently. Hash indexes are faster for pure equality but can't do ranges and have historically been less reliable in PostgreSQL.

Complexity in plain terms: Looking up a value in a B-tree takes O(log n) time — if you have a million rows, it takes about 20 comparisons instead of a million. This is why indexed lookups feel instant.

**How to say it in an interview:** "Every unique constraint and index creates a B-tree that gives us O(log n) lookups. The composite index on `user_orgs(userId, orgId)` covers the most common join pattern and doubles as a uniqueness constraint."

### Hash table (composite unique index lookup pattern)

What it is: The composite unique index on `(userId, orgId)` works like a lookup table keyed by a pair. Think of it as a spreadsheet where you look up a value using two columns together — "find me the row where userId=5 AND orgId=3."

Where it appears: `uniqueIndex('user_orgs_unique_user_org').on(table.userId, table.orgId)`

Why this one: A composite index handles multi-column lookups in a single index scan. Without it, PostgreSQL would need to scan one index, then filter the results — slower.

**How to say it in an interview:** "The composite index has dual purpose — it enforces the uniqueness constraint and optimizes the most common query pattern (looking up a specific user's membership in a specific org) in a single index scan."

---

## Section 8: Impress the interviewer

### Cascading deletes as a security feature

What's happening: When a user is deleted, `onDelete: 'cascade'` automatically removes their refresh tokens. This means you can't have "zombie sessions" — tokens that belong to deleted users still floating around in the database.

Why it matters: In a real production incident, if you need to ban a user, deleting their record immediately invalidates all their sessions without requiring a separate "revoke all tokens" step. Orphaned tokens are a common security bug in systems that don't cascade properly.

**How to bring it up:** "The cascading deletes aren't just for data cleanliness — they're a security measure. Deleting a user atomically invalidates all their sessions and memberships, which matters for incident response when you need to revoke access immediately."

### Two-dimensional RBAC

What's happening: Access control has two independent axes: `user_orgs.role` controls what you can do *within* an org (owner vs member), while `users.isPlatformAdmin` controls platform-wide powers. They're separate because a platform admin might be a regular member of a specific org.

Why it matters: Many junior devs put admin flags on the join table, which means a user could be admin of one org but not another. That's fine for some apps, but platform administration (managing billing, seeing all orgs) is a different concern from org-level permissions.

**How to bring it up:** "The RBAC is two-dimensional — org-level roles on the join table and a platform admin flag on the user. This separation means we can have a support engineer who can access any org's data for debugging without being an 'owner' of those orgs."

### Indexes match the access patterns

What's happening: The schema has indexes on `userOrgs.userId`, `userOrgs.orgId`, and the composite `(userId, orgId)`. These aren't random — they match the three most common queries: "what orgs does this user belong to?", "who's in this org?", and "is this user in this specific org?"

Why it matters: Missing indexes are the #1 cause of slow database queries in production. Adding them after the fact means downtime for large tables. Getting them right in the schema means the database performs well from day one.

**How to bring it up:** "Every index in the schema maps to a specific access pattern we know we'll need — membership lookups in both directions plus the composite for targeted queries. This is deliberate rather than adding indexes reactively after seeing slow queries in production."
