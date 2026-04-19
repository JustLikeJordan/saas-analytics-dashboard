---
title: 'Production Deployment'
slug: 'production-deployment'
created: '2026-04-18'
status: 'code-pass-complete-dashboard-pending'
code_pass_complete_date: '2026-04-19'
stepsCompleted: [1, 2, 3, 4]
adversarial_review_date: '2026-04-18'
adversarial_findings_total: 20
adversarial_findings_addressed: 15
adversarial_findings_deferred: 5
tech_stack:
  - 'Node 22-slim (Docker runtime); Node 20.9+ minimum per project-context'
  - 'pnpm 10.30.2 via corepack; Turborepo 2.8+'
  - 'Next.js 16.1.6, React 19.2.3, Tailwind 4, @sentry/nextjs ^10.49'
  - 'Express 5, Drizzle ORM 0.45.x, PostgreSQL 18, Redis 7'
  - '@anthropic-ai/sdk (streaming), stripe, jose 6.x, rate-limiter-flexible, pino'
  - 'Zod 3.23.8 (pinned — drizzle-zod compat)'
  - 'Vercel (frontend hosting, native Next.js build)'
  - 'Railway (API container hosting, Docker from Dockerfile.api)'
  - 'Neon (managed Postgres, dual-role app_user + app_admin)'
  - 'Upstash (serverless Redis)'
  - 'Cloudflare Registrar (domain + DNS)'
  - 'GitHub Actions (existing 5-stage CI; deploy job appended)'
files_to_modify:
  - 'apps/api/src/config.ts (reference only — env schema ground truth)'
  - 'apps/web/lib/config.ts (reference only — web env schema)'
  - 'apps/api/src/routes/health.ts (reference only — /health/live + /health/ready already exist)'
  - 'apps/api/src/routes/stripeWebhook.ts (reference only — webhook path + signature)'
  - 'apps/api/src/services/auth/googleOAuth.ts (reference only — OAuth scopes + redirect URI)'
  - 'apps/api/src/db/migrate.ts (reference only — prefers DATABASE_ADMIN_URL)'
  - 'apps/api/entrypoint.sh (reference only — migrations + seed on boot)'
  - 'Dockerfile.api (reference only — HEALTHCHECK, USER node)'
  - 'Dockerfile.web (reference only — Vercel ignores this; kept for Docker parity)'
  - 'apps/web/next.config.ts (reference only — /api/:path* rewrite rule)'
  - 'docker/init.sql (reference only — dual-role pattern to replicate in Neon)'
  - '.github/workflows/ci.yml (modify — append deploy job after docker-smoke passes)'
  - 'README.md (modify — add production URL + deploy badge)'
  - 'docs/deployment-roadmap.md (modify — check off completed items)'
  - 'apps/api/src/config.ts (consider modify — add optional runbook comment? decide in Step 3)'
code_patterns:
  - 'Zod fail-fast env validation at boot; no process.env access outside config.ts (exceptions: migrate.ts, drizzle.config.ts)'
  - 'BFF proxy via Next.js rewrites (/api/:path* → API_INTERNAL_URL); no CORS middleware'
  - 'Stripe webhook router mounted BEFORE express.json() for raw body'
  - 'Graceful shutdown: SIGTERM → abort SSE → server.close → Sentry.flush → worker drain → redis.quit → db.end; 30s hard-kill timer'
  - 'server.keepAliveTimeout = 20_000 (SSE streams up to 15s must not be killed by proxy)'
  - 'Dual-role DB: queryClient (app_user, RLS) vs adminClient (app_admin, BYPASSRLS) — services import from db/queries/ barrel'
  - 'Health check split: /health/live (liveness, no deps) + /health/ready (readiness, DB + Redis) + /health (legacy combined)'
  - 'Sentry wiring dormant until SENTRY_AUTH_TOKEN present — Vercel reads from its own env, Docker build args populate ENV at image-build time'
  - 'Privacy-by-architecture: assembly.ts accepts ComputedStat[], not DataRow[] — raw data cannot reach LLM'
test_patterns:
  - 'Vitest: apps/api (node env) + apps/web (jsdom env) + packages/shared'
  - 'Playwright E2E against docker-compose production build (CI stage 4)'
  - 'scripts/validate-seed.ts — snapshot of curation pipeline output, deterministic, no LLM calls (CI stage 3)'
  - 'scripts/smoke-test.sh — Docker smoke (CI stage 5)'
  - 'Manual smoke checklist for first prod deploy: /health/ready 200, OAuth round-trip, CSV upload, SSE stream through BFF, Stripe live webhook, invite flow, CAN-SPAM unsubscribe click-through'
---

# Tech-Spec: Production Deployment

**Created:** 2026-04-18

## Overview

### Problem Statement

The app is portfolio-ready locally — `docker compose up` gives a working product with seed data, migrations, and pre-cached AI summaries. It has never been deployed to a production environment. Product Hunt launch is scheduled for 2026-07-13 (12 weeks out), and every downstream GTM task depends on a live production URL: Sentry source-map upload is wired but dormant (commit `bfa7b40`), the email digest (Week 3) needs a reachable domain for unsubscribe links, the QuickBooks OAuth flow (Week 6) needs a registered redirect URI, and load-testing the curation pipeline needs real infrastructure.

The longer production slips, the more downstream work compounds. Target: production-live by **2026-05-04** (16 days from spec creation — includes 3-day buffer for async provider dependencies: DNS propagation, Stripe live-mode review queue, Google OAuth verification queue).

### Solution

Provision the managed-service topology documented in `docs/deployment-roadmap.md`: **Cloudflare Registrar** for the domain + DNS, **Vercel** for the Next.js frontend, **Railway** for the Express API container, **Neon** for Postgres (with dual roles for RLS), **Upstash** for Redis. Configure production environment variables (all Zod-validated via `apps/api/src/config.ts`), switch Stripe from test to live keys, register the production Google OAuth redirect URI, run migrations, and verify the deployed app end-to-end against a smoke-test checklist.

First 3–5 deploys are manual — provider-specific issues (build minutes, secret handling, cold starts, proxy timeouts for SSE) are easier to triage one at a time. Once the manual pipeline is stable, wire a GitHub Actions deploy job that triggers on merge to main.

### Scope

**In Scope:**

- Purchase domain at Cloudflare Registrar + configure DNS
- Vercel project setup, env vars, deploy from `main`
- Railway service setup for `apps/api` Docker image, env vars, deploy (region: `us-east`)
- Neon project with `app_user` (RLS) + `app_admin` (BYPASSRLS) roles (region: `us-east`)
- Upstash Redis instance (region: `us-east`, matched to Railway + Neon)
- Production env var population across Vercel + Railway (split per surface — Vercel gets public-only; Railway gets DB + secrets)
- Stripe: apply for live-mode activation Day 1 (review queue can take days for financial analytics); switch secret key + webhook secret to live once approved; register production webhook endpoint
- Google OAuth: verify consent-screen scopes do not trigger Google's app-verification flow; add production redirect URI in Google Cloud Console
- Migration run against production Neon DB (via Drizzle migrate, using `DATABASE_ADMIN_URL`)
- Smoke-test checklist:
  - `/health` returns 200 from production URL
  - OAuth login end-to-end (Google consent → callback → dashboard)
  - CSV upload + preview + confirm flow
  - AI summary SSE stream through Vercel BFF proxy → Railway → Claude API (verify no buffering breaks streaming)
  - Stripe live webhook round-trip (subscription.created event fires against prod API)
  - Invite flow (create org, invite user, accept invite)
  - CAN-SPAM unsubscribe link click-through from a real digest email template
