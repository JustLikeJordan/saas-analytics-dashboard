# rls.ts — Explained

## 1. 30-Second Elevator Pitch

This 19-line module is the enforcement point for PostgreSQL Row-Level Security in a multi-tenant SaaS app. Every tenant-scoped database operation passes through `withRlsContext`, which opens a transaction and sets two session variables — `app.current_org_id` and `app.is_admin` — before running the actual query. PostgreSQL's RLS policies then filter rows automatically, so even if application code has a bug that forgets a `WHERE org_id = ?`, the database itself refuses to return data belonging to another organization. If either SET LOCAL fails, the transaction aborts and no query runs — fail-closed by design.

**How to say it in an interview:**
"withRlsContext wraps every tenant query in a transaction that sets PostgreSQL session variables. RLS policies on every table read those variables to enforce row-level isolation. It's defense-in-depth — even if application code has an org_id filtering bug, the database layer catches it."

---

## 2. Why This Approach?

### Decision 1: SET LOCAL instead of SET (session-scoped)

**What's happening:** `SET LOCAL app.current_org_id = '42'` sets a PostgreSQL configuration variable that lives only for the duration of the current transaction. When the transaction commits or rolls back, the variable vanishes.

**Why it matters:** The alternative — plain `SET` — sets the variable for the entire database session (the connection). Since we use a connection pool that shares connections across requests, a plain SET from request A would still be in effect when request B borrows that same connection. That's a catastrophic multi-tenant data leak. SET LOCAL scopes the variable to the transaction, so when request A's transaction ends, the variable is automatically cleaned up before any other request can use that connection. No manual cleanup, no race conditions, no leaks.

**How to say it in an interview:**
"SET LOCAL scopes to the transaction, not the session. Since we pool connections, a session-scoped SET would leak org context between requests. Transaction scope gives us automatic cleanup — when the transaction ends, the variable is gone."

### Decision 2: Fail-closed error handling

**What's happening:** If either `SET LOCAL` statement throws an error, the transaction aborts and the error propagates to the caller. The callback function `fn` never executes.

**Why it matters:** The opposite design — fail-open — would silently ignore the SET LOCAL failure and run the query without RLS context. In that scenario, PostgreSQL's `current_setting('app.current_org_id', true)` returns NULL (the `true` parameter means "return NULL instead of erroring when the variable isn't set"), and RLS policies that compare `org_id = NULL` would match zero rows. So fail-open means "return nothing" rather than "return everything," which sounds safe — but it masks a real infrastructure problem. If SET LOCAL is failing, something is fundamentally broken with the database connection, and you want to know about it immediately, not silently serve empty responses.

**How to say it in an interview:**
"We fail closed — if SET LOCAL throws, the query never runs and the error propagates. Even though our RLS policies return empty results for unset variables rather than all rows, silently serving empty data masks real infrastructure failures. Explicit errors are better than silent data loss."

### Decision 3: Query-level wrapper, not Express middleware

**What's happening:** `withRlsContext` is a function you call explicitly at the service or route level, not an Express middleware that runs automatically on every request.

**Why it matters:** Not every database call needs RLS context. Admin queries (`dbAdmin`) bypass RLS entirely. Fire-and-forget analytics tracking uses `dbAdmin` and shouldn't block on a transaction. Public routes (shared link viewer, health check) don't have a logged-in user. Making RLS a middleware would mean either (a) wrapping every request — wasting a transaction on routes that don't need one, or (b) building an exclusion list that grows with every new route. An explicit wrapper keeps the boundary visible: you can grep for `withRlsContext` and see exactly which code paths enforce RLS.

**How to say it in an interview:**
"It's opt-in at the call site, not a blanket middleware. This avoids wasted transactions on admin/public routes and keeps the RLS boundary explicit — you can grep for withRlsContext to see every enforced code path."

### Decision 4: Threading the transaction client through

**What's happening:** The callback receives `tx` (the transaction client), which it must pass down to query functions. Query functions accept an optional `client` parameter that defaults to the global `db`.

**Why it matters:** SET LOCAL only applies within the transaction that issued it. If a query function uses the global `db` instead of `tx`, it runs outside the transaction — meaning RLS variables are not set and you get no row filtering. Threading `tx` explicitly through the call chain ensures every query runs inside the same transaction where context was set. It's more verbose than an implicit approach (like cls-hooked or AsyncLocalStorage), but it's also impossible to accidentally bypass — TypeScript will complain if you forget the argument.

**How to say it in an interview:**
"The transaction client is threaded explicitly so TypeScript enforces that queries run inside the RLS-scoped transaction. Implicit approaches like AsyncLocalStorage are more ergonomic but easier to accidentally bypass."

