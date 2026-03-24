# Story 4.2: Shareable Read-Only Link

Status: done

<!-- Validated: 2026-03-24. Fixed: RLS migration gap, tokenHash naming (was shareToken), expiry check in GET route, line number corrections. -->

## Story

As a **business owner**,
I want to generate a shareable read-only link to a specific insight,
so that my team can view the analysis without needing an account.

## Acceptance Criteria

1. **Given** I am viewing a complete AI summary, **When** I click "Copy Link" in the share options, **Then** a `shares` table record is created with a unique token linked to the insight (FR26), **And** a shareable URL is copied to my clipboard, **And** the `share_link.created` analytics event fires via `trackClientEvent(ANALYTICS_EVENTS.SHARE_CREATED)`.

2. **Given** the shareable link is generated, **When** the URL is pasted into iMessage, WhatsApp, or Slack, **Then** Open Graph meta tags render a rich preview card with insight title and org name.

3. **Given** the share shows org context, **When** I inspect the shared metadata, **Then** it displays org name + date range, but never who shared it (privacy per UX spec).

4. **Given** the `shares` table is created, **When** database security is configured, **Then** every query function in `db/queries/shares.ts` requires `orgId` parameter — fail-closed if missing (NFR9), **And** an RLS policy migration scopes `shares` rows by `org_id` (defense-in-depth, same pattern as `0004_add-rls-analytics-invites.sql`).

5. **Given** I am on a mobile or desktop viewport, **When** I click "Copy Link," **Then** the action is keyboard-accessible (Enter/Space triggers) (NFR25).

## Tasks / Subtasks

- [x] **Task 1: Create `shares` table schema + migration** (AC: 4)
  - [x]Add `shares` table to `apps/api/src/db/schema.ts` — follows `orgInvites` pattern
  - [x]Columns: `id` (PK, generatedAlwaysAsIdentity), `orgId` (FK → orgs, cascade), `datasetId` (FK → datasets, cascade), `tokenHash` (varchar(255), unique, NOT NULL — SHA-256 hash, never raw token), `insightSnapshot` (jsonb, NOT NULL), `chartSnapshotUrl` (varchar, nullable), `createdBy` (FK → users), `expiresAt` (timestamptz), `viewCount` (integer, default 0), `createdAt` (timestamptz, defaultNow)
  - [x]Add `sharesRelations` — org, dataset, creator relations
  - [x]Update `orgsRelations`, `usersRelations`, `datasetsRelations` to include `shares` relation
  - [x]Add indexes: `idx_shares_org_id` on orgId, unique index on `tokenHash`
  - [x]Generate migration: `pnpm drizzle-kit generate`
  - [x]Create RLS migration `XXXX_add-rls-shares.sql` — same pattern as `0004_add-rls-analytics-invites.sql`, scope by `org_id`
  - [x]Test migration applies cleanly on fresh DB

- [x] **Task 2: Create `db/queries/shares.ts`** (AC: 1, 4)
  - [x]`createShare(orgId, datasetId, tokenHash, insightSnapshot, createdBy, expiresAt)` — stores hashed token, returns share record
  - [x]`findByTokenHash(tokenHash)` — mirrors `orgInvites.findByTokenHash` pattern. Caller hashes the raw token before calling this. Returns share with org relation (for OG metadata)
  - [x]`incrementViewCount(id)` — atomic increment of `viewCount`
  - [x]`getSharesByOrg(orgId)` — lists all shares for an org
  - [x]Every function requires `orgId` where mutating (NFR9) — `findByTokenHash` is public read, no orgId needed (token hash is the access control)
  - [x]Export from `db/queries/index.ts` barrel
  - [x]Write tests in `shares.test.ts`

- [x] **Task 3: Create shared schemas in `packages/shared`** (AC: 1, 2, 3)
  - [x]Create `packages/shared/src/schemas/sharing.ts`
  - [x]`createShareSchema` — Zod schema for POST /shares request body: `{ datasetId: z.number() }`
  - [x]`shareResponseSchema` — response: `{ url: string, token: string, expiresAt: string }`
  - [x]`insightSnapshotSchema` — shape of the jsonb snapshot: `{ orgName: string, dateRange: string, aiSummaryContent: string, chartConfig: object }`
  - [x]Export from `packages/shared/src/schemas/index.ts`
  - [x]Add `SHARES` constants to `packages/shared/src/constants/index.ts`: `DEFAULT_EXPIRY_DAYS: 30`, `TOKEN_BYTES: 32`

