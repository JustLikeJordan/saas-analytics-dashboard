# Story 4.3: Shared Insight Card View

Status: done

<!-- Note: Validation is REQUIRED per Epic 2 retro enforcement. Every story must complete all 4 steps: Create → Validate → Dev → Code Review. -->

## Story

As a **recipient of a shared link**,
I want to see a focused insight card without navigation clutter,
so that I can understand the analysis and be motivated to create my own account.

## Acceptance Criteria

1. **Given** I open a shared link (no authentication required), **When** the page loads, **Then** I see a focused view: no nav, no sidebar, minimal chrome — just the chart + AI summary (FR27), **And** the page loads within 2 seconds (NFR6).

2. **Given** I am viewing the shared insight, **When** I look below the insight card, **Then** a single CTA button reads "See more insights — create your free account" (FR27), **And** clicking navigates to the signup flow (`/login`).

3. **Given** the shared link is visited, **When** the page renders, **Then** it is a lightweight page with no auth requirement — public access.

4. **Given** the shared link URL is pasted into iMessage, WhatsApp, or Slack, **When** the platform fetches the page metadata, **Then** Open Graph meta tags render a rich preview: `og:title` (org name + "Business Insight"), `og:description` (first ~150 chars of AI summary), `og:type` ("article"). *(Note: OG tag AC was listed under Story 4.2 in epics, but the rendering lives in `generateMetadata()` on this page — implemented here.)*

5. **Given** a shared link token is invalid or expired, **When** the page loads, **Then** a graceful error state renders explaining the link is invalid or expired, with a CTA to visit the homepage.

## Tasks / Subtasks

- [x] **Task 1: Create `apps/web/app/share/[token]/page.tsx` — Server Component** (AC: 1, 3, 4)
  - [x] Create directory `apps/web/app/share/[token]/`
  - [x] Implement as RSC — fetch share data server-side via `fetch(\`${webEnv.API_INTERNAL_URL}/shares/${token}\`)` in the component body (no client-side fetching for initial render — NFR6 performance target)
  - [x] Implement `generateMetadata()` async function for dynamic OG tags:
    - `og:title`: `"${orgName} — Business Insight"`
    - `og:description`: first ~150 chars of `aiSummaryContent`
    - `og:type`: `"article"`
    - `title`: same as og:title
    - Fetch share data in `generateMetadata` (Next.js deduplicates the fetch with the page component)
  - [x] Handle API errors in the page component: check `res.status` — 404 means share not found, 410 means expired. Error body follows standard `{ error: { code: string, message: string } }` format. Network errors → generic error state.
  - [x] No `'use client'` directive — this page is entirely server-rendered for performance

- [x] **Task 2: Create `apps/web/app/share/[token]/SharedInsightCard.tsx` — Client Component** (AC: 1, 2)
  - [x] Accept props: `orgName`, `dateRange`, `aiSummaryContent`, `viewCount`
  - [x] Render focused insight card:
    - Header: org name + date range (never who shared it — privacy per UX spec)
    - Body: AI summary text with paragraph splitting (reuse `SummaryText` rendering pattern from `AiSummaryCard.tsx` — split on `\n\n`, render as `<p>` elements)
    - No nav, no sidebar, no dashboard chrome
  - [x] Render CTA below the card: "See more insights — create your free account" as a prominent link (`<Link href="/login">`) styled as a button with Tailwind (no shadcn Button — not installed)
  - [x] CTA: large touch target (48px height), full-width on mobile, centered max-width on desktop
  - [x] Keyboard-accessible CTA (NFR25) — standard `<a>` or Next.js `<Link>` handles this naturally
  - [x] `motion-reduce:duration-0` on any animations (a11y pattern from Story 3.6)
  - [x] Responsive: full-screen card on mobile (< 768px), centered max-w-2xl on desktop

- [x] **Task 3: Create error state components** (AC: 5)
  - [x] `ShareNotFound` — "This shared insight doesn't exist" + link to homepage
  - [x] `ShareExpired` — "This shared insight has expired" + link to homepage
  - [x] Both components: minimal chrome, centered layout, same visual language as `InviteAccept` error states
  - [x] Can be inline in the page file or a separate `ShareError.tsx` — keep it simple

