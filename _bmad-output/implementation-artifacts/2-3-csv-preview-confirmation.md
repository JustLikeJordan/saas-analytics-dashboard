# Story 2.3: CSV Preview & Confirmation

Status: in-progress

## Story

As a **business owner**,
I want to preview my uploaded data before confirming the import,
So that I can verify the data looks correct and catch mistakes early.

## Acceptance Criteria

1. **Given** a CSV file passes validation, **When** the preview renders, **Then** I see a `CsvPreview` component with: 5-row mini-table, column type badges, total row count, and any warnings (FR8). The preview appears below the dropzone at the same max-width (640px).

2. **Given** I am viewing the preview, **When** I click "Confirm", **Then** the data is stored scoped to my organization and visible to all org members (FR10). The dropzone transitions to the success state with a redirect countdown to the dashboard.

3. **Given** I am viewing the preview, **When** I click "Cancel", **Then** the upload is discarded and the dropzone returns to the default state with my file reference preserved.

## Tasks / Subtasks

- [ ] Task 0: Read and understand existing code touched by this story (AC: all)
  - [ ] 0a. Read `UploadDropzone.tsx`, `datasets.ts` (route), `normalizer.ts`, `csvAdapter.ts`, `dataRows.ts`, `datasets.ts` (queries), shared types/schemas/constants
  - [ ] 0b. Read `apps/web/app/api/datasets/route.ts` (BFF proxy)
  - [ ] 0c. Trace the full data flow: browser → BFF proxy → Express POST /datasets → csvAdapter → normalizer → preview response → UploadDropzone state='preview'

- [ ] Task 1: Add confirm endpoint — `POST /datasets/confirm` (AC: 2)
  - [ ] 1a. Add `DATASET_CONFIRMED` to `ANALYTICS_EVENTS` in `packages/shared/src/constants/index.ts`
  - [ ] 1b. Add `confirmDatasetSchema` Zod schema in `packages/shared/src/schemas/datasets.ts` — validates `{ fileName: string, headers: string[], rows: ParsedRow[], rowCount: number }`
  - [ ] 1c. Add `POST /confirm` handler to `apps/api/src/routes/datasets.ts`:
    - Accept JSON body with preview data (headers, rows from original parse — **not** re-uploaded file)
    - Call `normalizeRows(rows, headers)` to transform
    - Call `createDataset(orgId, { name: fileName, sourceType: 'csv', uploadedBy: userId })`
    - Call `insertBatch(orgId, dataset.id, normalizedRows)`
    - Fire `trackEvent(orgId, userId, ANALYTICS_EVENTS.DATASET_CONFIRMED, { datasetId, rowCount })`
    - Return `{ data: { datasetId: dataset.id, rowCount: normalizedRows.length } }`
  - [ ] 1d. Add structured Pino logging: `logger.info({ orgId, userId, datasetId, rowCount }, 'Dataset confirmed and persisted')`

- [ ] Task 2: Add BFF proxy route for confirm (AC: 2)
  - [ ] 2a. Extend `apps/web/app/api/datasets/route.ts` or create `apps/web/app/api/datasets/confirm/route.ts` — proxy POST to Express `/datasets/confirm`
  - [ ] 2b. Forward cookies and Content-Type (JSON this time, not multipart)

- [ ] Task 3: Build `CsvPreview` component (AC: 1)
  - [ ] 3a. Create `apps/web/app/upload/CsvPreview.tsx` — client component
  - [ ] 3b. Props: `previewData: CsvPreviewData`, `onConfirm: () => void`, `onCancel: () => void`, `isConfirming: boolean`
  - [ ] 3c. Render semantic HTML `<table>` (NOT shadcn/ui Table component) with:
    - Column headers highlighted `text-primary` with type badge (date/number/text) next to each
    - First 5 sample rows
    - Total row count badge ("847 rows detected") as `<caption>`
    - Warnings list (if any) above the table
  - [ ] 3d. Below table: "Upload {N} rows" primary Button + "Cancel" text link
  - [ ] 3e. During confirmation: Button shows loading spinner + disabled state, text changes to "Uploading..."
  - [ ] 3f. Accessibility: `<caption>` element "Preview of uploaded data — X rows detected", `<th scope="col">` on headers, keyboard navigable confirm/cancel

