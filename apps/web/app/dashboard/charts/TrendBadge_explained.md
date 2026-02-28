# TrendBadge.tsx — Interview-Ready Documentation

> Source file: `apps/web/app/dashboard/charts/TrendBadge.tsx` (36 lines)

---

## 1. 30-Second Elevator Pitch

TrendBadge is a small presentational component that renders a colored pill showing whether a metric went up, down, or stayed flat. It pairs an icon (arrow up, arrow down, or dash) with a percentage, so the trend is legible even without color — satisfying WCAG's "don't rely on color alone" rule. A `role="img"` wrapper with an `aria-label` makes the whole thing screen-reader friendly.

**How to say it in an interview:** "TrendBadge renders a trend indicator that combines color, icon shape, and an aria-label so the meaning is accessible through three channels — visual color, visual shape, and assistive-technology text. It's a stateless component that returns null for missing data and picks its icon and palette based on the sign of the value."

---

## 2. Why This Approach?

### Decision 1: Triple-channel accessibility (color + icon + aria-label)

**What's happening:** The badge uses green/red/gray backgrounds for sighted users, TrendingUp/TrendingDown/Minus icons for colorblind users, and a descriptive `aria-label` for screen reader users. Three independent signals carry the same information.

**How to say it in an interview:** "About 8% of men can't distinguish red from green. The icon shape communicates direction regardless of color perception, and the aria-label handles screen readers. Color is reinforcement, not the primary signal."

**Over alternative:** Using color alone would fail WCAG 1.4.1. Using only text (like "+12%") without an icon or color would be functional but harder to skim in a dashboard where you want trends to pop visually at a glance.

### Decision 2: Null guard with early return

**What's happening:** When `value` is `null`, the component returns `null` — it renders nothing. This avoids a confusing "0% flat" badge when there's genuinely no data.

**How to say it in an interview:** "Null means 'no data available,' which is different from 'zero change.' Rendering nothing is the honest representation. The parent component decides whether to show a placeholder."

**Over alternative:** Rendering a "N/A" badge or a disabled state would work but adds visual noise for something that might simply not apply to a given metric.

### Decision 3: Tabular figures via fontFeatureSettings

**What's happening:** The percentage text uses `fontFeatureSettings: '"tnum"'` to force monospaced (tabular) digits. When several TrendBadges appear in a column or row, the numbers align vertically regardless of digit width.

**How to say it in an interview:** "Proportional digits cause numbers to jitter when stacked. Tabular figures give every digit the same width, so percentages line up cleanly in a dashboard grid."

**Over alternative:** A monospace font family would also work but would clash with the rest of the UI's typeface. Font feature settings activate tabular figures within the existing font.

---

## 3. Code Walkthrough

### Interface and imports (lines 1-10)

**What's happening:** The component imports three Lucide icons (TrendingUp, TrendingDown, Minus), the `cn` utility for conditional class merging, and a `formatPercent` helper. The props interface takes `value` (a number or null) and `label` (the name of the metric, used in the aria-label).

**How to say it in an interview:** "The interface is intentionally narrow — just a number and a label. The component derives everything else (direction, icon, color) from those two inputs."

### Null guard (line 12-13)

**What's happening:** `if (value === null) return null;` — early return when there's no data. This keeps the rest of the function free of null checks.

**How to say it in an interview:** "Early return for the null case. Everything below the guard can assume `value` is a number, which simplifies the branching logic."

### Direction booleans and icon selection (lines 15-19)

**What's happening:** Three booleans (`isUp`, `isDown`, `isFlat`) make the intent readable. The icon assignment uses a nested ternary, which is fine here because it maps exactly three states to three values — no ambiguity.

**How to say it in an interview:** "Named booleans act as documentation. Instead of re-checking `value > 0` in three places, you check it once and reference `isUp` everywhere. The ternary is acceptable because the domain is fixed at three states."

### Render and accessibility (lines 21-35)

**What's happening:** The outer `<span>` gets a `role="img"` and an `aria-label` like "Revenue up 12 percent." The icon gets `aria-hidden="true"` because the parent's label already describes it — announcing both would be redundant. The `cn()` call merges base Tailwind classes with conditional color classes using short-circuit (`isUp && 'bg-success/10 text-success'`).

