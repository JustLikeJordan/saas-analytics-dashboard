# protected.ts — Explained

## 1. 30-Second Elevator Pitch

This file creates an Express Router with authentication middleware baked in. Any route mounted on this router automatically requires a valid JWT. It's a single choke point: if a route lives on `protectedRouter`, it's authenticated. Period. No per-route `authMiddleware` calls, no forgetting to add auth to a new endpoint. The router itself is the security boundary.

**How to say it in an interview:** "The protected router applies authentication at the router level so that every route mounted on it inherits JWT verification automatically. It's a single enforcement point that eliminates the risk of accidentally exposing an unauthenticated endpoint."

---

## 2. Why This Approach?

### Decision 1: Router-level middleware instead of per-route middleware

**What's happening:** Instead of adding `authMiddleware` to every individual route handler, we call `protectedRouter.use(authMiddleware)` once. Every route added to this router later gets auth for free.

**Why this matters:** Imagine you have 20 protected endpoints. If you add `authMiddleware` individually to each one, you need to remember to do it 20 times. Miss one and you've got an unauthenticated endpoint in production. With the router-level approach, you can't forget. A new developer on the team doesn't need to know about `authMiddleware` at all — they just mount their routes on `protectedRouter` and auth is handled.

**How to say it in an interview:** "Applying auth at the router level is a pit-of-success design. You can't accidentally create an unprotected route on this router. It shifts security from 'remember to add this decorator' to 'mount on the right router.'"

### Decision 2: Separate router file instead of inline in index.ts

**What's happening:** Auth-protected routes get their own router in a separate file, rather than calling `app.use(authMiddleware)` partway through `index.ts`.

**Why this matters:** Mounting order in Express matters. If you call `app.use(authMiddleware)` in `index.ts`, every route registered after that line gets auth — including routes you might add later that should be public. A dedicated router makes the boundary explicit. Public routes (health checks, login) go on the main app or their own routers. Protected routes go on `protectedRouter`. Looking at `index.ts`, you can see the architecture at a glance: `authRouter` first (public), then `protectedRouter` (requires JWT), then `errorHandler`.

**How to say it in an interview:** "Separating the protected router makes the auth boundary explicit in the mount order. You can read index.ts top to bottom and see exactly where public routes end and protected routes begin."

---

## 3. Code Walkthrough

### Lines 1-2: Imports

```ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware.js';
```

Two imports. `Router` is Express's way of creating a mini-application with its own routes and middleware. `authMiddleware` is the JWT verification function — it reads the token from the request, verifies it, and attaches the decoded user info to `req.user`. If the token is missing or invalid, it short-circuits with a 401 response.

### Lines 4-7: Router creation and middleware

```ts
const protectedRouter = Router();
protectedRouter.use(authMiddleware);
```

`Router()` creates a new, empty router. `.use(authMiddleware)` registers middleware that runs before any route handler on this router. When a request hits any route mounted on `protectedRouter`, Express runs `authMiddleware` first. If auth succeeds, the request continues to the actual route handler. If it fails, the middleware responds with 401 and the route handler never runs.

### Lines 9-12: Commented future routes

```ts
// protectedRouter.use(datasetRouter);
// protectedRouter.use(aiRouter);
// protectedRouter.use(adminRouter); // + roleGuard('admin')
```

These comments show how the router will grow. Future stories will create sub-routers for datasets, AI summaries, billing, and admin operations. Each one just calls `protectedRouter.use(...)` and gets auth automatically. The `adminRouter` note hints at layered authorization — auth first (from this router), then role-based access control on top.

### Line 14: Export

```ts
export default protectedRouter;
```

The main `index.ts` imports this and mounts it with `app.use(protectedRouter)`, right after the public `authRouter` and right before `errorHandler`.

---

## 4. Complexity and Trade-offs

**Time/space complexity:** Not applicable. This file doesn't process data — it's pure wiring.

