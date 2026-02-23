---
stepsCompleted: ['step-01-validate-prerequisites', 'step-01-requirements-confirmed', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/architecture.md
  - _bmad-output/planning-artifacts/ux-design-specification.md
project_name: 'SaaS Analytics Dashboard'
---

# SaaS Analytics Dashboard - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for SaaS Analytics Dashboard, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**Tier key:** `[Core]` = MVP-Core (must ship), `[Complete]` = MVP-Complete (ships if timeline holds)

**Identity & Access**
- FR1: `[Core]` Users can sign up and sign in using their Google account
- FR2: `[Core]` The system automatically creates an organization for first-time users
- FR3: `[Core]` Org members can generate an invite link that allows new users to join their organization
- FR4: `[Complete]` Platform admins can view and manage all organizations and users system-wide
- FR5: `[Core]` The system restricts capabilities based on user role (org member vs. platform admin)

**Data Ingestion**
- FR6: `[Core]` Users can upload CSV files via drag-and-drop or file picker
- FR7: `[Core]` The system validates uploaded CSV files against expected format and displays specific error details when validation fails
- FR8: `[Core]` Users can preview uploaded data (row count, detected column types, sample rows) before confirming the upload
- FR9: `[Core]` Users can download a sample CSV template showing the expected format
- FR10: `[Core]` Uploaded data is stored scoped to the user's organization and visible to all members of that organization
- FR11: `[Core]` Users' first upload replaces demo/seed data within their organization
- FR12: `[Core]` The system preserves upload flow state so users can correct and re-upload without losing their session

**Visualization & Exploration**
- FR13: `[Core]` Users can view their business data as interactive charts (bar and line) that refresh when new data is uploaded
- FR14: `[Core]` Users can filter chart data by date range and category
- FR15: `[Core]` The system displays loading states while data and charts are being prepared
- FR16: `[Core]` The system pre-loads seed data so first-time visitors see a populated dashboard
- FR17: `[Core]` The system displays a visual indicator when users are viewing demo/sample data

**AI Interpretation**
- FR18: `[Core]` The system generates a plain-English AI summary interpreting the user's business data
- FR19: `[Core]` AI summaries are delivered progressively (streaming) so users see text appearing in real time
- FR20: `[Core]` Users can view how the AI reached its conclusions (transparency/methodology panel)
- FR21: `[Core]` Free-tier users can see a preview of the AI summary with a prompt to upgrade for full access
- FR22: `[Core]` The AI produces at least one non-obvious, actionable insight per analysis
- FR23: `[Core]` The system computes statistical analysis locally and sends curated context (not raw data) to the AI service
- FR24: `[Core]` On mobile viewports, the AI summary is positioned above the fold, before charts and filters

**Sharing & Export**
- FR25: `[Complete]` Users can share an insight (chart + AI summary) as a rendered image
- FR26: `[Complete]` Users can generate a shareable read-only link to a specific insight
- FR27: `[Complete]` Recipients of a shared link see a focused insight card view with a single call-to-action to create an account

**Subscription & Billing**
- FR28: `[Complete]` Users can upgrade their organization from Free to Pro tier
- FR29: `[Complete]` The system manages subscription lifecycle (creation, renewal, cancellation) via payment provider
- FR30: `[Complete]` The system revokes Pro access when payment fails
- FR31: `[Complete]` Subscription status is verified before granting access to Pro-only features

**Platform Administration**
- FR32: `[Complete]` Platform admins can view system health status (database, AI service, uptime)
- FR33: `[Complete]` Platform admins can view analytics events across the system
- FR34: `[Complete]` Admin-only interface elements are completely absent from the page for non-admin users
- FR35: `[Core]` The system exposes a health check endpoint for monitoring

**Portfolio & DevOps**
- FR36: `[Core]` The entire application can be launched with a single Docker command including seed data
- FR37: `[Core]` The system runs automated checks (lint, type checking, tests, seed validation, build) in CI
- FR38: `[Core]` The system includes a README in case-study format with hero screenshot and architecture diagram
- FR39: `[Core]` Seed data produces a meaningful AI summary validated in CI for both presence and quality
- FR40: `[Core]` The system tracks user behavior events (upload, view, share, export, upgrade, ai_summary_view, ai_preview_view, transparency_panel_open)

**Appearance**
- FR41: `[Complete]` Users can switch between light and dark appearance modes, with system preference detection as default

### NonFunctional Requirements

**Performance**
- NFR1: Dashboard initial page load completes within 3 seconds on 25 Mbps broadband
- NFR2: AI summary begins streaming (first token visible) within 2 seconds of request
- NFR3: AI summary completes full generation within 15 seconds
- NFR4: CSV upload and processing completes within 5 seconds for files under 10MB
- NFR5: Chart interactions (filtering, date range changes) respond within 500ms for datasets up to 10,000 rows
- NFR6: Shared insight card view loads within 2 seconds (lightweight page, no auth required)

**Security**
- NFR7: All data in transit is encrypted via HTTPS
- NFR8: Access tokens expire within 15 minutes; refresh tokens use httpOnly cookies with rotation
- NFR9: Every database query returning user-facing data includes an org_id filter. Queries without org_id scoping fail closed
- NFR10: Admin interface elements are excluded from the DOM (not hidden via CSS) for non-admin users
- NFR11: API endpoints verify user role on every request independent of frontend state
- NFR12: Payment webhook signatures are verified before processing
- NFR13: Environment secrets are never committed to version control
- NFR14: The system rate-limits API requests — auth (10/min/IP), AI (5/min/user), public (60/min/IP)

**Reliability**
- NFR15: Docker Compose first-run succeeds on macOS (Apple Silicon and Intel) and Linux (Ubuntu 22.04+) with Docker Engine 24+
- NFR16: Core user flows (authentication, upload, AI generation, payment) complete with < 1% error rate
- NFR17: AI service unavailability produces a graceful degradation message, not a broken UI
- NFR18: If AI generation exceeds 15 seconds, the system terminates the request and displays partial results or a graceful timeout message
- NFR19: Seed data and demo mode are always available — the dashboard is never empty

**Integration Resilience**
- NFR20: Each external integration (Google OAuth, Stripe, LLM API, PNG rendering) has timeout handling and structured error responses
- NFR21: External service failures produce user-friendly error messages, never raw error payloads
- NFR22: Stripe webhook handlers are idempotent — duplicate webhook delivery does not corrupt subscription state
- NFR23: LLM API calls include retry logic with backoff for transient failures

**Accessibility**
- NFR24: Semantic HTML elements used throughout (nav, main, article, section, button)
- NFR25: Interactive elements are keyboard-navigable
- NFR26: Color is not the sole means of conveying information (icons/labels accompany status colors)
- NFR27: Pages pass axe-core automated accessibility checks with zero critical violations

### Additional Requirements

**From Architecture — Starter & Infrastructure**
- Custom pnpm workspace scaffolding — no off-the-shelf starter. Manual monorepo setup: apps/web (Next.js 16), apps/api (Express 5), packages/shared (Zod schemas)
- Next.js 16 with Turbopack default, proxy.ts (replaces middleware.ts), React 19.2, async request APIs
- 4-service Docker Compose: web, api, db (PostgreSQL 18), redis (Redis 7)
- Docker entrypoint runs Drizzle migrations automatically + seed data on first run
- Turborepo for monorepo task orchestration (parallel builds, caching)
- TypeScript 5.x strict mode across all packages, ESM modules, Node.js 20+ LTS

**From Architecture — Database & Data Model**
- 11 database tables: users, orgs, user_orgs, refresh_tokens, datasets, data_rows, subscriptions, ai_summaries, analytics_events, org_invites, shares
- Drizzle ORM 0.45.x with versioned SQL migration files (drizzle-kit migrate)
- Normalized data_rows schema: category + parent_category for hierarchical support, metadata jsonb, source_type enum
- AI summary cache table: cache-first strategy, stale on data upload only (no time-based TTL), seed summaries pre-generated
- DB encapsulation: services import from db/queries/ barrel, never db/index.ts directly
- Every query function requires orgId parameter — fail closed if missing

**From Architecture — Curation Pipeline**
- 3-layer pipeline: computation (simple-statistics 7.8.x) → scoring (configurable weights JSON) → assembly (versioned prompt templates)
- Privacy-by-architecture: assembly.ts accepts ComputedStat[], not DataRow[] — raw data never reaches LLM
- Scoring weights stored as JSON config (tunable without code changes)
- Prompt templates versioned independently from business logic (in curation/config/prompt-templates/)

**From Architecture — API & Communication**
- BFF proxy pattern: browser → Next.js /api/* routes → Express :3001 (cookie forwarding)
- Two typed API clients: api-client.ts (Client Components), api-server.ts (Server Components) — never raw fetch()
- Structured AppError hierarchy: ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ExternalServiceError
- Standard API response wrapper: { data: T, meta?: {} } for success, { error: { code, message, details? } } for errors
- Subscription gate: annotating (not blocking) for AI endpoints — free tier gets truncated stream + upgrade_required SSE event
- Rate limiting: Redis-backed (rate-limiter-flexible), fail-open if Redis unavailable
- Pino structured JSON logging with request correlation IDs
- Analytics event naming: dot-notation, past tense (dataset.uploaded, ai_summary.viewed, etc.)

**From Architecture — Auth & RBAC**
- RBAC is two-dimensional: user_orgs.role (owner/member) + users.is_platform_admin boolean
- JWT claims: userId, org_id, role (owner/member), isAdmin (boolean)
- jose 6.x for JWT signing/verification
- Refresh token rotation with 7-day expiry, stored as token_hash in refresh_tokens table
- Cookie security: httpOnly, Secure, SameSite=Lax
- Centralized env config: Zod-validated config.ts, fail fast at startup, never read process.env directly

**From Architecture — Testing**
- Vitest for unit/integration tests (business logic, API routes, curation pipeline, Client Components)
- Playwright for E2E tests (RSC paths, user journeys, multi-page flows)
- Co-located test files (*.test.ts) next to source; E2E in root e2e/ directory
- No __mocks__/ directories — use Vitest vi.mock() inline
- Test fixtures as factory functions, not static JSON

**From Architecture — CI/CD**
- 5-stage GitHub Actions pipeline: lint/typecheck → test → seed-validation → E2E → Docker smoke
- Seed validation: snapshot approach — validates curation pipeline output determinism, not LLM response
- Docker smoke test: compose up → health check → compose down

**From Architecture — Demo Mode**
- 4-state machine: seed_only, seed_plus_user, user_only, empty
- Seed data flagged with is_seed_data boolean on datasets table
- State detection via query: SELECT EXISTS(... WHERE is_seed_data = false)
- Seed data includes deliberate anomalies for AI insight variety

**From UX — Design System**
- Trust Blue design direction with Warm Advisory left-border accent on AI summary card
- shadcn/ui + Tailwind CSS v4 + Radix UI accessibility primitives
- oklch color space for all design tokens
- Inter font via next/font/google (variable font, self-hosted at build time)
- next-themes for dark mode foundation (MVP-Complete tier)

**From UX — AI Summary Experience**
- 6 states: skeleton, streaming, complete, timeout, error, free preview
- Streaming cursor (▋ blinking) during SSE delivery
- Post-completion action reveal: Share + Transparency buttons fade in after streaming ends
- Timeout boundary: horizontal rule + "We focused on the most important findings" message
- Free preview: backend streams ~150 words then sends `upgrade_required` SSE event; frontend renders all received words clearly, then gradient overlay fades into blurred placeholder text + UpgradeCta. (~150 words ≈ 6-8 lines at 65ch width — enough to demonstrate AI value before paywall)
- Maximum 65ch line width for AI summary, 17px/1.8 line-height desktop, 16px/1.6 mobile
- aria-live="polite" during streaming for screen readers

**From UX — Upload Experience**
- 6 states: default, drag hover, processing, preview, success, error
- Mobile: file picker fallback (no drag-drop on touch devices)
- CsvPreview: 5-row mini-table with column type badges, row count, warnings
- Error messages: specific (expected vs found columns) with template download link
- State preservation: file reference retained after validation failure
- Success: redirect countdown to dashboard after upload completes

**From UX — Layout & Responsive**
- Mobile (< 768px): AI summary above fold, charts lazy-loaded below via Intersection Observer
- Desktop (≥ 1024px): 12-column grid, fixed 240px sidebar, AI card spans 8 columns
- Conditional React rendering for mobile/desktop AI components (not CSS display:none)
- useIsMobile hook: matchMedia + isMounted guard for hydration-safe component swap
- Touch targets minimum 44x44px on mobile
- FilterBar: sticky below AppHeader on scroll
- Charts: cross-fade animation on data change (Recharts built-in), skeletons for initial load only

**From UX — Shared Insight Card**
- Focused view: no nav, no sidebar, minimal chrome
- Open Graph meta tags for iMessage/WhatsApp/Slack previews
- Privacy: shows org name + date, never who shared it
- Single CTA: "See more insights — create your free account"

**From UX — Demo-to-Real Transition**
- Demo banner: informational (not a nag), auto-dissolves on first real upload
- Charts cross-fade from seed to real data (not hard swap)
- No "delete demo data" confirmation dialog

**From UX — Error Handling Philosophy**
- "Guide, Don't Block" principle: every error has specific message + concrete fix + preserved state
- Product blames itself ("We expected columns named..."), never the user ("Your file is wrong")
- Non-blocking error patterns: errors appear as banners/toasts, never replace the dashboard

**From Architecture — Auth Behavior**
- Silent refresh: expired access tokens trigger transparent refresh via httpOnly cookie — users never interrupted mid-session unless refresh token also expired (7-day expiry)
- Row-Level Security (RLS) policies on all tenant tables as defense-in-depth behind application-level org_id filtering

**From Architecture — Infrastructure Details**
- `docker-compose.override.yml` for dev overrides (volume mounts, hot reload, exposed debug ports) — separate from production-like `docker-compose.yml`
- `tsconfig.base.json` at monorepo root — all packages extend this shared config (strict mode, ESM, path aliases)
- `scripts/generate-screenshots.ts` — Playwright-based script generates hero screenshot for README (FR38), outputs to `docs/screenshots/`
- `apps/web/public/templates/sample-data.csv` — static asset for FR9 template download (not a generated endpoint)
- Shared `DateRange` type in `packages/shared/src/schemas/filters.ts` — used by FilterBar, DashboardCharts, and backend query params

**From Architecture — Known Limitations**
- One org per user (MVP): data model uses many-to-many `user_orgs` table but UI only handles single org. Document as known limitation in README/architecture.

**From UX — Accessibility (Additional)**
- `prefers-reduced-motion`: all CSS transitions/animations must include `@media (prefers-reduced-motion: reduce)` override — streaming cursor stays visible but static, skeletons use solid `--color-muted` without pulse, all decorative motion durations set to 0ms
- Skip-to-content link: visually hidden `<a>` as first focusable element on every page, visible on `:focus-visible`, targets `<main id="main-content">`

**From UX — Layout Rules (Additional)**
- `sm:` breakpoint exclusion: product intentionally skips `sm:` — no layout change between 0px and 767px. Use base classes (no prefix) for mobile, `md:` for first layout change. Do not use `sm:` prefixes.
- Chart skeletons must be shape-matched: rectangle matching chart aspect ratio (16:9) inside Card; AI summary skeleton: 4 text lines (descending width: 100%, 90%, 95%, 60%)
- `@theme` directive in `globals.css` for Tailwind v4 CSS-first configuration — all design tokens defined there, not in JS config file

**From UX — Component Patterns (Additional)**
- Mobile share button: floating action button (FAB) at bottom-right (48px touch target), replaces inline icon on mobile viewports
- TransparencyPanel (desktop): CSS Grid column expanding from `0fr` (collapsed) to `320px` on open — prevents layout reflow, preserves AI summary `65ch` reading width

**From UX — Payment Failure Transition**
- Pro → Free transition mid-session: when subscription lapses (webhook fires), current session continues until next page load. On next load, AI summary reverts to free preview (~150 words + blur). No real-time mid-page interruption. Toast notification on next dashboard visit: "Your Pro subscription has ended. You're now on the free plan."

**From UX — Upload Page Layout**
- Full page layout: AppHeader (sticky top) → page title "Upload Data" → UploadDropzone (centered, max-width 640px) → CsvPreview (below dropzone, same max-width) → action buttons (Confirm / Cancel). Back navigation via breadcrumb in AppHeader. Mobile: single column, full-width dropzone with file picker fallback.

**From Portfolio — Deploy Gate**
- Live deployment with seed data accessible at a public URL — PRD's 3rd Portfolio Success gate (alongside Docker Gate and README Gate). Deploy target and method determined during sprint planning.

**From Analytics — Event-to-Component Mapping**
- `dataset.uploaded` → UploadDropzone (Epic 2)
- `dashboard.viewed` → DashboardPage (Epic 2)
- `chart.filtered` → FilterBar (Epic 2)
- `ai_summary.viewed` → AiSummaryCard (Epic 3)
- `ai_preview.viewed` → AiSummaryCard free preview state (Epic 3)
- `transparency_panel.opened` → TransparencyPanel (Epic 3)
- `insight.shared` → ShareButton (Epic 4)
- `share_link.created` → ShareButton (Epic 4)
- `subscription.upgraded` → UpgradeCta / BillingPage (Epic 5)
- `subscription.cancelled` → BillingPage (Epic 5)

### Story Guidance Notes (from Pre-mortem + Red Team + Party Mode)

These findings were identified during stress-testing of the epic structure. They do NOT require epic restructuring — they are **constraints for Step 3 (story creation)** to prevent known failure modes.

**F1: Epic 1 Timeline Risk — Auth Deferral Triggers (HIGH)**
Epic 1 has the heaviest infrastructure (monorepo scaffold, 11-table DB, Docker 4-service compose, full auth, invite flow, RBAC, RLS). The PRD flags this as the #1 risk: "If Auth slips past week 2, defer invite link (FR3) and admin role separation." Stories must encode explicit deferral cut-points — if FR3 isn't done by day 10, defer it and start Epic 2.

**F2: Epic 2 Story Sequencing — Ingestion Before Visualization (MEDIUM)**
Epic 2's 12 FRs span two distinct capabilities. Stories must be sequenced as two groups: (a) Data Ingestion (FR6-FR12, FR16) completes first, (b) Visualization (FR13-FR15, FR17) completes second. Epic 3 only needs data in the database — it can start after the ingestion group, before chart polish is done. This reduces the critical path.

**F3: Cross-Cutting Infrastructure — Start in Epic 1, Not Epic 7 (HIGH)**
CI (FR37), analytics infrastructure (FR40), and README scaffold (FR38) must not wait until Epic 7. Stories needed:
- Epic 1: CI pipeline skeleton (lint + typecheck running from day 1)
- Epic 1: README structural scaffold (section headers, placeholders)
- Epic 1: Analytics service + event schema foundation
- Each subsequent epic: "instrument analytics events" as story acceptance criteria
- Epic 7: CI completion (seed-validation, E2E, Docker smoke), README prose, analytics verification

**F4: Free Preview Upgrade Dead-End (MEDIUM)**
FR21 (Epic 3) shows an UpgradeCta that has no destination until Epic 5 (Stripe). The FR21 story must define graceful pre-payment behavior: disabled button with "Pro plan coming soon" tooltip, or log `subscription.upgraded` intent event without navigation. The hiring manager must never see a broken upgrade flow.

**F5: Seed Data Quality Is the First Impression (HIGH)**
Epic 2 needs a dedicated seed data quality story — not just "load some data" but "create seed dataset with deliberate anomalies that produce 2+ actionable AI insights." Acceptance criteria must match the PRD's Technical Success metric. This is what Sarah the hiring manager sees on `docker compose up`.

### FR Coverage Map

FR1:  Epic 1 — Google OAuth sign up/sign in
FR2:  Epic 1 — Auto-create org on signup
FR3:  Epic 1 — Invite link for org membership
FR4:  Epic 6 — Platform admin view/manage orgs
FR5:  Epic 1 — Role-based capability restriction
FR6:  Epic 2 — CSV upload via drag-and-drop
FR7:  Epic 2 — CSV validation with specific errors
FR8:  Epic 2 — Upload preview before confirm
FR9:  Epic 2 — Sample CSV template download
FR10: Epic 2 — Org-scoped data storage
FR11: Epic 2 — First upload replaces seed data
FR12: Epic 2 — Re-upload preserves session state
FR13: Epic 2 — Interactive bar/line charts
FR14: Epic 2 — Date range + category filters
FR15: Epic 2 — Loading states (skeletons)
FR16: Epic 2 — Seed data pre-loaded
FR17: Epic 2 — Demo data visual indicator (banner)
FR18: Epic 3 — Plain-English AI summary
FR19: Epic 3 — SSE streaming delivery
FR20: Epic 3 — Transparency/methodology panel
FR21: Epic 3 — Free preview with upgrade CTA
FR22: Epic 3 — Non-obvious, actionable insights
FR23: Epic 3 — Local stats + curated LLM context
FR24: Epic 3 — Mobile-first AI summary above fold
FR25: Epic 4 — Share insight as rendered image
FR26: Epic 4 — Shareable read-only link
FR27: Epic 4 — Focused insight card view + CTA
FR28: Epic 5 — Free to Pro upgrade
FR29: Epic 5 — Subscription lifecycle management
FR30: Epic 5 — Payment failure revokes Pro
FR31: Epic 5 — Status verified before Pro access
FR32: Epic 6 — Admin system health view
FR33: Epic 6 — Admin analytics events view
FR34: Epic 6 — Admin-only DOM exclusion
FR35: Epic 1 — Health check endpoint
FR36: Epic 1 — Single Docker command launch
FR37: Epic 7 — CI automated checks (5-stage)
FR38: Epic 7 — README case study format
FR39: Epic 7 — Seed data AI quality in CI
FR40: Epic 7 — Analytics event tracking
FR41: Epic 7 — Dark mode appearance

## Epic List

### Epic 1: Project Foundation & User Authentication
Users can launch the application with `docker compose up`, sign up with Google OAuth, have an organization auto-created, invite team members via shareable link, and experience role-based access control. A health check endpoint enables system monitoring. This epic scaffolds the entire monorepo (pnpm workspace, Docker Compose, Turborepo), establishes the database schema, and implements the complete authentication/authorization/org-membership system that every subsequent epic depends on.

**FRs covered:** FR1, FR2, FR3, FR5, FR35, FR36
**Tier:** All Core
**Dependencies:** None (standalone)

### Epic 2: Data Pipeline & Visualization
Users can upload CSV data via drag-and-drop, preview before confirming, and explore their business data through interactive bar and line charts with date range and category filters. First-time visitors see a populated dashboard with seed data and a demo mode banner. The system handles CSV validation with specific, helpful error messages and preserves upload state for re-attempts.

**FRs covered:** FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17
**Tier:** All Core
**Dependencies:** Epic 1

### Epic 3: AI-Powered Business Insights
Users receive a streaming AI summary interpreting their business data in plain English. The system computes statistical analysis locally via a 3-layer curation pipeline and sends curated context (never raw data) to the LLM. Users can view how the AI reached its conclusions via a transparency panel. Free-tier users see a preview with upgrade prompt. On mobile, the AI summary is positioned above the fold.

**FRs covered:** FR18, FR19, FR20, FR21, FR22, FR23, FR24
**Tier:** All Core
**Dependencies:** Epic 2

### Epic 4: Sharing & Export
Users can share AI insights as rendered PNG images or shareable read-only links. Recipients of shared links see a focused insight card view with a signup CTA — enabling the viral acquisition loop from David to Marcus.

**FRs covered:** FR25, FR26, FR27
**Tier:** All Complete
**Dependencies:** Epic 1, Epic 3

### Epic 5: Subscription & Payments
Organizations can upgrade from Free to Pro tier via Stripe Checkout (test mode, production-identical code). The system manages the full subscription lifecycle including creation, renewal, cancellation, and payment failure handling with automatic Pro access revocation.

**FRs covered:** FR28, FR29, FR30, FR31
**Tier:** All Complete
**Dependencies:** Epic 1, Epic 3

### Epic 6: Platform Administration
Platform admins can monitor system health (database, AI service, uptime), view analytics events across all organizations, and manage users/orgs through a dedicated admin dashboard. Admin-only interface elements are completely absent from the DOM for non-admin users.

**FRs covered:** FR4, FR32, FR33, FR34
**Tier:** All Complete
**Dependencies:** Epic 1

### Epic 7: DevOps, Quality & Portfolio Readiness
The project achieves production readiness with a 5-stage CI pipeline (lint/typecheck, test, seed-validation, E2E, Docker smoke), a case-study README with hero screenshot and architecture diagram, validated seed data AI quality, comprehensive analytics event tracking across all features, and light/dark appearance mode switching.

**FRs covered:** FR37, FR38, FR39, FR40, FR41
**Tier:** Mixed (FR37-40 Core, FR41 Complete)
**Dependencies:** Epic 2, Epic 3

---

## Epic 1: Project Foundation & User Authentication

Users can launch the application with `docker compose up`, sign up with Google OAuth, have an organization auto-created, invite team members via shareable link, and experience role-based access control. A health check endpoint enables system monitoring. This epic scaffolds the entire monorepo (pnpm workspace, Docker Compose, Turborepo), establishes the database schema, and implements the complete authentication/authorization/org-membership system that every subsequent epic depends on.

### Story 1.1: Monorepo Scaffold & Docker Development Environment

As a **developer evaluating this project**,
I want to run `docker compose up` and have the full application stack start with a health check endpoint,
So that I can verify the system is operational with a single command.

**Acceptance Criteria:**

**Given** a clean checkout of the repository
**When** I run `docker compose up`
**Then** four services start successfully: web (Next.js 16), api (Express 5), db (PostgreSQL 18), redis (Redis 7)
**And** `GET /health` on the API returns 200 with `{ status: "ok" }` (FR35)

**Given** the monorepo is scaffolded
**When** I inspect the project structure
**Then** I find `apps/web`, `apps/api`, `packages/shared` as pnpm workspace packages with Turborepo orchestration
**And** `tsconfig.base.json` at root with TypeScript 5.x strict mode, ESM modules
**And** `docker-compose.override.yml` exists for dev overrides: volume mounts for `apps/web` and `apps/api` (hot reload), exposed debug port for API (9229)

**Given** the API server starts
**When** any module reads configuration
**Then** it uses Zod-validated `config.ts` (never `process.env` directly), and the server fails fast at startup if required env vars are missing
**And** Pino structured JSON logging is configured with request correlation IDs

**Given** environment secrets exist
**When** I inspect `.gitignore`
**Then** `.env` files and credential files are excluded from version control (NFR13)

> **Sub-tasks (for dev agent planning):** (1) pnpm workspace + Turborepo config, (2) Docker Compose 4-service setup, (3) Next.js 16 app scaffold, (4) Express 5 API scaffold, (5) packages/shared scaffold, (6) Zod config + Pino logging, (7) health endpoint + env security

### Story 1.2: Database Schema & Core Identity Tables

As a **developer**,
I want database migrations to run automatically on startup with core identity tables created,
So that the application has a solid, org-scoped data foundation.

**Acceptance Criteria:**

**Given** Docker Compose services are running
**When** the API container starts for the first time
**Then** Drizzle ORM 0.45.x runs versioned SQL migrations automatically via the Docker entrypoint
**And** the following tables are created: `users`, `orgs`, `user_orgs` (with role enum: owner/member), `refresh_tokens`
**And** `users` table includes `is_platform_admin` boolean (default false)

**Given** the database schema is created
**When** a developer imports database access in a service
**Then** they import from `db/queries/` barrel exports, never from `db/index.ts` directly
**And** every query function requires an `orgId` parameter — calls without `orgId` fail closed (NFR9)

**Given** the `user_orgs` table exists
**When** I inspect the schema
**Then** it supports many-to-many user-to-org relationships with a `role` column (owner/member)
**And** the schema is designed for single-org-per-user MVP with documented multi-org readiness

**Given** tenant tables exist with `org_id` columns
**When** database security is configured
**Then** Row-Level Security (RLS) policies are created on all tenant tables as defense-in-depth behind application-level `org_id` filtering (via raw SQL in Drizzle migration files — Drizzle ORM does not support RLS declaratively)
**And** each subsequent story that creates new tables must include RLS policies for those tables

### Story 1.3: Google OAuth Authentication & Org Auto-Creation

As a **new user**,
I want to sign up with my Google account and have an organization automatically created for me,
So that I can start using the application immediately without manual setup.

**Acceptance Criteria:**

**Given** I am on the login page
**When** I click "Sign in with Google"
**Then** I am redirected to Google's OAuth consent screen and back to the app on approval (FR1)

**Given** I am a first-time user completing Google OAuth
**When** the callback is processed
**Then** a `users` record is created with my Google profile info
**And** an `orgs` record is auto-created with a default name derived from my profile (FR2)
**And** a `user_orgs` record is created with `role: owner`

**Given** authentication succeeds
**When** the server issues tokens
**Then** a JWT access token (15-minute expiry) is generated via jose 6.x with claims: `userId`, `org_id`, `role`, `isAdmin` (NFR8)
**And** a refresh token (7-day expiry) is stored as `token_hash` in `refresh_tokens` and sent as an httpOnly, Secure, SameSite=Lax cookie (NFR8)

**Given** my access token has expired
**When** the frontend makes an API request
**Then** the system transparently refreshes via the httpOnly cookie (silent refresh) without interrupting my session
**And** the old refresh token is invalidated (rotation)
**And** a test can verify silent refresh by issuing a request with an expired access token and confirming a new token pair is returned

**Given** I am a returning user
**When** I sign in with Google
**Then** my existing account is matched and I receive new tokens without creating a duplicate org

### Story 1.4: Role-Based Access Control & Route Protection

As an **application owner**,
I want the system to enforce role-based permissions on every API request,
So that unauthorized users cannot access restricted functionality.

**Acceptance Criteria:**

**Given** the RBAC system is implemented
**When** I inspect the authorization model
**Then** it enforces two-dimensional access: `user_orgs.role` (owner/member) + `users.is_platform_admin` boolean (FR5)

**Given** an API request arrives
**When** the authorization middleware processes it
**Then** the JWT claims (userId, org_id, role, isAdmin) are verified on every request independent of frontend state (NFR11)
**And** a structured `AppError` is thrown for failures: `AuthenticationError` (401), `AuthorizationError` (403)

**Given** the BFF proxy pattern is implemented
**When** browser requests hit Next.js `/api/*` routes
**Then** they are forwarded to Express `:3001` with cookie forwarding
**And** action routes (`/upload`, `/billing`, `/admin`) are protected by `proxy.ts`
**And** two typed API clients exist: `api-client.ts` (Client Components), `api-server.ts` (Server Components) — no raw `fetch()`

**Given** an API error occurs
**When** the error handler processes it
**Then** responses follow the standard wrapper: `{ data: T, meta?: {} }` for success, `{ error: { code, message, details? } }` for errors
**And** the `AppError` hierarchy includes: `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ExternalServiceError`

**Given** rate limiting is configured
**When** requests exceed thresholds
**Then** Redis-backed rate limiting enforces 3 tiers: auth (10/min/IP), AI (5/min/user), public (60/min/IP) (NFR14)
**And** rate limiting fails open if Redis is unavailable

> **Sub-tasks (for dev agent planning):** (1) RBAC middleware + JWT claim verification, (2) AppError hierarchy (5 error types), (3) BFF proxy.ts + cookie forwarding, (4) api-client.ts + api-server.ts typed clients, (5) Redis rate limiting (3-tier)

### Story 1.5: Org Invite Link System

> **DEFERRAL CUT-POINT (F1):** If this story is not complete by day 10 of the sprint, defer to a later epic and proceed to Epic 2. This is explicitly per the PRD risk mitigation strategy.

As an **org member**,
I want to generate a shareable invite link so that new users can join my organization,
So that I can collaborate with my team without manual admin intervention.

**Acceptance Criteria:**

**Given** I am an authenticated org member
**When** I request an invite link
**Then** the system creates an `org_invites` record with a unique token and configurable expiry
**And** returns a shareable URL containing the invite token (FR3)

**Given** I have received an invite link
**When** I visit the link and authenticate with Google
**Then** my user account is linked to the inviting organization via `user_orgs` with `role: member`
**And** no new org is auto-created (overrides the default FR2 behavior for invited users)

**Given** an invite link has expired
**When** a user tries to use it
**Then** the system shows a clear error message explaining the link has expired with guidance to request a new one

**Given** I am already a member of the organization
**When** I try to use an invite link for the same org
**Then** the system recognizes my existing membership and redirects me to the dashboard without creating a duplicate

**Given** the `org_invites` table is created
**When** database security is configured
**Then** RLS policies are applied to `org_invites` scoped by `org_id`

### Story 1.6: Cross-Cutting Infrastructure Foundation

> Per guidance note **F3**: CI, analytics, and README must not wait until Epic 7.

As a **developer**,
I want CI running lint and type checks from day 1 with a README scaffold and analytics event tracking foundation,
So that code quality, documentation, and usage tracking are established from the start.

**Acceptance Criteria:**

**Given** code is pushed to the repository
**When** GitHub Actions runs
**Then** the CI pipeline executes at minimum: lint + typecheck stages (FR37 partial — remaining stages added in later epics)
**And** the pipeline fails fast on lint or type errors

**Given** the repository exists
**When** I open `README.md`
**Then** it contains the case-study format scaffold: section headers (Overview, Problem, Solution, Architecture, Tech Stack, Screenshots, Getting Started, Demo) with placeholder content (FR38 partial — prose filled in Epic 7)

**Given** the analytics foundation is built
**When** I inspect the analytics service
**Then** an `analytics_events` table migration exists with the event schema (event_name, org_id, user_id, metadata jsonb, timestamp)
**And** a `trackEvent()` service function exists using dot-notation, past-tense naming convention (e.g., `dataset.uploaded`)
**And** each subsequent epic will instrument its own analytics events as story acceptance criteria (FR40 partial)

**Given** the `analytics_events` table is created
**When** database security is configured
**Then** RLS policies are applied to `analytics_events` scoped by `org_id` (admin queries bypass RLS via dedicated admin query path)

---

## Epic 2: Data Pipeline & Visualization

Users can upload CSV data via drag-and-drop, preview before confirming, and explore their business data through interactive bar and line charts with date range and category filters. First-time visitors see a populated dashboard with seed data and a demo mode banner. The system handles CSV validation with specific, helpful error messages and preserves upload state for re-attempts.

### Story 2.1: Seed Data & Demo Mode Foundation

As a **first-time visitor**,
I want to see a populated dashboard with sample business data immediately,
So that I can understand the product's value before uploading my own data.

**Acceptance Criteria:**

**Given** the application starts with a fresh database
**When** the seed script runs (via Docker entrypoint)
**Then** a seed `datasets` record is created with `is_seed_data: true`
**And** seed `data_rows` are inserted with realistic small-business financial data including deliberate anomalies (seasonal spike, category drop, unusual ratio) that will produce 2+ actionable AI insights (F5)

**Given** seed data exists
**When** the demo mode state machine evaluates
**Then** the state is `seed_only` (detected via `SELECT EXISTS(... WHERE is_seed_data = false)`)
**And** the 4-state machine is implemented: `seed_only`, `seed_plus_user`, `user_only`, `empty`

**Given** the database schema needs data tables
**When** migrations run
**Then** `datasets` table is created (with `org_id`, `is_seed_data` boolean, metadata)
**And** `data_rows` table is created (with `category`, `parent_category`, `metadata` jsonb, `source_type` enum)
**And** normalized schema supports hierarchical categories

**Given** the dashboard is never empty (NFR19)
**When** any user visits the dashboard
**Then** seed data is always available as a fallback

**Given** the `datasets` and `data_rows` tables are created
**When** database security is configured
**Then** RLS policies are applied to both tables scoped by `org_id`

### Story 2.2: CSV Upload & Validation

As a **business owner**,
I want to upload my CSV data via drag-and-drop or file picker with clear validation feedback,
So that I can get my data into the system without confusion about formatting.

**Acceptance Criteria:**

**Given** I am on the upload page
**When** I drag a CSV file onto the drop zone or click to select a file
**Then** the `UploadDropzone` component accepts the file (FR6)
**And** the upload page follows the layout: AppHeader (sticky) → "Upload Data" title → UploadDropzone (centered, max-width 640px)

**Given** I upload a CSV file
**When** the system validates it
**Then** it checks against expected column format and displays specific error details on failure (FR7)
**And** error messages use product-blame language ("We expected columns named...") with a template download link, never user-blame (NFR21)

**Given** the file fails validation
**When** I view the error state
**Then** my file reference is retained so I can correct and re-upload without losing my session (FR12)
**And** the UploadDropzone shows the 6 states: default, drag hover, processing, preview, success, error

**Given** I am on a mobile device
**When** I visit the upload page
**Then** I see a file picker fallback instead of drag-and-drop (touch device adaptation)
**And** the layout is single column, full-width dropzone

**Given** CSV processing begins
**When** the file is under 10MB
**Then** processing completes within 5 seconds (NFR4)

**Given** the upload completes
**When** the system fires the analytics event
**Then** `dataset.uploaded` is tracked via `trackEvent()` (FR40)

**Given** a keyboard user navigates the upload page
**When** they interact with the UploadDropzone
**Then** all interactive elements (file picker trigger, action buttons) are keyboard-navigable (NFR25)

### Story 2.3: CSV Preview & Confirmation

As a **business owner**,
I want to preview my uploaded data before confirming the import,
So that I can verify the data looks correct and catch mistakes early.

**Acceptance Criteria:**

**Given** a CSV file passes validation
**When** the preview renders
**Then** I see a `CsvPreview` component with: 5-row mini-table, column type badges, total row count, and any warnings (FR8)
**And** the preview appears below the dropzone at the same max-width (640px)

**Given** I am viewing the preview
**When** I click "Confirm"
**Then** the data is stored scoped to my organization and visible to all org members (FR10)
**And** the dropzone transitions to the success state with a redirect countdown to the dashboard

**Given** I am viewing the preview
**When** I click "Cancel"
**Then** the upload is discarded and the dropzone returns to the default state with my file reference preserved

### Story 2.4: Sample CSV Template Download

As a **business owner**,
I want to download a sample CSV template showing the expected format,
So that I can structure my data correctly before uploading.

**Acceptance Criteria:**

**Given** I am on the upload page or see a validation error
**When** I click the template download link
**Then** `sample-data.csv` is downloaded from `apps/web/public/templates/sample-data.csv` (FR9)
**And** the template contains representative column headers and 3-5 example rows matching the expected schema

### Story 2.5: Demo-to-Real Data Transition

As a **business owner**,
I want my first real upload to seamlessly replace the demo data,
So that I see my own data without manual cleanup steps.

**Acceptance Criteria:**

**Given** I am in `seed_only` demo mode
**When** I complete my first real CSV upload
**Then** the seed dataset is replaced by my data within the org (FR11)
**And** the demo mode state transitions to `user_only`
**And** no "delete demo data" confirmation dialog is shown

**Given** my upload completes and the dashboard reloads with real data
**When** Recharts renders the new dataset
**Then** charts use Recharts' built-in entry animation (cross-fade effect) — no hard swap or flash of empty state

### Story 2.6: Interactive Dashboard Charts

> **Prerequisite:** Stories 2.1–2.5 (data ingestion group) must be complete before this story (per guidance note F2).

As a **business owner**,
I want to view my data as interactive bar and line charts that refresh when I upload new data,
So that I can visually understand my business trends.

**Acceptance Criteria:**

**Given** data exists in my organization (seed or uploaded)
**When** I visit the dashboard
**Then** I see interactive bar and line charts rendered with Recharts displaying my business data (FR13)
**And** charts cross-fade on data change (Recharts built-in animation), with skeletons for initial load only
**And** chart skeletons are shape-matched: rectangle at 16:9 aspect ratio inside Card

**Given** the dashboard loads
**When** the initial page load completes
**Then** it finishes within 3 seconds on 25 Mbps broadband (NFR1)
**And** the `dashboard.viewed` analytics event fires

**Given** I am on a mobile viewport (< 768px)
**When** the dashboard renders
**Then** charts are lazy-loaded below the fold via Intersection Observer
**And** the layout uses base classes only (no `sm:` breakpoints — intentional skip per UX spec)

**Given** I am on a desktop viewport (≥ 1024px)
**When** the dashboard renders
**Then** a 12-column grid layout is used with a fixed 240px sidebar

**Given** a keyboard user navigates the dashboard
**When** they interact with charts
**Then** chart interactive elements are keyboard-accessible (NFR25)

### Story 2.7: Date Range & Category Filters

As a **business owner**,
I want to filter my charts by date range and category,
So that I can focus on specific time periods and business segments.

**Acceptance Criteria:**

**Given** I am viewing the dashboard
**When** I select a date range or category filter
**Then** charts update to reflect the filtered data within 500ms (NFR5) (FR14)
**And** the `chart.filtered` analytics event fires

**Given** the FilterBar component is rendered
**When** I scroll the page
**Then** the FilterBar sticks below the AppHeader (sticky positioning)

**Given** filters are applied
**When** I share or reference the dashboard
**Then** the shared `DateRange` type from `packages/shared/src/schemas/filters.ts` is used consistently by FilterBar, DashboardCharts, and backend query params

**Given** a keyboard user navigates the FilterBar
**When** they interact with date range and category controls
**Then** all filter controls are keyboard-navigable with visible focus indicators (NFR25)

### Story 2.8: Loading States & Demo Mode Banner

As a **user**,
I want to see clear loading indicators while data loads and know when I'm viewing demo data,
So that I understand the system state and am never confused about what I'm seeing.

**Acceptance Criteria:**

**Given** the dashboard is loading data
**When** charts and content are being prepared
**Then** skeleton loading states are displayed (FR15)
**And** AI summary skeleton: 4 text lines with descending widths (100%, 90%, 95%, 60%)
**And** `prefers-reduced-motion`: skeletons use solid `--color-muted` without pulse animation

**Given** I am viewing seed/demo data
**When** the dashboard renders
**Then** a demo mode banner is displayed as an informational indicator (not a nag) (FR17)
**And** the banner auto-dissolves on first real upload

**Given** the page loads
**When** accessibility is evaluated
**Then** semantic HTML elements are used (nav, main, article, section, button) (NFR24)
**And** a skip-to-content link exists as the first focusable element targeting `<main id="main-content">`

---

## Epic 3: AI-Powered Business Insights

Users receive a streaming AI summary interpreting their business data in plain English. The system computes statistical analysis locally via a 3-layer curation pipeline and sends curated context (never raw data) to the LLM. Users can view how the AI reached its conclusions via a transparency panel. Free-tier users see a preview with upgrade prompt. On mobile, the AI summary is positioned above the fold.

### Story 3.1: Curation Pipeline — Statistical Computation & Scoring

As the **system**,
I want to compute statistical analysis locally and score findings by significance,
So that only the most relevant curated context is sent to the AI service, never raw data.

**Acceptance Criteria:**

**Given** an organization has data (seed or uploaded)
**When** the curation pipeline runs
**Then** Layer 1 (computation) calculates statistics using simple-statistics 7.8.x: totals, averages, trends, anomalies, category breakdowns
**And** Layer 2 (scoring) ranks computed stats by configurable weights stored as JSON config (tunable without code changes)
**And** the top-scored findings are passed to Layer 3 (FR23)

**Given** the scoring weights config exists
**When** a developer adjusts weights
**Then** scoring behavior changes without code modifications — only JSON config changes

**Given** the computation layer receives data
**When** it produces `ComputedStat[]` output
**Then** the output contains statistical summaries only — no `DataRow[]` objects (privacy-by-architecture: assembly.ts accepts `ComputedStat[]`, not `DataRow[]`)

### Story 3.2: Curation Pipeline — Prompt Assembly & LLM Integration

As the **system**,
I want to assemble curated context into versioned prompt templates and send them to the Claude API,
So that the AI produces consistent, high-quality business interpretations.

**Acceptance Criteria:**

**Given** scored `ComputedStat[]` from Layer 2
**When** Layer 3 (assembly) runs
**Then** it populates a versioned prompt template from `curation/config/prompt-templates/`
**And** prompt templates are versioned independently from business logic

**Given** the assembled prompt is ready
**When** the system calls the Claude API
**Then** the request includes retry logic with exponential backoff for transient failures (NFR23)
**And** each call has timeout handling and structured error responses (NFR20)

**Given** the AI produces a response
**When** the analysis is evaluated
**Then** it contains at least one non-obvious, actionable insight per analysis (FR22) — validated via seed data snapshot in CI (Story 7.2); for arbitrary user data, this is a best-effort prompt engineering goal, not a hard assertion

**Given** the AI summary is generated
**When** it is stored
**Then** an `ai_summaries` table record is created with cache-first strategy (stale on data upload only, no time-based TTL)
**And** seed summaries are pre-generated during the seed script

**Given** the `ai_summaries` table is created
**When** database security is configured
**Then** RLS policies are applied to `ai_summaries` scoped by `org_id`

### Story 3.3: SSE Streaming Delivery & AI Summary Card

As a **business owner**,
I want to see the AI summary appearing in real time as it streams,
So that I get immediate feedback and don't stare at a blank screen.

**Acceptance Criteria:**

**Given** I request an AI summary on the dashboard
**When** the summary is not cached (or cache is stale)
**Then** the AI summary streams via Server-Sent Events (SSE) with first token visible within 2 seconds (NFR2) (FR19)
**And** total generation completes within 15 seconds (NFR3)

**Given** the AI summary is streaming
**When** I view the `AiSummaryCard`
**Then** a blinking cursor (▋) indicates active streaming
**And** text appears progressively with maximum 65ch line width, 17px/1.8 line-height on desktop, 16px/1.6 on mobile (FR18)
**And** `aria-live="polite"` is set for screen reader accessibility during streaming

**Given** streaming completes
**When** the full summary is visible
**Then** post-completion actions (Share + Transparency buttons) fade in after streaming ends
**And** the `ai_summary.viewed` analytics event fires

**Given** the AI summary card renders
**When** the design is applied
**Then** it uses the Trust Blue design direction with Warm Advisory left-border accent
**And** shadcn/ui + Tailwind CSS v4 + Radix UI accessibility primitives

**Given** a cached summary exists and is not stale
**When** I visit the dashboard
**Then** the cached summary loads instantly without streaming

**Given** `prefers-reduced-motion: reduce` is active
**When** the streaming cursor (▋) renders
**Then** the cursor is visible but static (no blink animation)

> **Sub-tasks (for dev agent planning):** (1) SSE endpoint on Express API, (2) AiSummaryCard React component with 6 states, (3) streaming cursor + progressive text rendering, (4) post-completion action reveal animation, (5) cache-hit instant load path, (6) Trust Blue styling + Tailwind/shadcn integration

### Story 3.4: AI Summary Timeout & Error Handling

As a **user**,
I want graceful handling when the AI service is slow or unavailable,
So that I never see a broken interface or lose access to my dashboard.

**Acceptance Criteria:**

**Given** AI generation exceeds 15 seconds
**When** the timeout boundary is reached
**Then** the system terminates the request and displays partial results if available, or a graceful timeout message (NFR18)
**And** a horizontal rule appears followed by "We focused on the most important findings" message

**Given** the AI service is unavailable
**When** I visit the dashboard
**Then** a graceful degradation message is displayed, not a broken UI (NFR17)
**And** charts and data remain fully accessible — the AI section shows the error state, not the whole page

**Given** a transient AI failure occurs
**When** the retry logic activates
**Then** it uses exponential backoff per NFR23
**And** the user sees the AI summary card in its error state with a "Try again" option

**Given** the `AiSummaryCard` has 6 states
**When** I inspect the component
**Then** all states are implemented: skeleton, streaming, complete, timeout, error, free preview

### Story 3.5: Free Preview with Upgrade CTA

> Per guidance note **F4**: UpgradeCta has no destination until Epic 5. Define graceful pre-payment behavior.

As a **free-tier user**,
I want to see a preview of the AI summary with a prompt to upgrade,
So that I understand the AI's value and am motivated to unlock the full analysis.

**Acceptance Criteria:**

**Given** I am a free-tier user
**When** I view the AI summary
**Then** the backend streams approximately 150 words then sends an `upgrade_required` SSE event (FR21)
**And** the frontend renders all received words clearly, then a gradient overlay fades into blurred placeholder text
**And** an `UpgradeCta` component appears below the blur

**Given** the UpgradeCta renders
**When** Epic 5 (Stripe) is not yet implemented
**Then** the button is disabled with a "Pro plan coming soon" tooltip (F4 graceful pre-payment behavior)
**And** clicking logs a `subscription.upgraded` intent event for analytics without navigation

**Given** Epic 5 is implemented (future integration)
**When** the UpgradeCta is clicked
**Then** it navigates to the billing/upgrade flow

**Given** the free preview is viewed
**When** the analytics event fires
**Then** `ai_preview.viewed` is tracked via `trackEvent()` (FR40)

**Given** approximately 150 words are displayed (~6-8 lines at 65ch width)
**When** the preview renders
**Then** it demonstrates enough AI value to justify the paywall

### Story 3.6: Transparency Panel & Mobile-First Layout

As a **business owner**,
I want to view how the AI reached its conclusions and see the AI summary prominently on mobile,
So that I trust the analysis and can access it easily on any device.

**Acceptance Criteria:**

**Given** the AI summary is complete
**When** I click the Transparency button
**Then** a `TransparencyPanel` opens showing the methodology: which statistics were computed, scoring weights used, and prompt template version (FR20)
**And** on desktop: the panel uses CSS Grid column expanding from `0fr` to `320px` — no layout reflow, AI summary retains 65ch reading width
**And** the `transparency_panel.opened` analytics event fires

**Given** I am on a mobile viewport (< 768px)
**When** the dashboard renders
**Then** the AI summary is positioned above the fold, before charts and filters (FR24)
**And** conditional React rendering is used for mobile/desktop AI components (not CSS `display:none`)
**And** `useIsMobile` hook uses `matchMedia` + `isMounted` guard for hydration-safe component swap
**And** touch targets are minimum 44x44px

**Given** I am on a desktop viewport
**When** the dashboard renders
**Then** the AI card spans 8 columns in the 12-column grid layout

**Given** a keyboard user interacts with the AI summary area
**When** they navigate to the Transparency button
**Then** the button is keyboard-focusable and the panel is operable via keyboard (NFR25)

---

## Epic 4: Sharing & Export

Users can share AI insights as rendered PNG images or shareable read-only links. Recipients of shared links see a focused insight card view with a signup CTA — enabling the viral acquisition loop from David to Marcus.

### Story 4.1: Share Insight as Rendered Image

As a **business owner**,
I want to share an AI insight (chart + summary) as a PNG image,
So that I can send it to colleagues via messaging apps without requiring them to log in.

**Acceptance Criteria:**

**Given** the AI summary is in the complete state
**When** I click the Share button (visible after streaming completes)
**Then** a rendered PNG image is generated combining the chart and AI summary text using `html-to-image` (client-side DOM-to-PNG) (FR25)
**And** the PNG rendering integration has timeout handling and structured error responses (NFR20)

**Given** the image is generated
**When** I view the share options
**Then** I can download the PNG or copy it to clipboard

**Given** I am on a mobile viewport
**When** I want to share
**Then** a floating action button (FAB) at bottom-right (48px touch target) replaces the inline share icon

**Given** the share action completes
**When** the analytics event fires
**Then** `insight.shared` is tracked via `trackEvent()` (FR40)

**Given** a keyboard user wants to share
**When** they navigate to the share controls
**Then** all share actions (download PNG, copy link) are keyboard-accessible (NFR25)

### Story 4.2: Shareable Read-Only Link

As a **business owner**,
I want to generate a shareable read-only link to a specific insight,
So that my team can view the analysis without needing an account.

**Acceptance Criteria:**

**Given** I am viewing a complete AI summary
**When** I click "Copy Link" in the share options
**Then** a `shares` table record is created with a unique token linked to the insight (FR26)
**And** a shareable URL is copied to my clipboard
**And** the `share_link.created` analytics event fires

**Given** the shareable link is generated
**When** the URL is pasted into iMessage, WhatsApp, or Slack
**Then** Open Graph meta tags render a rich preview card with insight title and org name

**Given** the share shows org context
**When** I inspect the shared metadata
**Then** it displays org name + date, but never who shared it (privacy per UX spec)

**Given** the `shares` table is created
**When** database security is configured
**Then** RLS policies are applied to `shares` scoped by `org_id`

### Story 4.3: Shared Insight Card View

As a **recipient of a shared link**,
I want to see a focused insight card without navigation clutter,
So that I can understand the analysis and be motivated to create my own account.

**Acceptance Criteria:**

**Given** I open a shared link (no authentication required)
**When** the page loads
**Then** I see a focused view: no nav, no sidebar, minimal chrome — just the chart + AI summary (FR27)
**And** the page loads within 2 seconds (NFR6)

**Given** I am viewing the shared insight
**When** I look below the insight card
**Then** a single CTA button reads "See more insights — create your free account" (FR27)
**And** clicking navigates to the signup flow

**Given** the shared link is visited
**When** the page renders
**Then** it is a lightweight page with no auth requirement — public access

---

## Epic 5: Subscription & Payments

Organizations can upgrade from Free to Pro tier via Stripe Checkout (test mode, production-identical code). The system manages the full subscription lifecycle including creation, renewal, cancellation, and payment failure handling with automatic Pro access revocation.

### Story 5.1: Stripe Checkout & Free-to-Pro Upgrade

As an **org owner**,
I want to upgrade my organization from Free to Pro tier via Stripe Checkout,
So that I can unlock full AI analysis for my business data.

**Acceptance Criteria:**

**Given** I am an authenticated org owner on the free tier
**When** I click the upgrade CTA (from AiSummaryCard or billing page)
**Then** I am redirected to a Stripe Checkout session in test mode with production-identical code (FR28)
**And** the `/billing` action route is protected by `proxy.ts`

**Given** Stripe Checkout completes successfully
**When** the success callback fires
**Then** a `subscriptions` table record is created linking the Stripe subscription to my org
**And** my org's tier is updated to Pro
**And** the `subscription.upgraded` analytics event fires

**Given** I return to the dashboard after upgrading
**When** the AI summary loads
**Then** the full AI summary streams without the ~150 word truncation or blur overlay
**And** the UpgradeCta from Story 3.5 is enabled and navigates to the billing flow (replacing the disabled "Pro plan coming soon" state)

**Given** the Stripe integration is called
**When** the request is made
**Then** timeout handling and structured error responses are in place (NFR20)

**Given** the `subscriptions` table is created
**When** database security is configured
**Then** RLS policies are applied to `subscriptions` scoped by `org_id`

### Story 5.2: Subscription Lifecycle Management

As the **system**,
I want to manage subscription renewal and cancellation via Stripe webhooks,
So that subscription state stays synchronized with payment status.

**Acceptance Criteria:**

**Given** a Pro subscriber's subscription renews
**When** Stripe sends a renewal webhook
**Then** the `subscriptions` record is updated with the new period dates (FR29)

**Given** a Pro subscriber cancels their subscription
**When** Stripe sends a cancellation webhook
**Then** the subscription is marked as canceled with an end date (FR29)
**And** Pro access continues until the end of the paid period
**And** the `subscription.cancelled` analytics event fires

**Given** any Stripe webhook arrives
**When** the handler processes it
**Then** the webhook signature is verified before processing (NFR12)
**And** handlers are idempotent — duplicate webhook delivery does not corrupt subscription state (NFR22)

### Story 5.3: Subscription Status Verification

As the **system**,
I want to verify subscription status before granting access to Pro-only features,
So that only paying organizations receive premium capabilities.

**Acceptance Criteria:**

**Given** a user requests a Pro-only feature (full AI summary)
**When** the API processes the request
**Then** the subscription status is verified against the `subscriptions` table before granting access (FR31)
**And** the subscription gate annotates (does not block) — free tier gets truncated response + `upgrade_required` SSE event

**Given** a subscription record exists
**When** the status is checked
**Then** the system considers: active, canceled-but-within-period, expired, and failed states
**And** only active or within-period subscriptions grant Pro access

### Story 5.4: Payment Failure & Pro Access Revocation

> **Depends on:** Story 5.3 (subscription status verification logic must exist for "revert to free" behavior to work).

As the **system**,
I want to revoke Pro access when payment fails,
So that the subscription model is enforced fairly.

**Acceptance Criteria:**

**Given** a Pro subscriber's payment fails
**When** Stripe sends a payment failure webhook
**Then** the `subscriptions` record is updated to reflect the failed state (FR30)
**And** Pro access is revoked — the org reverts to free tier (verified via Story 5.3's status check)

**Given** a subscription lapses mid-session
**When** the webhook fires
**Then** the current session continues uninterrupted until the next page load
**And** on next dashboard visit, a toast notification appears: "Your Pro subscription has ended. You're now on the free plan."
**And** the AI summary reverts to free preview (~150 words + blur)

---

## Epic 6: Platform Administration

Platform admins can monitor system health (database, AI service, uptime), view analytics events across all organizations, and manage users/orgs through a dedicated admin dashboard. Admin-only interface elements are completely absent from the DOM for non-admin users.

### Story 6.1: Admin Dashboard & Org/User Management

As a **platform admin**,
I want to view and manage all organizations and users system-wide,
So that I can oversee the platform and assist users when needed.

**Acceptance Criteria:**

**Given** I am authenticated with `is_platform_admin: true`
**When** I navigate to the admin dashboard
**Then** I see a list of all organizations with their member counts, subscription status, and creation dates (FR4)
**And** I can view individual user details across all orgs
**And** the `/admin` action route is protected by `proxy.ts` and `requireAdmin` middleware

**Given** I am a non-admin user
**When** the page renders
**Then** admin interface elements (nav links, menu items, route components) are completely absent from the DOM — not hidden via CSS (FR34, NFR10)

**Given** a non-admin user attempts to access admin API endpoints directly
**When** the request is processed
**Then** the API returns `AuthorizationError` (403) independent of any frontend state (NFR11)

### Story 6.2: System Health Monitoring

As a **platform admin**,
I want to view system health status including database, AI service, and uptime,
So that I can proactively identify and address issues.

**Acceptance Criteria:**

**Given** I am on the admin dashboard
**When** I view the system health panel
**Then** I see real-time status for: database connectivity, AI service (Claude API) availability, Redis connectivity, and application uptime (FR32)

**Given** a service is degraded or unavailable
**When** the health check detects the issue
**Then** the status indicator reflects the degraded state with a clear label
**And** the health data refreshes on a reasonable interval without requiring manual refresh

**Given** the health check runs
**When** it queries each service
**Then** each check has timeout handling — a slow response is reported as degraded, not hung

### Story 6.3: Cross-Organization Analytics Events View

As a **platform admin**,
I want to view analytics events across all organizations,
So that I can understand platform usage patterns and identify trends.

**Acceptance Criteria:**

**Given** I am on the admin dashboard
**When** I navigate to the analytics events view
**Then** I see a paginated list of analytics events from all organizations (FR33)
**And** events display: event_name, org name, user, timestamp, and metadata

**Given** the events list is rendered
**When** I filter or search events
**Then** I can filter by event type, org, and date range

**Given** the analytics events view loads
**When** the data is fetched
**Then** the query uses a dedicated admin query path that bypasses RLS via a service-role database connection (not by omitting `WHERE org_id` in application code)

---

## Epic 7: DevOps, Quality & Portfolio Readiness

The project achieves production readiness with a 5-stage CI pipeline (lint/typecheck, test, seed-validation, E2E, Docker smoke), a case-study README with hero screenshot and architecture diagram, validated seed data AI quality, comprehensive analytics event tracking across all features, and light/dark appearance mode switching.

### Story 7.1: Complete CI Pipeline (5-Stage)

As a **developer**,
I want the full 5-stage CI pipeline running on every push,
So that code quality, tests, seed validation, E2E, and Docker integrity are all verified automatically.

**Acceptance Criteria:**

**Given** the CI skeleton from Story 1.6 exists (lint + typecheck)
**When** the pipeline is expanded
**Then** all 5 stages run in order: lint/typecheck → test → seed-validation → E2E → Docker smoke (FR37)

**Given** the test stage runs
**When** Vitest executes
**Then** unit and integration tests pass for business logic, API routes, curation pipeline, and Client Components
**And** test files are co-located (`*.test.ts`) next to source, no `__mocks__/` directories

**Given** the seed-validation stage runs
**When** the snapshot approach executes
**Then** it validates curation pipeline output determinism (not LLM response) — deterministic and free (FR39)

**Given** the E2E stage runs
**When** Playwright executes
**Then** E2E tests in the root `e2e/` directory verify RSC paths, user journeys, and multi-page flows

**Given** the Docker smoke stage runs
**When** the test executes
**Then** it runs `docker compose up`, waits for health check, then `docker compose down` (NFR15)

**Given** the test stage includes accessibility checks
**When** axe-core runs against rendered pages
**Then** all pages pass with zero critical violations (NFR27)

### Story 7.2: Seed Data AI Quality Validation

As a **developer**,
I want seed data to produce a meaningful AI summary validated in CI,
So that the first impression (Sarah the hiring manager running `docker compose up`) always works.

**Acceptance Criteria:**

**Given** the seed data from Story 2.1 exists with deliberate anomalies
**When** the seed validation runs in CI
**Then** the curation pipeline snapshot confirms deterministic output from the seed dataset (FR39)
**And** the snapshot includes expected statistical findings (seasonal spike, category patterns)

**Given** a developer changes the seed data or curation pipeline
**When** the snapshot test fails
**Then** the developer is prompted to review and update the snapshot intentionally

**Given** Docker Compose starts with seed data
**When** the seed AI summary is loaded
**Then** the pre-generated seed summary from Story 3.2 is present and meaningful

### Story 7.3: README Case Study & Hero Screenshot

As a **hiring manager evaluating this portfolio piece**,
I want a polished README with architecture diagram and hero screenshot,
So that I can quickly understand the project's scope and quality.

**Acceptance Criteria:**

**Given** the README scaffold from Story 1.6 exists
**When** the prose is filled in
**Then** all sections have substantive content in case-study format: problem statement, solution approach, architecture diagram, tech stack rationale, and getting started instructions (FR38)

**Given** the hero screenshot is needed
**When** `scripts/generate-screenshots.ts` runs via Playwright
**Then** a hero screenshot is generated and saved to `docs/screenshots/` showing the dashboard with seed data and AI summary

**Given** the README is complete
**When** a reader follows the "Getting Started" section
**Then** `docker compose up` successfully launches the full application with seed data

### Story 7.4: Analytics Event Verification & Completeness

As a **developer**,
I want to verify all analytics events fire correctly across all features,
So that usage tracking is comprehensive and reliable for product decisions.

**Acceptance Criteria:**

**Given** the analytics foundation from Story 1.6 and events instrumented across Epics 2-6
**When** E2E tests trigger each user action (upload, view dashboard, filter, view AI summary, share, etc.)
**Then** the corresponding analytics event is recorded in the `analytics_events` table — all 10 events verified (FR40):
- `dataset.uploaded` (UploadDropzone)
- `dashboard.viewed` (DashboardPage)
- `chart.filtered` (FilterBar)
- `ai_summary.viewed` (AiSummaryCard)
- `ai_preview.viewed` (AiSummaryCard free preview)
- `transparency_panel.opened` (TransparencyPanel)
- `insight.shared` (ShareButton)
- `share_link.created` (ShareButton)
- `subscription.upgraded` (UpgradeCta / BillingPage)
- `subscription.cancelled` (BillingPage)

**Given** events are being tracked
**When** I inspect the analytics_events table
**Then** each event has: event_name, org_id, user_id (where applicable), metadata jsonb, and timestamp

### Story 7.5: Dark Mode Appearance

As a **user**,
I want to switch between light and dark appearance modes,
So that I can use the application comfortably in any lighting condition.

**Acceptance Criteria:**

**Given** I am on any page of the application
**When** I toggle the appearance mode
**Then** the UI switches between light and dark themes (FR41)
**And** the preference persists across sessions

**Given** I have not set a preference
**When** I first visit the application
**Then** the system detects my OS preference via `prefers-color-scheme` and applies it automatically
**And** `next-themes` is used as the dark mode foundation

**Given** dark mode is active
**When** I inspect the design tokens
**Then** all colors use oklch color space tokens defined via `@theme` directive in `globals.css`
**And** the Trust Blue design direction and Warm Advisory accent adapt to dark mode appropriately

**Given** dark mode is active
**When** accessibility is evaluated
**Then** color contrast meets WCAG AA standards
**And** color is not the sole means of conveying information (icons/labels accompany status colors) (NFR26)
