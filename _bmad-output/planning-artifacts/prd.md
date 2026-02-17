---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'validation-self-consistency', 'validation-pre-mortem', 'party-mode-stress-test']
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-saas-analytics-dashboard-2026-02-14.md
  - _bmad-output/brainstorming/brainstorming-session-2026-02-12.md
  - _bmad-output/planning-artifacts/research/competitive-financial-analytics-research-2026-02-17.md
workflowType: 'prd'
documentCounts:
  briefs: 1
  research: 0
  brainstorming: 1
  projectDocs: 0
classification:
  projectType: saas_b2b
  domain: general
  domainComplexity: low
  technicalComplexity: medium
  projectContext: greenfield
---

# Product Requirements Document - SaaS Analytics Dashboard

**Author:** Corey
**Date:** 2026-02-14

## Executive Summary

**Product:** SaaS Analytics Dashboard — AI-powered business analytics for small business owners.

**Problem:** Small business owners drown in spreadsheet data but lack the analytical skills to extract actionable insights. They export CSVs from Square, QuickBooks, or Shopify, then stare at rows of numbers hoping patterns emerge.

**Solution:** Upload a CSV, get a plain-English AI interpretation. The system computes statistical analysis locally (month-over-month growth, outlier detection, category ranking) and sends curated context — never raw data — to an LLM that produces actionable business insights.

**Differentiator:** Interpretation, not just visualization. The hybrid intelligence architecture (local computation + LLM interpretation) is the product thesis. Every architectural decision flows from this.

**Target Users:** David (operations partner, uploads data weekly, laptop) and Marcus (business owner, reads AI summaries monthly, mobile). Data belongs to the organization, not the individual.

**Portfolio Context:** This is a portfolio project demonstrating production thinking. The primary business success metric is: a hiring manager runs `docker compose up`, sees a working product with meaningful AI output, and adds Corey to the interview shortlist.

## Success Criteria

### User Success

- **The Reading Signal (Primary Leading Indicator)** — Users spend 10+ seconds on the AI summary section. This is the atomic unit of value delivery — if they're not reading, nothing else matters. Tracked via `ai_summary_view` event with duration threshold. On mobile viewports, this specifically captures Marcus's monthly check-in behavior.
- **The Insight Action** — AI summary produces at least one non-obvious insight per analysis that a user shares or exports. Tracked via `share` and `export` events.
- **The Aha Moment** — The AI reveals something the user didn't know: a cost trend, seasonal pattern, or category shift. Measured via transparency panel opens, time on AI summary, and share actions.
- **The Return Signal** — Users come back and upload new data the following month. Proves ongoing value, not one-time novelty. Tracked via repeat `upload` events per user per month.
- **The Upgrade Trigger** — Free users convert to Pro after seeing the AI preview. Validates the paywall sits at the right value boundary. Tracked via `upgrade` events correlated with `ai_preview_view`.

### Business Success

- **Portfolio Success (primary goal):** Three binary gates — Docker first-run works, README tells a compelling story, live demo is deployed with seed data. A hiring manager sees a working product in 60 seconds.
- **Validation Bonus (nice to have):** 3-5 real users upload their own data and return the following month. Not a shipping requirement, but an interview story: "real people used this."

### Technical Success

| Metric | Target | Rationale |
|--------|--------|-----------|
| Docker first-run success | 100% | If it fails, they close the tab |
| Upload-to-insight completion | 100% | Every upload produces an AI summary |
| Seed data AI quality | 2+ actionable insights | Seed data produces meaningful AI summary (CI-testable) |
| Analytics event instrumentation | Shipped | `user_events` tracks upload, view, share, export, upgrade, ai_summary_view |
| Seed data + demo mode | Functional | Never show an empty dashboard |
| **Critical path dependency** | **Auth + Org model stable within 2 weeks** | **If Auth slips past week 2, the 8-week timeline compresses downstream. This is the highest-risk phase.** |

Performance targets (load times, latency, error rates) are defined in Non-Functional Requirements below.

### Measurable Outcomes

