---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 1
research_type: 'technical'
research_topic: 'Full-stack technical evaluation for SaaS Analytics Dashboard'
research_goals: 'Evaluate frameworks/libraries against PRD requirements, research LLM integration patterns, analyze auth implementation options, evaluate deployment architecture, research curation logic approaches'
user_name: 'Corey'
date: '2026-02-17'
web_research_enabled: true
source_verification: true
---

# Technical Research: Full-Stack Evaluation for SaaS Analytics Dashboard

**Date:** 2026-02-17
**Author:** Corey
**Research Type:** Technical

---

## Technical Research Scope Confirmation

**Research Topic:** Full-stack technical evaluation for the SaaS Analytics Dashboard — framework/library selection, LLM integration patterns, data processing pipeline, and deployment architecture.

**Research Goals:**
1. Evaluate specific frameworks and libraries against PRD requirements (React vs alternatives, charting libraries, CSV parsing, SSE implementation)
2. Research LLM integration patterns — API design, prompt engineering for curated stats, streaming response handling
3. Analyze authentication implementation options (JWT + Google OAuth + refresh rotation)
4. Evaluate deployment architecture (Docker, CI/CD, database selection)
5. Research curation logic approaches — statistical novelty detection, relevance ranking algorithms

**Technical Research Scope:**

- Architecture Analysis — design patterns, frameworks, system architecture for hybrid intelligence (local stats + LLM interpretation)
- Implementation Approaches — CSV processing pipelines, statistical computation, curation logic algorithms
- Technology Stack — React/Next.js, Node/Express, PostgreSQL, charting libraries (Recharts/Nivo/Chart.js), LLM SDKs
- Integration Patterns — SSE streaming, LLM API integration, OAuth flows, Stripe webhooks
- Performance Considerations — CSV upload limits, stats computation speed, TTFT < 2s for AI summaries, mobile-first responsive patterns

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Comprehensive technical coverage with architecture-specific insights

**Scope Confirmed:** 2026-02-17

---

## Executive Summary

This technical research evaluates the full-stack technology landscape for the SaaS Analytics Dashboard — an AI-powered analytics platform that explains business data in plain English for small business owners. The research was conducted against a validated PRD with 41 functional requirements, 27 non-functional requirements, and a clear MVP-Core/MVP-Complete tier structure.

The global AI SaaS market reached $22.21 billion in 2025 and is projected to grow at 36.59% CAGR, with 45% of North American SMEs expected to integrate cloud-based AI by 2025. This project enters a market where AI-powered analytics is rapidly becoming a baseline expectation — making the technology stack decisions particularly consequential for both build velocity and portfolio differentiation.

After evaluating 30+ technologies, 7 integration patterns, 7 architectural patterns, and comprehensive implementation approaches across 60+ current sources, this research reaches five core conclusions:

**Key Technical Findings:**
- **Context engineering is the competitive moat** — The 3-stage pipeline (stats → curation → structured prompt) determines AI output quality more than LLM choice. The curation algorithm's novelty/actionability/specificity scoring is custom code that cannot be replicated by switching LLM providers.
- **The technology stack is mature and low-risk** — Every primary technology recommendation (Next.js 15, Express.js, PostgreSQL, Drizzle, Stripe, Docker Compose) has Very High or High confidence. No experimental technologies in the critical path.
- **Hybrid intelligence architecture is both a quality and cost strategy** — Local stats computation + curated LLM context keeps per-generation costs at ~$0.003 while producing higher-quality outputs than raw data dumps.
- **Testing strategy must work around React 19 RSC limitations** — Async Server Components can't be unit-tested with Vitest yet, requiring a deliberate Vitest/Playwright pyramid split.
- **Solo developer velocity is achievable** — The monorepo structure, Docker-first development environment, and CI pipeline are designed for 6-8 week delivery by a single developer.

**Top 5 Recommendations:**
1. Start with Docker Compose dev environment + CI pipeline — foundation for everything else
2. Build the shared types package (Zod schemas) before any feature work — prevents API contract drift
3. Implement the curation algorithm early — it's the hardest engineering problem and the product's differentiator
4. Use Drizzle `migrate` (not `push`) for reproducible deployments in Docker
5. Design seed data with deliberate anomalies — it's the demo script that drives conversion

## Table of Contents

