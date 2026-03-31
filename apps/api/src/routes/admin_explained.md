---
file: admin.ts
purpose: Express 5 admin API routes — thin handlers delegating to service layer
---

# Elevator Pitch

Three endpoints behind `roleGuard('admin')`: list all orgs, list all users, get a single org's detail. These are the backend half of the platform admin dashboard. The handlers are intentionally thin — validate params, call the service, format the response. All the real work lives in `adminService` and `adminQueries`.

# Why This Approach

Express 5 auto-forwards promise rejections to the error handler, so no try-catch needed. The service layer throws `NotFoundError` for missing orgs, which the global `errorHandler` middleware maps to a 404 response. This pattern is consistent with every other route file in the project.

The route is mounted via `protectedRouter.use('/admin', roleGuard('admin'), adminRouter)` in `protected.ts`. That means `authMiddleware` runs first (from the protected router), then `roleGuard('admin')` checks `req.user.isAdmin`. Non-admin users get a 403 before any handler executes — the admin router's handlers never even see the request.

# Code Walkthrough

**`GET /orgs`** — Calls `adminService.getDashboardData()` which fires all three query functions in parallel (`Promise.all`). Returns `{ data: orgs, meta: { total, stats } }`. The stats object has `totalOrgs`, `totalUsers`, `proSubscribers`.

**`GET /users`** — Calls `adminService.getDashboardData()` (same parallel fetch). Returns `{ data: users, meta: { total } }`. In a larger app you'd have separate service calls, but here the dashboard page needs both orgs and users, and the parallel fetch is cheap.

**`GET /orgs/:orgId`** — Parses `orgId` from params, calls `adminService.getOrgDetail(orgId)`. Returns `{ data: orgDetail }` with members, datasets, and subscription nested inside. If the org doesn't exist, the service throws `NotFoundError` → 404.

# Complexity and Trade-offs

The `GET /orgs` and `GET /users` endpoints both call `getDashboardData()`, which fetches everything. If the admin page only needed orgs, we'd still fetch users. At this scale it's fine — the total data is small. If you needed to optimize, split the service method into `getOrgsWithStats()` and `getUsersWithMemberships()`.

# Patterns Worth Knowing

- **Express 5 async handlers** — No `express-async-errors` needed. `async (req, res) => { ... }` with an unhandled rejection automatically hits the error handler.
- **API response envelope** — `{ data, meta }` for lists, `{ data }` for single resources. The `meta` field carries pagination info, totals, or supplementary data. Consistent across every endpoint.
- **Route mounting with middleware chain** — `protectedRouter.use('/admin', roleGuard('admin'), adminRouter)` applies two middleware layers: auth (from protectedRouter) + role check. This is the standard pattern for gated route groups.

# Interview Questions

**Q: Why mount the admin router under protectedRouter instead of the main app?**
You: "The protected router already has `authMiddleware` applied. Mounting under it means every admin endpoint gets JWT verification for free. Then `roleGuard('admin')` adds the authorization layer. This two-step chain — authenticate, then authorize — is a standard pattern. If we mounted on the main app, we'd need to attach both middleware individually."

**Q: Both /orgs and /users call getDashboardData(). Isn't that wasteful?**
You: "In the current implementation, yes — the admin page fetches both in one RSC render anyway. But the endpoints are separate because they represent different resources. The service could be split later without changing the API contract. At current scale (< 100 orgs), the redundant fetch costs microseconds."

# Data Structures

- Request: `GET /admin/orgs` — no params
- Response: `{ data: AdminOrgRow[], meta: { total: number, stats: { totalOrgs, totalUsers, proSubscribers } } }`
- Request: `GET /admin/orgs/:orgId` — path param `orgId: number`
- Response: `{ data: { ...org, members: [], datasets: [], subscription: {} } }`

# Impress the Interviewer

Point out the defense-in-depth: proxy.ts blocks unauthenticated users at the edge, authMiddleware verifies the JWT, roleGuard checks the admin claim, and the service layer validates business rules (org exists). Four layers before any database query runs. And the route handlers themselves are ~5 lines each — all the complexity is pushed to the right abstraction layer.