- [ ] Task 4: Wire CsvPreview into UploadDropzone state machine (AC: 1, 2, 3)
  - [ ] 4a. Replace the placeholder preview state content in `UploadDropzone.tsx` with `<CsvPreview>` component
  - [ ] 4b. Implement `handleConfirm`:
    - POST to `/api/datasets/confirm` with `{ fileName, headers, rows: previewData.sampleRows? }` — **IMPORTANT**: Send ALL parsed rows, not just sample rows. Store full `parseResult.rows` from the upload response, or re-send original file. See Dev Notes for the data flow decision.
    - On success: transition to `success` state, start 3-second redirect countdown, then `router.push('/dashboard')`
    - On error: transition to `error` state with server error message
  - [ ] 4c. Implement `handleCancel`: transition to `default` state, preserve `lastFile` reference
  - [ ] 4d. Build success state content: green CheckCircle icon, "{N} transactions uploaded!", "Redirecting to dashboard in {countdown}..." text
  - [ ] 4e. Add `useRouter` from `next/navigation` for redirect

- [ ] Task 5: Write tests (AC: all)
  - [ ] 5a. `CsvPreview.test.tsx` — renders table with headers, sample rows, row count badge, column type badges, warnings; confirm/cancel callbacks fire; loading state disables button
  - [ ] 5b. `UploadDropzone.test.tsx` — add tests for: preview→confirm→success flow, preview→cancel→default flow, success state shows countdown, error during confirm shows error state
  - [ ] 5c. `datasets.test.ts` — add tests for POST /confirm: valid payload persists data and returns datasetId, invalid payload returns 400, missing auth returns 401, trackEvent fires on success
  - [ ] 5d. Run full test suite — ensure 0 regressions

- [ ] Task 6: Lint, type-check, verify (AC: all)
  - [ ] 6a. `pnpm lint` — clean
  - [ ] 6b. `pnpm type-check` — clean
  - [ ] 6c. `pnpm test` — all tests pass (existing + new)

## Dev Notes

### What Already Exists (from Story 2.2)

**API layer:**
- `apps/api/src/routes/datasets.ts` — POST `/` handler returns `PreviewData` on successful validation. The `datasetsRouter` is mounted at `/datasets` on `protectedRouter`.
- `apps/api/src/services/dataIngestion/csvAdapter.ts` — `parse()` and `validate()` methods
- `apps/api/src/services/dataIngestion/normalizer.ts` — `normalizeRows()` transforms `ParsedRow[]` → `NormalizedRow[]`
- `apps/api/src/db/queries/datasets.ts` — `createDataset()` already exists and returns the inserted dataset
- `apps/api/src/db/queries/dataRows.ts` — `insertBatch()` already exists and accepts `NormalizedRow`-compatible shape

**Web layer:**
- `apps/web/app/upload/UploadDropzone.tsx` — 6-state FSM. When `state === 'preview'`, currently renders a placeholder saying "Preview and confirm in Story 2.3". `previewData` state variable already holds `CsvPreviewData`.
- `apps/web/app/api/datasets/route.ts` — BFF proxy that streams multipart to Express

**Shared:**
- `CsvPreviewData` type in `packages/shared/src/types/datasets.ts` — has `headers`, `sampleRows`, `rowCount`, `validRowCount`, `skippedRowCount`, `columnTypes`, `warnings`, `fileName`
- `csvPreviewDataSchema` Zod schema in `packages/shared/src/schemas/datasets.ts`

### Critical Architecture Constraints

1. **ESM `.js` extensions required** — All local API imports need `.js` suffix
2. **Routes are thin** — Business logic in service layer. The confirm handler validates input, calls normalizer + DB queries, returns response.
3. **Product-blame error messages (NFR21)** — Never user-blame language
4. **No CORS** — BFF proxy pattern, same-origin
5. **Express 5 async error propagation** — No try/catch, just throw `ValidationError`
6. **Pino logging** — Object first, message second
7. **DB encapsulation** — Import from `db/queries/` barrel, never `db/index.ts`
8. **JWT field access** — `req.user.org_id` (number), `parseInt(req.user.sub, 10)` for userId

### Data Flow Decision: How to Persist on Confirm

**The problem:** Story 2.2's upload endpoint parses the CSV and returns a preview. But the preview only includes 5 sample rows (`sampleRows`). The full parsed rows aren't sent to the browser. On confirm, we need ALL rows — not just the 5 samples.

**Recommended approach — Re-send the file buffer:**
Rather than storing all parsed rows in browser memory (which could be tens of thousands of rows), the confirm endpoint should accept the **original file** again. This means:
- The `UploadDropzone` stores the `File` object (already in `lastFile` state)
- On confirm, POST the file again to `/datasets/confirm` as multipart (reuse multer config)
- The confirm handler re-parses with `csvAdapter.parse()`, re-normalizes, then persists
- This is slightly more work server-side but avoids shipping 50K rows as JSON through the BFF proxy

