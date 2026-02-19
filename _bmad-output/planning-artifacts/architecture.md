---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-02-19'
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/prd-validation-report.md
  - _bmad-output/planning-artifacts/product-brief-saas-analytics-dashboard-2026-02-14.md
  - _bmad-output/planning-artifacts/research/market-ai-powered-smb-analytics-research-2026-02-16.md
  - _bmad-output/planning-artifacts/research/technical-full-stack-evaluation-research-2026-02-17.md
  - _bmad-output/planning-artifacts/research/domain-ai-powered-smb-analytics-research-2026-02-17.md
  - _bmad-output/planning-artifacts/research/competitive-financial-analytics-research-2026-02-17.md
workflowType: 'architecture'
project_name: 'SaaS Analytics Dashboard'
user_name: 'Corey'
date: '2026-02-18'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
41 FRs across 8 capability areas, tier-annotated as [Core] (must ship) or [Complete] (ships if timeline holds). The MVP-Core Completion Gate prevents scope creep: all Core FRs + 3 success gates must pass before any Complete work begins.

- **Identity & Access (FR1-5):** Google OAuth, auto-org creation, invite links, RBAC, platform admin. Auth is Phase 1 and the highest-risk dependency — PRD includes fallback to defer FR3/FR4 if auth exceeds 2 weeks.
- **Data Ingestion (FR6-12):** CSV upload with drag-drop, validation with specific errors, preview before confirm, sample template download, org-scoped storage, seed data replacement on first upload, session preservation during re-upload.
- **Visualization (FR13-17):** Interactive bar/line charts that refresh when new data is uploaded (implies client-side revalidation mechanism), date range and category filters, skeleton loading states matching chart shapes, seed data pre-loaded, demo mode banner.
- **AI Interpretation (FR18-24):** Plain-English AI summary via SSE streaming, transparency panel, free preview with upgrade CTA, non-obvious + actionable insights (defined terms), local stats computation with curated LLM context, mobile-first AI summary above the fold.
- **Sharing & Export (FR25-27) [Complete]:** PNG insight cards (requires server-side rendering — headless browser or canvas), shareable read-only links, focused insight card view with CTA.
- **Subscription & Billing (FR28-31) [Complete]:** Stripe Checkout test mode, subscription lifecycle, payment failure revocation, status verification on every Pro-only feature access.
- **Platform Administration (FR32-35):** Admin dashboard [Complete], analytics events [Complete], DOM-level conditional rendering [Complete], health check endpoint [Core].
- **Portfolio & DevOps (FR36-40):** Docker single-command launch [Core], CI with 5 stages [Core], README case study [Core], seed data AI quality validation [Core], analytics event tracking [Core].

**Non-Functional Requirements:**
27 NFRs across 5 categories, all with measurable targets:

- **Performance (NFR1-6):** Dashboard < 3s, TTFT < 2s, AI total < 15s, CSV < 5s (<10MB), charts < 500ms (<10K rows), shared cards < 2s.
- **Security (NFR7-14):** HTTPS, JWT 15-min expiry + httpOnly refresh rotation, org_id on every query (fail closed), DOM-level admin hiding, server-side role verification, webhook signature verification, no secrets in VCS, 3-tier rate limiting.
- **Reliability (NFR15-19):** Docker first-run 100% on macOS + Linux, < 1% error rate on core flows, graceful AI degradation, 15s timeout with partial results, seed data always available.
- **Integration Resilience (NFR20-23):** Timeout + structured errors per integration, user-friendly error messages, idempotent Stripe webhooks, LLM retry with backoff.
- **Accessibility (NFR24-27):** Semantic HTML, keyboard navigation, not color-only, axe-core zero critical violations.

**Scale & Complexity:**

- Primary domain: Full-stack web (monorepo with pnpm workspaces)
- Complexity level: Medium-high
- Estimated architectural components: ~14-16 (auth service, data ingestion service, stats computation engine, relevance scoring engine, context assembly engine, AI interpretation service, SSE streaming layer, visualization layer, subscription service, subscription gate middleware, webhook handler, admin service, share/export service, PNG rendering service, rate limiting middleware, health check service)

### Technical Constraints & Dependencies

1. **Option C data architecture** — CSV parser as first "data source adapter" behind a pluggable interface. All data normalizes to a common schema that architecture must define — this is a core data modeling decision: the normalized representation must support both CSV-originated data (flexible columns, user-defined categories) and future API-originated data (structured financial records with known fields). Curation logic is source-agnostic, operating only on the normalized form.
2. **React 19 RSC testing gap** — Async Server Components can't be unit-tested with Vitest. Testing pyramid must split: Vitest for business logic + Playwright for RSC paths.
3. **BFF proxy pattern** — Browser never calls Express API directly. Next.js API routes proxy to Express, forwarding httpOnly cookies. Docker networking via service names.
4. **Drizzle migrate over push** — Versioned SQL migration files for Docker-first reproducibility. Migration runs automatically in Docker entrypoint.
5. **Solo developer constraint** — All architectural decisions must optimize for single-developer velocity. No microservices, no complex orchestration. Modular monolith with clean boundaries.
6. **Portfolio context** — Docker first-run success is a hard requirement (NFR15). The hiring manager experience (Journey 5) is an architectural constraint: everything must work with `docker compose up`.
7. **Data source adapter tension** — The pluggable adapter interface must accommodate two fundamentally different ingestion models: (a) **batch/file-based** (CSV upload — user-triggered, single file, parse-validate-store in one operation) and (b) **event/connection-based** (Growth-tier APIs — OAuth connection setup, scheduled sync or webhook-driven, incremental updates). The common interface must abstract over this difference while the normalized schema downstream remains source-agnostic. Architecture should define the adapter interface with both models in mind, not just generalize from CSV.

### Cross-Cutting Concerns Identified

