# types.ts — Curation Pipeline Type Definitions

## 1. 30-Second Elevator Pitch

This file is the contract between three layers of a curation pipeline. Raw business data (like CSV rows of revenue, expenses, timestamps) goes in one end, and a ranked list of plain-English-ready insights comes out the other. `types.ts` defines the shapes of data that flow between those layers: `ComputedStat` (what we calculated), `ScoredInsight` (how important it is), and `ScoringConfig` (the tuning knobs). It's ~110 lines with zero logic — pure structure. But those lines enforce two things: a privacy boundary that keeps raw user data away from the AI model, and a discriminated union that gives downstream consumers compile-time safety on every stat-specific field.

**What's happening:** A file that only defines types and a validation schema.
**How to say it in an interview:** "This is the type-level contract for a three-stage data pipeline. It uses a discriminated union to give each stat type its own typed details shape, enforces privacy at compile time, and validates configuration at runtime with Zod."

## 2. Why This Approach?

### Decision 1: Privacy boundary through types

The pipeline has a hard rule — `DataRow[]` (raw user data) enters the computation layer and never leaves. Everything downstream only sees `ComputedStat[]`. This file doesn't import `DataRow` at all. That's intentional. If a future developer tries to sneak raw data into the scoring or assembly layer, they won't find a type that fits. The compiler becomes a security guard.

**How to say it:** "We use TypeScript's type system as an architectural enforcement mechanism. Raw data physically cannot flow past the computation layer because downstream types don't accept it."

### Decision 2: Discriminated union over a generic Record

`ComputedStat` used to be a single interface with `details: Record<string, unknown>` — a loose bag that could hold anything. That meant the scoring layer had to access fields with unsafe casts: `stat.details.growthPercent as number | undefined`. If computation.ts ever renamed `growthPercent`, scoring would silently get `undefined` (and then `0` via the `?? 0` fallback). No compiler warning.

Now `ComputedStat` is a discriminated union — five specific interfaces, each with its own `statType` literal and typed `details` shape. Inside `switch (stat.statType) { case 'trend': ... }`, TypeScript narrows `stat` to `TrendStat` and `stat.details` to `TrendDetails`. You get `stat.details.growthPercent` as a plain `number`, no cast needed. If anyone renames the field, the build breaks immediately.

**What's happening:** Instead of one generic interface that accepts any details, you have five specific interfaces that only accept the right details for each stat type. TypeScript's control flow analysis narrows automatically in switch cases.
**How to say it:** "We replaced an untyped details bag with a discriminated union. Each stat type carries its own typed details interface, and TypeScript narrows the type inside switch cases — giving us compile-time safety on every field access without manual casts."
**Over alternative:** The `Record<string, unknown>` approach was simpler but fragile. A field rename in computation would silently break scoring at runtime. The discriminated union adds ~60 lines of type definitions but turns that runtime bug into a compile error.

### Decision 3: Zod schema alongside TypeScript types

`ScoringConfig` has both a Zod schema (`scoringConfigSchema`) and a derived TypeScript type (`z.infer<typeof scoringConfigSchema>`). The schema validates JSON config files at runtime — someone could hand you malformed weights from a database or config file, and TypeScript can't help you there because types are erased at runtime. Zod catches that.

**How to say it:** "TypeScript types disappear after compilation. Zod schemas give us runtime validation for external data like configuration files, so we get both compile-time and runtime safety from a single source of truth."

### Decision 4: `as const` enum pattern instead of TypeScript `enum`

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

### Block 2: Detail interfaces (lines 15-50)

Five interfaces, one per stat type:

- **`TotalDetails`** — `scope` (category or overall) and `count` (how many rows contributed)
- **`AverageDetails`** — `scope` and `median` (the median value alongside the mean)
- **`TrendDetails`** — `slope`, `intercept`, `growthPercent`, `dataPoints`, `firstValue`, `lastValue`. Everything the scoring layer needs to judge a trend's significance.
- **`AnomalyDetails`** — `direction` ('above' or 'below' the fence), `zScore`, `iqrBounds` (the lower/upper fences), and `deviation` from the mean
- **`CategoryBreakdownDetails`** — `percentage`, `absoluteTotal`, `transactionCount`, `min`, `max`

These interfaces are the typed contract between computation and scoring. If computation renames `growthPercent` to `growth`, TypeScript will immediately flag every place scoring reads `stat.details.growthPercent` — because `TrendDetails` no longer has that field.

### Block 3: BaseComputedStat and the discriminated union (lines 52-85)

`BaseComputedStat` holds the fields every stat shares: `category` (nullable — overall stats have no category), `value`, and optional `comparison`. Then five interfaces extend it, each pinning `statType` to a specific string literal and `details` to the matching detail interface:

```typescript
export interface TrendStat extends BaseComputedStat {
  statType: 'trend';
  details: TrendDetails;
}
```

The union type `ComputedStat = TotalStat | AverageStat | TrendStat | AnomalyStat | CategoryBreakdownStat` is what everything downstream uses. When you `switch (stat.statType)`, TypeScript narrows `stat` to the specific variant in each case.

### Block 4: ScoredInsight (lines 87-95)

Wraps a `ComputedStat` with a numeric `score` and a `breakdown` showing how that score was calculated across three dimensions: novelty, actionability, and specificity. The assembly layer uses the score to pick the top N insights to send to the LLM.

### Block 5: ScoringConfig + Zod schema (lines 97-110)

The scoring layer needs tuning knobs — how much weight each dimension gets, how many insights to keep, what thresholds define "anomalous" or "significant." This Zod schema validates those knobs at runtime. Notice the `.refine()` on weights that checks they sum to 1.0, `trendMinDataPoints` must be at least 2, and everything positive is `.positive()`.

## 4. Complexity and Trade-offs

**Runtime cost:** Essentially zero. Types are erased at compile time. The Zod schema only runs when you call `.parse()` on actual config data, which happens once at startup — not per request.

**Verbosity vs. safety:** The discriminated union adds ~60 lines compared to the old `Record<string, unknown>` approach. Five detail interfaces, five stat interfaces, one base interface. That's more code to maintain. But the alternative was unsafe casts (`as number | undefined`) scattered through scoring, with no compiler protection against field renames. The extra lines pay for themselves the first time someone changes a field name and the build catches it.

**Single source of truth trade-off:** Deriving `ScoringConfig` from the Zod schema means you can't accidentally have the type and validation diverge. But it also means the Zod library is a hard dependency for this types file — unusual for a file that's otherwise pure TypeScript structure.

**How to say it in an interview:** "We chose a discriminated union knowing it adds verbosity, because the compile-time safety it provides across the pipeline's layers is worth more than the extra type definitions. The old approach with Record<string, unknown> was simpler but silently broke when fields changed."

## 5. Patterns and Concepts Worth Knowing

**Discriminated unions** — A TypeScript pattern where a union of interfaces each have a common "tag" field (here, `statType`) with a unique literal value. When you switch or check the tag, TypeScript narrows the type automatically. It's the same concept as "tagged unions" in Rust or "algebraic data types" in Haskell — a way to express "this value is one of these specific shapes." You'll see this in Redux reducers (action types), API responses, and state machines.

**Const assertion pattern** — `as const` plus indexed access types to create string literal unions from plain objects. You'll see this everywhere in modern TypeScript codebases. It replaces `enum` in most style guides.

**Schema-derived types** — Using `z.infer<>` to derive TypeScript types from a runtime validation schema. This is the standard Zod pattern and shows up in tRPC, Astro, and many other frameworks. The idea: define the shape once, get compile-time types and runtime validation without duplication.

**Privacy-by-architecture** — Designing your type system so that sensitive data structurally cannot reach certain parts of the codebase. This is stronger than a code review comment saying "don't pass raw data here." The types literally won't allow it.

**Branded/narrowed configuration** — The Zod schema doesn't just check "is this an object?" — it enforces business rules like `min(0).max(1)` for weights. This is runtime narrowing beyond what TypeScript's type system can express.

## 6. Potential Interview Questions

**Q: Why not use a TypeScript `enum` for `StatType`?**
A: Native enums compile to bidirectional lookup objects with runtime code that's harder to tree-shake. The `as const` pattern produces a plain frozen object — same type safety, cleaner output, easier to iterate with `Object.values()`. It's the community-preferred approach in most modern TypeScript projects.

**Q: Why use a discriminated union instead of a single interface with `Record<string, unknown>` details?**

*Context if you need it:* A discriminated union is where you have several interfaces that each share a "tag" field (like `statType`) with a unique value. TypeScript uses that tag to figure out which interface you're working with inside `switch` or `if` checks.

*Strong answer:* "The generic Record approach meant scoring had to cast every field it accessed — `stat.details.growthPercent as number`. If computation ever renamed that field, scoring silently got undefined and defaulted to zero. With the discriminated union, TypeScript narrows inside switch cases, so `stat.details.growthPercent` is a typed `number` with no cast. A field rename breaks the build immediately instead of silently producing wrong scores."

*Red flag answer:* "We used a discriminated union because it's a best practice." That's too generic — it doesn't explain the actual problem it solved.

