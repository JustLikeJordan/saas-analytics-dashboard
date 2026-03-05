# types.ts — Curation Pipeline Type Definitions

## 1. 30-Second Elevator Pitch

This file is the contract between three layers of a curation pipeline. Raw business data (like CSV rows of revenue, expenses, timestamps) goes in one end, and a ranked list of plain-English-ready insights comes out the other. `types.ts` defines the shapes of data that flow between those layers: `ComputedStat` (what we calculated), `ScoredInsight` (how important it is), and `ScoringConfig` (the tuning knobs). It's ~46 lines with zero logic — pure structure. But those 46 lines enforce a privacy boundary that keeps raw user data away from the AI model.

**What's happening:** A file that only defines types and a validation schema.
**How to say it in an interview:** "This is the type-level contract for a three-stage data pipeline. It enforces separation of concerns at compile time and validates configuration at runtime with Zod."

## 2. Why This Approach?

### Decision 1: Privacy boundary through types

The pipeline has a hard rule — `DataRow[]` (raw user data) enters the computation layer and never leaves. Everything downstream only sees `ComputedStat[]`. This file doesn't import `DataRow` at all. That's intentional. If a future developer tries to sneak raw data into the scoring or assembly layer, they won't find a type that fits. The compiler becomes a security guard.

**How to say it:** "We use TypeScript's type system as an architectural enforcement mechanism. Raw data physically cannot flow past the computation layer because downstream types don't accept it."

### Decision 2: Zod schema alongside TypeScript types

`ScoringConfig` has both a Zod schema (`scoringConfigSchema`) and a derived TypeScript type (`z.infer<typeof scoringConfigSchema>`). The schema validates JSON config files at runtime — someone could hand you malformed weights from a database or config file, and TypeScript can't help you there because types are erased at runtime. Zod catches that.

**How to say it:** "TypeScript types disappear after compilation. Zod schemas give us runtime validation for external data like configuration files, so we get both compile-time and runtime safety from a single source of truth."

### Decision 3: `as const` enum pattern instead of TypeScript `enum`

`StatType` uses `as const` with a plain object rather than a native `enum`. This is a common modern TypeScript pattern. Native enums generate runtime JavaScript code that's awkward to tree-shake and behaves differently from regular objects. The `as const` pattern gives you the same autocomplete and type narrowing, but it's just a frozen object — no surprises.

**How to say it:** "I prefer const objects over TypeScript enums because they produce cleaner JavaScript output and are easier to iterate over or use as lookup tables."

## 3. Code Walkthrough

### Block 1: StatType (lines 3-11)

```typescript
export const StatType = {
  Total: 'total',
  Average: 'average',
  Trend: 'trend',
  Anomaly: 'anomaly',
  CategoryBreakdown: 'category_breakdown',
} as const;

export type StatType = (typeof StatType)[keyof typeof StatType];
```

The object holds the five kinds of statistics the computation layer can produce. `as const` makes every value a literal type (not just `string`). The type on line 11 extracts the union `'total' | 'average' | 'trend' | 'anomaly' | 'category_breakdown'` — so you can use `StatType` as both a value (for lookups) and a type (for annotations). This dual-name trick works because TypeScript keeps types and values in separate namespaces.

### Block 2: ComputedStat (lines 13-19)

This is the output of the computation layer and the input to scoring. Each stat has:
- `statType` — which of the five calculations produced it
- `category` — nullable, because some stats (like total revenue) aren't category-specific
- `value` — the computed number
- `comparison` — optional; a previous-period value for trend/change detection
- `details` — a flexible bag for anything stat-specific (breakdown percentages, data point counts, etc.)

Think of `ComputedStat` as a standardized envelope. No matter what calculation produced it, the scoring layer can handle it the same way.

### Block 3: ScoredInsight (lines 21-29)

Wraps a `ComputedStat` with a numeric `score` and a `breakdown` showing how that score was calculated across three dimensions: novelty (is this surprising?), actionability (can the user do something about it?), and specificity (is this about something concrete?). The assembly layer uses the score to pick the top N insights to send to the LLM for summarization.

### Block 4: ScoringConfig + Zod schema (lines 31-46)