1. [Technical Research Scope Confirmation](#technical-research-scope-confirmation)
2. [Executive Summary](#executive-summary)
3. [Technology Stack Analysis](#technology-stack-analysis)
   - Frontend Framework: Next.js (App Router)
   - Charting Library: Recharts
   - Backend Framework: Express.js
   - Database: PostgreSQL
   - ORM: Drizzle ORM
   - CSV Parsing: PapaParse
   - Statistical Computation: simple-statistics
   - LLM Integration: Anthropic Claude API
   - Authentication: Custom JWT + Passport.js
   - Payments: Stripe
   - UI Styling: Tailwind CSS + shadcn/ui
   - Deployment: Docker Compose
   - Technology Stack Summary
4. [Integration Patterns Analysis](#integration-patterns-analysis)
   - SSE Streaming: LLM Response Pipeline
   - Frontend-Backend Communication: BFF Proxy Pattern
   - Authentication Flow: OAuth + JWT + Refresh Rotation
   - Stripe Webhook Integration
   - Rate Limiting: Express + Redis
   - Claude API Integration: Provider Abstraction Layer
   - Data Upload Pipeline
5. [Architectural Patterns and Design](#architectural-patterns-and-design)
   - System Architecture: Layered Modular Monolith
   - Multi-Tenant Data Architecture: Shared Schema with RLS
   - Context Engineering: Curation-to-Prompt Pipeline
   - Frontend Architecture: RSC-First Dashboard
   - Seed Data Architecture
   - Security Architecture: Defense-in-Depth
   - Data Architecture: Separation of Raw, Computed, and Curated
6. [Implementation Approaches and Technology Adoption](#implementation-approaches-and-technology-adoption)
   - Project Structure and Organization
   - Testing Strategy (Vitest + Playwright)
   - Database Migration Strategy
   - CI/CD Pipeline Design
   - Development Environment (Docker Compose)
   - Error Handling and Logging
   - Cost Optimization and Resource Management
   - Risk Assessment and Mitigation
7. [Technical Research Recommendations](#technical-research-recommendations)
   - Implementation Roadmap
   - Technology Stack Recommendations Summary
   - Critical Implementation Priorities
8. [Research Conclusion](#research-conclusion)
   - Research Goals Achievement
   - Strategic Technical Impact
   - Next Steps

---

## Technology Stack Analysis

### Frontend Framework: Next.js (App Router)

**Recommendation: Next.js 15 with App Router** over React SPA (Vite) or alternatives.

Next.js is the default choice for modern React applications in 2026, and the App Router with React Server Components (RSC) is particularly well-suited to the SaaS analytics dashboard:

_Why Next.js over React SPA:_ For a dashboard behind authentication, a React SPA (Vite) would be viable — SEO doesn't matter for authenticated pages. However, Next.js provides critical advantages: (1) **React Server Components** allow the sidebar, header, and data tables to render on the server with zero client JS, while only interactive elements (filters, chart controls, AI chat) ship JavaScript to the browser — directly reducing bundle size for data-heavy dashboard pages. (2) **API Routes** handle webhooks (Stripe), OAuth callbacks, and SSE streaming natively without a separate backend process in development. (3) **Turbopack** (default in Next.js 15) provides 10x faster HMR than Webpack, powering 90%+ of Vercel deployments in 2026.

_Why not alternatives:_ Vue/Svelte have smaller ecosystems for the specific libraries needed (charting, auth, Stripe). The React ecosystem is unmatched for the SaaS dashboard use case.

_Architecture note:_ The PRD specifies a separate backend API (for Docker deployment, SSE streaming, and clear separation of concerns). Next.js serves as the frontend with its own API routes proxying to the backend where needed — **not** a monolithic Next.js full-stack app.

_Confidence: High_ — Next.js App Router is the industry standard for React-based SaaS in 2026.

_Sources: [SaM Solutions - React vs Next.js 2026](https://sam-solutions.com/blog/react-vs-nextjs/), [Strapi - React & Next.js in 2025 Modern Best Practices](https://strapi.io/blog/react-and-nextjs-in-2025-modern-best-practices), [DesignRevision - Next.js vs React 2026](https://designrevision.com/blog/nextjs-vs-react), [LaderaLabs - Best Tech Stack SaaS 2026](https://laderalabs.io/blog/best-tech-stack-saas-2026)_

### Charting Library: Recharts (Primary) with Nivo Consideration

**Recommendation: Recharts** as the primary charting library.

_Recharts strengths for this project:_ (1) **Component-based API** that integrates naturally with React — charts are JSX components, not imperative canvas calls. (2) **Ease of use** — minimal configuration to produce clean bar, line, and pie charts. The PRD specifies dashboard visualization as MVP-Core; Recharts gets to "good-looking charts" fastest. (3) **Built-in responsiveness and animations** — smooth transitions and tooltips out of the box. (4) **Moderate dataset performance** — suitable for CSV uploads up to the PRD's 25MB limit (thousands of rows, not millions).

_Nivo consideration:_ Nivo produces more visually striking charts with better theming support and offers canvas rendering for large datasets. It renders faster on initial load and handles large datasets better via canvas mode. However, it's significantly more verbose (30+ lines for minimal charts vs Recharts' ~10 lines) and has a steeper learning curve. **If chart aesthetics become a differentiator during UX design, Nivo is the upgrade path.**

_Chart.js:_ Not recommended. It's a canvas-based imperative library that doesn't integrate as naturally with React's declarative model. Customizing individual elements is harder than SVG-based libraries.

_Confidence: High_ for Recharts as starting point; Medium for whether a switch to Nivo becomes necessary.

_Sources: [LogRocket - Best React Chart Libraries 2025](https://blog.logrocket.com/best-react-chart-libraries-2025/), [Speakeasy - Nivo vs Recharts](https://www.speakeasy.com/blog/nivo-vs-recharts), [Embeddable - 8 Best React Chart Libraries 2025](https://embeddable.com/blog/react-chart-libraries), [Technostacks - 15 Best React Chart Libraries 2026](https://technostacks.com/blog/react-chart-libraries/)_

### Backend Framework: Express.js (with Fastify as Alternative)

**Recommendation: Express.js** for the backend API server.

_Why Express over Fastify/Hono:_ (1) **Ecosystem maturity** — Passport.js, Stripe SDK, and most Node.js middleware are Express-first. The PRD requires JWT + Google OAuth + Stripe webhooks; Express has battle-tested middleware for all three. (2) **Portfolio context** — Express is universally recognized by hiring managers and technical reviewers. Using it demonstrates competence with the industry standard. (3) **Single-developer velocity** — Express's massive documentation and Stack Overflow coverage means faster problem-solving when working solo.

_Why not Fastify:_ Fastify offers 2-3x better throughput in benchmarks and a modern plugin system. For a high-scale production SaaS, Fastify would be the better choice. For an MVP with < 1000 concurrent users, Express's ecosystem advantage outweighs Fastify's performance advantage. **If the project scales beyond MVP, Fastify migration is straightforward** (similar middleware patterns).

_Why not Hono:_ Hono is optimized for edge/serverless/multi-runtime deployment (Cloudflare Workers, Deno). The PRD specifies Docker deployment, not edge. Hono's ecosystem is still maturing for traditional server deployments. Infrastructure cost savings (~$7/mo vs Express ~$30/mo) are irrelevant at MVP scale.

_Confidence: High_ — Express is the safe, productive choice for a single-developer portfolio project.

_Sources: [Medium - Fastify vs Express vs Hono](https://medium.com/@arifdewi/fastify-vs-express-vs-hono-choosing-the-right-node-js-framework-for-your-project-da629adebd4e), [Level Up Coding - Hono vs Express vs Fastify 2025](https://levelup.gitconnected.com/hono-vs-express-vs-fastify-the-2025-architecture-guide-for-next-js-5a13f6e12766), [Better Stack - Hono vs Fastify](https://betterstack.com/community/guides/scaling-nodejs/hono-vs-fastify/)_

### Database: PostgreSQL

**Recommendation: PostgreSQL** — this aligns with the PRD decision and is strongly validated by current research.

_Why PostgreSQL:_ (1) **Analytics-native** — PostgreSQL's query planner and optimizer handle complex analytical queries (aggregations, window functions, CTEs) that the stats computation layer requires. One SaaS company reported migrating from MySQL to PostgreSQL because analytical queries took 45+ seconds in MySQL. (2) **Multi-tenant ready** — the PRD's org-first data model (`org_id` on every table) is naturally supported. Extensions like Citus provide sharding for Growth-tier scaling. (3) **JSON support** — JSONB columns handle flexible data structures (uploaded CSV schemas vary per user) without sacrificing query performance. (4) **Most popular among professional developers** — Stack Overflow 2025 survey shows PostgreSQL ahead of MySQL. (5) **Mature cloud hosting** — excellent support on all platforms (Neon, Supabase, AWS RDS, Railway).

_Confidence: Very High_ — PostgreSQL is the consensus choice for modern SaaS analytics applications.

_Sources: [Analytics Insight - PostgreSQL vs MySQL 2026](https://www.analyticsinsight.net/sql/postgresql-vs-mysql-which-database-is-better-in-2026), [TechGeeta - PostgreSQL for SaaS Startups 2026](https://techgeeta.com/blog/postgresql-for-saas-startups-2026), [Bytebase - Multi-Tenant Database Architecture](https://www.bytebase.com/blog/multi-tenant-database-architecture-patterns-explained/)_

### ORM: Drizzle ORM

**Recommendation: Drizzle ORM** over Prisma.

_Why Drizzle:_ (1) **SQL transparency** — Drizzle queries map closely to SQL, which matters for the stats computation layer where you need predictable, optimized queries (aggregations, group-bys, window functions). (2) **Zero binary dependencies** — ~7kb minified+gzipped vs Prisma's Rust query engine. Faster cold starts, simpler Docker images. (3) **No generate step** — schema changes produce instant type updates vs waiting for `prisma generate`. For a solo developer iterating quickly, this DX improvement compounds. (4) **Up to 14x lower latency** for complex queries vs ORMs that fall victim to N+1 problems. (5) **Excellent PostgreSQL support** including Neon, Supabase integration.

_Why not Prisma:_ Prisma 7 (late 2025) eliminated the Rust engine, but Drizzle's SQL-close philosophy better serves the analytical query patterns this project needs. Prisma's abstraction layer is designed for CRUD-heavy apps; this project has significant analytical query requirements where SQL transparency is valuable.

_Risk acknowledgment:_ Drizzle has a smaller community than Prisma. For complex migration scenarios, Prisma's tooling is more mature. However, for a greenfield project with a single developer, Drizzle's lighter footprint and SQL alignment are stronger advantages.

_Confidence: High_ — Drizzle is the modern choice for SQL-transparent TypeScript ORMs in 2026.

_Sources: [Bytebase - Drizzle vs Prisma 2025](https://www.bytebase.com/blog/drizzle-vs-prisma/), [Better Stack - Drizzle vs Prisma](https://betterstack.com/community/guides/scaling-nodejs/drizzle-vs-prisma/), [DesignRevision - Prisma vs Drizzle 2026](https://designrevision.com/blog/prisma-vs-drizzle), [Makerkit - Drizzle vs Prisma 2026](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma)_

### CSV Parsing: PapaParse

**Recommendation: PapaParse** for CSV parsing on both client and server.

_Why PapaParse:_ (1) **Fastest CSV parser** in JavaScript benchmarks — parses 1M rows with 10 columns in ~5.5 seconds (quoted data). Outperforms csv-parse, csv-parser, and fast-csv. (2) **Browser + Node.js** — works in both environments, enabling client-side preview (show users their data before upload) and server-side processing (stats computation). (3) **Streaming API** — handles large files without loading the entire file into memory. Critical for the PRD's 25MB upload limit. (4) **Header detection and type inference** — automatically identifies column headers and data types, reducing the "zero-config" onboarding friction. (5) **Error handling** — graceful handling of malformed CSVs with per-row error reporting. (6) **No dependencies** — clean, lightweight addition to the bundle.

_Alternatives considered:_ csv-parse has more npm downloads (1.4M/week) but is slower. csv-parser is minimalistic with streaming-only API but also slower. fast-csv, despite the name, is the slowest in benchmarks.

_Confidence: Very High_ — PapaParse is the consensus recommendation for JavaScript CSV parsing.

_Sources: [LeanyLabs - JavaScript CSV Parsers Comparison](https://leanylabs.com/blog/js-csv-parsers-benchmarks/), [OneSchema - Top 5 JavaScript CSV Parsers](https://www.oneschema.co/blog/top-5-javascript-csv-parsers), [npm-compare - CSV Parsing Libraries](https://npm-compare.com/csv-parse,csv-parser,fast-csv,papaparse)_

### Statistical Computation: simple-statistics

**Recommendation: simple-statistics** for the stats computation layer, with stdlib as a reference for advanced methods.

_Why simple-statistics:_ (1) **Zero dependencies, 9.36kb gzipped** — lightweight enough for client-side computation if needed. (2) **Covers the essential methods** — mean, median, standard deviation, linear regression, correlation, z-scores, percentiles — these are the core computations the curation logic needs. (3) **Literate JavaScript** — the source code is designed to be readable, which matters for a portfolio project where code quality is evaluated. (4) **Browser + Node.js** — runs everywhere, consistent API.

_stdlib consideration:_ stdlib provides 3000+ mathematical and statistical functions including advanced methods (hypothesis testing, probability distributions, ML algorithms). It's significantly larger but could be valuable for Growth-tier features like predictive analytics. **Architecture should allow swapping or supplementing simple-statistics with stdlib for specific computations.**

_Architecture note for curation logic:_ The stats library computes raw statistical measures. The **curation layer** (the competitive moat) sits between the stats output and the LLM prompt — it ranks findings by "non-obviousness" (deviation from expected values, trend breaks, cross-metric correlations) and selects the most actionable ones. This layer is custom code, not a library.

_Confidence: High_ for simple-statistics as the starting point.

_Sources: [Simple Statistics](https://simple-statistics.github.io/), [stdlib.io](https://stdlib.io/), [Scribbler - Statistical Libraries in JavaScript](https://scribbler.live/2024/07/24/Statistical-Libraries-in-JavaScript.html)_

### LLM Integration: Anthropic Claude API

**Recommendation: Anthropic Claude API** as the primary LLM provider.

_Why Claude:_ (1) **200K token context window** — significantly larger than GPT-4 Turbo's 128K, providing headroom for curated stats context + system prompts + few-shot examples. (2) **Constitutional AI safety** — Claude's safety-first approach matters for a business tool that interprets financial data. Lower risk of hallucinated recommendations that could mislead business decisions. (3) **Excellent for business analysis** — Claude excels at "digging through long documents, reviewing financial reports, handling detailed customer support tickets where you can't afford to be wrong." This is precisely the interpretation use case. (4) **SSE streaming support** — Anthropic uses Server-Side Events natively, aligning with the PRD's SSE streaming requirement (TTFT < 2s). (5) **TypeScript SDK** — official `@anthropic-ai/sdk` with streaming support.

_OpenAI as fallback:_ OpenAI's GPT-4 Turbo has lower latency (43ms vs 55ms p99) and a larger ecosystem. The architecture should abstract the LLM provider behind an interface so switching between Claude and OpenAI (or using both) is a configuration change, not a code rewrite. This also enables A/B testing interpretation quality.

_Cost consideration:_ Claude Sonnet (the likely production model) is cost-effective for the 5 AI generations/minute/user rate limit in the PRD. At ~$3/M input tokens and ~$15/M output tokens, even heavy usage stays under $1/user/month.

_Confidence: High_ for Claude as primary; the abstraction layer makes this a reversible decision.

_Sources: [Ryz Labs - OpenAI vs Anthropic Claude 2026](https://learn.ryzlabs.com/llm-development/openai-api-vs-anthropic-claude-which-is-better-for-llms-in-2026), [Collabnix - Claude API Integration Guide 2025](https://collabnix.com/claude-api-integration-guide-2025-complete-developer-tutorial-with-code-examples/), [is4.ai - OpenAI API vs Anthropic API 2026](https://is4.ai/blog/our-blog-1/openai-api-vs-anthropic-api-comparison-2026-219)_

### Authentication: Custom JWT + Passport.js

**Recommendation: Custom JWT implementation with Passport.js** for Google OAuth strategy.

_Why custom JWT + Passport over NextAuth:_ (1) **Decoupled architecture** — NextAuth (Auth.js) tightly couples auth logic to the Next.js runtime. The PRD specifies a separate Express backend; Passport.js is Express-native middleware. (2) **Full control over JWT claims** — the PRD requires `role` in JWT claims for RBAC, httpOnly cookies for token storage, and refresh token rotation. Custom JWT implementation provides complete control over these security requirements. (3) **500+ strategies** — Passport's modular design supports Google OAuth today and any additional providers in the future.

_Implementation approach:_ (1) `passport-google-oauth20` for Google OAuth, (2) `jsonwebtoken` for JWT creation/verification, (3) Custom middleware for refresh token rotation, (4) httpOnly secure cookies for token storage (not localStorage).

_Why not Auth0/Supabase Auth:_ Third-party auth services add external dependencies and costs. For a portfolio project, implementing auth demonstrates competence. The PRD's auth risk fallback (defer FR3/FR4 if > 2 weeks) provides scope protection.

_Confidence: High_ — Passport + custom JWT is the battle-tested approach for Express backends.

_Sources: [Medium - Stop Using Passport for JWT](https://medium.com/@agentwhs/stop-using-passport-for-node-js-authentication-with-jwt-89e8971872b3), [SoftwareOnTheRoad - Node.js JWT Authentication](https://softwareontheroad.com/nodejs-jwt-authentication-oauth), [SuperTokens - NextAuth Alternatives](https://supertokens.com/blog/nextauth-alternatives)_

### Payments: Stripe

**Recommendation: Stripe** — industry standard for SaaS subscription billing.

_Key implementation patterns:_ (1) **Stripe Checkout + Customer Portal** — Stripe's hosted checkout handles PCI compliance; the Customer Portal lets users manage subscriptions without custom UI. (2) **Webhook-driven state management** — subscription state lives in Stripe; your database syncs via webhooks (`customer.subscription.created`, `.updated`, `.deleted`). Never trust client-side payment state. (3) **Trial periods** — `trial_period_days` parameter enables the freemium-to-trial-to-paid conversion flow. (4) **Signature verification** — all webhook payloads must be verified with the webhook secret. (5) **Retry handling** — Stripe retries failed webhooks for up to 3 days with exponential backoff; endpoint must return 200 quickly.

_Architecture note:_ The webhook endpoint should be idempotent (safe to process the same event multiple times) because Stripe may send duplicate events. Store the `event.id` and check before processing.

_Confidence: Very High_ — Stripe is the only serious option for SaaS subscription billing.

_Sources: [Stripe Docs - Build Subscriptions](https://docs.stripe.com/billing/subscriptions/build-subscriptions), [Stripe Docs - SaaS Subscriptions](https://docs.stripe.com/get-started/use-cases/saas-subscriptions), [Stripe Docs - Webhooks with Subscriptions](https://docs.stripe.com/billing/subscriptions/webhooks), [freeCodeCamp - Stripe Integration Best Practices](https://www.freecodecamp.org/news/stripe-and-node-js-4-best-practices-and-examples/)_

### UI Styling: Tailwind CSS + shadcn/ui

**Recommendation: Tailwind CSS 4 + shadcn/ui** component library.

_Why Tailwind + shadcn/ui:_ (1) **Copy-paste ownership** — shadcn/ui provides accessible, well-designed components (buttons, modals, forms, dropdowns, data tables) as code you own, not a dependency. This means full customization without fighting a library's opinions. (2) **Built on Radix UI** — accessible by default (keyboard navigation, screen readers, ARIA attributes) without extra work. (3) **65,000+ GitHub stars** — massive community, used by Vercel's own dashboard. (4) **Tailwind 4 integration** — native support with the latest Tailwind release. (5) **Dashboard components available** — shadcn/ui includes dashboard-specific components (sidebar, data table, charts integration) that directly serve this project's UI needs.

_Why not Material UI / Chakra UI:_ These are opinionated component libraries with their own styling systems. They conflict with Tailwind's utility-first approach and produce heavier bundles. shadcn/ui achieves the same result with lighter weight and more customization freedom.

_Confidence: Very High_ — Tailwind + shadcn/ui is the dominant React UI stack in 2026.

_Sources: [Untitled UI - 14 Best React UI Component Libraries 2026](https://www.untitledui.com/blog/react-component-libraries), [DesignRevision - shadcn UI Complete Guide 2026](https://designrevision.com/blog/shadcn-ui-guide), [Medium - Top 5 TailwindCSS UI Libraries 2025](https://medium.com/@HiteshSaha/build-smarter-with-tailwindcss-top-5-ui-libraries-compared-for-2025-1d3f70bb2a17)_

### Deployment: Docker Compose

**Recommendation: Docker Compose** for development and single-server production deployment.

_Why Docker Compose:_ (1) **PRD requirement** — "First-run 100% success on macOS (ARM+Intel) + Linux (Ubuntu 22.04+), Docker Engine 24+." Docker Compose is the only deployment tool that satisfies this. (2) **Multi-service orchestration** — frontend (Next.js), backend (Express), database (PostgreSQL), and Redis (for rate limiting) run as separate containers with health checks and dependency management. (3) **Environment parity** — development and production use the same container definitions with environment-specific overrides. (4) **Production-viable for MVP** — "Many successful applications run on a single server with Compose behind a reverse proxy like Traefik or nginx." At MVP scale (< 1000 users), this is more than sufficient.

_Architecture pattern:_ Separate `docker-compose.yml` (base), `docker-compose.dev.yml` (development overrides with hot reload), and `docker-compose.prod.yml` (production with restart policies, resource limits, health checks).

_Health checks:_ `pg_isready` for PostgreSQL, HTTP endpoint check for API server, `redis-cli ping` for Redis. Services use `depends_on` with `condition: service_healthy`.

_Confidence: Very High_ — Docker Compose is the standard for this deployment model.

_Sources: [Better Stack - Dockerizing Node.js](https://betterstack.com/community/guides/scaling-nodejs/dockerize-nodejs/), [OneUpTime - Docker Architecture for SaaS 2026](https://oneuptime.com/blog/post/2026-02-08-how-to-design-a-docker-architecture-for-saas-applications/view), [DevToolbox - Docker Compose Complete Guide 2026](https://devtoolbox.dedyn.io/blog/docker-compose-complete-guide), [DasRoot - Docker Compose Best Practices 2026](https://dasroot.net/posts/2026/01/docker-compose-best-practices-local-development/)_

### Technology Stack Summary

| Layer | Technology | Confidence |
|-------|-----------|------------|
| Frontend Framework | Next.js 15 (App Router) | High |
| Charting | Recharts (Nivo as upgrade path) | High |
| UI Styling | Tailwind CSS 4 + shadcn/ui | Very High |
| Backend Framework | Express.js | High |
| Database | PostgreSQL | Very High |
| ORM | Drizzle ORM | High |
| CSV Parsing | PapaParse | Very High |
| Statistical Computation | simple-statistics | High |
| LLM Provider | Anthropic Claude API | High |
| Authentication | Custom JWT + Passport.js | High |
| Payments | Stripe (Checkout + Portal + Webhooks) | Very High |
| Deployment | Docker Compose | Very High |
| Language | TypeScript (throughout) | Very High |

---

## Integration Patterns Analysis

### SSE Streaming: LLM Response Pipeline

**Pattern: Express SSE endpoint → Claude SDK streaming → chunked response to Next.js frontend**

This is the most architecturally critical integration in the project. The PRD requires TTFT < 2s and total AI response < 15s, delivered via Server-Sent Events.

_Server-Side Implementation:_ The Express backend exposes an SSE endpoint with specific headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`. The Anthropic TypeScript SDK provides two streaming approaches: (1) **High-level** `messages.stream()` with event emitters (`stream.on('text', callback)`) for simpler implementation, and (2) **Low-level** `messages.create({ stream: true })` returning an async iterable for fine-grained control. The high-level approach is recommended for MVP — it handles connection management and provides `stream.finalMessage()` for the complete response.

_Client-Side Implementation:_ The frontend uses the native `EventSource` API or `fetch` with `ReadableStream` to consume SSE. Each text chunk is appended to the AI summary component in real-time, creating the "thinking assistant" UX that market research identified as critical for user trust.

_Production Considerations:_ (1) **Heartbeats** — send a comment event (`:\n\n`) every 15 seconds to keep connections alive through proxies. (2) **Backpressure** — check if the write buffer is full before continuing writes. (3) **Timeouts** — implement a 15-second total timeout with SSE fallback to synchronous response (per PRD FR19). (4) **Error events** — send structured error events so the frontend can display user-friendly messages rather than silent failures.

_Library option:_ `better-sse` is a lightweight SSE library for Express that adds channel broadcasting, event buffering, and automatic keep-alive pings. Worth evaluating vs raw implementation.

_Confidence: High_ — SSE for LLM streaming is the industry standard pattern used by OpenAI, Anthropic, and all major LLM providers.

_Sources: [Upstash - SSE Streaming LLM Responses](https://upstash.com/blog/sse-streaming-llm-responses), [Apidog - Stream LLM Responses Using SSE](https://apidog.com/blog/stream-llm-responses-using-sse/), [Pockit - Streaming LLM Responses Web Guide](https://pockit.tools/blog/streaming-llm-responses-web-guide/), [Anthropic - Streaming Messages](https://platform.claude.com/docs/en/build-with-claude/streaming), [DeepWiki - Anthropic SDK Streaming Examples](https://deepwiki.com/anthropics/anthropic-sdk-typescript/7.1-streaming-examples)_

### Frontend-Backend Communication: BFF Proxy Pattern

**Pattern: Next.js API Routes as Backend-for-Frontend (BFF) proxy to Express API**

_Architecture:_ The frontend (Next.js) and backend (Express) are separate services in Docker. Next.js API routes (`app/api/.../route.ts`) act as a proxy layer — the browser never calls the Express API directly. This provides: (1) **Security** — API keys, internal URLs, and auth tokens are never exposed to the client. (2) **Data transformation** — responses can be shaped for frontend needs before reaching React components. (3) **Authentication forwarding** — the BFF layer attaches httpOnly cookies to upstream requests.

_Two proxy approaches:_
1. **Route Handlers** (recommended) — Each Next.js API route fetches from the Express backend, transforms data, and returns. More explicit, easier to debug, supports middleware logic.
2. **Rewrites configuration** — `next.config.js` rewrites `/api/:path*` to `http://backend:5000/:path*`. Simpler but loses the ability to transform responses or add logic.

_Recommended approach for this project:_ Route Handlers for authenticated/complex endpoints (AI generation, data upload, subscription management); Rewrites for simple pass-through endpoints (health checks, static config). This hybrid approach balances simplicity with control.

_Docker networking:_ In Docker Compose, the Next.js container reaches the Express container via service name: `http://backend:5000`. The frontend's `.env` stores `BACKEND_URL=http://backend:5000` for development, replaceable per environment.

_Confidence: High_ — BFF is the standard pattern for separated frontend/backend architectures.

_Sources: [Next.js - Building APIs](https://nextjs.org/blog/building-apis-with-nextjs), [Next.js - Backend for Frontend Guide](https://nextjs.org/docs/app/guides/backend-for-frontend), [Medium - BFF Pattern with Next.js API Routes](https://medium.com/digigeek/bff-backend-for-frontend-pattern-with-next-js-api-routes-secure-and-scalable-architecture-d6e088a39855)_

### Authentication Flow: OAuth + JWT + Refresh Rotation

**Pattern: Google OAuth → Passport.js → JWT pair (access + refresh) → httpOnly cookies → middleware verification**

_OAuth Flow:_
1. User clicks "Sign in with Google" → redirected to Google consent screen
2. Google callback returns authorization code to Express backend
3. `passport-google-oauth20` exchanges code for Google tokens
4. Backend creates/finds user in database, generates JWT pair
5. Access token (15-min expiry) + refresh token (7-day expiry) set as httpOnly secure cookies
6. Frontend receives user profile, no tokens exposed to JavaScript

_Refresh Token Rotation:_ When the access token expires, the frontend's BFF layer intercepts 401 responses and calls the refresh endpoint. The backend: (1) validates the refresh token, (2) issues a new access + refresh token pair, (3) **invalidates the old refresh token** (rotation). This ensures each refresh token is single-use — if a token is stolen, it can only be used once before detection. Token family tracking (a family ID linking all tokens in a rotation chain) enables detecting replay attacks and invalidating the entire family.

_JWT Claims Structure:_ `{ sub: userId, org_id: orgId, role: 'owner' | 'member' | 'viewer', iat, exp }`. The `org_id` and `role` in claims enable middleware-level RBAC without database lookups on every request.

_Security considerations:_ (1) httpOnly + Secure + SameSite=Strict cookies prevent XSS token theft. (2) CSRF protection via SameSite cookies + origin checking. (3) Google-specific: pass `access_type: 'offline'` and `prompt: 'consent'` to get refresh tokens from Google (Google only issues refresh tokens on first consent or explicit re-consent).

_Confidence: High_ — this is the standard secure auth pattern for Express + OAuth applications.

_Sources: [Passport.js - OAuth Documentation](https://www.passportjs.org/concepts/authentication/oauth/), [Google - OAuth 2.0 for APIs](https://developers.google.com/identity/protocols/oauth2), [Serverion - Refresh Token Rotation Best Practices](https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/), [passport-google-oauth20](https://www.passportjs.org/packages/passport-google-oauth20/)_

### Stripe Webhook Integration

**Pattern: Raw body signature verification → idempotent event processing → async state sync**

_Critical implementation details:_

1. **Raw body requirement** — Stripe webhook signature verification requires the RAW request body, not parsed JSON. If you use `express.json()` globally, signature verification will always fail. Solution: exclude the webhook route from the JSON parser or use a middleware that preserves the raw body (`express.raw({ type: 'application/json' })` on the webhook route only).

2. **Idempotent processing** — Stripe may send the same event multiple times (retries on failed deliveries, at-least-once guarantee). Implementation: store processed `event.id` values in a database table; check existence before processing; save after successful handling.

3. **Respond 200 immediately** — Return 200 status immediately after signature verification. Do NOT wait for database operations, email sends, or external API calls. If the endpoint doesn't respond within Stripe's timeout, it will retry, creating duplicate processing. For complex operations, use a queue (or in-process async) to handle the work after responding.

4. **Event ordering not guaranteed** — Stripe does not guarantee event delivery order. A `customer.subscription.updated` event may arrive before `customer.subscription.created`. Design handlers to be order-independent: use `event.data.object` (the current state) rather than computing deltas from previous state.

_Key subscription events to handle:_
- `customer.subscription.created` → provision Pro tier access
- `customer.subscription.updated` → handle upgrade/downgrade
- `customer.subscription.deleted` → revoke Pro tier, downgrade to Free
- `invoice.payment_failed` → notify user, grace period logic
- `checkout.session.completed` → initial subscription confirmation

_Stripe Customer Portal:_ Use Stripe's hosted Customer Portal for subscription management (cancel, upgrade, payment method updates). This eliminates custom UI for billing management and reduces PCI scope.

_Confidence: Very High_ — webhook-driven subscription state management is the standard Stripe integration pattern.

_Sources: [MagicBell - Stripe Webhooks Complete Guide](https://www.magicbell.com/blog/stripe-webhooks-guide), [Stigg - Stripe Webhook Best Practices](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks), [Hookdeck - Webhook Idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency), [Stripe Docs - Idempotent Requests](https://docs.stripe.com/api/idempotent_requests)_

### Rate Limiting: Express + Redis

**Pattern: express-rate-limit middleware with Redis store for distributed rate limiting**

_Implementation:_ The `express-rate-limit` library (10M+ weekly downloads) provides configurable rate limiting middleware. With `rate-limit-redis` as the store, rate limits are enforced across multiple server instances (future-proofing for horizontal scaling).

_PRD rate limit tiers:_
- **Auth endpoints** (login, register, OAuth): 10 requests/min/IP — prevents brute-force attacks
- **AI generation endpoints**: 5 requests/min/user — controls LLM API costs and prevents abuse
- **Public endpoints**: 60 requests/min/IP — standard API protection

_Key implementation details:_ (1) Use `standardHeaders: true` to send `RateLimit-*` headers informing clients of their usage and reset time. (2) Return `429 Too Many Requests` with a structured JSON error body. (3) For authenticated endpoints, rate limit by `user.id` rather than IP (prevents shared-office issues). (4) For unauthenticated endpoints, rate limit by IP with `X-Forwarded-For` awareness (behind reverse proxy/Docker).

_Redis integration:_ Redis is already in the Docker Compose stack for rate limiting state. This is a lightweight Redis usage — no need for Redis Cluster or Sentinel at MVP scale. A single Redis instance handles rate limiting + optional session caching.

_Confidence: Very High_ — express-rate-limit + Redis is the standard pattern for Node.js API rate limiting.

_Sources: [Better Stack - Rate Limiting Express](https://betterstack.com/community/guides/scaling-nodejs/rate-limiting-express/), [Webdock - Rate Limiting with Redis and Node.js](https://webdock.io/en/docs/how-guides/javascript-guides/rate-limiting-redis-and-nodejs-under-hood), [Meerako - API Rate Limiting Strategies Node.js Redis](https://www.meerako.com/blogs/api-rate-limiting-strategies-nodejs-redis), [npm - express-rate-limit](https://www.npmjs.com/package/express-rate-limit)_

### Claude API Integration: Provider Abstraction Layer

**Pattern: LLM provider interface → Anthropic implementation → injectable for testing and provider switching**

_Architecture:_ Define a TypeScript interface for the LLM provider that abstracts away Claude-specific details:

```
interface LLMProvider {
  generateInterpretation(context: CuratedStats, options: GenerationOptions): AsyncIterable<string>;
  estimateTokens(context: CuratedStats): number;
}
```

The Anthropic implementation uses `@anthropic-ai/sdk` with `messages.stream()` for the high-level streaming API. The interface enables: (1) **Provider switching** — swap Claude for OpenAI or a local model without changing business logic. (2) **Testing** — inject a mock provider that returns deterministic responses for CI. (3) **A/B testing** — compare interpretation quality between providers.

_Anthropic SDK specifics:_ (1) Install `@anthropic-ai/sdk` (official TypeScript SDK). (2) Use `messages.stream()` for high-level streaming with event handlers. (3) Input tokens are provided at message start; output tokens accumulate during streaming. (4) The SDK handles SSE parsing internally — you iterate over text chunks and forward them to the Express SSE endpoint.

_Cost management:_ (1) Token estimation before sending (prevent unexpectedly expensive prompts). (2) `max_tokens` cap per request (align with budget per AI generation). (3) Rate limiting at the application layer (5/min/user) prevents runaway costs. (4) Log token usage per request for cost monitoring.

_Confidence: High_ — provider abstraction is a standard pattern for LLM integrations.

_Sources: [Anthropic - TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript), [Anthropic - Client SDKs](https://docs.anthropic.com/en/api/client-sdks), [OneUpTime - Anthropic API Integration](https://oneuptime.com/blog/post/2026-01-25-anthropic-api-integration/view)_

### Data Upload Pipeline: Client Preview → Server Processing → Stats Computation

**Pattern: Client-side CSV preview (PapaParse browser) → multipart upload → server-side parsing → stats computation → database storage**

_Flow:_
1. **Client preview** — PapaParse runs in the browser to parse the first 100 rows, displaying a preview table with detected columns and data types. User confirms the upload looks correct.
2. **Multipart upload** — File sent via `multipart/form-data` to the Express backend. Size limited to 25MB at the middleware level (`multer` or `busboy`).
3. **Server parsing** — PapaParse streaming API processes the full CSV server-side without loading the entire file into memory. Rows are validated and cleaned (handling malformed data, type coercion, null handling).
4. **Stats computation** — `simple-statistics` computes aggregate measures per column and cross-column: mean, median, std deviation, percentiles, correlations, trend detection. Results stored in a structured format.
5. **Database storage** — Raw data stored in PostgreSQL (JSONB for flexible schemas). Computed stats stored separately for quick retrieval. The curation layer operates on computed stats, not raw data.

_Error handling:_ The pipeline must gracefully handle: (1) malformed CSVs (partial rows, mixed delimiters), (2) encoding issues (UTF-8, Latin-1 detection), (3) oversized files (reject > 25MB before processing), (4) empty or header-only files, (5) columns with mixed types.

_Confidence: High_ — this is a straightforward ETL pipeline pattern adapted for CSV upload.

### Integration Patterns Summary

| Integration | Pattern | Key Library | Confidence |
|-------------|---------|-------------|------------|
| LLM Streaming | SSE endpoint → Claude SDK streaming | `@anthropic-ai/sdk` + `better-sse` | High |
| Frontend ↔ Backend | BFF proxy via Next.js API routes | Next.js Route Handlers | High |
| Authentication | OAuth → JWT pair → httpOnly cookies | `passport-google-oauth20` + `jsonwebtoken` | High |
| Payments | Webhook-driven state sync | `stripe` SDK | Very High |
| Rate Limiting | Express middleware + Redis store | `express-rate-limit` + `rate-limit-redis` | Very High |
| LLM Abstraction | Provider interface pattern | Custom TypeScript interface | High |
| Data Upload | Client preview → server processing | `papaparse` + `multer` | High |

---

## Architectural Patterns and Design

### System Architecture: Layered Modular Monolith

**Pattern: Route → Controller → Service → Repository → Database, with domain logic isolated from infrastructure**

_Why modular monolith over microservices:_ This is a single-developer MVP. Microservices add network complexity, deployment orchestration, and distributed debugging overhead that's unjustified at this scale. A well-structured modular monolith — where each domain (auth, data, analytics, AI, payments) is a cleanly separated module with its own service/repository layers — provides the same separation of concerns without the operational overhead. If the project scales, each module can be extracted to a service because the boundaries are already clean.

_Layer responsibilities:_
- **Routes** — HTTP endpoint definitions, request validation (Zod schemas), rate limiting middleware
- **Controllers** — Thin layer that extracts request data, calls services, formats responses. No business logic.
- **Services** — All business logic lives here: auth flows, stats computation, curation logic, AI interpretation orchestration. Services depend on repository interfaces, not database implementations.
- **Repositories** — Data access layer using Drizzle ORM. Abstracts all SQL behind TypeScript interfaces. Enables testing with mock repositories without a database.
- **Domain types** — Shared TypeScript types/interfaces that define the data contracts between layers.

_Dependency rule:_ Inner layers never depend on outer layers. Services don't import Express types. Repositories don't know about HTTP. This makes the business logic testable in isolation.

_Confidence: High_ — layered architecture with dependency inversion is the standard pattern for maintainable Node.js applications.

_Sources: [Medium - Clean Architecture in Node.js TypeScript](https://vitalii-zdanovskyi.medium.com/a-definitive-guide-to-building-a-nodejs-app-using-clean-architecture-and-typescript-41d01c6badfa), [Alex Rusin - Repository Pattern with TypeScript](https://blog.alexrusin.com/clean-architecture-in-node-js-implementing-the-repository-pattern-with-typescript-and-prisma/), [Medium - Modern API Development Clean Architecture](https://baguilar6174.medium.com/modern-api-development-with-node-js-express-and-typescript-using-clean-architecture-0868607b76de)_

### Multi-Tenant Data Architecture: Shared Schema with RLS

**Pattern: Shared PostgreSQL database, shared schema, org_id on every table, Row-Level Security (RLS) as defense-in-depth**

_Architecture:_ The PRD specifies "org-first multi-tenant" with `org_id` on every table and `user_orgs` as a many-to-many join table. This is the **pooled model** — the most cost-effective multi-tenant approach, where all tenant data sits in the same database and tables, partitioned by `org_id`.

_Row-Level Security (RLS):_ PostgreSQL's built-in RLS provides a database-level enforcement layer. When enabled, policies automatically filter rows based on the current session's `org_id`: `CREATE POLICY tenant_isolation ON uploads USING (org_id = current_setting('app.org_id')::UUID)`. The Express middleware sets `app.org_id` at the start of each request from the JWT claims.

_RLS as defense-in-depth, not sole protection:_ RLS is a safety net, not the primary access control mechanism. The application layer (services/repositories) should also filter by `org_id` in every query. RLS catches bugs where the application layer accidentally omits the filter — it prevents data leaks from code errors, not just malicious access.

_Key implementation details:_ (1) Create a dedicated `app_user` database role (not superuser) for the application — superuser bypasses all RLS. (2) Set `org_id` via `SET LOCAL app.org_id = '...'` at the beginning of each request transaction. (3) RLS policies on ALL tenant-scoped tables (uploads, datasets, analyses, summaries). (4) `user_orgs` join table enforces which users belong to which organizations.

_MVP simplification:_ The PRD specifies "one-org UI in MVP" — users see only one organization. The data model supports multi-org, but the UI doesn't expose org switching until Growth tier. This simplifies the frontend while keeping the data architecture future-proof.

_Confidence: Very High_ — shared schema with RLS is the standard multi-tenant pattern for SaaS on PostgreSQL.

_Sources: [SimplyBlock - Postgres Multi-Tenancy with RLS](https://www.simplyblock.io/blog/underated-postgres-multi-tenancy-with-row-level-security/), [AWS - Multi-Tenant Data Isolation with RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/), [The Nile - Multi-Tenant RLS](https://www.thenile.dev/blog/multi-tenant-rls), [Permit.io - Postgres RLS Implementation Guide](https://www.permit.io/blog/postgres-rls-implementation-guide)_

### Context Engineering: Curation-to-Prompt Pipeline

**Pattern: Stats computation → Curation (ranking + filtering) → Structured context assembly → LLM interpretation**

This is the most critical architectural pattern in the project — the competitive moat identified in both the PRD stress test and market research.

_The shift from prompt engineering to context engineering:_ The AI industry has evolved from "write clever prompts" to "engineer the context that surrounds the prompt." According to LangChain's 2025 State of Agent Engineering report, 57% of organizations have AI agents in production, but 32% cite quality as the top barrier — traced to poor context management, not LLM capabilities. How context is constructed, filtered, and presented matters more than the prompt itself.

_Three-stage pipeline:_

**Stage 1 — Statistical Computation:** `simple-statistics` computes per-column and cross-column measures: mean, median, std deviation, percentiles, correlations, linear regression, z-scores. Output: a structured stats object per dataset.

**Stage 2 — Curation (the moat):** Custom ranking algorithm scores each statistical finding by:
- **Novelty score** — how far the finding deviates from "expected" (z-score > 2, trend break, correlation anomaly). Uses Local Outlier Factor (LOF) concepts for identifying data points that deviate from their neighbors.
- **Actionability score** — whether the finding maps to a business decision (revenue change → pricing/marketing action; correlation → optimization opportunity).
- **Specificity score** — penalizes generic findings ("revenue varies by month") in favor of specific ones ("Category X revenue dropped 23% in Week 3 while Category Y grew 15%").
- Top-N findings (configurable, default 5-7) are selected for the LLM prompt.

**Stage 3 — Structured Context Assembly:** The selected findings are formatted into a structured prompt using XML tags or Markdown headers (Anthropic's recommended approach):
```
<dataset_context>
  Business type, time period, data shape
</dataset_context>
<statistical_findings>
  Finding 1: [stat] with novelty=X, actionability=Y
  Finding 2: ...
</statistical_findings>
<instructions>
  Explain these findings in plain English for a non-technical business owner.
  For each finding: (1) what happened, (2) why it likely happened, (3) what to do about it.
  Be specific and actionable. Avoid generic observations.
</instructions>
```

_Why this architecture matters:_ Generic LLM prompts (dump all data, ask for insights) produce generic outputs. The curation layer ensures the LLM receives only the most interesting findings, with explicit instructions to explain and act on each one. This is what separates "AI-powered" marketing from genuinely useful AI interpretation.

_CI testability:_ The PRD requires seed data to produce 2+ insight types in CI. The curation pipeline is testable: given known seed data with embedded anomalies, verify that the curation layer ranks the anomalies above generic findings.

_Confidence: High_ for the architecture; Medium for the specific scoring algorithms (these need empirical tuning with real data).

_Sources: [Anthropic - Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), [FlowHunt - Context Engineering Definitive Guide](https://www.flowhunt.io/blog/context-engineering/), [Promptingguide.ai - Context Engineering Guide](https://www.promptingguide.ai/guides/context-engineering-guide), [scikit-learn - Novelty and Outlier Detection](https://scikit-learn.org/stable/modules/outlier_detection.html)_

### Frontend Architecture: RSC-First Dashboard

**Pattern: React Server Components for data-heavy layouts, Client Components for interactive elements, SWR for client-side revalidation**

_RSC-first approach:_ A SaaS dashboard that adopted Next.js 15 with RSC reduced client bundle sizes by 60% and cut infrastructure costs by 25%. For this project, the pattern is:

- **Server Components (default):** Sidebar navigation, header, data tables, stat cards, AI summary display (after generation is complete). These render on the server with zero client JS overhead.
- **Client Components (opt-in `'use client'`):** Chart interactions (zoom, filter, tooltip), CSV upload form, AI generation trigger button, real-time SSE consumer, theme toggle.
- **Hybrid:** Dashboard page is a Server Component that fetches initial data; chart widgets are Client Components nested within it.

_Data fetching strategy:_
- **Initial load:** Server Components fetch from the Express backend during server render. No loading spinners for the first paint.
- **Client-side updates:** SWR (or React Query) handles polling, cache invalidation, and optimistic updates for interactive data. Background revalidation keeps displayed data fresh without full page reloads.
- **SSE streaming:** Client Component subscribes to the SSE endpoint for AI generation. Text chunks are appended to state in real-time.

_Performance target:_ Server-side rendering for the main dashboard should achieve < 1s TTFB (per PRD NFR1). Client-side chart rendering should be interactive within 2s of page load.

_Confidence: High_ — RSC-first dashboard is the recommended Next.js architecture for data-heavy SaaS applications.

_Sources: [KSolves - Next.js SaaS Dashboard Best Practices](https://www.ksolves.com/blog/next-js/best-practices-for-saas-dashboards), [Saas UI - Modern SaaS Dashboard with Next.js App Router](https://saas-ui.dev/blog/building-a-modern-saas-dashboard-with-saas-ui-and-next-js-app-router), [CoderTrove - React Server Components 2025](https://www.codertrove.com/articles/react-server-components-2025-nextjs-performance), [Makerkit - Why Use Next.js for SaaS 2026](https://makerkit.dev/blog/tutorials/why-you-should-use-nextjs-saas)_

### Seed Data Architecture: Demo Script as Engineering Artifact

**Pattern: Realistic business dataset with embedded anomalies, progressive disclosure, one-click dismissal**

The market research confirmed: users who don't see a useful, non-obvious insight in their first session churn permanently. Seed data is the mechanism that guarantees the "aha moment" for new users.

_Design principles:_
1. **Realistic, not synthetic** — Data should look like a real small business: "Maria's Coffee Shop" with 12 months of revenue, expenses, and customer data. Use real-world patterns (seasonal dips, growth trends, weekend/weekday differences) with realistic noise.
2. **Embedded anomalies** — Deliberate statistical anomalies the curation logic will detect: a revenue drop in month 8 (supply chain issue), a correlation between marketing spend and new customers that breaks in month 10 (market saturation), a category growing 3x while others are flat (emerging product line). These ensure the AI produces specific, non-obvious insights.
3. **Industry-relevant** — Match the target persona. Marcus runs a service business; the seed data should look like a service business, not a tech startup.
4. **Dismissible** — Users must be able to clear all sample data with a single action once they understand how the product works. Sample data should be clearly labeled ("Sample Data" badge) so users never confuse it with their own.
5. **CI-testable** — The seed data + curation pipeline + AI generation must produce 2+ distinct insight types in CI. This is a PRD requirement (FR39).

_Progressive disclosure:_ New users see the seed data dashboard immediately after signup — no empty states. A guided tour highlights: "Here's a revenue trend the AI found interesting" → "Here's what it means" → "Now try uploading your own data." This is the onboarding funnel that drives conversion.

_Architecture note:_ Seed data is a versioned artifact in the repository (not generated at runtime). It has its own migration/seeding script that runs during `docker compose up` for fresh environments and during CI for testing.

_Confidence: High_ — demo data as onboarding is a well-established PLG pattern; the specific anomaly-embedding approach is novel but well-grounded.

_Sources: [Insaim - SaaS Onboarding Best Practices 2025](https://www.insaim.design/blog/saas-onboarding-best-practices-for-2025-examples), [Formbricks - User Onboarding Best Practices 2026](https://formbricks.com/blog/user-onboarding-best-practices), [ProCreator - SaaS Dashboards That Nail Onboarding 2025](https://procreator.design/blog/saas-dashboards-that-nail-user-onboarding/), [Mouseflow - SaaS UX Design Best Practices 2025](https://mouseflow.com/blog/saas-ux-design-best-practices/)_

### Security Architecture: Defense-in-Depth

**Pattern: Multiple independent security layers, each providing protection even if others fail**

_Security layers for this project:_

1. **Authentication layer** — JWT + httpOnly cookies + refresh rotation (detailed in Integration Patterns). No tokens in localStorage, no tokens in URLs.
2. **Authorization layer** — RBAC enforced at three levels: (a) API middleware checks `role` in JWT claims before route execution, (b) Service layer verifies permissions for business operations, (c) DOM-level conditional rendering (not CSS display:none) hides unauthorized UI elements.
3. **Data isolation layer** — `org_id` filtering in every repository method + PostgreSQL RLS as a safety net. Double-layer prevents accidental cross-tenant data leaks.
4. **Input validation layer** — Zod schemas validate all incoming data at the route level. Type-safe from HTTP request to database query. Prevents injection attacks and malformed data.
5. **Rate limiting layer** — Express middleware + Redis (detailed in Integration Patterns). Prevents brute-force, abuse, and cost overruns.
6. **Transport security** — HTTPS enforced (TLS termination at reverse proxy), Secure + SameSite cookies, CORS configured for exact origin match.

_OWASP alignment:_ The architecture addresses the OWASP Top 10 through: input validation (injection), authentication (broken auth), RBAC (access control), HTTPS (security misconfiguration), Zod schemas (security misconfig), rate limiting (DoS protection).

_Confidence: Very High_ — defense-in-depth is the standard security architecture pattern.

### Data Architecture: Separation of Raw, Computed, and Curated

**Pattern: Raw data → Computed stats → Curated findings → AI interpretation, each stored independently**

_Data layers:_
1. **Raw data** — Uploaded CSV rows stored in PostgreSQL. JSONB columns allow flexible schemas (each user's CSV has different columns). Indexed by `org_id`, `dataset_id`, `uploaded_at`.
2. **Computed stats** — Aggregate statistics per column and cross-column: means, medians, correlations, trend lines, z-scores. Stored as structured JSON in a separate `dataset_stats` table. Computed once on upload, recomputed on re-upload.
3. **Curated findings** — Top-N ranked findings from the curation layer. Stored with their novelty/actionability/specificity scores. This is the input to the LLM prompt.
4. **AI interpretations** — The LLM's generated text stored with metadata: prompt tokens used, model version, generation timestamp. Enables caching (same data = same interpretation until re-upload) and A/B comparison.

_Why separate layers:_ (1) Raw data can be re-analyzed with improved curation logic without re-upload. (2) Computed stats serve both the dashboard visualizations AND the curation layer. (3) Curated findings are debuggable — you can inspect exactly what the LLM received. (4) AI interpretations are cacheable — don't regenerate for the same data.

_Confidence: High_ — separation of data layers is a standard analytics architecture pattern.

### Architectural Patterns Summary

| Pattern | Purpose | Confidence |
|---------|---------|------------|
| Modular monolith (layered) | Maintainable single-developer codebase | High |
| Shared schema + RLS | Multi-tenant data isolation | Very High |
| Context engineering pipeline | Curation → structured prompt → quality AI output | High |
| RSC-first dashboard | Performance: 60% smaller bundles, < 1s TTFB | High |
| Seed data as engineering artifact | Guaranteed "aha moment" in first session | High |
| Defense-in-depth security | Multiple independent protection layers | Very High |
| Separated data layers | Raw → computed → curated → AI, each independent | High |

---

## Implementation Approaches and Technology Adoption

### Project Structure and Organization

**Recommendation: Lightweight monorepo with shared types package**

Rather than a full Turborepo/Nx monorepo (overkill for a solo-developer portfolio project), a simple workspace-based structure provides shared type safety without build orchestration complexity:

```
saas-analytics-dashboard/
├── packages/
│   └── shared/              # Shared TypeScript types, validators, constants
│       ├── src/
│       │   ├── types/       # DTOs, API contracts, domain models
│       │   ├── validators/  # Zod schemas (shared frontend + backend)
│       │   └── constants/   # Roles, plan tiers, rate limits
│       ├── package.json
│       └── tsconfig.json
├── apps/
│   ├── web/                 # Next.js 15 App Router (frontend)
│   │   ├── app/             # App Router pages and layouts
│   │   ├── components/      # UI components (shadcn/ui based)
│   │   ├── lib/             # Client-side utilities
│   │   └── hooks/           # Custom React hooks
│   └── api/                 # Express.js (backend)
│       ├── src/
│       │   ├── routes/      # Express route handlers
│       │   ├── controllers/ # Request/response logic
│       │   ├── services/    # Business logic layer
│       │   ├── repositories/# Database access (Drizzle)
│       │   ├── middleware/  # Auth, rate limiting, validation
│       │   └── lib/         # Shared utilities (logger, errors)
│       └── drizzle/         # Migrations and schema
├── docker-compose.yml       # Dev environment
├── docker-compose.prod.yml  # Production build
├── package.json             # Root workspace config
└── pnpm-workspace.yaml      # pnpm workspace definition
```

**Key design decisions:**
- **pnpm workspaces** over npm workspaces — better dependency hoisting, strict mode prevents phantom dependencies, disk-efficient via content-addressable store
- **Shared Zod schemas** serve as single source of truth — same validation runs on frontend forms and API endpoints, TypeScript types inferred from schemas via `z.infer<T>`
- **No Turborepo**: For a 2-app monorepo, `pnpm --filter` commands are sufficient; Turborepo adds caching value only with 5+ packages

_Source: [Robin Wieruch — Monorepos in JavaScript & TypeScript](https://www.robinwieruch.de/javascript-monorepos/)_
_Source: [Medium — A Simple Monorepo Setup with Next.js and Express.js](https://medium.com/@serdar.ulutas/a-simple-monorepo-setup-with-next-js-and-express-js-4bbe0e99b259)_

### Testing Strategy

**Recommendation: Three-tier testing pyramid with Vitest + Playwright**

The testing strategy is shaped by a critical constraint: **React 19 async Server Components cannot be unit-tested with Vitest** (the React ecosystem hasn't caught up yet). This forces a deliberate split:

#### Tier 1: Unit Tests (Vitest) — Fast, Isolated

**What to test:**
- Express API route handlers and middleware (via `supertest` for HTTP-level integration)
- Drizzle repository functions (against a test PostgreSQL container)
- Curation algorithm scoring logic (pure functions — highest value unit tests)
- Zod validation schemas
- React client components and hooks (via React Testing Library)
- CSV parsing logic (PapaParse + custom validation)
- Statistical computation functions (simple-statistics wrappers)

**Configuration notes:**
- Vitest with `pool: 'forks'` for database integration tests (prevents parallel test isolation issues)
- `vitest.workspace.ts` to separate frontend tests (jsdom environment) from backend tests (node environment)
- `@vitest/coverage-v8` for coverage reporting

**Target: 80%+ coverage on business logic layers (services, curation, stats computation)**

_Source: [Next.js — Testing with Vitest](https://nextjs.org/docs/app/guides/testing/vitest)_
_Source: [Wisp CMS — Setting Up Vitest for Next.js 15](https://www.wisp.blog/blog/setting-up-vitest-for-nextjs-15)_
_Source: [Danioshi — How to Test Your Node.js RESTful API with Vitest](https://danioshi.substack.com/p/how-to-test-your-nodejs-restful-api)_

#### Tier 2: Integration Tests (Vitest + supertest) — API Layer

**What to test:**
- Full request lifecycle: HTTP request → middleware chain → controller → service → repository → response
- Auth flows: JWT validation, refresh token rotation, Google OAuth callback
- File upload pipeline: multipart upload → PapaParse → validation → storage
- Rate limiting behavior under load
- Stripe webhook signature verification + idempotent processing

**Setup pattern:**
```typescript
// Test setup with real PostgreSQL via Docker
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../src/app';
import { setupTestDb, teardownTestDb } from './helpers/db';

let app: Express;
let request: supertest.SuperTest<supertest.Test>;

beforeAll(async () => {
  await setupTestDb();          // Run migrations on test DB
  app = createApp();            // Boot Express with test config
  request = supertest(app);
});
```

#### Tier 3: End-to-End Tests (Playwright) — Critical User Journeys

**What to test (aligned with PRD user journeys):**
1. **David's success path**: Login → Upload CSV → See visualizations → Generate AI summary → View interpretation
2. **Upload error recovery**: Upload malformed CSV → See error → Re-upload correct file (FR12)
3. **Auth flow**: Google OAuth login → Session persistence → Refresh token rotation → Logout
4. **Stripe checkout**: Free tier → Click upgrade → Complete Stripe checkout → Verify Pro access
5. **Shared insights**: Generate summary → Export/share → Recipient views insight card (FR27, MVP-Complete)

**File upload testing:** Playwright's `fileInput.setInputFiles()` API handles CSV upload simulation directly.

**Target: 5 critical path E2E tests covering PRD journeys, run in CI against Docker Compose stack**

_Source: [Next.js — Testing with Playwright](https://nextjs.org/docs/pages/guides/testing/playwright)_
_Source: [DeviQA — Guide to Playwright End-to-End Testing 2026](https://www.deviqa.com/blog/guide-to-playwright-end-to-end-testing-in-2025/)_

#### Seed Data Validation Tests (Custom — CI-Required)

Per PRD NFR requirements, CI must validate seed data quality:
- At least 2+ insight types generated from seed dataset
- Seed anomalies are detectable by the curation algorithm
- AI summary for seed data meets minimum quality bar (structured output contains all required sections)

### Database Migration Strategy

**Recommendation: Drizzle Kit `migrate` with versioned SQL files**

Two migration approaches exist with Drizzle; we choose `migrate` over `push`:

| Approach | `drizzle-kit push` | `drizzle-kit migrate` |
|----------|--------------------|-----------------------|
| Best for | Rapid prototyping, serverless | Production, Docker-first |
| How it works | Diffs schema → applies directly | Generates SQL files → applies in order |
| Reproducibility | Non-deterministic (diff-based) | Fully deterministic (versioned SQL) |
| Rollback | Manual | Can write reverse migration |
| CI-friendly | Difficult to validate | SQL files can be reviewed in PR |

**Migration workflow:**
1. Edit `apps/api/drizzle/schema.ts` (codebase-first approach)
2. Run `drizzle-kit generate` → creates timestamped SQL migration file
3. Review generated SQL in PR (human review for destructive changes)
4. `drizzle-kit migrate` runs automatically on deployment (Docker entrypoint)
5. Migration log stored in `__drizzle_migrations` table

**Production safety rules:**
- **Additive DDL is always safe** (new columns, new tables, new indexes)
- **Destructive DDL requires explicit review** (column renames, drops, type changes)
- Never drop columns in the same deployment that stops reading them — separate into two deployments
- PostgreSQL identity columns over serial types (modern Drizzle best practice)

_Source: [Drizzle ORM — Migrations](https://orm.drizzle.team/docs/migrations)_
_Source: [Budi Voogt — Drizzle Migrations to Postgres in Production](https://budivoogt.com/blog/drizzle-migrations)_
_Source: [Drizzle ORM PostgreSQL Best Practices Guide 2025](https://gist.github.com/productdevbook/7c9ce3bbeb96b3fabc3c7c2aa2abc717)_

### CI/CD Pipeline Design

**Recommendation: GitHub Actions with Docker Compose service containers**

#### Pipeline Stages (sequential, fail-fast):

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @app/shared build   # Build shared types first
      - run: pnpm run lint                      # ESLint across all workspaces
      - run: pnpm run typecheck                 # tsc --noEmit across all workspaces

  test:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: test_db
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @app/api run migrate  # Run migrations on test DB
      - run: pnpm --filter @app/api run seed      # Seed test data
      - run: pnpm run test                        # Vitest unit + integration
      - run: pnpm run test:coverage               # Coverage report

  seed-validation:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - run: pnpm run test:seed-quality  # Validates 2+ insight types from seed data

  build-and-e2e:
    runs-on: ubuntu-latest
    needs: seed-validation
    steps:
      - run: docker compose -f docker-compose.ci.yml up -d  # Full stack
      - run: pnpm exec playwright install --with-deps
      - run: pnpm run test:e2e           # Playwright against Docker stack
      - run: docker compose -f docker-compose.ci.yml down

  docker-smoke:
    runs-on: ubuntu-latest
    needs: build-and-e2e
    steps:
      - run: docker compose up -d        # NFR15: Docker smoke test
      - run: curl --retry 10 --retry-delay 3 http://localhost:3000/health
      - run: docker compose down
```

**CI pipeline aligns with PRD requirements:**
- `lint` + `typecheck` → code quality gates
- `test` → unit + integration tests against real PostgreSQL
- `seed-validation` → FR39 (AI insight quality gate)
- `build-and-e2e` → critical user journey verification
- `docker-smoke` → NFR15 (first-run Docker success)

_Source: [GitHub — Creating PostgreSQL Service Containers](https://docs.github.com/en/actions/using-containerized-services/creating-postgresql-service-containers)_
_Source: [Docker — Configure CI/CD for Node.js](https://docs.docker.com/guides/nodejs/configure-ci-cd/)_

### Development Environment (Docker Compose)

**Recommendation: Docker Compose with hot-reload for development**

```yaml
# docker-compose.yml (development)
services:
  web:
    build:
      context: ./apps/web
      target: dev                          # Multi-stage: dev target
    ports: ['3000:3000']
    volumes:
      - ./apps/web:/app                    # Source mount for HMR
      - /app/node_modules                  # Isolated node_modules
      - ./packages/shared:/shared          # Shared types
    environment:
      - NODE_ENV=development
      - WATCHPACK_POLLING=true             # Required for Docker HMR
      - NEXT_PUBLIC_API_URL=http://localhost:4000
    depends_on:
      api:
        condition: service_healthy

  api:
    build:
      context: ./apps/api
      target: dev
    ports: ['4000:4000']
    volumes:
      - ./apps/api:/app
      - /app/node_modules
      - ./packages/shared:/shared
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://dev:dev@db:5432/analytics
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:4000/health']

  db:
    image: postgres:16-alpine
    ports: ['5432:5432']
    environment:
      POSTGRES_DB: analytics
      POSTGRES_USER: dev
      POSTGRES_PASSWORD: dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U dev']

volumes:
  pgdata:
```

**Key development experience features:**
- **Hot Module Replacement**: `WATCHPACK_POLLING=true` ensures file changes inside Docker volumes trigger Next.js recompilation
- **Health checks with `depends_on`**: Services start in order (db → api → web), preventing connection errors
- **Isolated `node_modules`**: Anonymous volume prevents host/container architecture mismatches (ARM Mac vs Linux container)
- **Shared types mount**: Changes to `packages/shared` are immediately available in both apps

**First-run target (NFR15):** `docker compose up` should bring the entire stack online in < 2 minutes on a cold start, with `docker compose up -d && docker compose logs -f` as the recommended developer workflow.

_Source: [Eli Front — Best Next.js Docker Compose Hot-Reload Setup](https://medium.com/@elifront/best-next-js-docker-compose-hot-reload-production-ready-docker-setup-28a9125ba1dc)_
_Source: [OneUptime — Docker Hot Reloading 2026](https://oneuptime.com/blog/post/2026-01-06-docker-hot-reloading/view)_

### Error Handling and Logging

**Recommendation: Pino for structured logging + centralized error handling middleware**

#### Logging Framework: Pino

Pino is the clear choice for Node.js structured logging — benchmarks show 10,000+ logs/second with minimal overhead, compared to Winston's ~2,000/second. For a solo-developer project, Pino's defaults are production-ready without extensive configuration.

**Logging architecture:**
```typescript
// apps/api/src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }      // Human-readable in dev
    : undefined,                       // JSON in production
  serializers: {
    req: pino.stdSerializers.req,      // Standard request serialization
    err: pino.stdSerializers.err,      // Standard error serialization
  },
});
```

**Request correlation:** Every incoming HTTP request gets a unique `X-Request-ID` header (generated by middleware if absent), which is carried through all log entries and passed to the LLM service for traceability:

```typescript
// Correlation ID middleware
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] as string || crypto.randomUUID();
  req.log = logger.child({ requestId: req.id, userId: req.user?.id });
  next();
});
```

#### Error Handling Pattern

**Centralized Express error handler** at the end of the middleware chain, mapping domain errors to HTTP responses:

```typescript
// Custom error classes for domain-specific errors
class AppError extends Error {
  constructor(public statusCode: number, message: string, public code: string) {
    super(message);
  }
}

class ValidationError extends AppError { /* 400 */ }
class AuthenticationError extends AppError { /* 401 */ }
class AuthorizationError extends AppError { /* 403 */ }
class NotFoundError extends AppError { /* 404 */ }
class RateLimitError extends AppError { /* 429 */ }

// Global error handler middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof AppError) {
    req.log.warn({ err, code: err.code }, 'Application error');
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message }
    });
  }
  // Unexpected errors — log full stack, return generic message
  req.log.error({ err }, 'Unexpected error');
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' }
  });
});
```

**Log levels used consistently:**
- `error`: Unexpected failures, unhandled rejections
- `warn`: Business logic errors (validation, auth failures, rate limits)
- `info`: Successful operations (upload complete, AI generation complete, payment processed)
- `debug`: Development diagnostics (query timing, LLM token counts)

_Source: [Dash0 — Top 5 Node.js Logging Frameworks 2025](https://www.dash0.com/faq/the-top-5-best-node-js-and-javascript-logging-frameworks-in-2025-a-complete-guide)_
_Source: [Better Stack — 11 Best Practices for Logging in Node.js](https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/)_
_Source: [Meerako — Error Handling & Logging Best Practices](https://www.meerako.com/blogs/error-handling-logging-best-practices-nodejs-sentry)_

### Cost Optimization and Resource Management

**Recommendation: Lean-start strategy with aggressive free tier usage**

#### Monthly Cost Projection (MVP Phase)

| Service | Free Tier | Estimated MVP Cost | Notes |
|---------|-----------|-------------------|-------|
| Anthropic Claude API | None (pay-per-use) | $5-15/mo | Haiku for dev, Sonnet for prod; ~500 generations/mo |
| PostgreSQL (Docker) | Self-hosted | $0 | Runs in Docker Compose locally and in CI |
| Stripe | 2.9% + $0.30/tx | $0 until revenue | No monthly fee; only per-transaction |
| GitHub Actions | 2,000 min/mo free | $0 | Sufficient for solo dev CI runs |
| Vercel (optional) | Hobby tier free | $0 | If deploying frontend separately |
| Domain + DNS | — | $12/year | Optional for portfolio demo |
| **Total MVP** | — | **$5-15/mo** | |

#### Claude API Cost Optimization

The PRD's hybrid intelligence model (local stats computation + LLM interpretation of curated context) is itself a cost optimization — raw data never touches the LLM. Additional strategies:

1. **Model tiering**: Use Claude 3.5 Haiku for development/testing ($0.25/MTok input); Claude 3.5 Sonnet for production generation ($3/MTok input)
2. **Token budget per generation**: Cap curated context at ~2,000 tokens input → ~800 tokens output ≈ $0.003/generation with Sonnet
3. **Response caching**: Cache AI interpretations for identical curated stats (same dataset + same time range = same insights). SHA-256 hash of curated context → cache key
4. **Rate limiting**: 5 generations/min/user (PRD) prevents runaway costs

**Estimated cost per user per month**: ~$0.03-0.05 (assuming 10-15 AI generations/month per active user)

#### Development Workflow Optimization (Solo Developer)

Based on successful solo SaaS case studies (e.g., OnboardingHub — 38,600 LOC in ~8 weeks with AI assistance):

- **AI-assisted development**: Claude Code for implementation, reducing boilerplate time by 3-5x
- **Feature velocity target**: 5-8 features per week with AI assistance
- **Sequential phase approach** (from PRD): Auth → Data → Viz → AI → Payments → Share → DevOps → UI → README
- **Time allocation**: ~60% implementation, 20% testing, 10% architecture decisions, 10% documentation

_Source: [Vooster — Build Profitable Software Solo](https://www.vooster.ai/en/blog/build-profitable-software-solo)_
_Source: [Carlos Pinto — Building a Complete SaaS with Only Claude Code](https://world.hey.com/cpinto/building-a-complete-saas-product-with-only-claude-code-cca13895)_
_Source: [CloudZero — Claude Pricing 2025](https://www.cloudzero.com/blog/claude-pricing/)_

### Risk Assessment and Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| React 19 async RSC testing gap | High | Medium | Playwright E2E covers RSC paths; Vitest for client-only components |
| Docker Compose HMR flakiness on macOS ARM | Medium | Low | `WATCHPACK_POLLING=true`; volume mount configuration tested on M-series |
| Drizzle ORM breaking changes (< v1.0) | Low | High | Pin exact version; migration files are plain SQL (portable) |
| Claude API rate limits / outages | Medium | Medium | LLM provider abstraction interface; SSE fallback to sync; graceful degradation |
| Monorepo import resolution issues | Medium | Low | `pnpm --strict-peer-dependencies`; shared package built before consumers |
| CI pipeline time exceeding free tier | Low | Low | Parallelize lint/typecheck; Docker layer caching; skip E2E on draft PRs |

## Technical Research Recommendations

### Implementation Roadmap

Aligned with PRD's sequential phase approach:

1. **Week 1-2: Foundation** — Project scaffolding (monorepo, Docker Compose, CI pipeline), auth implementation (Google OAuth + JWT), database schema + migrations
2. **Week 3: Data Pipeline** — CSV upload + parsing, statistical computation, data storage layer
3. **Week 4: Visualization** — Recharts dashboard components, data fetching with RSC
4. **Week 5: AI Integration** — Curation algorithm, context engineering pipeline, SSE streaming
5. **Week 6: Payments + Polish** — Stripe integration, paywall enforcement, rate limiting
6. **Week 7: DevOps + Quality** — Docker production build, E2E tests, seed data quality validation
7. **Week 8: README + Launch** — Portfolio README, deployment documentation

### Technology Stack Recommendations Summary

| Layer | Primary Choice | Confidence |
|-------|---------------|------------|
| Frontend | Next.js 15 (App Router) + TypeScript | Very High |
| UI Components | Tailwind CSS + shadcn/ui | Very High |
| Charts | Recharts | High |
| Backend | Express.js + TypeScript | Very High |
| ORM | Drizzle ORM | High |
| Database | PostgreSQL 16 | Very High |
| Auth | Passport.js + JWT + Google OAuth | High |
| AI | Anthropic Claude API (Sonnet) | High |
| Payments | Stripe Checkout + Webhooks | Very High |
| Testing | Vitest + Playwright | High |
| CI/CD | GitHub Actions | Very High |
| Container | Docker Compose | Very High |
| Package Manager | pnpm (workspaces) | High |

### Critical Implementation Priorities

1. **Curation algorithm** — The competitive moat; deserves first-class architecture attention (novelty/actionability/specificity scoring)
2. **Docker Compose dev environment** — Foundation for all development; get "docker compose up" working first
3. **Shared types package** — Build once, import everywhere; prevents API contract drift
4. **Seed data with embedded anomalies** — The demo script; must produce compelling AI interpretations
5. **CI pipeline with seed validation** — Automated quality gate for the product's core value proposition

---

## Research Conclusion

### Research Goals Achievement

All five original research goals have been comprehensively addressed:

| Goal | Status | Key Finding |
|------|--------|-------------|
| Evaluate frameworks/libraries against PRD requirements | **Achieved** | 13 technologies evaluated with confidence ratings; all aligned to specific PRD requirements |
| Research LLM integration patterns | **Achieved** | Context engineering pipeline designed (3-stage curation); provider abstraction interface defined; SSE streaming architecture documented |
| Analyze auth implementation options | **Achieved** | Custom JWT + Passport.js selected over NextAuth; refresh token rotation with family tracking; httpOnly cookies for XSS prevention |
| Evaluate deployment architecture | **Achieved** | Docker Compose for dev+prod; 5-stage CI pipeline mapped to PRD requirements; first-run success strategy documented |
| Research curation logic approaches | **Achieved** | Novelty/actionability/specificity scoring framework; LOF-inspired anomaly detection concepts; context engineering as competitive moat |

**Additional insights discovered during research:**
- React 19 async RSC testing gap requires deliberate testing pyramid design (not discoverable from documentation alone)
- Drizzle `migrate` vs `push` distinction is critical for Docker-first reproducibility
- Pino outperforms Winston by 5x for structured logging — relevant for request correlation across the LLM pipeline
- Solo developer SaaS case studies validate the 6-8 week timeline with AI-assisted development

### Strategic Technical Impact

This research establishes that the SaaS Analytics Dashboard's technology stack is **mature, low-risk, and well-aligned to PRD requirements**. No experimental technologies sit in the critical path. The highest-risk engineering challenge — the curation algorithm — is a custom code problem, not a technology selection problem.

The hybrid intelligence architecture (local stats + curated LLM context) emerged as both the quality differentiator AND the cost optimization strategy. At ~$0.003 per AI generation, the platform can profitably serve users at the Free tier while the Pro tier AI paywall drives conversion.

**Confidence assessment:** 9 of 13 primary technology selections have "Very High" confidence. The remaining 4 (Recharts, Drizzle, Passport.js, Claude API) have "High" confidence with documented upgrade/migration paths.

### Next Steps

This technical research feeds directly into the **Architecture phase** of the BMAD workflow:
1. **Architecture document** should reference this research for technology selection rationale
2. **Database schema design** should implement the shared schema + RLS pattern documented here
3. **Curation algorithm specification** needs first-class treatment in the architecture — scoring weights, threshold tuning strategy, and CI quality gates
4. **Seed data specification** should define the "Maria's Coffee Shop" dataset with specific embedded anomalies
5. **Epic breakdown** can reference the implementation roadmap (Weeks 1-8) for sprint planning

---

**Technical Research Completion Date:** 2026-02-17
**Research Methodology:** 60+ web sources verified across 6 research steps, multi-source validation for all critical claims
**Document Sections:** 8 major sections, 34 subsections, 13 technology evaluations, 7 integration patterns, 7 architectural patterns
**Confidence Level:** High — based on multiple authoritative current sources with explicit confidence ratings per recommendation
**Total Sources Cited:** 60+

_This comprehensive technical research document serves as the authoritative technology reference for the SaaS Analytics Dashboard and provides the foundation for architecture, epic breakdown, and implementation decisions._