---

## 3. Code Walkthrough

### The imports (lines 1-3)

```ts
import { sql } from 'drizzle-orm';
import { db } from './db.js';
import type { DbTransaction } from './db.js';
```

`sql` is Drizzle's tagged template for raw SQL — it handles parameterization so we can safely interpolate values without SQL injection risk. `db` is the connection pool for the `app_user` role (RLS-enforced). `DbTransaction` is the type for a Drizzle transaction client, extracted in `db.ts`.

### The function signature (lines 9-13)

```ts
export async function withRlsContext<T>(
  orgId: number,
  isAdmin: boolean,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
```

Generic type `T` means the function preserves whatever return type the callback produces. If your callback returns `Promise<ShareLink>`, then `withRlsContext` returns `Promise<ShareLink>`. The callback receives `tx` so it can thread the transaction through to query functions.

### The transaction body (lines 14-18)

```ts
return db.transaction(async (tx) => {
  await tx.execute(sql`SET LOCAL app.current_org_id = ${String(orgId)}`);
  await tx.execute(sql`SET LOCAL app.is_admin = ${String(isAdmin)}`);
  return fn(tx);
});
```

Three things happen in order:

1. **Set org context** — `String(orgId)` converts the number to a string because PostgreSQL's `current_setting()` returns text. The `sql` template handles parameterization.
2. **Set admin flag** — `String(isAdmin)` converts `true`/`false` to `"true"`/`"false"`. RLS policies cast this back to boolean with `current_setting('app.is_admin', true)::boolean`.
3. **Run the callback** — Only after both SET LOCALs succeed. The callback gets `tx`, not `db`, ensuring all queries stay inside this transaction.

The `await` on each SET LOCAL is load-bearing. Without it, the callback could execute before the SET LOCAL completes, running queries without RLS context. Sequential awaits guarantee ordering.

---

## 4. Complexity and Trade-offs

### Runtime complexity

Every tenant-scoped request now involves a database transaction (BEGIN ... COMMIT) with two extra round-trips for SET LOCAL. That's roughly 2-4ms of overhead on a local database, or 5-10ms on a network database. For a dashboard application where the main AI summary call takes 3-15 seconds, this overhead is negligible.

### Trade-off: Explicit tx threading vs. AsyncLocalStorage