**How to say it in an interview:** "role='img' tells assistive tech to treat the whole span as a single described element. The aria-label is a full sentence: metric name, direction, percentage. The icon is hidden from the accessibility tree since the label covers it."

---

## 4. Complexity and Trade-offs

**Big O:** Everything is O(1). No iteration, no data transformation. The component does three comparisons, selects an icon, formats one number, and returns JSX. Rendering cost is a single flat DOM node with two children.

**Hardcoded three-state model.** If the product needed more gradations (e.g., "slightly up" vs. "significantly up"), the ternary chain and three-boolean approach would break down. You'd switch to a lookup table or a config object mapping ranges to icon/color pairs. For the current binary-with-neutral model, the approach is clear.

**Design token dependency.** Colors come from Tailwind tokens (`bg-success/10`, `text-destructive`). If the design system ever renames these tokens, the component breaks at build time — which is actually good, since a compile error is better than a silent color mismatch at runtime.

**Math.abs and Math.round in aria-label.** The label says "down 5 percent" rather than "down -5 percent" — `Math.abs` strips the sign because the word "down" already carries the direction. `Math.round` avoids "up 12.456789 percent." Small UX decisions baked into a one-liner.

**How to say it in an interview:** "The component is O(1) with no performance concerns. The main trade-off is the rigid three-state model — it's the right fit for up/down/flat trends, but you'd need a different data structure if the product wanted five or more severity levels."

---

## 5. Patterns Worth Knowing

### Conditional class merging with cn()

The `cn()` utility (usually wrapping `clsx` + `tailwind-merge`) lets you write conditional classes as `boolean && 'class-string'`. Falsy values get filtered out. This is the standard pattern in Tailwind + React codebases and reads better than a ternary soup in the className prop.

**Interview-ready:** "cn() merges Tailwind classes conditionally. It accepts a mix of strings, booleans, and undefined — falsy values are dropped. It's the idiomatic way to apply conditional styling in a Tailwind + shadcn/ui codebase."

### role="img" for composite visual elements

When a DOM element combines icon, color, and text into a single semantic unit, `role="img"` with an `aria-label` is the right approach. The alternative — letting each child announce itself — would produce garbled screen reader output like "TrendingUp icon, span, 12%."

**Interview-ready:** "role='img' tells screen readers to treat the whole subtree as one described element. The aria-label provides the description, and child elements are hidden with aria-hidden. It's the standard pattern for icon + text badges."

### Tabular figures as progressive enhancement

`fontFeatureSettings: '"tnum"'` activates a feature built into most professional fonts. If the font or browser doesn't support it, the text still renders — you just lose the alignment. No fallback code needed.

**Interview-ready:** "Tabular figures are a font-level feature, not a CSS layout trick. You activate them with fontFeatureSettings. If the font doesn't have the feature, it degrades gracefully to proportional digits. It's progressive enhancement — better when available, fine without."

---

## 6. Potential Interview Questions

### Q1: "Why role='img' instead of role='status' or aria-live?"

**Context if you need it:** The interviewer is checking whether you understand ARIA role semantics.

**Strong answer:** "role='img' is correct because this is a static visual representation — like an icon or a badge. role='status' implies the content updates dynamically and should be announced to screen readers on change, which would require aria-live. If this badge refreshed in real time (like a stock ticker), role='status' with aria-live='polite' would be appropriate. For a static trend indicator, role='img' is the right fit."

**Red flag:** "I always use role='img' for icons." — Suggests a mechanical habit rather than understanding the semantic difference between roles.

### Q2: "What happens if fontFeatureSettings isn't supported?"

**Context if you need it:** Tests whether you understand progressive enhancement.

**Strong answer:** "The percentage renders normally with proportional digit spacing. The badge is still fully functional — you just lose the nice column alignment when multiple badges appear side by side. It's a visual refinement, not a functional requirement. Every modern browser supports it, but if one didn't, the fallback is seamless."

**Red flag:** "You'd need a polyfill." — Font features aren't polyfillable. It's a font capability, not a JavaScript API.

### Q3: "How would you test this component's accessibility?"

**Context if you need it:** Probes whether you've actually tested with assistive tech or just added ARIA attributes.