| Signal | What It Validates | How It's Measured |
|--------|-------------------|-------------------|
| Users read AI summary (10s+) | Core value delivery works | `ai_summary_view` duration > 10s |
| Users read on mobile | Marcus persona served | `ai_summary_view` on mobile viewports |
| Users share insights | Acquisition bridge works | `share` events in `user_events` |
| Users return next month | Ongoing value, not novelty | Repeat `upload` events per user per month |
| Free users upgrade after AI preview | Paywall placement is correct | `upgrade` events correlated with `ai_preview_view` |
| Users open transparency panel | AI trust and differentiation | `transparency_panel_open` events |

## Product Scope

### MVP Strategy

**Approach:** Problem-Solving MVP — deliver the core value loop (upload data → see AI interpretation) with enough polish to demonstrate production thinking. The product thesis is testable with the minimum feature set: if users read the AI summary and come back next month, the thesis works.

**Resource Requirements:** Solo developer, 6-8 weeks. Sequential build order: Auth → Data → Viz → AI → Payments → Share → DevOps → UI → README.

### MVP-Core (Product Thesis — Must Ship)

These features define the product. Without them, there's nothing to demo.

- **Authentication & Authorization** — JWT + refresh rotation, Google OAuth, org-first multi-tenant model, RBAC with conditional rendering
- **Data Pipeline** — CSV upload with drag-drop zone, upload preview (first 5 rows, detected types, row count), strict validation with helpful errors, sample CSV template download, PostgreSQL storage scoped to orgs
- **Visualization** — Interactive bar/line charts, date range and category filters, seed data pre-loaded, demo mode with banner ("You're viewing sample data"), skeleton loading states
- **AI Smart Summary** — Hybrid intelligence (local stats + LLM interpretation), single plain-English summary delivered via SSE streaming, transparency panel ("How I reached this conclusion"), Pro-only with free preview prompt. Streaming requires: SSE endpoint, chunked response handling, progressive DOM rendering, error recovery mid-stream.
- **DevOps & Infrastructure** — Docker Compose one-command setup with seed data, health check endpoint, CI pipeline (lint, typecheck, test, seed-validation, build), feature-based folder structure, analytics events table
- **README & Deploy** — Case study format README, hero screenshot, labeled architecture diagram, challenges with code links, live deploy with seed data

### MVP-Core Completion Gate

Before starting any `[Complete]` FR, all `[Core]` FRs must be implemented and tested, and the three success gates (Docker Gate, README Gate, Deploy Gate) must pass. The README Gate at this checkpoint requires structural completeness (section headers, architecture diagram placeholder, hero screenshot placeholder) — full case study prose is written last during the README & Deploy phase. This checkpoint prevents scope creep from consuming the timeline. If Core isn't done, Complete doesn't start.

### MVP-Complete (Ships If Timeline Holds)

These features complete the product but can defer gracefully without breaking the core value loop. If week 7 arrives and something's slipping, these are the release valve.

- **Payments** — Stripe Checkout (test mode, production-identical code), Free/Pro tiers, `invoice.payment_failed` webhook, subscription lifecycle management. *Deferral path: paywall can be a config flag initially; Stripe integration adds real billing but the product works without it.*
- **Share & Export** — Insight card rendered as PNG, shareable read-only link, acquisition bridge. *Deferral path: acquisition bridge is valuable but not core value delivery. Screenshots serve as manual workaround.*
- **Dark Mode** — System detection (`prefers-color-scheme`) + manual toggle, CSS custom properties. *Deferral path: table stakes in 2026 but not load-bearing for the demo.*
- **Platform Admin Role** — Separate admin dashboard, user management across orgs, system health. *Deferral path: demo/portfolio feature, not user-facing.*
- **UI Polish** — Helpful empty states, thoughtful error handling throughout. *Note: error handling on core flows (auth, upload, AI) ships with MVP-Core. This covers edge-case polish.*

### Strategic Direction: Option C — CSV Now, Financial APIs Later

**Decision (2026-02-17):** Based on supplementary competitive research (`research/competitive-financial-analytics-research-2026-02-17.md`), the product adopts a "ship the wedge, architect for the platform" strategy:

