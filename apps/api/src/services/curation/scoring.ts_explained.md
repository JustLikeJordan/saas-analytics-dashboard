# scoring.ts — Explained

## 1. 30-Second Elevator Pitch

This file is the "ranking engine" of a 3-layer curation pipeline. It takes pre-computed statistics about a user's business data (things like revenue totals, growth trends, anomalies) and decides which ones are most worth talking about. Each stat gets scored on three axes — novelty, actionability, and specificity — then multiplied by configurable weights and sorted. The top N insights survive; the rest get dropped. The whole point: when an LLM later writes a plain-English summary, it only sees the most interesting facts, not everything.

Think of it like a newspaper editor deciding which stories make the front page. You have 50 possible stories. The editor scores each one on "how surprising is this?", "can the reader do something about it?", and "how specific is it?" — then picks the top 8.

## 2. Why This Approach?

### Exported module-level config loading

Line 49: `export const scoringConfig = loadConfig();` runs once when the module first imports. Not inside a function, not lazily — right at the top level. This means the server either starts with valid config or crashes immediately. There's no scenario where a request arrives and *then* you discover the config file is missing.

The config is exported (and renamed from `config` to `scoringConfig`) because the orchestrator (`index.ts`) needs to read `scoringConfig.thresholds.trendMinDataPoints` and pass it to the computation layer. The computation layer is pure — it doesn't load files — so the orchestrator threads this value as a parameter.

**How to say it:** "We front-load validation to fail fast at startup rather than at request time. The config is exported so the orchestrator can thread threshold values to other layers without breaking their purity."

### Exhaustive switch without default

The `noveltyScore` and `actionabilityScore` functions use `switch (stat.statType)` with all five cases covered — and no `default` branch. This is intentional. With the discriminated union on `ComputedStat`, TypeScript knows every possible `statType` value. If all cases are handled, TypeScript confirms all paths return. If someone adds a sixth `StatType` later and forgets to update these functions, the compiler will flag it: "Not all code paths return a value." A `default` case would silently absorb new stat types and return some fallback score — which masks the fact that you haven't thought about how to score the new type.

**How to say it:** "We omit the default case so the compiler catches unhandled stat types. It's a maintenance safety net — new variants force updates to every switch that touches them."

### Intrinsic scoring functions instead of a lookup table

Each scoring dimension (novelty, actionability, specificity) is its own function with a `switch` over stat types. You might think a simple `Map<StatType, number>` would be cleaner. But look at `noveltyScore` for trends — the score depends on how large the growth percentage is, not just the stat type. A flat lookup table can't express conditional logic like "trends with >10% growth score 0.8, otherwise 0.4." Functions give you that flexibility without overcomplicating things.

### JSON config file over environment variables

The rest of this codebase uses env vars (via `config.ts` with Zod validation). So why is scoring different? Because these weights are structured data — nested objects with arrays of numbers. Cramming `{"novelty": 0.35, "actionability": 0.40, "specificity": 0.25}` into an env var is ugly and error-prone. A JSON file is the natural format. It's also versioned (`"version": "1.0"`), so you can change the scoring formula and track which version generated which insights.

### Fail-fast Zod validation

The `loadConfig` function doesn't just read the file and hope for the best. It runs the parsed JSON through `scoringConfigSchema.safeParse()` — a Zod schema that checks types, ranges (weights between 0 and 1, topN is a positive integer), and structure. If someone adds a typo or removes a required field, the server won't start. This is the same pattern the codebase uses for env vars, applied to a different config source.

## 3. Code Walkthrough

### loadConfig (lines 11-47)

Three steps, each with its own error handling:

1. **Read the file** — `readFileSync` grabs the JSON. If the file doesn't exist, it throws an `AppError` with `CONFIG_ERROR` code. Synchronous read is intentional here — this runs once at startup, not during request handling.
2. **Parse JSON** — `JSON.parse` can throw on malformed JSON, so it's wrapped separately. This gives you a distinct error message ("not valid JSON" vs. "file missing").
3. **Validate schema** — `safeParse` returns a result object instead of throwing, so the code can attach the specific Zod validation issues to the error.

*What's happening*: Three-layer defensive parsing of a config file.
*How to say it in an interview*: "The function separates file I/O, JSON parsing, and schema validation into distinct error domains so each failure produces a specific, debuggable error message."

### noveltyScore, actionabilityScore, specificityScore (lines 51-86)

Each function takes a `ComputedStat` and returns a number between 0 and 1. They're pure functions — no side effects, no mutations, same input always gives same output.

With the discriminated union, the switch cases now narrow the type automatically. Inside `case StatType.Trend:`, TypeScript knows `stat` is a `TrendStat` and `stat.details` is `TrendDetails`. That means `stat.details.growthPercent` is a plain `number` — no `as number | undefined` cast, no `?? 0` fallback. The code went from:

