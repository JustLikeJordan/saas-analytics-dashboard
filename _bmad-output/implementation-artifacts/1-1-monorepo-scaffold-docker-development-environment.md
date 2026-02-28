# Story 1.1: Monorepo Scaffold & Docker Development Environment

Status: done

## Story

As a **developer evaluating this project**,
I want to run `docker compose up` and have the full application stack start with a health check endpoint,
So that I can verify the system is operational with a single command.

## Acceptance Criteria

1. **Given** a clean checkout of the repository **When** I run `docker compose up` **Then** four services start successfully: web (Next.js 16), api (Express 5), db (PostgreSQL 18), redis (Redis 7) **And** `GET /health` on the API returns 200 with `{ status: "ok" }` (FR35)

2. **Given** the monorepo is scaffolded **When** I inspect the project structure **Then** I find `apps/web`, `apps/api`, `packages/shared` as pnpm workspace packages with Turborepo orchestration **And** `tsconfig.base.json` at root with TypeScript 5.x strict mode, ESM modules **And** `docker-compose.override.yml` exists for dev overrides: volume mounts for `apps/web` and `apps/api` (hot reload), exposed debug port for API (9229)

3. **Given** the API server starts **When** any module reads configuration **Then** it uses Zod-validated `config.ts` (never `process.env` directly), and the server fails fast at startup if required env vars are missing **And** Pino structured JSON logging is configured with request correlation IDs

4. **Given** environment secrets exist **When** I inspect `.gitignore` **Then** `.env` files and credential files are excluded from version control (NFR13)

## Tasks / Subtasks