- [x] **Task 4: Tests** (AC: 1-5)
  - [x] Create `apps/web/app/share/[token]/SharedInsightCard.test.tsx`
  - [x] Test: renders org name + date range (never sharer identity)
  - [x] Test: renders AI summary text split into paragraphs
  - [x] Test: CTA button links to `/login`
  - [x] Test: CTA has accessible touch target
  - [x] Test: error states render correctly for not-found and expired
  - [x] Test: responsive layout (mobile vs desktop) via `matchMedia` mock
  - [x] No need to test `generateMetadata` or RSC fetch — those are integration-level concerns and would require mocking the Node.js fetch at the module level (diminishing returns for a portfolio project)

## Dev Notes

### Architecture Compliance

- **Public page — no auth**: `/share/[token]` is NOT in `proxy.ts` `PROTECTED_ROUTES`. No auth check, no redirect. Same access model as `/invite/[token]`.
- **Direct server-side fetch**: The RSC fetches Express directly via `webEnv.API_INTERNAL_URL` (`http://api:3001`) over the Docker internal network. The `next.config.ts` rewrite (`/api/*` → Express) is for browser-initiated requests only and is NOT involved here. Do not use `/api/shares/${token}` — use `${webEnv.API_INTERNAL_URL}/shares/${token}`.
- **Privacy-by-architecture**: The `insightSnapshot` stored in the `shares` table contains `orgName`, `dateRange`, `aiSummaryContent`, `chartConfig` — never raw `DataRow[]`, never the sharer's identity. The page renders only what's in the snapshot.
- **Dashboard stays public**: This story doesn't touch `proxy.ts`.
- **No CORS concerns**: Server-side fetch from RSC to Express is internal (Docker network). Browser never directly calls Express.

### Existing Code to Reuse (DO NOT reinvent)