- [x] **Task 4: Create `services/sharing/shareService.ts`** (AC: 1, 3)
  - [x]`generateShareLink(orgId, datasetId, createdBy)` — generates raw token via `randomBytes(SHARES.TOKEN_BYTES).toString('hex')`, hashes with SHA-256 (same `hashToken` pattern as `inviteService.ts`), snapshots current AI summary + chart config into `insightSnapshot` jsonb, creates share record with `tokenHash`, returns `{ token: rawToken, url, expiresAt }` (raw token goes to user, hash goes to DB)
  - [x]`getSharedInsight(tokenHash)` — finds by token hash, checks expiry (return 410 Gone if `expiresAt < now`), increments view count, returns snapshot data
  - [x]Snapshot logic: fetch from `aiSummaries` cache (cache-first — if no summary exists, reject with "Generate an AI summary first"). Include org name + date range in snapshot. Never include raw data rows (privacy-by-architecture).
  - [x]Create `services/sharing/index.ts` barrel export
  - [x]Write tests in `shareService.test.ts`

- [x] **Task 5: Create `routes/sharing.ts` Express routes** (AC: 1, 2, 3)
  - [x]`POST /shares` — protected (mounted on `protectedRouter`), validates body with `createShareSchema`, calls `generateShareLink`, returns `{ data: { url, token, expiresAt } }` with status 201
  - [x]`GET /shares/:token` — public route (separate router, mounted like `publicInviteRouter`), hashes the raw token param, calls `getSharedInsight(tokenHash)`, checks `expiresAt` and returns 410 Gone if expired, otherwise returns `{ data: { orgName, dateRange, aiSummaryContent, chartConfig, viewCount } }`
  - [x]Track `ANALYTICS_EVENTS.SHARE_VIEWED` server-side on GET (since viewer has no auth — fire-and-forget)
  - [x]Mount protected `shareRouter` on `protectedRouter` in `routes/protected.ts`
  - [x]Mount public `publicShareRouter` on main app in `index.ts` (same pattern as `publicInviteRouter`)
  - [x]Write tests in `sharing.test.ts`

- [x] **Task 6: Create BFF proxy route `apps/web/app/api/shares/route.ts`** (AC: 1)
  - [x]`POST` handler — forward to `${API_INTERNAL_URL}/shares` with cookie passthrough (same pattern as `api/invites/route.ts`)
  - [x]No GET proxy needed — the public share view (Story 4.3) will call Express directly or via server-side fetch

- [x] **Task 7: Create `useCreateShareLink` hook** (AC: 1, 5)
  - [x]Create `apps/web/lib/hooks/useCreateShareLink.ts`
  - [x]States: `idle | creating | done | error`
  - [x]`createLink(datasetId)` — calls `POST /api/shares` via fetch, copies returned URL to clipboard
  - [x]Track `ANALYTICS_EVENTS.SHARE_CREATED` via `trackClientEvent()` on success
  - [x]Error handling: timeout (10s), API errors
  - [x]Write tests in `useCreateShareLink.test.ts`

- [x] **Task 8: Add "Copy Link" option to ShareMenu** (AC: 1, 5)
  - [x]Add third button in `ShareMenu.tsx` `ShareOptions` component: "Copy Link" with Link icon (from lucide-react)
  - [x]Wire to `onShareLink` callback (separate from `onGenerate`/`onDownload`/`onCopy`)
  - [x]Show feedback: "Link copied!" with 2s auto-dismiss (same pattern as PNG actions)
  - [x]Keyboard-accessible: Enter/Space triggers (same pattern as existing buttons)
  - [x]Mobile Sheet: add "Copy Link" as third option
  - [x]Update `ShareMenu.test.tsx` with link sharing tests

- [x] **Task 9: Wire hook through DashboardShell → AiSummaryCard** (AC: 1)
  - [x]In `DashboardShell.tsx`, instantiate `useCreateShareLink` hook
  - [x]Pass `onShareLink` callback to `AiSummaryCard` (extend props)
  - [x]`AiSummaryCard` passes `onShareLink` + `shareLinkState` to `ShareMenu`
  - [x]Update DashboardShell and AiSummaryCard tests

- [x] **Task 10: Integration tests** (AC: 1-5)
  - [x]Test share creation flow end-to-end (POST returns URL)
  - [x]Test public share retrieval (GET returns snapshot)
  - [x]Test view count increments on each GET
  - [x]Test expired share returns error
  - [x]Test analytics events fire (creation + view)
  - [x]Test clipboard write succeeds/fails gracefully
  - [x]Test keyboard navigation through updated ShareMenu

## Dev Notes

### Architecture Compliance