**Strong answer:** "Three layers. First, automated: run axe-core or the axe DevTools extension — it catches missing labels, bad roles, and color contrast issues. Second, simulate vision deficiency in Chrome DevTools (Rendering tab → Emulate vision deficiencies) to verify the icon shape communicates the trend without color. Third, manual screen reader testing with VoiceOver or NVDA — tab to the badge and confirm it reads 'Revenue up 12 percent' as a single announcement."

**Red flag:** "I check that the aria-label is present in the DOM." — Presence doesn't mean correctness. A label that reads "span up NaN percent" is present but broken.

### Q4: "Why return null when value is null instead of showing a placeholder?"

**Context if you need it:** Checks whether you thought about the null case as a product decision.

**Strong answer:** "Null means 'no data exists for this comparison period' — like a metric that launched last month with no prior month to compare against. Rendering nothing lets the parent component decide how to handle the absence. If I rendered a 'N/A' placeholder, I'd be making a product decision that belongs to the parent. Keeping TrendBadge opinion-free about null makes it more reusable."

**Red flag:** "I just didn't want to handle the null case." — Suggests laziness rather than an intentional API design choice.

### Q5: "Why use named booleans (isUp, isDown, isFlat) instead of checking value directly?"

**Context if you need it:** The interviewer might think the booleans are unnecessary since you only use each once in the ternary.

**Strong answer:** "They're used more than once — isUp and isDown appear in both the className conditional and the aria-label ternary. Named booleans avoid repeating `value > 0` across the JSX and make the render block read like a sentence: 'if isUp, apply success colors.' If the threshold ever changed (say, treating anything under 1% as flat), you'd update one line instead of hunting through the template."

**Red flag:** "It's just cleaner code." — Vague. The concrete reasons are reuse across the template and single-point-of-change for threshold logic.

---

## 7. Data Structures

### TrendBadgeProps

**What it is:** A two-field interface: `value: number | null` (the trend percentage, where positive = up, negative = down, zero = flat, null = no data) and `label: string` (the metric name, used in the aria-label).

**Where it appears:** As the component's single props parameter. No internal state, no derived state objects. Everything flows from these two values.

**Why this shape:** The component derives direction, icon, color, and accessibility text entirely from `value` and `label`. There's no reason to pass a pre-computed `direction: 'up' | 'down' | 'flat'` because the derivation is trivial and keeping it internal means the parent doesn't need to compute it.

**How to say it in an interview:** "Two props: a number and a label. The component derives everything else. If the interface accepted a direction enum, you'd risk inconsistency — someone could pass `value: -5` with `direction: 'up'`. Deriving direction from the number's sign eliminates that class of bug."

---

## 8. Impress the Interviewer

### The Triple-Channel Accessibility Pattern

**What's happening:** TrendBadge communicates a single piece of information (trend direction) through three independent channels: color for sighted users, icon shape for colorblind users, and aria-label text for screen reader users. Any one channel is sufficient on its own.

**Why it matters:** WCAG 1.4.1 requires that color not be the sole means of conveying information. Most developers satisfy this minimally — maybe adding text alongside color. Going to three channels shows you think about the spectrum of how people consume visual data, not just a checkbox compliance mindset.

**How to bring it up:** "The badge uses three independent channels for trend direction: color, icon shape, and ARIA text. Any single channel communicates the information on its own. I think about accessibility as a design constraint that improves the component for everyone — the icon actually makes the badge faster to scan even for users with full color vision."

### Tabular Figures as a Dashboard Polish Detail

**What's happening:** `fontFeatureSettings: '"tnum"'` forces monospaced digit widths so percentages align vertically when multiple TrendBadges appear in a metric grid.

**Why it matters:** Mentioning this in an interview signals that you've built real dashboards. Most developers won't know what tabular figures are. It's the kind of detail that separates a polished data visualization from a prototype.

**How to bring it up:** "I use tabular figures on the percentage text so numbers align in columns. It's a font feature, not a layout trick — you activate it with fontFeatureSettings. It's the same reason financial spreadsheets use monospace digits. It's subtle, but dashboard users scan columns of numbers constantly, and misaligned digits slow that down."