```typescript
const growth = Math.abs(((stat.details.growthPercent as number | undefined) ?? 0));
```

to:

```typescript
return Math.abs(stat.details.growthPercent) > scoringConfig.thresholds.significantChangePercent ? 0.8 : 0.4;
```

Same for `actionabilityScore` accessing `stat.details.zScore` inside the Anomaly case. The type narrowing makes these one-liners safe.

The scoring logic follows a pattern: anomalies are generally the most interesting, then trends (conditionally), then breakdowns, then averages, then totals. But the *dimensions* differ:

- **Novelty** asks "how surprising?" — anomalies score 0.9. Totals score 0.1.
- **Actionability** asks "can you do something?" — an anomaly with a z-score above the threshold scores 0.9. A total scores 0.2.
- **Specificity** is simpler — if the stat has a `category` (like "revenue for Product X" vs. "total revenue"), it's more specific. Category-level anomalies hit 0.95.

*How to say it in an interview*: "Each scoring dimension is a pure function that maps discriminated union variants to normalized scores. TypeScript narrows the stat type in each switch case, giving type-safe access to stat-specific details like growth percentage and z-score."

### scoreInsights (lines 88-111)

The exported function and the only public scoring API. It:

1. Short-circuits on empty input (line 89)
2. Maps each stat through all three scoring functions
3. Computes a weighted sum: `novelty * 0.35 + actionability * 0.40 + specificity * 0.25`
4. Sorts descending by score
5. Slices to `scoringConfig.topN` (default 8)

The `breakdown` object is preserved on each `ScoredInsight` so downstream code (or debugging) can see *why* something ranked where it did. Without it, you'd only see the final number.

*How to say it in an interview*: "The function applies a weighted linear combination of three scoring dimensions, then returns the top-N results — a standard ranking pattern similar to how search engines combine relevance signals."

## 4. Complexity and Trade-offs

**Time complexity**: O(n log n) where n is the number of computed stats. The scoring pass is O(n), and the sort is O(n log n). The `slice` is O(topN), which is constant. For typical datasets (dozens to low hundreds of stats), this is trivially fast.

**Space complexity**: O(n) — a new `ScoredInsight` array is created. The original `ComputedStat[]` is not mutated.

**Trade-off: hardcoded heuristics vs. ML ranking**. The scoring functions use manually tuned numbers (0.9 for anomalies, 0.3 for breakdowns, etc.). A machine learning model could learn better weights from user engagement data. But for an MVP, hand-tuned heuristics are good enough and far simpler to debug. You can always swap this layer later without changing the pipeline's interface.

**Trade-off: synchronous config loading**. `readFileSync` blocks the event loop. That's fine at startup — the server isn't handling requests yet. But if someone moved this call into a request handler, it would be a performance problem. The module-level placement makes this safe.

**Trade-off: no weight normalization**. The weights (0.35 + 0.40 + 0.25 = 1.0) sum to 1.0, enforced by a Zod `.refine()` check. If the schema ever loosens this constraint, scores could range above 1.0. The ranking would still work correctly (relative order is preserved), but raw scores would be less interpretable.

## 5. Patterns and Concepts Worth Knowing

**Discriminated union narrowing in switch cases** — When you `switch (stat.statType)` and `ComputedStat` is a discriminated union, TypeScript narrows `stat` to the specific variant in each case. Inside `case 'trend':`, `stat` is `TrendStat`, so `stat.details.growthPercent` is `number`. No casts. This is one of the most powerful TypeScript patterns for working with heterogeneous data.

**Exhaustive switch on discriminated unions** — By covering all variants and omitting `default`, you get a compiler error if a new variant is added without updating the switch. This is a maintenance guardrail — the compiler tracks which code needs updating when the union grows.

**Weighted linear combination** — The same math behind college GPA calculations. Each dimension contributes proportionally to its weight. It's one of the simplest and most common ranking techniques in production systems.

**Fail-fast initialization** — The server either starts healthy or doesn't start at all. Validate all configuration before accepting traffic. The alternative — lazy loading that might fail on the 1000th request — is much harder to debug.

**Module-level singletons** — `export const scoringConfig = loadConfig()` creates a value that lives for the process lifetime. Every call to `scoreInsights` uses the same config object. This is a common Node.js pattern — ES modules are evaluated once and cached.

**Separation of scoring dimensions** — Each dimension is a separate function. If you need to add a fourth dimension (say, "recency"), you write one new function and add one weight to the config. Nothing else changes. This is the Open/Closed Principle in practice.