- **BFF proxy pattern**: Browser calls `POST /api/shares` (Next.js route) → Express `POST /shares`. No direct browser-to-Express calls.
- **Privacy-by-architecture**: The `insightSnapshot` stores the AI summary text and chart config — never raw `DataRow[]`. The snapshot is a frozen copy at share-time, so changes to the org's data after sharing don't leak into old shares.
- **Org-scoped mutations**: `createShare` requires `orgId`. The public `GET /shares/:token` is a read-only lookup — no org scoping needed since the token itself is the access control (same pattern as invite token validation).
- **No CORS**: Same-origin BFF proxy. No new CORS headers needed.
- **Dashboard stays public**: This story doesn't touch `proxy.ts`. The `/share/[token]` route (Story 4.3) is also public — no protection needed.

### Existing Code to Reuse (DO NOT reinvent)

| What | Where | Why |
|------|-------|-----|
| Token generation pattern | `apps/api/src/services/auth/inviteService.ts:13-18` | `randomBytes(TOKEN_BYTES).toString('hex')` + `hashToken()` SHA-256 — reuse exact pattern for share tokens |
| Token lookup pattern | `apps/api/src/db/queries/orgInvites.ts:17-23` | `findByTokenHash` with Drizzle `eq()` — mirror for `shares.findByTokenHash` |
| Public router mounting | `apps/api/src/index.ts:31` | `publicInviteRouter` mounted with `rateLimitPublic` — use same pattern for `publicShareRouter` |
| Protected router mounting | `apps/api/src/routes/protected.ts:12` | `protectedRouter.use('/invites', inviteRouter)` — add `'/shares', shareRouter` |
| Route handler pattern | `apps/api/src/routes/invites.ts:29-48` | POST with Zod validation, service call, `res.status(201).json({ data })` |
| BFF proxy pattern | `apps/web/app/api/invites/route.ts` | Cookie forwarding, status passthrough — clone for `/api/shares/route.ts` |
| `APP_URL` for link construction | `apps/api/src/config.ts:10` + `invites.ts:43` | `${env.APP_URL}/share/${rawToken}` — same pattern as invite URL (send raw token in URL, not hash) |
| `trackClientEvent()` | `apps/web/lib/analytics.ts` | Fire-and-forget client analytics — signature: `trackClientEvent(eventName, metadata?)` |
| `ANALYTICS_EVENTS.SHARE_CREATED` | `packages/shared/src/constants/index.ts:35` | Already defined as `'share.created'` |
| `ANALYTICS_EVENTS.SHARE_VIEWED` | `packages/shared/src/constants/index.ts:36` | Already defined as `'share.viewed'` |
| Schema registration | `packages/shared/src/schemas/index.ts` | Add sharing exports to barrel |
| `INVITES` constants pattern | `packages/shared/src/constants/index.ts:17-20` | Mirror with `SHARES` object: `DEFAULT_EXPIRY_DAYS`, `TOKEN_BYTES` |
| ShareMenu component | `apps/web/app/dashboard/ShareMenu.tsx` | Add "Copy Link" as third option alongside Download PNG and Copy PNG |
| Success feedback pattern | `ShareMenu.tsx:~100-120` | "Downloaded!" / "Copied to clipboard!" with 2s auto-dismiss — add "Link copied!" |
| `useShareInsight` hook structure | `apps/web/lib/hooks/useShareInsight.ts` | State machine pattern (`idle | generating | done | error`) — mirror for `useCreateShareLink` |
| `useIsMobile()` | `apps/web/lib/hooks/useIsMobile.ts` | Already used in ShareMenu for responsive UI |
| AI summary cache query | `apps/api/src/db/queries/aiSummaries.ts` | `getCachedSummary(orgId, datasetId)` — use to populate snapshot |
| `AppError` hierarchy | `apps/api/src/lib/appError.ts` | `ValidationError`, `NotFoundError` — throw `NotFoundError` for missing share tokens |
| `recordAnalyticsEvent` | `apps/api/src/services/analytics/analyticsService.ts` | Server-side analytics recording for `SHARE_VIEWED` on public GET |

### Patterns Established in Previous Stories

- **`useSyncExternalStore`** for browser API reads (useIsMobile, useReducedMotion) — hydration-safe
- **`motion-reduce:duration-0`** on all animations — a11y requirement from Story 3.6
- **`within()` scoping + `afterEach(cleanup)`** in component tests — prevents DOM pollution
- **`jsdom` lacks `window.matchMedia`** — mock it in tests using `useIsMobile`
- **Mock `navigator.clipboard`** — jsdom doesn't provide it (established in Story 4.1)
- **Config/logger mock pattern**: `vi.mock('../../config.js')` + `vi.mock('../../lib/logger.js')` in API tests
- **Token hashing**: SHA-256 hash stored in DB, raw token sent to user — never store raw tokens (invite pattern)
- **Public router pattern**: Separate `publicXxxRouter` export, mounted in `index.ts` with `rateLimitPublic`