- Observability bridge (pre-Sentry): Railway CLI log tail + Vercel CLI log tail commands documented in deploy runbook. Covers Week 1 → Week 2 gap until Sentry activation.
- Rollback plan documented: Neon branch restore for DB rollback; Railway + Vercel "rollback to previous deployment" UI flow for app rollback
- GitHub Actions deploy job wired AFTER manual deploys succeed (triggers on merge to `main`)
- Documentation updates: README production URL + deploy status badge; deployment-roadmap.md checklist items checked off

**Out of Scope:**

- **Sentry activation** — Week 2 work per GTM plan; wiring is dormant but env vars land in a separate spec
- **Email digest feature** — Week 3; needs digest service + templates
- **QuickBooks integration** — Week 6; spec already exists at `docs/quickbooks-implementation-plan.md`
- **Circuit breaker on Claude API** — listed "High Priority" in roadmap; post-launch iteration
- **PgBouncer / explicit connection pooler** — Neon's built-in pooler covers pre-launch load (< 100 users)
- **Account lockout on failed logins** — post-launch hardening
- ~~**Split readiness/liveness probes**~~ — **MOVED TO IN-SCOPE**. Step 2 investigation found `/health/live` and `/health/ready` already implemented in `apps/api/src/routes/health.ts`. Railway readiness probe uses `/health/ready` on Day 1.
- **Horizontal scaling / multi-instance deploys** — single-process is fine until Product Hunt traffic warrants it
- **Automated secrets rotation** — document the manual process, don't build automation
- **Performance monitoring dashboards** — Sentry Performance comes with the Week 2 Sentry spec

## Context for Development

### Technical Preferences & Constraints

