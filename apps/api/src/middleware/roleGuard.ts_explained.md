# middleware/roleGuard.ts — Interview-Ready Documentation

## Section 1: 30-Second Elevator Pitch

This file is a middleware factory for Express 5 that builds role-based authorization gates. You call `roleGuard('owner')`, and it hands back an Express middleware function that only lets org owners through. Call `roleGuard('admin')`, and it only lets platform admins through. The factory pattern means you create specific guards at route-registration time, and they remember what role they require for every future request. It sits downstream of `authMiddleware` — by the time this code runs, the user's identity is already verified. This file only answers: "You are who you say you are, but are you *allowed* to do this?"

**How to say it in an interview:** "This is a higher-order function that produces Express middleware for role-based access control. It captures the required role in a closure, then checks the authenticated user's JWT payload against that role on each request. It implements two-dimensional RBAC — org-level roles and platform-level admin status are checked independently."

---

## Section 2: Why This Approach?

### Decision 1: Factory function (higher-order function) instead of a parameterized middleware

**What's happening:** Instead of writing three separate middleware functions (`ownerGuard`, `memberGuard`, `adminGuard`), there's one function that takes a role string and returns a middleware. The returned middleware "remembers" the role through closure scope. Think of it like a stamp machine — you configure it once with the shape, and it stamps every envelope the same way.

**How to say it in an interview:** "The factory pattern avoids writing near-identical middleware for each role. The outer function captures the required role in its closure, and the inner function has access to that value on every request. It's the classic use of closures to create configured behavior."

**Over alternative:** Three separate `ownerGuard`, `memberGuard`, `adminGuard` functions would work, but they'd duplicate the casting and error-throwing logic. Worse, adding a fourth role means writing a fourth function. The factory scales with a one-line type change.

### Decision 2: Two-dimensional RBAC (org role vs. platform admin)

**What's happening:** The JWT payload carries two independent axes of permission. `role` is your standing within an org (owner or member). `isAdmin` is a platform-wide flag — you might be a regular member in your org but still a platform admin for the whole SaaS. The guard checks these on different code paths because they're conceptually separate things.

**How to say it in an interview:** "The system has two-dimensional authorization. Org-level roles (owner/member) govern what you can do within your organization. Platform admin status is a user-level flag independent of any org. The guard checks the right dimension based on the required role, which keeps the two concerns separated."

**Over alternative:** A single linear permission hierarchy (admin > owner > member) would conflate "this person runs the platform" with "this person owns an org." A platform admin shouldn't automatically become an org owner — those are different responsibilities.

### Decision 3: Always chained after authMiddleware, never standalone

**What's happening:** The guard reads `req.user` without checking if it exists. That's not a bug — it's a precondition. `authMiddleware` runs first in the middleware chain, verifies the JWT, and attaches the user payload to the request. If the token is missing or invalid, `authMiddleware` throws a 401 before `roleGuard` ever executes. The guard trusts the pipeline.

**How to say it in an interview:** "The guard follows the chain-of-responsibility pattern. Authentication is a precondition handled upstream. By the time `roleGuard` runs, `req.user` is guaranteed to exist. This separation of concerns keeps each middleware small and testable — authMiddleware handles identity, roleGuard handles authorization."

**Over alternative:** Checking for `req.user` inside `roleGuard` would be defensive programming against a misconfigured route. It's not wrong, but it masks routing mistakes by returning 401 from the wrong layer. Better to let the type system and middleware ordering enforce correctness.

### Decision 4: Throwing errors instead of sending responses directly

**What's happening:** The guard throws an `AuthorizationError` instead of calling `res.status(403).json(...)`. Express 5 automatically catches thrown errors (including from async handlers) and passes them to the error-handling middleware. The centralized `errorHandler` at the end of the chain formats the response consistently.

**How to say it in an interview:** "Express 5 has built-in promise rejection forwarding, so thrown errors propagate to the centralized error handler automatically. This keeps the guard focused on authorization logic — it doesn't know or care about response formatting. The error handler owns that."

