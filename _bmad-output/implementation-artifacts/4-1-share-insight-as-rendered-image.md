# Story 4.1: Share Insight as Rendered Image

Status: done

## Story

As a **business owner**,
I want to share an AI insight (chart + summary) as a PNG image,
so that I can send it to colleagues via messaging apps without requiring them to log in.

## Acceptance Criteria

1. **Given** the AI summary is in the complete state, **When** I click the Share button (visible after streaming completes), **Then** a rendered PNG image is generated combining the chart and AI summary text using `html-to-image` (client-side DOM-to-PNG) (FR25), **And** the PNG rendering has timeout handling and structured error responses (NFR20).

2. **Given** the image is generated, **When** I view the share options, **Then** I can download the PNG or copy it to clipboard.

3. **Given** I am on a mobile viewport, **When** I want to share, **Then** a floating action button (FAB) at bottom-right (48px touch target) replaces the inline share icon.

4. **Given** the share action completes, **When** the analytics event fires, **Then** `share.created` is tracked via `trackClientEvent()` using `ANALYTICS_EVENTS.SHARE_CREATED` (FR40).

5. **Given** a keyboard user wants to share, **When** they navigate to the share controls, **Then** all share actions (download PNG, copy PNG to clipboard) are keyboard-accessible (NFR25).

## Tasks / Subtasks

- [x] **Task 1: Install `html-to-image` library** (AC: 1)
  - [x] `pnpm add html-to-image --filter=web`
  - [x] Verify it works with React 19.2 + Next.js 16

- [x] **Task 2: Build `useShareInsight` hook** (AC: 1, 2, 4)
  - [x] Create `apps/web/lib/hooks/useShareInsight.ts`
  - [x] Accept a `ref` to the DOM node to capture (the card element)
  - [x] `generatePng()` — calls `toPng()` from `html-to-image`, returns blob/dataUrl
  - [x] `downloadPng()` — triggers browser download of the generated image
  - [x] `copyToClipboard()` — writes PNG blob to `navigator.clipboard.write()` (Clipboard API)
  - [x] Track via `trackClientEvent(ANALYTICS_EVENTS.SHARE_CREATED)` from `apps/web/lib/analytics.ts` — resolves to `'share.created'`
  - [x] Timeout handling: wrap `toPng()` in `Promise.race` with configurable timeout (default 10s)
  - [x] Error states: `idle | generating | done | error` — expose via hook return
  - [x] Write tests in `useShareInsight.test.ts`

- [x] **Task 3: Build share menu UI** (AC: 2, 5)
  - [x] Create `apps/web/app/dashboard/ShareMenu.tsx`
  - [x] Two options: "Download PNG" and "Copy to clipboard"
  - [x] Use shadcn `Sheet` (bottom drawer) on mobile, popover/dropdown on desktop
  - [x] Use `useIsMobile()` hook (already exists at `apps/web/lib/hooks/useIsMobile.ts`) for responsive switch
  - [x] All actions keyboard-accessible (Enter/Space triggers, Escape closes)
  - [x] `aria-label` on all interactive elements
  - [x] Loading spinner while `generating`, success toast on `done`, error message on `error`
  - [x] State feedback (`generating` → `done` → `error`) must be screen-reader accessible — use `role="status"` or `aria-live="polite"` on the feedback region
  - [x] `motion-reduce:duration-0` on Sheet slide animation and popover fade (same pattern as TransparencyPanel)
  - [x] Write tests in `ShareMenu.test.tsx`

- [x] **Task 4: Wire share button and capture region** (AC: 1, 3)
  - [x] In `apps/web/app/dashboard/DashboardShell.tsx`, wrap the charts grid + AiSummaryCard region in a single `<div ref={captureRef}>` — this becomes the PNG capture boundary (charts are siblings to AiSummaryCard, not children — the ref must live in DashboardShell)
  - [x] Pass `captureRef` down to AiSummaryCard as a prop (no `forwardRef` needed — just a prop)
  - [x] In `apps/web/app/dashboard/AiSummaryCard.tsx`, replace the disabled Share button placeholder (line ~112 in `PostCompletionFooter`)
  - [x] Extend `PostCompletionFooterProps` to accept share callbacks (`onShare`, `shareState`)
  - [x] On desktop: inline button opens popover
  - [x] On mobile: FAB at bottom-right (48px touch target, `fixed bottom-4 right-4`) opens `Sheet`
  - [x] FAB only renders when `isDone` (streaming complete)
  - [x] Update existing AiSummaryCard and DashboardShell tests for new share integration

- [x] **Task 5: Mobile FAB component** (AC: 3)
  - [x] Create FAB as part of `ShareMenu.tsx` (or separate `ShareFab.tsx` if cleaner)
  - [x] `position: fixed`, `bottom-right`, 48x48px minimum, `z-50`
  - [x] Uses `useIsMobile()` to conditionally render
  - [x] Opens shadcn `Sheet` (already installed) with share options
  - [x] `motion-reduce:duration-0` on animations (a11y, same pattern as TransparencyPanel)

