# Story 1.2: Database Schema & Core Identity Tables

Status: review

## Story

As a **developer**,
I want database migrations to run automatically on startup with core identity tables created,
So that the application has a solid, org-scoped data foundation.

## Acceptance Criteria

1. **Given** Docker Compose services are running **When** the API container starts for the first time **Then** Drizzle ORM 0.45.x runs versioned SQL migrations automatically via the Docker entrypoint **And** the following tables are created: `users`, `orgs`, `user_orgs` (with role enum: owner/member), `refresh_tokens` **And** `users` table includes `is_platform_admin` boolean (default false)

2. **Given** the database schema is created **When** a developer imports database access in a service **Then** they import from `db/queries/` barrel exports, never from `db/index.ts` directly **And** every query function requires an `orgId` parameter — calls without `orgId` fail closed (NFR9)

3. **Given** the `user_orgs` table exists **When** I inspect the schema **Then** it supports many-to-many user-to-org relationships with a `role` column (owner/member) **And** the schema is designed for single-org-per-user MVP with documented multi-org readiness

4. **Given** tenant tables exist with `org_id` columns **When** database security is configured **Then** Row-Level Security (RLS) policies are created on all tenant tables as defense-in-depth behind application-level `org_id` filtering (via raw SQL in Drizzle migration files — Drizzle ORM does not support RLS declaratively) **And** each subsequent story that creates new tables must include RLS policies for those tables

## Tasks / Subtasks

