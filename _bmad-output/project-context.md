---
project_name: 'SaaS Analytics Dashboard'
user_name: 'Corey'
date: '2026-02-19'
sections_completed: ['technology_stack', 'language_specific_rules', 'framework_specific_rules', 'testing_rules', 'code_quality_style', 'development_workflow', 'critical_dont_miss']
status: 'complete'
rule_count: 180
optimized_for_llm: true
existing_patterns_found: 32
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Monorepo Structure
- **pnpm workspaces** — `apps/web`, `apps/api`, `packages/shared`
- **Turborepo** — Task orchestration (build, test, lint, typecheck)
- **Node.js 20.x LTS** (minimum 20.9, required by Next.js 16)

### Frontend (apps/web)
- **Next.js 16.x** — App Router, RSC, Turbopack (default bundler)
- **React 19.2** — Server Components + Client Components
- **Tailwind CSS 4.x** + **shadcn/ui** (latest)
- **Recharts** (latest) — SVG-based charting
- **SWR** (latest) — Client cache + revalidation
- **Lucide React** — Icons (tree-shakeable)

### Backend (apps/api)
- **Express 5.x** — REST API server
- **Drizzle ORM 0.45.x** — Type-safe ORM, `drizzle-kit migrate` (versioned SQL)
- **PostgreSQL 18.x** — Primary database (Docker image)
- **Redis 7.x** — Rate limiting + session cache
- **jose 6.x** — JWT signing/verification (zero deps, ESM-only)
- **simple-statistics 7.8.x** — Curation pipeline statistical computation
- **Pino** (latest) — Structured JSON logging
- **@anthropic-ai/sdk** (latest) — Claude API (streaming)
- **stripe** (latest) — Payments + webhook handling
- **rate-limiter-flexible** (latest) — Redis-backed rate limiting

### Shared (packages/shared)
- **Zod** (latest) — Schema validation, single source of truth for API contracts

### Testing
- **Vitest** (latest) — Unit + integration tests
- **Playwright** (latest) — E2E tests
- **supertest** — Express route handler testing

### Infrastructure
- **Docker Compose** (Engine 24+) — 4 services: web, api, db, redis
- **GitHub Actions** — 5-stage CI pipeline

### Critical Version Constraints (agents MUST follow)

**Next.js 16 (NOT 15):**
- `middleware.ts` is renamed to `proxy.ts` — runs on Node.js runtime, not Edge
- `params`, `searchParams`, `cookies()`, `headers()` all return Promises — must `await` them
- Turbopack is the default bundler — do not configure webpack
- Scaffold with: `pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --turbopack --yes`

**React 19.2 (NOT 18):**
- Use Server Components for data fetching — not `useEffect` + client fetch
- `use()` hook available for consuming promises and context
- Form actions via `useActionState` — not `react-hook-form` for simple forms
- `ReactDOM.render()` does not exist — only `createRoot()`

**Express 5 (NOT 4):**
- `app.del()` removed — use `app.delete()`
- Async route handlers auto-catch rejected promises — no manual try/catch wrapping needed for async routes
- Stripe webhook route MUST be mounted BEFORE `express.json()` middleware (raw body required)

**Tailwind CSS 4 (NOT 3):**
- CSS-based configuration using `@theme` directive — not `tailwind.config.js`
- New color system — verify shadcn/ui compatibility with Tailwind 4

**Drizzle ORM 0.45.x:**
- Use `drizzle-kit migrate` ONLY — `drizzle-kit push` is FORBIDDEN (breaks Docker reproducibility)
- Identity columns for IDs (PostgreSQL best practice, not serial)

**jose 6.x:**
- ESM-only — use `import { SignJWT } from 'jose'`, NEVER `require('jose')`
- Zero dependencies, Web API compatible

**All packages:**
- TypeScript strict mode enabled across all packages
- ESM modules throughout — no CommonJS

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

**Configuration:**
- TypeScript strict mode (`"strict": true`) across all packages
- ESM modules only — no CommonJS (`require`, `module.exports`)
- Path aliases: `@shared/*` → `packages/shared/src/*`, `@/` → current app root
- Never use relative paths crossing package boundaries (`../../packages/shared` is FORBIDDEN)

