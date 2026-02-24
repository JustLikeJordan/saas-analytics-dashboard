# SaaS Analytics Dashboard

AI-powered analytics that explains business data in plain English for small business owners.

## Tech Stack

- **Frontend**: Next.js 16 (Turbopack, React 19.2) + Tailwind CSS 4
- **Backend**: Express 5 + Drizzle ORM 0.45.x + PostgreSQL 18 + Redis 7
- **Monorepo**: pnpm workspaces + Turborepo
- **Auth**: JWT + refresh rotation, Google OAuth, jose 6.x
- **AI**: Claude API with SSE streaming
- **Testing**: Vitest
- **Docker**: 4-service compose (web, api, db, redis)

## Project Structure

```
apps/web/          — Next.js 16 frontend (port 3000)
apps/api/          — Express 5 API (port 3001)
packages/shared/   — Shared schemas, types, constants
```

## Commands

```bash
pnpm dev           # Start all services via Turborepo
pnpm build         # Build all packages
pnpm lint          # Lint all packages
pnpm type-check    # TypeScript check all packages
pnpm test          # Run all tests
pnpm format        # Prettier format
docker compose up  # Start full stack (web, api, db, redis)
```

## Mandatory Rules

### No process.env in application code
All env access through `apps/api/src/config.ts` (Zod-validated, fail-fast).

### No console.log
Use Pino structured logging only: `logger.info({ datasetId }, 'message')`.

### No CORS middleware
BFF proxy pattern — same-origin. Browser → Next.js `/api/*` → Express `:3001`.

### Import boundaries
- `apps/web` cannot import from `apps/api` (and vice versa)
- Cross-package imports use `shared/schemas`, `shared/types`, `shared/constants`
- Services import from `db/queries/` barrel, never `db/index.ts` directly

### proxy.ts NOT middleware.ts
Next.js 16 renamed middleware. File is `proxy.ts`, exported function is `proxy()`.

### Dashboard is public
`proxy.ts` protects `/upload`, `/billing`, `/admin` ONLY. Never redirect from `/dashboard`.

### API response format
```typescript
// Success: { data: T, meta?: {} }
// Error:   { error: { code: string, message: string, details?: unknown } }
```

### Pino logging convention
```typescript
// CORRECT — structured object first, message string second:
logger.info({ datasetId, orgId, rowCount }, 'CSV upload processed');
// WRONG:
logger.info('CSV upload for ' + datasetId);
```

### Express middleware chain order
1. correlationId — FIRST
2. Stripe webhook route — BEFORE body parser (raw body)
3. JSON body parser
4. pino-http request logging
5. Route handlers
6. errorHandler — LAST

### Privacy-by-architecture
`assembly.ts` accepts `ComputedStat[]`, not `DataRow[]` — raw data cannot reach the LLM.

## Data Model

Org-first multi-tenant: `org_id` on every table, many-to-many `user_orgs`.
RBAC: `user_orgs.role` (owner/member) + `users.is_platform_admin` boolean.

## Key Architecture Decisions

- **Zod 3.x** — Pinned (not Zod 4) for drizzle-zod compatibility
- **Turborepo 2.x** — Uses `tasks` key, not `pipeline`
- **Express 5** — Auto promise rejection forwarding (no express-async-errors)
- **PostgreSQL 18** — PGDATA at `/var/lib/postgresql` (not `/var/lib/postgresql/data`)
- **AI summary cache** — `ai_summaries` table, cache-first, stale on data upload only
- **Subscription gate** — Annotating (not blocking) for AI endpoints; free tier ~150 words

## BMAD Workflow

Planning artifacts in `_bmad-output/`. Sprint tracking in `_bmad-output/implementation-artifacts/sprint-status.yaml`. Stories created via `/bmad-bmm-create-story`, implemented via `/bmad-bmm-dev-story`.

## Testing

- Vitest for unit/integration tests
- `apps/api/vitest.config.ts` — Node environment
- `apps/web/vitest.config.ts` — jsdom environment with React plugin