**Q: How does TypeScript narrow types inside a switch statement?**

*Context if you need it:* TypeScript has "control flow analysis" — it tracks what you've checked about a value and uses that to refine the type in each branch.

*Strong answer:* "When you switch on `stat.statType` and the case is `'trend'`, TypeScript knows `stat` must be `TrendStat` because that's the only member of the union where `statType` is `'trend'`. So `stat.details` becomes `TrendDetails` — you get full autocomplete and type checking on fields like `growthPercent` and `slope`. No casts, no runtime checks beyond the switch itself."

**Q: How does this file enforce the privacy-by-architecture constraint?**
A: By not importing or referencing `DataRow` anywhere. The computation layer takes `DataRow[]` in and produces `ComputedStat[]` out. Since `ScoredInsight` and the assembly layer's inputs are defined purely in terms of `ComputedStat`, there's no type-level path for raw data to reach the LLM.

**Q: What happens if someone loads a scoring config JSON file with a weight of 1.5?**
A: The Zod schema's `.max(1)` constraint catches it at runtime and throws a `ZodError` with a clear message about which field failed. TypeScript alone couldn't catch this — `number` has no range constraints at the type level.

**Q: What happens if someone adds a sixth StatType?**
A: They'd need to add a new detail interface, a new stat interface, and add it to the `ComputedStat` union. Any `switch (stat.statType)` that doesn't handle the new case will produce a TypeScript error — the function's return type can't be guaranteed because not all paths return a value. The compiler forces you to handle every variant.

## 7. Data Structures and Algorithms Used

**Discriminated union** — The core data structure of this file. `ComputedStat` is a union of five types, each tagged by `statType`. Think of it like a shape with five possible forms — TypeScript looks at the tag to know which form you have. This is a compile-time construct with no runtime cost. The actual JavaScript objects are identical to what a single interface would produce; the union only exists in the type checker's head.

**Weighted scoring model** — `ScoredInsight.breakdown` represents a weighted multi-criteria scoring system. Each dimension (novelty, actionability, specificity) gets a score, and the `weights` in `ScoringConfig` determine how they combine into the final `score`. This is a basic form of multi-attribute utility theory — simple but effective for ranking.

**Schema validation as a state machine gate** — `scoringConfigSchema.parse()` acts as a gateway: invalid config never enters the system. This is the "parse, don't validate" philosophy — instead of checking conditions throughout your code, you validate once at the boundary and work with the proven-valid type downstream.

## 8. Impress the Interviewer

**"The type system is doing security work here."** Most people think of TypeScript types as developer convenience — autocomplete, catching typos. In this codebase, the type boundary between `DataRow[]` and `ComputedStat[]` is a privacy mechanism. Raw user data physically cannot reach the AI assembly layer because the types don't permit it. This is privacy-by-architecture, and it's stronger than policy because the compiler enforces it.

**"The discriminated union turns a runtime bug into a compile error."** Before this refactor, scoring accessed stat details with `as number | undefined` casts. If someone renamed `growthPercent` in computation.ts, the code would silently get `0` — a wrong answer that looks right. Now the discriminated union means a field rename breaks the build immediately. You catch it in the editor, not in production. In an interview, that's a concrete example of how type design choices affect system reliability.

**"Zod bridges the compile-time/runtime gap."** TypeScript types vanish when you compile to JavaScript. For internal function calls, that's fine. But configuration files arrive at runtime where TypeScript can't help. The Zod schema validates at the boundary, and `z.infer` keeps the type and validator in sync. One source of truth, two enforcement layers.

**"A hundred lines, four architectural concerns."** This file handles type definitions, a discriminated union contract, runtime validation, and privacy enforcement -- all without a single line of business logic. Pointing out that a types file carries this much architectural weight shows you think about system design, not just code.

---

## Story 3.2 Additions

### TransparencyMetadata and transparencyMetadataSchema

Added in Story 3.2 to support the AI transparency panel (Story 3.6). `transparencyMetadataSchema` is a Zod schema that validates the JSONB shape stored in `ai_summaries.transparency_metadata`. It captures what the LLM saw: which stat types, how many categories, how many insights, what scoring weights were used, and which prompt version generated the summary. This metadata is validated before database storage (in `index.ts`) to catch shape drift early -- if the metadata shape evolves but the assembly layer doesn't keep up, the Zod parse fails at write time rather than silently storing bad data.

### AssembledContext

The return type of `assemblePrompt()` in `assembly.ts`. It bundles the prompt string (what goes to Claude) with the transparency metadata (what gets stored for auditing). This pairing ensures the metadata always travels with the prompt -- you can't generate a prompt without also generating the corresponding metadata.