- [x] **Task 6: Integration tests** (AC: 1–5)
  - [x] Test PNG generation with mocked `html-to-image`
  - [x] Test download triggers browser download
  - [x] Test clipboard write succeeds/fails gracefully
  - [x] Test timeout handling fires error state
  - [x] Test analytics event fires on successful share
  - [x] Test keyboard navigation through share menu
  - [x] Test FAB renders on mobile, inline button on desktop

## Dev Notes

### Architecture Compliance

- **Client-side rendering**: The AC explicitly specifies `html-to-image` (client-side DOM-to-PNG). This is NOT server-side rendering. The `pngRenderer.ts` mentioned in architecture is for Story 4.2/4.3 server-side OG image generation — different concern.
- **Privacy-by-architecture**: The PNG capture is purely visual — it screenshots what the user already sees. No raw `DataRow[]` exposure.
- **BFF proxy not needed** for this story — all work is client-side. No new Express routes or API endpoints required.

### Existing Code to Reuse (DO NOT reinvent)

| What | Where | Why |
|------|-------|-----|
| Share button placeholder | `apps/web/app/dashboard/AiSummaryCard.tsx:112-118` | Disabled `<button>` in `PostCompletionFooter` — replace with working version |
| `useIsMobile()` hook | `apps/web/lib/hooks/useIsMobile.ts` | Already built with `useSyncExternalStore` pattern — use for responsive FAB |
| `trackClientEvent()` | `apps/web/lib/analytics.ts` | Fire-and-forget analytics — signature: `trackClientEvent(eventName: string, metadata?: Record<string, unknown>)` |
| `ANALYTICS_EVENTS.SHARE_CREATED` | `packages/shared/src/constants/index.ts:35` | Nested in `ANALYTICS_EVENTS` object — resolves to `'share.created'`. Import the object, not a bare export. |
| shadcn `Sheet` component | `apps/web/components/ui/sheet.tsx` | Mobile bottom drawer — already installed in Epic 4 prep |
| `cn()` utility | `apps/web/lib/utils.ts` | Tailwind class merging — standard pattern |
| shadcn `Sheet` (mobile drawer) | `apps/web/components/ui/sheet.tsx` + `DashboardShell.tsx:230` | Use `SheetContent side="bottom"` — same pattern as TransparencyPanel. Do NOT use native `BottomSheet.tsx` (legacy workaround from Story 3.6; shadcn Sheet is the standard going forward). |

### Patterns Established in Previous Stories

- **`useSyncExternalStore`** for browser API reads (useIsMobile, useReducedMotion) — hydration-safe
- **`motion-reduce:duration-0`** on all animations — a11y requirement from Story 3.6
- **Config/logger mock pattern**: `vi.mock('../../config.js')` + `vi.mock('../../lib/logger.js')` in API tests (not needed here — this story is frontend-only)
- **`within()` scoping + `afterEach(cleanup)`** in component tests — prevents DOM pollution (Story 3.6 lesson)
- **`jsdom` lacks `window.matchMedia`** — mock it in tests using `useIsMobile`

### Technical Decisions

- **`html-to-image` over alternatives**: Lightweight (~8KB), no headless browser, works in React 19. Alternatives (`html2canvas`, `dom-to-image`) are heavier or less maintained. The AC specifies `html-to-image` explicitly.
- **Clipboard API for copy**: `navigator.clipboard.write()` with `ClipboardItem` for PNG blob. Falls back to download-only if Clipboard API unavailable (Safari older versions).
- **No `shares` table needed yet**: This story is client-side PNG generation only. The `shares` DB table, Express routes, and server-side logic come in Story 4.2.
- **Ref-based capture**: Charts (`RevenueChart`, `ExpenseChart`) and `AiSummaryCard` are **siblings** in `DashboardShell`, not parent-child. The capture `ref` must wrap both in `DashboardShell.tsx` — a `<div ref={captureRef}>` around the charts grid + AI card. Pass `captureRef` as a prop to `AiSummaryCard` so the hook can call `toPng(captureRef.current)`. `html-to-image`'s `toPng(node)` captures that DOM subtree.
- **`html-to-image` CORS caveat**: `toPng` uses `foreignObject` in SVG under the hood. Externally-loaded fonts or images (e.g., Google Fonts, CDN images) may be blocked during capture. If charts use only inline SVG (Recharts does), this is a non-issue. Test with the actual dashboard to verify.

### What This Story Does NOT Include

