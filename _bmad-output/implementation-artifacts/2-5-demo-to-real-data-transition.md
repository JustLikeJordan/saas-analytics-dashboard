# Story 2.5: Demo-to-Real Data Transition

Status: done

## Story

As a **business owner**,
I want my first real upload to seamlessly replace the demo data,
So that I see my own data without manual cleanup steps.

## Acceptance Criteria

1. **Given** I am in `empty` demo mode (user org has no datasets, dashboard shows seed-demo org data), **When** I complete my first real CSV upload, **Then** any seed data in my org is cleaned up and my dataset is persisted (FR11). **And** the demo mode state transitions to `user_only`. **And** no "delete demo data" confirmation dialog is shown. **And** the confirm response includes the new `demoState`.

2. **Given** my upload completes and the dashboard reloads with real data, **When** Recharts renders the new dataset, **Then** charts use Recharts' built-in entry animation (cross-fade effect). **(Deferred to Story 2.6 — dashboard does not exist yet.)**

## Tasks / Subtasks

- [x] Task 0: Read existing code touched by this story
  - [x] 0a. Read `datasets.ts` (queries), `datasets.ts` (routes), `dataRows.ts`, `schema.ts`
  - [x] 0b. Understand `getUserOrgDemoState` and `getSeedDataset` functions
  - [x] 0c. Verify cascade delete on `data_rows.dataset_id` foreign key

- [x] Task 1: Add `deleteSeedDatasets` query function (AC: 1)
  - [x] 1a. Add function to `apps/api/src/db/queries/datasets.ts`
  - [x] 1b. Accepts `orgId` and optional `client` (transaction support)
  - [x] 1c. Deletes all datasets where `isSeedData = true` for the given org
  - [x] 1d. Data rows cascade-deleted via FK constraint

- [x] Task 2: Update `getUserOrgDemoState` to accept optional client (AC: 1)
  - [x] 2a. Add optional `client` parameter with `= db` default
  - [x] 2b. Change `db.query` to `client.query`
  - [x] 2c. Backward-compatible — no callers break

- [x] Task 3: Enhance confirm endpoint (AC: 1)
  - [x] 3a. Import `deleteSeedDatasets` and `getUserOrgDemoState`
  - [x] 3b. Inside transaction: call `deleteSeedDatasets(orgId, tx)` before creating user dataset
  - [x] 3c. Inside transaction: call `getUserOrgDemoState(orgId, tx)` after inserting rows
  - [x] 3d. Return `demoState` in response alongside `datasetId` and `rowCount`

- [x] Task 4: Write tests (AC: 1)
  - [x] 4a. `datasets.test.ts` (queries) — test `deleteSeedDatasets`, test updated `getUserOrgDemoState`
  - [x] 4b. `datasets.test.ts` (routes) — confirm response includes `demoState: 'user_only'`
  - [x] 4c. Verify `deleteSeedDatasets` called within transaction mock

- [x] Task 5: Update `_explained.md` docs
  - [x] 5a. `datasets_explained.md` (queries) — add `deleteSeedDatasets`, update `getUserOrgDemoState`
  - [x] 5b. `datasets.ts_explained.md` (routes) — update confirm walkthrough

- [x] Task 6: Lint, type-check, verify
  - [x] 6a. `pnpm type-check` — clean
  - [x] 6b. `pnpm test` — all tests pass

## Dev Agent Record

> Story file updated retroactively on 2026-03-05. Code was implemented during Epic 2 development but the story file was not updated at the time.

### Completion Notes
- `deleteSeedDatasets` implemented at `datasets.ts:80-88` with orgId + optional tx client
- `getUserOrgDemoState` updated at `datasets.ts:61-69` with optional client parameter (default `= db`)
- Confirm endpoint wraps both calls inside `persistUpload` transaction (`datasets.ts:24-37`)
- Response includes `{ datasetId, rowCount, demoState }`
- Route-level test confirms `demoState: 'user_only'` in confirm response
- Both `_explained.md` docs (queries + routes) updated with full coverage

## Dev Notes

### Architecture: Option C Demo Mode

Under Option C, seed data lives exclusively in the `seed-demo` org. User orgs start empty. The dashboard (Story 2.6) will fall back to showing seed-demo org data when a user org is in `empty` state. When the user uploads, the org transitions to `user_only` automatically because `getUserOrgDemoState` derives state from data.

### Why `deleteSeedDatasets` (Safety Net)

User orgs normally never have seed data. But the function exists as a defensive measure — if the architecture evolves to copy seed data into user orgs, or if a bug creates seed data in the wrong org, the confirm endpoint cleans it up atomically within the same transaction.

### Cascade Delete

`data_rows.dataset_id` references `datasets.id` with `onDelete: 'cascade'` — deleting a dataset automatically removes all its data rows at the database level.

### AC2 Deferral

The Recharts cross-fade animation requires the dashboard to exist. Story 2.6 builds the dashboard. AC2 will be verified as part of Story 2.6 implementation.
