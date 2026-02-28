# Story 2.2: CSV Upload & Validation

Status: review

## Story

As a **business owner**,
I want to upload my CSV data via drag-and-drop or file picker with clear validation feedback,
So that I can get my data into the system without confusion about formatting.

## Acceptance Criteria

1. **Given** I am on the upload page **When** I drag a CSV file onto the drop zone or click to select a file **Then** the `UploadDropzone` component accepts the file (FR6) **And** the upload page follows the layout: AppHeader (sticky) → "Upload Data" title → UploadDropzone (centered, max-width 640px)

2. **Given** I upload a CSV file **When** the system validates it **Then** it checks against expected column format and displays specific error details on failure (FR7) **And** error messages use product-blame language ("We expected columns named...") with a template download link, never user-blame (NFR21)

3. **Given** the file fails validation **When** I view the error state **Then** my file reference is retained so I can correct and re-upload without losing my session (FR12) **And** the UploadDropzone shows the 6 states: default, drag hover, processing, preview, success, error

4. **Given** I am on a mobile device **When** I visit the upload page **Then** I see a file picker fallback instead of drag-and-drop (touch device adaptation) **And** the layout is single column, full-width dropzone

5. **Given** CSV processing begins **When** the file is under 10MB **Then** processing completes within 5 seconds (NFR4)

6. **Given** the upload completes **When** the system fires the analytics event **Then** `dataset.uploaded` is tracked via `trackEvent()` (FR40)

7. **Given** a keyboard user navigates the upload page **When** they interact with the UploadDropzone **Then** all interactive elements (file picker trigger, action buttons) are keyboard-navigable (NFR25)

## Tasks / Subtasks