1. **Multi-tenancy** — org_id scoping on every query + RLS as defense-in-depth. Affects every service and repository.
2. **Authentication/Authorization** — JWT claims (userId, org_id, role) threaded through every request. RBAC enforcement at API + service + DOM levels.
3. **Error handling** — Structured AppError hierarchy (ValidationError, AuthenticationError, etc.) with centralized Express error handler. User-friendly messages on every boundary.
4. **Analytics event tracking** — 7+ event types (upload, view, share, export, upgrade, ai_summary_view, transparency_panel_open) instrumented across features.
5. **Rate limiting** — Three tiers applied via Express middleware + Redis store. Affects auth, AI, and public endpoints.
6. **Logging** — Pino structured JSON with request correlation IDs threaded through the LLM pipeline.
7. **Shared type safety** — Zod schemas in packages/shared as single source of truth for API contracts. Same validation frontend + backend.
8. **Curation pipeline decomposition** — The curation logic is not one component but three: (a) statistical computation (deterministic, pure functions — simple-statistics), (b) relevance scoring (configurable weights for novelty/actionability/specificity — must support tuning without code changes), and (c) context assembly (structured prompt construction — must be versioned independently from business logic since prompt format depends on LLM model). Architecture must treat these as distinct layers, not a monolithic service.
9. **Seed data as engineering artifact** — Seed data spans database seeding, CI quality validation (FR39 — 2+ insight types), onboarding UX (demo mode banner, FR17), and first-session "aha moment" engineering (market research: users who don't see value in first session churn permanently). Architecture must specify: (a) seed data schema and content design with deliberate anomalies, (b) seeding mechanism that runs in Docker entrypoint AND CI, (c) quality gate definition (what "2+ insight types" means concretely for CI), (d) demo-mode state management (how the system distinguishes seed data from user data).
10. **Subscription gate** — FR31 requires subscription status verification before every Pro-only feature access (primarily AI summary generation). This is a middleware concern: the API must check org subscription status on each AI request. Architecture must decide whether to check against local DB (fast, eventually consistent with Stripe) or Stripe API (authoritative, slower). Webhook-driven local sync with DB-first checks is the expected pattern.

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web monorepo (Next.js + Express + PostgreSQL) based on project requirements analysis. The monorepo requires `apps/web` (Next.js), `apps/api` (Express), and `packages/shared` (Zod schemas) — a structure that no off-the-shelf starter provides exactly.

### Version Update: Next.js 15 → Next.js 16

Technical Research validated Next.js 15, but **Next.js 16.1 is now current** (16 released October 2025). Key changes relevant to our architecture:

- **Turbopack is now the default bundler** — 2-5x faster production builds, up to 10x faster Fast Refresh
- **Middleware renamed to Proxy** — `middleware.ts` → `proxy.ts`, runs on Node.js runtime (not Edge), which simplifies our BFF proxy pattern
- **Async Request APIs** — `params`, `searchParams`, `cookies()`, `headers()` now return Promises (required in 16)
- **React 19.2** — Aligns with our React 19 requirement
- **Migration is straightforward** — codemods handle most changes; starting fresh means zero migration cost

**Decision**: Use **Next.js 16** instead of 15. Starting fresh means zero migration overhead, and we get Turbopack performance + the proxy rename (which better matches our BFF pattern semantically).

### Starter Options Considered

| Option | Match | Why Not |
|--------|-------|---------|
| **create-next-app** (Next.js 16) | 40% | Single app only — no monorepo, no Express, no shared packages |
| **create-t3-app** v7.40 | 20% | Uses tRPC/Prisma/NextAuth — almost every default needs replacement |
| **next-forge** (Vercel) | 45% | Closest structural match but uses Clerk/Neon/Vercel/Biome — wrong auth, deployment, and backend choices |
| **Custom pnpm Workspace** | 95% | Exact match to our architecture; only costs initial scaffolding effort |

### Selected Starter: Custom pnpm Workspace Scaffolding

**Rationale for Selection:**

1. **No starter matches our architecture** — We need Next.js 16 frontend + Express backend + shared Zod package, using Google OAuth + custom JWT, local PostgreSQL + Drizzle, Docker Compose deployment, and Pino logging. No existing starter provides this combination without significant rip-and-replace.
2. **Rip-and-replace is worse than building** — next-forge is the closest match structurally, but replacing Clerk→custom auth, Neon→local PostgreSQL, Vercel→Docker, and adding Express would leave us fighting the starter's assumptions.
3. **Solo developer constraint** — Understanding every line of the monorepo is critical for a solo developer. Custom scaffolding means no black-box configuration to debug later.
4. **Docker-first is a hard constraint** — NFR15 requires `docker compose up` to work on first run. No starter optimizes for Docker Compose as the primary development environment.
5. **Technical Research already defined the structure** — Our research specified the exact monorepo layout, package boundaries, and tooling. The starter is effectively already designed.

**Initialization Command:**

```bash
# 1. Initialize pnpm workspace at repo root
pnpm init

# 2. Create workspace structure
mkdir -p apps/web apps/api packages/shared

# 3. Scaffold Next.js 16 app in apps/web
cd apps/web && pnpm dlx create-next-app@latest . --typescript --tailwind --eslint --app --turbopack --yes

# 4. Initialize Express app in apps/api
cd apps/api && pnpm init

# 5. Initialize shared package
cd packages/shared && pnpm init

# 6. Configure pnpm-workspace.yaml
# 7. Add Docker Compose configuration
# 8. Configure Turborepo for task orchestration (turbo.json)
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript 5.x with strict mode across all packages. Node.js 20+ (LTS). ESM modules.

**Styling Solution:**
Tailwind CSS 4.x + shadcn/ui component library (installed via `create-next-app` in `apps/web`).

**Build Tooling:**
Turbopack (default in Next.js 16) for frontend dev/build. Turborepo for monorepo task orchestration (parallel builds, caching). tsx for Express app development.

**Testing Framework:**
Vitest for unit/integration tests (business logic, API routes, curation pipeline). Playwright for E2E tests (RSC paths, user journeys).

**Code Organization:**
```
saas-analytics-dashboard/
├── apps/
│   ├── web/              # Next.js 16 (App Router, RSC)
│   │   ├── app/          # Routes, layouts, pages
│   │   ├── components/
│   │   └── lib/          # Client-side utilities
│   └── api/              # Express.js backend
│       ├── src/
│       │   ├── routes/
│       │   ├── services/
│       │   ├── middleware/
│       │   └── db/
│       └── drizzle/      # Migration files
├── packages/
│   └── shared/           # Zod schemas, types, constants
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── .github/workflows/
```

**Development Experience:**
Hot-reload via Turbopack (frontend) and tsx watch mode (backend). Docker Compose for PostgreSQL + Redis. Pino structured logging with correlation IDs. ESLint + Prettier for consistent formatting.

**Note:** Project initialization using this approach should be the first implementation story. The `create-next-app` command scaffolds `apps/web`, while `apps/api` and `packages/shared` are initialized manually with our exact dependency choices.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
1. Data architecture — normalized schema design, adapter interface, database tables
2. Authentication flow — JWT implementation, Google OAuth provider, token storage
3. BFF proxy pattern — Next.js ↔ Express communication
4. Curation pipeline — three-layer decomposition with file placement
5. SSE streaming — AI response delivery mechanism

**Important Decisions (Shape Architecture):**
6. Charting library — visualization layer + mobile rendering strategy
7. State management — client-side data flow + streaming state
8. Rate limiting store — Redis with fail-open behavior
9. Error handling — structured error hierarchy
10. Demo mode — 4-state machine for seed/user data transitions

**Deferred Decisions (Post-MVP):**
- Dark mode implementation (MVP-Complete tier)
- Financial API adapter implementations (Growth tier)
- WebSocket for real-time collaboration (Vision tier)
- Multi-org switching UI (Growth tier)

### Data Architecture

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| Database | PostgreSQL | 18.x (Docker image) | Latest stable (18.2 released Feb 2026), greenfield project — no migration risk, includes security fixes |
| ORM | Drizzle ORM | 0.45.x | Type-safe, SQL-first, excellent migration tooling |
| Migration strategy | `drizzle-kit migrate` | — | Versioned SQL files for Docker-first reproducibility |
| Column IDs | Identity columns | — | PostgreSQL best practice over serial types (Drizzle supports this) |
| Multi-tenancy | org_id column + RLS | — | Every table has org_id; RLS policies as defense-in-depth behind application-level filtering |
| Connection pooling | pg Pool | max: 20 | Built-in Node.js PostgreSQL driver pooling; sufficient for single-instance MVP |
| Caching | Redis 7.x | — | Rate limiting store + session cache; Docker service |
| Seed data | Typed seed script | — | Runs in Docker entrypoint + CI; deliberate anomalies for AI insight variety |

**Database Tables (Core Schema):**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `users` | User accounts | id, email, name, google_id, avatar_url, created_at |
| `orgs` | Organizations (tenants) | id, name, slug, created_at |
| `user_orgs` | Many-to-many membership | user_id, org_id, role (owner/member/admin), joined_at |
| `refresh_tokens` | JWT refresh token storage | id, token_hash, user_id, org_id, expires_at, revoked_at |
| `datasets` | Uploaded data collections | id, org_id, name, source_type, is_seed_data, uploaded_by, created_at |
| `data_rows` | Normalized data (all sources) | id, org_id, dataset_id, source_type, category, parent_category, date, amount, label, metadata (jsonb) |
| `subscriptions` | Stripe subscription state | id, org_id, stripe_customer_id, stripe_subscription_id, status, plan, current_period_end |
| `analytics_events` | User activity tracking | id, org_id, user_id, event_type, metadata (jsonb), created_at |

**Normalized Schema Approach:**
The `data_rows` table uses `category` for flat categorization (CSV default) and `parent_category` for hierarchical relationships (zero cost for CSV, enables Growth-tier financial API adapters to express chart-of-accounts hierarchy without schema migration). The `metadata` jsonb field stores source-specific fields. The `source_type` enum (`csv`, `quickbooks`, `xero`, `stripe`, `plaid`) identifies data origin. Curation logic operates only on `data_rows` — source-agnostic by design.

### Authentication & Security

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| OAuth provider | Google OAuth 2.0 | — | Simplest for SMB users; googleapis npm package |
| JWT library | jose | 6.x | Zero dependencies, ESM, tree-shakeable, Web API compatible |
| Access token | JWT, 15-min expiry | — | Short-lived, contains userId + org_id + role in claims |
| Refresh token | Opaque token, httpOnly cookie | — | Stored in `refresh_tokens` table (token_hash), rotation on each use, 7-day expiry |
| Password auth | None (MVP) | — | Google OAuth only; reduces attack surface |
| RBAC | 3 roles: owner, member, admin | — | Role in JWT claims; middleware + DOM-level enforcement |
| Cookie security | httpOnly, Secure, SameSite=Lax | — | Prevents XSS token theft; SameSite=Lax allows OAuth redirects |
| API key security | No API keys (MVP) | — | All access via authenticated sessions |
| Webhook verification | Stripe signature verification | — | `stripe.webhooks.constructEvent()` with signing secret |

### API & Communication Patterns

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| API style | REST (JSON) | — | Simple, well-understood; no GraphQL complexity for this scope |
| BFF proxy | Next.js API routes → Express | — | Browser never calls Express directly; cookies forwarded via proxy |
| Validation | Zod schemas (shared) | — | Single source of truth in packages/shared; validated on both sides |
| Error handling | Structured AppError hierarchy | — | ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ExternalServiceError |
| AI streaming | Server-Sent Events (SSE) | — | Express endpoint streams Claude API response chunks; TTFT < 2s target |
| SSE fallback | Synchronous response | — | If streaming fails or times out at 15s, return accumulated partial result |
| Rate limiting store | Redis (rate-limiter-flexible) | — | Persists across restarts; 3 tiers: auth 10/min/IP, AI 5/min/user, public 60/min/IP |
| Rate limiting failure | **Fail open** | — | If Redis unavailable, allow requests but log warning. Blocking all traffic is worse than temporarily having no rate limits |
| Health check | GET /api/health | — | Verifies **both PostgreSQL AND Redis** connectivity; returns structured status per dependency |
| Request correlation | UUID per request | — | Pino logger attaches correlation ID; threaded through LLM pipeline |

### Frontend Architecture

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| Charting library | Recharts | latest | React-native, SVG-based, composable components. SVG allows CSS styling and accessibility |
| Server state | React Server Components | — | RSC handles data fetching natively; no client-side data fetching library needed for initial loads |
| Client cache | SWR | latest | `mutate()` for chart revalidation after CSV upload. Minimal API surface for solo developer |
| Streaming state | `useReducer` | — | SSE streaming + transparency panel metadata managed via dedicated reducer — separate concern from SWR cache |
| Form handling | React 19 form actions | — | Native form actions + useActionState; no react-hook-form needed for simple forms |
| Component library | shadcn/ui | latest | Copy-paste components, full control, Tailwind-native, accessible by default |
| Icons | Lucide React | — | Default with shadcn/ui; tree-shakeable |
| Loading states | Skeleton components | — | Match chart shapes per FR16; React Suspense boundaries for RSC |

**Mobile Rendering Strategy:**
FR24 requires mobile-first AI summary above the fold. Architecture specifies: on viewports < 768px, the AI summary section renders above the fold as the primary content. Charts render below the fold, lazy-loaded on scroll via Intersection Observer. This is not a Recharts decision — it's a layout strategy where the `DashboardPage` component conditionally reorders sections based on viewport. Marcus (mobile, monthly) sees insights first; David (laptop, weekly) sees the full dashboard.

**Demo Mode State Machine:**
The system tracks demo mode via dataset state, not a single boolean. Four states with defined transitions:

| State | Condition | Banner | Behavior |
|-------|-----------|--------|----------|
| `seed_only` | Only seed datasets exist for org | "Sample data — upload yours to get started" | Default for new orgs |
| `seed_plus_user` | Both seed and user datasets exist | No banner | Seed data hidden from charts; user data primary |
| `user_only` | User datasets exist, seed deleted or hidden | No banner | Normal operation |
| `empty` | No datasets (user deleted all) | "Upload data to get started" | Empty state, no charts |

Transitions: `seed_only` → upload CSV → `seed_plus_user` (seed data flagged `is_seed_data=true` excluded from user views). The `datasets.is_seed_data` boolean drives state detection via a simple query: `SELECT EXISTS(... WHERE is_seed_data = false)`.

### Infrastructure & Deployment

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| Container runtime | Docker Compose | Docker Engine 24+ | NFR15: first-run 100% success on macOS (ARM+Intel) + Linux |
| Services | web (Next.js), api (Express), db (PostgreSQL 18), redis (Redis 7) | — | 4-service compose; internal networking via service names |
| Hot reload | Turbopack (web) + tsx --watch (api) | — | Volume mounts in Docker for development; no rebuild needed |
| CI/CD | GitHub Actions, 5 stages | — | lint/typecheck → test → seed-validation → E2E → Docker smoke |
| Node.js | 20.x LTS | — | Required by Next.js 16 (minimum 20.9) |
| Logging | Pino | latest | Structured JSON; request correlation IDs; log level per environment |
| Environment config | .env files + Docker env | — | .env.example committed; .env in .gitignore; Docker Compose env_file |
| Monitoring | Console logs (MVP) | — | Pino structured output; production observability deferred to Growth tier |

### Curation Pipeline Architecture

This is the project's hardest engineering problem and primary differentiator — elevated to its own decision section.

| Layer | Responsibility | Implementation |
|-------|---------------|----------------|
| **Statistical Computation** | Deterministic calculations on normalized data | Pure functions using simple-statistics 7.8.x — mean, median, std dev, trends, outlier detection, period-over-period changes |
| **Relevance Scoring** | Rank computed stats by insight value | Configurable weights (novelty, actionability, specificity) stored as JSON config — tunable without code changes. Top-N stats selected for LLM context |
| **Context Assembly** | Build structured LLM prompt from selected stats | Versioned prompt templates (separate from business logic). Includes data lineage, confidence levels, and instruction to generate non-obvious + actionable insights |

**File Placement:**
```
apps/api/src/services/curation/
├── computation.ts    # Pure stats functions (simple-statistics)
├── scoring.ts        # Relevance weights + ranking
├── assembly.ts       # Prompt template construction
└── index.ts          # Pipeline orchestrator (computation → scoring → assembly)
```

**Data flow:** Raw data → Normalized schema → Stats computation → Relevance scoring → Context assembly → Claude API → SSE stream → Client

**Privacy guarantee:** Raw data rows never leave the server. Only computed statistics and metadata enter the LLM prompt. This is architecturally enforced — the context assembly layer only accepts `ComputedStat[]`, not `DataRow[]`.

### Decision Impact Analysis

**Implementation Sequence:**
1. Monorepo scaffolding (pnpm workspace + Docker Compose + Turborepo)
2. Auth (Google OAuth + JWT + refresh rotation) — highest risk, do first
3. Data ingestion (CSV adapter + normalized schema + Drizzle migrations)
4. Visualization (Recharts + SWR revalidation + skeleton states + mobile layout)
5. AI interpretation (curation pipeline + Claude API + SSE streaming)
6. Payments (Stripe Checkout + webhook handler + subscription gate)
7. Share/Export (PNG rendering + shareable links) [Complete tier]
8. DevOps (CI pipeline + Docker smoke test + health checks)
9. UI polish + README case study

**Cross-Component Dependencies:**
- Auth must complete before any org-scoped feature (everything depends on JWT claims)
- Normalized schema must be designed before CSV adapter or visualization
- Stats computation must work before relevance scoring or context assembly
- Subscription gate depends on both auth (JWT) and payments (Stripe webhook sync)
- SSE streaming depends on both context assembly and Express route setup
- PNG rendering depends on visualization components being complete
- Demo mode state machine depends on datasets table + is_seed_data flag

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**32 potential conflict points identified** across naming (8), structure (8), format (5), communication (3), process (3), and infrastructure (5) categories. Enhanced with Failure Mode Analysis (5 patches) and Party Mode review (3 patches).

### Naming Patterns

**Database Naming Conventions:**

| Element | Convention | Example | Anti-Pattern |
|---------|-----------|---------|-------------|
| Tables | snake_case, plural | `users`, `data_rows`, `refresh_tokens` | `User`, `dataRow`, `RefreshToken` |
| Columns | snake_case | `created_at`, `org_id`, `is_seed_data` | `createdAt`, `orgID`, `isSeedData` |
| Foreign keys | `{referenced_table_singular}_id` | `user_id`, `org_id`, `dataset_id` | `fk_user`, `userId`, `userID` |
| Indexes | `idx_{table}_{columns}` | `idx_users_email`, `idx_data_rows_org_id_date` | `users_email_index` |
| Enums | snake_case values | `'csv'`, `'quickbooks'`, `'owner'` | `'CSV'`, `'QuickBooks'`, `'OWNER'` |
| Constraints | `{table}_{type}_{columns}` | `users_pkey`, `user_orgs_unique_user_org` | unnamed constraints |

**API Naming Conventions:**

| Element | Convention | Example | Anti-Pattern |
|---------|-----------|---------|-------------|
| Endpoints | Plural nouns, kebab-case | `/api/datasets`, `/api/ai-summaries` | `/api/dataset`, `/api/aiSummaries` |
| Route params | camelCase | `/api/datasets/:datasetId` | `:dataset_id`, `:id` (ambiguous) |
| Query params | camelCase | `?startDate=2026-01-01&categoryFilter=revenue` | `start_date`, `category-filter` |
| HTTP methods | Standard REST | GET (read), POST (create), PATCH (update), DELETE (remove) | PUT for partial updates |
| Versioning | None (MVP) | `/api/datasets` | `/api/v1/datasets` |

**Code Naming Conventions:**

| Element | Convention | Example | Anti-Pattern |
|---------|-----------|---------|-------------|
| Files (components) | PascalCase.tsx | `DashboardPage.tsx`, `InsightCard.tsx` | `dashboard-page.tsx`, `insightCard.tsx` |
| Files (utilities) | camelCase.ts | `authMiddleware.ts`, `computeStats.ts` | `auth-middleware.ts`, `AuthMiddleware.ts` |
| Files (schemas/types) | camelCase.ts | `datasetSchema.ts`, `userTypes.ts` | `DatasetSchema.ts`, `dataset-schema.ts` |
| React components | PascalCase | `export function DashboardHeader()` | `export function dashboardHeader()` |
| Functions/variables | camelCase | `getUserOrgs()`, `const isAuthenticated` | `get_user_orgs()`, `GetUserOrgs()` |
| Constants | SCREAMING_SNAKE | `MAX_FILE_SIZE`, `AI_TIMEOUT_MS` | `maxFileSize`, `aiTimeoutMs` |
| Type/Interface | PascalCase | `type DataRow`, `interface ApiResponse` | `type dataRow`, `type IDataRow` |
| Zod schemas | camelCase + Schema suffix | `datasetSchema`, `createUserSchema` | `DatasetSchema`, `dataset_schema` |
| Drizzle tables | camelCase export, snake_case SQL | `export const users = pgTable('users', ...)` | mixing conventions |

### Structure Patterns

**Test Location:**
Co-located with source files using `.test.ts` suffix. Exception: E2E tests in root `e2e/` directory. Test infrastructure (fixtures, helpers, setup) lives in `apps/*/src/test/`.

```
apps/api/src/
├── test/                         # Shared test infrastructure (per app)
│   ├── fixtures/                 # Test data factories
│   ├── helpers/                  # Test utility functions
│   └── setup.ts                  # Vitest global setup
├── services/
│   ├── curation/
│   │   ├── computation.ts
│   │   └── computation.test.ts   # Co-located unit test

e2e/                              # Playwright E2E tests (root level)
├── auth.spec.ts
├── upload.spec.ts
└── dashboard.spec.ts
```

Rule: **No `__mocks__/` directories — use Vitest's `vi.mock()` inline.**

**Component Organization:**
By feature within `app/` routes, with shared components in top-level `components/`.

```
apps/web/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx               # Route page (RSC)
│   │   ├── DashboardCharts.tsx    # Feature-specific client component
│   │   └── AiSummary.tsx          # Feature-specific client component
│   └── upload/
│       ├── page.tsx
│       └── UploadDropzone.tsx
├── components/                    # Shared across routes
│   ├── ui/                        # shadcn/ui components
│   ├── layout/                    # Header, Sidebar, Footer
│   └── common/                    # DemoModeBanner, LoadingSkeleton
└── lib/                           # Client utilities
    ├── api-client.ts              # Typed fetch wrapper for Client Components (→ /api/* proxy)
    ├── api-server.ts              # Typed fetch wrapper for Server Components (→ http://api:3001)
    └── hooks/                     # Custom React hooks
```

**Service Organization (Express):**
Services are the domain logic layer. Routes call services, services call query functions (never `db` directly).

```
apps/api/src/
├── routes/                    # Express route handlers (thin — validate + call service)
│   ├── auth.ts
│   ├── datasets.ts
│   ├── aiSummary.ts
│   └── health.ts
├── services/                  # Business logic (the "how")
│   ├── auth/
│   │   ├── googleOAuth.ts
│   │   ├── tokenService.ts
│   │   └── index.ts
│   ├── curation/
│   │   ├── computation.ts
│   │   ├── scoring.ts
│   │   ├── assembly.ts
│   │   └── index.ts
│   ├── dataIngestion/
│   │   ├── csvAdapter.ts
│   │   ├── normalizer.ts
│   │   └── index.ts
│   └── aiInterpretation/
│       ├── claudeClient.ts
│       ├── streamHandler.ts
│       └── index.ts
├── middleware/                 # Express middleware
│   ├── authMiddleware.ts
│   ├── rateLimiter.ts
│   ├── subscriptionGate.ts
│   ├── errorHandler.ts
│   └── correlationId.ts
├── db/                        # Drizzle schema + queries
│   ├── schema.ts              # All table definitions
│   ├── queries/               # Typed query functions (org_id required on every function)
│   │   ├── users.ts
│   │   ├── datasets.ts
│   │   └── subscriptions.ts
│   └── seed.ts                # Seed data script
├── config.ts                  # Zod-validated env config (single source of truth)
└── test/                      # Test infrastructure
    ├── fixtures/
    ├── helpers/
    └── setup.ts
```

**Rule: Routes are thin.** A route handler validates input (Zod), calls a service, and returns the response. It never contains business logic. Services are testable without Express.

**Rule: Services never import `db` directly.** They import query functions from `db/queries/*.ts`. This creates a single chokepoint where org_id scoping can be enforced and audited. Every query function takes `orgId` as a required parameter.

**Shared Package Organization:**

```
packages/shared/
├── src/
│   ├── schemas/
│   │   ├── auth.ts            # createUserSchema, loginResponseSchema
│   │   ├── datasets.ts        # uploadDatasetSchema, dataRowSchema
│   │   ├── ai.ts              # aiSummaryRequestSchema, insightSchema
│   │   └── index.ts           # Re-exports all schemas
│   ├── types/
│   │   └── index.ts           # Inferred types: type DataRow = z.infer<typeof dataRowSchema>
│   └── constants/
│       └── index.ts           # Shared constants (MAX_FILE_SIZE, AI_TIMEOUT_MS, etc.)
└── package.json               # Exports map for sub-path imports
```

**Rule: One schema file per domain. Types inferred from schemas, never hand-written.**

**Package exports map** (in `packages/shared/package.json`):
```json
{
  "exports": {
    "./schemas": "./src/schemas/index.ts",
    "./types": "./src/types/index.ts",
    "./constants": "./src/constants/index.ts"
  }
}
```
Import pattern: `import { dataRowSchema } from '@shared/schemas'`, `import { MAX_FILE_SIZE } from '@shared/constants'`. No barrel `index.ts` at root — forces explicit sub-path imports for better tree-shaking.

**Import Alias Rules:**
- `@shared/*` → `packages/shared/src/*` (configured in tsconfig paths + pnpm workspace)
- `@/` → relative to current app root (Next.js default, extended to Express via tsconfig)
- **Never use relative paths crossing package boundaries**

### Format Patterns

**API Response Wrapper:**
All API responses use a consistent wrapper. No bare data returns.

```typescript
// Success response
{ "data": T, "meta"?: { pagination, timing } }

// Error response
{ "error": { "code": string, "message": string, "details"?: unknown } }
```

| Scenario | HTTP Status | Error Code | Example |
|----------|------------|------------|---------|
| Validation failure | 400 | `VALIDATION_ERROR` | `{ error: { code: "VALIDATION_ERROR", message: "CSV must have a date column" } }` |
| Not authenticated | 401 | `AUTHENTICATION_REQUIRED` | |
| Not authorized | 403 | `FORBIDDEN` | |
| Not found | 404 | `NOT_FOUND` | |
| Rate limited | 429 | `RATE_LIMITED` | Includes `Retry-After` header |
| External service failure | 502 | `EXTERNAL_SERVICE_ERROR` | Claude API or Stripe down |
| Server error | 500 | `INTERNAL_ERROR` | Never expose stack traces |

**Date/Time Format:**
- API JSON: ISO 8601 strings (`"2026-02-19T14:30:00Z"`) — always UTC
- Database: `timestamp with time zone` columns
- UI display: Formatted by client using `Intl.DateTimeFormat` with user locale
- Never store or transmit Unix timestamps

**JSON Field Naming:**
- API request/response bodies: **camelCase** (`{ "datasetId": "...", "startDate": "..." }`)
- Database columns: **snake_case** (Drizzle handles the mapping)

**Null Handling:**
- Omit null fields from API responses (don't send `"field": null`)
- Use TypeScript `| undefined` for optional fields, `| null` only for database nullability
- Empty arrays are `[]`, never `null`

### Communication Patterns

**Analytics Event Naming:**
Dot-notation, past tense: `dataset.uploaded`, `ai_summary.viewed`, `insight.shared`, `subscription.upgraded`, `transparency_panel.opened`.

**Event Payload Structure:**
```typescript
interface AnalyticsEvent {
  eventType: string;
  orgId: string;
  userId: string;
  metadata: Record<string, unknown>;
  timestamp: string;  // ISO 8601
}
```

**Logging Conventions:**
```typescript
// Always use structured logging with Pino
logger.info({ datasetId, orgId, rowCount }, 'CSV upload processed');
logger.error({ err, correlationId }, 'Claude API call failed');

// NEVER:
console.log('something happened');
logger.info('CSV upload processed for ' + datasetId);
```

Log levels: `error` (failures requiring attention), `warn` (degraded but functional — e.g., Redis down), `info` (business events — upload, login, AI generation), `debug` (development only).

### Process Patterns

**Error Handling Chain:**
```
Route handler → try/catch → service throws AppError → errorHandler middleware → structured response
```

**Loading State Pattern:**
React components use three states: `idle`, `loading`, `error`. Skeleton components match the shape of the content they replace.

**Retry Pattern:**
Only for external service calls (Claude API, Stripe). Max 2 retries with exponential backoff (1s, 3s). Never retry on 4xx errors. Always retry on 5xx and network errors.

### Infrastructure Patterns

**BFF Dual API Client:**
Two typed API clients prevent confusion between Client Component and Server Component fetch patterns:

- `apps/web/lib/api-client.ts` — For **Client Components**. Calls `/api/*` proxy routes. Handles error parsing, type inference from Zod schemas.
- `apps/web/lib/api-server.ts` — For **Server Components**. Calls `http://api:3001` directly. Forwards cookies from the request context. Same typed response handling.

Rule: **Client Components import from `api-client.ts`. Server Components import from `api-server.ts`. Never use raw `fetch()` in either context.**

**Centralized Environment Config:**
Each app has a `config.ts` that validates environment variables at startup with Zod. Application code never reads `process.env` directly.

```typescript
// apps/api/src/config.ts
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  CLAUDE_API_KEY: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().default(3001),
});
export const env = envSchema.parse(process.env);
```

Rule: **Fails fast at startup if env vars are missing. Never use `process.env` in application code.**

### Test Boundary Rules

Explicit rules for what gets tested at which level to prevent test-type confusion:

| What | Test with | Example |
|------|-----------|---------|
| Pure functions (curation pipeline, validators) | Vitest unit test | `computation.test.ts` — call function, assert output |
| Service layer (business logic with deps) | Vitest + test doubles | `tokenService.test.ts` — mock DB queries, assert behavior |
| Express route handlers | Vitest + supertest | `datasets.test.ts` — HTTP request/response, mock services |
| React Client Components | Vitest + React Testing Library | `UploadDropzone.test.tsx` — render, interact, assert |
| React Server Components | Playwright E2E | `dashboard.spec.ts` — full browser, real page load |
| User journeys (multi-page flows) | Playwright E2E | `auth-flow.spec.ts` — login → upload → view dashboard |
| Database queries | Vitest integration (test DB) | `queries/datasets.test.ts` — real PostgreSQL, seeded data |

Rule: **If it can be tested without a browser, use Vitest. If it requires RSC rendering or multi-page navigation, use Playwright. No middle ground.**

### Enforcement Guidelines

**All AI Agents MUST:**
1. Follow naming conventions exactly — no exceptions, no "just this once"
2. Keep route handlers thin — validate, call service, return response
3. Use the AppError hierarchy — never throw raw Error objects from services
4. Use structured Pino logging — never `console.log`
5. Co-locate unit tests with source files; test infra in `apps/*/src/test/`
6. Use Zod schemas from `@shared/schemas` for all API validation
7. Include org_id in every database query function — fail closed if missing
8. Return API responses in the standard wrapper format
9. Use `api-client.ts` in Client Components, `api-server.ts` in Server Components — never raw `fetch()`
10. Import env vars from `config.ts` — never read `process.env` directly
11. Put all DB queries in `db/queries/` — services never import `db` directly

**Pattern Verification:**
- ESLint rules enforce import boundaries (apps/web cannot import from apps/api)
- TypeScript strict mode catches type mismatches between Zod schemas and Drizzle types
- CI typecheck stage catches cross-package type errors before tests run

## Project Structure & Boundaries

### Complete Project Directory Structure

Enhanced with Code Review Gauntlet (5 findings) and Party Mode review (4 findings) — 9 structural improvements applied.

```
saas-analytics-dashboard/
├── .github/
│   └── workflows/
│       └── ci.yml                          # 5-stage pipeline: lint/typecheck → test → seed-validation → E2E → Docker smoke
├── scripts/                                # CI/operational scripts (self-documenting pipeline)
│   ├── validate-seed.ts                    # CI Stage 3: seed → verify 2+ AI insight types
│   └── smoke-test.sh                       # CI Stage 5: docker compose up → health check → down
├── apps/
│   ├── web/                                # Next.js 16 (App Router, RSC, Turbopack)
│   │   ├── app/
│   │   │   ├── layout.tsx                  # Root layout: fonts, metadata, providers
│   │   │   ├── page.tsx                    # Landing/marketing page (unauthenticated)
│   │   │   ├── globals.css                 # Tailwind CSS 4 imports + custom properties
│   │   │   ├── (auth)/                     # Auth route group (no layout nesting)
│   │   │   │   ├── login/
│   │   │   │   │   └── page.tsx            # Google OAuth login page
│   │   │   │   └── callback/
│   │   │   │       └── page.tsx            # OAuth callback handler
│   │   │   ├── dashboard/
│   │   │   │   ├── layout.tsx              # Authenticated layout: sidebar + header
│   │   │   │   ├── page.tsx                # Dashboard page (RSC — data fetch + chart layout)
│   │   │   │   ├── DashboardCharts.tsx     # Client component: Recharts + SWR revalidation
│   │   │   │   ├── AiSummary.tsx           # Client component: SSE stream + useReducer
│   │   │   │   ├── TransparencyPanel.tsx   # Client component: data lineage + confidence
│   │   │   │   ├── FilterBar.tsx           # Client component: date range + category filters
│   │   │   │   ├── charts/                 # Co-located chart wrappers (dashboard-only until shared)
│   │   │   │   │   ├── BarChart.tsx        # Styled bar chart with common defaults
│   │   │   │   │   ├── LineChart.tsx       # Styled line chart with common defaults
│   │   │   │   │   └── ChartSkeleton.tsx   # Loading skeleton matching chart shapes
│   │   │   │   └── loading.tsx             # Skeleton loader (RSC Suspense fallback)
│   │   │   ├── upload/
│   │   │   │   ├── page.tsx                # Upload page (RSC)
│   │   │   │   ├── UploadDropzone.tsx      # Client component: drag-drop + validation
│   │   │   │   ├── CsvPreview.tsx          # Client component: preview before confirm
│   │   │   │   └── loading.tsx             # Skeleton loader
│   │   │   ├── billing/
│   │   │   │   ├── page.tsx                # Subscription management (RSC)
│   │   │   │   ├── PricingCard.tsx         # Client component: plan comparison
│   │   │   │   └── SubscriptionStatus.tsx  # Client component: current plan status
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx                # Admin dashboard (RSC, role-gated)
│   │   │   │   └── AdminStats.tsx          # Client component: platform analytics
│   │   │   ├── share/
│   │   │   │   └── [shareId]/
│   │   │   │       └── page.tsx            # Public shareable insight card view
│   │   │   └── api/                        # BFF proxy routes — request forwarding ONLY (never redirect)
│   │   │       ├── auth/
│   │   │       │   ├── login/
│   │   │       │   │   └── route.ts        # Proxy: POST → Express /auth/google
│   │   │       │   ├── refresh/
│   │   │       │   │   └── route.ts        # Proxy: POST → Express /auth/refresh
│   │   │       │   └── logout/
│   │   │       │       └── route.ts        # Proxy: POST → Express /auth/logout
│   │   │       ├── datasets/
│   │   │       │   └── route.ts            # Proxy: GET/POST → Express /datasets
│   │   │       ├── ai-summaries/
│   │   │       │   └── route.ts            # Proxy: GET → Express /ai-summaries (SSE passthrough)
│   │   │       ├── subscriptions/
│   │   │       │   └── route.ts            # Proxy: POST → Express /subscriptions
│   │   │       └── health/
│   │   │           └── route.ts            # Proxy: GET → Express /health
│   │   ├── components/                     # Shared UI components (used by 2+ routes)
│   │   │   ├── ui/                         # shadcn/ui components (auto-generated)
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── skeleton.tsx
│   │   │   │   ├── toast.tsx
│   │   │   │   └── ...                     # Other shadcn/ui components as needed
│   │   │   ├── layout/
│   │   │   │   ├── AppHeader.tsx           # Top navigation bar
│   │   │   │   ├── AppSidebar.tsx          # Side navigation
│   │   │   │   └── AppFooter.tsx           # Footer
│   │   │   └── common/
│   │   │       ├── DemoModeBanner.tsx       # "Sample data" banner per demo state machine
│   │   │       ├── UpgradeCta.tsx           # Free→Pro upgrade call-to-action
│   │   │       ├── ErrorBoundary.tsx        # Client error boundary
│   │   │       └── MobileAiSummary.tsx      # Mobile-first AI summary (above fold on <768px)
│   │   ├── lib/
│   │   │   ├── api-client.ts               # Typed fetch: Client Components → /api/* proxy
│   │   │   ├── api-server.ts               # Typed fetch: Server Components → http://api:3001
│   │   │   ├── auth.ts                     # Client-side auth helpers (token check, redirect)
│   │   │   └── hooks/
│   │   │       ├── useAiStream.ts           # SSE streaming hook with useReducer
│   │   │       ├── useSubscription.ts       # Subscription status hook
│   │   │       └── useDemoMode.ts           # Demo mode state detection hook
│   │   ├── proxy.ts                         # Next.js 16 proxy — route protection ONLY (redirect unauthed → /login, never call Express)
│   │   ├── next.config.ts                   # Next.js 16 config: Turbopack, proxy rewrites
│   │   ├── tailwind.config.ts               # Tailwind CSS 4 configuration
│   │   ├── tsconfig.json                    # TypeScript config with @/ alias
│   │   ├── package.json                     # Dependencies: next, react, swr, recharts, shadcn/ui
│   │   └── vitest.config.ts                 # Vitest config for Client Component tests
│   │
│   └── api/                                 # Express.js 5 backend
│       ├── src/
│       │   ├── index.ts                     # Express app entry: middleware chain, route mounting, server start
│       │   ├── config.ts                    # Zod-validated env config (single source of truth)
│       │   ├── routes/                      # Route handlers (thin: validate → service → respond)
│       │   │   ├── auth.ts                  # POST /auth/google, POST /auth/refresh, POST /auth/logout
│       │   │   ├── datasets.ts              # GET /datasets, POST /datasets (CSV upload)
│       │   │   ├── aiSummary.ts             # GET /ai-summaries/:datasetId (SSE stream)
│       │   │   ├── subscriptions.ts         # POST /subscriptions/checkout (JSON body parsed)
│       │   │   ├── stripeWebhook.ts         # POST /webhooks/stripe (raw body — mounted BEFORE JSON parser)
│       │   │   ├── sharing.ts               # POST /shares, GET /shares/:shareId
│       │   │   ├── admin.ts                 # GET /admin/stats (role-gated)
│       │   │   └── health.ts                # GET /health (PostgreSQL + Redis connectivity)
│       │   ├── services/                    # Business logic layer
│       │   │   ├── auth/
│       │   │   │   ├── googleOAuth.ts       # Google OAuth token exchange + user creation
│       │   │   │   ├── tokenService.ts      # JWT signing/verification, refresh rotation
│       │   │   │   └── index.ts             # Re-export auth service interface
│       │   │   ├── adapters/                # Pluggable data source adapter pattern
│       │   │   │   ├── interface.ts         # DataSourceAdapter interface + shared adapter types
│       │   │   │   └── index.ts             # Re-export (Growth-tier adapters import from here)
│       │   │   ├── dataIngestion/
│       │   │   │   ├── csvAdapter.ts        # CSV parser implementing DataSourceAdapter
│       │   │   │   ├── normalizer.ts        # Transform parsed data → data_rows schema
│       │   │   │   └── index.ts             # Re-export ingestion service
│       │   │   ├── curation/
│       │   │   │   ├── types.ts             # Internal types: ComputedStat, ScoredInsight, AssembledContext
│       │   │   │   ├── computation.ts       # Pure stats (simple-statistics): mean, median, outliers, trends
│       │   │   │   ├── scoring.ts           # Relevance weights + ranking (reads config)
│       │   │   │   ├── assembly.ts          # Versioned prompt templates → Claude context
│       │   │   │   ├── config/              # Tunable without code changes
│       │   │   │   │   ├── scoring-weights.json    # Relevance weights: novelty, actionability, specificity
│       │   │   │   │   └── prompt-templates/
│       │   │   │   │       └── v1.md               # Versioned prompt template for Claude
│       │   │   │   └── index.ts             # Pipeline orchestrator: computation → scoring → assembly
│       │   │   ├── aiInterpretation/
│       │   │   │   ├── claudeClient.ts      # Anthropic SDK wrapper with retry + backoff
│       │   │   │   ├── streamHandler.ts     # SSE response construction + 15s timeout
│       │   │   │   └── index.ts             # Re-export AI service
│       │   │   ├── subscription/
│       │   │   │   ├── stripeService.ts     # Stripe Checkout session creation + status sync
│       │   │   │   ├── webhookHandler.ts    # Stripe webhook event processing (idempotent)
│       │   │   │   └── index.ts             # Re-export subscription service
│       │   │   ├── sharing/
│       │   │   │   ├── shareService.ts      # Create shareable links, retrieve shared insights
│       │   │   │   ├── pngRenderer.ts       # Server-side PNG generation for insight cards
│       │   │   │   └── index.ts             # Re-export sharing service
│       │   │   ├── admin/
│       │   │   │   ├── adminService.ts      # Platform statistics and analytics aggregation
│       │   │   │   └── index.ts
│       │   │   └── analytics/
│       │   │       ├── eventTracker.ts      # Analytics event recording (7+ event types)
│       │   │       └── index.ts
│       │   ├── middleware/
│       │   │   ├── authMiddleware.ts         # JWT verification + claims extraction
│       │   │   ├── rateLimiter.ts            # Redis-backed rate limiting (3 tiers, fail-open)
│       │   │   ├── subscriptionGate.ts       # Pro-only feature access check
│       │   │   ├── errorHandler.ts           # Global error handler → structured response
│       │   │   ├── correlationId.ts          # UUID per request, attached to Pino logger
│       │   │   └── roleGuard.ts              # RBAC middleware factory: roleGuard('admin')
│       │   ├── db/
│       │   │   ├── index.ts                  # Drizzle client init + pool config (INTERNAL — never imported outside db/)
│       │   │   ├── schema.ts                 # All Drizzle table definitions (8 tables)
│       │   │   ├── queries/                  # Typed query functions (org_id required on every fn)
│       │   │   │   ├── users.ts              # findUserByGoogleId, createUser, getUserOrgs
│       │   │   │   ├── orgs.ts               # createOrg, findOrgBySlug
│       │   │   │   ├── datasets.ts           # createDataset, getDatasets, getDemoModeState
│       │   │   │   ├── dataRows.ts           # insertBatch, getByDateRange, getByCategory
│       │   │   │   ├── subscriptions.ts      # upsertSubscription, getActiveSubscription
│       │   │   │   ├── refreshTokens.ts      # createToken, findByHash, revokeToken
│       │   │   │   ├── analyticsEvents.ts    # recordEvent, getEventCounts
│       │   │   │   └── index.ts              # Barrel re-export (services import from @/db/queries)
│       │   │   ├── seed.ts                   # Seed data script: deliberate anomalies for AI insight variety
│       │   │   └── migrate.ts                # Migration runner (called from Docker entrypoint)
│       │   ├── lib/
│       │   │   ├── appError.ts               # AppError hierarchy (Validation, Auth, NotFound, External)
│       │   │   ├── logger.ts                 # Pino instance + child logger factory
│       │   │   └── redis.ts                  # Redis client initialization + health check
│       │   └── test/                         # Test infrastructure (Vitest)
│       │       ├── fixtures/
│       │       │   ├── users.ts              # Factory functions for test users/orgs
│       │       │   ├── datasets.ts           # Factory functions for test datasets/rows
│       │       │   └── csvFiles.ts           # Sample CSV content for upload tests
│       │       ├── helpers/
│       │       │   ├── testDb.ts             # Test database setup/teardown
│       │       │   └── testApp.ts            # Express app with test middleware
│       │       └── setup.ts                  # Vitest global setup (env vars, DB connection)
│       ├── drizzle/                          # Drizzle migration files (versioned SQL)
│       │   └── migrations/                   # Auto-generated by drizzle-kit generate
│       ├── drizzle.config.ts                 # Drizzle Kit configuration
│       ├── tsconfig.json                     # TypeScript config with @/ alias
│       ├── package.json                      # Dependencies: express, drizzle-orm, @anthropic-ai/sdk, stripe, jose, pino
│       └── vitest.config.ts                  # Vitest config for API tests
│
├── packages/
│   └── shared/                              # Shared Zod schemas, types, constants
│       ├── src/
│       │   ├── schemas/                     # One file per domain
│       │   │   ├── auth.ts                  # createUserSchema, loginResponseSchema, jwtPayloadSchema
│       │   │   ├── datasets.ts              # uploadDatasetSchema, dataRowSchema, csvValidationSchema
│       │   │   ├── ai.ts                    # aiSummaryRequestSchema, insightSchema, transparencySchema
│       │   │   ├── subscriptions.ts         # checkoutSessionSchema, subscriptionStatusSchema
│       │   │   ├── sharing.ts               # createShareSchema, shareResponseSchema
│       │   │   ├── api.ts                   # apiResponseSchema, apiErrorSchema (wrapper types)
│       │   │   └── index.ts                 # Re-exports all schemas
│       │   ├── types/
│       │   │   └── index.ts                 # z.infer<> types + utility types
│       │   └── constants/
│       │       └── index.ts                 # MAX_FILE_SIZE, AI_TIMEOUT_MS, RATE_LIMITS, ROLES
│       ├── package.json                     # Exports map: ./schemas, ./types, ./constants
│       └── tsconfig.json                    # TypeScript config
│
├── e2e/                                     # Playwright E2E tests (root level)
│   ├── fixtures/                            # E2E test data
│   │   ├── testUsers.ts                     # Test account credentials + factories
│   │   ├── testCsvFiles.ts                  # Sample CSV content for upload tests
│   │   └── seedStates.ts                    # Preset seed/demo mode states
│   ├── helpers/                             # E2E test utilities
│   │   ├── login.ts                         # Reusable auth flow (Google OAuth mock)
│   │   ├── seedData.ts                      # Data seeding/cleanup between tests
│   │   └── screenshots.ts                   # Screenshot comparison utilities
│   ├── auth.spec.ts                         # Login → callback → dashboard redirect
│   ├── upload.spec.ts                       # CSV upload → preview → confirm → chart update
│   ├── dashboard.spec.ts                    # Dashboard render → filters → chart interaction
│   ├── ai-summary.spec.ts                   # AI summary stream → transparency panel
│   ├── billing.spec.ts                      # Upgrade → Stripe checkout → Pro features
│   ├── share.spec.ts                        # Share insight → public link → CTA
│   ├── mobile.spec.ts                       # Mobile viewport: AI summary above fold
│   └── playwright.config.ts                 # Playwright config: base URL, projects (desktop + mobile)
│
├── docker-compose.yml                       # 4 services: web, api, db (PostgreSQL 18), redis (Redis 7)
├── docker-compose.override.yml              # Dev overrides: volume mounts, hot reload, ports
├── Dockerfile.web                           # Next.js 16 production build
├── Dockerfile.api                           # Express production build
├── .env.example                             # All env vars with descriptions (committed)
├── .gitignore                               # node_modules, .env, .next, dist, coverage
├── turbo.json                               # Turborepo: task pipeline (build, test, lint, typecheck)
├── pnpm-workspace.yaml                      # Workspace: apps/*, packages/*
├── package.json                             # Root: scripts, devDependencies (eslint, prettier, typescript)
├── tsconfig.base.json                       # Shared TypeScript config (extended by all packages)
├── .eslintrc.cjs                            # Shared ESLint config (import boundaries enforced)
├── .prettierrc                              # Prettier config (consistent formatting)
└── README.md                                # Portfolio case study (FR38)
```

### Architectural Boundaries

**API Boundaries:**

| Boundary | From | To | Protocol | Auth |
|----------|------|----|----------|------|
| Browser → BFF | Client Components | Next.js `/api/*` routes | HTTP/fetch | Cookies (httpOnly) |
| BFF → Express | Next.js proxy routes | Express `:3001` | HTTP (Docker internal) | Cookie forwarding |
| Server → Express | Server Components | Express `:3001` | HTTP (Docker internal) | Cookie forwarding |
| Express → PostgreSQL | Query functions | PostgreSQL `:5432` | TCP/pg driver | Connection string |
| Express → Redis | Rate limiter, cache | Redis `:6379` | TCP/ioredis | Connection string |
| Express → Claude API | AI interpretation service | Anthropic API | HTTPS | API key |
| Express → Stripe | Subscription service | Stripe API | HTTPS | Secret key |
| Stripe → Express | Webhook events | Express `/webhooks/stripe` | HTTPS | Signature verification |
| Express → Browser | SSE stream | Client via BFF passthrough | SSE (text/event-stream) | JWT (validated before stream) |

**Proxy vs API Route Boundary Rule:**
- `proxy.ts` handles **route protection only** — redirects unauthenticated users to `/login`. It never calls Express or processes API data.
- `app/api/*/route.ts` handles **request forwarding only** — proxies requests to Express with cookie forwarding. It never redirects to pages.
- These two mechanisms must never overlap. This prevents auth logic fragmentation across two systems.

**Component Boundaries:**

| Layer | Owns | Never Touches |
|-------|------|---------------|
| **Route handlers** (`routes/`) | Request validation (Zod), response formatting | Database, external APIs, business logic |
| **Services** (`services/`) | Business logic, orchestration | Raw `db` object, `process.env`, HTTP response objects |
| **Query functions** (`db/queries/`) | SQL queries, org_id enforcement | Business logic, HTTP concerns, external APIs |
| **DB module** (`db/index.ts`) | Drizzle client, connection pool | Everything — internal to `db/` directory, never imported by services |
| **Middleware** (`middleware/`) | Cross-cutting: auth, rate limiting, errors | Business logic, database queries |
| **Shared schemas** (`packages/shared/`) | Type definitions, validation rules | Any runtime code, database access, API calls |
| **React pages** (`app/*/page.tsx`) | Data fetching (RSC), layout | Client-side state, event handlers, browser APIs |
| **React components** (`*.tsx` client) | UI rendering, event handlers, client state | Server-side data fetching, direct API calls (use api-client.ts) |

**Data Boundaries:**

| Data Type | Stays Within | Never Crosses To |
|-----------|-------------|-----------------|
| Raw CSV rows | `dataIngestion/` → `data_rows` table | LLM prompt, client response |
| Computed statistics | `curation/computation.ts` output | Raw data (no reverse flow) |
| Curation internal types | `curation/types.ts` (ComputedStat, ScoredInsight, AssembledContext) | `packages/shared` — these are service-internal |
| LLM prompt context | `curation/assembly.ts` → Claude API | Client (only AI response sent to client) |
| JWT claims | Cookie → middleware → `req.user` | Database storage (except refresh_tokens) |
| Stripe secrets | `config.ts` → Stripe SDK | Logs, client responses, error messages |
| Stripe raw body | `stripeWebhook.ts` route (before JSON parser) | Other routes (which use parsed JSON) |

### Requirements to Structure Mapping

**FR Category → File Mapping:**

| FR Category | Routes | Services | Pages | Components |
|-------------|--------|----------|-------|------------|
| **Identity & Access** (FR1-5) | `routes/auth.ts` | `services/auth/*` | `app/(auth)/*` | — |
| **Data Ingestion** (FR6-12) | `routes/datasets.ts` | `services/adapters/*`, `services/dataIngestion/*` | `app/upload/*` | `UploadDropzone`, `CsvPreview` |
| **Visualization** (FR13-17) | (via datasets) | — | `app/dashboard/*` | `DashboardCharts`, `FilterBar`, `charts/*` |
| **AI Interpretation** (FR18-24) | `routes/aiSummary.ts` | `services/curation/*`, `services/aiInterpretation/*` | — | `AiSummary`, `TransparencyPanel`, `MobileAiSummary` |
| **Sharing & Export** (FR25-27) | `routes/sharing.ts` | `services/sharing/*` | `app/share/[shareId]/*` | — |
| **Subscription** (FR28-31) | `routes/subscriptions.ts`, `routes/stripeWebhook.ts` | `services/subscription/*` | `app/billing/*` | `PricingCard`, `SubscriptionStatus` |
| **Platform Admin** (FR32-35) | `routes/admin.ts` | `services/admin/*` | `app/admin/*` | `AdminStats` |
| **Portfolio & DevOps** (FR36-40) | `routes/health.ts` | — | — | — (CI/Docker/scripts/) |

**Cross-Cutting Concerns → File Mapping:**

| Concern | Implementation Location |
|---------|----------------------|
| Multi-tenancy (org_id) | `db/queries/*.ts` (every function), `middleware/authMiddleware.ts` (extraction) |
| Authentication | `middleware/authMiddleware.ts`, `services/auth/*`, `proxy.ts` (redirect only) |
| Authorization (RBAC) | `middleware/roleGuard.ts`, JWT claims, DOM conditional rendering |
| Error handling | `lib/appError.ts` (hierarchy), `middleware/errorHandler.ts` (global handler) |
| Rate limiting | `middleware/rateLimiter.ts`, `lib/redis.ts` |
| Logging | `lib/logger.ts` (Pino), `middleware/correlationId.ts` |
| Analytics events | `services/analytics/eventTracker.ts`, `db/queries/analyticsEvents.ts` |
| Subscription gate | `middleware/subscriptionGate.ts`, `db/queries/subscriptions.ts` |
| Demo mode | `db/queries/datasets.ts` (`getDemoModeState`), `components/common/DemoModeBanner.tsx`, `lib/hooks/useDemoMode.ts` |
| Type safety | `packages/shared/src/schemas/*` (Zod), all consumers import from `@shared/schemas` |
| Adapter extensibility | `services/adapters/interface.ts` (Growth-tier adapters implement this) |

### Integration Points

**Internal Communication:**

```
Browser ─── fetch() ──→ Next.js /api/* ─── fetch() ──→ Express :3001
                                   ↑                         │
                              Cookie forwarding          Pino logger
                                                    (correlation ID)
                                                         │
                          ┌──────────────────────────────┤
                          │              │               │
                     PostgreSQL       Redis         Claude API
                     (queries)     (rate limits)    (SSE stream)
```

**External Integrations:**

| Service | Integration Point | Auth Method | Error Handling |
|---------|------------------|-------------|----------------|
| Google OAuth | `services/auth/googleOAuth.ts` | OAuth 2.0 client credentials | ExternalServiceError + user-friendly message |
| Anthropic Claude | `services/aiInterpretation/claudeClient.ts` | API key (from config.ts) | Retry 2x with backoff; 15s timeout; partial result fallback |
| Stripe API | `services/subscription/stripeService.ts` | Secret key (from config.ts) | ExternalServiceError; webhook idempotency via event ID |
| Stripe Webhooks | `routes/stripeWebhook.ts` | Signature verification (raw body) | Mounted before JSON parser; idempotent processing |

**Data Flow (CSV Upload → AI Insight):**

```
CSV File → UploadDropzone.tsx → /api/datasets (proxy) → Express POST /datasets
  → csvAdapter.ts (parse + validate, implements DataSourceAdapter)
  → normalizer.ts (→ data_rows schema)
  → db/queries/dataRows.ts (INSERT batch)
  → SWR mutate() triggers chart revalidation

User requests AI summary → /api/ai-summaries (proxy) → Express GET /ai-summaries/:datasetId
  → subscriptionGate.ts (Pro check)
  → curation/computation.ts (stats from data_rows via db/queries)
  → curation/scoring.ts (rank by relevance weights from config/)
  → curation/assembly.ts (build prompt from top-N stats, uses types.ts interfaces)
  → claudeClient.ts (stream from Anthropic API)
  → streamHandler.ts (SSE → client via BFF passthrough)
  → AiSummary.tsx (useReducer renders streamed chunks)
```

### File Organization Patterns

**Configuration Files:**

| File | Location | Purpose |
|------|----------|---------|
| `turbo.json` | Root | Task pipeline: `build` depends on `lint` + `typecheck`; `test` runs in parallel |
| `pnpm-workspace.yaml` | Root | Defines `apps/*` and `packages/*` |
| `tsconfig.base.json` | Root | Shared: strict, ESM, path aliases |
| `docker-compose.yml` | Root | Production-like service definitions |
| `docker-compose.override.yml` | Root | Dev: volume mounts, hot reload, exposed ports |
| `.env.example` | Root | All env vars with descriptions |
| `apps/api/src/config.ts` | API app | Zod-validated env (fail fast at startup) |
| `curation/config/` | Inside curation service | Scoring weights + prompt templates (co-located with consumer) |

**Source Organization Rules:**
- Feature code lives in route-based directories under `app/` (Next.js) or domain-based directories under `services/` (Express)
- Shared utilities live in `lib/` (per app) or `packages/shared/` (cross-app)
- Client Components are co-located with their page when feature-specific, or in `components/` when used by 2+ routes
- Server Components are always `page.tsx` or `layout.tsx` files
- Service-internal types live in `services/*/types.ts`, not in `packages/shared` (only API-boundary types go in shared)
- The adapter interface lives in `services/adapters/` — separate from any specific adapter implementation

**Test Organization Rules:**
- Unit tests: co-located as `*.test.ts` next to source
- Integration tests (DB): co-located in `db/queries/*.test.ts` using test database
- E2E tests: root `e2e/` directory, one spec per user journey
- E2E fixtures: `e2e/fixtures/` — test users, CSV files, seed states
- E2E helpers: `e2e/helpers/` — login flow, data seeding, screenshot utilities
- API test fixtures: `apps/api/src/test/fixtures/` — factory functions, not static JSON
- API test helpers: `apps/api/src/test/helpers/` — `testDb.ts`, `testApp.ts`

### Development Workflow Integration

**Development Server Structure:**

```bash
# Single command to start everything:
docker compose up

# Services started:
# - web:  Next.js 16 dev server (Turbopack) on :3000
# - api:  Express dev server (tsx --watch) on :3001
# - db:   PostgreSQL 18 on :5432
# - redis: Redis 7 on :6379

# On first run:
# 1. Docker pulls images
# 2. pnpm install runs in web + api containers
# 3. Drizzle migrations run automatically (api entrypoint calls db/migrate.ts)
# 4. Seed data loads automatically (api entrypoint calls db/seed.ts)
# 5. Web + API servers start with hot reload
```

**Build Process Structure:**

```bash
# Turborepo orchestrates parallel builds:
pnpm turbo build

# Pipeline:
# 1. packages/shared builds first (dependency of both apps)
# 2. apps/web + apps/api build in parallel
# 3. Output: apps/web/.next/ + apps/api/dist/
```

**CI Pipeline Structure (GitHub Actions):**

```yaml
# Stage 1: Lint + Typecheck (parallel across apps)
# Stage 2: Unit + Integration tests (Vitest, parallel across apps)
# Stage 3: Seed validation (scripts/validate-seed.ts — insert seed → verify 2+ AI insight types)
# Stage 4: E2E tests (Playwright, Docker Compose up, e2e/*.spec.ts)
# Stage 5: Docker smoke test (scripts/smoke-test.sh — build images → compose up → health check → down)
```

**Deployment Structure:**

```bash
# Production builds:
docker build -f Dockerfile.web -t analytics-web .
docker build -f Dockerfile.api -t analytics-api .

# Production run:
docker compose -f docker-compose.yml up  # Without override = production settings
```

## Architecture Validation Results

Enhanced with Pre-mortem Analysis (4 findings) and Party Mode review (4 findings) — 10 total validation enhancements applied across gap analysis and stress-testing.

### Coherence Validation

**Decision Compatibility:**
All technology choices work together without conflicts. Verified compatibility chain:

- **Next.js 16 + React 19.2 + Tailwind CSS 4 + shadcn/ui** — compatible; shadcn/ui supports React 19 and Tailwind 4
- **Express 5 + Drizzle ORM 0.45.x + PostgreSQL 18** — compatible; Drizzle supports Express middleware patterns and PostgreSQL 18
- **jose 6.x (JWT) + Google OAuth 2.0** — compatible; jose handles JWT signing/verification independent of OAuth provider
- **Anthropic SDK + SSE** — compatible; SDK natively supports streaming via `stream: true` parameter
- **Recharts + SWR + React 19 RSC** — compatible; Recharts renders in Client Components, SWR handles revalidation, RSC handles initial data fetch
- **Vitest + Playwright** — no overlap; Vitest tests non-browser code, Playwright tests RSC paths and user journeys
- **Docker Compose + Turborepo + pnpm workspaces** — compatible; Docker services map to monorepo apps, Turborepo orchestrates builds within containers
- **Redis 7 (rate-limiter-flexible) + Express middleware** — compatible; rate-limiter-flexible provides Express middleware integration natively

No version conflicts or contradictory decisions found.

**Pattern Consistency:**
Implementation patterns fully support architectural decisions:

- **Naming conventions** are consistent: snake_case in DB, camelCase in API JSON, PascalCase for components — Drizzle handles the mapping layer
- **Error handling** chain (AppError hierarchy → errorHandler middleware → structured response wrapper) is used uniformly across all services
- **Test boundary rules** align with technology choices: Vitest for everything testable without a browser, Playwright for RSC + multi-page flows
- **Import patterns** (api-client.ts for Client Components, api-server.ts for Server Components, @shared/* for cross-package) prevent accidental boundary crossings
- **Process patterns** (retry with backoff for external services, fail-open for Redis, fail-closed for org_id) are consistent and non-contradictory

**Structure Alignment:**
Project structure supports all architectural decisions:

- Monorepo structure (`apps/web`, `apps/api`, `packages/shared`) matches the BFF proxy pattern with clear separation
- Service decomposition (`services/curation/computation.ts`, `scoring.ts`, `assembly.ts`) matches the three-layer curation pipeline decision
- Adapter extraction (`services/adapters/interface.ts` separate from `dataIngestion/csvAdapter.ts`) supports the pluggable data source decision
- DB encapsulation (`db/index.ts` internal, `db/queries/index.ts` as barrel export) enforces the "services never import db directly" rule structurally
- E2E infrastructure (`e2e/fixtures/`, `e2e/helpers/`) supports Playwright test patterns

### Requirements Coverage Validation

**Functional Requirements Coverage (41/41):**

| FR | Description | Architectural Support | Status |
|----|-------------|----------------------|--------|
| FR1 | Google OAuth sign up/sign in | `services/auth/googleOAuth.ts`, `routes/auth.ts`, `app/(auth)/*` | Covered |
| FR2 | Auto-create org on signup | `services/auth/googleOAuth.ts` (user + org creation in single transaction) | Covered |
| FR3 | Invite link for org membership | `services/auth/inviteService.ts` (added via gap analysis) | Covered |
| FR4 | Platform admin view/manage orgs | `routes/admin.ts`, `services/admin/adminService.ts`, `app/admin/*` | Covered |
| FR5 | Role-based capability restriction | `middleware/roleGuard.ts`, `middleware/authMiddleware.ts`, JWT claims | Covered |
| FR6 | CSV upload via drag-and-drop | `app/upload/UploadDropzone.tsx`, `routes/datasets.ts`, `services/dataIngestion/csvAdapter.ts` | Covered |
| FR7 | CSV validation with specific errors | `services/dataIngestion/csvAdapter.ts` (parse + validate), AppError hierarchy | Covered |
| FR8 | Upload preview before confirm | `app/upload/CsvPreview.tsx` (row count, types, sample rows) | Covered |
| FR9 | Sample CSV template download | `apps/web/public/templates/sample-data.csv` (added via gap analysis) | Covered |
| FR10 | Org-scoped data storage | `db/queries/datasets.ts`, `db/queries/dataRows.ts` — all functions require orgId | Covered |
| FR11 | First upload replaces seed data | Demo mode state machine: `seed_only` → `seed_plus_user` transition | Covered |
| FR12 | Re-upload preserves session | Client-side state preservation in `UploadDropzone.tsx` | Covered |
| FR13 | Interactive bar/line charts | `app/dashboard/DashboardCharts.tsx`, `charts/BarChart.tsx`, `charts/LineChart.tsx` (Recharts) | Covered |
| FR14 | Date range + category filters | `app/dashboard/FilterBar.tsx`, SWR revalidation on filter change | Covered |
| FR15 | Loading states | `app/dashboard/loading.tsx` (Suspense), `charts/ChartSkeleton.tsx` | Covered |
| FR16 | Seed data pre-loaded | `db/seed.ts` (Docker entrypoint + CI), demo mode state machine | Covered |
| FR17 | Demo data visual indicator | `components/common/DemoModeBanner.tsx`, `lib/hooks/useDemoMode.ts` | Covered |
| FR18 | Plain-English AI summary | `services/curation/*` → `services/aiInterpretation/claudeClient.ts` → `AiSummary.tsx` | Covered |
| FR19 | SSE streaming delivery | `services/aiInterpretation/streamHandler.ts`, `lib/hooks/useAiStream.ts` (useReducer) | Covered |
| FR20 | Transparency panel | `app/dashboard/TransparencyPanel.tsx`, context assembly includes lineage | Covered |
| FR21 | Free preview with upgrade CTA | `middleware/subscriptionGate.ts` + `components/common/UpgradeCta.tsx` | Covered |
| FR22 | Non-obvious + actionable insights | `curation/scoring.ts` (novelty/actionability weights), `curation/config/scoring-weights.json` | Covered |
| FR23 | Local stats + curated LLM context | `curation/computation.ts` (simple-statistics), `curation/assembly.ts` (accepts ComputedStat[], not DataRow[]) | Covered |
| FR24 | Mobile-first AI summary | `components/common/MobileAiSummary.tsx`, layout strategy (viewport < 768px) | Covered |
| FR25 | Share as rendered image | `services/sharing/pngRenderer.ts` (server-side PNG) | Covered |
| FR26 | Shareable read-only link | `routes/sharing.ts`, `services/sharing/shareService.ts` | Covered |
| FR27 | Focused insight card view | `app/share/[shareId]/page.tsx` (minimal chrome, single CTA) | Covered |
| FR28 | Free → Pro upgrade | `routes/subscriptions.ts`, `services/subscription/stripeService.ts` (Stripe Checkout) | Covered |
| FR29 | Subscription lifecycle | `services/subscription/webhookHandler.ts` (idempotent event processing) | Covered |
| FR30 | Payment failure revocation | `routes/stripeWebhook.ts` → `webhookHandler.ts` (invoice.payment_failed) | Covered |
| FR31 | Status verified before Pro access | `middleware/subscriptionGate.ts` (checks local DB, synced via webhook) | Covered |
| FR32 | Admin system health view | `app/admin/AdminStats.tsx`, `services/admin/adminService.ts` | Covered |
| FR33 | Admin analytics events view | `db/queries/analyticsEvents.ts` (getEventCounts), admin dashboard | Covered |
| FR34 | Admin-only DOM exclusion | `middleware/roleGuard.ts` (API), conditional rendering (DOM-level, not CSS) | Covered |
| FR35 | Health check endpoint | `routes/health.ts` — verifies PostgreSQL AND Redis connectivity | Covered |
| FR36 | Single Docker command launch | `docker-compose.yml` + `docker-compose.override.yml`, entrypoint runs migrate + seed | Covered |
| FR37 | CI automated checks | `.github/workflows/ci.yml` — 5-stage pipeline | Covered |
| FR38 | README case study | `README.md` at root, hero screenshot, architecture diagram | Covered |
| FR39 | Seed data AI quality in CI | `scripts/validate-seed.ts` — snapshot validation approach (validate prompt, not LLM output) | Covered |
| FR40 | Analytics event tracking | `services/analytics/eventTracker.ts`, `db/queries/analyticsEvents.ts` (7+ event types) | Covered |
| FR41 | Dark mode | Deferred to MVP-Complete; CSS custom properties approach documented in decisions | Covered |

**Non-Functional Requirements Coverage (27/27):**

| NFR | Description | Architectural Support | Status |
|-----|-------------|----------------------|--------|
| NFR1 | Dashboard < 3s (25 Mbps) | RSC data fetching, Turbopack build, Docker internal networking | Covered |
| NFR2 | TTFT < 2s | SSE streaming via `streamHandler.ts`, Claude API streaming parameter | Covered |
| NFR3 | AI total < 15s | 15s timeout in `streamHandler.ts`, partial result fallback | Covered |
| NFR4 | CSV < 5s (<10MB) | `csvAdapter.ts` streaming parse, batch INSERT via `dataRows.ts` | Covered |
| NFR5 | Chart interactions < 500ms | Client-side filtering via SWR cache, Recharts SVG re-render | Covered |
| NFR6 | Shared card < 2s | `app/share/[shareId]/page.tsx` — lightweight RSC, no auth overhead | Covered |
| NFR7 | HTTPS encryption | Docker + reverse proxy in production; `Secure` cookie flag | Covered |
| NFR8 | 15-min access tokens + httpOnly refresh | `services/auth/tokenService.ts`, `jose` JWT library, cookie config | Covered |
| NFR9 | org_id on every query | `db/queries/*.ts` — orgId required parameter on every function, fail-closed | Covered |
| NFR10 | Admin DOM exclusion | Conditional rendering (not CSS), role from JWT claims | Covered |
| NFR11 | Server-side role verification | `middleware/roleGuard.ts` + `middleware/authMiddleware.ts` | Covered |
| NFR12 | Webhook signature verification | `routes/stripeWebhook.ts` — raw body, `stripe.webhooks.constructEvent()` | Covered |
| NFR13 | No secrets in VCS | `.env.example` (committed), `.env` in `.gitignore`, `config.ts` Zod validation | Covered |
| NFR14 | 3-tier rate limiting | `middleware/rateLimiter.ts` + Redis (rate-limiter-flexible), fail-open | Covered |
| NFR15 | Docker first-run 100% | Docker Compose 4-service config, entrypoint migration/seed, CI smoke test | Covered |
| NFR16 | < 1% error rate core flows | AppError hierarchy, structured error handling, retry logic | Covered |
| NFR17 | AI graceful degradation | SSE fallback to synchronous, timeout with partial results | Covered |
| NFR18 | 15s timeout + partial results | `streamHandler.ts` timeout, accumulated partial result return | Covered |
| NFR19 | Seed data always available | `db/seed.ts` in Docker entrypoint, demo mode state machine | Covered |
| NFR20 | Integration timeout + errors | Per-service timeout config, `ExternalServiceError` class | Covered |
| NFR21 | User-friendly error messages | `middleware/errorHandler.ts` maps AppError to structured response | Covered |
| NFR22 | Idempotent webhooks | `webhookHandler.ts` — event ID deduplication | Covered |
| NFR23 | LLM retry with backoff | `claudeClient.ts` — max 2 retries, exponential backoff (1s, 3s) | Covered |
| NFR24 | Semantic HTML | shadcn/ui components use proper HTML elements; RSC layout structure | Covered |
| NFR25 | Keyboard navigation | shadcn/ui accessibility defaults, Recharts SVG keyboard support | Covered |
| NFR26 | Not color-only | Lucide icons + text labels accompany status colors | Covered |
| NFR27 | axe-core zero critical | Playwright E2E can run axe-core audits; shadcn/ui baseline accessibility | Covered |

### Implementation Readiness Validation

**Decision Completeness:**
All critical decisions are documented with specific versions:

- PostgreSQL 18.x, Drizzle ORM 0.45.x, jose 6.x, Next.js 16, Express 5, Redis 7.x, simple-statistics 7.8.x, Recharts (latest), SWR (latest), shadcn/ui (latest), Pino (latest)
- Implementation patterns are comprehensive: 32 conflict points addressed with specific code examples
- Consistency rules are enforceable: 11 mandatory rules for AI agents, ESLint import boundaries, TypeScript strict mode
- Code examples provided for: API response wrapper, env config validation, logging conventions, error handling chain, test boundary rules, analytics events, BFF proxy pattern

**Structure Completeness:**
The project structure defines 100+ files and directories with explicit file-to-FR mapping:

- Every FR category maps to specific route, service, page, and component files
- 11 cross-cutting concerns map to specific implementation locations
- Integration points are specified with auth methods and error handling per service
- Full data flow documented from CSV upload through AI insight delivery

**Pattern Completeness:**
All potential conflict points are addressed:

- Naming conventions cover DB, API, code, files, Zod schemas, Drizzle tables (6 domains)
- Communication patterns cover analytics events, logging, and inter-service calls
- Process patterns cover error handling, loading states, and retry logic
- Infrastructure patterns cover BFF proxy, env config, test boundaries, and Docker workflow

### Gap Analysis Results

**Critical Gaps Found and Resolved:**

1. **FR3 invite link service (gap)** — No explicit service file for invite link generation. **Resolution:** Added `services/auth/inviteService.ts` to the project structure.

2. **FR9 sample CSV template (gap)** — No file location specified for sample template download. **Resolution:** Added `apps/web/public/templates/sample-data.csv` to the project structure.

3. **File upload proxy — multipart/form-data (Pre-mortem)** — The BFF proxy pattern specifies cookie forwarding, but CSV upload requires raw body passthrough for multipart/form-data. Next.js API route must disable body parsing and forward the raw stream to Express. **Resolution:** Architecture note added — the datasets proxy route in `app/api/datasets/route.ts` must export `const config = { api: { bodyParser: false } }` (Next.js 16 equivalent) and pipe the raw request body to Express.

4. **SSE stream proxy — Next.js buffering (Pre-mortem)** — Next.js API routes buffer responses by default, which breaks SSE streaming. The AI summary proxy route must return a `ReadableStream` response with `text/event-stream` content type and disable response buffering. **Resolution:** Architecture note added — the ai-summaries proxy route must use `new Response(readableStream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } })` pattern.

5. **Seed validation CI strategy (Pre-mortem)** — `scripts/validate-seed.ts` references "verify 2+ AI insight types" but doesn't specify whether this calls the LLM in CI (costly, non-deterministic). **Resolution:** Architecture specifies **snapshot approach** — CI validates the curation pipeline output (assembled prompt), not the LLM response. The script: (1) inserts seed data into test DB, (2) runs curation pipeline (computation → scoring → assembly), (3) asserts the assembled context contains 2+ distinct stat categories (trend, anomaly, comparison). No LLM call in CI — deterministic, free, fast.

6. **OAuth callback URL (Pre-mortem)** — Google OAuth requires a redirect URI, but no `APP_URL` environment variable is defined. Docker development uses `localhost:3000` but production will differ. **Resolution:** Added `APP_URL` to the env config schema in `apps/web` config — used for OAuth callback URL construction and shareable link generation.

**Important Gaps Found and Resolved:**

7. **CORS non-decision (Party Mode)** — No CORS configuration is documented, which could confuse implementing agents into adding it unnecessarily. **Resolution:** Explicit non-decision documented — CORS is not needed because the BFF proxy pattern means the browser only communicates with Next.js (same origin). CORS configuration becomes relevant at Growth-tier if the API serves custom-domain clients directly. Flagged as Growth-tier consideration.

8. **Hero screenshot reproducibility (Party Mode)** — FR38 requires a hero screenshot in the README, but no mechanism for generating it reproducibly. Manual screenshots drift from the actual product. **Resolution:** Architecture specifies Playwright-based screenshot generation — `scripts/generate-screenshots.ts` launches Docker Compose, seeds data, navigates to dashboard, captures viewport screenshot, saves to `docs/screenshots/`. Can be run in CI for freshness validation.

9. **Screenshot generation script (Party Mode)** — No file location for screenshot generation. **Resolution:** Added `scripts/generate-screenshots.ts` and `docs/screenshots/` directory to project structure.

10. **Public directory missing from tree (Party Mode)** — `apps/web/public/` was not in the directory structure, but FR9 (sample template) and static assets need a home. **Resolution:** Added `apps/web/public/templates/sample-data.csv` to the project structure, establishing the public directory pattern.

**Nice-to-Have Gaps (Documented, Not Blocking):**

- **Database seeding idempotency** — `db/seed.ts` should check if seed data already exists before inserting (guard against re-runs). Pattern: `INSERT ... ON CONFLICT DO NOTHING` or existence check.
- **Monitoring/alerting** — Console-based Pino logging is sufficient for MVP. Growth-tier should add structured log aggregation and alerting. Documented as deferred decision.
- **API versioning** — No versioning for MVP (single consumer). Growth-tier with public API should add `/api/v1/` prefix. Documented as deferred decision.

### Validation Issues Addressed

All 10 validation issues were identified through structured analysis and resolved with architectural additions:

- **2 FR coverage gaps** → service file + static asset additions
- **4 Pre-mortem blockers** → proxy patterns, CI strategy, env var additions
- **4 Party Mode findings** → documentation, scripts, directory structure additions

No critical unresolved issues remain.

### Architecture Completeness Checklist

**Requirements Analysis**

- [x] Project context thoroughly analyzed (41 FRs, 27 NFRs, 5 journeys, 7 risks)
- [x] Scale and complexity assessed (medium-high, ~14-16 components)
- [x] Technical constraints identified (7 constraints including Option C, RSC testing, BFF proxy)
- [x] Cross-cutting concerns mapped (10 concerns with specific file locations)

**Architectural Decisions**

- [x] Critical decisions documented with versions (8 database, 8 auth, 10 API, 8 frontend, 8 infrastructure)
- [x] Technology stack fully specified (all libraries with version ranges)
- [x] Integration patterns defined (4 external services with auth + error handling)
- [x] Performance considerations addressed (NFR1-6 mapped to specific architectural choices)
- [x] Curation pipeline elevated to first-class decision (3-layer decomposition with file placement)

**Implementation Patterns**

- [x] Naming conventions established (6 domains: DB, API, code, files, schemas, Drizzle)
- [x] Structure patterns defined (test location, component organization, service organization, shared package)
- [x] Communication patterns specified (analytics events, logging, inter-service)
- [x] Process patterns documented (error handling, loading states, retry logic)
- [x] 32 conflict points identified and resolved
- [x] 11 mandatory enforcement rules for AI agents

**Project Structure**

- [x] Complete directory structure defined (100+ files with annotations)
- [x] Component boundaries established (8 layers with "owns" and "never touches" rules)
- [x] Integration points mapped (9 API boundaries with auth methods)
- [x] Requirements to structure mapping complete (8 FR categories + 11 cross-cutting concerns)
- [x] 9 structural enhancements from Code Review Gauntlet + Party Mode applied

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High — based on comprehensive validation across coherence, coverage, and readiness dimensions, enhanced by 19 total enhancements from 4 rounds of stress-testing (Code Review Gauntlet, Party Mode on structure, Pre-mortem on validation, Party Mode on validation).

**Key Strengths:**

1. **Curation pipeline is a first-class citizen** — The project's hardest problem (and primary differentiator) has its own decision section, three-layer decomposition, file placement, internal types, configurable weights, and versioned prompt templates
2. **Privacy-by-architecture** — Data flow boundaries are structurally enforced: `assembly.ts` accepts `ComputedStat[]`, not `DataRow[]` — raw data physically cannot reach the LLM prompt
3. **Pluggable adapter pattern** — `services/adapters/interface.ts` is extracted and separate from any specific adapter, ready for Growth-tier financial API integrations without rearchitecting
4. **Comprehensive naming conventions** — Six domains of naming rules prevent the most common source of AI agent inconsistency
5. **Test boundary clarity** — Explicit rules for what gets tested at which level, eliminating the RSC testing gap confusion
6. **Demo mode as state machine** — Four states with defined transitions, not a single boolean flag
7. **Proxy boundary rule** — `proxy.ts` (route protection) vs `app/api/*/route.ts` (request forwarding) prevents auth logic fragmentation
8. **Fail-open rate limiting** — Redis unavailability doesn't block all traffic

**Areas for Future Enhancement:**

1. **Growth-tier financial API adapters** — Interface is defined; implementations (QuickBooks, Xero, Stripe, Plaid) are Growth-tier scope
2. **Observability** — Pino structured logging is MVP-sufficient; log aggregation and alerting are Growth-tier
3. **API versioning** — Not needed for single-consumer MVP; required at Growth-tier with public API
4. **CORS** — Explicitly a non-decision for MVP (same-origin BFF); needed at Growth-tier for custom domains
5. **Multi-org UI** — Data model supports it (many-to-many `user_orgs`); UI limited to one org in MVP

### Implementation Handoff

**AI Agent Guidelines:**

- Follow all architectural decisions exactly as documented, including specific library versions
- Use implementation patterns consistently across all components — the 11 mandatory rules are non-negotiable
- Respect project structure and boundaries — the "Never Touches" column in component boundaries is enforced
- Refer to this document for all architectural questions — it is the single source of truth
- When in doubt, check the proxy boundary rule (proxy.ts vs app/api/) and the DB encapsulation rule (services import from db/queries/, never db/)
- The curation pipeline's three layers (computation → scoring → assembly) must remain separate — no monolithic service

**First Implementation Priority:**

1. **Monorepo scaffolding** — pnpm workspace + Docker Compose + Turborepo + packages/shared
2. **Authentication** — Google OAuth + JWT + refresh rotation (highest risk, do first)
3. **Data architecture** — Normalized schema + Drizzle migrations + seed data script
