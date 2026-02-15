---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - _bmad-output/brainstorming/brainstorming-session-2026-02-12.md
date: 2026-02-14
author: Corey
---

# Product Brief: SaaS Analytics Dashboard

## Executive Summary

SaaS Analytics Dashboard is an AI-powered analytics platform that transforms raw business data into plain-English insights for small business owners. While existing tools stop at visualization — showing charts that assume the user knows what they're looking at — this product takes the critical next step: interpretation. Users upload a CSV, see their data visualized, and read an AI-generated summary that explains what's happening and what to do about it. The platform combines local statistical computation with LLM-powered interpretation, delivering sharper insights through curated context rather than raw data dumps. Built as a production-grade SaaS with real authentication, Stripe payment integration, and full DevOps pipeline, it doubles as an engineering portfolio piece demonstrating full-stack depth across every layer of a modern web application.

---

## Core Vision

### Problem Statement

Small business owners are drowning in data they can't interpret. They export spreadsheets from tools like QuickBooks or Square and face a wall of numbers that makes them feel overwhelmed and guilty — they know their data matters, but they don't know how to read it. The result is a cycle of guilt, overwhelm, and avoidance that leaves real business insights buried in unopened CSVs.

### Problem Impact

Without understanding their data, small business owners miss seasonal trends they could prepare for, overspend in categories they don't notice, and fail to identify their highest-performing products or services. A landscaper doesn't see the November dip coming. A bakery keeps ordering the same inventory mix while custom cakes have quietly overtaken bread sales. The data is telling them what to do, and they can't hear it.

### Why Existing Solutions Fall Short

Every tool on the market stops at visualization. QuickBooks and Xero generate reports that assume financial literacy. Google Analytics overwhelms with metrics like bounce rate and session duration. Excel and Google Sheets are the default — export, stare, close the tab. Enterprise tools like Tableau cost too much and require training. Hiring an accountant is expensive, periodic, and still doesn't build the owner's own understanding. The gap is universal: no existing solution takes the next step from "here's your data, charted" to "here's what it means and what you should do about it."

### Proposed Solution

A three-step experience: upload a CSV, see interactive charts, read a plain-English AI summary. The platform uses hybrid intelligence — computing deterministic statistics locally (month-over-month growth, top categories, outliers) and sending only curated context to the LLM for interpretation. The AI doesn't summarize raw data; it receives pre-digested intelligence and produces actionable business advice for a non-technical audience. The result: insights that feel like having a smart business advisor explain your numbers over coffee.

### Key Differentiators

1. **Interpretation over visualization** — The only tool that tells small business owners what their data means, not just what it looks like
2. **Hybrid intelligence architecture** — Local statistical computation + LLM interpretation produces sharper insights than raw data dumps
3. **Radical simplicity** — Upload, see, read. Three steps, zero training required
4. **AI transparency** — "How I reached this conclusion" panel shows the data points and reasoning behind every insight
5. **Production-grade SaaS** — Real JWT + OAuth authentication, real Stripe payment integration with webhook lifecycle handling, and a paywall that gates the AI feature at the product's core value boundary — not a demo or tutorial output

---

## Target Users

### Primary Users

**Persona 1: Marcus — The Business Owner**

Marcus, 43, owns Marcus & Sons Landscaping, a 4-person crew in suburban Atlanta generating ~$280K/year in residential and light commercial work. He's comfortable with apps and his phone but avoids spreadsheets. He currently exports CSVs from Square at the end of each month — when he remembers — and goes by gut feel the rest of the year. His accountant sees the numbers at tax time; Marcus almost never does.

Marcus checks the dashboard once a month, Sunday evening on his phone, for 20 minutes max. He wants the big picture: are we up or down? What should I worry about? What should I do differently? The AI summary is his primary interaction — it must be above the fold on mobile. He may glance at charts but the plain-English interpretation is why he comes back.

**Persona 2: David — The Operations Partner & Primary Acquisition User**

David, 38, is Marcus's co-owner and handles the business side — scheduling, invoicing, payroll. More comfortable with spreadsheets than Marcus but still not an analyst. He's the one who actually exports from Square, tracks expenses in Google Sheets, and files quarterly taxes. David is the data gatekeeper — he uploads CSVs, manages the account subscription, and is the first person in any organization to discover and adopt the product.

David checks the dashboard weekly on his laptop for operational details. Where Marcus reads "cut winter crew," David reads "fuel expenses up 15% with flat job count — check vendor pricing." Same data, different questions, same product. David is also the evangelist — he shares insights with Marcus and other stakeholders, driving adoption through value delivery rather than invitations.

**Role Model:** Marcus and David are peers with equal access within their organization. Data belongs to the organization, not individual users. The admin/user distinction exists at the platform level, not within accounts. Both consume AI insights; David additionally handles data upload and account management because that's his role in the business, not because the product restricts Marcus.

### Secondary Users

**Platform Administrator** — A separate role for platform-level concerns: user management across organizations, Stripe webhook monitoring, system health. This is not a customer-facing persona but an internal/demo role that showcases RBAC implementation and admin dashboard capabilities.

