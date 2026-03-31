---
file: admin.ts
purpose: Cross-org admin query functions for the platform admin dashboard
---

# Elevator Pitch

This file is the one place in the codebase where queries deliberately skip the `orgId` parameter. Every other query in `db/queries/` is scoped to a single org (fail-closed multi-tenancy). These four functions — `getAllOrgs`, `getAllUsers`, `getOrgDetail`, `getAdminStats` — aggregate data across all orgs so platform admins can see the full picture. Security lives at the route layer (`roleGuard('admin')`), not here.

# Why This Approach

The query functions are pure data access — no auth checks, no business logic. That's intentional. The middleware chain (`authMiddleware` → `roleGuard('admin')`) handles authorization before any route handler runs. By the time these functions execute, the caller is already verified as a platform admin.

The `getAllUsers` function uses a **two-query approach** instead of a single JOIN. Here's why: if you JOIN users → userOrgs → orgs, a user in 3 orgs produces 3 rows. You'd need GROUP BY with array aggregation (Postgres `array_agg`), which is vendor-specific and awkward in Drizzle. Instead, we fetch all users (query 1) and all memberships (query 2), then group memberships by `userId` using a Map. Cleaner, portable, and no cross-join blowup.

# Code Walkthrough

**`getAllOrgs()`** — LEFT JOINs `orgs` → `userOrgs` → `datasets` → `subscriptions`, then GROUP BY org fields. The `count(userOrgs.userId)` and `count(datasets.id)` give member and dataset counts. `subscriptions.plan` becomes `subscriptionTier`. LEFT JOINs are critical — an org with zero members or no subscription still appears.

**`getAllUsers()`** — Two separate queries. First grabs all users ordered by creation date. Second INNER JOINs `userOrgs` → `orgs` to get memberships (with org names). Then a `Map<userId, membership[]>` groups them. Each user gets an `orgs` array — empty if they have no memberships.

**`getOrgDetail(orgId)`** — Four parallel queries via `Promise.all`: the org itself, its members (users JOINed through userOrgs), its datasets, and its subscription. Returns `null` if the org doesn't exist. The caller (service layer) converts that null into a `NotFoundError`.

**`getAdminStats()`** — Three COUNT queries: total orgs, total users, pro subscribers (filtered by `subscriptions.plan = 'pro'`). These feed the stat cards at the top of the admin dashboard.

# Complexity and Trade-offs

The two-query pattern in `getAllUsers` trades one extra database round-trip for dramatically simpler code. At the scale this app targets (< 100 orgs, < 1000 users), the latency difference is negligible. If the platform grew to 10K+ users, you'd want pagination (Story 6.3 scope) rather than optimizing the join pattern.

`getOrgDetail` fires four queries in parallel. That's fine — they're all indexed lookups by `orgId`. The alternative (a single mega-query with multiple JOINs) would be harder to read and wouldn't meaningfully reduce latency since Postgres handles parallel simple queries well.

# Patterns Worth Knowing

- **Drizzle `sql` template literals** — Used for `sql<number>` casts on count expressions. Drizzle's type inference doesn't automatically narrow `count()` to number, so the explicit generic helps TypeScript.
- **Barrel export pattern** — `db/queries/index.ts` re-exports this module as `adminQueries`. Services always import from the barrel, never directly from `admin.ts`. This keeps the import boundary clean and makes it easy to mock in tests.
- **LEFT JOIN vs INNER JOIN** — LEFT JOINs in `getAllOrgs` ensure orgs with zero members still appear. INNER JOIN in `getAllUsers`'s membership query is correct because we only want actual memberships, not user rows with null org data.

# Interview Questions

**Q: Why not use a single JOIN query for getAllUsers?**
You: "A user in 3 orgs would produce 3 rows. You'd need array aggregation to collapse them back, which is vendor-specific and awkward in most ORMs. Two simple queries plus a Map-based grouping step is cleaner, more portable, and avoids the N-way cross-product problem. At this scale (< 1000 users), the extra round-trip is negligible."

**Q: Why don't these query functions check if the caller is an admin?**
You: "Separation of concerns. Authorization is a cross-cutting concern handled by middleware — `roleGuard('admin')` runs before the route handler even executes. The query layer is pure data access. This makes the queries testable without mocking auth, and ensures the auth boundary is consistent across all admin endpoints."

**Q: How would you add pagination?**
You: "Add `limit` and `offset` parameters, return a `{ rows, total }` shape. The `total` comes from a parallel COUNT query. For the admin org list, you'd also want a search/filter parameter. This is scoped to Story 6.3 — the current implementation is intentionally unpaginated for simplicity at small scale."

# Data Structures

- `AdminOrgRow` — `{ id, name, slug, memberCount, datasetCount, subscriptionTier, createdAt }` — flattened org with aggregated counts
- `AdminUserRow` — `{ id, email, name, isPlatformAdmin, createdAt, orgs: Array<{ orgId, orgName, role }> }` — user with nested org memberships
- Membership Map — `Map<number, { orgId, orgName, role }[]>` — intermediate grouping structure in `getAllUsers`

# Impress the Interviewer

The deliberate exception pattern here is worth calling out. Every other query in the codebase requires `orgId` — it's a fail-closed design. These admin queries are the one place that rule breaks, and the protection shifts to the route layer. In an interview, say: "We made the security boundary explicit. The query layer doesn't know about auth — that's middleware's job. But we documented the exception clearly, and the route mounting pattern (`protectedRouter.use('/admin', roleGuard('admin'), adminRouter)`) ensures no admin query can run without the guard."