**Alternative — Store parsed rows server-side (session/temp table):**
Too complex for MVP. Would need Redis/temp storage keyed by upload session.

**Alternative — Send all rows as JSON:**
Works for small files but 50K rows × 5 columns as JSON could be 5-10MB. The file itself is already ≤10MB as CSV (more compact than JSON). Just re-send the file.

**Implementation:** The confirm endpoint reuses `upload.single('file')` + `handleMulterError` middleware from the existing upload handler. Re-parse, normalize, persist. The only new data is the confirmation intent + any user corrections (none in MVP).

### UX Specification

**CsvPreview component (from UX design spec):**
- Semantic HTML `<table>` — NOT shadcn/ui Table component
- Column headers highlighted `--color-primary` with type badges (date/number/text)
- First 5 rows displayed
- Total row count badge: "847 rows detected" as `<caption>`
- Confirm button: "Upload {N} rows" (primary Button)
- Cancel: text link, returns to default dropzone state
- Accessibility: `<caption>` "Preview of uploaded data — X rows detected", `<th scope="col">`, keyboard navigable

**Success state (from UX design spec):**
- Green check animation
- "{N} transactions uploaded! Generating your AI summary..."
- Redirect countdown (3 seconds) to `/dashboard`
- No intermediate "click to continue" step — auto-redirect

**Error during confirm:**
- Transition to error state with server message
- File reference preserved for retry

### Previous Story Learnings (from Story 2.2)

1. **jsdom 28 + user-event incompatibility** — Use `fireEvent.change` for file inputs, not `userEvent.upload`
2. **RTL cleanup** — Explicit `cleanup()` in `afterEach` (vitest `globals: false`)
3. **TypeScript strict mode** — `Record<string, string>` indexing returns `string | undefined`. Use `!` with verified bounds or `?? ''` fallback.
4. **Multer error detection** — Duck-typing (`'code' in err`), not `instanceof MulterError`
5. **Touch device in tests** — jsdom exposes `ontouchstart`, so `isTouchDevice === true` in test environment
6. **File upload does NOT use `apiClient`** — Use raw `fetch` with `FormData`. Don't set Content-Type manually.
7. **BFF proxy needs explicit handler** — Cookie forwarding + multipart boundary preservation

### File Structure

```
apps/web/app/upload/
├── page.tsx                     # Existing — no changes
├── UploadDropzone.tsx           # MODIFY — wire CsvPreview, add confirm/cancel/success
├── UploadDropzone.test.tsx      # MODIFY — add preview→confirm→success tests
├── CsvPreview.tsx               # NEW — preview table component
└── CsvPreview.test.tsx          # NEW — component tests

apps/web/app/api/datasets/
├── route.ts                     # Existing — may extend or keep as-is
└── confirm/
    └── route.ts                 # NEW — BFF proxy for confirm endpoint

apps/api/src/routes/
└── datasets.ts                  # MODIFY — add POST /confirm handler

packages/shared/src/
├── constants/index.ts           # MODIFY — add DATASET_CONFIRMED event
├── schemas/datasets.ts          # MODIFY — add confirmDatasetSchema
├── schemas/index.ts             # MODIFY — export new schema
├── types/datasets.ts            # MODIFY — add ConfirmDatasetResponse type (if needed)
└── types/index.ts               # MODIFY — export new type
```

### Testing Standards

- **Unit tests:** CsvPreview rendering, props, callbacks
- **Component tests:** UploadDropzone integration with CsvPreview (state transitions)
- **Route tests:** POST /confirm with `createTestApp()` — mock `createDataset`, `insertBatch`, `trackEvent`
- **Patterns:** `fireEvent.change` for file inputs, explicit `cleanup()`, `vi.mock()` at module level
- **Fixtures:** Reuse `apps/api/src/test/fixtures/csvFiles.ts` for route tests

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow (CSV Upload → AI Insight)]
- [Source: _bmad-output/planning-artifacts/architecture.md#File Organization Patterns]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UploadDropzone]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#CsvPreview]
- [Source: _bmad-output/implementation-artifacts/2-2-csv-upload-validation.md]

### Project Structure Notes

- `CsvPreview.tsx` lives in `apps/web/app/upload/` alongside `UploadDropzone.tsx` — co-located with the page that uses it
- Confirm BFF route at `apps/web/app/api/datasets/confirm/route.ts` — nested under existing datasets proxy
- No new packages or dependencies required — reuses existing multer, Drizzle queries, shared types

## Dev Agent Record

### Agent Model Used

(to be filled by dev agent)

### Debug Log References

### Completion Notes List

### File List

### Change Log