### User Journey

1. **Discovery** — David finds the product via a live demo link. Lands on a dashboard pre-loaded with sample data — charts rendered, AI summary visible. No sign-up required to see value.
2. **Onboarding** — David signs up via Google OAuth. Demo data persists with a banner: "You're viewing sample data. Upload your own to replace it." He uploads a Square CSV export, previews the data, confirms, and charts update with his real numbers.
3. **Aha Moment** — The AI summary reveals something David didn't know: a cost trend, a seasonal pattern, a category shift. He hits "Share this insight" and texts Marcus a link or PNG.
4. **Viral Acquisition** — Marcus receives a shared insight on his phone. It's compelling — he didn't know fuel costs were up 15%. He taps through and creates his own account to see more on his own terms, not because David sent a generic invite.
5. **Retention & Upgrade** — David uploads monthly, Marcus checks monthly on mobile (AI summary above the fold). The AI consistently catches things both would miss. David upgrades to Pro to unlock the full AI interpretation layer, gating the product's core value behind Stripe.

### Architectural Implications

- **Organization-first data model** — Organizations are a first-class entity from day one. Data belongs to orgs, users have membership. All queries scoped by org_id. Retrofitting multi-tenancy later is painful; starting with it is free.
- **Share/export as acquisition bridge** — Server-side rendering of insight cards (chart + AI summary) as PNG/PDF. The share feature isn't just a nice-to-have — it's the primary mechanism by which secondary users discover the product.
- **Mobile-first AI summary** — Marcus's persona demands AI summary above the fold on mobile viewports. Charts below. This is a design requirement, not an afterthought.

---

## Success Metrics

### User Success Metrics

- **The Insight Metric** — AI summary contains at least one non-obvious insight per analysis (trend, anomaly, recommendation — not just restating numbers). Measured via proxy signals: time spent on AI summary section, interaction with transparency panel, share/export actions.
- **The Share Metric** — Users share insights with teammates or stakeholders. Validates the acquisition bridge hypothesis — if nobody shares, the viral loop is broken.
- **The Return Metric** — Users come back and upload new data. Proves ongoing value, not one-time novelty. The product becomes part of their monthly rhythm.
- **The Upgrade Trigger** — Free users convert to Pro after seeing the AI preview. Validates that the paywall sits at the right value boundary.

### Portfolio Success Metrics