**Import/Export Patterns:**
- Import shared schemas: `import { dataRowSchema } from '@shared/schemas'`
- Import shared types: `import type { DataRow } from '@shared/types'`
- Import shared constants: `import { MAX_FILE_SIZE } from '@shared/constants'`
- No barrel `index.ts` at shared package root — use explicit sub-path imports
- One Zod schema file per domain (auth, datasets, ai, subscriptions, sharing, api)
- Types are ALWAYS inferred from Zod schemas: `type DataRow = z.infer<typeof dataRowSchema>` — never hand-written

**Type Boundaries:**
- API-boundary types go in `packages/shared/src/types/` — inferred from Zod schemas
- Service-internal types (e.g., `ComputedStat`, `ScoredInsight`, `AssembledContext`) stay in `services/*/types.ts` — NEVER in shared
- Drizzle inferred types: use `typeof users.$inferSelect` and `typeof users.$inferInsert` in query functions — don't hand-write DB row types
- `db/index.ts` is internal — services import from `db/queries/` barrel, never `db/index.ts`

**Error Handling:**
- Use the `AppError` hierarchy: `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ExternalServiceError`
- Never throw raw `Error` objects from services
- Services throw typed `AppError` subclasses → `errorHandler` middleware catches and formats
- Error chain: route handler → try/catch → service throws AppError → errorHandler middleware → structured JSON response
- External service errors (Claude, Stripe, Google) wrap in `ExternalServiceError` with user-friendly message

**Zod Usage:**
- Route handlers: use `.parse()` — let ZodError propagate to errorHandler middleware
- Services doing optional validation: use `.safeParse()` — build specific error messages from `.error.issues`

**Async Patterns:**
- Express 5 async routes: just `throw` AppError subclasses — never call `next(err)` in async handlers
- Never mix callback-style and async error handling in the same route

**Null/Undefined Handling:**
- Use `| undefined` for optional fields, `| null` only for database nullability
- Omit null fields from API responses — don't send `"field": null`
- Empty arrays are `[]`, never `null`

**Environment Variables:**
- All env vars read through Zod-validated `config.ts` — never `process.env` directly
- `config.ts` fails fast at startup if vars are missing
- Each app (`apps/web`, `apps/api`) has its own `config.ts`

**Logging:**
- Always use Pino structured logging: `logger.info({ datasetId, orgId }, 'CSV processed')`
- NEVER string interpolation: `logger.info('CSV processed for ' + datasetId)` is FORBIDDEN
- NEVER `console.log` — always Pino
- Log levels: `error` (failures), `warn` (degraded — e.g., Redis down), `info` (business events), `debug` (dev only)

### Framework-Specific Rules

**Next.js 16 (App Router):**
- `proxy.ts` handles route protection ONLY — redirects unauthenticated users to `/login`. Never calls Express.
- `app/api/*/route.ts` handles request forwarding ONLY — proxies to Express with cookie forwarding. Never redirects.
- proxy.ts and app/api/ MUST NEVER overlap — this prevents auth logic fragmentation
- Pages (`page.tsx`, `layout.tsx`) are Server Components by default — data fetching happens here
- Client Components require `'use client'` directive at top of file
- Use React Suspense boundaries with `loading.tsx` for RSC streaming fallbacks
- Datasets proxy route must disable body parsing and pipe raw stream (multipart/form-data for CSV upload)
- AI summaries proxy route must return `ReadableStream` with `text/event-stream` headers (prevents Next.js buffering)

**React 19 Patterns:**
- Server Components: data fetching, layout, no client state or event handlers
- Client Components: interactivity, `useState`, `useReducer`, event handlers, browser APIs
- SSE streaming state managed via `useReducer` in dedicated hook (`useAiStream.ts`) — separate from SWR cache
- SWR for server state cache + revalidation (e.g., `mutate()` after CSV upload refreshes charts)
- Form handling via React 19 `useActionState` — no `react-hook-form` for simple forms
- Loading states: three states (`idle`, `loading`, `error`), skeleton components match content shape

**Express 5 Patterns:**
- Routes are THIN: validate input (Zod `.parse()`), call service, return response — no business logic
- Services are the domain logic layer — testable without Express
- Middleware chain order matters: `correlationId` → `authMiddleware` → `rateLimiter` → routes → `errorHandler`
- Stripe webhook route mounted BEFORE `express.json()` (needs raw body for signature verification)
- Health check (`GET /health`) verifies BOTH PostgreSQL AND Redis connectivity

