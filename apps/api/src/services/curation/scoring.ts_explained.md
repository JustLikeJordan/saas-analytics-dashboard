# scoring.ts — Explained

## 1. 30-Second Elevator Pitch

This file is the "ranking engine" of a 3-layer curation pipeline. It takes pre-computed statistics about a user's business data (things like revenue totals, growth trends, anomalies) and decides which ones are most worth talking about. Each stat gets scored on three axes — novelty, actionability, and specificity — then multiplied by configurable weights and sorted. The top N insights survive; the rest get dropped. The whole point: when an LLM later writes a plain-English summary, it only sees the most interesting facts, not everything.

Think of it like a newspaper editor deciding which stories make the front page. You have 50 possible stories. The editor scores each one on "how surprising is this?", "can the reader do something about it?", and "how specific is it?" — then picks the top 8.

## 2. Why This Approach?

### Module-level config loading

Line 49: `const config = loadConfig();` runs once when the module first imports. Not inside a function, not lazily — right at the top level. This means the server either starts with valid config or crashes immediately. There's no scenario where a request arrives and *then* you discover the config file is missing. In an interview, you'd say: "We front-load validation to fail fast at startup rather than at request time."

### Intrinsic scoring functions instead of a lookup table

Each scoring dimension (novelty, actionability, specificity) is its own function with a `switch` over stat types. You might think a simple `Map<StatType, number>` would be cleaner. But look at `noveltyScore` for trends (line 57-60) — the score depends on how large the growth percentage is, not just the stat type. A flat lookup table can't express conditional logic like "trends with >10% growth score 0.8, otherwise 0.4." Functions give you that flexibility without overcomplicating things.

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

### noveltyScore, actionabilityScore, specificityScore (lines 52-104)

Each function takes a `ComputedStat` and returns a number between 0 and 1. They're pure functions — no side effects, no mutations, same input always gives same output.

The scoring logic follows a pattern: anomalies are generally the most interesting, then trends (conditionally), then breakdowns, then averages, then totals. But the *dimensions* differ:

- **Novelty** asks "how surprising?" — anomalies score 0.9 because unexpected things are inherently novel. Totals score 0.1 because knowing your total revenue is expected, not surprising.
- **Actionability** asks "can you do something?" — an anomaly with a z-score above the threshold (default 2.0) scores 0.9 because it probably needs attention. A total scores 0.2 because there's no obvious next step.
- **Specificity** is simpler — if the stat has a `category` (like "revenue for Product X" vs. "total revenue"), it's more specific. Category-level anomalies hit 0.95.

*What's happening*: Three heuristic functions that convert stat metadata into 0-1 scores.
*How to say it in an interview*: "Each scoring dimension is a heuristic function that maps statistical metadata to a normalized score, with conditional logic for stats that carry magnitude information like z-scores and growth percentages."

### scoreInsights (lines 106-129)

The exported function and the only public API. It:

1. Short-circuits on empty input (line 107)
2. Maps each stat through all three scoring functions
3. Computes a weighted sum: `novelty * 0.35 + actionability * 0.40 + specificity * 0.25`
4. Sorts descending by score
5. Slices to `config.topN` (default 8)

The `breakdown` object is preserved on each `ScoredInsight` so downstream code (or debugging) can see *why* something ranked where it did. That's a nice touch — without it, you'd only see the final number.

*What's happening*: Weighted scoring, sort, and top-N selection.
*How to say it in an interview*: "The function applies a weighted linear combination of three scoring dimensions, then returns the top-N results — a standard ranking pattern similar to how search engines combine relevance signals."

## 4. Complexity and Trade-offs

**Time complexity**: O(n log n) where n is the number of computed stats. The scoring pass is O(n), and the sort is O(n log n). The `slice` is O(topN), which is constant. For typical datasets (dozens to low hundreds of stats), this is trivially fast.

**Space complexity**: O(n) — a new `ScoredInsight` array is created. The original `ComputedStat[]` is not mutated.

**Trade-off: hardcoded heuristics vs. ML ranking**. The scoring functions use manually tuned numbers (0.9 for anomalies, 0.3 for breakdowns, etc.). A machine learning model could learn better weights from user engagement data. But for an MVP, hand-tuned heuristics are good enough and far simpler to debug. You can always swap this layer later without changing the pipeline's interface.

**Trade-off: synchronous config loading**. `readFileSync` blocks the event loop. That's fine at startup — the server isn't handling requests yet. But if someone moved this call into a request handler, it would be a performance problem. The module-level placement makes this safe.

**Trade-off: no weight normalization**. The weights (0.35 + 0.40 + 0.25 = 1.0) sum to 1.0, but nothing enforces that. If someone edits the config to `{novelty: 0.5, actionability: 0.5, specificity: 0.5}`, the scores would range up to 1.5 instead of 1.0. The ranking would still work correctly (relative order is preserved), but the raw score values would be less interpretable. A stricter approach would normalize the weights, but that adds complexity for a minor issue.

