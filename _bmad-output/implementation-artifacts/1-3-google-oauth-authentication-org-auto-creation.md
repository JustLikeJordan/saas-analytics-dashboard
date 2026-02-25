# Story 1.3: Google OAuth Authentication & Org Auto-Creation

Status: done

## Story

As a **new user**,
I want to sign up with my Google account and have an organization automatically created for me,
So that I can start using the application immediately without manual setup.

## Acceptance Criteria

1. **Given** I am on the login page **When** I click "Sign in with Google" **Then** I am redirected to Google's OAuth consent screen and back to the app on approval (FR1)

2. **Given** I am a first-time user completing Google OAuth **When** the callback is processed **Then** a `users` record is created with my Google profile info **And** an `orgs` record is auto-created with a default name derived from my profile (FR2) **And** a `user_orgs` record is created with `role: owner`

3. **Given** authentication succeeds **When** the server issues tokens **Then** a JWT access token (15-minute expiry) is generated via jose 6.x with claims: `userId`, `org_id`, `role`, `isAdmin` (NFR8) **And** a refresh token (7-day expiry) is stored as `token_hash` in `refresh_tokens` and sent as an httpOnly, Secure, SameSite=Lax cookie (NFR8)

4. **Given** my access token has expired **When** the frontend makes an API request **Then** the system transparently refreshes via the httpOnly cookie (silent refresh) without interrupting my session **And** the old refresh token is invalidated (rotation) **And** a test can verify silent refresh by issuing a request with an expired access token and confirming a new token pair is returned

5. **Given** I am a returning user **When** I sign in with Google **Then** my existing account is matched and I receive new tokens without creating a duplicate org

## Tasks / Subtasks