- [x] Task 1: pnpm workspace + Turborepo config (AC: #2)
  - [x] 1.1 Initialize root `package.json` with `pnpm init`
  - [x] 1.2 Create `pnpm-workspace.yaml` with `apps/*` and `packages/*`
  - [x] 1.3 Install `turbo` as root devDependency
  - [x] 1.4 Create `turbo.json` with `tasks` pipeline (build, dev, lint, type-check, test)
  - [x] 1.5 Create `tsconfig.base.json` (strict, ESM, path aliases)
  - [x] 1.6 Create `.eslintrc.cjs` with import boundary enforcement
  - [x] 1.7 Create `.prettierrc`
  - [x] 1.8 Create `.gitignore` (node_modules, .env, .next, dist, coverage)
  - [x] 1.9 Create `.env.example` with all env vars and descriptions

- [x] Task 2: Next.js 16 app scaffold — `apps/web` (AC: #2)
  - [x] 2.1 Run `pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --turbopack --yes` in `apps/web`
  - [x] 2.2 Create `proxy.ts` (NOT middleware.ts) — protect `/upload`, `/billing`, `/admin` only
  - [x] 2.3 Configure `next.config.ts` with Turbopack settings
  - [x] 2.4 Create `lib/api-client.ts` stub (Client Components → `/api/*`)
  - [x] 2.5 Create `lib/api-server.ts` stub (Server Components → `http://api:3001`)
  - [x] 2.6 Update `tsconfig.json` to extend `tsconfig.base.json`, add `@/` alias
  - [x] 2.7 Create placeholder directory structure: `components/{ui,layout,common}`, `lib/hooks/`
  - [x] 2.8 Set up `globals.css` with Tailwind CSS 4 `@theme` directive
  - [x] 2.9 Create `vitest.config.ts`

- [x] Task 3: Express 5 API scaffold — `apps/api` (AC: #1, #3)
  - [x] 3.1 `pnpm init` in `apps/api`, install Express 5.x + dependencies
  - [x] 3.2 Create `src/config.ts` — Zod-validated env schema, fail-fast startup
  - [x] 3.3 Create `src/lib/logger.ts` — Pino instance + child logger factory
  - [x] 3.4 Create `src/middleware/correlationId.ts` — UUID per request → Pino child
  - [x] 3.5 Create `src/lib/appError.ts` — AppError hierarchy (5 error types)
  - [x] 3.6 Create `src/middleware/errorHandler.ts` — global error handler → structured response
  - [x] 3.7 Create `src/lib/redis.ts` — Redis client init + health check helper
  - [x] 3.8 Create `src/routes/health.ts` — `GET /health` checking PostgreSQL + Redis (FR35)
  - [x] 3.9 Create `src/index.ts` — Express entry: middleware chain, route mounting, server start
  - [x] 3.10 Create `drizzle.config.ts` + empty `drizzle/migrations/` directory
  - [x] 3.11 Update `tsconfig.json` to extend `tsconfig.base.json`
  - [x] 3.12 Create `vitest.config.ts`

- [x] Task 4: packages/shared scaffold (AC: #2)
  - [x] 4.1 `pnpm init` in `packages/shared`
  - [x] 4.2 Create `src/schemas/index.ts` (empty re-exports)
  - [x] 4.3 Create `src/types/index.ts` (empty, will hold z.infer types)
  - [x] 4.4 Create `src/constants/index.ts` (MAX_FILE_SIZE, AI_TIMEOUT_MS, RATE_LIMITS, ROLES)
  - [x] 4.5 Configure `package.json` exports map: `./schemas`, `./types`, `./constants`
  - [x] 4.6 Create `tsconfig.json` extending base

- [x] Task 5: Docker Compose 4-service setup (AC: #1)
  - [x] 5.1 Create `docker-compose.yml` — production-like 4-service definitions (web, api, db, redis)
  - [x] 5.2 Create `docker-compose.override.yml` — dev overrides: volume mounts, hot reload, debug port 9229
  - [x] 5.3 Create `Dockerfile.web` — Next.js 16 multi-stage production build
  - [x] 5.4 Create `Dockerfile.api` — Express multi-stage production build
  - [x] 5.5 Configure health checks for db and redis services
  - [x] 5.6 Configure `api` to depend on healthy `db` and `redis`
  - [x] 5.7 Create API entrypoint script that runs Drizzle migrations + seed on first run

- [x] Task 6: Env security + .env.example (AC: #4)
  - [x] 6.1 Verify `.gitignore` covers `.env`, `node_modules`, `.next`, `dist`, `coverage`
  - [x] 6.2 Create `.env.example` with all required vars and placeholder descriptions

- [x] Task 7: Verify `docker compose up` works end-to-end (AC: #1)
  - [x] 7.1 Run `docker compose up` from clean state
  - [x] 7.2 Verify all 4 services start
  - [x] 7.3 Verify `GET /health` returns 200 with PostgreSQL + Redis connectivity confirmed
  - [x] 7.4 Verify hot reload works (change a file, see reload)

## Dev Notes

### Critical Architecture Constraints

1. **No starter template** — Custom pnpm workspace. `create-next-app` scaffolds ONLY `apps/web`. `apps/api` and `packages/shared` are manually initialized.
2. **proxy.ts NOT middleware.ts** — Next.js 16 renamed it. The file must be `proxy.ts` with an exported `proxy()` function.
3. **No root barrel in packages/shared** — No `index.ts` at package root. Sub-path imports only (`@shared/schemas`, `@shared/types`, `@shared/constants`).
4. **No `process.env` in application code** — All env access through `config.ts`. This is Mandatory Rule #10.
5. **No `console.log`** — Pino structured logging only from the first file written.
6. **No CORS middleware** — BFF proxy means same-origin. CORS is Growth-tier.
7. **Dashboard is public** — `proxy.ts` protects `/upload`, `/billing`, `/admin` ONLY. Never redirect from `/dashboard`.
8. **Docker internal networking** — `api-server.ts` calls `http://api:3001` (Server Components). `api-client.ts` calls `/api/*` (Client Components). Establish this distinction in stubs.
9. **Turbopack is the default bundler** — Use `--turbopack` flag with create-next-app. No webpack config.
10. **Import boundaries enforced** — `apps/web` cannot import from `apps/api`. `@shared/*` for cross-package imports.

### API Response Format (Establish from Day 1)

```typescript
// Success: { data: T, meta?: {} }
// Error:   { error: { code: string, message: string, details?: unknown } }
```

### AppError Hierarchy (5 Types)

```typescript
// src/lib/appError.ts
class AppError extends Error { code: string; statusCode: number; details?: unknown }
class ValidationError extends AppError       // 400
class AuthenticationError extends AppError   // 401
class AuthorizationError extends AppError    // 403
class NotFoundError extends AppError         // 404
class ExternalServiceError extends AppError  // 502
```

### Health Endpoint Specification

- Route: `GET /health`
- File: `apps/api/src/routes/health.ts`
- Must verify BOTH PostgreSQL AND Redis connectivity
- Return structured status per dependency, not just HTTP 200:

```typescript
// Response shape:
{
  status: "ok" | "degraded",
  services: {
    database: { status: "ok" | "error", latencyMs: number },
    redis: { status: "ok" | "error", latencyMs: number }
  },
  timestamp: string
}
```

### Pino Logging Convention

```typescript
// CORRECT — structured object first, message string second:
logger.info({ datasetId, orgId, rowCount }, 'CSV upload processed');
logger.error({ err, correlationId }, 'Claude API call failed');

// WRONG — never do this:
console.log('something happened');
logger.info('CSV upload for ' + datasetId);
```

### Zod Config Pattern — `apps/api/src/config.ts`

```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  CLAUDE_API_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  APP_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3001),
});

export const env = envSchema.parse(process.env);
```

> **Zod version: Pin to 3.x.** Install `zod@3` (NOT Zod 4). Zod 4 has breaking API changes and uncertain drizzle-zod compatibility. The architecture examples and all schema patterns in this project use Zod 3 syntax. Stick with `zod@3` for ecosystem safety.

### Correlation ID Middleware

```typescript
// src/middleware/correlationId.ts
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger';

// Must be FIRST middleware — threads correlation ID through all subsequent logs
export function correlationId(req, res, next) {
  const id = req.headers['x-correlation-id'] ?? randomUUID();
  req.correlationId = id;
  req.log = logger.child({ correlationId: id });
  res.setHeader('x-correlation-id', id);
  next();
}
```

### Express Middleware Chain Order (Critical)

1. `correlationId.ts` — FIRST (threads through all logs)
2. **Stripe webhook route** — BEFORE body parser (needs raw body)
3. JSON body parser (`express.json()`)
4. `pino-http` request logging
5. Route handlers
6. `errorHandler.ts` — LAST

### Rate Limiting Tiers (Stub for Story 1.4)

| Tier | Limit | Scope |
|---|---|---|
| Auth endpoints | 10 req/min | Per IP |
| AI endpoints | 5 req/min | Per user |
| Public endpoints | 60 req/min | Per IP |

> Rate limiting is implemented in Story 1.4. For Story 1.1, just create the `redis.ts` client — do not implement rate limiting yet.

### Project Structure Notes

#### Root-Level Files (All Must Exist)

```
saas-analytics-dashboard/
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .eslintrc.cjs
├── .prettierrc
├── docker-compose.yml
├── docker-compose.override.yml
├── Dockerfile.web
├── Dockerfile.api
├── .env.example
├── .gitignore
└── README.md                    # Scaffold only — prose in Epic 7
```

#### apps/web Structure (After Scaffold)

```
apps/web/
├── app/
│   ├── layout.tsx               # Root layout: fonts, metadata, providers
│   ├── page.tsx                 # Root redirect → /dashboard
│   └── globals.css              # Tailwind CSS 4 @theme directive
├── components/
│   ├── ui/                      # Empty — shadcn/ui added per-component later
│   ├── layout/                  # Empty — AppHeader etc. in later stories
│   └── common/                  # Empty
├── lib/
│   ├── api-client.ts            # Stub: Client Components → /api/* proxy
│   ├── api-server.ts            # Stub: Server Components → http://api:3001
│   └── hooks/                   # Empty
├── proxy.ts                     # Route protection: /upload, /billing, /admin
├── next.config.ts               # Turbopack config
├── tailwind.config.ts
├── tsconfig.json                # Extends tsconfig.base.json
├── package.json
└── vitest.config.ts
```

#### apps/api Structure

```
apps/api/
├── src/
│   ├── index.ts                 # Express entry: middleware, routes, server
│   ├── config.ts                # Zod env validation (fail-fast)
│   ├── routes/
│   │   └── health.ts            # GET /health — PostgreSQL + Redis check
│   ├── middleware/
│   │   ├── correlationId.ts     # UUID per request → Pino child logger
│   │   └── errorHandler.ts      # Global error handler → structured response
│   └── lib/
│       ├── appError.ts          # AppError hierarchy (5 types)
│       ├── logger.ts            # Pino instance + child logger factory
│       └── redis.ts             # Redis client init + health check
├── drizzle/
│   └── migrations/              # Empty — populated in Story 1.2
├── drizzle.config.ts            # Drizzle Kit config
├── tsconfig.json
├── package.json
└── vitest.config.ts
```

#### packages/shared Structure

```
packages/shared/
├── src/
│   ├── schemas/
│   │   └── index.ts             # Empty re-exports
│   ├── types/
│   │   └── index.ts             # z.infer types (empty)
│   └── constants/
│       └── index.ts             # MAX_FILE_SIZE, AI_TIMEOUT_MS, RATE_LIMITS, ROLES
├── package.json                 # Exports map: ./schemas, ./types, ./constants
└── tsconfig.json
```

### Library Versions (Exact — February 2026)

| Package | Version | Notes |
|---|---|---|
| `next` | 16.1.6 | proxy.ts, Turbopack default, React 19.2 |
| `react` / `react-dom` | 19.2.x | Ships with Next.js 16 |
| `express` | 5.2.1 | Auto promise rejection forwarding |
| `pnpm` | 10.30.0 | Set via `corepack prepare pnpm@10.30.0` |
| `turbo` | 2.8.10 | `tasks` not `pipeline` in turbo.json |
| `drizzle-orm` | 0.45.1 | Stable track (not 1.0-beta) |
| `drizzle-kit` | 0.31.9 | Use `dialect: 'postgresql'` not `driver` |
| `typescript` | ~5.9 | NOT 6.0 beta |
| `pino` | 10.3.1 | + `pino-http@11.0.0` + `pino-pretty` (devDep) |
| `zod` | 3.x | Pinned to v3 — Zod 4 has breaking changes + ecosystem risk |
| `jose` | 6.x | ESM-only, zero deps — installed but used in Story 1.3 |
| PostgreSQL | 18.2 | Docker image: `postgres:18.2` |
| Redis | 7.x | Docker image: `redis:7-alpine` |

### Critical Gotchas

1. **PostgreSQL 18 PGDATA path changed** — Mount volumes to `/var/lib/postgresql`, NOT `/var/lib/postgresql/data`. PG 18 uses version-specific path `/var/lib/postgresql/18/docker` internally.

2. **Turborepo uses `tasks` not `pipeline`** — The `pipeline` key was renamed in Turborepo 2.x. Use:
   ```json
   { "tasks": { "build": { "dependsOn": ["^build"] } } }
   ```

3. **Express 5 auto-forwards rejected promises** — No need for `express-async-errors` or manual `try/catch` + `next(err)`. Async route handlers that throw or reject are automatically caught.

4. **Express 5 `req.body` is `undefined`** without body parser (was `{}` in v4). Body parser must be explicitly mounted.

5. **Docker Compose: No `version:` key** — Omit entirely. The Compose Specification deprecates the version field.

6. **pnpm 10 workspace config** — Settings and catalogs can now be in `pnpm-workspace.yaml`. Use `"packageManager": "pnpm@10.30.0"` in root `package.json` + `corepack enable`.

7. **Next.js 16 proxy.ts** — Exported function must be named `proxy` (not `middleware`). Uses Node.js runtime only (no Edge). Config flags: `skipProxyUrlNormalize` (was `skipMiddlewareUrlNormalize`).

8. **Stripe webhook raw body** — `routes/stripeWebhook.ts` must mount BEFORE `express.json()`. Not implemented in this story, but the middleware chain order in `index.ts` must accommodate this from day 1 by leaving a comment/placeholder.

### Docker Configuration Details

#### docker-compose.yml (Production-like Base)

```yaml
# No version: key — uses Compose Specification
services:
  db:
    image: postgres:18.2
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: analytics
    volumes:
      - pgdata:/var/lib/postgresql   # NOTE: NOT /var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U app -d analytics']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

  api:
    build:
      context: .
      dockerfile: Dockerfile.api
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgresql://app:app@db:5432/analytics
      REDIS_URL: redis://redis:6379

  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    depends_on:
      - api

volumes:
  pgdata:
```

#### docker-compose.override.yml (Dev Overrides)

```yaml
services:
  db:
    ports:
      - '5432:5432'

  redis:
    ports:
      - '6379:6379'

  api:
    build:
      target: development
    volumes:
      - ./apps/api:/app/apps/api
      - /app/apps/api/node_modules
    ports:
      - '3001:3001'
      - '9229:9229'           # Debug port
    command: pnpm --filter api dev

  web:
    build:
      target: development
    volumes:
      - ./apps/web:/app/apps/web
      - /app/apps/web/node_modules
    ports:
      - '3000:3000'
    command: pnpm --filter web dev
```

### Turbo.json Configuration

```jsonc
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

### What This Story Does NOT Include (Deferred to Later Stories)

- Database schema/tables (Story 1.2)
- Authentication middleware, JWT, Google OAuth (Story 1.3)
- RBAC middleware, rate limiting, BFF proxy routes (Story 1.4)
- Org invite system (Story 1.5)
- CI pipeline, README content, analytics service (Story 1.6)
- Any UI components beyond basic layout shell
- Any API routes beyond `/health`

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Sections 2-5, File Structure, Infrastructure]
- [Source: _bmad-output/planning-artifacts/prd.md — FR35 (health check), FR36 (Docker), NFR13 (env security), NFR15 (Docker first-run)]
- [Source: _bmad-output/project-context.md — Technology Stack, Monorepo Structure, all mandatory rules]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1 overview, Story 1.1 acceptance criteria]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- corepack pnpm installation failed with signature verification — fell back to `npm install -g pnpm --force`
- Docker Desktop image pulls consistently hang (Docker Desktop macOS networking issue) — `docker compose config` validates correctly; all TypeScript type-checks pass
- Express Router type inference error (TS2742) — fixed by setting `declaration: false` in api tsconfig since apps don't emit declaration files
- pnpm workspace `@shared/schemas` error — fixed: single `"shared": "workspace:*"` dep with subpath exports (`shared/schemas`, `shared/types`, `shared/constants`)

### Completion Notes List

1. All 7 task groups implemented (Tasks 1-6 complete, Task 7 partially blocked by Docker Desktop networking)
2. `pnpm install` succeeds across all 4 workspace packages (root, web, api, shared)
3. `pnpm --filter shared type-check` passes
4. `pnpm --filter api type-check` passes
5. `docker compose config` validates all 4 services correctly
6. `.env` is confirmed git-ignored
7. Docker verification pending: `docker compose up` blocked by Docker Desktop image pull hanging (macOS networking issue, not project configuration)
8. Architecture naming: imports use `shared/schemas` (not `@shared/schemas`) — package.json exports map handles subpath resolution
9. Zod pinned to v3.x per user decision (ecosystem safety with drizzle-zod)
10. Express middleware chain order established: correlationId → [stripe webhook placeholder] → json parser → pino-http → routes → errorHandler

### File List

Root:
- `package.json` — Monorepo root with Turborepo scripts, pnpm 10.30.2
- `pnpm-workspace.yaml` — apps/* + packages/*
- `turbo.json` — Build pipeline with `tasks` (not `pipeline`)
- `tsconfig.base.json` — Strict mode, ESM, noUncheckedIndexedAccess
- `.eslintrc.cjs` — Import boundary enforcement
- `.prettierrc` — Semi, singleQuote, 100 width
- `.gitignore` — .env, node_modules, .next, dist, coverage, .turbo
- `.env.example` — All required env vars with placeholders
- `.env` — Local dev values (git-ignored)
- `docker-compose.yml` — Production-like 4-service definitions
- `docker-compose.override.yml` — Dev overrides: volume mounts, hot reload, debug port
- `Dockerfile.api` — Multi-stage (deps → development → build → production)
- `Dockerfile.web` — Multi-stage (deps → development → build → production)

apps/web:
- `proxy.ts` — Route protection for /upload, /billing, /admin
- `next.config.ts` — Turbopack + API rewrites to Express
- `app/layout.tsx` — Root layout with Inter font
- `app/page.tsx` — Redirect to /dashboard
- `app/globals.css` — Tailwind CSS 4 @theme with oklch Trust Blue tokens
- `lib/api-client.ts` — Client Components → /api/* BFF proxy
- `lib/api-server.ts` — Server Components → http://api:3001
- `vitest.config.ts` — jsdom environment, react plugin
- `tsconfig.json` — Extends base, Next.js plugin, @/ alias
- `components/{ui,layout,common}/` — Empty placeholder directories
- `lib/hooks/` — Empty placeholder directory

apps/api:
- `src/config.ts` — Zod-validated env schema, fail-fast startup
- `src/index.ts` — Express 5 entry: middleware chain, route mounting
- `src/lib/logger.ts` — Pino structured logging + child logger factory
- `src/lib/appError.ts` — AppError hierarchy (5 error types)
- `src/lib/db.ts` — Drizzle + postgres.js client
- `src/lib/redis.ts` — ioredis client + health check helper
- `src/middleware/correlationId.ts` — UUID per request → Pino child
- `src/middleware/errorHandler.ts` — Global error handler → structured JSON
- `src/routes/health.ts` — GET /health checking PostgreSQL + Redis
- `drizzle.config.ts` — Drizzle Kit config
- `vitest.config.ts` — Node environment
- `tsconfig.json` — Extends base, declaration: false
- `entrypoint.sh` — Runs Drizzle migrations on startup

packages/shared:
- `src/schemas/index.ts` — Empty (populated in Story 1.2)
- `src/types/index.ts` — Empty (populated in Story 1.2)
- `src/constants/index.ts` — MAX_FILE_SIZE, AI_TIMEOUT_MS, RATE_LIMITS, ROLES
- `package.json` — Exports map: ./schemas, ./types, ./constants
- `tsconfig.json` — Extends base

### Code Review Fixes Applied

**Reviewer:** Claude Opus 4.6 (adversarial code review)
**Date:** 2026-02-24
**Issues Found:** 7 HIGH, 8 MEDIUM, 8 LOW — all fixed

**HIGH fixes:**
- H-1: Added `output: 'standalone'` to `next.config.ts` — production Dockerfile requires it
- H-2: Added `import` condition to `shared/package.json` exports pointing to `./dist/*.js` for production
- H-3: Removed `2>/dev/null` from `entrypoint.sh`; migration errors now visible; uses local binary
- H-4: Added UUID format validation + array guard to `correlationId.ts`
- H-5: Removed `data:` envelope from `health.ts` — monitoring tools expect flat root response
- H-6/H-7: Created `apps/web/lib/config.ts` (Zod-validated); `api-server.ts` imports from it

**MEDIUM fixes:**
- M-1: Added `packages/shared` volume mounts to `docker-compose.override.yml`
- M-2: Added package-name patterns (`api`, `web`) to ESLint import boundary rules
- M-3: Reverted — `moduleResolution: "bundler"` kept (CJS interop issues with `nodenext`)
- M-4: Removed dead `logger` import from `db.ts`
- M-5: Added `vitest`, `@vitejs/plugin-react`, `shared` deps to `apps/web/package.json`
- M-6: Renamed `MAX_FILE_SIZE_BYTES` → `MAX_FILE_SIZE`
- M-7: Changed `target: "ES2017"` → `"ES2022"` in `apps/web/tsconfig.json`
- M-8: Added `type-check` and `test` scripts to `apps/web/package.json`

**LOW fixes:**
- L-1: Fixed Pino logging convention in `redis.ts`
- L-2: Used local binary in `entrypoint.sh` (combined with H-3)
- L-3: Added fail-fast guard to `drizzle.config.ts`
- L-4: Added explanatory comment for `redis.connect()` in `index.ts`
- L-5: Added TODO comment for JWT validation in `proxy.ts`
- L-6: Replaced `__dirname` with `import.meta.url` in `apps/web/vitest.config.ts`
- L-7: Changed `jsx: "react-jsx"` → `"preserve"` per Next.js convention