- **MVP-Core:** CSV upload as the sole data ingestion method. Proves the AI interpretation engine works with minimal integration complexity. Sufficient for portfolio demo with seed data.
- **Growth-tier:** Financial API integrations (QuickBooks Online, Xero, Stripe, Plaid/bank feeds) as the commercial unlock. The architecture must design the data ingestion layer as a pluggable adapter interface so these integrations slot in without rearchitecting.
- **Data model implication:** Normalize ingested data to a common schema regardless of source. Curation logic operates on normalized data, source-agnostic.
- **Positioning shift:** The product's commercial positioning tightens from "general business data analytics" to "AI-powered financial co-pilot for 1-50 person businesses" — but the MVP-Core scope does not change. CSV upload with general business data (including but not limited to financial data) remains the v1 experience.

**Rationale:** The competitive landscape shows no product combining AI narratives + financial depth + simple UX at SMB pricing ($49-149/mo). CSV upload demonstrates the pattern; financial integrations unlock the $12.49B financial analytics market. See full analysis in the supplementary research artifact.

### Growth Features (Post-MVP)

- **Financial API integrations** — QuickBooks Online, Xero, Stripe, Plaid/bank feed adapters behind the pluggable data source interface
- Compare periods toggle ("this month vs. last month" with AI comparison)
- Three AI prompt strategies: Executive Summary, Anomaly Detective, Action Items
- Grace period on payment failure (3-day window with banner before revoking Pro)
- Pricing page with Free vs. Pro comparison table
- Stripe Customer Portal link for subscription management
- Admin webhook event log for observability

### Vision (Future)

- Ask-the-data question interface ("Why did revenue drop in April?")
- Per-chart micro-summaries (each chart gets its own AI interpretation)
- Google Sheets API integration (paste a sheet URL instead of uploading CSV)
- Data versioning and changelog (upload history with rollback)
- Smart column mapping on CSV mismatch
- GitHub-style data health heatmap
- Guided tour overlay for first-time users
- Vertical-specific financial templates (agencies, e-commerce, local services, SaaS)

## User Journeys

### Journey 1: David Discovers and Adopts (Primary User — Success Path)

**David, 38, operations partner at Marcus & Sons Landscaping.** It's a Tuesday evening and David is hunched over Google Sheets trying to make sense of three months of Square exports. He's been copying numbers between tabs for an hour. He knows the business is doing "okay" but can't articulate why expenses feel higher this quarter. He Googles "simple business analytics tool" and clicks a live demo link.

**Opening Scene:** David lands on a dashboard already loaded with sample data — charts rendered, AI summary visible. No sign-up wall. He reads the AI summary: "Revenue grew 8% quarter-over-quarter, but fuel expenses increased 22% while job count remained flat — investigate vendor pricing." His eyes widen. That's exactly the kind of thing he's been trying to figure out manually.

**Rising Action:** David clicks "Sign up with Google" — one click, no forms. The demo data persists with a banner: "You're viewing sample data. Upload your own to replace it." He drags his Q4 Square export onto the upload zone. A preview appears: 2,400 rows, 5 columns detected (date, description, amount, category, payment_method), no warnings. He clicks "Confirm Upload."

**Climax:** Charts update with his real numbers. Then the AI summary streams in, word by word: "Residential services revenue declined 8% in November-December, consistent with seasonal patterns. However, equipment rental costs increased 31% over the same period without a corresponding increase in commercial jobs — this suggests cost leakage worth investigating. Your highest-margin category is commercial maintenance at 42% gross margin, up from 35% in Q2." David didn't know about the equipment rental spike. He didn't know commercial maintenance margins had improved. The AI just told him things about his own business he couldn't see in the spreadsheet.

**Resolution:** David hits "Share this insight" and texts Marcus a PNG of the chart with the AI summary. He bookmarks the dashboard. Next month, he uploads January's data without being reminded. The product is now part of his monthly rhythm. After the third month, he upgrades to Pro because the free preview keeps showing him the first sentence of the AI summary and cutting off — he needs the full interpretation.

**Requirements revealed:** Google OAuth, demo mode with seed data, CSV upload with preview, drag-drop zone, real-time chart updates, SSE streaming AI summary, share/export as PNG, Pro upgrade flow, analytics events (upload, view, share, upgrade).

---

### Journey 2: Marcus Receives and Returns (Secondary User — Viral Acquisition Path)