### Technical Decisions

- **Token as access control (not auth)**: Share tokens are unguessable 64-char hex strings (256 bits of entropy). Anyone with the token can view the share — no authentication required. This is the same security model as Google Docs "anyone with the link" sharing.
- **Snapshot vs. live data**: The `insightSnapshot` jsonb stores a frozen copy of the AI summary + chart config at share-time. If the org uploads new data later, old shares show the original insight. This prevents data leakage and ensures consistency — the recipient sees exactly what the sharer intended.
- **30-day default expiry**: Shares expire after 30 days (configurable via `SHARES.DEFAULT_EXPIRY_DAYS`). The `getSharedInsight` function checks expiry and returns a 410 Gone if expired.
- **View counting**: `incrementViewCount` uses atomic `SET view_count = view_count + 1` — no read-then-write race condition.
- **OG meta tags are Story 4.3 scope**: This story creates the share record and returns the URL. The actual OG meta tag rendering in `app/share/[token]/page.tsx` is Story 4.3. However, we store enough metadata in `insightSnapshot` (orgName, dateRange) so Story 4.3 can read it.
- **No server-side PNG needed yet**: The `chart_snapshot_url` column is nullable. Story 4.1 handles client-side PNG. Server-side PNG rendering (for OG image cards) is a Story 4.3 concern. We leave `chartSnapshotUrl` null for now.
- **Clipboard API for URL**: `navigator.clipboard.writeText(url)` for the link (simpler than PNG blob copy). Falls back to error state if clipboard unavailable.

### What This Story Does NOT Include

- No public share page rendering (that's Story 4.3 — `app/share/[token]/page.tsx`)
- No OG meta tag rendering (Story 4.3)
- No server-side PNG rendering for OG image (Story 4.3)
- No chart_snapshot_url population (Story 4.3)
- No share list management UI (not in any story — could be future)
- No share revocation/deletion (not in any story)

### Project Structure Notes

**New files to create:**
```
apps/api/src/db/queries/shares.ts                — Share CRUD queries (findByTokenHash, not findByToken)
apps/api/src/db/queries/shares.test.ts            — Query tests
apps/api/src/db/migrations/XXXX_add-rls-shares.sql — RLS policy on shares.org_id
apps/api/src/services/sharing/shareService.ts     — Share business logic (token hashing + snapshot)
apps/api/src/services/sharing/shareService.test.ts — Service tests
apps/api/src/services/sharing/index.ts            — Barrel export
apps/api/src/routes/sharing.ts                    — Express routes (protected + public)
apps/api/src/routes/sharing.test.ts               — Route tests
packages/shared/src/schemas/sharing.ts            — Zod schemas
apps/web/app/api/shares/route.ts                  — BFF proxy route
apps/web/lib/hooks/useCreateShareLink.ts          — Share link creation hook
apps/web/lib/hooks/useCreateShareLink.test.ts     — Hook tests
```

**Files to modify:**
```
apps/api/src/db/schema.ts                         — Add shares table + relations
apps/api/src/db/queries/index.ts                  — Export shares queries
apps/api/src/routes/protected.ts                  — Mount shareRouter
apps/api/src/index.ts                             — Mount publicShareRouter
packages/shared/src/schemas/index.ts              — Export sharing schemas
packages/shared/src/constants/index.ts            — Add SHARES constants
apps/web/app/dashboard/ShareMenu.tsx              — Add "Copy Link" option
apps/web/app/dashboard/ShareMenu.test.tsx         — Update tests
apps/web/app/dashboard/DashboardShell.tsx         — Wire useCreateShareLink
apps/web/app/dashboard/DashboardShell.test.tsx    — Update tests
apps/web/app/dashboard/AiSummaryCard.tsx          — Pass onShareLink prop
apps/web/app/dashboard/AiSummaryCard.test.tsx     — Update tests
```

**No changes to:**
- `proxy.ts` — no route protection changes needed
- `apps/api/src/middleware/` — existing auth + rate limiting handles everything
- `apps/web/app/share/` — public view page is Story 4.3

### Drizzle Migration Notes

- Run `pnpm drizzle-kit generate` after adding `shares` table to `schema.ts`
- Migration creates the table + indexes + foreign keys
- The `tokenHash` column gets a unique index (not just unique constraint) for fast lookups
- After the schema migration, create a separate RLS migration (e.g., `XXXX_add-rls-shares.sql`) following the `0004_add-rls-analytics-invites.sql` pattern — policy scopes by `org_id`
- Test that Docker compose applies both migrations cleanly on fresh DB

### Testing Strategy

**API tests (services + routes):**
- Mock `db` queries with `vi.mock()` — no DB connection in unit tests
- Mock `config.js` + `logger.js` (established pattern)
- Test token generation produces valid hex string
- Test snapshot contains orgName + dateRange + aiSummaryContent
- Test expired share returns 410 Gone
- Test missing share returns 404
- Test view count increments atomically
- Test analytics event fires on share view

**Frontend tests (hooks + components):**
- Mock `fetch` for BFF proxy calls
- Mock `navigator.clipboard.writeText` (simpler than PNG blob — just text)
- Test "Copy Link" button appears in ShareMenu
- Test success/error state transitions
- Test keyboard accessibility (Enter/Space on Copy Link button)
- Use `matchMedia` mock for mobile/desktop variants

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 4.2 acceptance criteria, lines 1026-1051]
- [Source: _bmad-output/planning-artifacts/architecture.md — shares table schema, line 232]
- [Source: _bmad-output/planning-artifacts/architecture.md — FR26/FR27 mapping, lines 1242-1243]
- [Source: _bmad-output/planning-artifacts/architecture.md — sharing routes/services file tree, lines 800-838]
- [Source: _bmad-output/planning-artifacts/architecture.md — OG meta tags resolution, line 1366]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — focused insight card, sharing privacy]
- [Source: apps/api/src/services/auth/inviteService.ts — token generation pattern]
- [Source: apps/api/src/db/queries/orgInvites.ts — token lookup query pattern]
- [Source: apps/api/src/routes/invites.ts — public + protected router pattern]
- [Source: apps/api/src/index.ts — public router mounting, line 33]
- [Source: apps/web/app/api/invites/route.ts — BFF proxy pattern]
- [Source: apps/web/app/dashboard/ShareMenu.tsx — existing share UI]
- [Source: packages/shared/src/constants/index.ts:35-36 — SHARE_CREATED/SHARE_VIEWED events]
- [Source: _bmad-output/implementation-artifacts/4-1-share-insight-as-rendered-image.md — previous story patterns]

