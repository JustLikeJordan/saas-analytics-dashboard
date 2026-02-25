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

## Code Style — ALWAYS ON (humanize-code)

**MANDATORY for every session, every file, every code change. Do not wait for invocation.**

All code must read like a senior dev wrote it — not a tutorial, not a textbook. Apply automatically to every code file written or modified. For full reference, invoke `/humanize-code`.

- **Comments**: Why, never what. If the code needs a comment to explain what it does, rename things or extract a function. `// edge case — API returns null for deleted users` is good. `// Loop through the array` is delete-on-sight.
- **Naming**: Concise and opinionated. `cfg`, `ctx`, `opts`, `err` are fine. `numberOfRetryAttempts` is not. Booleans read like questions: `hasAccess`, `isReady`.
- **Structure**: Early returns, minimal nesting. A 40-line function doing one thing is fine — don't split into 6 one-call helpers.
- **No AI anti-patterns**: No section-header comments (`// === Section ===`), no echo comments, no narrating (`// First we validate`), no symmetry-for-symmetry's-sake, no premature abstraction.
- **Error handling**: Catch specific errors you can handle. Let everything else propagate. No catch-log-rethrow.
- **Imports**: Standard lib → third-party → internal. Blank line between groups. No comment headers on groups.
- **Commits**: Conventional prefixes (`feat:`, `fix:`, `refactor:`), imperative mood, lowercase, under 72 chars. Body explains why, not what.
- **Anti-patterns to eliminate on sight**: Echo comments, over-descriptive names, defensive overkill, premature abstraction, tutorial-style structure, narrating work, wrapping up neatly.

## Interview Documentation — ALWAYS ON (_explained.md)

**MANDATORY for every session. Generate automatically after every code file creation or substantial modification. Do not wait for invocation.**

Every new or substantially modified code file gets a companion `<filename>_explained.md` in the same directory. For full reference, invoke `/interview-docs`.

- **When**: After creating or substantially modifying a code file. Not for typo fixes, config, or boilerplate. If multiple files are created/modified in one task, generate a doc for each.
- **Structure**: 8 sections — Elevator Pitch, Why This Approach, Code Walkthrough, Complexity/Trade-offs, Patterns Worth Knowing, Interview Questions, Data Structures, Impress the Interviewer.
- **Voice**: Patient senior engineer teaching a CS freshman. "What's happening" → "How to say it in an interview" pairs throughout. Use analogies. Address the reader directly with "you."
- **Depth scales with complexity**: 20-line utility gets concise treatment. 150-line service gets full depth. Config/boilerplate = skip entirely.
- **Update existing docs**: If modifying a file that already has `_explained.md`, update the doc to reflect changes.
- **Reference example**: See `/interview-docs` skill and `references/example-output.md` for the full 8-section format with tone and depth expectations.

## Testing

- Vitest for unit/integration tests
- `apps/api/vitest.config.ts` — Node environment
- `apps/web/vitest.config.ts` — jsdom environment with React plugin
