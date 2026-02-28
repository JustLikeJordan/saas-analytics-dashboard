# Story 2.4: Sample CSV Template Download

Status: done

## Story

As a **business owner**,
I want to download a sample CSV template showing the expected format,
So that I can structure my data correctly before uploading.

## Acceptance Criteria

1. **Given** I am on the upload page (default state), **When** I click the template download link, **Then** `sample-data.csv` is downloaded from `/templates/sample-data.csv` (FR9).

2. **Given** I see a validation error after a failed upload, **When** I click the template download link in the error alert, **Then** the same `sample-data.csv` is downloaded (FR9).

3. **Given** the template file exists, **When** I open it, **Then** it contains the required columns (`date`, `amount`, `category`) plus optional columns (`parent_category`, `label`) with 5 representative example rows matching the expected schema.

## Tasks / Subtasks

- [x] Task 0: Read and understand existing code touched by this story
  - [x]0a. Read `UploadDropzone.tsx` — identify both placeholder `href="#"` links
  - [x]0b. Read `csvAdapter.ts` — confirm expected column format
  - [x]0c. Read `packages/shared/src/constants/index.ts` — confirm required/optional columns

- [x]Task 1: Create sample CSV template file (AC: 3)
  - [x]1a. Create directory `apps/web/public/templates/`
  - [x]1b. Create `apps/web/public/templates/sample-data.csv` with 5 rows of realistic small-business data
  - [x]1c. Columns: `date,amount,category,parent_category,label`
  - [x]1d. Rows use ISO 8601 dates, numeric amounts, categories matching seed data theme

- [x]Task 2: Wire up download links in UploadDropzone (AC: 1, 2)
  - [x]2a. Update `DefaultContent` template link: `href="/templates/sample-data.csv"` with `download` attribute
  - [x]2b. Update error state template link: same href + download attribute + stopPropagation
  - [x]2c. Both links must not trigger the dropzone's file picker (stopPropagation)

- [x]Task 3: Write tests (AC: all)
  - [x]3a. Update `UploadDropzone.test.tsx` — verify template download link renders with correct href
  - [x]3b. Verify link has `download` attribute

- [x]Task 4: Lint, type-check, verify
  - [x]4a. `pnpm type-check` — clean
  - [x]4b. `pnpm test` — all tests pass

## Dev Notes

### What Already Exists (from Stories 2.2/2.3)

- `UploadDropzone.tsx` has two `<a href="#">Download sample template</a>` placeholders:
  - Line 374-380: In `DefaultContent` component (default dropzone state) — already has `onClick={(e) => e.stopPropagation()}`
  - Line 355-358: In error state alert — no stopPropagation yet

### CSV Schema (from `packages/shared/src/constants/index.ts`)

- Required: `date`, `amount`, `category`
- Optional: `label`, `parent_category`
- Max rows: 50,000
- Date validation: ISO 8601 preferred (`YYYY-MM-DD`), accepts common formats
- Amount validation: numeric, commas stripped

### Static File Serving

Next.js serves files from `apps/web/public/` at the root path. `public/templates/sample-data.csv` → accessible at `/templates/sample-data.csv`. No API route or server logic needed.