- [x] Task 1: Create Drizzle schema file with 4 identity tables + enums (AC: #1, #3)
  - [x] 1.1 Create `apps/api/src/db/schema.ts` with pgEnum definitions (`user_role`)
  - [x] 1.2 Define `users` table (id identity, email, name, google_id, avatar_url, is_platform_admin, created_at, updated_at)
  - [x] 1.3 Define `orgs` table (id identity, name, slug, created_at)
  - [x] 1.4 Define `user_orgs` table (id identity, user_id FK, org_id FK, role enum, joined_at) with unique(user_id, org_id)
  - [x] 1.5 Define `refresh_tokens` table (id identity, token_hash, user_id FK, org_id FK, expires_at, revoked_at, created_at)
  - [x] 1.6 Define Drizzle v1 relations (users ↔ userOrgs ↔ orgs, users → refreshTokens)
  - [x] 1.7 Add indexes: `idx_users_email`, `idx_users_google_id`, `idx_user_orgs_user_id`, `idx_user_orgs_org_id`, `idx_refresh_tokens_token_hash`, `idx_refresh_tokens_user_id`

- [x] Task 2: Generate and verify first migration (AC: #1)
  - [x] 2.1 Update `apps/api/src/lib/db.ts` to pass `schema` object for relational queries
  - [x] 2.2 Run `pnpm --filter api db:generate` to create versioned SQL migration
  - [x] 2.3 Inspect generated SQL for correctness (identity columns, enums, FKs, indexes)
  - [x] 2.4 Verify type-check passes with new schema

- [x] Task 3: Create RLS policies via custom migration (AC: #4)
  - [x] 3.1 Run `pnpm --filter api exec drizzle-kit generate --custom --name=add-rls-policies`
  - [x] 3.2 Write raw SQL: enable RLS on `user_orgs` and `refresh_tokens` (tables with `org_id`)
  - [x] 3.3 Create tenant isolation policies using `current_setting('app.current_org_id')`
  - [x] 3.4 Create platform admin bypass policy
  - [x] 3.5 Deferred: app_api role creation (not needed for MVP — default superuser connection)
  - [x] 3.6 Deferred: role privileges (same reason)

- [x] Task 4: Create db/queries/ barrel with typed query functions (AC: #2)
  - [x] 4.1 Create `apps/api/src/db/queries/users.ts` — findByGoogleId, findByEmail, findById, createUser, updateUser
  - [x] 4.2 Create `apps/api/src/db/queries/orgs.ts` — createOrg, findBySlug, findById
  - [x] 4.3 Create `apps/api/src/db/queries/userOrgs.ts` — addMember, getUserOrgs, getOrgMembers, findMembership
  - [x] 4.4 Create `apps/api/src/db/queries/refreshTokens.ts` — createToken, findByHash, revokeToken, revokeAllForUser
  - [x] 4.5 Create `apps/api/src/db/queries/index.ts` — barrel re-export all query modules

- [x] Task 5: Create shared Zod schemas and inferred types (AC: #1, #2)
  - [x] 5.1 Create `packages/shared/src/schemas/auth.ts` — userSchema, orgSchema, userOrgSchema, roleSchema, createUserSchema, createOrgSchema
  - [x] 5.2 Update `packages/shared/src/schemas/index.ts` — re-export auth schemas
  - [x] 5.3 Create `packages/shared/src/types/auth.ts` — z.infer types (User, Org, UserOrg, Role, CreateUser, CreateOrg)
  - [x] 5.4 Update `packages/shared/src/types/index.ts` — re-export auth types

- [x] Task 6: Create migrate.ts runner + update entrypoint (AC: #1)
  - [x] 6.1 Create `apps/api/src/db/migrate.ts` — programmatic migration runner using drizzle-orm/postgres-js/migrator
  - [x] 6.2 Update `entrypoint.sh` to use tsx migrate.ts instead of drizzle-kit CLI
  - [x] 6.3 Add `db:migrate:run` script to package.json

- [x] Task 7: Write tests (AC: #1, #2, #3)
  - [x] 7.1 Create `apps/api/src/db/schema.test.ts` — 21 structural tests (tables, columns, enums, indexes, FKs, relations)
  - [x] 7.2 Create `apps/api/src/db/queries/users.test.ts` — 5 mocked query tests (findByEmail, findByGoogleId, findById, createUser)
  - [x] 7.3 Verify type-check passes: `pnpm type-check` — all 3 packages pass
  - [x] 7.4 Verify tests pass: `pnpm --filter api test` — 26/26 pass

## Dev Notes

### Critical Architecture Constraints

1. **Identity columns, NOT serial** — Use `integer().primaryKey().generatedAlwaysAsIdentity()` for all primary keys. This is PostgreSQL 18 best practice.

2. **Drizzle ORM 0.45.x — v1 relations API ONLY** — Use `relations()` from `drizzle-orm`, NOT `defineRelations()` which is 1.0-beta only. Example:
   ```typescript
   import { relations } from 'drizzle-orm';
   export const usersRelations = relations(users, ({ many }) => ({
     userOrgs: many(userOrgs),
   }));
   ```

3. **drizzle-orm/zod, NOT drizzle-zod** — Zod integration moved into core at 0.33.0. Import from `drizzle-orm/zod`:
   ```typescript
   import { createSelectSchema, createInsertSchema } from 'drizzle-orm/zod';
   ```
   Watch for Zod 3.24.x compatibility issues (missing `~standard` properties). Pin to `zod@3.23.8` if issues arise.

4. **Single schema file** — All table definitions in `apps/api/src/db/schema.ts`. This avoids circular import issues and is the recommended pattern for Drizzle 0.45.x with 11 tables.

5. **Column naming** — Drizzle column definitions use the SQL name as first argument: `varchar('google_id', { length: 255 })`. The JS property is camelCase, the SQL column is snake_case.

6. **db.ts update required** — The existing `db.ts` must pass the schema object to enable relational queries:
   ```typescript
   import * as schema from '../db/schema.js';
   export const db = drizzle(queryClient, { schema });
   ```

7. **RLS via custom migration** — Use `drizzle-kit generate --custom --name=add-rls-policies` to create an empty SQL migration file. Fill with raw SQL for RLS policies. Use `-->  statement-breakpoint` to separate SQL statements.

8. **org_id enforcement pattern** — Every query function in `db/queries/*.ts` MUST require `orgId` parameter. Functions that don't need org scoping (e.g., `findUserByGoogleId`) still take `orgId` where applicable, or are documented as intentional exceptions (user lookup is cross-org by design for auth).

9. **Exception: users and orgs tables don't have org_id** — The `users` table is cross-org (a user may belong to multiple orgs). The `orgs` table IS the org entity. RLS on these tables is based on `user_orgs` membership, not a direct `org_id` column. For MVP (single-org-per-user), application-level scoping in query functions is the primary guard; RLS is defense-in-depth.

10. **Constraint naming convention** — Follow `{table}_{type}_{columns}`:
    - Primary keys: `users_pkey` (auto by Drizzle)
    - Unique: `user_orgs_unique_user_org`
    - Foreign keys: `user_orgs_user_id_users_id_fk` (auto by Drizzle `.references()`)
    - Indexes: `idx_users_email`, `idx_refresh_tokens_token_hash`

### Drizzle Table Definition Patterns

```typescript
// Enum definition
export const userRoleEnum = pgEnum('user_role', ['owner', 'member']);

// Table with identity column, FK references, indexes
export const userOrgs = pgTable('user_orgs', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  orgId: integer('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
  role: userRoleEnum('role').default('member').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('user_orgs_unique_user_org').on(table.userId, table.orgId),
  index('idx_user_orgs_user_id').on(table.userId),
  index('idx_user_orgs_org_id').on(table.orgId),
]);
```

### Query Function Pattern (orgId Enforcement)

```typescript
// apps/api/src/db/queries/userOrgs.ts
import { eq, and } from 'drizzle-orm';
import { db } from '../../lib/db.js';
import { userOrgs, users, orgs } from '../schema.js';

export async function getOrgMembers(orgId: number) {
  return db.query.userOrgs.findMany({
    where: eq(userOrgs.orgId, orgId),
    with: { user: true },
  });
}

export async function addMember(orgId: number, userId: number, role: 'owner' | 'member' = 'member') {
  return db.insert(userOrgs).values({ userId, orgId, role }).returning();
}

// Cross-org lookup (auth-only, intentional exception — documented)
export async function findUserByGoogleId(googleId: string) {
  return db.query.users.findFirst({
    where: eq(users.googleId, googleId),
  });
}
```

### RLS Policy Pattern (Custom Migration SQL)

```sql
-- Enable RLS on tenant tables
ALTER TABLE "user_orgs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "refresh_tokens" ENABLE ROW LEVEL SECURITY;

-- Tenant isolation: user_orgs
CREATE POLICY "user_orgs_tenant_isolation" ON "user_orgs"
  FOR ALL USING (org_id = current_setting('app.current_org_id', true)::integer);

-- Tenant isolation: refresh_tokens
CREATE POLICY "refresh_tokens_tenant_isolation" ON "refresh_tokens"
  FOR ALL USING (org_id = current_setting('app.current_org_id', true)::integer);

-- Platform admin bypass (can see all rows)
CREATE POLICY "user_orgs_admin_bypass" ON "user_orgs"
  FOR ALL USING (current_setting('app.is_admin', true)::boolean = true);
CREATE POLICY "refresh_tokens_admin_bypass" ON "refresh_tokens"
  FOR ALL USING (current_setting('app.is_admin', true)::boolean = true);
```

Note: `current_setting(name, true)` — the `true` makes it return NULL (not error) if the setting doesn't exist. Application middleware sets these per-request: `SET LOCAL app.current_org_id = X; SET LOCAL app.is_admin = false;`

### Database Schema — Full Column Spec (4 Tables)

**users**
| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK, GENERATED ALWAYS AS IDENTITY |
| email | varchar(255) | NOT NULL, UNIQUE |
| name | varchar(255) | NOT NULL |
| google_id | varchar(255) | UNIQUE (nullable — allows future non-Google auth) |
| avatar_url | text | nullable |
| is_platform_admin | boolean | NOT NULL, DEFAULT false |
| created_at | timestamptz | NOT NULL, DEFAULT now() |
| updated_at | timestamptz | NOT NULL, DEFAULT now() |

**orgs**
| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK, GENERATED ALWAYS AS IDENTITY |
| name | varchar(255) | NOT NULL |
| slug | varchar(255) | NOT NULL, UNIQUE |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

**user_orgs**
| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK, GENERATED ALWAYS AS IDENTITY |
| user_id | integer | NOT NULL, FK → users(id) ON DELETE CASCADE |
| org_id | integer | NOT NULL, FK → orgs(id) ON DELETE CASCADE |
| role | user_role enum | NOT NULL, DEFAULT 'member' |
| joined_at | timestamptz | NOT NULL, DEFAULT now() |
| UNIQUE(user_id, org_id) | | |

**refresh_tokens**
| Column | Type | Constraints |
|--------|------|-------------|
| id | integer | PK, GENERATED ALWAYS AS IDENTITY |
| token_hash | varchar(255) | NOT NULL, UNIQUE |
| user_id | integer | NOT NULL, FK → users(id) ON DELETE CASCADE |
| org_id | integer | NOT NULL, FK → orgs(id) ON DELETE CASCADE |
| expires_at | timestamptz | NOT NULL |
| revoked_at | timestamptz | nullable |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

### Timestamps — Use `withTimezone: true`

All timestamp columns MUST use `timestamp('col_name', { withTimezone: true })` — maps to PostgreSQL `TIMESTAMP WITH TIME ZONE`. Never bare `timestamp` (no timezone).

### What This Story Creates

```
apps/api/src/
├── db/
│   ├── schema.ts              ← NEW: 4 tables + 1 enum + relations
│   ├── migrate.ts             ← NEW: Programmatic migration runner
│   └── queries/
│       ├── users.ts           ← NEW: findByGoogleId, findByEmail, createUser
│       ├── orgs.ts            ← NEW: createOrg, findBySlug, findById
│       ├── userOrgs.ts        ← NEW: addMember, getUserOrgs, getOrgMembers, findMembership
│       ├── refreshTokens.ts   ← NEW: createToken, findByHash, revokeToken, revokeAllForUser
│       └── index.ts           ← NEW: Barrel re-export
├── lib/
│   └── db.ts                  ← MODIFY: Pass schema for relational queries
├── drizzle/
│   └── migrations/
│       ├── 0000_*.sql         ← GENERATED: Schema migration (tables, enums, FKs, indexes)
│       └── 0001_*.sql         ← GENERATED: RLS policies (custom migration)

packages/shared/src/
├── schemas/
│   ├── auth.ts                ← NEW: Zod schemas for user, org, role
│   └── index.ts               ← MODIFY: Re-export auth schemas
├── types/
│   ├── auth.ts                ← NEW: Inferred types (User, Org, UserOrg, Role)
│   └── index.ts               ← MODIFY: Re-export auth types
```

### What This Story Does NOT Create (Deferred)

- Remaining 7 tables: datasets, data_rows, subscriptions, ai_summaries, analytics_events, org_invites, shares (created by their respective stories in Epics 1.5, 1.6, 2.1, 3.2, 4.2)
- Authentication routes or JWT logic (Story 1.3)
- RBAC middleware (Story 1.4)
- Seed data (Story 2.1)
- The `SET LOCAL app.current_org_id` per-request middleware (Story 1.4 — the RLS settings are set in auth middleware)

### Previous Story Intelligence (Story 1.1)

**Files already created that this story depends on:**
- `apps/api/src/lib/db.ts` — Drizzle client using postgres-js (max 10 connections). Needs update to pass schema.
- `apps/api/drizzle.config.ts` — Points to `./src/db/schema.ts` (create this), outputs to `./drizzle/migrations/`
- `apps/api/entrypoint.sh` — Runs `drizzle-kit migrate` before starting API. Handles non-zero exit gracefully.
- `packages/shared/src/constants/index.ts` — Has `ROLES` constant (`owner`, `member`) and `Role` type.
- `packages/shared/src/schemas/index.ts` — Empty, ready for schemas.
- `packages/shared/src/types/index.ts` — Empty, ready for types.

**Gotchas from Story 1.1:**
- Package imports use `shared/schemas` (not `@shared/schemas`) — subpath exports in package.json handle resolution
- Express middleware chain already established: correlationId → [stripe webhook placeholder] → json parser → pino-http → routes → errorHandler
- Shared package has `"import"` condition pointing to `./dist/*.js` for production
- `tsconfig.base.json` has `noUncheckedIndexedAccess: true` — optional chaining needed on object access

**Git commits establishing patterns:**
- `b469baf` — Code review fixes including Pino logging convention, ESLint import boundaries
- `898daeb` — Full monorepo scaffold, Docker 4-service compose
- Import: `import { env } from '../config.js'` (note .js extension for ESM)

### Library Versions (Must Match)

| Package | Version | Notes |
|---------|---------|-------|
| drizzle-orm | 0.45.1 | Already installed in Story 1.1 |
| drizzle-kit | 0.31.9 | Already installed. Use `dialect: 'postgresql'` |
| postgres | latest | postgres-js driver (already in db.ts) |
| zod | 3.23.8 | Pin to this if 3.24.x causes drizzle-orm/zod issues |
| PostgreSQL | 18.2 | Docker image `postgres:18.2` |

### Testing Strategy

**Unit tests (Vitest):**
- Schema structure tests: verify exports, column names, enum values, foreign key targets
- Query function tests: mock `db` instance, verify correct query construction, verify orgId is always passed

**Integration tests (manual/Docker):**
- `docker compose up` → verify migrations run → inspect tables via `psql`
- `pnpm --filter api type-check` passes with new schema
- `pnpm --filter shared type-check` passes with new schemas/types

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Database Schema, DB Queries, Multi-tenancy, RLS]
- [Source: _bmad-output/planning-artifacts/prd.md — NFR9 (org_id scoping), NFR13 (env security)]
- [Source: _bmad-output/project-context.md — Drizzle ORM Patterns, Database Naming, Multi-Tenancy]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.2 acceptance criteria]
- [Source: _bmad-output/implementation-artifacts/1-1-monorepo-scaffold-docker-development-environment.md — Previous story file list, gotchas, code review fixes]
- [Source: Drizzle ORM 0.45.x docs — Identity columns, pgEnum, v1 relations, drizzle-orm/zod, RLS custom migrations]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Type-check: all 3 packages pass (shared, api, web)
- Tests: 26/26 pass (21 schema structural + 5 query mocked)
- Lint: pre-existing failure (missing eslint.config.js in api/shared — from Story 1.1)

### Completion Notes List

- Used `integer().primaryKey().generatedAlwaysAsIdentity()` for all PKs (PostgreSQL 18 identity columns)
- Used Drizzle v1 `relations()` API (NOT v2 `defineRelations()` which is 1.0-beta only)
- RLS policies cover `user_orgs` and `refresh_tokens` (the two tables with `org_id` columns)
- `users` and `orgs` tables intentionally lack RLS (no `org_id` — scoping is application-level via query functions)
- Deferred `app_api` PostgreSQL role creation — MVP uses default superuser connection; role-based access is a hardening task
- Programmatic migration runner (`migrate.ts`) preferred over `drizzle-kit migrate` CLI for Docker reliability
- Shared Zod schemas are manually authored (not `drizzle-orm/zod` auto-generated) for explicit validation control
- Cross-org query functions (findUserByEmail, findUserByGoogleId) documented as intentional auth-only exceptions

### File List

**Created:**
- `apps/api/src/db/schema.ts` — 4 tables + 1 enum + 4 relation definitions
- `apps/api/src/db/migrate.ts` — Programmatic migration runner
- `apps/api/src/db/queries/users.ts` — findUserByEmail, findUserByGoogleId, findUserById, createUser, updateUser
- `apps/api/src/db/queries/orgs.ts` — createOrg, findOrgBySlug, findOrgById
- `apps/api/src/db/queries/userOrgs.ts` — addMember, findMembership, getUserOrgs, getOrgMembers
- `apps/api/src/db/queries/refreshTokens.ts` — createRefreshToken, findByHash, revokeToken, revokeAllForUser
- `apps/api/src/db/queries/index.ts` — Barrel re-export (usersQueries, orgsQueries, userOrgsQueries, refreshTokensQueries)
- `apps/api/drizzle/migrations/0000_cold_peter_parker.sql` — Schema migration (tables, enums, FKs, indexes)
- `apps/api/drizzle/migrations/0001_add-rls-policies.sql` — RLS policies (tenant isolation + admin bypass)
- `apps/api/src/db/schema.test.ts` — 21 structural tests
- `apps/api/src/db/queries/users.test.ts` — 5 mocked query tests
- `packages/shared/src/schemas/auth.ts` — Zod schemas (roleSchema, userSchema, orgSchema, userOrgSchema, createUserSchema, createOrgSchema)
- `packages/shared/src/types/auth.ts` — Inferred types (Role, User, Org, UserOrg, CreateUser, CreateOrg)

**Modified:**
- `apps/api/src/lib/db.ts` — Added schema import for relational queries
- `apps/api/entrypoint.sh` — Changed from drizzle-kit CLI to tsx migrate.ts
- `apps/api/package.json` — Added db:migrate:run script
- `packages/shared/src/schemas/index.ts` — Re-export auth schemas
- `packages/shared/src/types/index.ts` — Re-export auth types
- `apps/api/drizzle/migrations/meta/0001_snapshot.json` — Auto-generated by drizzle-kit
- `apps/api/drizzle/migrations/meta/_journal.json` — Auto-generated migration journal
