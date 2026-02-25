# orgs.ts (queries) — Interview-Ready Documentation

## Section 1: 30-Second Elevator Pitch

This file is the librarian for the organizations table. It handles three things: creating a new org, finding one by its URL slug, and finding one by its database ID. It's deliberately minimal — orgs are simple entities in this system, and the query layer reflects that.

**How to say it in an interview:** "This is the data access layer for organizations — three functions covering creation and lookup by slug or ID. It follows the same query encapsulation pattern as the other query modules, keeping all org database operations in one place."

---

## Section 2: Why This Approach?

### Decision 1: Slug-based lookup as the primary access pattern

**What's happening:** `findOrgBySlug` exists alongside `findOrgById` because slugs are how orgs appear in URLs (`/orgs/janes-org`). The slug lookup is the more interesting one — it's used during slug generation to check for collisions, and would be used in URL routing.

**How to say it in an interview:** "Orgs are accessed by slug in URLs and by ID internally. Both lookups hit unique indexes, so they're equally fast."

**Over alternative:** Using only numeric IDs in URLs works but creates ugly, non-memorable URLs and leaks database implementation details.

### Decision 2: Cross-org lookups documented as intentional

**What's happening:** Like the users module, these lookups don't filter by org_id. That sounds odd for a multi-tenant system, but the `orgs` table *is* the tenant entity itself — you can't scope the lookup of an org by org_id, that's circular.

**How to say it in an interview:** "Org lookups are inherently cross-tenant because the orgs table defines the tenants themselves. This is documented as an intentional exception to the org-scoping convention."

---

## Section 3: Code Walkthrough

### createOrg (lines 5-9)

Inserts a new org with `name` and `slug`. The `.returning()` gives us the created row with its auto-generated ID and timestamp. The `if (!org) throw` guard is a defensive pattern — Drizzle's `.returning()` should always return a row on successful insert, but TypeScript's types make the array element potentially undefined.

### findOrgBySlug (lines 12-16)

Looks up an org by its URL-friendly slug. Uses `findFirst` which maps to `SELECT * FROM orgs WHERE slug = ? LIMIT 1`. Returns `undefined` if not found. Used during OAuth registration to check for slug collisions.

### findOrgById (lines 19-23)

Same pattern but by primary key. Used in service-layer lookups where you already have the org ID (from a JWT claim, for example).

---

## Section 4: Complexity and Trade-offs

All three operations are O(log n) — slug has a unique index, id is the primary key. This file will stay simple unless org management grows (renaming, deleting, transferring ownership). At that point, more functions would be added here rather than scattering queries in services.

**How to say it in an interview:** "The org query module is intentionally minimal — CRUD for a simple entity. The encapsulation means any future org features (rename, delete, audit trail) get added here without touching service code."

---

## Section 5: Patterns and Concepts Worth Knowing

### Slug-Based Routing

Using human-readable URL identifiers (`janes-org`) instead of numeric IDs (`42`). Slugs must be unique, URL-safe, and stable. The unique index on `orgs.slug` enforces uniqueness at the database level.

**Where it appears:** `findOrgBySlug`.

**Interview-ready line:** "Slugs provide human-readable, bookmarkable URLs while the unique database index guarantees they're unambiguous identifiers."

---

## Section 6: Potential Interview Questions

### Q1: "What if an org needs to be renamed — should the slug change too?"

**Strong answer:** "It depends on the product decision. Changing slugs breaks existing bookmarks and shared links. A common pattern is to keep the old slug as an alias that redirects to the new one. The database would need a `slug_history` table or the slug stays immutable after creation."

**Red flag answer:** "Just update the slug column." — Ignores the impact on existing URLs, links, and integrations.

### Q2: "Why `.returning()` instead of a separate SELECT after insert?"

**Strong answer:** "`.returning()` gets the inserted row in the same database round-trip as the INSERT. A separate SELECT would require two queries and introduces a race condition — another process could modify the row between insert and select. PostgreSQL's RETURNING clause is atomic."

**Red flag answer:** "To avoid a second query." — Partially right but misses the atomicity argument.

---

## Section 7: Data Structures & Algorithms Used

No meaningful data structures beyond what Drizzle generates. The slug lookup uses a B-tree index (O(log n)). The primary key lookup uses the clustered index.

---

## Section 8: Impress the Interviewer

### Slug Uniqueness at the Database Level

**What's happening:** The unique constraint on `orgs.slug` means two orgs can never share a slug, even under concurrent creation. The slug generation function in `googleOAuth.ts` can safely retry with different slugs because the database constraint is the ultimate arbiter.

**How to bring it up:** "We enforce slug uniqueness at the database level, not in application code. This means even concurrent org creation can't produce duplicates — the database constraint handles the race condition that application-level checks can't."
