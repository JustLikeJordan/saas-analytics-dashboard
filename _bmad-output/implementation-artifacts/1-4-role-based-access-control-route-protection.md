# Story 1.4: Role-Based Access Control & Route Protection

Status: review

## Story

As an **application owner**,
I want the system to enforce role-based permissions on every API request,
So that unauthorized users cannot access restricted functionality.

## Acceptance Criteria

1. **Given** the RBAC system is implemented **When** I inspect the authorization model **Then** it enforces two-dimensional access: `user_orgs.role` (owner/member) + `users.is_platform_admin` boolean (FR5)

2. **Given** an API request arrives **When** the authorization middleware processes it **Then** the JWT claims (userId, org_id, role, isAdmin) are verified on every request independent of frontend state (NFR11) **And** a structured `AppError` is thrown for failures: `AuthenticationError` (401), `AuthorizationError` (403)

3. **Given** the BFF proxy pattern is implemented **When** browser requests hit Next.js `/api/*` routes **Then** they are forwarded to Express `:3001` with cookie forwarding **And** action routes (`/upload`, `/billing`, `/admin`) are protected by `proxy.ts` **And** two typed API clients exist: `api-client.ts` (Client Components), `api-server.ts` (Server Components) — no raw `fetch()`

4. **Given** an API error occurs **When** the error handler processes it **Then** responses follow the standard wrapper: `{ data: T, meta?: {} }` for success, `{ error: { code, message, details? } }` for errors **And** the `AppError` hierarchy includes: `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ExternalServiceError`

5. **Given** rate limiting is configured **When** requests exceed thresholds **Then** Redis-backed rate limiting enforces 3 tiers: auth (10/min/IP), AI (5/min/user), public (60/min/IP) (NFR14) **And** rate limiting fails open if Redis is unavailable

## Tasks / Subtasks

