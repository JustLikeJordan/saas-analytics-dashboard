# Story 1.5: Org Invite Link System

Status: done

## Story

As an **org member**,
I want to generate a shareable invite link so that new users can join my organization,
So that I can collaborate with my team without manual admin intervention.

## Acceptance Criteria

1. **Given** I am an authenticated org member **When** I request an invite link **Then** the system creates an `org_invites` record with a unique token and configurable expiry **And** returns a shareable URL containing the invite token (FR3)

2. **Given** I have received an invite link **When** I visit the link and authenticate with Google **Then** my user account is linked to the inviting organization via `user_orgs` with `role: member` **And** no new org is auto-created (overrides the default FR2 behavior for invited users)

3. **Given** an invite link has expired **When** a user tries to use it **Then** the system shows a clear error message explaining the link has expired with guidance to request a new one

4. **Given** I am already a member of the organization **When** I try to use an invite link for the same org **Then** the system recognizes my existing membership and redirects me to the dashboard without creating a duplicate

5. **Given** the `org_invites` table is created **When** database security is configured **Then** RLS policies are applied to `org_invites` scoped by `org_id`

## Tasks / Subtasks

- [x] Task 1: Create POST BFF proxy route for invite creation (AC: #1)
  - [x] 1.1 Create `apps/web/app/api/invites/route.ts` — POST + GET forwards to Express `/invites` with cookie headers
  - [x] 1.2 Follow existing BFF pattern from `apps/web/app/api/auth/callback/route.ts`

- [x] Task 2: Create invite management UI page (AC: #1)
  - [x] 2.1 Create `apps/web/app/settings/invites/page.tsx` — server component wrapper
  - [x] 2.2 Create `apps/web/app/settings/invites/InviteManager.tsx` — client component with generate, copy, and active invites list
  - [x] 2.3 Owner-only enforcement: API returns 403 for non-owners via `roleGuard('owner')`

- [x] Task 3: Write inviteService tests (AC: #1-4)
  - [x] 3.1 Create `apps/api/src/services/auth/inviteService.test.ts`
  - [x] 3.2 Test generateInvite — creates token, returns raw token + expiry
  - [x] 3.3 Test validateInviteToken — valid token, expired token, used token, not-found token
  - [x] 3.4 Test redeemInvite — new member joins, existing member is idempotent

- [x] Task 4: Write invite routes tests (AC: #1-4)
  - [x] 4.1 Create `apps/api/src/routes/invites.test.ts`
  - [x] 4.2 Test POST /invites — owner creates invite, member gets 403, invalid body gets 400
  - [x] 4.3 Test GET /invites/:token — valid token returns org info, expired returns error, not-found returns 404
  - [x] 4.4 Test GET /invites — owner lists active invites, member gets 403

- [x] Task 5: Generate `_explained.md` docs for new files

- [x] Task 6: Update sprint status

## Dev Notes

### What Already Exists (from Stories 1.1-1.3)

**DO NOT recreate or modify these — they're complete and working:**

- `apps/api/src/db/schema.ts` — `org_invites` table fully defined with indexes
- `apps/api/src/db/queries/orgInvites.ts` — `createInvite`, `findByTokenHash`, `markUsed`, `getActiveInvites`
- `apps/api/src/services/auth/inviteService.ts` — `generateInvite`, `validateInviteToken`, `redeemInvite`
- `apps/api/src/routes/invites.ts` — `inviteRouter` (POST /, owner-only) + `publicInviteRouter` (GET /invites/:token)
- `apps/api/src/index.ts` — both routers mounted: `publicInviteRouter` on app, `inviteRouter` on protectedRouter
- `apps/api/src/routes/protected.ts` — mounts inviteRouter under `/invites`
- `apps/api/src/services/auth/googleOAuth.ts` — `handleGoogleCallback` handles inviteToken param, redeems invite, joins correct org
- `apps/web/app/invite/[token]/page.tsx` + `InviteAccept.tsx` — invite landing page with validation, error display, "Join with Google" button
- `apps/web/app/(auth)/callback/CallbackHandler.tsx` — reads `pending_invite_token` from sessionStorage, passes to callback
- `apps/web/app/api/invites/[token]/route.ts` — BFF GET proxy for token validation
- `packages/shared/src/schemas/auth.ts` — `createInviteSchema`, `inviteTokenParamSchema`, `googleCallbackSchema` (includes inviteToken)
- `packages/shared/src/constants/index.ts` — `INVITES` (DEFAULT_EXPIRY_DAYS: 7, TOKEN_BYTES: 32)

### Critical Architecture Constraints

1. **Owner-only invite generation** — `roleGuard('owner')` on POST /invites route. Members can't generate invites.

2. **Token security** — 32 random bytes → SHA-256 hash. Only the hash is stored in DB. Raw token appears in the URL.

3. **Invite flow** — `/invite/:token` → validate → store token in sessionStorage → Google OAuth → callback handler reads token → `handleGoogleCallback` redeems invite → user joins org as member

4. **No CORS** — BFF proxy pattern. Frontend calls `/api/invites`, proxy forwards to Express `:3001/invites`.

5. **Express 5** — Async route handlers auto-forward rejections to errorHandler. No manual try/catch.

6. **RLS note** — Application-level org_id scoping is enforced by Drizzle queries. PostgreSQL RLS is a defense-in-depth layer — deferred to Story 1.6 or a dedicated infra story since it affects all tenant tables, not just org_invites.

### File Placement

```
apps/web/app/api/invites/
├── route.ts                          # NEW — POST proxy for invite creation
├── [token]/route.ts                  # EXISTS — GET proxy for token validation

apps/web/app/settings/invites/
├── page.tsx                          # NEW — server component wrapper
├── InviteManager.tsx                 # NEW — client component

apps/api/src/services/auth/
├── inviteService.test.ts             # NEW — 6+ tests

apps/api/src/routes/
├── invites.test.ts                   # NEW — 7+ tests
```

### Previous Story Intelligence

- BFF proxy pattern: forward cookies, return response + Set-Cookie headers
- Test infrastructure: `createTestApp()` in `apps/api/src/test/helpers/testApp.ts`
- Mock pattern for services: vi.mock the service module, mock individual functions
- ESM imports require `.js` extensions in API app
- `packages/shared/dist/` can get stale — rebuild with `pnpm --filter shared build` if needed

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Org Invites]
- [Source: _bmad-output/project-context.md#RBAC]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None

### Completion Notes List

(Updated as implementation progresses)

### File List

**New files:**
- `apps/web/app/api/invites/route.ts`
- `apps/web/app/settings/invites/page.tsx`
- `apps/web/app/settings/invites/InviteManager.tsx`
- `apps/api/src/services/auth/inviteService.test.ts`
- `apps/api/src/routes/invites.test.ts`
- Various `_explained.md` companion docs

**Modified files:**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