**Over alternative:** Calling `res.status(403).json(...)` directly would work but scatters response formatting across every middleware. If you later want to add error logging, change the response shape, or add request correlation IDs to error responses, you'd need to update every middleware instead of one error handler.

---

## Section 3: Code Walkthrough

### Type definition: `GuardRole` (line 5)

```typescript
type GuardRole = 'owner' | 'member' | 'admin';
```

A union type of three string literals. This is intentionally different from the database's `Role` type (which is just `'owner' | 'member'`). `'admin'` exists only in the guard's vocabulary because platform admin status comes from `isAdmin`, not from the `role` field. The guard maps the string `'admin'` to a check on a different property — that's the two-dimensional part.

### The factory function (line 7)

```typescript
export function roleGuard(requiredRole: GuardRole) {
```

You call this at route registration time — `router.get('/settings', roleGuard('owner'), handler)`. It runs once when the server starts and produces a middleware function that gets called on every matching request.

### The returned middleware (line 8)

```typescript
return (req: Request, _res: Response, next: NextFunction) => {
```

This is the actual middleware Express calls per-request. `_res` is prefixed with an underscore — a convention for "I receive this parameter but don't use it." The function has access to `requiredRole` from the outer scope via closure.

### The cast (line 9)

```typescript
const { user } = req as AuthenticatedRequest;
```

Express doesn't know about `req.user` in its base `Request` type. `authMiddleware` attached it, so we cast to `AuthenticatedRequest` to tell TypeScript it's there. Destructuring pulls `user` out for cleaner access in the checks below.

### Admin check (lines 11-16)

```typescript
if (requiredRole === 'admin') {
  if (!user.isAdmin) {
    throw new AuthorizationError('Platform admin access required');
  }
  return next();
}
```

Checked first because admin is the platform-level dimension — completely independent of org role. An admin might have any org role, or might not even belong to the org in the current JWT context. The check only looks at `user.isAdmin` (a boolean on the JWT payload). Early return after `next()` prevents falling through to the org-role checks.

### Owner check (lines 18-23)

```typescript
if (requiredRole === 'owner') {
  if (user.role !== 'owner') {
    throw new AuthorizationError('Owner access required');
  }
  return next();
}
```

Org-level check. `user.role` comes from the `user_orgs` table and is baked into the JWT. Only exact match passes — a `member` can't sneak through. Another early return after success.

### Member check (line 26)

```typescript
// 'member' — any authenticated user passes (owner or member)
next();
```

The fall-through case. If the required role is `'member'`, any authenticated user qualifies because both `'owner'` and `'member'` are valid org roles. There's no conditional — just call `next()`. This works because the two more restrictive checks already returned early. If you've reached this line, the user is authenticated (guaranteed by `authMiddleware`) and the required role is `'member'`, so they pass.

---

## Section 4: Complexity and Trade-offs

**Runtime cost is O(1).** The guard does at most two string comparisons and one boolean check per request. There's no database call, no iteration, no I/O. It reads properties from a JWT payload already decoded in memory.

**The type cast is a weak point.** `req as AuthenticatedRequest` trusts that `authMiddleware` ran before this middleware. If someone accidentally uses `roleGuard` without `authMiddleware` upstream, `user` will be `undefined` and the code will throw a runtime TypeError — not a clean `AuthorizationError`. TypeScript can't enforce middleware ordering, so this is an architectural invariant maintained by convention and code review.

**No support for "any of these roles."** If you needed a route accessible to owners OR admins (but not regular members), you'd need to compose guards or add a new pattern. The current API is one role per guard. For this project's two-dimensional model that hasn't come up, but it's a ceiling.

**How to say it in an interview:** "The main trade-off is relying on middleware ordering as an architectural invariant rather than a compile-time guarantee. TypeScript can't enforce that `authMiddleware` runs before `roleGuard`, so we rely on route registration conventions and tests. The guard itself is O(1) with zero I/O — it reads from the already-decoded JWT."

---

## Section 5: Patterns and Concepts Worth Knowing

### Closures / Factory Functions