- [ ] Task 1: Create `authMiddleware.ts` — JWT extraction + verification (AC: #2)
  - [ ] 1.1 Read `access_token` cookie from request (via cookie-parser, already mounted)
  - [ ] 1.2 Call `verifyAccessToken()` from `services/auth/tokenService.ts` (already exists)
  - [ ] 1.3 Attach parsed JWT claims to `req.user` — define `AuthenticatedRequest` type extending Express Request
  - [ ] 1.4 Throw `AuthenticationError` on missing/invalid token
  - [ ] 1.5 Export as named middleware function, not default

- [ ] Task 2: Create `roleGuard.ts` — role-based authorization middleware factory (AC: #1, #2)
  - [ ] 2.1 `roleGuard('owner')` — checks `req.user.role === 'owner'`, throws `AuthorizationError` otherwise
  - [ ] 2.2 `roleGuard('admin')` — checks `req.user.isAdmin === true`, throws `AuthorizationError` otherwise
  - [ ] 2.3 `roleGuard('member')` — passes for any authenticated user (owner or member)
  - [ ] 2.4 Must be chained AFTER `authMiddleware` — reads from `req.user`, not cookies directly

- [ ] Task 3: Create `rateLimiter.ts` — 3-tier Redis-backed rate limiting (AC: #5)
  - [ ] 3.1 Install `rate-limiter-flexible` in `apps/api`
  - [ ] 3.2 Create 3 `RateLimiterRedis` instances: `authLimiter` (10 pts/60s by IP), `aiLimiter` (5 pts/60s by userId), `publicLimiter` (60 pts/60s by IP)
  - [ ] 3.3 Add `enableOfflineQueue: false` to the ioredis constructor options in `apps/api/src/lib/redis.ts` — it is currently missing. Without this, rate-limiter calls queue indefinitely when Redis is down instead of fast-failing to the insurance limiter. This is required for NFR14 fail-open behavior.
  - [ ] 3.4 Use existing `redis` ioredis client from `lib/redis.ts` as `storeClient`
  - [ ] 3.5 Configure `RateLimiterMemory` as `insuranceLimiter` for each — fail-open when Redis is down
  - [ ] 3.6 Import `RATE_LIMITS` from `shared/constants` for point/duration values — do NOT hardcode. The constant already exists with all 3 tiers defined.
  - [ ] 3.7 Export `rateLimitAuth`, `rateLimitAi`, `rateLimitPublic` as Express middleware functions
  - [ ] 3.8 Return 429 with `{ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }` and `Retry-After` header

- [ ] Task 4: Mount middleware in `index.ts` + create protected router (AC: #2, #5)
  - [ ] 4.1 The current `index.ts` chain is: `correlationId → json → cookieParser → pinoHttp → healthRouter → authRouter → errorHandler`. Do NOT reorder the existing middleware — insert new middleware at the correct positions.
  - [ ] 4.2 Add `rateLimitPublic` AFTER `pinoHttp` and BEFORE route handlers (so rate-limited requests are still logged)
  - [ ] 4.3 Add `rateLimitAuth` as route-level middleware on `authRouter` (not global — only auth endpoints)
  - [ ] 4.4 Keep auth routes public (no authMiddleware — they handle their own auth)
  - [ ] 4.5 Create `apps/api/src/routes/protected.ts` — a Router with `authMiddleware` pre-applied. Future stories mount their routes on this router. Export it and mount in `index.ts` AFTER authRouter.
  - [ ] 4.6 Final `index.ts` chain MUST be: `correlationId → [stripe webhook placeholder] → json → cookieParser → pinoHttp → rateLimitPublic → healthRouter → authRouter (with rateLimitAuth) → protectedRouter (with authMiddleware) → errorHandler`

- [ ] Task 5: Harden `api-server.ts` error handling (AC: #3)
  - [ ] 5.1 `api-server.ts` already exists — verify it forwards cookies from Server Component context via `cookies()` async API
  - [ ] 5.2 The current error path is `throw new Error('API error: 401 Unauthorized')` — this loses the structured error body entirely. Fix: parse the response body as `{ error: { code: string, message: string, details?: unknown } }`. Throw a typed error that exposes `code` and `message` — match the `ApiError` interface already defined in `api-client.ts`. Handle non-JSON bodies (network timeouts) with fallback code `NETWORK_ERROR`.
  - [ ] 5.3 Both clients (`api-client.ts` and `api-server.ts`) already exist — this task is hardening `api-server.ts` only. Do not modify `api-client.ts`.

- [ ] Task 6: Create test infrastructure + write tests (AC: #1-5)
  - [ ] 6.1 Create `apps/api/src/test/helpers/testApp.ts` — Express app factory with correlationId, cookieParser, errorHandler pre-mounted. Accepts a callback to mount test-specific middleware and routes. This is the shared test infrastructure for all future middleware and route tests. Story 1.3 built tests inline — this story establishes the reusable pattern.
  - [ ] 6.2 `authMiddleware.test.ts` (4+ tests) — valid token attaches user, missing token → 401, expired token → 401, malformed token → 401
  - [ ] 6.3 `roleGuard.test.ts` (5+ tests) — owner passes owner check, member fails owner check, admin passes admin check, non-admin fails admin check, member passes member check
  - [ ] 6.4 `rateLimiter.test.ts` (7+ tests) — one per limiter tier (auth, AI, public) for over-limit → 429 with Retry-After, one per tier for pass-through, one for Redis-unavailable fail-open (mock ioredis error, verify request still succeeds via insurance limiter)
  - [ ] 6.5 Integration test: full request through authMiddleware → roleGuard → route handler → response, using the testApp factory

## Dev Notes

### What Already Exists (from Stories 1.1-1.3)

**DO NOT recreate or modify these unless specifically needed:**

- `apps/api/src/lib/appError.ts` — Full AppError hierarchy already built (ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ExternalServiceError). AC #4 is mostly satisfied. **KNOWN BUG to fix:** `AuthenticationError` uses code `'AUTHENTICATION_ERROR'` but the project context mandates `'AUTHENTICATION_REQUIRED'`. Fix the code string to `'AUTHENTICATION_REQUIRED'` to match the standard error code list: `VALIDATION_ERROR` (400), `AUTHENTICATION_REQUIRED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `RATE_LIMITED` (429), `EXTERNAL_SERVICE_ERROR` (502), `INTERNAL_ERROR` (500). Also verify `AuthorizationError` uses `'FORBIDDEN'` (not `'AUTHORIZATION_ERROR'`) to match the same standard. Update Story 1.3's auth tests if they assert on the old code strings.
- `apps/api/src/middleware/errorHandler.ts` — Catches AppError subclasses, formats standard error response. Already works.
- `apps/api/src/middleware/correlationId.ts` — UUID per request, already mounted first in chain.
- `apps/api/src/services/auth/tokenService.ts` — `verifyAccessToken()` already exists, returns parsed `JwtPayload`. Use it, don't rewrite.
- `apps/api/src/routes/auth.ts` — 4 auth endpoints already working. Mount rate limiting on these, not authMiddleware.
- `apps/web/proxy.ts` — Already protects `/upload`, `/billing`, `/admin` with JWT verification. AC #3 is satisfied — verify, don't rebuild.
- `apps/web/lib/api-client.ts` — Client Component API client with silent refresh. Already works.
- `apps/web/lib/api-server.ts` — Server Component API client. Already exists. Needs minor error parsing improvement.
- `packages/shared/src/schemas/auth.ts` — `jwtPayloadSchema` with sub, org_id, role, isAdmin, iat, exp.
- `packages/shared/src/types/auth.ts` — `JwtPayload`, `Role` types.

### Critical Architecture Constraints

1. **Two-dimensional RBAC** — `user_orgs.role` (owner/member) is org-level. `users.is_platform_admin` is user-level. These are independent axes. `roleGuard('owner')` checks org role. `roleGuard('admin')` checks `isAdmin`. Platform admin is NOT an org role — do not add 'admin' to the role enum.

2. **JWT claims** — Already defined in `jwtPayloadSchema`: `{ sub: string, org_id: number, role: 'owner'|'member', isAdmin: boolean, iat, exp }`. The `sub` field is the userId as a string — parse with `parseInt(payload.sub, 10)`.

3. **Express 5 async error handling** — Route handlers that throw rejected promises auto-forward to errorHandler. No manual try/catch needed in async routes. Middleware that calls `next()` must still use the callback pattern.

4. **Middleware reads cookie, not Authorization header** — JWT is in an httpOnly cookie named `access_token` (from `AUTH.COOKIE_NAMES.ACCESS_TOKEN`). Not a Bearer token in the Authorization header.

5. **rate-limiter-flexible with ioredis** — Use existing `redis` client from `lib/redis.ts`. Pass as `storeClient` option. Do NOT set `useRedisPackage: true` (that flag is for the `redis` npm package, not ioredis). `lib/redis.ts` currently does NOT have `enableOfflineQueue: false` — Task 3.3 adds it. This is required: without it, ioredis queues commands when Redis is down instead of failing fast to the insurance limiter.

6. **Fail-open rate limiting** — Use `insuranceLimiter: new RateLimiterMemory(...)` as fallback. When Redis is down, the memory limiter handles requests with reduced limits. Log a warning when falling back — do NOT block all traffic.

7. **No CORS** — BFF proxy means same-origin. Do NOT add CORS middleware anywhere.

8. **Pino logging** — `logger.warn({ ip, path }, 'Rate limit exceeded')` — structured objects first, message string second. Never string interpolation.

9. **No process.env** — All env through `config.ts`. Redis URL already in config.

10. **Auth routes are public** — `/auth/google`, `/auth/callback`, `/auth/refresh`, `/auth/logout` handle their own auth logic. Do NOT put authMiddleware on auth routes.

### File Placement

```
apps/api/src/middleware/
├── authMiddleware.ts              # NEW — JWT verification, attaches req.user
├── authMiddleware.test.ts         # NEW — 4+ tests
├── authMiddleware.ts_explained.md # NEW — interview doc
├── roleGuard.ts                   # NEW — role-based authorization factory
├── roleGuard.test.ts              # NEW — 5+ tests
├── roleGuard.ts_explained.md      # NEW — interview doc
├── rateLimiter.ts                 # NEW — 3-tier Redis-backed rate limiting
├── rateLimiter.test.ts            # NEW — 7+ tests
├── rateLimiter.ts_explained.md    # NEW — interview doc
├── correlationId.ts               # EXISTS
├── errorHandler.ts                # EXISTS
```

```
apps/api/src/routes/
├── protected.ts                   # NEW — Router with authMiddleware pre-applied
├── protected.ts_explained.md      # NEW — interview doc
├── health.ts                      # EXISTS
├── auth.ts                        # EXISTS (add rateLimitAuth)
```

```
apps/api/src/test/helpers/
├── testApp.ts                     # NEW — shared Express app factory for tests
```

```
apps/api/src/lib/
├── redis.ts                       # MODIFY — add enableOfflineQueue: false
```

```
apps/api/src/lib/
├── appError.ts                    # MODIFY — fix error code strings
```

```
apps/web/lib/
├── api-server.ts                  # MODIFY — structured error parsing
```

### Type Extension Pattern

Define `AuthenticatedRequest` by extending Express's Request. Do NOT use module augmentation on the global Express namespace — keep it explicit.

```typescript
import type { Request } from 'express';
import type { JwtPayload } from 'shared/types';

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
```

Route handlers that require auth should type their req as `AuthenticatedRequest`. This makes the auth requirement visible at the type level.

**Forward contract:** `AuthenticatedRequest` is a stable interface that downstream middleware depends on. `subscriptionGate.ts` (Epic 2+) will read `req.user.org_id` to check subscription tier. `rateLimitAi` (this story) reads `req.user.sub` for per-user keying. Do not change `req.user`'s shape after this story without treating it as a breaking change across all middleware consumers.

### rate-limiter-flexible Setup Pattern

```typescript
import { RateLimiterRedis, RateLimiterMemory } from 'rate-limiter-flexible';
import { redis } from '../lib/redis.js';

const memoryFallback = new RateLimiterMemory({
  points: 60,  // reduced limits for fallback
  duration: 60,
});

const publicLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl_public',
  points: 60,
  duration: 60,
  insuranceLimiter: memoryFallback,
});
```

Key by IP for auth/public tiers, by userId for AI tier. The AI tier middleware only runs after authMiddleware (userId available from `req.user`).

`rateLimitAi` should type its request as `AuthenticatedRequest` since it always runs after `authMiddleware`. If `req.user` is somehow absent (defensive guard), fall back to IP-based keying and log a warning — don't crash. The `rateLimitAuth` and `rateLimitPublic` middlewares use plain `Request` and key by `req.ip`.

### Previous Story Intelligence (Story 1.3)

**Lessons learned:**
- `packages/shared/dist/` can get stale — if tests fail on imports, run `pnpm --filter shared build` first
- ESM imports require `.js` extensions in import paths within the API app
- `cookie-parser` is already installed and mounted in `index.ts`
- `AUTH.COOKIE_NAMES.ACCESS_TOKEN` is the cookie key for the JWT
- TypeScript strict mode with `noUncheckedIndexedAccess` — be careful with array indexing

**Files from 1.3 you'll be building on:**
- `apps/api/src/services/auth/tokenService.ts` — has `verifyAccessToken()` you'll call
- `apps/api/src/index.ts` — you'll modify the middleware chain here
- `apps/api/src/routes/auth.ts` — add rate limiting to these routes
- `packages/shared/src/constants/index.ts` — has `AUTH.COOKIE_NAMES`

### Git Patterns from Recent Commits

- Conventional commit prefixes: `feat:`, `fix:`, `chore:`, `refactor:`
- Story commits reference story number in first line
- Tests co-located with source files
- `_explained.md` companion docs for all new files (mandatory)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.4] — Story definition, acceptance criteria, sub-tasks
- [Source: _bmad-output/planning-artifacts/architecture.md#Authentication & Security] — JWT claims, jose 6.x, cookie config
- [Source: _bmad-output/planning-artifacts/architecture.md#API & Communication Patterns] — Rate limiting spec, fail-open, 3 tiers
- [Source: _bmad-output/project-context.md#Critical Implementation Rules] — RBAC two-dimensional model, roleGuard patterns
- [Source: _bmad-output/project-context.md#Framework-Specific Rules] — Express 5 middleware chain order, async error handling
- [Source: _bmad-output/implementation-artifacts/1-3-google-oauth-authentication-org-auto-creation.md] — Previous story learnings, file list

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

- Fixed known bug: AuthenticationError code `AUTHENTICATION_ERROR` → `AUTHENTICATION_REQUIRED`, AuthorizationError code `AUTHORIZATION_ERROR` → `FORBIDDEN`
- Updated Story 1.3's auth.test.ts assertions to match new error codes
- Updated appError.ts_explained.md to reflect new error codes
- All 101 tests pass (12 test files), type-check passes for both api and web packages
- ESLint config not yet set up (pre-existing — not this story's scope)
- Rate limiter fail-open test validates memory fallback works (gets 200 or 429, never 500)
- Middleware chain verified: correlationId → [stripe placeholder] → json → cookieParser → pinoHttp → rateLimitPublic → healthRouter → /auth rateLimitAuth → authRouter → protectedRouter → errorHandler

### File List

**New files:**
- `apps/api/src/middleware/authMiddleware.ts` — JWT cookie extraction, req.user attachment
- `apps/api/src/middleware/roleGuard.ts` — role-based authorization factory
- `apps/api/src/middleware/rateLimiter.ts` — 3-tier Redis-backed rate limiting
- `apps/api/src/routes/protected.ts` — Router with authMiddleware pre-applied
- `apps/api/src/test/helpers/testApp.ts` — shared Express app factory for tests
- `apps/api/src/middleware/authMiddleware.test.ts` — 4+ tests
- `apps/api/src/middleware/roleGuard.test.ts` — 5+ tests
- `apps/api/src/middleware/rateLimiter.test.ts` — 7+ tests
- `apps/api/src/middleware/authMiddleware.ts_explained.md`
- `apps/api/src/middleware/roleGuard.ts_explained.md`
- `apps/api/src/middleware/rateLimiter.ts_explained.md`
- `apps/api/src/routes/protected.ts_explained.md`

**Modified files:**
- `apps/api/src/index.ts` — mount rateLimitPublic, protectedRouter; reorder middleware chain
- `apps/api/src/routes/auth.ts` — add rateLimitAuth middleware to auth routes
- `apps/api/src/lib/redis.ts` — add enableOfflineQueue: false
- `apps/api/src/lib/appError.ts` — fix error code strings (AUTHENTICATION_REQUIRED, FORBIDDEN)
- `apps/web/lib/api-server.ts` — structured error response parsing
- `apps/api/package.json` — add rate-limiter-flexible dependency