**Marcus, 43, owner of Marcus & Sons Landscaping.** It's Sunday evening. Marcus is on his couch scrolling his phone after a long week of job sites. He gets a text from David: an image of a chart with text underneath it. He reads: "Equipment rental costs up 31% — we should check vendor pricing." Marcus didn't know that. He taps the link below the image.

**Opening Scene:** Marcus lands on a **focused insight card view** — not the full dashboard. Minimal chrome: the AI summary text at the top, the chart below, and a single CTA: "See more insights — create your free account." No navigation, no filters, no complexity. Just the insight that brought him here.

**Rising Action:** Marcus taps "Create your free account" and signs up with Google. The full dashboard loads with the same data David uploaded — because data belongs to the organization, not the individual. Marcus sees the complete AI summary, scrolls through the charts, and reads the transparency panel out of curiosity: "How I reached this conclusion: analyzed 2,400 transactions across 5 categories, computed month-over-month growth rates, identified statistical outliers in equipment rental category."

**Climax:** Marcus spends 45 seconds reading the AI summary on his phone. He doesn't interact with filters or charts — he reads the three paragraphs, nods, and makes a mental note to call the equipment rental company Monday morning. The product delivered its core value in under a minute on a mobile screen.

**Resolution:** Marcus checks back the following month when David uploads February data. He spends 30 seconds reading the new summary. Over time, Marcus checks every month — not because David reminds him, but because the AI consistently catches things he'd miss. He never uploads data himself. He never touches filters. He reads the summary and acts on it. That's his entire interaction, and it's exactly enough.

**Requirements revealed:** Focused insight card view for shared links (not full dashboard), mobile-first AI summary (above the fold), org-level data sharing (not user-scoped), Google OAuth, `ai_summary_view` tracking on mobile viewports, transparency panel, single CTA conversion flow.

---

### Journey 3: David Hits a Wall (Primary User — Error/Edge Case)

**David uploads a CSV that doesn't match the expected format.** He exported from a different tool this month — the columns are named differently and there's an extra column with notes.

**Opening Scene:** David drags the file onto the upload zone. The preview appears but with a red warning: "Expected columns: date, amount, category. Found: Date, Total, Type, Notes. Your file doesn't match the expected format."

**Rising Action:** The error message is specific and helpful — not a stack trace, not "something went wrong." Below the warning, a clear path forward: "Download our sample CSV template to see the expected format." David clicks the link and downloads the template. He opens it alongside his export, reformats the column headers to match, removes the Notes column, and re-uploads.

**Climax:** Second upload: full preview, 1,800 rows, 3 columns detected (date, amount, category), no warnings. He clicks "Confirm Upload." Charts render. AI summary streams in with 3 actionable insights. The product educated him through precise errors and a concrete fix — he never felt lost.

**Resolution:** David learns the expected format. Next month he exports and reformats correctly the first time. The product's opinionated validation — strict format, helpful errors, template download — turned a frustrating moment into a learning moment. He never saw a 500 error, a generic message, or a blank screen.

**Requirements revealed:** CSV validation with specific, helpful error messages (exact column expectations), sample CSV template download, re-upload flow without losing session state, error states that guide rather than block, no column mapping in MVP (clear errors + template instead).

---

### Journey 4: Platform Admin Monitors the System (Admin User)

**The Platform Admin opens the admin dashboard** to check system health before a planned demo to a potential user.

**Opening Scene:** The admin logs in and sees the admin dashboard — a separate view only visible to admin-role users (absent from DOM for regular users, not CSS-hidden). The dashboard shows: active organizations count, total uploads this week, system health status (database connected, AI service available, uptime).

**Rising Action:** The admin checks the health endpoint: `{ status: "ok", database: "connected", aiService: "available", uptime: "14d 3h" }`. Everything green. They check the user management panel — 2 organizations, 4 users total. They verify seed data is loaded and producing valid AI summaries.

**Climax:** The admin notices one organization has uploaded data but hasn't generated an AI summary — the upload completed but the AI call timed out. They can see this in the analytics events table. They verify the AI service is currently responsive and note the timeout was transient.

**Resolution:** The admin confirms the system is healthy for the demo. The admin dashboard exists to demonstrate RBAC implementation, system observability, and operational awareness — portfolio features that prove production thinking.