**Drizzle ORM Patterns:**
- All table definitions in single `db/schema.ts` file
- All queries in `db/queries/*.ts` — one file per domain (users, orgs, datasets, dataRows, subscriptions, refreshTokens, analyticsEvents)
- Every query function takes `orgId` as required parameter — fail closed if missing
- Barrel re-export via `db/queries/index.ts` — services import from this, never `db/index.ts`
- Use `drizzle-kit migrate` for versioned SQL — migrations run in Docker entrypoint

**SWR Patterns:**
- Client Components use SWR for data that needs revalidation (charts after upload)
- `mutate()` called after CSV upload to trigger chart refresh
- SWR cache is separate from SSE streaming state (useReducer)

**Recharts Patterns:**
- SVG-based — allows CSS styling and accessibility
- Chart wrappers co-located in `dashboard/charts/` (feature-specific until shared)
- Mobile layout: viewport < 768px renders AI summary above fold, charts below (lazy-loaded via Intersection Observer)

### Testing Rules

**Test Boundary Rules (STRICT):**
- If it can be tested without a browser → Vitest
- If it requires RSC rendering or multi-page navigation → Playwright
- No middle ground — no "headless browser unit tests"

| What | Test With | Example |
|------|-----------|---------|
| Pure functions (curation pipeline, validators) | Vitest unit test | `computation.test.ts` |
| Service layer (business logic with deps) | Vitest + test doubles | `tokenService.test.ts` — mock DB queries |
| Express route handlers | Vitest + supertest | `datasets.test.ts` — HTTP request/response |
| React Client Components | Vitest + React Testing Library | `UploadDropzone.test.tsx` |
| React Server Components | Playwright E2E | `dashboard.spec.ts` — full browser |
| User journeys (multi-page flows) | Playwright E2E | `auth-flow.spec.ts` |
| Database queries | Vitest integration (test DB) | `queries/datasets.test.ts` — real PostgreSQL |

**Test File Organization:**
- Unit tests: co-located as `*.test.ts` next to source file
- E2E tests: root `e2e/` directory, one spec per user journey
- Test infrastructure: `apps/*/src/test/` (fixtures, helpers, setup)
- E2E fixtures: `e2e/fixtures/` — test users, CSV files, seed states
- E2E helpers: `e2e/helpers/` — login flow, data seeding, screenshots
- No `__mocks__/` directories — use Vitest's `vi.mock()` inline

**Test Data Patterns:**
- API test fixtures use factory functions (not static JSON): `apps/api/src/test/fixtures/`
- E2E test data in `e2e/fixtures/` — separate from API test fixtures
- Database integration tests use a real test PostgreSQL instance — not mocks

**Mocking Rules:**
- Use `vi.mock()` inline — no `__mocks__/` directory pattern
- Mock DB queries when testing services (not the real DB)
- Mock services when testing route handlers (not business logic)
- Never mock in E2E tests — use real services with test database

**CI Pipeline Testing:**
- Stage 1: Lint + Typecheck (parallel across apps)
- Stage 2: Unit + Integration tests (Vitest, parallel across apps)
- Stage 3: Seed validation (`scripts/validate-seed.ts` — deterministic, no LLM call)
- Stage 4: E2E tests (Playwright, Docker Compose up)
- Stage 5: Docker smoke test (`scripts/smoke-test.sh`)

**Seed Validation (CI Stage 3):**
- Validates curation pipeline OUTPUT (assembled prompt), NOT LLM response
- Asserts assembled context contains 2+ distinct stat categories (trend, anomaly, comparison)
- Deterministic, free, fast — no Claude API call in CI

### Code Quality & Style Rules

**File Naming:**
- Components: `PascalCase.tsx` — `DashboardPage.tsx`, `InsightCard.tsx`
- Utilities/services: `camelCase.ts` — `authMiddleware.ts`, `computeStats.ts`
- Schemas/types: `camelCase.ts` — `datasetSchema.ts`, `userTypes.ts`
- Tests: `*.test.ts` co-located — `computation.test.ts`
- E2E: `*.spec.ts` in `e2e/` — `dashboard.spec.ts`