## 5. Patterns and Concepts Worth Knowing

**Weighted linear combination** — This is the same math behind college GPA calculations. Each dimension contributes proportionally to its weight. It's one of the simplest and most common ranking techniques in production systems.

**Fail-fast initialization** — The server either starts healthy or doesn't start at all. You'll see this pattern everywhere in production code: validate all configuration before accepting traffic. The alternative — lazy loading that might fail on the 1000th request — is much harder to debug.

**Module-level singletons** — `const config = loadConfig()` creates a value that lives for the process lifetime. Every call to `scoreInsights` uses the same config object. This is a common Node.js pattern — ES modules are evaluated once and cached.

**Separation of scoring dimensions** — Each dimension is a separate function. If you need to add a fourth dimension (say, "recency"), you write one new function and add one weight to the config. Nothing else changes. This is the Open/Closed Principle in practice — open for extension, closed for modification.

**Zod schema as config contract** — The `scoringConfigSchema` acts as a contract between the JSON file and the code that consumes it. Anyone editing the config file can look at the schema to understand what's valid. It's living documentation.

## 6. Potential Interview Questions

**Q: Why use readFileSync instead of readFile (async)?**
Because this runs at module initialization, before the server accepts any connections. Blocking the event loop here is harmless — there are no requests to delay. Using async would require top-level await or a more complex initialization pattern for no real benefit.

**Q: What happens if the weights don't sum to 1.0?**
The ranking still works correctly because we only care about relative ordering, not absolute scores. If weights sum to 1.5, all scores scale up proportionally, but the sort order stays the same. You could normalize by dividing each weight by the sum, but it's unnecessary for ranking.

**Q: How would you make the scoring dimensions configurable per-customer?**
You'd move the scoring functions from using module-level config to accepting a config parameter. `scoreInsights(stats, customerConfig)` instead of `scoreInsights(stats)`. The default config becomes a fallback. The function signatures of the dimension functions would grow by one parameter.

**Q: This is a pure ranking system with no learning. How would you improve it?**
Track which insights users actually click on or find useful. Use that engagement data to train a simple model (even logistic regression) that predicts insight value. The weighted linear combination becomes learned weights instead of hand-tuned ones. The interface stays the same — `ComputedStat[] -> ScoredInsight[]`.

**Q: Why separate novelty, actionability, and specificity instead of one combined score function?**
Separation lets you tune each dimension independently and debug ranking decisions. When an insight ranks unexpectedly high, you check the `breakdown` field and immediately see which dimension drove it. A monolithic scoring function would be a black box.

**Q: What's the role of Zod here vs. TypeScript types?**
TypeScript types disappear at runtime — they can't catch a JSON file with `"topN": "eight"` instead of `"topN": 8`. Zod validates at runtime, at the boundary where untyped data enters the system. After `safeParse` succeeds, TypeScript's type system takes over.

## 7. Data Structures & Algorithms Used

**ComputedStat** — The input type. Contains a `statType` enum, an optional `category` string, a numeric `value`, and a `details` bag (`Record<string, unknown>`) for type-specific metadata like `growthPercent` or `zScore`. The `details` bag uses `unknown` because different stat types carry different fields.

**ScoredInsight** — The output type. Wraps a `ComputedStat` with a `score` (the weighted sum) and a `breakdown` object showing individual dimension scores. This is the "decorated" version of the input — same data, plus ranking metadata.

**ScoringConfig** — Loaded from JSON, validated by Zod. Three sections: `weights` (how much each dimension matters), `thresholds` (cutoff values for conditional scoring), and `topN` (how many results to return).

**Algorithm: score-sort-slice** — Map each item to a score, sort by that score, take the top N. This is a textbook selection problem. For small N relative to input size, you could use a min-heap for O(n log k) instead of O(n log n), but with typical input sizes (under 100 stats), the difference is immeasurable.

## 8. Impress the Interviewer

**"This is a privacy-by-architecture boundary."** The scoring layer only sees `ComputedStat[]` — aggregated statistics. It never touches raw data rows. This is a deliberate architectural constraint: even if the LLM prompt is leaked or logged, it contains "revenue grew 23% in Q3" rather than individual customer records. Mention this when discussing data handling or system design.

**"The breakdown field is an observability decision, not just debugging."** By preserving per-dimension scores on every insight, you get free auditability. A product manager can ask "why did the system highlight this anomaly over that trend?" and you can answer with numbers: novelty 0.9 vs. 0.4, actionability 0.9 vs. 0.3. In ML ranking systems, this is called "feature attribution" and it's often an afterthought. Here it's built in from day one.

**"The config versioning enables A/B testing of scoring strategies."** The `"version": "1.0"` field in the JSON isn't decorative. If you store the config version alongside generated insights, you can compare how version 1.0 weights perform against version 2.0 weights in terms of user engagement. The system is ready for experimentation without any code changes — just swap the config file and track which version produced which results.
