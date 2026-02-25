# orgInvites.ts — interview-ready documentation

## Section 1: 30-second elevator pitch

This is the data access layer for invite links — four functions mapping to CRUD operations on the `org_invites` table. Think of it as the filing cabinet clerk: create a new invite file, find one by reference number, stamp "USED" on one, or pull all active files for an org. The service layer says what to do; the clerk doesn't make business decisions.

**How to say it in an interview:** "This is the query module for org invites using Drizzle ORM. It encapsulates all database access behind named functions, so the service layer never writes raw queries. The relational query API handles JOINs declaratively."

---

## Section 2: Why this approach?

### Decision 1: Query module pattern (barrel exports)

Each table gets its own query module exported through a barrel file. Services import from the barrel, never from the db instance directly. Schema changes are isolated to one file per table.

**How to say it in an interview:** "Query modules create a data access layer — services depend on named functions, not raw ORM calls. Both layers are independently testable."

### Decision 2: Drizzle relational queries for JOINs

`findByTokenHash` uses `db.query.orgInvites.findFirst({ with: { org: true } })` instead of manual JOIN SQL. Relationships defined once in schema, query builder generates the SQL.

---

## Section 3: Code walkthrough

### createInvite (lines 5-17)
Insert with `.returning()` (Postgres-specific). Safety check for empty returning array.

### findByTokenHash (lines 19-24)
Lookup by hashed token, includes related org via Drizzle relational query. Returns `undefined` if no match.

### markUsed (lines 26-33)
Stamps `usedAt` (current timestamp) and `usedBy` (redeemer). Returns updated row.

### getActiveInvites (lines 35-43)
All non-used, non-expired invites for an org. Composes three conditions with `and()`: org_id match, null `usedAt`, future `expiresAt`. Ready for the owner's invite management UI.

---

## Section 4: Complexity and trade-offs

Every function is a single query — O(1) in application logic, O(log n) in DB via indexed lookups. `token_hash` has a unique index, `org_id` has a regular index. No pagination on `getActiveInvites` — acceptable for MVP volume.

---

## Section 5: Patterns worth knowing

### Returning clause (Postgres)
`RETURNING` gets the inserted/updated row back in the same round-trip. No separate SELECT needed.

**Interview-ready line:** "RETURNING eliminates a round-trip — we get the row back in the same query."

---

## Section 6: Interview questions

### Q1: "Why separate query modules instead of queries in the service?"
"Separation of concerns. Service handles business logic, query layer handles data access. Both independently testable — service tests mock queries, query tests can run against a test database."

---

## Section 7: Data structures

Standard indexed database queries via ORM. Drizzle generates parameterized SQL, preventing SQL injection by construction.

---

## Section 8: Impress the interviewer

### getActiveInvites as forward-thinking without over-engineering
This function isn't used yet — no UI consumes it. But it's a natural query the invite management page will need, and it took 8 lines while the schema context was fresh. The epic includes invite management, so this isn't speculative.

How to bring it up: "I added getActiveInvites preemptively because the query was trivial and the schema context was fresh — the UI for it is in the same epic."