**Code Naming:**
- React components: `PascalCase` — `export function DashboardHeader()`
- Functions/variables: `camelCase` — `getUserOrgs()`, `const isAuthenticated`
- Constants: `SCREAMING_SNAKE` — `MAX_FILE_SIZE`, `AI_TIMEOUT_MS`
- Types/Interfaces: `PascalCase` — `type DataRow`, `interface ApiResponse`
- Zod schemas: `camelCase` + Schema suffix — `datasetSchema`, `createUserSchema`
- Drizzle tables: `camelCase` export, snake_case SQL — `export const users = pgTable('users', ...)`

**Database Naming:**
- Tables: `snake_case`, plural — `users`, `data_rows`, `refresh_tokens`
- Columns: `snake_case` — `created_at`, `org_id`, `is_seed_data`
- Foreign keys: `{referenced_table_singular}_id` — `user_id`, `org_id`
- Indexes: `idx_{table}_{columns}` — `idx_users_email`
- Enums: snake_case values — `'csv'`, `'owner'`

**API Naming:**
- Endpoints: plural nouns, kebab-case — `/api/datasets`, `/api/ai-summaries`
- Route params: camelCase — `/api/datasets/:datasetId`
- Query params: camelCase — `?startDate=2026-01-01`
- HTTP methods: GET (read), POST (create), PATCH (update), DELETE (remove) — never PUT for partial updates
- JSON bodies: camelCase — `{ "datasetId": "...", "startDate": "..." }`

**API Response Format (ALL responses):**
- Success: `{ "data": T, "meta"?: { pagination, timing } }`
- Error: `{ "error": { "code": string, "message": string, "details"?: unknown } }`
- No bare data returns — always wrapped
- Standard error codes: `VALIDATION_ERROR` (400), `AUTHENTICATION_REQUIRED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `RATE_LIMITED` (429), `EXTERNAL_SERVICE_ERROR` (502), `INTERNAL_ERROR` (500)
- Never expose stack traces in error responses

**Date/Time Format:**
- API: ISO 8601 strings (`"2026-02-19T14:30:00Z"`) — always UTC
- Database: `timestamp with time zone`
- UI: `Intl.DateTimeFormat` with user locale
- Never store or transmit Unix timestamps

**Analytics Event Naming:**
- Dot-notation, past tense: `dataset.uploaded`, `ai_summary.viewed`, `insight.shared`, `subscription.upgraded`

**Component Organization:**
- Feature-specific components co-located with route (e.g., `dashboard/DashboardCharts.tsx`)
- Shared components (used by 2+ routes) in `components/` directory
- shadcn/ui components in `components/ui/` (auto-generated)
- Layout components in `components/layout/`
- Common components in `components/common/` (DemoModeBanner, UpgradeCta, ErrorBoundary)

### Development Workflow Rules

**Docker-First Development:**
- Single command to start everything: `docker compose up`
- 4 services: web (:3000), api (:3001), db (:5432), redis (:6379)
- On first run: pull images → pnpm install → migrations → seed data → hot reload servers
- Migrations run automatically via Docker entrypoint (`db/migrate.ts`)
- Seed data loads automatically via Docker entrypoint (`db/seed.ts`)
- Hot reload: Turbopack (web) + tsx --watch (api) via volume mounts
- `docker-compose.yml` = production-like; `docker-compose.override.yml` = dev overrides

**Build Process:**
- `pnpm turbo build` — Turborepo orchestrates parallel builds
- Build order: `packages/shared` first (dependency), then `apps/web` + `apps/api` in parallel
- Output: `apps/web/.next/` + `apps/api/dist/`

**Environment Configuration:**
- `.env.example` committed with descriptions — `.env` in `.gitignore`
- Docker Compose uses `env_file` to load `.env`
- Each app validates its own env vars at startup via Zod `config.ts`
- Required env vars: `DATABASE_URL`, `REDIS_URL`, `CLAUDE_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET` (min 32 chars), `NODE_ENV`, `PORT`, `APP_URL`

**Docker Networking:**
- Services communicate via Docker service names: `http://api:3001`, `db:5432`, `redis:6379`
- Browser never calls Express directly — always through Next.js BFF proxy
- Server Components call `http://api:3001` directly (Docker internal)
- Client Components call `/api/*` (Next.js proxy routes)

**Production Builds:**
- `docker build -f Dockerfile.web -t analytics-web .`
- `docker build -f Dockerfile.api -t analytics-api .`
- `docker compose -f docker-compose.yml up` (without override = production settings)