**Trade-off: Single router vs. multiple protected routers.** You could have separate authenticated routers for different concerns (`datasetRouter` with its own auth, `adminRouter` with its own auth). But that duplicates the auth middleware registration and creates multiple places where you might misconfigure it. A single `protectedRouter` is simpler and makes the mount order in `index.ts` easy to reason about. The downside is that if you ever need routes with *different* auth strategies (e.g., API key auth vs. JWT auth), you'd need a second router. That's a bridge to cross later.

**How to say it in an interview:** "One router for all protected routes keeps the auth boundary in one place. If we needed multiple auth strategies later, we'd add a second router — but that's a deliberate architectural decision, not an accident."

---

## 5. Patterns and Concepts Worth Knowing

### Router Composition (Express)

Express apps are built by composing routers. Each router is a self-contained group of routes and middleware. The main `app` assembles them in a specific order, which determines the middleware chain. This is how large Express apps stay organized — you never have a 500-line `index.ts` with every route inline.

### Pit of Success / Secure by Default

"Pit of success" means designing systems so the easy path is the correct path. Here, the easy way to add a protected route (mount it on `protectedRouter`) is also the secure way. You'd have to go out of your way to bypass auth — you'd need to mount the route directly on `app` instead. Contrast this with per-route decorators where forgetting the decorator is the easy (and insecure) path.

### Middleware Chain

Express processes middleware in registration order. When `protectedRouter` is mounted on `app`, a request to any of its routes flows through: correlationId -> body parser -> pino-http -> authMiddleware -> route handler -> errorHandler. The authMiddleware step is injected by this router. Understanding this chain is key to debugging Express apps.

---

## 6. Potential Interview Questions

### Q1: "Why not just add authMiddleware to each route individually?"

**Strong answer:** "Per-route middleware works, but it's error-prone at scale. If you have 20 protected endpoints and forget auth on one, you've got a security hole. Router-level middleware makes auth the default for everything mounted on it. It's a secure-by-default pattern — you can't accidentally create an unprotected endpoint."

**Red flag:** "It's the same thing" without recognizing the security implications of the two approaches.

### Q2: "How does Express know to run authMiddleware before the route handlers?"

**Strong answer:** "Express middleware runs in registration order. `protectedRouter.use(authMiddleware)` is called before any routes are mounted on the router, so authMiddleware always runs first. When the middleware calls `next()`, Express moves to the next handler in the chain. If it sends a response instead (like a 401), the chain stops there."

**Red flag:** Not knowing what `next()` does, or thinking middleware runs in parallel.

### Q3: "What happens if authMiddleware throws an error?"

**Strong answer:** "In Express 5, async errors propagate automatically to the error handler. If `authMiddleware` throws or returns a rejected promise, Express catches it and forwards it to the `errorHandler` middleware at the end of the chain. In Express 4 you'd need `express-async-errors` or manual try/catch, but Express 5 handles this natively."

**Red flag:** Not knowing the difference between Express 4 and 5 error handling, or thinking the error would crash the process.

---

## 7. Data Structures & Algorithms Used

| Concept | Where | Why |
|---|---|---|
| **Middleware chain** | `protectedRouter.use(authMiddleware)` | Inserts JWT verification before all route handlers on this router. |
| **Router composition** | `Router()` exported and mounted in `index.ts` | Encapsulates a group of routes with shared behavior into a composable unit. |

---

## 8. Impress the Interviewer

### Talking point 1: "Security boundaries should be architectural, not per-endpoint"

"I prefer enforcing auth at the router level because it turns security into a structural property of the code. You can look at how routers are mounted and immediately see what's public and what's protected. Per-route decorators are fine for small apps, but they rely on every developer remembering to add them every time. Router-level auth makes the secure path the default path."

### Talking point 2: "This is 14 lines, and that's the point"

"The value of this file isn't in what it does — it's in what it prevents. It's a thin architectural layer that makes it impossible to accidentally add an unauthenticated route to the protected surface. Sometimes the most useful code in a codebase is the code that's boring on purpose."