**Requirements revealed:** Admin role with conditional rendering (DOM-level, not CSS), admin dashboard with system health, health check endpoint, user management view, analytics events visibility, RBAC enforcement.

---

### Journey 5: The Hiring Manager Evaluates (Evaluator — Portfolio Path)

**Sarah, engineering manager at a mid-size fintech company**, is reviewing candidates for a senior full-stack role. She has 12 GitHub links to review this weekend. She opens Corey's repo.

**Opening Scene:** Sarah reads the repo description: "AI-powered analytics that explains your business data in plain English." Not a tech stack list — a problem statement. She's intrigued. She clicks through to the README.

**Rising Action:** The README opens with a hero screenshot — a tight crop of the AI summary with charts visible behind it. Below: Problem → Insight → Solution → Result → What I'd Change. Sarah reads the problem statement in 15 seconds. She scrolls to the architecture diagram — labeled arrows explain why each piece exists: "API pre-aggregates data so the LLM receives curated context, not raw CSV rows." She nods — that's a real design decision.

She scrolls to "Challenges" — each one links to specific files and line numbers. She clicks through to the AI service file and sees: clean prompt construction, structured error handling with retry logic, response validation, timeout handling. No `console.error(err)` catch blocks. No TODO comments.

**Climax:** Sarah runs `docker compose up`. Thirty seconds later, she's looking at a live dashboard with seed data loaded, charts rendered, and an AI summary that says something specific and actionable about the sample business data. She clicks "How I reached this conclusion" and sees the transparency panel. She traces the data pipeline from CSV upload to AI summary — she sees that raw transaction data is never sent to the LLM. Instead, the server computes month-over-month growth rates, identifies outliers, and ranks categories before constructing a focused prompt. She recognizes the hybrid intelligence architecture as a deliberate design choice, not a shortcut. She checks the CI pipeline — lint, typecheck, test, seed-validation, build. She notices the seed-validation step and thinks: "This person anticipated that seed data could break the demo."

**Resolution:** Sarah bookmarks the repo. She adds Corey to the interview shortlist. In the interview, she asks "Walk me through an architectural decision" — Corey answers with the hybrid AI pipeline in 60 seconds: "Raw data never touches the LLM. The server pre-computes statistics and constructs curated context. The AI interprets intelligence, not data." She asks "What would you change?" — Corey has three specific answers ready. The portfolio project did its job: it got him in the room.

**Requirements revealed:** README case study format, hero screenshot, labeled architecture diagram with data flow, challenges with code links, `docker compose up` first-run success, seed data producing meaningful AI summary, hybrid intelligence pipeline (traceable data flow), CI pipeline with custom steps, clean code patterns throughout, feature-based folder structure.

---

### Journey Requirements Summary

| Journey | Key Capabilities Revealed | Primary FRs |
|---------|--------------------------|-------------|
| David — Success Path | OAuth, demo mode, CSV upload + preview, AI streaming, share/export, upgrade flow | FR1 `[Core]`, FR6 `[Core]`, FR8 `[Core]`, FR16-17 `[Core]`, FR18-19 `[Core]`, FR25 `[Complete]`, FR28 `[Complete]` |
| Marcus — Viral Acquisition | Focused insight card view for shared links, mobile-first AI summary, org-level data, single CTA conversion | FR10 `[Core]`, FR24 `[Core]`, FR27 `[Complete]` |
| David — Error/Edge Case | Specific validation errors, sample template download, re-upload flow, no column mapping (clear errors instead) | FR7 `[Core]`, FR9 `[Core]`, FR12 `[Core]` |
| Platform Admin | RBAC (DOM-level), admin dashboard, health check, user management, analytics events | FR4 `[Complete]`, FR5 `[Core]`, FR32-34 `[Complete]`, FR35 `[Core]` |
| Hiring Manager | Docker first-run, README narrative, architecture diagram, hybrid intelligence data flow, CI pipeline, code quality | FR23 `[Core]`, FR36-39 `[Core]` |

## SaaS B2B Specific Requirements

### Tenant Model

