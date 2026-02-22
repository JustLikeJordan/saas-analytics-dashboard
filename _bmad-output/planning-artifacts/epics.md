---
stepsCompleted: ['step-01-validate-prerequisites', 'step-01-requirements-confirmed', 'step-02-design-epics']
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
