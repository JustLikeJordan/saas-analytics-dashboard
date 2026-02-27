# datasets.ts (shared schemas) — Interview-Ready Documentation

## Elevator Pitch

Zod schemas that define the shape of dataset and data row records shared between the API and the frontend. The key detail is that `amount` is typed as `z.string()` — not a number — because Drizzle's `numeric(12,2)` returns strings from PostgreSQL. Parsing to numbers happens in the service layer, not the schema layer.

## Why This Approach

**Shared schemas live in `packages/shared/` so both apps validate the same shapes.** The API uses these schemas for response validation and type inference. The frontend will use them (in future stories) for runtime validation of API responses. Having one source of truth prevents the "API returns X but frontend expects Y" class of bugs.

**`amount: z.string()` reflects the Drizzle/PostgreSQL reality.** PostgreSQL's `NUMERIC` type preserves decimal precision that IEEE 754 floats can't represent. Drizzle passes these values as strings to avoid `12000.00` becoming `12000.00000000001`. The schema documents this: parse in the service layer where you control the precision.

**`z.coerce.date()` for timestamp and date fields.** PostgreSQL returns dates as ISO strings over the wire. `z.coerce.date()` accepts both `Date` objects (from Drizzle's `mode: 'date'`) and ISO strings (from JSON API responses), converting both to proper `Date` instances.

## Code Walkthrough

**`sourceTypeSchema`** — Enum of data source types: `csv`, `quickbooks`, `xero`, `stripe`, `plaid`. CSV is the only source type used in the MVP. The others are architectural placeholders for Growth-tier financial integrations.

**`demoModeStateSchema`** — The 4-state enum for the demo mode state machine. `empty` and `user_only` are the two states user orgs actually hit. `seed_only` and `seed_plus_user` exist for architectural completeness.

**`datasetSchema`** — Validates the `datasets` table shape. `uploadedBy` is nullable because seed datasets have no uploader (they're created by the seed script, not a user).

**`dataRowSchema`** — Validates the `data_rows` table shape. The `metadata` field uses `z.record(z.unknown()).nullable()` for flexible JSON storage — some rows might have notes, tags, or source-specific metadata.

## Patterns Worth Knowing

- **`z.coerce.date()`** — Zod's coercion transforms strings into Dates during parsing. Without `coerce`, you'd need to manually convert ISO strings before validation.
- **Shared package with type inference** — `z.infer<typeof datasetSchema>` in `types/datasets.ts` generates TypeScript types from schemas. One schema → one type, always in sync.
- **Nullable vs optional** — `nullable()` means the field exists but can be `null` (matches the database). `optional()` would mean the field might be absent from the object entirely — different semantics.

## Interview Questions

**Q: Why is `amount` a string instead of `z.number()`?**
A: PostgreSQL `NUMERIC` preserves exact decimal precision (important for financial data). JavaScript's `Number` type is IEEE 754 float, which introduces rounding errors — `0.1 + 0.2 !== 0.3`. Drizzle returns NUMERIC values as strings to avoid this. The schema reflects the wire format; parsing to numbers happens where the precision loss is acceptable (charts, display) or where you use a decimal library.

**Q: Why use `z.coerce.date()` instead of `z.date()`?**
A: Data comes over two paths: directly from Drizzle (where `mode: 'date'` already gives you a `Date` object) and from JSON API responses (where dates are serialized as ISO strings). `z.coerce.date()` handles both — it passes `Date` objects through and converts strings. `z.date()` would reject strings, breaking API response validation.

## Data Structures

**Type exports (from `types/datasets.ts`):**
```typescript
type SourceType = 'csv' | 'quickbooks' | 'xero' | 'stripe' | 'plaid';
type DemoModeState = 'seed_only' | 'seed_plus_user' | 'user_only' | 'empty';
type Dataset = { id: number; orgId: number; name: string; sourceType: SourceType; ... };
type DataRow = { id: number; orgId: number; amount: string; date: Date; ... };
```

## Impress the Interviewer

The `amount: z.string()` decision is a good conversation starter about the tension between type safety and ergonomics. You could add a `.transform(parseFloat)` to the schema and have `DataRow.amount` be a `number` everywhere — but then you lose the precision guarantee and couple the schema to a specific parsing strategy. Keeping it as a string at the schema level forces consumers to make an explicit decision about precision, which is the right trade-off for financial data.