The outer function `roleGuard(requiredRole)` captures `requiredRole` in its closure scope. The inner function accesses that variable on every request without receiving it as a parameter. This is JavaScript's lexical scoping in action — the inner function "closes over" the variables from its creation context.

**Where it appears:** Lines 7-27. `requiredRole` is set once, read many times.

**Interview-ready line:** "The factory function uses a closure to capture the required role. The returned middleware has access to that role through lexical scope, which means each route gets a configured guard without any global state or per-request role lookup."

### Chain of Responsibility

Each middleware in the Express pipeline handles one concern and either passes the request along (`next()`) or stops it (throwing an error). `authMiddleware` handles identity. `roleGuard` handles authorization. The route handler handles business logic. Each link in the chain has no knowledge of the others.

**Where it appears:** The entire file — it sits between `authMiddleware` and the route handler.

**Interview-ready line:** "This follows the chain-of-responsibility pattern. Authentication, authorization, and business logic are separate middleware, each with a single responsibility. A request flows through the chain until one link handles it or an error short-circuits the rest."

### Separation of Authentication and Authorization

Authentication answers "who are you?" Authorization answers "what can you do?" Mixing them is a common beginner mistake. Here they're two separate files with two separate error types: `AuthenticationError` (401) vs. `AuthorizationError` (403).

**Where it appears:** `authMiddleware.ts` throws 401, `roleGuard.ts` throws 403.

**Interview-ready line:** "Authentication and authorization are separated into distinct middleware. Authentication (401) happens first — if the user's identity can't be verified, the request never reaches the authorization layer. Authorization (403) only runs once identity is established."

### Early Return Guards

Each role check follows the same pattern: check, throw-or-next, return. The early returns mean each case is self-contained. There's no else chain, no nested ifs, no need to hold multiple conditions in your head at once.

**Where it appears:** Lines 11-16 and 18-23.

**Interview-ready line:** "The function uses guard clauses with early returns to handle each authorization case independently. This keeps the code flat and each case self-documenting."

---

## Section 6: Potential Interview Questions

### Q1: "Why is this a factory function instead of just passing the role as a parameter to the middleware?"

**Strong answer:** "Express middleware has a fixed signature: `(req, res, next)`. You can't add a fourth `role` parameter because Express wouldn't pass it. The factory function is the standard way to parameterize middleware — the outer function accepts configuration, the inner function conforms to Express's expected signature. The closure bridges the gap."

**Red flag answer:** "It's just a style preference." — It's not. Express requires a specific function signature, and the factory pattern is the mechanism for configuring middleware.

### Q2: "What happens if someone uses `roleGuard` on a route that doesn't have `authMiddleware`?"

**Strong answer:** "The code would crash with a TypeError because `req.user` would be `undefined`. The cast to `AuthenticatedRequest` doesn't add runtime safety — it just tells TypeScript the property exists. This is an architectural precondition enforced by convention and testing, not by the type system."

**Red flag answer:** "TypeScript prevents that." — It doesn't. TypeScript types are erased at runtime, and middleware ordering is a runtime concern.

### Q3: "Why does the `'member'` case not have an explicit check?"

**Strong answer:** "Because `'member'` means 'any authenticated user in this org.' Both `'owner'` and `'member'` roles qualify. Since `authMiddleware` already guarantees the user is authenticated and belongs to an org, there's nothing left to check. The admin and owner cases bail out early, so reaching the fall-through line means the role is `'member'` and the user is authenticated — that's sufficient."

**Red flag answer:** "It should check the role to be safe." — Adding `if (user.role !== 'member') throw` would actually *break* the behavior, because owners would be rejected from member-level routes.

### Q4: "How would you add a new role, like 'viewer'?"

**Strong answer:** "Add `'viewer'` to the `GuardRole` union type, add a new `if` block before the fall-through case, and decide where `'viewer'` sits in the hierarchy. If viewer is below member, the member fall-through would need to change to an explicit check. If viewer means 'read-only member,' you'd add it to the database role enum too and update the JWT payload schema in the shared package."

**Red flag answer:** "Just add it to the type." — The type change alone wouldn't enforce anything. You need the runtime check and the database schema update.