### Critical Don't-Miss Rules

**Architecture Boundaries (agents WILL violate these):**
- `proxy.ts` = route protection ONLY. `app/api/` = request forwarding ONLY. They NEVER overlap.
- Services NEVER import `db/index.ts` — only `db/queries/` barrel. This is the org_id enforcement chokepoint.
- `assembly.ts` accepts `ComputedStat[]`, NOT `DataRow[]` — raw data physically cannot reach the LLM prompt
- Curation pipeline is THREE separate layers (computation → scoring → assembly) — never a monolithic service
- Route handlers are THIN — validate, call service, return. No business logic in routes.
- CORS is explicitly NOT configured — BFF proxy means same-origin only. Do NOT add CORS.

**Multi-Tenancy (fail closed):**
- `org_id` is required on EVERY database query function — no exceptions
- If `org_id` is missing, the query must fail (not return all data)
- RLS policies are defense-in-depth behind application-level filtering
- JWT claims contain `userId`, `org_id`, `role` — threaded through every request

**Demo Mode State Machine (NOT a boolean):**
- 4 states: `seed_only`, `seed_plus_user`, `user_only`, `empty`
- State derived from dataset query: `SELECT EXISTS(... WHERE is_seed_data = false)`
- `seed_only` → user uploads CSV → `seed_plus_user` (seed data excluded from user views)
- `datasets.is_seed_data` boolean drives all state detection
- Seed data seeding must be idempotent: `INSERT ... ON CONFLICT DO NOTHING`

**Curation Pipeline Privacy:**
- Raw `DataRow[]` NEVER reaches the LLM — only `ComputedStat[]`
- This is architecturally enforced by type signatures, not just convention
- Scoring weights in `config/scoring-weights.json` — tunable without code changes
- Prompt templates versioned independently in `config/prompt-templates/v1.md`

**SSE Streaming:**
- Express endpoint streams Claude API response chunks via Server-Sent Events
- 15-second timeout — if exceeded, return accumulated partial result (not an error)
- Next.js proxy must NOT buffer the response — use `ReadableStream` with proper headers
- Client-side: `useReducer` manages streaming state, NOT SWR

**Subscription Gate:**
- Free tier = visualization only. Pro tier = AI interpretation.
- `subscriptionGate.ts` middleware checks org subscription status on EVERY AI request
- Checks local DB first (fast, webhook-synced), not Stripe API
- Free users see preview with upgrade CTA — not a hard block

**Stripe Webhook Handling:**
- Raw body required for signature verification — route mounted BEFORE `express.json()`
- Idempotent processing via Stripe event ID deduplication
- Handles: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.updated`

**Retry Logic (external services only):**
- Max 2 retries with exponential backoff (1s, 3s)
- ONLY retry on 5xx and network errors — never on 4xx
- Applies to: Claude API, Stripe API, Google OAuth
- Does NOT apply to internal services or database queries

**Rate Limiting:**
- 3 tiers: auth 10/min/IP, AI 5/min/user, public 60/min/IP
- Redis-backed via `rate-limiter-flexible`
- FAIL OPEN: if Redis is unavailable, allow requests but log warning
- Blocking all traffic is worse than temporarily having no rate limits

**Accessibility (non-negotiable):**
- Semantic HTML (shadcn/ui defaults)
- Keyboard navigation for all interactive elements
- Status indicators use icons + text labels — never color-only
- axe-core zero critical violations target

**Request Correlation:**
- UUID per request via `correlationId.ts` middleware
- Attached to Pino logger — threaded through entire LLM pipeline
- Every log entry includes correlation ID for traceability

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow ALL rules exactly as documented — no exceptions, no "just this once"
- When in doubt, prefer the more restrictive option
- The architecture document (`_bmad-output/planning-artifacts/architecture.md`) is the authoritative source for decisions not covered here

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack or patterns change
- Review periodically for outdated rules
- Remove rules that become obvious over time

**Reference Documents:**
- Architecture: `_bmad-output/planning-artifacts/architecture.md` (~1300 lines, full decisions)
- PRD: `_bmad-output/planning-artifacts/prd.md` (41 FRs, 27 NFRs)
- This file is the LLM-optimized subset — agents should start here, reference architecture for depth

Last Updated: 2026-02-19