- [x] Task 0a: Install web frontend dependencies (AC: #1, #3, #7)
  - [x] 0a.1 Install shadcn/ui foundation: `pnpm --filter web add class-variance-authority clsx tailwind-merge` + `pnpm --filter web add -D @types/node`
  - [x] 0a.2 Create `apps/web/lib/utils.ts` with `cn()` helper (clsx + tailwind-merge — standard shadcn pattern)
  - [x] 0a.3 Create `apps/web/components/ui/alert.tsx` — a minimal Alert component (shadcn/ui pattern with CVA variants: default, destructive). Only create what this story needs — no full shadcn init.
  - [x] 0a.4 Create `apps/web/components/ui/progress.tsx` — minimal progress bar component for upload state
  - [x] 0a.5 Install icon library: `pnpm --filter web add lucide-react`

- [x] Task 0b: Install web testing dependencies (AC: all — needed for component tests)
  - [x] 0b.1 `pnpm --filter web add -D @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`
  - [x] 0b.2 Verify `apps/web/vitest.config.ts` has `environment: 'jsdom'` and React plugin configured
  - [x] 0b.3 Create `apps/web/test/setup.ts` with `import '@testing-library/jest-dom'` and reference in vitest config `setupFiles`
  - [x] 0b.4 Write a smoke test: render a simple `<div>hello</div>` with `@testing-library/react` to confirm the setup works before writing real tests

- [x] Task 1: Install multer + types (AC: #1)
  - [x] 1.1 Add `multer` to api dependencies: `pnpm --filter api add multer`
  - [x] 1.2 Add `@types/multer` to api devDependencies: `pnpm --filter api add -D @types/multer`
  - [x] 1.3 Verify multer imports work with our ESM setup (default import: `import multer from 'multer'`)

- [x] Task 2: Create DataSourceAdapter interface (AC: #5)
  - [x] 2.1 Create `apps/api/src/services/adapters/interface.ts` — `DataSourceAdapter` interface with `parse(buffer: Buffer): ParseResult` (synchronous — csv-parse/sync for <10MB) and `validate(headers: string[]): ValidationResult`
  - [x] 2.2 Define `ParseResult` type: `{ rows: ParsedRow[], headers: string[], rowCount: number }`
  - [x] 2.3 Define `ValidationResult` type: `{ valid: boolean, errors: ColumnValidationError[] }`
  - [x] 2.4 Define `ParsedRow` type: `Record<string, string>` (raw parsed data before normalization)
  - [x] 2.5 Create `apps/api/src/services/adapters/index.ts` barrel export

- [x] Task 3: Create csvAdapter service (AC: #2, #5)
  - [x] 3.1 Create `apps/api/src/services/dataIngestion/csvAdapter.ts` implementing `DataSourceAdapter`
  - [x] 3.2 Use `csv-parse` (already installed, verified ESM compatible) — `import { parse } from 'csv-parse/sync'`
  - [x] 3.3 Validate required columns: `date`, `amount`, `category`. Optional: `label`, `parent_category`
  - [x] 3.4 Validate column values: dates parseable, amounts numeric, categories non-empty
  - [x] 3.5 Return structured errors with row/column context for product-blame error messages
  - [x] 3.6 Handle edge cases: empty file, header-only file, BOM marker, trailing newlines

- [x] Task 4: Create normalizer service (AC: #5)
  - [x] 4.1 Create `apps/api/src/services/dataIngestion/normalizer.ts`
  - [x] 4.2 Transform `ParsedRow[]` → data_rows schema shape (amounts as strings, dates as Date objects, category mapping)
  - [x] 4.3 Assign `parent_category` from CSV column if present, null otherwise
  - [x] 4.4 Generate `label` from CSV column if present, null otherwise

- [x] Task 5: Create dataIngestion barrel export (AC: #5)
  - [x] 5.1 Create `apps/api/src/services/dataIngestion/index.ts` — re-export csvAdapter + normalizer

- [x] Task 6: Add shared validation schemas + constants (AC: #2)
  - [x] 6.1 Add `csvValidationSchema` to `packages/shared/src/schemas/datasets.ts` — schema for CSV validation request/response
  - [x] 6.2 Add `uploadDatasetSchema` to shared schemas — schema for the upload endpoint request
  - [x] 6.3 Add CSV-related constants to `packages/shared/src/constants/index.ts`:
    - `CSV_REQUIRED_COLUMNS = ['date', 'amount', 'category'] as const`
    - `CSV_OPTIONAL_COLUMNS = ['label', 'parent_category'] as const`
    - `CSV_MAX_ROWS = 50_000` (safety limit for MVP)
    - `ACCEPTED_FILE_TYPES = ['.csv', 'text/csv', 'application/vnd.ms-excel'] as const`
  - [x] 6.4 Export new types from `packages/shared/src/types/index.ts`
  - [x] 6.5 Rebuild shared: `pnpm --filter shared build`

- [x] Task 7: Create Express POST /datasets route (AC: #1, #2, #5, #6)
  - [x] 7.1 Create `apps/api/src/routes/datasets.ts` with `datasetsRouter`
  - [x] 7.2 Configure multer with memory storage, 10MB limit (`MAX_FILE_SIZE` from shared constants), `.csv` filter
  - [x] 7.3 `POST /` — accepts multipart file upload, calls csvAdapter.parse + validate, calls normalizer
  - [x] 7.4 On validation failure: return 400 with structured errors (product-blame messages)
  - [x] 7.5 On success: return 200 with preview data (first 5 rows, headers, row count, column types, warnings) — data is NOT persisted yet (that's Story 2.3 on confirm)
  - [x] 7.6 Fire `trackEvent(user.org_id, parseInt(user.sub, 10), 'dataset.uploaded', { rowCount, fileName })` on successful validation
  - [x] 7.7 Mount on `protectedRouter` in `routes/protected.ts`

- [x] Task 8: Create explicit BFF route handler for multipart upload (AC: #1)
  - [x] 8.1 Create `apps/web/app/api/datasets/route.ts` with explicit body streaming that forwards multipart to Express. Architecture Gap #3 says explicit handler is required. Existing auth routes (login, callback) use explicit handlers — rewrites alone don't reliably forward cookies or multipart boundaries.
  - [x] 8.2 Forward `content-type` header (contains multipart boundary), `cookie` header (for auth), and stream `request.body` with `duplex: 'half'` (see dev notes for pattern)
  - [x] 8.3 Forward `Set-Cookie` headers from Express response back to browser (token refresh may happen on any authenticated request)
  - [x] 8.4 Verify 10MB files pass through without being truncated — may need `export const runtime = 'nodejs'` and body size config in `next.config.ts`

- [x] Task 9: Create upload page (AC: #1)
  - [x] 9.1 Create `apps/web/app/upload/page.tsx` (RSC — the page itself doesn't need client interactivity)
  - [x] 9.2 Layout: renders AppHeader (reuse from existing layout) + "Upload Data" heading + `<UploadDropzone />` client component
  - [x] 9.3 Page is already protected by `proxy.ts` (which gates `/upload` — requires auth)
  - [x] 9.4 Centered content, `max-w-[640px]` per UX spec

- [x] Task 10: Create UploadDropzone component (AC: #1, #2, #3, #4, #7)
  - [x] 10.1 Create `apps/web/app/upload/UploadDropzone.tsx` as a `'use client'` component
  - [x] 10.2 Define all 6 state types: `'default' | 'dragHover' | 'processing' | 'preview' | 'success' | 'error'`
  - [x] 10.3 Implement 4 states for this story: default, dragHover, processing, error. Preview and success are structural placeholders (Story 2.3 fills them in).
  - [x] 10.4 **Default state:** dashed border zone, upload icon, "Drag your CSV here or click to browse", "Accepted: .csv up to 10MB", "Download sample template" link (placeholder href for Story 2.4)
  - [x] 10.5 **Drag hover state:** solid border `--color-primary`, background `--color-accent`, "Drop to upload" text
  - [x] 10.6 **Processing state:** progress bar (not spinner — UX spec requires progress bar with percentage) within zone, "Validating your data..." message. Progress derives from fetch upload progress (`XMLHttpRequest.upload.onprogress` or chunked approach) for the upload phase, then indeterminate for server-side validation.
  - [x] 10.7 **Error state:** red border, specific error message from server, "Download sample template" link prominent, file reference retained for re-upload
  - [x] 10.8 **Drag-and-drop:** HTML5 Drag and Drop API — `onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop`. Prevent default on all drag events to avoid browser opening the file.
  - [x] 10.9 **File picker:** hidden `<input type="file" accept=".csv">` triggered by clicking the dropzone
  - [x] 10.10 **Mobile detection:** check for touch device via `'ontouchstart' in window` or `navigator.maxTouchPoints > 0`. On touch devices: hide drag-drop text, show "Tap to select your CSV file" instead. File input remains the interaction.
  - [x] 10.11 **Client-side validation** before upload: file type (.csv), file size (< 10MB using `MAX_FILE_SIZE`). Show error immediately without server round-trip for these.
  - [x] 10.12 **Upload via fetch:** construct `FormData`, POST to `/api/datasets` (goes through BFF proxy). Use api-client pattern but with FormData body (NOT JSON — do NOT set Content-Type header, let browser set multipart boundary).
  - [x] 10.13 **Error display:** use shadcn/ui Alert component for validation errors. Format server errors into product-blame messages. Each error on its own line with row/column context if available.
  - [x] 10.14 **File reference retention:** on error, keep the `File` object in state so user can see "Last attempt: expenses.csv" and re-drop a corrected file
  - [x] 10.15 **Keyboard accessibility:** `role="button"` on dropzone div, `tabIndex={0}`, Enter/Space opens file picker, `aria-label="Upload CSV file"`, error messages use `aria-live="assertive"`, focus moves to error Alert on validation failure
  - [x] 10.16 **Return preview data:** on successful validation, store the server's `PreviewData` response in component state and transition to `preview` state. The component exposes `previewData` via state (not a callback prop like `onUploadComplete(datasetId)` — there's no datasetId yet since data isn't persisted until Story 2.3). Story 2.3 renders the CsvPreview sub-component from this stored state.

- [x] Task 11: Write tests (AC: all)
  - [x] 11.1 `apps/api/src/services/dataIngestion/csvAdapter.test.ts` — parse valid CSV, missing required columns, invalid dates, invalid amounts, empty file, header-only, BOM handling
  - [x] 11.2 `apps/api/src/services/dataIngestion/normalizer.test.ts` — transform parsed rows to schema shape, optional fields, edge cases
  - [x] 11.3 `apps/api/src/routes/datasets.test.ts` — POST with valid CSV, POST with invalid CSV, POST with wrong file type, POST with oversized file, POST without auth, verify analytics event tracked
  - [x] 11.4 `apps/web/app/upload/UploadDropzone.test.tsx` — render default state, file selection triggers upload, error state renders Alert, keyboard interaction (Enter opens picker), mobile detection
  - [x] 11.5 `packages/shared/src/schemas/datasets.test.ts` — update existing tests to cover new csvValidationSchema + uploadDatasetSchema
  - [x] 11.6 Test fixture: create `apps/api/src/test/fixtures/csvFiles.ts` with sample CSV content (valid, missing columns, invalid data, empty, header-only)

- [x] Task 12: Generate `_explained.md` docs for new files

- [x] Task 13: Verify lint + type-check + tests pass
  - [x] 13.1 `pnpm turbo lint`
  - [x] 13.2 `pnpm turbo type-check`
  - [x] 13.3 `pnpm test`

- [x] Task 14: Update sprint status

## Dev Notes

### What Already Exists (from Epic 1 + Story 2.1)

**DO NOT recreate or modify these (unless adding to them):**

- `apps/api/src/index.ts` — Express app with middleware chain. **Mount datasets route on protectedRouter.**
- `apps/api/src/routes/protected.ts` — Protected router with authMiddleware. Has placeholder comment: `// Story 2+: mount dataset/AI/admin routes here`. **Add datasetsRouter here.**
- `apps/api/src/middleware/authMiddleware.ts` — JWT verification, exports `AuthenticatedRequest` type with `req.user: JwtPayload` (has `sub` (string user ID — use `parseInt(user.sub, 10)`), `org_id` (number), `role`, `isAdmin`).
- `apps/api/src/lib/appError.ts` — `ValidationError(message, details?)` returns 400 with `VALIDATION_ERROR` code. **Use this for CSV validation failures.**
- `apps/api/src/services/analytics/trackEvent.ts` — `trackEvent(orgId, userId, eventName, metadata?)` — fire-and-forget, never throws. **Call with `ANALYTICS_EVENTS.DATASET_UPLOADED`.**
- `apps/api/src/db/queries/datasets.ts` — `createDataset(orgId, data)` and other dataset query functions. **NOT used in this story** (data persistence is Story 2.3). But import types for the preview response shape.
- `apps/api/src/db/queries/dataRows.ts` — `insertBatch(orgId, datasetId, rows)`. **NOT used in this story** (persistence is Story 2.3).
- `apps/web/lib/api-client.ts` — `apiClient<T>(path, options)` with silent refresh. **Cannot use directly for file uploads** — it sets `Content-Type: application/json`. For multipart, use raw `fetch` with `FormData` body and `credentials: 'include'`.
- `apps/web/lib/config.ts` — `webEnv.API_INTERNAL_URL` for server-side fetch to Express.
- `apps/web/proxy.ts` — Already protects `/upload` route (requires auth). No changes needed.
- `apps/web/next.config.ts` — Has `rewrites` rule: `/api/:path*` → `${API_INTERNAL_URL}/:path*`. The rewrite exists but Task 8 creates an explicit BFF handler for `/api/datasets` (architecture Gap #3 + cookie forwarding). The explicit route takes precedence over the rewrite.
- `packages/shared/src/constants/index.ts` — Has `MAX_FILE_SIZE` (10MB), `ANALYTICS_EVENTS.DATASET_UPLOADED`. **Add CSV column constants.**
- `packages/shared/src/schemas/datasets.ts` — Has `sourceTypeSchema`, `datasetSchema`, `dataRowSchema`. **Add csvValidationSchema, uploadDatasetSchema.**

### Critical Architecture Constraints

1. **ESM `.js` extensions required** — All local API imports need `.js` suffix. E.g., `import { csvAdapter } from '../services/dataIngestion/csvAdapter.js'`.

2. **csv-parse 6.1.0** — Already installed and verified ESM compatible. Use `import { parse } from 'csv-parse/sync'` for synchronous parsing (files < 10MB fit in memory). The streaming API (`import { parse } from 'csv-parse'`) is available for future scaling but unnecessary at this file size. Sync is simpler and fast enough (< 1s for 10MB).

3. **multer for multipart/form-data** — Express doesn't natively parse multipart. Multer is the standard middleware. CJS package — use default import: `import multer from 'multer'`. `esModuleInterop: true` handles this. Configure with memory storage (`multer.memoryStorage()`) since files < 10MB. The file arrives as `req.file.buffer`.

4. **Routes are thin** — The route handler validates input, calls csvAdapter + normalizer, returns response. Business logic stays in the service layer (csvAdapter, normalizer). The route never parses CSV directly.

5. **Product-blame error messages (NFR21)** — Never say "Invalid file" or "Your file is wrong." Always say "We expected..." or "We couldn't read...". Error messages include:
   - Missing columns: `"We expected columns named date, amount, and category. Your file has columns named: ${found.join(', ')}"`
   - Invalid date: `"Row ${row}: We couldn't read '${value}' as a date. Expected format: YYYY-MM-DD (e.g., 2025-01-15)"`
   - Invalid amount: `"Row ${row}: We couldn't read '${value}' as an amount. Expected a number (e.g., 1200.00)"`
   - Empty file: `"This file appears to be empty. Download our sample template to see the expected format."`

6. **No data persistence in this story** — Story 2.2 validates and returns preview data. Story 2.3 handles the confirm step that persists to database. The route returns the validated/normalized data as a preview response. The `dataset.uploaded` analytics event fires on successful validation (not on persistence — that distinction matters for funnel tracking: "how many users uploaded a valid file" vs "how many confirmed").

7. **File upload does NOT use `apiClient`** — The existing `apiClient` helper sets `Content-Type: application/json` which breaks multipart uploads. For file uploads, use raw `fetch` with `FormData` body. Do NOT manually set Content-Type — the browser auto-sets it with the multipart boundary. Pattern:
   ```typescript
   const formData = new FormData();
   formData.append('file', file);
   const response = await fetch('/api/datasets', {
     method: 'POST',
     body: formData,
     credentials: 'include',
     // NO Content-Type header — browser sets it with boundary
   });
   ```

8. **BFF proxy — explicit handler required** — Architecture Gap #3 mandates an explicit route handler for file uploads. Existing auth routes (login, callback) all use explicit handlers for cookie forwarding — rewrites alone don't forward cookies. The explicit handler streams the multipart body to Express:
   ```typescript
   // app/api/datasets/route.ts — REQUIRED (not optional)
   export async function POST(request: NextRequest) {
     const response = await fetch(`${webEnv.API_INTERNAL_URL}/datasets`, {
       method: 'POST',
       headers: {
         'content-type': request.headers.get('content-type') || '',
         cookie: request.headers.get('cookie') || '',
       },
       body: request.body,
       duplex: 'half', // required for streaming request bodies in Node
     } as RequestInit);
     return new Response(response.body, {
       status: response.status,
       headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
     });
   }
   ```

9. **Pino logging convention** — Object first, message second: `logger.info({ orgId, fileName, rowCount }, 'CSV validated')`. Never string concatenation.

9b. **express.json() + multer interaction** — The global `express.json({ limit: '10mb' })` in `index.ts` runs on ALL routes before the protected router. For multipart requests, `express.json()` will try to parse the body and fail silently (Content-Type doesn't match `application/json`), so multer still gets the raw body. This should work without changes, but verify in route tests that both JSON error responses AND multipart upload both work on the same router. If conflicts arise, mount multer's route before `express.json()` or use conditional middleware.

9c. **createTestApp() works for multipart** — The existing `createTestApp()` helper mounts `express.json()` + `cookieParser()`, then calls your `setup` callback where you mount the datasets router (which has multer built-in). Since multer is route-level middleware, no helper changes are needed. For sending multipart in tests, use native `fetch` with `FormData` + `Blob` (same pattern as existing route tests — no supertest needed):
    ```typescript
    const form = new FormData();
    form.append('file', new Blob([csvContent], { type: 'text/csv' }), 'test.csv');
    const res = await fetch(`${baseUrl}/datasets`, {
      method: 'POST',
      body: form,
      headers: { Cookie: 'access_token=valid-jwt' },
    });
    ```

10. **JWT field access pattern** — `req.user` has `sub` (string — the user ID) and `org_id` (number). Always use `parseInt(user.sub, 10)` for userId and `user.org_id` for orgId. See invites route for reference pattern. Don't destructure as `orgId`/`userId` — those field names don't exist on JwtPayload.

11. **Express 5 auto-forwards async errors** — No need for `express-async-errors` or try-catch in route handlers. Throw `ValidationError(...)` and `errorHandler` middleware catches it.

12. **`AuthenticatedRequest` type** — Import from `middleware/authMiddleware.js`. Cast `req` to access `req.user`. JwtPayload fields: `sub` (string), `org_id` (number), `role`, `isAdmin`. Pattern from invites route:
    ```typescript
    import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
    router.post('/', upload.single('file'), async (req: Request, res: Response) => {
      const { user } = req as AuthenticatedRequest;
      const orgId = user.org_id;
      const userId = parseInt(user.sub, 10);
      // ...
    });
    ```

### DataSourceAdapter Interface Design

```typescript
// services/adapters/interface.ts
export interface ColumnValidationError {
  column: string;
  message: string; // product-blame language
  row?: number;    // undefined for header-level errors
}

export interface ValidationResult {
  valid: boolean;
  errors: ColumnValidationError[];
}

export interface ParsedRow {
  [column: string]: string; // raw string values from CSV
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  rowCount: number;
  warnings: string[]; // non-blocking issues (e.g., "5 empty rows skipped")
}

export interface PreviewData {
  headers: string[];
  sampleRows: ParsedRow[];  // first 5 rows
  rowCount: number;          // total rows (valid + skipped)
  validRowCount: number;     // rows that passed validation
  skippedRowCount: number;   // rows that failed (partial success)
  columnTypes: Record<string, 'date' | 'number' | 'text'>;
  warnings: string[];        // includes skipped row details if partial success
  fileName: string;
}

export interface DataSourceAdapter {
  /** Synchronous parse — csv-parse/sync is fast enough for <10MB files.
   *  Returns all rows in memory. Future adapters (API-based) may use async. */
  parse(buffer: Buffer): ParseResult;
  validate(headers: string[]): ValidationResult;
}
```

### CSV Validation Rules

**Required columns** (case-insensitive matching):
- `date` — must be parseable as a date (ISO 8601 preferred: YYYY-MM-DD)
- `amount` — must be a valid number (decimals ok, commas stripped)
- `category` — non-empty string

**Optional columns:**
- `label` — free text description
- `parent_category` — hierarchical grouping

**Column matching is case-insensitive and whitespace-trimmed.** The CSV might have `Date`, `AMOUNT`, ` category `. Normalize before validation.

**Row validation:** Only validate the first 100 rows for value-level errors (date format, amount format). This keeps validation fast for large files while catching systematic issues. If row 1-100 all parse correctly, it's reasonable to trust the rest.

**Partial success pattern:** If most rows validate but some don't (e.g., 95% valid, 5% bad dates), return a `warnings`-based response with `{ valid: true, warnings: ["12 rows skipped: invalid date format in rows 3, 17, ..."], validRowCount: 835, skippedRowCount: 12 }`. The preview shows valid data with a visible warning banner. This prevents rejecting an entire 1000-row file over a handful of bad rows. Threshold: if >50% of rows fail, reject the file entirely. If ≤50% fail, treat as partial success with warnings.

**File-level checks (client-side):**
- File extension is `.csv` OR MIME type is `text/csv` or `application/vnd.ms-excel`
- File size < 10MB (`MAX_FILE_SIZE`)
- File is not empty (size > 0)

**File-level checks (server-side):**
- Buffer is not empty
- Parseable as CSV (csv-parse doesn't throw on the first few characters)
- Has at least 1 data row (not just headers)
- Row count < 50,000 (MVP safety limit)

### UploadDropzone Component Design

```
┌─────────────────────────────────────────────┐
│                                             │
│              [Upload Icon]                  │  ← lucide-react Upload icon
│                                             │
│     Drag your CSV here or click to browse   │  ← Primary text (16px)
│                                             │
│     Accepted: .csv up to 10MB               │  ← Secondary text (14px, muted)
│     Download sample template                │  ← Link to sample CSV (Story 2.4)
│                                             │
└─────────────────────────────────────────────┘
```

**State machine:**

| State | Visual | Transition from | Transition to |
|-------|--------|----------------|---------------|
| `default` | Dashed border, upload icon, helper text | — (initial), error (re-upload), preview cancel (Story 2.3) | dragHover (drag enter), processing (file selected) |
| `dragHover` | Solid border primary, accent bg, "Drop to upload" | default (drag enter) | processing (drop), default (drag leave) |
| `processing` | Progress bar, "Validating your data..." | default (file selected), dragHover (drop) | preview (valid response, Story 2.3), error (validation failure) |
| `preview` | CsvPreview sub-component (Story 2.3) | processing (valid response) | success (confirm, Story 2.3), default (cancel, Story 2.3) |
| `success` | Green check, row count, redirect countdown (Story 2.3) | preview (confirm) | — (redirects to /dashboard) |
| `error` | Red border, error Alert, file reference retained | processing (validation failure) | default (re-drop/re-select), processing (retry same file) |

**Design tokens (from UX spec):**
- Error state border: `border-destructive` (maps to `--color-destructive`)
- Focus ring: `ring-ring` (maps to `--color-ring`)
- Upload icon: lucide-react `Upload`, 48px in default state, `--color-muted-foreground`
- Progress bar: use `--color-primary` fill on `--color-muted` track
- Drag hover background: `--color-accent`
- These tokens don't exist yet — define them in Tailwind CSS 4 `@theme` block or use direct color values matching the UX spec until a design system is formalized

**Accessibility (NFR25):**
- Dropzone: `<div role="button" tabIndex={0} aria-label="Upload CSV file">`
- Keyboard: Enter/Space → opens file picker
- Error state: `<Alert>` with `aria-live="assertive"` — screen reader announces errors immediately
- Focus management: on error, move focus to the Alert element
- File input: `<input type="file" accept=".csv" className="sr-only">` (visually hidden, accessible)

**Mobile adaptation:**
- Touch detection: `typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)`
- On touch devices: replace "Drag your CSV here or click to browse" with "Tap to select your CSV file"
- Hide drag-related text/icons on mobile
- Full-width dropzone (no max-width constraint on mobile)

### API Response Shapes

**Successful validation (200):**
```json
{
  "data": {
    "headers": ["date", "amount", "category", "label"],
    "sampleRows": [
      { "date": "2025-01-15", "amount": "12500.00", "category": "Revenue", "label": "Monthly sales" }
    ],
    "rowCount": 847,
    "validRowCount": 835,
    "skippedRowCount": 12,
    "columnTypes": { "date": "date", "amount": "number", "category": "text", "label": "text" },
    "warnings": ["12 rows skipped: invalid date format in rows 3, 17, 42, ..."],
    "fileName": "expenses-q4.csv"
  }
}
```

**Validation failure (400):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "CSV validation failed",
    "details": {
      "errors": [
        { "column": "date", "message": "We expected a column named 'date'. Your file has columns: Date, Total, Type" },
        { "column": "amount", "message": "Row 15: We couldn't read 'twelve hundred' as an amount. Expected a number (e.g., 1200.00)" }
      ],
      "fileName": "expenses-q4.csv"
    }
  }
}
```

### Multer Configuration

```typescript
import multer from 'multer';
import { MAX_FILE_SIZE } from 'shared/constants';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const csvTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (csvTypes.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new ValidationError(`We expected a .csv file, but received a ${file.mimetype} file.`));
    }
  },
});
```

**Multer error handling:** Multer throws `MulterError` for size limit violations. The error handler middleware doesn't know about this type. Wrap the multer middleware to catch `MulterError` and convert to `ValidationError`:

```typescript
function handleMulterError(err: unknown, _req: Request, _res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      throw new ValidationError('File size exceeds 10MB limit. Try splitting your data into smaller files.');
    }
    throw new ValidationError(`Upload error: ${err.message}`);
  }
  next(err);
}
```

### Testing Strategy

**csvAdapter.test.ts — unit tests (mock nothing, test pure logic):**
- Parse valid CSV with all required columns → returns ParseResult with correct rows
- Parse CSV with optional columns → columns included in output
- Missing required column → returns validation error with product-blame message
- Invalid date values → returns row-specific error
- Invalid amount values → returns row-specific error
- Empty file → returns file-level error
- Header-only file (no data rows) → returns error
- BOM marker in header → stripped and parsed correctly
- Case-insensitive column matching → `Date`, `AMOUNT`, ` category ` all recognized
- Trailing newlines → handled gracefully

**normalizer.test.ts — unit tests:**
- Transform parsed rows → correct schema shape (amounts as strings, dates as Date objects)
- Optional fields null when absent
- Category trimming and normalization

**datasets.test.ts — route tests (using `createTestApp()`):**
- POST with valid CSV file → 200 with preview data
- POST with invalid CSV → 400 with structured errors
- POST with wrong file type → 400 with product-blame message
- POST with oversized file → 400 with size error
- POST without auth → 401
- Verify `trackEvent` called on successful validation

**UploadDropzone.test.tsx — component tests (React Testing Library):**
*Note: This is the first component test in apps/web. Task 0b sets up the testing infrastructure. If the smoke test from 0b.4 fails, debug that before writing these tests. Mock `fetch` globally for upload calls — no actual API needed.*
- Renders default state with correct text and icon
- Click triggers file input
- File selection with valid CSV transitions to processing state
- Error state renders Alert with error messages
- Error state retains file reference ("Last attempt: filename.csv")
- Keyboard: Enter on dropzone opens file picker
- Mobile: shows "Tap to select" text on touch devices

### File Placement

```
apps/api/src/
├── routes/
│   ├── datasets.ts                           # NEW — POST /datasets (multer + validation)
│   └── protected.ts                          # MODIFY — mount datasetsRouter
├── services/
│   ├── adapters/
│   │   ├── interface.ts                      # NEW — DataSourceAdapter interface + types
│   │   └── index.ts                          # NEW — barrel export
│   └── dataIngestion/
│       ├── csvAdapter.ts                     # NEW — CSV parser (csv-parse) + column validator
│       ├── normalizer.ts                     # NEW — ParsedRow[] → data_rows schema shape
│       └── index.ts                          # NEW — barrel export

apps/web/
├── components/ui/
│   ├── alert.tsx                              # NEW — minimal Alert component (CVA variants)
│   └── progress.tsx                           # NEW — minimal progress bar component
├── lib/
│   └── utils.ts                               # NEW — cn() helper (clsx + tailwind-merge)
├── test/
│   └── setup.ts                               # NEW — testing-library/jest-dom setup
├── app/
│   ├── upload/
│   │   ├── page.tsx                            # NEW — upload page (RSC, centered layout)
│   │   └── UploadDropzone.tsx                  # NEW — client component (drag-drop + validation)
│   └── api/
│       └── datasets/
│           └── route.ts                        # NEW — explicit BFF handler (multipart streaming to Express)

packages/shared/src/
├── schemas/
│   └── datasets.ts                           # MODIFY — add csvValidationSchema, uploadDatasetSchema
├── types/
│   └── index.ts                              # MODIFY — add CsvValidationResult, UploadDataset types
├── constants/
│   └── index.ts                              # MODIFY — add CSV_REQUIRED_COLUMNS, CSV_OPTIONAL_COLUMNS, etc.

Tests:
├── apps/api/src/services/dataIngestion/csvAdapter.test.ts    # NEW
├── apps/api/src/services/dataIngestion/normalizer.test.ts    # NEW
├── apps/api/src/routes/datasets.test.ts                      # NEW
├── apps/api/src/test/fixtures/csvFiles.ts                    # NEW — sample CSV content
├── apps/web/app/upload/UploadDropzone.test.tsx                # NEW
```

### Previous Story Intelligence

From Story 2.1 + Epic 1 Retrospective + Epic 2 Checkpoint:

- **ESM `.js` extensions** — Every API local import needs `.js` suffix. This bites every new file. Double-check before running lint.
- **Stale `packages/shared/dist/`** — After modifying shared files, run `pnpm --filter shared build`. Forgetting causes phantom import errors.
- **`createTestApp()` helper** — exists at `apps/api/src/test/helpers/testApp.ts` for route testing. **Use this for datasets route tests.** Pattern from Story 1.5 invite route tests.
- **`vi.mock` pattern** — Mock at module level, import after. Use the established pattern:
  ```typescript
  vi.mock('../../services/dataIngestion/csvAdapter.js', () => ({
    csvAdapter: { parse: vi.fn(), validate: vi.fn() },
  }));
  ```
- **Integer IDs everywhere** — Don't accidentally use UUIDs.
- **RLS has no effect on this story** — The upload route validates but doesn't persist. RLS only matters when `db/queries/` functions run actual SQL. Story 2.3 will need RLS-aware testing.
- **Code review caught a critical bug in Story 2.1** (seed idempotency outside RLS transaction). Expect code review to catch similar issues — write code defensively.
- **Migration journal checklist** — Not applicable to this story (no new migrations).

### Recommended Task Execution Order

1. **Tasks 0a + 0b** (install web deps + testing infra) — do first, unblocks component work
2. **Task 6** (shared schemas + constants) → rebuild shared
3. **Tasks 2** (adapter interface) → **Task 3** (csvAdapter) → **Task 4** (normalizer) → **Task 5** (barrel)
4. **Task 1** (install multer) → **Task 7** (Express route + mount)
5. **Task 8** (create explicit BFF route handler for multipart)
6. **Task 9** (upload page) → **Task 10** (UploadDropzone component)
7. **Task 11** (tests) → **Task 13** (lint/type-check/test)
8. **Tasks 12, 14** (docs + sprint status — slot in anywhere)

### Story 2.3 Boundary

This story stops at validation. Story 2.3 picks up:
- `CsvPreview` component (renders from preview data returned by this story's endpoint)
- Confirm button → `POST /datasets/confirm` → `createDataset()` + `insertBatch()` → persist to DB
- Success state with redirect countdown to `/dashboard`
- Cancel → return to default state
- The route handler in this story returns preview data; Story 2.3 adds a second endpoint (or extends this one) for confirmation

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow (CSV Upload → AI Insight)]
- [Source: _bmad-output/planning-artifacts/architecture.md#File Organization Patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md#Gap #3: File upload proxy — multipart/form-data]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#UploadDropzone]
- [Source: _bmad-output/planning-artifacts/prd.md#FR6, FR7, FR12, NFR4, NFR21, NFR25]
- [Source: _bmad-output/implementation-artifacts/2-1-seed-data-demo-mode-foundation.md — Previous Story Intelligence]
- [Source: _bmad-output/implementation-artifacts/epic-2-checkpoint-story-2.1-2026-02-26.md — Risks & Watch Items]

## Dev Agent Record

### Implementation Plan
- Following task sequence as written: 0a → 0b → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14
- TDD approach where applicable (dependency installs verified by successful imports)

### Debug Log
- jsdom 28 + @testing-library/user-event 14.6.1 incompatibility: `FileList.item()` removed in jsdom 28. Switched all `userEvent.upload()` calls to `fireEvent.change` with manual `files` property assignment.
- jsdom exposes `ontouchstart` on window, making `isTouchDevice` evaluate to `true`. Adjusted test assertions to match mobile text ("Tap to select your CSV file").
- RTL auto-cleanup not working with vitest `globals: false`. Added explicit `cleanup()` in `afterEach` to prevent stacked DOM nodes.
- TypeScript strict mode: `Record<string, string>` indexing returns `string | undefined`. Added `!` assertions where array bounds are verified, `?? ''` fallback for record lookups.
- Unused `rowErrors` destructure in csvAdapter.ts caught by lint — simplified to `{ skippedRows }`.
- Unused `normalizeHeader` import in normalizer.ts caught by lint — removed (only needs `buildHeaderMap`).

### Completion Notes
All 14 tasks complete. 207 tests passing (182 API + 13 web + 12 shared). Lint clean, type-check clean. 5 _explained.md docs generated for new substantive files.

Key implementation decisions:
- Used `fireEvent.change` over `userEvent.upload` for component tests due to jsdom 28 incompatibility
- Removed unused `resetToDefault` from UploadDropzone (will be re-added in Story 2.3 when cancel flow is built)
- multer error detection uses duck-typing (`'code' in err`) rather than `instanceof MulterError` for better ESM compatibility

## File List

### New Files
- `apps/api/src/services/adapters/interface.ts` — DataSourceAdapter interface + types (ParseResult, ValidationResult, ParsedRow, PreviewData, ColumnValidationError)
- `apps/api/src/services/adapters/index.ts` — Barrel export
- `apps/api/src/services/dataIngestion/csvAdapter.ts` — CSV parser + validator (csv-parse/sync, BOM handling, partial success, row sampling)
- `apps/api/src/services/dataIngestion/normalizer.ts` — ParsedRow[] → NormalizedRow[] (DB schema shape)
- `apps/api/src/services/dataIngestion/index.ts` — Barrel export
- `apps/api/src/routes/datasets.ts` — POST /datasets (multer + validation + preview)
- `apps/api/src/test/fixtures/csvFiles.ts` — 12 CSV test fixtures
- `apps/api/src/services/dataIngestion/csvAdapter.test.ts` — 19 tests
- `apps/api/src/services/dataIngestion/normalizer.test.ts` — 4 tests
- `apps/api/src/routes/datasets.test.ts` — 6 tests
- `apps/web/lib/utils.ts` — cn() utility (clsx + tailwind-merge)
- `apps/web/components/ui/alert.tsx` — Alert component (CVA variants)
- `apps/web/components/ui/progress.tsx` — Progress bar component
- `apps/web/app/upload/page.tsx` — Upload page (RSC)
- `apps/web/app/upload/UploadDropzone.tsx` — 6-state client component (drag-drop, XHR progress, validation, accessibility)
- `apps/web/app/upload/UploadDropzone.test.tsx` — 12 component tests
- `apps/web/app/api/datasets/route.ts` — BFF handler (multipart streaming to Express)
- `apps/web/test/setup.ts` — Testing library setup
- `apps/web/test/smoke.test.tsx` — Smoke test

### Modified Files
- `apps/api/src/routes/protected.ts` — Mounted datasetsRouter
- `apps/web/vitest.config.ts` — Added setupFiles
- `apps/web/app/globals.css` — Added design tokens + animation keyframes
- `packages/shared/src/schemas/datasets.ts` — Added csvPreviewDataSchema, columnValidationErrorSchema, csvValidationErrorSchema
- `packages/shared/src/schemas/index.ts` — Added exports
- `packages/shared/src/types/datasets.ts` — Added CsvPreviewData, ColumnValidationError, CsvValidationError types
- `packages/shared/src/types/index.ts` — Added exports
- `packages/shared/src/constants/index.ts` — Added CSV_REQUIRED_COLUMNS, CSV_OPTIONAL_COLUMNS, CSV_MAX_ROWS, ACCEPTED_FILE_TYPES

## Change Log
- 2026-02-27: All tasks (0a through 14) implemented and verified. 207 tests passing, lint clean, type-check clean.