**Zod schema as config contract** — The `scoringConfigSchema` acts as a contract between the JSON file and the code that consumes it. Anyone editing the config file can look at the schema to understand what's valid.

## 6. Potential Interview Questions

**Q: Why use readFileSync instead of readFile (async)?**
Because this runs at module initialization, before the server accepts any connections. Blocking the event loop here is harmless — there are no requests to delay. Using async would require top-level await or a more complex initialization pattern for no real benefit.

**Q: What happens if the weights don't sum to 1.0?**
The Zod schema's `.refine()` check enforces this — if weights sum to anything other than 1.0 (within floating-point tolerance), the server won't start. If you removed that check, the ranking would still work correctly because we only care about relative ordering.

**Q: How would you make the scoring dimensions configurable per-customer?**
The `scoringConfig` is already exported, so you could use it as a base and spread customer-specific overrides: `{ ...scoringConfig, weights: customerWeights }`. You'd change `scoreInsights` to accept an optional config parameter (or call the scoring functions directly with different thresholds). The dimension functions themselves would need the config passed in rather than reading the module-level constant.

**Q: What happens if you add a new StatType but forget to update the scoring functions?**

*Context if you need it:* The scoring functions use `switch` over the discriminated union with no `default` case.

*Strong answer:* "TypeScript's exhaustiveness checking catches it at compile time. If I add `StatType.Forecast` and create a `ForecastStat` in the union, the `noveltyScore` and `actionabilityScore` functions will produce a type error — 'Not all code paths return a value' — because the switch doesn't handle `'forecast'`. The build breaks until I explicitly decide how to score the new type."

*Red flag answer:* "I'd add a default case that returns 0.5." That defeats the purpose — the whole point is that the compiler forces you to make a deliberate choice for each stat type.

**Q: This is a pure ranking system with no learning. How would you improve it?**
Track which insights users actually click on or find useful. Use that engagement data to train a simple model (even logistic regression) that predicts insight value. The weighted linear combination becomes learned weights instead of hand-tuned ones. The interface stays the same — `ComputedStat[] -> ScoredInsight[]`.

**Q: Why separate novelty, actionability, and specificity instead of one combined score function?**
Separation lets you tune each dimension independently and debug ranking decisions. When an insight ranks unexpectedly high, you check the `breakdown` field and immediately see which dimension drove it. A monolithic scoring function would be a black box.

## 7. Data Structures & Algorithms Used

**ComputedStat (discriminated union)** — The input type. A union of five stat-specific interfaces, each tagged by `statType`. Each variant carries typed `details`: `TrendStat` has `TrendDetails` (slope, growthPercent, etc.), `AnomalyStat` has `AnomalyDetails` (zScore, iqrBounds, etc.). Inside switch cases, TypeScript narrows to the specific variant, giving type-safe access to all detail fields.

**ScoredInsight** — The output type. Wraps a `ComputedStat` with a `score` (the weighted sum) and a `breakdown` object showing individual dimension scores. This is the "decorated" version of the input — same data, plus ranking metadata.

**ScoringConfig** — Loaded from JSON, validated by Zod. Three sections: `weights` (how much each dimension matters), `thresholds` (cutoff values for conditional scoring), and `topN` (how many results to return).

**Algorithm: score-sort-slice** — Map each item to a score, sort by that score, take the top N. This is a textbook selection problem. For small N relative to input size, you could use a min-heap for O(n log k) instead of O(n log n), but with typical input sizes (under 100 stats), the difference is immeasurable.

## 8. Impress the Interviewer

**"This is a privacy-by-architecture boundary."** The scoring layer only sees `ComputedStat[]` — aggregated statistics. It never touches raw data rows. Even if the LLM prompt is leaked or logged, it contains "revenue grew 23% in Q3" rather than individual customer records.

**"The breakdown field is an observability decision, not just debugging."** By preserving per-dimension scores on every insight, you get free auditability. A product manager can ask "why did the system highlight this anomaly over that trend?" and you can answer with numbers. In ML ranking systems, this is called "feature attribution" and it's often an afterthought. Here it's built in from day one.

**"Exhaustive switches catch new stat types at compile time."** If someone adds `StatType.Forecast`, every scoring function will produce a type error until they handle the new case. A `default` branch would silently assign a fallback score — you'd ship code that scores forecasts as if they were totals. Removing `default` makes the compiler your reviewer. Bring this up when discussing how type systems prevent maintenance bugs.

**"The config versioning enables A/B testing of scoring strategies."** The `"version": "1.0"` field in the JSON isn't decorative. If you store the config version alongside generated insights, you can compare how version 1.0 weights perform against version 2.0 in terms of user engagement. The system is ready for experimentation without code changes — swap the config file and track which version produced which results.
