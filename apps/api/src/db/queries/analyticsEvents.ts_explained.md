# analyticsEvents.ts — Interview Companion Doc

## 1. 30-Second Elevator Pitch

This file is the data access layer for analytics events in a multi-tenant SaaS app. Two functions: one writes an event row (insert), one reads events for an org (paginated query). It sits between the service layer and the database, so services never write raw SQL or touch Drizzle directly. The service layer calls `recordEvent` through a fire-and-forget wrapper that swallows errors — because a failed analytics insert should never break a user's upload or login.

**How to say it in an interview:** "This is the repository layer for analytics events. It encapsulates database access behind typed functions so the rest of the app doesn't couple to the ORM or the table structure."

---

## 2. Why This Approach?

**Why a separate query module instead of inline DB calls?**

The project enforces an import boundary: services import from the `db/queries/` barrel export, never from `db/index.ts` directly. This means if you swap Drizzle for Prisma, or restructure the schema, you only change query modules — not every service that records an event.

**Why not a class?**

Plain exported functions are simpler here. There's no shared state between `recordEvent` and `getEventsByOrg`, so wrapping them in a class would add ceremony with no benefit. The `db` connection is a module-level singleton imported from `../../lib/db.js`.

**Why `.returning()` on the insert?**

Postgres supports `RETURNING *`, which gives you the inserted row back in one round trip instead of doing INSERT + SELECT. The destructured `[event]` grabs the first (only) element. The guard `if (!event)` is a safety net — if Drizzle's `.returning()` ever returned an empty array for some reason, you'd get a clear error instead of `undefined` propagating.

**Why `metadata ?? null` instead of just `metadata`?**