- **Auto-create org on signup** — First user signup creates a personal organization automatically (e.g., "David's Organization"). User can rename in settings. Zero friction between signup and seeing the demo dashboard.
- **Org-first data model** — `org_id` on every data table. All queries scoped by org. Data belongs to organizations, not individual users.
- **Invite link for org membership** — Org members can generate a shareable invite URL. New users who sign up via that link are automatically added to the org. No email domain matching, no admin approval flow.
- **One org per user (MVP)** — Data model uses a many-to-many join table (`user_orgs`) to support multiple orgs in the future, but the UI only handles one org. Documented as known limitation: "Users can belong to one organization in v1. The data model supports multiple orgs for future expansion."
- **Seed data org** — Docker setup creates a demo organization with pre-loaded seed data. First-time visitors see this data. On first upload, user's real data replaces demo data within their org.

### RBAC Matrix

| Role | Scope | Capabilities |
|------|-------|-------------|
| **Platform Admin** | System-wide | View all orgs, user management, system health dashboard, analytics events. Absent from DOM for non-admin users. |
| **Org Member** | Org-scoped | View dashboard, view AI summary, view transparency panel, filter charts, share/export insights, manage account settings. |
| **Org Member (uploader)** | Org-scoped | All Org Member capabilities + upload CSV, manage data, download sample template. This is a behavioral distinction (David uploads, Marcus doesn't), not a permission distinction — both have the capability. |

**Implementation notes:**
- RBAC enforced at API middleware level (not just frontend)
- Admin UI components excluded from DOM via conditional rendering, not CSS display:none
- Role stored in JWT claims for frontend conditional rendering
- API endpoints verify role on every request (don't trust frontend)
- Session refresh is transparent — expired access tokens trigger silent refresh via httpOnly cookie. Users are never interrupted mid-session unless the refresh token has also expired.

### Subscription Tiers

| Tier | Price | Access |
|------|-------|--------|
| **Free** | $0 | Data visualization (charts, filters, demo mode), CSV upload, org membership, share/export |
| **Pro** | TBD (Stripe test mode) | Everything in Free + full AI Smart Summary, transparency panel. Free users see a preview prompt with first sentence, then upgrade CTA. |

**Billing model:**
- Subscription is per-organization, not per-user
- Stripe Checkout in test mode with production-identical code
- `invoice.payment_failed` webhook revokes Pro access
- Subscription status checked on every AI summary request

### Integration Points

| Integration | Type | Purpose | Risk Level |
|-------------|------|---------|------------|
| **Google OAuth** | Authentication | User signup/login | Low — well-documented, standard flow |
| **Stripe** | Payments | Checkout, webhooks, subscription lifecycle | Medium — webhook signature verification, idempotency |
| **LLM API** | AI | Interpret curated statistics into plain-English summaries | Medium — rate limits, latency, cost, response validation |
| **Server-side PNG** | Rendering | Share/export insight cards as images | Medium — headless browser or canvas rendering, memory usage |

**Integration architecture:**
- Each integration wrapped in its own service module (`src/features/auth/`, `src/features/payments/`, etc.)
- All external calls have: timeout handling, retry logic (where appropriate), structured error responses
- No raw external errors exposed to users — every integration failure produces a helpful user-facing message

### Compliance

- **No regulated domain requirements** — No HIPAA, SOC2, GDPR, or PCI compliance needed (Stripe handles PCI). Security requirements defined in Non-Functional Requirements below.

## Risk Mitigation

| Risk | Category | Likelihood | Impact | Mitigation |
|------|----------|-----------|--------|------------|
| Auth + Org model takes > 2 weeks | Technical | Medium | High | Start here first. If week 2 passes without stable auth, defer invite link (FR3) and admin role separation (FR4, FR5 admin path) to MVP-Complete. Ship with Google OAuth + single-role org model. RBAC middleware enforces a single role initially — architecture supports adding admin role later without refactoring. |
| LLM API latency exceeds 15s total | Technical | Medium | Medium | SSE streaming masks perceived latency. Time-to-first-token < 2s is the real UX target. Fallback: pre-computed statistical summary without LLM interpretation. |
| Stripe webhook reliability in test mode | Technical | Low | Medium | Idempotent webhook handlers. Manual subscription status override for demo purposes. Test mode is forgiving. |
| Server-side PNG rendering complexity | Technical | Medium | Low | MVP-Complete tier — can defer to manual screenshots. Canvas-based rendering simpler than headless browser. |
| Scope creep from "one more feature" | Process | High | High | MVP-Core / MVP-Complete split is the release valve. If it's not in MVP-Core, it can wait. Reference this document when tempted. |
| AI summary quality insufficient | Product | Low | High | Seed data AI quality is CI-testable (2+ actionable insights). Hybrid intelligence architecture gives control over prompt quality. Iterate on prompt engineering, not architecture. |
| Free tier value overlap | Product | Low | Low | Free tier delivers visualization only, which overlaps with existing tools. Acceptable for portfolio context where the demo runs at full power with seed data. For real-user validation, consider offering one free AI analysis per month as a Growth feature if conversion data warrants it. |

## Functional Requirements

**Tier key:** `[Core]` = MVP-Core (must ship), `[Complete]` = MVP-Complete (ships if timeline holds)

### Identity & Access

- **FR1:** `[Core]` Users can sign up and sign in using their Google account
- **FR2:** `[Core]` The system automatically creates an organization for first-time users
- **FR3:** `[Core]` Org members can generate an invite link that allows new users to join their organization
- **FR4:** `[Complete]` Platform admins can view and manage all organizations and users system-wide
- **FR5:** `[Core]` The system restricts capabilities based on user role (org member vs. platform admin)

### Data Ingestion

- **FR6:** `[Core]` Users can upload CSV files via drag-and-drop or file picker
- **FR7:** `[Core]` The system validates uploaded CSV files against expected format and displays specific error details when validation fails
- **FR8:** `[Core]` Users can preview uploaded data (row count, detected column types, sample rows) before confirming the upload
- **FR9:** `[Core]` Users can download a sample CSV template showing the expected format
- **FR10:** `[Core]` Uploaded data is stored scoped to the user's organization and visible to all members of that organization
- **FR11:** `[Core]` Users' first upload replaces demo/seed data within their organization
- **FR12:** `[Core]` The system preserves upload flow state so users can correct and re-upload without losing their session

### Visualization & Exploration

- **FR13:** `[Core]` Users can view their business data as interactive charts (bar and line) that refresh when new data is uploaded
- **FR14:** `[Core]` Users can filter chart data by date range and category
- **FR15:** `[Core]` The system displays loading states while data and charts are being prepared
- **FR16:** `[Core]` The system pre-loads seed data so first-time visitors see a populated dashboard
- **FR17:** `[Core]` The system displays a visual indicator when users are viewing demo/sample data

### AI Interpretation

- **FR18:** `[Core]` The system generates a plain-English AI summary interpreting the user's business data
- **FR19:** `[Core]` AI summaries are delivered progressively (streaming) so users see text appearing in real time. *Fallback: if SSE streaming is not functional by the end of the AI phase, ship with synchronous AI response behind a loading state. Streaming can be added as a progressive enhancement without architectural changes.*
- **FR20:** `[Core]` Users can view how the AI reached its conclusions (transparency/methodology panel)
- **FR21:** `[Core]` Free-tier users can see a preview of the AI summary with a prompt to upgrade for full access
- **FR22:** `[Core]` The AI produces at least one non-obvious, actionable insight per analysis. Non-obvious: references a trend, anomaly, or comparison not visible by scanning raw numbers. Actionable: suggests a specific next step (investigate, reduce, expand, compare)
- **FR23:** `[Core]` The system computes statistical analysis locally and sends curated context (not raw data) to the AI service. Computations include at minimum: month-over-month growth rates, category-level comparisons, and statistical outlier detection.
- **FR24:** `[Core]` On mobile viewports, the AI summary is positioned above the fold, before charts and filters

### Sharing & Export

- **FR25:** `[Complete]` Users can share an insight (chart + AI summary) as a rendered image
- **FR26:** `[Complete]` Users can generate a shareable read-only link to a specific insight
- **FR27:** `[Complete]` Recipients of a shared link see a focused insight card view with a single call-to-action to create an account

### Subscription & Billing

- **FR28:** `[Complete]` Users can upgrade their organization from Free to Pro tier
- **FR29:** `[Complete]` The system manages subscription lifecycle (creation, renewal, cancellation) via payment provider
- **FR30:** `[Complete]` The system revokes Pro access when payment fails
- **FR31:** `[Complete]` Subscription status is verified before granting access to Pro-only features

### Platform Administration

- **FR32:** `[Complete]` Platform admins can view system health status (database, AI service, uptime)
- **FR33:** `[Complete]` Platform admins can view analytics events across the system
- **FR34:** `[Complete]` Admin-only interface elements are completely absent from the page for non-admin users
- **FR35:** `[Core]` The system exposes a health check endpoint for monitoring

### Portfolio & DevOps

- **FR36:** `[Core]` The entire application can be launched with a single Docker command including seed data
- **FR37:** `[Core]` The system runs automated checks (lint, type checking, tests, seed validation, build) in CI
- **FR38:** `[Core]` The system includes a README in case-study format with hero screenshot and architecture diagram
- **FR39:** `[Core]` Seed data produces a meaningful AI summary validated in CI for both presence and quality — the summary must contain at least two distinct insight types (e.g., trend identification, anomaly detection, or actionable recommendation)
- **FR40:** `[Core]` The system tracks user behavior events (upload, view, share, export, upgrade, ai_summary_view, transparency_panel_open)

### Appearance

- **FR41:** `[Complete]` Users can switch between light and dark appearance modes, with system preference detection as default

## Non-Functional Requirements

### Performance

- **NFR1:** Dashboard initial page load completes within 3 seconds on 25 Mbps broadband
- **NFR2:** AI summary begins streaming (first token visible) within 2 seconds of request
- **NFR3:** AI summary completes full generation within 15 seconds
- **NFR4:** CSV upload and processing completes within 5 seconds for files under 10MB
- **NFR5:** Chart interactions (filtering, date range changes) respond within 500ms for datasets up to 10,000 rows
- **NFR6:** Shared insight card view loads within 2 seconds (lightweight page, no auth required)

### Security

- **NFR7:** All data in transit is encrypted via HTTPS
- **NFR8:** Access tokens expire within 15 minutes; refresh tokens use httpOnly cookies with rotation
- **NFR9:** Every database query returning user-facing data includes an org_id filter. Queries without org_id scoping fail closed (return empty, not unscoped data)
- **NFR10:** Admin interface elements are excluded from the DOM (not hidden via CSS) for non-admin users
- **NFR11:** API endpoints verify user role on every request independent of frontend state
- **NFR12:** Payment webhook signatures are verified before processing
- **NFR13:** Environment secrets are never committed to version control; `.env.example` documents required variables without values
- **NFR14:** The system rate-limits API requests — authentication endpoints (max 10 attempts per minute per IP), AI generation (max 5 requests per minute per user), and public endpoints (max 60 requests per minute per IP)

### Reliability

- **NFR15:** Docker Compose first-run succeeds on macOS (Apple Silicon and Intel) and Linux (Ubuntu 22.04+) with Docker Engine 24+ and Docker Compose v2. CI includes a Docker build smoke test validating `docker compose up` completes and the health check endpoint returns `status: ok` within 60 seconds. README documents minimum requirements
- **NFR16:** Core user flows (authentication, upload, AI generation, payment) complete with < 1% error rate
- **NFR17:** AI service unavailability produces a graceful degradation message, not a broken UI
- **NFR18:** If AI generation exceeds the timeout threshold (15 seconds, per NFR3), the system terminates the request and displays partial results (if streaming has begun) or a graceful timeout message (if no tokens received)
- **NFR19:** Seed data and demo mode are always available — the dashboard is never empty

### Integration Resilience

- **NFR20:** Each external integration (Google OAuth, Stripe, LLM API, PNG rendering) has timeout handling and structured error responses
- **NFR21:** External service failures produce user-friendly error messages, never raw error payloads
- **NFR22:** Stripe webhook handlers are idempotent — duplicate webhook delivery does not corrupt subscription state
- **NFR23:** LLM API calls include retry logic with backoff for transient failures

### Accessibility (Baseline)

- **NFR24:** Semantic HTML elements used throughout (nav, main, article, section, button — not div-for-everything)
- **NFR25:** Interactive elements are keyboard-navigable
- **NFR26:** Color is not the sole means of conveying information (icons/labels accompany status colors)
- **NFR27:** Pages pass axe-core automated accessibility checks with zero critical violations