- **The 30-Second Test** — `docker compose up` works first try, seed data loads, dashboard renders with AI summary visible. Hiring manager sees a working product in under a minute.
- **The README Test** — README tells a compelling story in case study format (Problem, Insight, Solution, Result, What I'd Change) that maps directly to common interview questions.
- **The Code Review Test** — A senior engineer can open any file and find thoughtful patterns: error handling, prompt construction, webhook lifecycle, feature-based folder structure. No console.log error handling, no default favicons, no unused boilerplate.
- **The Interview Test** — Every architectural choice has a documented trade-off explainable in 60 seconds.

### Business Objectives

- Demonstrate full-stack engineering depth across auth, payments, data pipeline, AI integration, and DevOps in a single cohesive product
- Create a portfolio piece that generates interview opportunities by telling a compelling engineering story
- Build something real people can use, turning actual usage into the strongest portfolio evidence

### Key Performance Indicators

**Engineering Requirements** (guaranteed on day one):

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| Docker first-run success | 100% | If it fails, they close the tab |
| Upload-to-insight completion | 100% | Every upload produces an AI summary |
| Analytics event instrumentation | Shipped | `user_events` table tracks key actions — upload, view summary, share, export, upgrade |
| Seed data + demo mode | Functional | Never show an empty dashboard |

**Validation Metrics** (measured with real users, instrumentation built to answer these):

| Question | What It Validates | How It's Measured |
|----------|-------------------|-------------------|
| Do users share insights? | Acquisition bridge works | `share` events in `user_events` |
| Do users return next month? | Ongoing value, not novelty | Repeat `upload` events per user per month |
| Do free users upgrade after AI preview? | Paywall placement is correct | `upgrade` events correlated with `ai_preview_view` |
| Do users open the transparency panel? | AI trust and differentiation | `transparency_panel_open` events |

---

## MVP Scope

### Core Features

**Authentication & Authorization**
- JWT access tokens + refresh token rotation
- Google OAuth integration
- Protected routes with middleware
- Organization-first data model — orgs as first-class entities, users have membership, all queries scoped by org_id
- Multi-user accounts with peer-level access within organizations
- Platform admin role with separate admin dashboard

**Data Pipeline**
- CSV upload with polished drag-and-drop zone (idle, hovering, processing, complete, error states)
- Upload preview: first 5 rows, detected column types, row count, warnings
- Strict validation with helpful error messages
- Sample CSV template download
- PostgreSQL storage scoped to organizations

**Visualization**
- Interactive bar chart and line chart
- Filters by date range and category
- Seed data pre-loaded — dashboard is never empty
- Demo mode with banner: "You're viewing sample data. Upload your own to replace it."
- Skeleton loading states matching chart shapes

**AI Smart Summary**
- Hybrid intelligence: local statistical computation (MoM growth, top/bottom categories, outliers) + LLM interpretation of curated context
- Single plain-English summary with actionable business advice
- Transparency panel: "How I reached this conclusion" showing data points, prompt approach, and confidence
- Pro-only feature with preview prompt for free users

**Payments**
- Stripe Checkout integration (test mode, production-identical code)
- Free tier: data visualization. Pro tier: AI interpretation
- `invoice.payment_failed` webhook handler that updates user access
- Subscription lifecycle management

**Share & Export**
- "Share this insight" — renders insight card (chart + AI summary) as PNG
- Shareable link for read-only insight view
- Acquisition bridge: Marcus receives shared insight, signs up on his own terms

**DevOps & Infrastructure**
- Docker Compose: one-command setup with seed data
- Health check endpoint: `{ status, database, aiService, uptime }`
- CI pipeline: lint, typecheck, test, seed-validation, build
- Feature-based folder structure (`src/features/auth/`, `src/features/dashboard/`)
- Analytics events: `user_events` table tracking upload, view, share, export, upgrade

**UI/UX**
- Dark mode with system detection (`prefers-color-scheme`) and manual toggle
- Skeleton loading states
- Helpful empty states with guidance
- Thoughtful error handling throughout — no `console.error(err)` catch blocks

### Out of Scope for MVP

| Feature | Rationale for Deferral |
|---------|----------------------|
| Account linking (OAuth + email collision) | Edge case — document as known trade-off |
| BroadcastChannel logout sync | Deep auth edge case — acknowledge, don't build |
| Multiple file merge / data versioning | Scope constraint — one CSV at a time is sufficient for validation |
| Compare periods toggle | Valuable but not core to the aha moment |
| Multiple AI prompt strategies | Single strategy first — validate insight quality before adding modes |
| Question-the-data interface | High-effort differentiator — future roadmap |
| Grace period on payment failure | 20 lines of code but adds subscription state complexity |
| Admin webhook event log | Ops feature — not needed for portfolio demo |
| Stripe Customer Portal link | Can add in a day — defer for scope discipline |
| Docker monitoring profiles | Over-engineering for MVP |
| Per-chart micro-summaries | Requires per-chart AI calls — cost and complexity concern |
| Guided tour overlay | Polish feature — ship product first |

### MVP Success Criteria

The MVP is complete when all three gates pass:

1. **Docker Gate** — `docker compose up` works on first try. Seed data loads. Dashboard renders with AI summary visible. A reviewer sees a working product in under 60 seconds.
2. **README Gate** — Case study format README is complete: Problem, Insight, Solution, Result, What I'd Change. Hero screenshot of AI summary. Labeled architecture diagram. Challenges section with code links.
3. **Deploy Gate** — Live demo is deployed and accessible via public URL. Pre-loaded with seed data. Fully functional with real auth, real Stripe test mode, real AI summaries.

### Timeline & Sequencing

**Realistic Timeline:** 6-8 weeks of focused solo development.

**Build Sequence** (each layer stabilizes before the next begins):

| Phase | Focus | Dependencies |
|-------|-------|-------------|
| 1 | Auth + Org model | Foundation — everything depends on this |
| 2 | Data Pipeline | Needs auth for user-scoped uploads |
| 3 | Visualization | Needs data in the database to render |
| 4 | AI Summary | Needs computed stats from stored data |
| 5 | Payments | Needs auth for subscription state, gates AI |
| 6 | Share/Export | Needs charts + AI summary to render as PNG |
| 7 | DevOps polish | Docker, CI, health check, seed data finalization |
| 8 | UI polish | Dark mode, skeletons, empty states, error handling |
| 9 | README + Deploy | Case study README, architecture diagram, live deploy |

**Risk Note:** Four integration boundaries (OAuth, Stripe webhooks, LLM API, server-side PNG rendering) each carry "lost afternoon" risk. Sequential build order prevents compound debugging across unstable boundaries.

**Scope Honesty:** This is a v1.0, not a traditional MVP. 17 features across 8 categories. The term "MVP" is used to distinguish from the future roadmap, not to imply minimal effort.

### Future Vision

**Post-MVP Enhancements (v1.x):**
- Compare periods toggle ("this month vs. last month" with AI comparison)
- Three AI prompt strategies: Executive Summary, Anomaly Detective, Action Items
- Grace period on payment failure (3-day window with banner before revoking Pro)
- Pricing page with Free vs. Pro comparison table
- Stripe Customer Portal link for subscription management
- Admin webhook event log for observability

**Future Roadmap (v2.0+):**
- Ask-the-data question interface ("Why did revenue drop in April?")
- Per-chart micro-summaries (each chart gets its own AI interpretation)
- Google Sheets API integration (paste a sheet URL instead of uploading CSV)
- Data versioning and changelog (upload history with rollback)
- Smart column mapping on CSV mismatch
- GitHub-style data health heatmap
- Mobile priority reflow (AI summary first, metrics second, charts third)
- Guided tour overlay for first-time users