AsyncLocalStorage (Node.js's built-in continuation-local storage) could propagate the transaction implicitly — every function in the async call chain would "just know" the current transaction without receiving it as a parameter. The upside is less boilerplate. The downsides: (1) it's easy to accidentally escape the async context (setTimeout, event emitters, unlinked promises), running queries outside the transaction silently, and (2) it's harder to grep for where RLS is and isn't applied. Explicit threading trades ergonomics for safety.

### Trade-off: Transaction per request vs. statement-level SET LOCAL

An alternative architecture sets `app.current_org_id` at the connection level using a middleware-like approach. This avoids wrapping every request in a transaction. The downside is managing cleanup — if the SET persists on a pooled connection, another request inherits it. SET LOCAL + transaction is self-cleaning and immune to cleanup bugs.

**How to say it in an interview:**
"We accepted the overhead of a transaction per tenant request because SET LOCAL + transaction is inherently leak-proof. Connection-level SET is lighter but requires manual cleanup on pooled connections — one missed cleanup and you have a cross-tenant data breach."

---

## 5. Patterns and Concepts Worth Knowing

### Row-Level Security (RLS)

PostgreSQL's RLS lets you attach filter conditions directly to tables. Instead of relying on every query to include `WHERE org_id = ?`, the database automatically appends that filter. It's like a permanent, invisible WHERE clause that applies to all SELECT, INSERT, UPDATE, and DELETE operations. This is defense-in-depth — the application still filters by org_id (for performance and clarity), but RLS is the safety net that catches mistakes.

### Defense-in-Depth

A security principle: never rely on a single layer to prevent breaches. Our stack has three layers of tenant isolation: (1) application-level `WHERE org_id = ?` in query functions, (2) `withRlsContext` setting per-transaction RLS variables, (3) PostgreSQL policies that filter rows even if layers 1 and 2 fail. Any one layer might have a bug, but all three failing simultaneously is extremely unlikely.

### Transaction-Scoped Configuration

PostgreSQL supports custom configuration variables (`SET app.foo = 'bar'`). Combined with `SET LOCAL`, these variables become transaction-scoped metadata — invisible to other transactions, automatically cleaned up on COMMIT/ROLLBACK. This is the standard pattern for multi-tenant RLS in PostgreSQL, used by platforms like Supabase and Citus.

### The Optional Client Pattern

Query functions in this codebase look like: `function getOrgData(orgId, client = db)`. The default `db` means you can call the function normally without a transaction. When called through `withRlsContext`, you pass `tx` instead, and all queries run inside the RLS-scoped transaction. This pattern keeps the API ergonomic for both tenant-scoped and admin code paths.

---

## 6. Potential Interview Questions

### Q1: "How does Row-Level Security prevent data leaks in a multi-tenant app?"

**Strong answer:** "RLS policies on every tenant table compare the row's org_id against a session variable set per-transaction. Even if a developer writes `SELECT * FROM datasets` without a WHERE clause, PostgreSQL's policy engine appends `WHERE org_id = current_setting('app.current_org_id')` automatically. The session variable is set via SET LOCAL inside a transaction, so it's scoped to that request and automatically cleaned up — no cross-request leakage on pooled connections."

**Red flag answer:** "We add WHERE org_id = ? to every query." (That's application-level filtering, not RLS. It doesn't explain the database-level enforcement or how session context is managed.)

### Q2: "Why SET LOCAL and not just SET?"

**Strong answer:** "SET changes the session variable for the entire connection. Since we use connection pooling, that variable persists when the connection is returned to the pool and borrowed by another request. SET LOCAL scopes to the current transaction — when it ends, the variable is gone. This makes cleanup automatic and eliminates the risk of one request inheriting another's org context."

**Red flag answer:** "Because the docs said to." (Shows no understanding of the connection pooling implications.)

### Q3: "What happens if a developer forgets to use withRlsContext?"

**Strong answer:** "The query runs on the global db connection without RLS session variables set. PostgreSQL's current_setting returns NULL, and our RLS policies compare org_id against NULL, which matches nothing — so the query returns zero rows. This is safe from a data-leak perspective but causes a silent failure. We mitigate this through code review — withRlsContext usage is grepable and every route handler that touches tenant data should use it."

**Red flag answer:** "All data would be returned." (Only true if RLS policies used a permissive default, which ours don't.)

### Q4: "How would you test this?"

**Strong answer:** "Unit tests mock the database transaction and verify three things: SET LOCAL is called before the callback, the transaction client is passed through, and errors propagate without suppression. Integration tests against a real database would verify that org A's transaction cannot read org B's rows. The unit tests are fast and cover the behavioral contract; integration tests verify the PostgreSQL policy logic end-to-end."

---

## 7. Data Structures & Algorithms Used

### Transaction (Database Primitive)

A transaction groups multiple SQL statements into an atomic unit — either all succeed (COMMIT) or all are rolled back (ROLLBACK). Here, the transaction serves double duty: it provides atomicity for the business query AND scopes the SET LOCAL variables. There's no additional data structure in the application code; the complexity lives in PostgreSQL's MVCC (Multi-Version Concurrency Control) engine that manages transaction isolation.

### Generic Function (TypeScript)

`withRlsContext<T>` is a generic function — the `T` type parameter is inferred from the callback's return type. This is a zero-cost abstraction: generics are erased at compile time and have no runtime overhead. The pattern preserves type safety through the wrapper: if your callback returns `ShareLink`, TypeScript knows the wrapper returns `Promise<ShareLink>`.

---

## 8. Impress the Interviewer

### Talking Point 1: "19 lines of code, but it's the most security-critical module in the API."

"Every tenant-scoped operation in the system flows through this function. If it had a bug — like setting the wrong org_id, or not awaiting SET LOCAL — you'd have a multi-tenant data breach. That's why it's deliberately minimal: fewer lines means fewer places for bugs to hide. The tests verify ordering, fail-closed behavior, and context isolation. In a multi-tenant SaaS, this is the function you audit first."

### Talking Point 2: "This is the Supabase pattern, production-tested at scale."

"PostgreSQL RLS with SET LOCAL in a transaction is the exact pattern Supabase uses to isolate tenants. It's not something we invented — it's an industry-standard approach for multi-tenant PostgreSQL. The advantage over application-level filtering alone is that it survives developer mistakes. You can write a wrong query, but you can't bypass the database's own access control."

### Talking Point 3: "Explicit is better than implicit — here's why."

"We thread the transaction client explicitly through function calls instead of using AsyncLocalStorage. It's more boilerplate, but TypeScript enforces it at compile time. If someone adds a new query function and forgets the client parameter, the type system catches it. With implicit propagation, you'd only discover the missing context at runtime — possibly in production, possibly as a silent data leak. For a security boundary, we chose the approach that fails loudly at build time."