- No shareable links (that's Story 4.2)
- No public shared view (that's Story 4.3)
- No `shares` database table (Story 4.2)
- No Express API routes (Story 4.2)
- No OG meta tags (Story 4.3)
- No server-side PNG rendering (architecture's `pngRenderer.ts` is a Story 4.2/4.3 concern)

### Project Structure Notes

**New files to create:**
```
apps/web/lib/hooks/useShareInsight.ts       — PNG generation hook
apps/web/lib/hooks/useShareInsight.test.ts   — Hook tests
apps/web/app/dashboard/ShareMenu.tsx         — Share menu + FAB component
apps/web/app/dashboard/ShareMenu.test.tsx    — Component tests
```

**Files to modify:**
```
apps/web/app/dashboard/DashboardShell.tsx      — Add capture ref wrapping charts + AI card
apps/web/app/dashboard/DashboardShell.test.tsx — Update tests for capture ref
apps/web/app/dashboard/AiSummaryCard.tsx       — Wire share button, accept captureRef prop
apps/web/app/dashboard/AiSummaryCard.test.tsx  — Update tests for share integration
apps/web/package.json                          — Add html-to-image dependency
```

**No changes to:**
- `apps/api/` — this story is entirely frontend
- `packages/shared/` — no new types needed (analytics constants already exist)
- `proxy.ts` — no route protection changes

### Testing Strategy

- **Mock `html-to-image`** at module level: `vi.mock('html-to-image', () => ({ toPng: vi.fn() }))`
- **Mock `navigator.clipboard`** — jsdom doesn't provide it
- **Mock `URL.createObjectURL`** + `URL.revokeObjectURL` for download test
- **Use `matchMedia` mock** from Story 3.6 pattern for mobile/desktop tests
- **Component tests**: Use `@testing-library/react` with `render`, `screen`, `fireEvent`
- **No API mocking needed** — this story has zero server interaction

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 4.1 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR25 mapping, shares table schema]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Share button placement, FAB design, line 253+355-356]
- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-03-14.md — shadcn ready, charts paginated]
- [Source: apps/web/app/dashboard/AiSummaryCard.tsx:112-118 — Share button placeholder]
- [Source: apps/web/lib/hooks/useIsMobile.ts — Mobile detection hook]
- [Source: apps/web/lib/analytics.ts — Client-side analytics]
- [Source: packages/shared/src/constants/index.ts:35 — SHARE_CREATED constant]

## Change Log

- Added `html-to-image` dependency to `apps/web/package.json`
- Created `useShareInsight` hook with PNG generation, download, clipboard copy, timeout handling, and analytics tracking
- Created `ShareMenu` component (desktop popover) and `ShareFab` component (mobile FAB with Sheet)
- Wired share callbacks through `DashboardShell` → `AiSummaryCard` → `PostCompletionFooter`
- Added capture ref in `DashboardShell` wrapping charts grid + AI summary card
- Full test coverage: 10 hook tests, 15 component tests, all passing

### Code Review Fixes (2026-03-24)

- **H1**: ShareFab now gated on AI completion — `visible={hasData && aiDone}` via `onStreamComplete` callback from AiSummaryCard
- **H2+M3**: ShareMenu popover now has click-outside-to-close, focus management on open, Escape returns focus to trigger; removed incorrect `role="menu"`
- **H3+M1**: Added per-action success feedback ("Downloaded!" / "Copied to clipboard!") with 2s auto-dismiss; copy checkmark now reflects actual copy success, not just PNG generation
- **M2**: `generatePng` now skips redundant `toPng()` calls when PNG is already cached in `dataUrlRef`
- **M4**: `pnpm-lock.yaml` documented in File List below
- **L1**: Moved mid-file `ShareMenu` import to top of `AiSummaryCard.tsx`
- **L2**: `downloadPng` now properly attaches/removes `<a>` element to DOM
- **L3**: Timeout timer in `generatePng` now cleaned up via `clearTimeout` on both success and error paths

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

N/A — no debug logs generated (frontend-only story, no API debugging needed)

### Completion Notes List

- All 6 tasks complete with all subtasks
- 255 tests passing (+1 caching test), TypeScript type-check clean
- `html-to-image` verified working with React 19.2 + Next.js 16
- Clipboard API uses `fetch(dataUrl).blob()` conversion pattern
- jsdom test quirks handled: `ClipboardItem` stub, `matchMedia` module mock, async `noop`

### File List

**New files:**
- `apps/web/lib/hooks/useShareInsight.ts` — PNG generation hook
- `apps/web/lib/hooks/useShareInsight.test.ts` — Hook tests (10 tests)
- `apps/web/app/dashboard/ShareMenu.tsx` — Share menu + FAB component
- `apps/web/app/dashboard/ShareMenu.test.tsx` — Component tests (15 tests)

**Modified files:**
- `apps/web/package.json` — Added `html-to-image` dependency
- `pnpm-lock.yaml` — Lockfile updated for html-to-image
- `apps/web/app/dashboard/DashboardShell.tsx` — Capture ref, share hook, ShareFab, aiDone state
- `apps/web/app/dashboard/DashboardShell.test.tsx` — Mocks for ShareMenu + useShareInsight
- `apps/web/app/dashboard/AiSummaryCard.tsx` — Share props threading, ShareMenu integration, onStreamComplete callback
- `apps/web/app/dashboard/AiSummaryCard.test.tsx` — useIsMobile mock for ShareMenu import
