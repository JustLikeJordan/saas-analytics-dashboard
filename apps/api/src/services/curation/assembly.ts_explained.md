# assembly.ts -- Interview-Ready Documentation

## 1. 30-Second Elevator Pitch

This is Layer 3 of a three-layer curation pipeline that sits between raw business data and an LLM. It takes statistically scored insights (anomalies, trends, breakdowns) and assembles them into a prompt that tells Claude how to interpret the data for a small business owner. The critical constraint: it accepts `ScoredInsight[]` and never `DataRow[]`, which means raw user data physically can't reach the LLM. TypeScript's type system enforces this boundary at compile time.

**How to say it in an interview:** "We built a three-layer pipeline -- compute, score, assemble -- where the assembly layer only receives statistical summaries, never raw data. The privacy boundary is enforced by TypeScript types, not just convention. This means even if someone makes a mistake in the future, the compiler catches it before user data can leak to an external API."

## 2. Why This Approach

### Decision 1: Template files instead of hardcoded prompts

The prompt lives in a separate `v1.md` file with mustache-style placeholders. This lets you version prompts independently from business logic. You can iterate on how you talk to Claude without touching any TypeScript. In production, this pattern enables A/B testing different prompt strategies by deploying a `v2.md` alongside `v1.md`.

**How to say it:** "Prompts are versioned artifacts, not string constants. We can deploy a new prompt version without changing business logic, and we store which version generated each summary for auditing."

### Decision 2: Pure function design

`assemblePrompt` takes inputs and returns outputs with no side effects. It doesn't call the database, doesn't call the LLM, doesn't log. This makes it trivially testable -- you pass in insights, you get back a prompt string and metadata. The orchestrator (`index.ts`) handles the impure work of calling Claude and storing results.

### Decision 3: Template caching

Templates are cached in a `Map` after first load. Since prompt templates change infrequently (they're versioned files), loading them once and caching avoids repeated filesystem reads on every pipeline run. This is the same pattern used by `scoring.ts` for the scoring weights config.

## 3. Code Walkthrough

### Block 1: Template loading and caching (lines 1-35)

The module uses `readFileSync` to load prompt templates from disk, cached in a `Map<string, string>`. If the template file doesn't exist, it throws an `AppError` with code `CONFIG_ERROR`. This is intentionally a hard failure -- a missing template means the pipeline can't produce output, and you want to know immediately.

**How to say it:** "We load templates once and cache them in memory. A missing template is a configuration error that should fail loud and fast, not silently produce garbage output."

### Block 2: formatStat (lines 37-57)

This function is the serializer that turns typed discriminated union members into human-readable text. Each branch of the switch handles a different stat type (Total, Average, Trend, Anomaly, CategoryBreakdown). TypeScript's exhaustiveness checking via the switch on `statType` ensures you handle every case -- if you add a new stat type to the union, the compiler will force you to add a branch here.

The format includes the relevance score so Claude has signal about which insights the scoring layer considered most important.

### Block 3: assemblePrompt (lines 59-103)

The main function. It handles the empty insights case gracefully -- rather than erroring, it tells Claude there's insufficient data. For non-empty insights, it:

1. Formats each insight into a human-readable line
2. Deduplicates stat types for the metadata
3. Counts unique categories (filtering out null/overall categories)
4. Captures the first insight's scoring breakdown as the "weights used" (all insights share the same weight config)
5. Replaces template placeholders with actual data

The return type is `AssembledContext` -- a prompt string plus transparency metadata that gets stored alongside the AI summary for the transparency panel (Story 3.6).

## 4. Complexity and Trade-offs

**Time complexity:** O(n) where n is the number of insights -- one pass to format, one to deduplicate stat types, one to collect categories. In practice, n is capped by `topN` in scoring config (default 8), so this is effectively O(1).

**Space complexity:** The assembled prompt is typically 1-3KB. The template cache holds one entry per version loaded.

**Trade-off -- scoring weights from first insight:** We grab `breakdown` from `insights[0]` as the scoring weights for transparency metadata. All insights share the same weight configuration since `scoring.ts` applies uniform weights. If we ever support per-insight weight overrides, this would need to change. For now, it's correct and avoids an extra parameter.

**Trade-off -- string replacement vs. template engine:** We use simple `.replace()` calls instead of a real template engine like Handlebars. This keeps dependencies minimal and the code obvious. The downside is that if someone puts `{{statSummaries}}` literally in their prompt text, it would get replaced. Acceptable risk for an internal tool.

## 5. Patterns Worth Knowing

**Discriminated union exhaustiveness:** The `formatStat` switch is a textbook example. When you switch on a discriminated union's tag field (here `statType`), TypeScript checks that every case is handled. Try removing a case -- you'll get a compile error. This is one of TypeScript's strongest features for domain modeling.

**Privacy-by-architecture:** The function signature `assemblePrompt(insights: ScoredInsight[], ...)` is the privacy boundary. `ScoredInsight` wraps `ComputedStat` (aggregated statistics), not `DataRow` (raw records). This is enforced at the type level -- you literally can't pass raw data here without a compiler error.

**Template versioning:** Storing `promptVersion` in the transparency metadata creates an audit trail. When you're debugging why two summaries sound different, you can check whether they used different prompt versions.

## 6. Interview Questions

**Q: How do you prevent raw user data from reaching the LLM?**
A: The assembly layer only accepts `ScoredInsight[]`, which wraps `ComputedStat[]` -- aggregated statistics like totals, trends, and anomalies. The TypeScript type signature enforces this at compile time. Even if a developer tries to pass `DataRow[]`, the compiler rejects it. This is "privacy-by-architecture" -- the constraint is structural, not just documented.

**Q: Why use file-based templates instead of inline strings?**
A: Three reasons: versioning (you can deploy v2 without changing code), auditability (each summary stores which prompt version generated it), and separation of concerns (prompt engineering and business logic evolve independently).

**Q: What happens if the insight array is empty?**
A: Rather than throwing an error, we generate a prompt that tells Claude there's insufficient data for analysis. This is graceful degradation -- the LLM can still produce a useful response like "Not enough data to identify trends yet."

## 7. Data Structures

The main input is `ScoredInsight[]`:
```
ScoredInsight {
  stat: ComputedStat (discriminated union on statType)
  score: number (0-1, composite relevance score)
  breakdown: { novelty, actionability, specificity } (component weights)
}
```

The output is `AssembledContext`:
```
AssembledContext {
  prompt: string (populated template, sent to Claude)
  metadata: TransparencyMetadata (stored in ai_summaries JSONB)
}
```

The transparency metadata is Zod-validated before database storage, catching shape drift early.

## 8. Impress the Interviewer

The three-layer curation pipeline (compute -> score -> assemble) is modeled after how real data analytics platforms work. Google Analytics, Mixpanel, and similar tools all have a phase where raw events are aggregated into metrics, a phase where metrics are ranked by significance, and a phase where the most important findings are presented. We're doing the same thing but feeding the output to an LLM instead of a dashboard widget.

The privacy boundary is worth highlighting specifically. Most LLM integrations pass raw user data to the model. We deliberately chose to compute statistics locally and only send aggregates. This means even if the LLM provider's data handling is compromised, individual user records are never exposed. It's a meaningful architectural decision, not just a nice-to-have.