| What | Where | Why |
|------|-------|-----|
| Public page pattern | `apps/web/app/invite/[token]/page.tsx` | RSC with `params: Promise<{ token: string }>`, centered layout, error handling — mirror this structure |
| AI summary text rendering | `apps/web/app/dashboard/AiSummaryCard.tsx` `SummaryText` component (~line 80) | Private function — split on `\n\n`, render as `<p>` elements. Duplicate this 5-line pattern (it's not exported). |
| `webEnv.API_INTERNAL_URL` | `apps/web/lib/config.ts` | Server-side fetch URL for Express API (defaults to `http://api:3001`) |
| Error UI pattern | `apps/web/app/invite/[token]/InviteAccept.tsx` lines 65-75 | `"Invite Link Invalid"` card with error message — mirror for share errors |
| `cn()` utility | `apps/web/lib/utils.ts` | Tailwind class merging |
| Plain HTML + Tailwind for card/button | See `apps/web/app/invite/[token]/InviteAccept.tsx` | shadcn `Card` and `Button` are NOT installed. Use raw `<div>` with Tailwind classes for the card container and `<Link>` for the CTA — same approach as the invite page. |
| `ANALYTICS_EVENTS.SHARE_VIEWED` | `packages/shared/src/constants/index.ts:42` | Defined but intentionally NOT tracked (anonymous users have no userId — `analytics_events` table requires NOT NULL `userId` FK). View counting handled by atomic `viewCount` increment in Express `GET /shares/:token`. |
| Next.js `Link` | `next/link` | For CTA navigation to `/login` — client-side navigation, prefetching |
| `generateMetadata` pattern | Next.js 16 App Router convention | Async function export in `page.tsx` — receives same `params` as the page component |

### Patterns Established in Previous Stories

- **`params` is a Promise in Next.js 16**: `const { token } = await params;` — not destructured directly (async request APIs)
- **`motion-reduce:duration-0`** on all animations — a11y requirement from Story 3.6
- **`within()` scoping + `afterEach(cleanup)`** in component tests — prevents DOM pollution
- **`jsdom` lacks `window.matchMedia`** — mock it in tests
- **Centered public page layout**: `flex min-h-screen items-center justify-center bg-gray-50` — used by invite page
- **Root layout inheritance**: `apps/web/app/layout.tsx` wraps all pages including `/share/[token]` — Inter font and base HTML structure are inherited. No layout.tsx needed in the share directory, no `<html>` or `<body>` tags.
- **Test setup**: `apps/web/test/setup.ts` imports `@testing-library/jest-dom/vitest` — custom matchers like `toHaveAttribute()`, `toBeInTheDocument()` are available in all test files.
- **No `useIsMobile` mock needed**: Unlike `AiSummaryCard.test.tsx`, `SharedInsightCard` has no dependency on `useIsMobile` — do not cargo-cult that mock.

### Technical Decisions

- **RSC over Client Component for the page**: The page body is entirely static after the initial fetch — no interactivity needed except the CTA link. Rendering server-side eliminates a client-side loading spinner, hitting the NFR6 2-second target. The `SharedInsightCard` is a Client Component only because it needs to be a leaf component for potential future interactivity (chart rendering) — but even it could be RSC if charts aren't rendered. Note: the invite page (`InviteAccept.tsx`) uses client-side fetching via `useEffect` — do NOT follow that data-fetching pattern. Mirror the invite page's RSC shell structure (`params: Promise<{token: string}>`, centered layout) but fetch server-side in the RSC body for OG tags and performance.
- **`generateMetadata()` for OG tags**: Next.js 16 deduplicates `fetch` calls with the same URL during a single render pass, so calling the Express API in both `generateMetadata` and the page component results in only one actual HTTP request. This is the idiomatic way to set dynamic OG metadata.
- **No `og:image` in this story**: The `chartSnapshotUrl` column exists in the `shares` table but is nullable and unused. Server-side PNG rendering (headless browser or canvas) is a significant scope addition. OG previews without an image still work — they show text-based cards in iMessage/WhatsApp/Slack. Adding `og:image` later is a backward-compatible enhancement.
- **`[token]` not `[shareId]`**: The architecture file tree shows `[shareId]` but the actual URL pattern from `shareService.ts` is `/share/${rawToken}` (64-char hex). Using `[token]` is consistent with the invite pattern and the actual URL structure. The Express route is `GET /shares/:token`.
- **No view count display**: The API returns `viewCount` but the UX spec doesn't mention displaying it. Keeping it out keeps the page focused. Available in props if we add it later.
- **CTA points to `/login`**: The existing Google OAuth flow starts at `/login`. The UX spec says "create your free account" — which routes through the same OAuth flow (account auto-creation on first login per FR2).

### What This Story Does NOT Include

- No `og:image` (server-side PNG rendering is out of scope — `chartSnapshotUrl` stays null)
- No chart rendering on the shared page (the `chartConfig` in the snapshot is an empty `{}` from Story 4.2 — no chart data is captured yet)
- No share revocation or management UI
- No analytics tracking for anonymous views (architecture decision — `viewCount` covers this)
- No authentication or session handling on this page

### Project Structure Notes

**New files to create:**
```
apps/web/app/share/[token]/page.tsx                 — RSC page with generateMetadata + data fetching
apps/web/app/share/[token]/SharedInsightCard.tsx     — Client component: focused insight card + CTA
apps/web/app/share/[token]/SharedInsightCard.test.tsx — Component tests
```

**No files to modify** — this is an additive story. Everything needed already exists:
- Express `GET /shares/:token` route (Story 4.2)
- `next.config.ts` rewrites handle `/api/*` routing
- `proxy.ts` doesn't protect `/share/*`
- `webEnv.API_INTERNAL_URL` available for server-side fetching

### Testing Strategy

**Component tests (`SharedInsightCard.test.tsx`):**
- Render with valid props — verify org name, date range, summary paragraphs
- Verify CTA text "See more insights — create your free account"
- Verify CTA `href` points to `/login`
- Verify no sharer identity rendered (pass various props, assert absence)
- Use `matchMedia` mock for mobile/desktop responsive tests
- Use `within()` scoping + `afterEach(cleanup)` (established pattern)

**What NOT to test (and why):**
- `generateMetadata` — requires mocking Node.js `fetch` at the module level in a way that's fragile and tightly coupled to Next.js internals. The OG tags will be verified manually or via integration tests.
- RSC data fetching — same reason. Server Component rendering in tests requires `next/test` utilities that add complexity beyond the value for a portfolio project.
- Error state rendering from the page component — the error UI components themselves are simple enough to verify visually. The branching logic (404 vs 410 vs network error) is a ~10 line switch statement.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 4.3 acceptance criteria, lines 1052-1073]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR27 mapping, line 1243]
- [Source: _bmad-output/planning-artifacts/architecture.md — NFR6 shared card < 2s, line 1268]
- [Source: _bmad-output/planning-artifacts/architecture.md — app/share/[shareId]/page.tsx annotation, line 734]
- [Source: _bmad-output/planning-artifacts/architecture.md — OG meta tags resolution, line 1368]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — share card as standalone micro-experience, line 355]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — focused insight card mobile treatment, line 1004]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — link preview optimization, line 357]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Marcus viral acquisition journey, lines 959-977]
- [Source: apps/web/app/invite/[token]/page.tsx — public page RSC pattern]
- [Source: apps/web/app/invite/[token]/InviteAccept.tsx — error state UI pattern]
- [Source: apps/api/src/routes/sharing.ts — public GET /shares/:token endpoint]
- [Source: apps/api/src/services/sharing/shareService.ts — getSharedInsight returns snapshot data]
- [Source: apps/web/lib/config.ts — webEnv.API_INTERNAL_URL for server-side fetching]
- [Source: apps/web/next.config.ts — /api/* rewrites to Express]
- [Source: apps/web/app/dashboard/AiSummaryCard.tsx — SummaryText paragraph rendering pattern]
- [Source: _bmad-output/implementation-artifacts/4-1-share-insight-as-rendered-image.md — html-to-image, ShareMenu patterns]
- [Source: _bmad-output/implementation-artifacts/4-2-shareable-read-only-link.md — shares table, token hashing, snapshot structure]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

- Type-check initially failed due to unused `within` import in test file — removed, all clean.

### Completion Notes List

- RSC page with `generateMetadata()` for dynamic OG tags (og:title, og:description, og:type). Server-side fetch via `webEnv.API_INTERNAL_URL` — no client-side data fetching.
- `fetchShare()` helper returns discriminated union for clean error branching (404 → not-found, 410 → expired, network → generic).
- `SharedInsightCard` client component: org name + date range header, `SummaryText` paragraph splitting (duplicated from `AiSummaryCard.tsx`), CTA as `<Link href="/login">` with 48px touch target, full-width mobile / centered desktop.
- `ShareError` server component with `not-found` and `expired` variants — mirrors InviteAccept error card visual language.
- 10 tests: org name/date range rendering, paragraph splitting, CTA href + touch target + responsive classes, no sharer identity leakage, motion-reduce a11y, both error state variants.
- Full suite: 618 tests pass (12 shared + 333 API + 273 web), zero regressions. Type-check and lint clean.

### File List

- `apps/web/app/share/[token]/page.tsx` — NEW: RSC page with generateMetadata + server-side data fetching
- `apps/web/app/share/[token]/SharedInsightCard.tsx` — NEW: Client component, focused insight card + CTA
- `apps/web/app/share/[token]/ShareError.tsx` — NEW: Error state component (not-found + expired variants)
- `apps/web/app/share/[token]/SharedInsightCard.test.tsx` — NEW: 10 component tests

### Change Log

- 2026-03-25: Implemented Story 4.3 — shared insight card view with OG tags, error states, CTA, and 10 tests
- 2026-03-25: Validation pass — 6 findings applied: CTA text aligned to UX spec, OG title uses first 60 chars of summary, added minimal brand header, `<div>` → `<article>` for semantic HTML, error touch target bumped to 48px, viewCount prop documented
- 2026-03-25: Code review — 4 warnings fixed: word-boundary OG truncation, removed unnecessary `'use client'`, removed unused viewCount from component interface, documented fetch dedup