The scoring layer needs tuning knobs — how much weight each dimension gets, how many insights to keep, what thresholds define "anomalous" or "significant." This Zod schema validates those knobs at runtime. Notice the constraints: weights must be between 0 and 1, `trendMinDataPoints` must be at least 2 (you can't draw a trend from one point), and everything that should be positive is `.positive()`.

`z.infer<typeof scoringConfigSchema>` derives the TypeScript type from the schema, so you write the shape once and get both validation and type-checking.

## 4. Complexity and Trade-offs

**Runtime cost:** Essentially zero. Types are erased at compile time. The Zod schema only runs when you call `.parse()` on actual config data, which happens once at startup or config reload — not per request.

**Flexibility vs. rigidity:** `details: Record<string, unknown>` is deliberately loose. It lets different stat types carry different metadata without a discriminated union for every variant. The trade-off is that consumers of `details` need to validate or cast what they pull out. For a ~5-variant enum, this is a reasonable call. If `StatType` grew to 20+ variants, you'd probably want a discriminated union instead.

**Single source of truth trade-off:** Deriving `ScoringConfig` from the Zod schema means you can't accidentally have the type and validation diverge. But it also means the Zod library is a hard dependency for this types file — unusual for a file that's otherwise pure TypeScript structure.

## 5. Patterns and Concepts Worth Knowing

**Const assertion pattern** — `as const` plus indexed access types to create string literal unions from plain objects. You'll see this everywhere in modern TypeScript codebases. It replaces `enum` in most style guides.

**Schema-derived types** — Using `z.infer<>` to derive TypeScript types from a runtime validation schema. This is the standard Zod pattern and shows up in tRPC, Astro, and many other frameworks. The idea: define the shape once, get compile-time types and runtime validation without duplication.

**Privacy-by-architecture** — Designing your type system so that sensitive data structurally cannot reach certain parts of the codebase. This is stronger than a code review comment saying "don't pass raw data here." The types literally won't allow it.

**Branded/narrowed configuration** — The Zod schema doesn't just check "is this an object?" — it enforces business rules like `min(0).max(1)` for weights. This is runtime narrowing beyond what TypeScript's type system can express.

## 6. Potential Interview Questions

**Q: Why not use a TypeScript `enum` for `StatType`?**
A: Native enums compile to bidirectional lookup objects with runtime code that's harder to tree-shake. The `as const` pattern produces a plain frozen object — same type safety, cleaner output, easier to iterate with `Object.values()`. It's the community-preferred approach in most modern TypeScript projects.

**Q: What does `z.infer<typeof scoringConfigSchema>` actually do?**
A: It walks the Zod schema's generic type parameter at the type level and extracts the TypeScript type that a successful `.parse()` call would return. You get a regular TypeScript interface without writing it by hand. If you change the schema, the type updates automatically.

**Q: How does this file enforce the privacy-by-architecture constraint?**
A: By not importing or referencing `DataRow` anywhere. The computation layer takes `DataRow[]` in and produces `ComputedStat[]` out. Since `ScoredInsight` and the assembly layer's inputs are defined purely in terms of `ComputedStat`, there's no type-level path for raw data to reach the LLM. A developer would have to deliberately circumvent the type system (with `any` casts) to break this boundary.

**Q: Why is `details` typed as `Record<string, unknown>` instead of a more specific type?**
A: It's a pragmatic choice. Each `StatType` carries different metadata — a trend stat might include slope and r-squared, while an anomaly stat includes z-score and expected range. A full discriminated union would be more type-safe but adds complexity for five variants. `Record<string, unknown>` keeps the interface simple, with the understanding that consumers validate what they extract.

**Q: What happens if someone loads a scoring config JSON file with a weight of 1.5?**
A: The Zod schema's `.max(1)` constraint catches it at runtime and throws a `ZodError` with a clear message about which field failed. TypeScript alone couldn't catch this — `number` has no range constraints at the type level.

## 7. Data Structures and Algorithms Used

**Union types from const objects** — The `StatType` type is a string literal union derived from an object's values. This is a compile-time construct with no runtime cost. Think of it as telling the compiler "only these five strings are valid here."

**Weighted scoring model** — `ScoredInsight.breakdown` represents a weighted multi-criteria scoring system. Each dimension (novelty, actionability, specificity) gets a score, and the `weights` in `ScoringConfig` determine how they combine into the final `score`. This is a basic form of multi-attribute utility theory — simple but effective for ranking.

**Schema validation as a state machine gate** — `scoringConfigSchema.parse()` acts as a gateway: invalid config never enters the system. This is the "parse, don't validate" philosophy — instead of checking conditions throughout your code, you validate once at the boundary and work with the proven-valid type downstream.

## 8. Impress the Interviewer

**"The type system is doing security work here."** Most people think of TypeScript types as developer convenience — autocomplete, catching typos. In this codebase, the type boundary between `DataRow[]` and `ComputedStat[]` is a privacy mechanism. Raw user data physically cannot reach the AI assembly layer because the types don't permit it. This is a real architectural pattern called privacy-by-architecture, and it's stronger than policy ("please don't pass raw data") because it's enforced by the compiler.

**"Zod bridges the compile-time/runtime gap."** TypeScript types vanish when you compile to JavaScript. For internal function calls, that's fine — the compiler already checked everything. But configuration files, API responses, database rows — these arrive at runtime where TypeScript can't help. The Zod schema validates at the boundary, and `z.infer` keeps the type and validator in sync. One source of truth, two enforcement layers. If an interviewer asks about runtime type safety in TypeScript, this is exactly the pattern to reference.

**"Forty-six lines, three architectural concerns."** This file handles type definitions, runtime validation, and privacy enforcement — all without a single line of business logic. In an interview, pointing out that a small types file can carry this much architectural weight shows you think about system design, not just code. Types aren't just documentation. They're load-bearing structure.