- [x] Task 1: Add shared constants, schemas, and types (AC: #3)
  - [x] 1.1 Add AUTH constants to `packages/shared/src/constants/index.ts`
  - [x] 1.2 Add `jwtPayloadSchema`, `googleCallbackSchema`, `loginResponseSchema` to `packages/shared/src/schemas/auth.ts`
  - [x] 1.3 Update schema barrel exports
  - [x] 1.4 Add `JwtPayload`, `GoogleCallback`, `LoginResponse` types
  - [x] 1.5 Update type barrel exports

- [x] Task 2: Create tokenService.ts (AC: #3, #4)
  - [x] 2.1 `signAccessToken` — jose SignJWT, HS256, 15-min, claims: sub, org_id, role, isAdmin
  - [x] 2.2 `verifyAccessToken` — jose jwtVerify, throws AuthenticationError on failure
  - [x] 2.3 `generateRefreshToken` — crypto.randomBytes(32) hex + SHA-256 hash
  - [x] 2.4 `createTokenPair` — signs JWT + generates/stores refresh token
  - [x] 2.5 `rotateRefreshToken` — hash→lookup→revoke old→issue new, reuse detection

- [x] Task 3: Create googleOAuth.ts (AC: #1, #2, #5)
  - [x] 3.1 `buildGoogleAuthUrl` — constructs Google consent URL
  - [x] 3.2 `exchangeCodeForTokens` — POST to Google token endpoint
  - [x] 3.3 `verifyGoogleIdToken` — jose createRemoteJWKSet + jwtVerify, validates aud
  - [x] 3.4 `handleGoogleCallback` — orchestrates full flow: exchange → verify → findOrCreate → org auto-creation
  - [x] 3.5 Slug generation with uniqueness retry

- [x] Task 4: Create auth routes + mount middleware (AC: #1, #2, #3, #4, #5)
  - [x] 4.1 Install cookie-parser + @types/cookie-parser
  - [x] 4.2 `GET /auth/google` — generate state, set oauth_state cookie, return URL
  - [x] 4.3 `POST /auth/callback` — verify state, call handleGoogleCallback, set token cookies
  - [x] 4.4 `POST /auth/refresh` — read refresh_token cookie, rotate, set new cookies
  - [x] 4.5 `POST /auth/logout` — revoke token, clear cookies
  - [x] 4.6 Mount cookie-parser + auth routes in index.ts

- [x] Task 5: Create Web BFF proxy routes (AC: #1, #4)
  - [x] 5.1 `app/api/auth/login/route.ts` — GET, proxy to Express /auth/google
  - [x] 5.2 `app/api/auth/callback/route.ts` — POST, proxy to Express /auth/callback
  - [x] 5.3 `app/api/auth/refresh/route.ts` — POST, proxy to Express /auth/refresh
  - [x] 5.4 `app/api/auth/logout/route.ts` — POST, proxy to Express /auth/logout

- [x] Task 6: Create login + callback pages (AC: #1, #5)
  - [x] 6.1 `app/(auth)/login/page.tsx` — login page (Server Component)
  - [x] 6.2 `app/(auth)/login/LoginButton.tsx` — Google sign-in button (Client Component)
  - [x] 6.3 `app/(auth)/callback/page.tsx` — callback page (Server Component)
  - [x] 6.4 `app/(auth)/callback/CallbackHandler.tsx` — handles token exchange on mount

- [x] Task 7: Update proxy.ts, api-client.ts, config.ts (AC: #4)
  - [x] 7.1 Add JWT_SECRET to web config.ts
  - [x] 7.2 Update proxy.ts with real JWT verification
  - [x] 7.3 Add 401 → silent refresh → retry logic to api-client.ts
  - [x] 7.4 Add JWT_SECRET to docker-compose.yml web service

- [x] Task 8: Write tests (AC: #3, #4)
  - [x] 8.1 `tokenService.test.ts` — 15 tests (sign, verify, generate, rotate, reuse detection)
  - [x] 8.2 `googleOAuth.test.ts` — 9 tests (URL build, exchange, verify, findOrCreate)
  - [x] 8.3 `routes/auth.test.ts` — 9 tests (all endpoints via HTTP, cookie handling)

## Dev Notes

### Critical Architecture Constraints

1. **jose 6.x ESM** — Import as `import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose'`

2. **BFF pattern** — Browser NEVER calls Express directly. All auth routes proxied through Next.js `/api/auth/*`

3. **Cookie config** — httpOnly, Secure (prod only), SameSite=Lax for all auth cookies

4. **No process.env in API code** — All env via `config.ts` (already has GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, APP_URL)

5. **Pino logging** — `logger.info({ userId, isNewUser }, 'Google OAuth callback processed')`

6. **Privacy-by-architecture** — auth data stays within auth services, no leaking to external APIs

7. **Google OAuth redirect_uri** — `${APP_URL}/callback` — must be registered in Google Cloud Console

8. **Next.js 16** — `searchParams` is a Promise, must `await` in server components

## Dev Agent Record

### Implementation Plan
- Tasks 1-5, 7.1-7.3: Implemented across 2 sessions (shared schemas, token service, Google OAuth, auth routes, BFF proxy, proxy.ts JWT verification, api-client silent refresh)
- Task 6: Login/callback UI pages
- Task 7.4: JWT_SECRET added to docker-compose.yml web service environment
- Task 8: Test suite (33 auth tests total: 15 token, 9 OAuth, 9 routes)

### Debug Log
- **Stale shared dist**: `packages/shared/dist/constants/index.js` was missing the `AUTH` export because it was built before the constant was added. Running `pnpm --filter shared build` resolved all 8 tokenService test failures.
- **ESM/CJS interop in route tests**: Original route tests used `require('shared/schemas')` which failed because the shared package barrel exports use `.js` extensions for ESM. Rewrote tests to mount a real Express app and make HTTP requests via Node's native `fetch`.
- **cookie-parser phantom install**: The package was listed in `package.json` but not installed in `node_modules`. `pnpm --filter api install` resolved it.
- **TypeScript strict mode**: Fixed `noUncheckedIndexedAccess` issues in array indexing (`memberships[0]!`, `token.split('.')[1]!`, `mock.calls[0]!`).
- **Unused prop**: `LoginButton.tsx` declared `redirectPath` but never used it — fixed to pass as query param to `/api/auth/login`.
- **jose in web**: `proxy.ts` imports `jose` for JWT verification but it wasn't a web dependency. Added `jose` to `apps/web/package.json`.

### Completion Notes
All 8 tasks complete. 79 total API tests passing (33 auth-specific). TypeScript type-check passes for all packages. Story implements full Google OAuth flow: consent redirect → callback → user/org creation → JWT + refresh token pair → httpOnly cookie storage → silent refresh → logout with token revocation.

## File List

### New files
- `apps/api/src/services/auth/tokenService.ts` — JWT signing/verification, refresh token rotation
- `apps/api/src/services/auth/googleOAuth.ts` — Google OAuth flow, user/org creation
- `apps/api/src/services/auth/index.ts` — Auth service barrel export
- `apps/api/src/routes/auth.ts` — Auth route handlers (4 endpoints)
- `apps/api/src/services/auth/tokenService.test.ts` — 16 token service tests
- `apps/api/src/services/auth/googleOAuth.test.ts` — 9 Google OAuth tests
- `apps/api/src/routes/auth.test.ts` — 9 route integration tests (HTTP)
- `apps/web/app/api/auth/login/route.ts` — BFF proxy: login
- `apps/web/app/api/auth/callback/route.ts` — BFF proxy: callback
- `apps/web/app/api/auth/refresh/route.ts` — BFF proxy: refresh
- `apps/web/app/api/auth/logout/route.ts` — BFF proxy: logout
- `apps/web/app/(auth)/login/page.tsx` — Login page
- `apps/web/app/(auth)/login/LoginButton.tsx` — Google sign-in button
- `apps/web/app/(auth)/callback/page.tsx` — Callback page
- `apps/web/app/(auth)/callback/CallbackHandler.tsx` — Token exchange handler

### Modified files
- `packages/shared/src/schemas/auth.ts` — Added JWT, callback, login response schemas (created in 1.2)
- `packages/shared/src/types/auth.ts` — Added auth type exports (created in 1.2)
- `packages/shared/src/constants/index.ts` — Added AUTH constant
- `packages/shared/src/schemas/index.ts` — Added auth schema re-exports
- `packages/shared/src/types/index.ts` — Added auth type re-exports
- `apps/api/src/db/schema.ts` — Removed section-header comments
- `apps/api/src/db/queries/refreshTokens.ts` — Added findAnyByHash for reuse detection
- `apps/api/src/index.ts` — Added cookie-parser + auth routes mounting
- `apps/api/src/config.ts` — Added GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, JWT_SECRET, APP_URL env vars
- `apps/api/package.json` — Added cookie-parser, @types/cookie-parser
- `apps/web/proxy.ts` — Added JWT verification for protected routes (uses webEnv)
- `apps/web/lib/api-client.ts` — Added 401 → silent refresh → retry logic (created in 1.1)
- `apps/web/lib/config.ts` — Added JWT_SECRET to web env schema
- `apps/web/package.json` — Added jose dependency
- `docker-compose.yml` — Added JWT_SECRET + env_file to web service

## Change Log

- **2026-02-24**: Tasks 1-5, 7.1-7.3 implemented — shared schemas, token service, Google OAuth, auth routes, BFF proxy, proxy.ts JWT verification, api-client silent refresh
- **2026-02-24**: Tasks 6, 8.1-8.2 implemented — login/callback UI pages, token and OAuth tests
- **2026-02-25**: Task 7.4 implemented — JWT_SECRET in docker-compose.yml
- **2026-02-25**: Task 8.3 rewritten — route tests now use real Express app + HTTP requests (was mock-only). Fixed stale shared dist, ESM/CJS interop, TypeScript strict mode issues, unused prop, missing jose dep in web
- **2026-02-25**: Code review — 3 HIGH, 4 MEDIUM fixes applied:
  - H1: proxy.ts now uses webEnv instead of process.env (config convention)
  - H2: Refresh token reuse detection implemented — findAnyByHash + revokeAllForUser on replay
  - H3: File List corrected — removed ghost entry (api-server.ts), reclassified 3 files as Modified
  - M1: Documented schema.ts + refreshTokens.ts changes in File List
  - M3: Redirect flow completed — sessionStorage persistence through OAuth flow
  - M4: verifyAccessToken now uses jwtPayloadSchema.parse() instead of unsafe type casts
  - Test count: 80 (was 79, +1 reuse detection test)