### Q5: "What's the difference between the 401 from authMiddleware and the 403 from roleGuard?"

**Strong answer:** "401 Unauthorized means the server doesn't know who you are — your token is missing, expired, or invalid. 403 Forbidden means the server knows exactly who you are but you don't have permission for this action. The distinction matters for the client: on 401, redirect to login. On 403, show an 'access denied' page. Different middleware, different HTTP semantics, different client behavior."

**Red flag answer:** "They're both about access." — They are, but conflating them misses the point. 401 and 403 drive different client-side flows.

---

## Section 7: Data Structures & Algorithms Used

**No complex data structures.** The guard reads three properties from a flat object (the JWT payload): `isAdmin` (boolean), `role` (string), and implicitly the existence of the user object itself.

**The branching logic is a simple decision tree** with at most two comparisons per request:

```
requiredRole === 'admin'?
  ├── yes → check user.isAdmin → pass or 403
  └── no → requiredRole === 'owner'?
              ├── yes → check user.role === 'owner' → pass or 403
              └── no → pass (member = any authenticated user)
```

This is O(1) — constant time, constant space. No iteration, no recursion, no allocation. The guard is about as computationally cheap as a middleware can be.

The `GuardRole` union type is effectively an enum with three values. TypeScript's exhaustive checking could enforce that all cases are handled (with a `never` assertion on a default branch), but the current structure handles it through early returns and a catch-all fall-through, which works well for three cases.

---

## Section 8: Impress the Interviewer

### Two-Dimensional RBAC Is a Real Architecture Decision

**What's happening:** Most beginner RBAC systems have a single linear hierarchy: admin > moderator > user. This project has two independent axes — you can be a regular `member` in your org and simultaneously a `platform admin` for the whole SaaS. The guard reflects this by checking `isAdmin` (user-level, platform-wide) on a completely different code path from `role` (org-level, scoped to the current org in the JWT).

**Why it matters:** In a multi-tenant SaaS, the person who manages the platform infrastructure is not necessarily an owner of any particular customer organization. Conflating these into one hierarchy would mean platform support staff automatically gets owner-level access to every customer's data — a security and privacy mistake.

**How to bring it up:** "The authorization model has two independent dimensions: org-level roles for tenant-scoped actions and a platform admin flag for system-wide operations. The guard checks them on separate code paths because they're orthogonal concerns. A platform admin doesn't inherit org-level ownership, and an org owner has no platform-level privileges — you need both checks because the permission space is a matrix, not a line."

### The Guard Is Deliberately Thin — And That's the Point

**What's happening:** The entire file is 28 lines. It does no I/O, no database queries, no caching. It reads from an in-memory object that was populated upstream and makes a synchronous decision. Every other concern — token verification, response formatting, error logging — belongs to a different middleware.

**Why it matters:** Authorization middleware runs on every protected request. If it made a database query to check permissions (which is common in more complex RBAC systems with dynamic permissions), that's a query per request, often uncacheable because permissions can change. By baking roles into the JWT at login time, the entire authorization check is a property read. The trade-off is that role changes don't take effect until the JWT is refreshed, but for a system with two roles and a boolean, that latency is acceptable.

**How to bring it up:** "The guard is intentionally zero-I/O — it reads roles from the JWT payload rather than querying the database on every request. That makes authorization O(1) with no network latency. The trade-off is that role changes are eventual rather than immediate, limited by the JWT's expiry window. For a system with only two org-level roles, that trade-off is well worth the performance win."

### Express 5 Error Propagation Makes This Cleaner

**What's happening:** The guard throws errors instead of calling `res.json()`. In Express 4, if a synchronous middleware threw an error, Express would catch it, but async middleware needed `try/catch` wrappers or a helper like `express-async-errors`. Express 5 handles both — synchronous throws and rejected promises propagate to the error handler automatically.

**How to bring it up:** "We throw domain-specific errors from middleware and let Express 5's built-in error propagation route them to a centralized handler. This is cleaner than Express 4, where async error handling required wrappers. Each middleware stays focused on its concern — the guard throws `AuthorizationError`, and the error handler downstream decides what a 403 response looks like."