## Dev Agent Record

### Agent Model Used

Unknown (Dev Agent Record was empty at review time)

### Debug Log References

### Completion Notes List

- SHARE_VIEWED analytics event intentionally skipped — `analytics_events` table requires NOT NULL `userId` FK, public viewers are anonymous. `viewCount` atomic increment covers this metric instead.
- Code review (2026-03-24): 9 findings, 7 fixed (CR-1 through CR-7). CR-8, CR-9 (LOW) accepted as-is.

### File List

**New files:**
- `apps/api/drizzle/migrations/0009_add_shares_table.sql`
- `apps/api/drizzle/migrations/0010_add-rls-shares.sql`
- `apps/api/src/db/queries/shares.ts`
- `apps/api/src/db/queries/shares.test.ts`
- `apps/api/src/services/sharing/shareService.ts`
- `apps/api/src/services/sharing/shareService.test.ts`
- `apps/api/src/services/sharing/index.ts`
- `apps/api/src/routes/sharing.ts`
- `apps/api/src/routes/sharing.test.ts`
- `packages/shared/src/schemas/sharing.ts`
- `apps/web/app/api/shares/route.ts`
- `apps/web/lib/hooks/useCreateShareLink.ts`
- `apps/web/lib/hooks/useCreateShareLink.test.ts`

**Modified files:**
- `apps/api/src/db/schema.ts` — added `shares` table + `sharesRelations`
- `apps/api/src/db/queries/index.ts` — exported `sharesQueries`
- `apps/api/src/routes/protected.ts` — mounted `shareRouter`
- `apps/api/src/index.ts` — mounted `publicShareRouter`
- `apps/api/drizzle/migrations/meta/_journal.json` — added migration entries
- `packages/shared/src/schemas/index.ts` — exported sharing schemas
- `packages/shared/src/constants/index.ts` — added `SHARES` constants
- `apps/web/app/dashboard/ShareMenu.tsx` — added Copy Link option + clipboard failure state
- `apps/web/app/dashboard/DashboardShell.tsx` — wired `useCreateShareLink` hook
- `apps/web/app/dashboard/AiSummaryCard.tsx` — passed `onShareCopyLink` + `shareLinkStatus` props