When `metadata` is `undefined` (caller didn't pass it), you want to store `NULL` in the JSONB column, not accidentally store a stringified `undefined` or have Drizzle omit the column. Explicit `null` is the right move.

---

## 3. Code Walkthrough

### Imports (line 1-4)

```typescript
import { eq, desc } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { analyticsEvents } from '../schema.js';
import type { AnalyticsEventName } from 'shared/constants';
```

Four imports, each from a different layer. `eq` and `desc` are Drizzle's SQL builder functions — think of them as type-safe equivalents of `WHERE org_id = $1` and `ORDER BY created_at DESC`. The `db` object is the Drizzle client (wraps a Postgres connection pool). `analyticsEvents` is the table definition from the schema file. The `AnalyticsEventName` type is a union of all valid event name strings (like `'dataset.uploaded' | 'user.signed_in' | ...`), derived from the shared constants — this enforces that only known event names can reach the database.

### recordEvent (lines 6-18)

```typescript
export async function recordEvent(
  orgId: number,
  userId: number,
  eventName: AnalyticsEventName,
  metadata?: Record<string, unknown>,
) {
  const [event] = await db
    .insert(analyticsEvents)
    .values({ orgId, userId, eventName, metadata: metadata ?? null })
    .returning();
  if (!event) throw new Error('Insert failed to return analytics event');
  return event;
}
```

This builds and executes something like:

```sql
INSERT INTO analytics_events (org_id, user_id, event_name, metadata)
VALUES ($1, $2, $3, $4)
RETURNING *;
```

The array destructure `[event]` works because `.returning()` always gives back an array, and a single insert produces a single-element array. The caller (the `trackEvent` service) wraps this in `.catch()`, so if the insert fails, the error gets logged but never thrown to the user.

**What's happening:** Type-safe insert with Postgres `RETURNING`.
**How to say it:** "It uses the builder pattern to construct a parameterized INSERT with RETURNING, avoiding SQL injection while getting the inserted row back in one database round trip."

### GetEventsOpts (lines 19-22)

```typescript
interface GetEventsOpts {
  limit?: number;
  offset?: number;
}
```

A local interface — not exported because no one outside this module needs it. Both fields are optional so callers can do `getEventsByOrg(orgId)` without passing an empty object (though the default parameter `opts = {}` handles that too).

### getEventsByOrg (lines 24-33)

```typescript
export async function getEventsByOrg(orgId: number, opts: GetEventsOpts = {}) {
  const { limit = 50, offset = 0 } = opts;

  return db.query.analyticsEvents.findMany({
    where: eq(analyticsEvents.orgId, orgId),
    orderBy: desc(analyticsEvents.createdAt),
    limit,
    offset,
  });
}
```

This uses Drizzle's *relational query API* (`db.query.analyticsEvents.findMany`) rather than the SQL builder API (`db.select().from()`). The relational API reads more like Prisma — you pass an object with `where`, `orderBy`, `limit`, `offset`. Under the hood it generates:

```sql
SELECT * FROM analytics_events
WHERE org_id = $1
ORDER BY created_at DESC
LIMIT 50 OFFSET 0;
```

Default limit of 50 prevents unbounded queries. The `orgId` filter is the application-level tenant isolation — every query in this codebase filters by `org_id`, and Postgres RLS policies back it up at the database level.

**What's happening:** Paginated read scoped to one tenant.
**How to say it:** "Offset-based pagination with a default page size, scoped to a single tenant by org_id. The database also enforces row-level security as a second layer of isolation."

---

## 4. Complexity and Trade-offs

**Time complexity:** Both functions are O(1) from the application's perspective — a single parameterized query each. The database work depends on indexes: the `idx_analytics_events_org_id` index makes the WHERE filter on `org_id` a B-tree lookup, and `idx_analytics_events_created_at` helps the ORDER BY. With both indexes, `getEventsByOrg` is efficient even at millions of rows.

**Offset pagination vs. cursor pagination:** This file uses offset pagination (LIMIT/OFFSET). It's simpler and fine for internal analytics views where you're unlikely to page past a few hundred events. The trade-off: offset pagination gets slower at high offsets because Postgres has to skip rows. If this table grew to hundreds of millions of rows and users paged deep, you'd want cursor-based pagination (WHERE created_at < $last_seen). For this use case, offset is the right call.

**No transaction:** `recordEvent` is a single INSERT, so no transaction is needed. If you ever need to insert an event alongside another write atomically, you'd pass a transaction object (`tx`) instead of using the module-level `db`.

**Error handling philosophy:** `recordEvent` throws on failure, but its caller (`trackEvent`) catches everything. This separation is intentional — the query layer reports errors honestly, the service layer decides the policy (here: swallow and log).

---

## 5. Patterns and Concepts Worth Knowing

**Repository / Data Access Layer pattern.** This file is a thin repository: it wraps database operations behind named functions with typed signatures. The rest of the app doesn't know (or care) that Drizzle is the ORM. If you've heard "repository pattern" in interviews, this is a lightweight version of it — no interface/class hierarchy, just functions behind a barrel export.

**Barrel exports.** The `db/queries/index.ts` file re-exports all query modules as namespaced objects (`analyticsEventsQueries`, `usersQueries`, etc.). This gives you a single import point and makes it easy to enforce the import boundary rule: services import from the barrel, never from the ORM directly.

**Nullish coalescing (`??`).** `metadata ?? null` converts `undefined` to `null`. The `??` operator only triggers on `null` or `undefined`, unlike `||` which would also trigger on `0`, `""`, or `false`. Small distinction, but it matters when your metadata could legitimately be `0` or an empty string (though for a JSONB column, it's always an object or null).

**Builder pattern.** `db.insert(table).values({...}).returning()` is method chaining — each call returns an object with more methods. The final `.returning()` triggers execution (via `await`). You see this in ORMs, HTTP clients (like Axios), and query builders everywhere.

**Multi-tenant filtering.** Every query includes `orgId` in its WHERE clause. This is the application-level half of tenant isolation. The database-level half is Postgres RLS (Row-Level Security), which acts as a safety net if application code ever has a bug.

---

## 6. Potential Interview Questions

### Q1: "Why use `.returning()` instead of just doing the insert?"

**Strong answer:** "Postgres `RETURNING` gives back the inserted row in the same round trip as the INSERT. Without it, you'd need a second SELECT query to get the auto-generated `id` and `created_at` values. It's one database call instead of two, and it guarantees you get the exact row that was inserted, avoiding race conditions with concurrent inserts."

**Red flag:** "I'd just query by the event name after inserting." — That's a race condition in a concurrent system and an unnecessary extra query.

### Q2: "What happens if the insert fails?"

**Strong answer:** "The `recordEvent` function throws, which is correct — the query layer should report failures honestly. The calling service (`trackEvent`) catches the error, logs it with structured context (org ID, user ID, event name), and doesn't re-throw. Analytics is fire-and-forget, so a failed event insert never blocks the user's action."

**Red flag:** "I'd add a try/catch inside `recordEvent`." — That would hide errors from callers who *do* want to know about failures. Error handling policy belongs in the service layer, not the data access layer.

### Q3: "Why offset pagination here? When would you switch to cursor-based?"

**Strong answer:** "Offset is simpler and works well when the dataset is moderate and users rarely page deep. The downside is that `OFFSET N` makes Postgres skip N rows, which gets expensive at high offsets. I'd switch to cursor pagination (using `WHERE created_at < $last_seen_timestamp ORDER BY created_at DESC LIMIT 50`) if the table had millions of rows and users needed to page far back."

**Red flag:** "Offset pagination is always fine." — Shows no awareness of the performance cliff at high offsets.

### Q4: "How does multi-tenancy work here?"

**Strong answer:** "Two layers. First, every query filters by `org_id` at the application level — you can see it in the `where: eq(analyticsEvents.orgId, orgId)` clause. Second, Postgres RLS policies enforce tenant isolation at the database level as a safety net, so even if application code has a bug and omits the filter, one org can't see another org's data."

**Red flag:** "We just filter by org_id in the WHERE clause." — Missing the RLS layer means missing the defense-in-depth concept.

### Q5: "Why is `GetEventsOpts` not exported?"

**Strong answer:** "It's only used by `getEventsByOrg` within this module. Exporting it would widen the module's public API for no reason. If another module needed pagination options, it should define its own — coupling to this interface would create a dependency on an unrelated query module."

**Red flag:** "I'd export everything just in case." — Over-exporting is how you end up with spaghetti dependencies.

---

## 7. Data Structures & Algorithms Used

**B-tree indexes.** The `analytics_events` table has indexes on `org_id`, `event_name`, and `created_at`. Postgres uses B-tree indexes by default — these give O(log n) lookups for equality and range queries. The `getEventsByOrg` function benefits from the `org_id` index (WHERE) and the `created_at` index (ORDER BY).

**JSONB column.** The `metadata` field is Postgres JSONB — binary JSON stored in a format that supports indexing and querying. It lets you attach arbitrary context to events (like `{ "fileSize": 1024, "rowCount": 500 }` for a `dataset.uploaded` event) without adding new columns every time you track a new event type. Trade-off: no schema enforcement on the JSONB contents, so you rely on application-level validation.

**Array destructuring from single-row result.** `const [event] = await db.insert(...).returning()` — the `RETURNING` clause always produces an array. Destructuring the first element is the standard pattern when you know exactly one row was inserted.

---

## 8. Impress the Interviewer

If you're discussing this code in an interview, here are a few things that show depth:

**"The error boundary is at the right layer."** Point out that `recordEvent` throws but `trackEvent` catches. The data access layer doesn't decide policy — it just reports. The service layer decides that analytics failures are non-fatal. This separation means you could reuse `recordEvent` in a context where failures *are* fatal (like a billing event) without changing the query code.

**"Defense in depth for multi-tenancy."** Mention that `org_id` filtering at the application level is backed by Postgres RLS at the database level. Two independent layers of isolation means a single bug can't leak data across tenants.

**"I'd know when to evolve this."** If someone asks about scaling: "Right now offset pagination and synchronous inserts are fine. If event volume grew significantly, I'd consider cursor pagination for reads and a write-ahead buffer (like a Redis list or a message queue) for writes to absorb burst traffic without hitting Postgres directly." Showing that you know the current approach's limits — and that you wouldn't over-engineer before hitting them — is exactly the maturity interviewers look for.
