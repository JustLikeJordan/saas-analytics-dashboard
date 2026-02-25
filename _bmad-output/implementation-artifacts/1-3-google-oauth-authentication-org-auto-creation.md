# Story 1.3: Google OAuth Authentication & Org Auto-Creation

Status: in-progress

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

- [ ] Task 1: Add shared constants, schemas, and types (AC: #3)
  - [ ] 1.1 Add AUTH constants to `packages/shared/src/constants/index.ts`
  - [ ] 1.2 Add `jwtPayloadSchema`, `googleCallbackSchema`, `loginResponseSchema` to `packages/shared/src/schemas/auth.ts`
  - [ ] 1.3 Update schema barrel exports
  - [ ] 1.4 Add `JwtPayload`, `GoogleCallback`, `LoginResponse` types
  - [ ] 1.5 Update type barrel exports

- [ ] Task 2: Create tokenService.ts (AC: #3, #4)
  - [ ] 2.1 `signAccessToken` — jose SignJWT, HS256, 15-min, claims: sub, org_id, role, isAdmin
  - [ ] 2.2 `verifyAccessToken` — jose jwtVerify, throws AuthenticationError on failure
  - [ ] 2.3 `generateRefreshToken` — crypto.randomBytes(32) hex + SHA-256 hash
  - [ ] 2.4 `createTokenPair` — signs JWT + generates/stores refresh token
  - [ ] 2.5 `rotateRefreshToken` — hash→lookup→revoke old→issue new, reuse detection

- [ ] Task 3: Create googleOAuth.ts (AC: #1, #2, #5)
  - [ ] 3.1 `buildGoogleAuthUrl` — constructs Google consent URL
  - [ ] 3.2 `exchangeCodeForTokens` — POST to Google token endpoint
  - [ ] 3.3 `verifyGoogleIdToken` — jose createRemoteJWKSet + jwtVerify, validates aud
  - [ ] 3.4 `handleGoogleCallback` — orchestrates full flow: exchange → verify → findOrCreate → org auto-creation
  - [ ] 3.5 Slug generation with uniqueness retry

- [ ] Task 4: Create auth routes + mount middleware (AC: #1, #2, #3, #4, #5)
  - [ ] 4.1 Install cookie-parser + @types/cookie-parser
  - [ ] 4.2 `GET /auth/google` — generate state, set oauth_state cookie, return URL
  - [ ] 4.3 `POST /auth/callback` — verify state, call handleGoogleCallback, set token cookies
  - [ ] 4.4 `POST /auth/refresh` — read refresh_token cookie, rotate, set new cookies
  - [ ] 4.5 `POST /auth/logout` — revoke token, clear cookies
  - [ ] 4.6 Mount cookie-parser + auth routes in index.ts

- [ ] Task 5: Create Web BFF proxy routes (AC: #1, #4)
  - [ ] 5.1 `app/api/auth/login/route.ts` — GET, proxy to Express /auth/google
  - [ ] 5.2 `app/api/auth/callback/route.ts` — POST, proxy to Express /auth/callback
  - [ ] 5.3 `app/api/auth/refresh/route.ts` — POST, proxy to Express /auth/refresh
  - [ ] 5.4 `app/api/auth/logout/route.ts` — POST, proxy to Express /auth/logout

- [ ] Task 6: Create login + callback pages (AC: #1, #5)
  - [ ] 6.1 `app/(auth)/login/page.tsx` — login page (Server Component)
  - [ ] 6.2 `app/(auth)/login/LoginButton.tsx` — Google sign-in button (Client Component)
  - [ ] 6.3 `app/(auth)/callback/page.tsx` — callback page (Server Component)
  - [ ] 6.4 `app/(auth)/callback/CallbackHandler.tsx` — handles token exchange on mount

- [ ] Task 7: Update proxy.ts, api-client.ts, config.ts (AC: #4)
  - [ ] 7.1 Add JWT_SECRET to web config.ts
  - [ ] 7.2 Update proxy.ts with real JWT verification
  - [ ] 7.3 Add 401 → silent refresh → retry logic to api-client.ts
  - [ ] 7.4 Add JWT_SECRET to docker-compose.yml web service

- [ ] Task 8: Write tests (AC: #3, #4)
  - [ ] 8.1 `tokenService.test.ts` — ~12 tests (sign, verify, generate, rotate, reuse detection)
  - [ ] 8.2 `googleOAuth.test.ts` — ~10 tests (URL build, exchange, verify, findOrCreate)
  - [ ] 8.3 `routes/auth.test.ts` — ~10 tests (all endpoints, cookie handling)

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