- **Domain registrar locked to Cloudflare** — at-cost pricing, DNS in same dashboard, free DNSSEC
- **API host locked to Railway** — simpler Docker GitHub integration than Fly for a single container; Fly's multi-region advantage not needed pre-launch
- **Railway plan must support long-lived SSE** — AI streaming sessions can idle > 60s between chunks. Verify the selected Railway tier does not enforce aggressive request timeouts on streaming responses BEFORE first deploy. Document the exact limit in Step 2 investigation.
- **DB locked to Neon** — branching aligns with Vercel preview deploys, built-in pooler, custom role support for dual-role RLS
- **Neon branching is Phase 2** — preview-deploy DB branching is not wired Day 1. This spec uses a single production Neon branch. Preview-deploy branch wiring becomes its own follow-up once the manual deploy pipeline is stable.
- **Redis locked to Upstash** — serverless pricing matches low-traffic profile, global replication available later
- **Frontend locked to Vercel** — native Next.js 16 support, BFF proxy runs in Vercel's Node runtime
- **Region pinning: all services in `us-east`** — Railway, Neon, Upstash must live in the same region (default `us-east-1` or each provider's equivalent). Cross-region DB round-trips on the AI curation pipeline would blow the TTFT budget (< 2s).
- **Env var split per surface** — Vercel receives only `APP_URL`, `NODE_ENV`, and any `NEXT_PUBLIC_*` values. DB URLs, API secrets (Claude, Stripe, JWT_SECRET), and admin connection strings go to Railway only. No DB credentials in the Vercel dashboard, ever.
- **Deploy cadence: manual → automated** — never auto-deploy before the pipeline is proven
- **No code changes in scope** — every app-level production-readiness gap listed "Blocking" in `deployment-roadmap.md` is already fixed (graceful shutdown, AI quotas, row limits, non-root Docker, Dockerfile HEALTHCHECK). This spec is pure infrastructure + configuration.
- **Zod fail-fast contract** — the API refuses to start if any env var is missing or malformed (`apps/api/src/config.ts`). Every env var in this spec must match that schema exactly.
- **Privacy-by-architecture preserved** — `services/assembly.ts` accepts `ComputedStat[]` not `DataRow[]`. Production deploy does not introduce any new path for raw data to reach the LLM.
- **Dashboard is public** — `proxy.ts` protects `/upload`, `/billing`, `/admin` only. Production config must not introduce an auth redirect on `/dashboard`.
- **Single-source env var validation** — no `process.env` access outside `config.ts`. This constraint protects every production env var from drift.

### Codebase Patterns (confirmed via Step 2 investigation)

- **Fail-fast Zod validation at boot** — `apps/api/src/config.ts` runs `envSchema.safeParse(process.env)` at import time. Missing or malformed env vars crash the process before `app.listen()`. Every env var in this spec must match the schema shape exactly or Railway's deploy fails on startup. Same pattern in `apps/web/lib/config.ts` (smaller — 3 vars).
- **Single-source env access** — No `process.env` outside config files, except two intentional exceptions documented in code: `apps/api/src/db/migrate.ts` (runs before config loads, has inline comment) and `apps/api/drizzle.config.ts` (dev-time schema tooling).
- **BFF proxy via Next.js rewrites** — `apps/web/next.config.ts` defines `rewrites: [{ source: '/api/:path*', destination: \`${API_INTERNAL_URL}/:path*\` }]`. Browser never talks to Railway directly. Stripe's server-to-server webhook uses this same path — Vercel preserves raw body on forwarding.
- **Webhook before body parser** — `stripeWebhookRouter` is mounted BEFORE `express.json()` in `index.ts`. Raw body required for Stripe signature verification; middleware chain order is load-bearing.
- **Graceful shutdown with 30s hard-kill** — `index.ts` handles SIGTERM/SIGINT. Order: abort SSE streams → `server.close()` → `Sentry.flush(2000)` → digest worker drain → QB worker drain → `redis.quit()` → DB clients end. 30s timer forces `process.exit(1)` if drain hangs. Railway must send SIGTERM and wait ≥ 30s grace period.
- **`keepAliveTimeout = 20_000`** — AI streams run up to 15s. The 20s keep-alive buffer prevents Express from closing connections mid-stream. Railway's proxy timeout must also exceed 15s.
- **Dual-role DB clients** — `apps/api/src/lib/db.ts` exports `queryClient` (`DATABASE_URL`, `app_user`, RLS-enforced) and `adminClient` (`DATABASE_ADMIN_URL`, `app_admin`, `BYPASSRLS`). Services import from `db/queries/` barrel.
- **Split health endpoints exist** — `apps/api/src/routes/health.ts` exposes `/health/live` (trivial, no deps), `/health/ready` (checks DB + Redis, 503 on degradation), and legacy combined `/health` (for Docker HEALTHCHECK + E2E wait loops). Railway readiness probe uses `/health/ready` on Day 1.
- **Sentry wiring dormant-by-default** — `next.config.ts` wraps with `withSentryConfig({ silent: true })`. Source-map upload triggers only when `SENTRY_AUTH_TOKEN` present at build time. Vercel reads as env var; Docker reads as `--build-arg`. This spec does NOT populate Sentry env vars (that's the Week 2 Sentry spec).
- **Privacy-by-architecture** — `services/assembly.ts` accepts `ComputedStat[]` not `DataRow[]`. No deploy configuration can introduce a path where raw tenant data reaches Claude.
- **Worker init gated by config** — `initSyncWorker` (QB) runs only if `isQbConfigured(env)`; `initDigestWorker` (email) runs only if `isDigestConfigured(env)`. Safe to deploy without either — Week 3 and Week 6 specs populate those env vars.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/api/src/config.ts` | Zod env schema — ground truth. `.refine()` forces `sk_live_*` Stripe keys when `NODE_ENV=production`. |
| `apps/web/lib/config.ts` | Web env schema — `API_INTERNAL_URL` (URL), `JWT_SECRET` (optional ≥ 32), `NODE_ENV`. Vercel setup is small. |
| `apps/api/src/index.ts` | Middleware order, `trust proxy: 1`, graceful shutdown, `keepAliveTimeout=20s`, conditional worker init. |
| `apps/api/src/routes/health.ts` | `/health`, `/health/live`, `/health/ready`. Railway readiness → `/health/ready`. |
| `apps/api/src/routes/stripeWebhook.ts` | Webhook path `/webhooks/stripe`, raw body, signature verification via `STRIPE_WEBHOOK_SECRET`. |
| `apps/api/src/services/auth/googleOAuth.ts` | `redirect_uri = ${env.APP_URL}/callback` — Next.js page, not an API route. |
| `packages/shared/src/constants/index.ts` | `GOOGLE_SCOPES = 'openid email profile'` — basic scopes, no Google app verification required. |
| `apps/api/src/db/migrate.ts` | Migration runner — uses `DATABASE_ADMIN_URL` with fallback to `DATABASE_URL`. |
| `apps/api/entrypoint.sh` | Boot sequence: migrations → seed → exec app. Both idempotent. |
| `apps/api/drizzle.config.ts` | Drizzle-kit config (dev-time). Prod uses `migrate.ts`, not drizzle-kit. |
| `Dockerfile.api` | Multi-stage, `node:22-slim`, `curl` for HEALTHCHECK, `USER node`, runs `entrypoint.sh` then `node dist/.../index.js`. |
| `Dockerfile.web` | Accepts Sentry build args. **Vercel does not use this** — it builds Next natively. Kept for Docker parity + CI smoke tests. |
| `apps/web/next.config.ts` | `output: 'standalone'`, `/api/:path*` rewrite to `API_INTERNAL_URL`, Sentry wrapper (dormant without token). |
| `apps/web/proxy.ts` | Protected routes: `/upload`, `/billing`, `/admin`, `/settings`. JWT verify via `JWT_SECRET`. |
| `docker/init.sql` | Dual-role pattern: `app_user` (restricted DML, RLS) + `app_admin` (owner, BYPASSRLS). Replicate in Neon SQL console. |
| `docker-compose.yml` | Reference for local env var shape — `DATABASE_URL=postgresql://app_user:...`, `DATABASE_ADMIN_URL=postgresql://app_admin:...`. Prod mirrors the pattern. |
| `.github/workflows/ci.yml` | Existing 5-stage pipeline: quality → test → seed-validation → e2e → docker-smoke. Append `deploy` job after `docker-smoke` passes on `main`. |
| `README.md` | Add production URL + deploy status badge after first successful deploy. |
| `docs/deployment-roadmap.md` | Source of truth — check off completed items as they ship. |

### Technical Decisions (finalized via Step 2 investigation)

1. **Railway readiness probe → `/health/ready`**; liveness → `/health/live`. Endpoints already exist. Remove "Split readiness/liveness probes" from out-of-scope.
2. **Stripe webhook URL → `https://api.{DOMAIN}/webhooks/stripe`** (direct to Railway via custom subdomain). Rationale: Next.js rewrite raw-body preservation through Vercel is not a documented guarantee — Stripe signature verification depends on byte-for-byte raw body. Bypassing Vercel for the webhook eliminates the risk class entirely. Cost: one additional DNS record in Task 7. Benefit: signature verification is proved against Railway's direct request path, identical to local docker-compose behavior. The `api` subdomain becomes **required**, not optional.
3. **Google OAuth redirect URI → `https://<domain>/callback`** (Next.js page, not API route). Exactly this URL goes into Google Cloud Console authorized redirect URIs list.
4. **Google app verification NOT REQUIRED** — scopes are `openid email profile` (basic only). Remove this risk from the spec.
5. **Railway env vars (full set)**: required — `DATABASE_URL`, `DATABASE_ADMIN_URL`, `REDIS_URL`, `CLAUDE_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `JWT_SECRET` (≥ 32 chars), `APP_URL`, `NODE_ENV=production`. Optional — `METRICS_TOKEN` (≥ 16 chars; required if exposing `/metrics`), `ANALYTICS_RETENTION_DAYS` (default 90), `CLAUDE_MODEL` (default `claude-sonnet-4-5-20250929`). Railway injects `PORT`.
6. **Vercel env vars (minimal)**: runtime — `API_INTERNAL_URL` (Railway public URL), `JWT_SECRET` (IDENTICAL to Railway), `NODE_ENV=production`, `APP_URL`. **No DB URLs, no Claude key, no Stripe secrets on Vercel ever.**
7. **Neon dual-role setup**: use Neon's default compute role as `app_admin` (owner, add `BYPASSRLS`). Create `app_user` via SQL Editor with grants from `docker/init.sql`. Both connection strings identical except role + password.
8. **Connection pooling via Neon's built-in pooler** (`-pooler` suffix on connection string). Satisfies the "Should Have: pooler" roadmap gap without adding PgBouncer.
9. **Migrations + seed run on every Railway boot** (via `entrypoint.sh`). First boot creates schema + seed org/dataset. Subsequent boots are idempotent no-ops. Keep seed — the demo dataset is intentional first-run UX.
10. **Region pinning → `us-east`**: Railway us-east, Neon `us-east-2` (AWS equivalent), Upstash `us-east-1`. Cross-region round-trips blow the AI pipeline's < 2s TTFT budget.
11. **Deploy pipeline order**: manual deploy → smoke test → 3–5 iterations → wire GitHub Actions deploy job. Actions job triggers after `docker-smoke` on `main`; secrets (`RAILWAY_TOKEN`, `VERCEL_DEPLOY_HOOK_URL`) live in repo secrets.
12. **Stripe webhook registration is a two-phase step**: register webhook in Stripe dashboard → copy generated signing secret → set `STRIPE_WEBHOOK_SECRET` on Railway → redeploy API. Sequence-dependent (can only register once API is reachable).
13. **Production URLs**: apex + `www` point to Vercel (frontend). `api.{DOMAIN}` points to Railway (required — see Decision #2). Railway's assigned `.up.railway.app` subdomain is kept as a fallback origin but not used by Stripe or public traffic.
14. **First-deploy `APP_URL`**: set to final user-facing domain (`https://{DOMAIN}`), NOT the Railway subdomain. OAuth callback + email digest links depend on this.

15. **`trust proxy` chain (F5 resolution)**: Request flow for API = Cloudflare → Railway edge → Express. Railway adds exactly one `X-Forwarded-For` hop; Cloudflare "DNS only" mode (set in Task 7) does NOT add a hop. So `trust proxy: 1` is correct for direct-to-Railway traffic (Stripe webhook, API subdomain). For traffic via Vercel (browser requests to `{DOMAIN}/api/*`), the chain is Cloudflare → Vercel edge → Railway → Express = 2 hops. **Decision**: since Stripe lives on a separate subdomain (Decision #2) and rate limiting needs correct client IP, set `trust proxy: 2` in `index.ts` before first production deploy. Pre-deploy verification task added (Task 12a). If later Cloudflare proxying is re-enabled, increase to 3.

16. **Migrations must be safe under instance restarts (F8 resolution)**: Railway may restart the API container for zero-downtime deploys, or scale to multiple instances if configured. Entrypoint migration run could race on concurrent boots. **Decision**: rely on Drizzle's `migrations_journal.json` tracking (Drizzle skips already-applied migrations), plus an explicit Postgres advisory lock wrapping the migration call in `migrate.ts`. Small code change: acquire `pg_advisory_lock(42)` before `migrate()`, release after. If a second boot contends, it waits rather than runs twice. Task 8a added.

17. **TLS-and-domain readiness gate (F9 resolution)**: `APP_URL` on Railway must NOT be set to the production domain until that domain actually resolves and serves valid TLS via Vercel. Task 9 revised to use Railway's `.up.railway.app` subdomain as a temporary `APP_URL`, then update to `https://{DOMAIN}` after Task 14 (Vercel domain + TLS live). Google OAuth redirect URI (Task 11) is likewise deferred until TLS is verified. This prevents the circular dependency.

18. **Cookie flags for cross-subdomain (F10 resolution)**: Session cookies set by the API (which runs on `api.{DOMAIN}`) must be readable by `{DOMAIN}` (Next.js proxy.ts). **Decision**: cookies set with `Domain=.{DOMAIN}` (leading-dot for cross-subdomain), `SameSite=Lax` (allows top-level navigation from Stripe Checkout return), `Secure=true` (HTTPS-only), `HttpOnly=true` (no JS access), `Path=/`. Verify these flags in `apps/api/src/services/auth/tokenService.ts` during Task 12 smoke. Add Task 11a to explicitly audit cookie flags for production correctness.

19. **Seed idempotence reference (F15 resolution)**: `apps/api/src/db/seed.ts` uses `ON CONFLICT DO NOTHING` on email uniqueness for the demo org + user, and `ON CONFLICT` upserts for the demo dataset. This is the source of the idempotence claim. Fresh dev agent can verify by reading that file. Reference added to Technical Decisions.

20. **Backup + PITR verification (F7 resolution)**: Neon's free tier retains 24h of history; paid tiers extend this. Before first production user, verify project is on a tier with ≥ 7-day history window. Task 3a added to enable + verify PITR retention covers the full PH-launch week.

21. **Web package Google env var (F13 resolution)**: The Next.js `/callback` page is a pure redirector — it reads the `code` query param from Google and POSTs it to `/api/auth/callback` (API route, proxied to Railway). The web package does NOT construct the Google OAuth URL itself; that construction happens server-side on Express via `apps/api/src/services/auth/googleOAuth.ts`. Therefore web package does NOT need `GOOGLE_CLIENT_ID`. Vercel env var list (Decision #6) is complete.

## Implementation Plan

### Tasks

**Phase 1 — Day 1 async kickoff (queue-bound work, start these first)**

- [ ] Task 1: Purchase production domain at Cloudflare Registrar
  - File: none (external dashboard)
  - Action: Register domain, enable DNSSEC, set `transfer-lock = on`, verify ownership email
  - Notes: Start here. DNS propagation begins the moment domain is live. Whatever domain you pick becomes `{DOMAIN}` in every subsequent task.

- [ ] Task 2: Submit Stripe live-mode activation request
  - File: none (external dashboard)
  - Action: Stripe Dashboard → Settings → Account → Activate Payments. Fill business profile, bank details, tax info. Describe business as "AI-powered small business analytics dashboard (SaaS subscription)".
  - Notes: Review queue is async, typically 1–5 business days. Submit on Day 1. If Stripe requests additional info, respond same-day to keep queue position.

**Phase 2 — Service provisioning (parallelizable while Phase 1 dependencies clear)**

- [ ] Task 3: Create Neon project with dual-role setup
  - File: none (Neon dashboard + SQL editor)
  - Action: Create project in region `us-east-2` (AWS). Name DB `analytics`. Neon's default role becomes `app_admin`. In SQL editor, run exact contents of `docker/init.sql` to create `app_user`. Confirm `BYPASSRLS` is set on `app_admin` with `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('app_admin', 'app_user');`. Save both connection strings (the `-pooler` variants).
  - Notes: Neon compute roles differ from postgres roles. The "compute role" auto-generated at project creation IS `app_admin` — rename or use as-is. The SQL `CREATE ROLE app_user` creates a separate postgres role with its own password.

- [ ] Task 3a: Enable + verify Neon Point-in-Time Recovery window
  - File: none (Neon dashboard → Settings → History)
  - Action: Confirm PITR retention is ≥ 7 days for the launch project. Neon free tier retains 24h; upgrade to Launch tier ($19/mo) or higher to get 7+ days. Set a calendar reminder: during PH-launch week, verify retention window on Day 1 and Day 7.
  - Notes: AC 15 (rollback drill) is meaningless without a retention window that covers the drill + the incident window. This task exists to make the backup assumption concrete and paid for.

- [ ] Task 4: Create Upstash Redis instance
  - File: none (Upstash dashboard)
  - Action: Create database in region `us-east-1` (AWS). Eviction: `allkeys-lru`. TLS: enabled. Copy the full `rediss://` connection string (note the double-s — TLS).
  - Notes: `REDIS_URL` Zod validator requires `z.string().url()` — confirm format matches.

- [ ] Task 5: Create Railway project and connect GitHub
  - File: none (Railway dashboard)
  - Action: New project → Deploy from GitHub repo `CoreyStevensDev/saas-analytics-dashboard`. Select `main` branch. Railway auto-detects `Dockerfile.api` if root path is `.`; explicitly set build to use `Dockerfile.api`. Set region to `us-east`. Set service name `api`. Leave auto-deploy OFF initially (Task 11 wires it up after first manual deploy succeeds).
  - Notes: Railway's "Deploy from Dockerfile" path matters — `Dockerfile.api` lives at repo root. Railway injects `PORT`; `config.ts` picks it up via `z.coerce.number().default(3001)`.

- [ ] Task 6: Create Vercel project and connect GitHub
  - File: none (Vercel dashboard)
  - Action: Import Git repo `CoreyStevensDev/saas-analytics-dashboard`. Framework preset: Next.js. Root directory: `apps/web`. Build command: leave default (`next build`). Install command: `pnpm install --frozen-lockfile` (Vercel auto-detects pnpm from `pnpm-lock.yaml`). Set region to `us-east` (iad1 or equivalent).
  - Notes: Vercel's monorepo detection handles `apps/web` — it won't build the API. Turborepo integration is automatic. Do NOT deploy yet — no env vars set.

**Phase 3 — DNS and secrets prep**

- [ ] Task 7: Configure Cloudflare DNS
  - File: none (Cloudflare dashboard)
  - Action: Add records — `A` record `@` → Vercel's IP (Vercel provides on domain addition), `CNAME` record `www` → `cname.vercel-dns.com`, `CNAME` `api` → `<railway-service>.up.railway.app` (required — Stripe webhook + server-to-server traffic routes here). Enable "DNS only" (orange cloud OFF) for apex + www (Vercel TLS issuance needs direct DNS). For `api` subdomain, also "DNS only" — Railway issues its own TLS cert and proxy double-wrapping TLS is unnecessary.
  - Notes: All three records must be "DNS only" for initial deploy. Cloudflare proxying can be re-enabled selectively post-launch if DDoS becomes a concern.

- [ ] Task 8: Generate production `JWT_SECRET`
  - File: none (local terminal, then Railway + Vercel dashboards)
  - Action: Generate 64-char secret: `openssl rand -base64 48`. Store in a password manager — this same value goes into BOTH Railway and Vercel as `JWT_SECRET`.
  - Notes: Must be ≥ 32 chars per `config.ts` schema. Vercel's web `JWT_SECRET` must match the API's exactly for cookie verification in `proxy.ts`. 64 chars gives headroom. **Known rotation limitation** (F4): there is no dual-secret overlap period. Any future rotation forces every user to re-authenticate. Deploy-runbook must document this as an accepted tradeoff with an eventual "grace-period rotation" upgrade path.

- [x] Task 8a: Add migration advisory lock
  - File: `apps/api/src/db/migrate.ts`
  - Action: Wrap the `await migrate(...)` call with a Postgres advisory lock acquisition + release. Use lock ID `42` (any constant 64-bit integer works). Code change:
    ```ts
    await migrationClient`SELECT pg_advisory_lock(42)`;
    try { await migrate(db, { migrationsFolder: './drizzle/migrations' }); }
    finally { await migrationClient`SELECT pg_advisory_unlock(42)`; }
    ```
  - Notes: Prevents concurrent boots from racing migrations (F8). Drizzle's journal tracking catches most double-application cases, but advisory lock is defense-in-depth. The lock blocks, not fails — a second boot waits for the first to finish, then finds nothing to migrate.

**Phase 4 — Environment variable population**

- [ ] Task 9: Populate Railway environment variables
  - File: Railway dashboard → Service `api` → Variables
  - Action: Add all required vars per `apps/api/src/config.ts` schema:
    - `DATABASE_URL=<Neon app_user pooler URL>`
    - `DATABASE_ADMIN_URL=<Neon app_admin pooler URL>`
    - `REDIS_URL=<Upstash rediss:// URL>`
    - `CLAUDE_API_KEY=sk-ant-…`
    - `STRIPE_SECRET_KEY=sk_live_…` — **only populate after Task 2 (Stripe live-mode approval) lands**. If approval is still pending when everything else is ready to deploy, DO NOT deploy to production yet. Waiting is the right answer — the alternative (toggling `NODE_ENV` or disabling the Zod `.refine()` check) defeats the exact safety net that prevents broken-payment deploys. If Stripe review exceeds 5 business days, use the "launch-without-live-payments" fallback (see Risks section): defer Stripe deploy to Phase 9, launch the rest of the stack, and backfill payment flow on Stripe approval. This does push PH-launch calculations, so track daily.
    - `STRIPE_WEBHOOK_SECRET=<placeholder>` (real value set in Task 13)
    - `STRIPE_PRICE_ID=price_…` (live price ID from Stripe dashboard)
    - `GOOGLE_CLIENT_ID=<google-client-id>`
    - `GOOGLE_CLIENT_SECRET=<google-client-secret>`
    - `JWT_SECRET=<from Task 8>`
    - `APP_URL=<Railway's .up.railway.app domain>` for initial boot. **Update to `https://{DOMAIN}` AFTER Task 14 confirms Vercel TLS + domain are live** (prevents circular dependency — see Decision #17).
    - `NODE_ENV=production`
    - Optional: `METRICS_TOKEN=<openssl rand -base64 24>` (≥ 16 chars), `ANALYTICS_RETENTION_DAYS=90`, `CLAUDE_MODEL=claude-sonnet-4-5-20250929`
  - Notes: Do NOT add `PORT` (Railway injects). Do NOT add `SENTRY_*` (Week 2 spec). Do NOT add `RESEND_API_KEY` or `QUICKBOOKS_*` (Week 3 / Week 6 specs).

- [ ] Task 10: Populate Vercel environment variables
  - File: Vercel dashboard → Project → Settings → Environment Variables
  - Action: Add for "Production" environment only (not Preview/Development):
    - `API_INTERNAL_URL=https://<railway-service>.up.railway.app` (or `https://api.{DOMAIN}` if custom subdomain from Task 7)
    - `JWT_SECRET=<same as Task 8, identical to Railway value>`
    - `APP_URL=https://{DOMAIN}`
    - `NODE_ENV=production`
  - Notes: Absolute rule — no DB URLs, no Claude key, no Stripe secrets on Vercel. If any secret leaks into client-side JS bundle via misnamed `NEXT_PUBLIC_*`, remove immediately.

- [ ] Task 11: Configure Google OAuth production redirect URI
  - File: none (Google Cloud Console)
  - Action: **Defer until Task 14 confirms Vercel TLS + domain live** (see Decision #17). Once `https://{DOMAIN}` resolves and serves valid TLS, Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client → Edit. Add `https://{DOMAIN}/callback` to "Authorized redirect URIs". Keep existing `http://localhost:3000/callback` for dev. Save.
  - Notes: Scopes (`openid email profile`) do NOT trigger app verification. Publishing status can remain "Testing" or "In production" — both work for basic scopes.

- [x] Task 11a: Audit session cookie flags for cross-subdomain correctness
  - File: `apps/api/src/services/auth/tokenService.ts` (read-only verification, not a modification unless flags are wrong)
  - Action: Verify the cookie-setting code emits cookies with `Domain=.{DOMAIN}`, `SameSite=Lax`, `Secure=true`, `HttpOnly=true`, `Path=/` in production. The API runs on `api.{DOMAIN}` and issues cookies that must be readable by Next.js `proxy.ts` on `{DOMAIN}`. If current code does NOT set `Domain=.{DOMAIN}`, cookies are host-only to `api.{DOMAIN}` and the web app cannot verify sessions. Fix if incorrect.
  - Notes: This is a prerequisite for AC 9 (OAuth round-trip) to pass in production. Local docker-compose works because everything shares `localhost`; production does not. Verify before Task 12 deploy.

**Phase 5 — First deploy**

- [ ] Task 12: First Railway deploy + health verification
  - File: none (Railway triggers deploy on main branch push or manual trigger)
  - Action: Trigger manual deploy in Railway UI. Watch build logs for: (a) `Dockerfile.api` multi-stage build completes, (b) entrypoint runs migrations successfully, (c) seed runs successfully, (d) `API server started` log from Pino, (e) HEALTHCHECK passes. Curl from local: `curl -s https://<railway-url>/health/ready | jq`. Expect 200 with `{"status":"ok","services":{"database":{"status":"ok",…},"redis":{"status":"ok",…}}}`.
  - Notes: If migration fails, check `DATABASE_ADMIN_URL` has correct role and password. If Redis fails, check `REDIS_URL` uses `rediss://` (TLS) not `redis://`. If Zod rejects env, Railway logs will show exact var and reason — fix in Task 9 and redeploy.

- [~] Task 12a: Investigate Railway SSE + proxy behavior + verify `trust proxy` hop count (code change to `trust proxy: 2` shipped; runtime header-count verification and Railway streaming-tier check deferred to user-executed Phase 5)
  - File: none (context7 lookup + Railway docs + runtime test)
  - Action: Before wiring DNS (Task 7 is done; this is a Railway-side check), query context7 for current Railway streaming/timeout limits on the deployed plan. Verify there is no platform-level cap < 60s on streaming responses. If the hobby tier has a 30s request timeout, upgrade to Developer/Pro plan BEFORE Task 13 + Task 14. Also inspect a request's `X-Forwarded-For` header via a temporary debug endpoint or Railway log tail (`railway logs --service api | grep X-Forwarded-For`) — confirm the hop count matches Decision #15 (expected: 1 for direct Railway, 2 for Vercel-routed). Update `trust proxy` value in `apps/api/src/index.ts` if measured count differs.
  - Notes: Addresses F5 + F6. This task is a prerequisite for AC 11 (SSE end-to-end) and any rate-limiting correctness. Do it before first customer traffic touches the box.

- [ ] Task 13: Stripe webhook registration + secret rotation
  - File: Stripe dashboard + Railway dashboard
  - Action: Stripe dashboard → Developers → Webhooks → Add endpoint. URL: **`https://api.{DOMAIN}/webhooks/stripe`** (direct to Railway, bypassing Vercel — see Decision #2). Events to listen: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `checkout.session.completed`. Copy the generated signing secret (starts with `whsec_`). Update Railway's `STRIPE_WEBHOOK_SECRET` env var with this value. Redeploy API. After redeploy, use Stripe's "Send test webhook" feature on the endpoint to verify signature verification succeeds.
  - Notes: Two-phase because webhook URL must be reachable before Stripe will accept it — must happen AFTER Task 12 (Railway API live) but does NOT depend on Task 14 (Vercel). Direct-to-Railway eliminates the raw-body preservation uncertainty that Vercel's `/api/:path*` rewrite would introduce. Stripe's test-webhook feature in step 2 is a signature-verification proof — if it succeeds, AC 10 for the real checkout flow will succeed.

- [ ] Task 14: First Vercel deploy + BFF proxy verification
  - File: none (Vercel triggers on main branch push or manual trigger)
  - Action: Trigger deploy in Vercel UI. Watch build logs for: Next.js build success, no Sentry warnings (expected — token not set yet). Once deployed, verify Vercel assigned the Production domain. Add custom domain `{DOMAIN}` + `www.{DOMAIN}` in Vercel → Settings → Domains. Wait for TLS cert issuance. Curl `https://{DOMAIN}/` — expect 200 with landing page HTML. Curl `https://{DOMAIN}/api/health/ready` — expect 200 (proves BFF rewrite hits Railway).
  - Notes: Vercel cert issuance typically takes < 5 minutes once DNS propagates. If cert fails, disable Cloudflare proxy (orange cloud) on the apex + www records (DNS-only mode).

**Phase 6 — Smoke tests**

- [ ] Task 15: Execute full smoke-test checklist against production
  - File: none (manual verification)
  - Action: Run every item in smoke-test checklist from "In Scope" section. Document results in `docs/first-production-deploy-log.md` (new file). For each failing check, file an issue or fix + redeploy.
  - Notes: If Stripe still in test mode (Task 2 not yet approved), skip the "Stripe live webhook" check; all other checks must pass. Re-run the Stripe check on the deploy immediately after Stripe approval.

- [ ] Task 16: Validate observability bridge
  - File: none (local terminal)
  - Action: Install Railway CLI (`brew install railwayapp/railway/railway`) and Vercel CLI (`pnpm add -g vercel`). Auth both (`railway login`, `vercel login`). Tail logs: `railway logs --service api` and `vercel logs --follow <deployment-url>`. Trigger a request and confirm log entries appear in real time.
  - Notes: Document exact commands in the deploy runbook (Task 19). This is the observability bridge before Sentry lands in Week 2.

**Phase 7 — Stability iteration + automation**

- [ ] Task 17: Iterate manual deploys 2–5 as needed
  - File: various (whatever triggered the redeploy — usually env var fixes or DNS tweaks)
  - Action: Push fixes to `main`, trigger manual redeploy on both Railway and Vercel, re-run smoke test subset. Repeat until two consecutive deploys go green without intervention.
  - Notes: Expected friction points: env var typos, Stripe webhook secret sync after switching test→live, OAuth redirect URI typo, DNS cache issues. Budget 2–3 days for this iteration band.

- [x] Task 18: Add `deploy` job to GitHub Actions
  - File: `.github/workflows/ci.yml`
  - Action: Append new job `deploy` after `docker-smoke`. Trigger: `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`. Steps: (a) trigger Railway deploy via `curl -X POST -H "Authorization: Bearer ${{ secrets.RAILWAY_TOKEN }}" https://backboard.railway.app/graphql/v2 …`, (b) trigger Vercel deploy via `curl -X POST ${{ secrets.VERCEL_DEPLOY_HOOK_URL }}`. Both should be `needs: docker-smoke`. Add repo secrets: `RAILWAY_TOKEN` (from Railway account → Tokens), `VERCEL_DEPLOY_HOOK_URL` (from Vercel project → Settings → Git → Deploy Hooks).
  - Notes: Do NOT block `deploy` on `test-api` (it's `continue-on-error: true` due to memory gap). Add explicit `needs: [docker-smoke]` to avoid accidental main-branch deploys if earlier stages are skipped.

- [ ] Task 19: Validate auto-deploy on merge
  - File: any trivial change (e.g., add a blank line to README)
  - Action: Open a PR with a trivial change, merge to main, watch Actions. Confirm `deploy` job runs only after all previous stages pass. Confirm Railway + Vercel both redeploy. Confirm smoke test `/health/ready` still 200 after auto-deploy.
  - Notes: If deploy fires but one service fails, do NOT rollback automatically. Manual intervention keeps the blast radius small while pipeline is young.

**Phase 8 — Documentation**

- [~] Task 20: Update README with production URL + deploy badge (placeholder in place; real URL swap deferred to post-Task 14)
  - File: `README.md`
  - Action: Add production URL link near the top (under tagline). Add GitHub Actions deploy badge: `![Deploy](https://github.com/CoreyStevensDev/saas-analytics-dashboard/actions/workflows/ci.yml/badge.svg?branch=main)`. Keep existing clone-and-run section — local dev remains the quick-start path.
  - Notes: The badge is cosmetic signaling — it tells hiring managers the project is actively maintained and deployed, not just working locally.

- [x] Task 21: Check off completed items in deployment-roadmap.md
  - File: `docs/deployment-roadmap.md`
  - Action: In "Deploy Checklist" section, strikethrough or mark `[x]` for every completed item: domain config, Postgres + roles, Redis, env vars, Stripe switch, OAuth URI, migrations run, `/health` verification, smoke tests. Leave unfinished items (Sentry setup, AI cost monitoring window) as `[ ]` with a comment linking to the follow-up spec.
  - Notes: The roadmap becomes the persistent record of "what got done." Future reviewers trace the path by scanning the checklist.

- [x] Task 22: Write the deploy runbook
  - File: `docs/deploy-runbook.md` (new file)
  - Action: One-page doc with four sections — (1) "How to deploy" (manual trigger steps + auto-deploy behavior), (2) "How to rollback" (Neon branch restore, Railway/Vercel rollback buttons), (3) "How to observe" (Railway CLI + Vercel CLI log-tail commands), (4) "How to rotate secrets" (JWT_SECRET, Stripe keys, Claude key — without downtime).
  - Notes: This is the artifact the Week 2 Sentry spec plugs into. The observability section gets replaced when Sentry is active.

### Acceptance Criteria

- [ ] AC 1: Given a domain is purchased at Cloudflare, when DNS records are configured, then `dig {DOMAIN} A` and `dig www.{DOMAIN} CNAME` resolve to Vercel's DNS targets within 24 hours.

- [ ] AC 2: Given Neon project exists with both roles, when `psql` connects using `DATABASE_URL` as `app_user`, then `SELECT current_user;` returns `app_user` AND `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;` returns `(false, false)` (app_user is neither superuser nor RLS-bypassing).

- [ ] AC 3: Given Neon project exists with both roles, when `psql` connects using `DATABASE_ADMIN_URL` as `app_admin`, then `SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user;` returns true.

- [ ] AC 4: Given all Railway env vars are populated, when Railway attempts to build the API image, then the build succeeds and the deployed container boots without Zod validation errors (no "Missing or invalid environment variables" stack trace in logs).

- [ ] AC 5: Given the API is running on Railway, when the migration entrypoint runs on first boot, then the Drizzle migration completes successfully and `SELECT count(*) FROM pg_tables WHERE schemaname = 'public';` returns ≥ 11 (expected table count from schema).

- [ ] AC 6: Given the API is running on Railway, when the seed entrypoint runs on first boot, then the seed completes successfully and `SELECT count(*) FROM users WHERE email = 'demo@example.com';` returns 1.

- [ ] AC 7: Given the API is running on Railway, when `curl https://<railway-url>/health/ready` is issued, then the response is HTTP 200 with JSON body `{"status":"ok","services":{"database":{"status":"ok",…},"redis":{"status":"ok",…}}}`.

- [ ] AC 8: Given Vercel is configured with `API_INTERNAL_URL` pointing at Railway, when `curl https://{DOMAIN}/api/health/ready` is issued, then the response matches AC 7 (proves BFF rewrite is functional and Vercel → Railway routing works).

- [ ] AC 9: Given Google OAuth is configured with production redirect URI, when a user visits `https://{DOMAIN}/login` and clicks "Continue with Google", then they are redirected to Google's consent screen, complete consent, and land back on the dashboard authenticated. `SELECT count(*) FROM users WHERE created_at > NOW() - INTERVAL '5 minutes';` returns 1 in Neon.

- [ ] AC 10: Given Stripe live mode is active and webhook is registered, when a test customer completes the Stripe live checkout flow, then `checkout.session.completed` webhook fires against `https://{DOMAIN}/api/webhooks/stripe`, the Express handler verifies the signature successfully (no `INVALID_SIGNATURE` log), and `SELECT status FROM subscriptions WHERE user_id = <test-user>;` returns `active` within 30 seconds.

- [ ] AC 11: Given a Pro-tier user logs in and uploads a CSV, when they view the dashboard, then the AI summary SSE stream opens, chunks arrive at the browser within 2s TTFT, the full summary completes within 15s, and no `Connection closed` error appears in Railway logs (proves `keepAliveTimeout=20s` + Railway proxy accommodate SSE streams).

- [ ] AC 12: Given the CAN-SPAM unsubscribe endpoint is deployed, when the production URL `https://{DOMAIN}/unsubscribe?token=<valid-token>` is visited, then the request returns HTTP 200, marks the user's digest preference as unsubscribed, and renders a confirmation page. (Validates commit `c5b5c32` one-click unsubscribe works in prod.)

- [ ] AC 13: Given a user with an invite token, when they visit the production invite acceptance URL, then the invite flow completes and they are added to the correct org with the correct role.

- [ ] AC 14: Given a deploy has shipped a bad commit, when the engineer clicks "Rollback" in the Railway/Vercel dashboard, then the previous deployment is promoted back to production within 60 seconds and `/health/ready` returns to 200.

- [ ] AC 15: Given a database schema error must be rolled back, when the engineer restores a Neon branch to a pre-migration checkpoint, then the restored branch becomes the active production DB and the app reconnects without data loss of pre-checkpoint data.

- [ ] AC 16: Given the GitHub Actions deploy job is wired, when a PR merges to `main`, then the `deploy` job runs only after `docker-smoke` passes, fires the Railway deploy hook, fires the Vercel deploy hook, and the next `/health/ready` check against the production URL returns 200.

- [ ] AC 17: Given the deploy runbook is written, when a fresh engineer needs to deploy, rollback, or tail logs, then the runbook contains the exact command to run for each operation without any external lookup required.

- [ ] AC 18: Given the Stripe `.refine()` check exists in `config.ts`, when a production deploy accidentally uses `sk_test_*` with `NODE_ENV=production`, then Railway boot fails fast with Zod validation error citing `STRIPE_SECRET_KEY`, preventing a broken-payment deploy from going live.

- [ ] AC 19: Given `JWT_SECRET` must match between Vercel and Railway, when Vercel's `proxy.ts` verifies a JWT issued by the Railway API, then `jwtVerify` succeeds using the same `JWT_SECRET`, proving both environments share the identical secret.

- [ ] AC 20: Given dataset is seeded in production, when an unauthenticated user visits `https://{DOMAIN}/dashboard`, then the dashboard loads without auth redirect (dashboard is public per `proxy.ts` matcher), charts render with seed data, and the AI summary shows the pre-cached content.

- [ ] AC 21: Given Stripe signature verification requires the raw request body, when Stripe's "Send test webhook" feature is invoked against `https://api.{DOMAIN}/webhooks/stripe` from the Stripe dashboard, then the API logs show successful signature verification (no `INVALID_SIGNATURE` warning) and responds with `{"received": true}`. Proves the direct-to-Railway path works before real webhook traffic hits it.

- [ ] AC 22: Given AI usage quotas exist (free tier: 3/month, pro tier: 100/month), when a free-tier user exceeds 3 `/ai-summary` requests in a calendar month, then the 4th request returns HTTP 402 with `QuotaExceededError` code. Validates production quota enforcement is live (addresses F17 — prevents runaway Claude costs).

- [ ] AC 23: Given rate limiter is configured and connected to Upstash Redis, when a single IP issues 20 rapid-fire requests to `/auth/google/start` (rate-limited to 5/min), then requests 6+ receive HTTP 429 with `Retry-After` header. Validates rate limiter is firing in production against the real Upstash instance (addresses F12).

- [ ] AC 24: Given migration advisory lock is wired, when two API container boots race on first startup, then exactly one runs the migration and the other waits for the lock to release. Validates the advisory lock blocks rather than dual-runs (addresses F8). Tested locally by running two `tsx src/db/migrate.ts` processes simultaneously against a fresh DB.

- [ ] AC 25: Given session cookies must be readable across `{DOMAIN}` and `api.{DOMAIN}`, when the API issues a cookie during OAuth callback, then the `Set-Cookie` header includes `Domain=.{DOMAIN}; SameSite=Lax; Secure; HttpOnly; Path=/` and the cookie is readable by Next.js `proxy.ts` on `{DOMAIN}` during protected route access. Validates F10 fix in Task 11a.

- [ ] AC 26: Given the Sentry wiring is dormant but ready, when Week 2 Sentry activation lands, then `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` env vars populate in Vercel (build) + Railway (runtime) and next deploy uploads source maps successfully. Tracked as a follow-up — addresses F14's "silently dormant forever" concern by making activation a measurable Week 2 outcome.

## Additional Context

### Dependencies

- Commit `bfa7b40` — Sentry source-map upload wired in `next.config.ts` + `Dockerfile.web`. Dormant until `SENTRY_AUTH_TOKEN` is set; upload auto-skips when absent. No blocker for this spec.
- Commit `d0e950e` — Config rejects `sk_test_` Stripe keys in production. This deploy MUST use `sk_live_` keys or Zod validation fails fast at Railway boot.
- Dataset management (2026-04-15) — Multi-dataset support shipped; no migration gap.
- Post-Epic 7 hardening (2026-04-10) — All 11 retro action items resolved, including graceful shutdown, AI quota, dataset row limit, metrics, status sync script.

### Risks

- **Stripe live-mode review queue** — Stripe manually reviews live-mode activation requests, and AI-powered financial analytics is the kind of business description that triggers deeper review. Expected: 1–5 business days. Mitigation: submit Day 1, build the rest of the stack in parallel, swap keys when approval lands. **Fallback if approval > 5 days** = "launch-without-live-payments": launch the rest of the stack (dashboard, CSV upload, AI summary, invites, sharing, email digest) with Stripe endpoints returning a "payments coming soon" banner, deferring Stripe deploy to a dedicated follow-up once approval lands. **Do NOT toggle `NODE_ENV` or disable the Zod `sk_test_` refine check** — that safety net exists precisely to catch the footgun the workaround would introduce.
- ~~**Google OAuth app verification**~~ — **RESOLVED**. Step 2 confirmed `GOOGLE_SCOPES = 'openid email profile'` in `packages/shared/src/constants/index.ts`. These are basic scopes and do not trigger Google's app-verification flow. Adding the production redirect URI in Google Cloud Console is a dashboard edit, not a multi-week review.
- **Railway streaming limits** — Railway plans may enforce request timeouts that break long-lived SSE. Mitigation: verify tier limits in Step 2 investigation; upgrade plan if needed before first deploy.
- **DNS propagation window** — Domain DNS can take up to 48 hours to propagate globally. Mitigation: buy domain and set DNS records first; provision everything else while DNS propagates.
- **Solo dev critical path** — 16-day target assumes no interruptions. One sick day or day-job crunch slips the timeline. Mitigation: 3-day buffer already baked into 2026-05-04 target. Any further slip is communicated, not absorbed.

### Testing Strategy

This spec is primarily configuration and infrastructure — no new code paths get exercised by unit or integration tests. The existing test suite (Vitest + Playwright + seed-validation + docker-smoke) continues to run via CI and must remain green throughout. Testing effort for this spec is concentrated in **manual production smoke tests** and **automated post-deploy verification**.

**Unit tests** — No new unit tests. Existing suite (Vitest for `apps/api`, `apps/web`, `packages/shared`) must remain green. CI stage `test-shared-web` is a hard gate; `test-api` is `continue-on-error: true` due to known GHA runner memory ceiling (per comment at `.github/workflows/ci.yml:56`).

**Integration tests** — No new integration tests. Existing API-level integration tests in `apps/api/src/routes/*.test.ts` cover auth, invites, subscriptions, sharing, digest preferences, admin. These run via `apps/api/vitest.config.ts` in node environment.

**E2E tests** — Existing Playwright suite runs via CI against docker-compose production build (`docker-compose.ci.yml`). These validate the Dockerfile + entrypoint + seed path — the same paths Railway uses. If CI E2E stays green, the deploy pipeline has high confidence.

**Seed validation** — `scripts/validate-seed.ts` runs in CI stage `seed-validation`. Validates curation pipeline output against a deterministic snapshot (no LLM call). Catches regressions in the computation layer without incurring Claude API cost. Keep green.

**Docker smoke** — `scripts/smoke-test.sh` runs in CI final stage. Validates the full container stack comes up, migrations run, seed runs, health endpoint responds. This is the closest CI analog to production; treat it as the pre-deploy gate.

**Manual production smoke** — Executed after Task 12 (first Railway deploy) and Task 14 (first Vercel deploy), documented per the smoke-test checklist in "In Scope" section and formalized as AC 1 through AC 20. Each deploy iteration (Task 17) runs a subset focused on what changed.

**Post-deploy auto-verification** — Task 19 adds a final Actions step after the deploy job: curl `https://{DOMAIN}/health/ready` and fail the job if response is not 200. This is the poor-man's production monitoring until Sentry lands in Week 2.

**Rollback drill (one-time)** — Before closing the spec, perform a deliberate rollback drill on Railway (promote previous deployment) and Neon (restore branch to checkpoint). AC 14 + AC 15 verify this works. Do this once — proves the rollback path exists so you're not learning it under pressure during an actual incident.

### Notes

- Deployment roadmap (`docs/deployment-roadmap.md`) is the primary input — ~70% of this spec is already documented there.
- BMAD convention: spec is "Ready for Development" only when every task has a file path + specific action, every AC is Given/When/Then, and a fresh dev agent can execute without reading workflow history.
- Target completion date: **2026-05-04** (16 days, includes 3-day buffer). Critical-path tasks (domain registration, Stripe live-mode application, Google OAuth scope verification) must be front-loaded on Day 1 because they are async and queue-bound.
- Stress-tested via Party Mode 2026-04-18 — Architect, PM, Dev, QA perspectives. 10 findings applied to Overview, Technical Preferences, Scope, Risks, and Notes sections.
- Rollback strategy: Neon branch restore for DB state; Railway + Vercel have "rollback to previous deployment" buttons for app code. Documented as acceptance criterion, not a code artifact.
- Pre-Sentry observability (Week 1 → Week 2 bridge): Railway CLI (`railway logs`) + Vercel CLI (`vercel logs <deployment-url>`) provide real-time log tailing. Deploy runbook (to be written in Step 3) includes both commands with a one-line crisis-mode cheat sheet.

### Adversarial Review — Known Gaps (deferred, tracked)

The 2026-04-18 Adversarial Review surfaced 20 findings. 14 were addressed directly in this spec (F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F13, F14, F15, F16, F17). The following 6 are deferred with explicit disposition:

- **F11 — AC 9 writes real Google users to prod DB during smoke test**. Disposition: accepted. Smoke-test users are real accounts that can log in; this is the happy path, not a bug. If it becomes noise, tag smoke-test users via an `is_smoke_test` column in a follow-up and filter out of analytics. Do NOT add a cleanup script — deleting real logged-in users is worse than leaving them.
- **F12 — Rate limiter firing in production is now covered by new AC 23**. Partially addressed. If AC 23 cannot be executed in the smoke pass (e.g., because the rate-limit windows are longer than the test session tolerates), log the gap and execute a separate rate-limit drill post-deploy.
- **F18 — No Playwright E2E against real prod URL**. Disposition: deferred. Adding prod-URL E2E to CI would require cross-network Playwright execution and fresh test accounts per run. Docker-compose E2E catches > 90% of what prod E2E would catch. Revisit when quarterly incident pattern shows prod-specific breakage.
- **F19 — Task 18 Railway GraphQL deploy trigger is fire-and-forget**. Disposition: accepted for Day 1. The GHA job's "success" means "deploy triggered successfully," not "deploy succeeded." Phase 7 includes manual smoke verification, which is the real gate. Upgrade to polling post-launch if stability warrants it.
- **F20 — `api` subdomain ambiguity** — **RESOLVED** by Decision #2 revision (api subdomain now required, not optional). Moving from deferred to resolved.
- **F4 — JWT rotation limitation** — single-key rotation forces re-login. Documented in Task 8 notes and deploy runbook as an accepted limitation. Grace-period rotation is a future enhancement tracked outside this spec.

**Pattern**: Each deferred finding has an explicit disposition. No finding is "we'll get to it" without a concrete trigger or a stated accept-the-tradeoff rationale. This is the difference between a living backlog and a silent technical debt accumulator.
