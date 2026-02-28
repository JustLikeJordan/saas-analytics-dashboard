# RevenueChart.tsx — Interview-Ready Documentation

> Source file: `apps/web/app/dashboard/charts/RevenueChart.tsx` (119 lines)

---

## 1. 30-Second Elevator Pitch

RevenueChart renders a monthly revenue line chart using Recharts with full accessibility baked in. The custom tooltip uses `role="status"` and `aria-live="assertive"` so screen readers announce values as users hover or keyboard-navigate data points. It respects `prefers-reduced-motion` by disabling chart animations, uses semantic HTML (`figure`/`figcaption`) instead of generic divs, and formats all currency with `Intl.NumberFormat` for locale-correct output. The hover shadow on the card suppresses itself under `motion-reduce`.

**How to say it in an interview:** "RevenueChart is an accessible Recharts line chart wrapped in semantic HTML. The custom tooltip is an aria-live region so screen readers announce values during keyboard navigation. Animations respect prefers-reduced-motion, and all currency formatting goes through Intl.NumberFormat for locale correctness."

---

## 2. Why This Approach?

### Decision 1: Custom tooltip with aria-live instead of Recharts default

**What's happening:** Recharts' built-in tooltip is a positioned div with no ARIA attributes. Screen readers can't announce it. The custom `RevenueTooltip` component uses `role="status"` and `aria-live="assertive"` — when the tooltip content changes (user hovers a new data point or keyboards through them), the screen reader announces the new value immediately.

**How to say it in an interview:** "The default Recharts tooltip is invisible to assistive technology. I replaced it with a custom component that uses aria-live='assertive' so screen readers announce data point values as the user navigates the chart. It's the difference between a chart that's visual-only and one that's actually usable with a screen reader."

**Over alternative:** Using `aria-describedby` on each dot would be more granular but Recharts doesn't expose per-dot ARIA attributes. The live region approach works with Recharts' existing event system — no fork needed.

### Decision 2: Recharts 3.x accessibilityLayer

**What's happening:** The `accessibilityLayer` prop on `LineChart` enables keyboard navigation of data points. Users can Tab into the chart and arrow between points, triggering tooltip updates. Combined with the aria-live tooltip, this makes the chart fully keyboard-operable.

**How to say it in an interview:** "accessibilityLayer is Recharts 3.x's built-in keyboard navigation. It lets users Tab into the chart and arrow between data points. Combined with the aria-live tooltip, every data point is reachable and announced without a mouse."

**Over alternative:** Building custom keyboard navigation from scratch. Doable but fragile — you'd need to manage focus position, handle edge cases at chart boundaries, and stay in sync with Recharts' internal state. The built-in layer handles all of this.

### Decision 3: figure/figcaption instead of div soup

**What's happening:** The whole chart is a `<figure>` element with a `<figcaption>` for the title and trend badge. This is semantically correct — a figure is "self-contained content that is referenced from the main flow." Screen readers announce it as a figure with a caption, giving users context before they enter the chart area.

**How to say it in an interview:** "I used figure and figcaption for semantic correctness. Screen readers announce the chart as a captioned figure, so users know what they're looking at before interacting with the data. It's more meaningful than a div with an h3 inside."

**Over alternative:** `<div>` with `<h3>`. Works visually but loses semantic meaning. A screen reader user navigating by landmarks wouldn't know the heading and chart are related.

### Decision 4: Tabular figures via fontFeatureSettings

**What's happening:** The tooltip and summary line use `fontFeatureSettings: '"tnum"'` — tabular figures. This makes all digits the same width, so dollar amounts don't jiggle as values change. Without it, $1,111 and $8,888 would have different widths because proportional figures give different widths to 1 and 8.

**How to say it in an interview:** "Tabular figures make all digits equal width. Without them, numbers like $1,111 and $8,888 shift horizontally as values change because proportional figures vary by digit. The tnum OpenType feature fixes this — it's a small detail but prevents layout jitter in data-heavy UIs."

**Over alternative:** Using a monospace font for numbers. Works but looks out of place next to the proportional body text. Tabular figures keep the same typeface — you just switch the digit-width behavior.

### Decision 5: Reduced motion suppression at two levels

**What's happening:** The `useReducedMotion` hook reads `prefers-reduced-motion: reduce` from the user's OS settings. It controls two things: Recharts' `isAnimationActive` (disables the line-drawing animation) and the card's hover shadow transition (`motion-reduce:transition-none motion-reduce:hover:shadow-sm`). Users who set reduced motion preferences get static charts and no hover effects.

**How to say it in an interview:** "Reduced motion is respected at two levels. The hook disables Recharts' line animation via isAnimationActive, and Tailwind's motion-reduce: variant suppresses the card's hover shadow transition. Both static rendering and hover behavior are covered, so nothing moves unexpectedly for users who've opted out."

---

## 3. Code Walkthrough

### Imports (lines 1-16)

Recharts components come in as named imports — `LineChart`, `Line`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `ResponsiveContainer`. Then project internals: the shared type, chart config constants, the reduced-motion hook, currency formatters, and the TrendBadge component.

### RevenueTooltip (lines 22-47)

A custom tooltip component that Recharts calls with `{ active, payload, label }`. Early return if not active or no payload. Extracts the value from `payload[0]`, handles null with a "No data for this period" fallback. The outer div has `role="status"` and `aria-live="assertive"` — the browser's accessibility tree treats this as a live region, announcing content changes to screen readers.

The value display uses `fontFeatureSettings: '"tnum"'` for tabular figures. The conditional className swaps between `text-primary` (has value) and `text-muted-foreground` (null value).

### RevenueChart component (lines 49-118)

**Setup (lines 50-54):** Calls `useReducedMotion()` to get the motion preference. `computeTrend(data)` calculates the percentage change between the last two months (returns null if fewer than 2 data points). Extracts the last point's revenue and month for the summary line below the chart.

**figure element (line 57):** The card container. Uses `rounded-lg border shadow-sm` for the card look, with `transition-shadow hover:shadow-md` for hover. The `motion-reduce:` variants disable the transition and cap the hover shadow.

**figcaption (lines 58-63):** Flexbox row with the title on the left and `TrendBadge` on the right. The badge shows the month-over-month percentage change with a colored icon (green up, red down, gray flat).

**Chart container (lines 65-107):** A div with `aspect-video` (16:9 ratio) and `role="img"` with a descriptive `aria-label`. This gives screen readers a text alternative for the entire chart image. Inside, `ResponsiveContainer` handles resize with a debounce from `CHART_CONFIG`.

The `LineChart` component gets `accessibilityLayer` for keyboard navigation. `CartesianGrid` uses `strokeDasharray="3 3"` for dashed grid lines, styled with the theme's border color via `className="stroke-border"`.

Both axes hide their tick lines and axis lines (`tickLine={false}`, `axisLine={false}`) for a cleaner look. `YAxis` uses `formatAbbreviated` to show "$1.2M" or "$45K" instead of raw numbers, with a fixed width of 55px to prevent label overflow.

The `Line` element uses `type="monotone"` for smooth interpolation. Dots are styled with `fill-primary stroke-background` to create a "punched out" look against the card. Animation duration and easing come from shared constants, and `isAnimationActive` is tied to the reduced-motion hook.

**Summary line (lines 109-115):** Below the chart, a text line shows the latest value and month. Uses tabular figures. Handles the $0 case explicitly to avoid formatting edge cases.

---

## 4. Complexity and Trade-offs

**ResponsiveContainer debounce.** The `debounce` prop on `ResponsiveContainer` delays resize recalculations. This prevents the chart from re-rendering on every pixel of a window drag, but means there's a brief moment where the chart is slightly wrong-sized during resize. The `CHART_CONFIG.RESIZE_DEBOUNCE_MS` constant controls this — probably 100-200ms. Fine for a dashboard that isn't being resized constantly.

**Tooltip as live region.** `aria-live="assertive"` interrupts whatever the screen reader is currently saying. For rapid keyboard navigation through data points, this could be overwhelming — each point triggers an announcement. `aria-live="polite"` would queue announcements but might miss fast navigation. Assertive is the right call for data exploration where each value matters.

**No data gap handling.** If a month has `revenue: null`, the Line component will gap that point (Recharts handles null as a break in the line). The tooltip shows "No data for this period." But the trend calculation in `computeTrend` doesn't account for nulls — it only looks at the last two points' `.revenue` values. If the last month is null, the trend badge would show "0%" when "no data" might be more appropriate.

**Static formatter instances.** `formatCurrency` and `formatAbbreviated` use module-level `Intl.NumberFormat` instances. These are hardcoded to `en-US` and USD. Internationalization would require passing locale/currency as props and creating formatters dynamically (with memoization to avoid recreating them every render).

**How to say it in an interview:** "The main trade-offs are hardcoded locale formatting and aggressive aria-live announcements. The locale issue is acceptable for an MVP targeting US small businesses. The assertive live region could overwhelm during fast navigation but ensures every data point is announced — I'd consider debouncing announcements if user testing flagged it."

---

## 5. Patterns Worth Knowing

### Accessible Chart Pattern (aria-live + accessibilityLayer)

Charts are historically one of the worst experiences for screen reader users — just an image with no way to explore the data. This component layers three accessibility approaches: (1) `role="img"` with `aria-label` on the chart container for a text summary, (2) `accessibilityLayer` on the LineChart for keyboard navigation, (3) `aria-live="assertive"` on the tooltip for real-time announcements. Each layer serves a different interaction mode.

**Interview-ready:** "Three accessibility layers: a text summary via aria-label for users who just want the gist, keyboard navigation via accessibilityLayer for data exploration, and aria-live on the tooltip for real-time announcements. Each serves a different user need."

### Semantic HTML for Data Visualization (figure/figcaption)

`<figure>` isn't just for images. The HTML spec says it's for "self-contained content, potentially with a caption, that is typically referenced as a single unit from the main document." A chart with a title fits that definition exactly. Screen readers announce it as a figure, and the `<figcaption>` provides the label.

**Interview-ready:** "figure/figcaption is semantically correct for a captioned chart. Screen readers expose the relationship between the caption and the content, which a div-with-h3 approach doesn't."

### Composition over Configuration (TrendBadge)

The chart doesn't compute its own trend display. It calls `computeTrend(data)` for the number and passes it to `TrendBadge`, which handles the icon, color, and formatting. The chart doesn't know or care how the badge looks. If you wanted a different trend visualization (sparkline, arrow, color dot), you'd swap the badge component — nothing in the chart changes.

**Interview-ready:** "TrendBadge is a composed component — the chart computes the trend value and delegates display to the badge. Swapping the badge implementation doesn't require touching the chart. It's composition over configuration."

### Reduced Motion as a First-Class Concern

Most devs add reduced motion as an afterthought — a `@media` query that removes transitions. This component treats it as a prop flowing through the component tree. The hook reads the media query, the chart component uses it to disable animation, and Tailwind's `motion-reduce:` variants handle CSS transitions. Two mechanisms, one preference source.

**Interview-ready:** "Reduced motion flows through two channels: a React hook that controls Recharts' JavaScript animations, and Tailwind's motion-reduce: variant for CSS transitions. Both read from the same OS-level preference but operate at different layers."

---

## 6. Potential Interview Questions

### Q1: "Why use aria-live='assertive' instead of 'polite' on the tooltip?"

**Context if you need it:** Tests your understanding of live region politeness levels and their UX trade-offs.

**Strong answer:** "Assertive interrupts the current screen reader output. For a chart tooltip, this is appropriate because the user actively chose to navigate to that data point — they want the value now, not after the current announcement finishes. Polite would queue the announcement, which could mean the user moves to the next point before hearing about the current one. The trade-off is that rapid navigation could produce a burst of interruptions — worth monitoring in user testing."

**Red flag:** "Assertive is always better because it's faster." — Shows no understanding of when polite is appropriate (background notifications, non-critical updates).

### Q2: "What does fontFeatureSettings: 'tnum' do and why does it matter here?"

**Context if you need it:** The interviewer wants to know if you understand typography at a technical level.

**Strong answer:** "tnum enables tabular figures — all digits get the same advance width. In a proportional font, the digit 1 is narrower than 8. When a tooltip shows $1,234 then $8,765, the total width changes and the text shifts. Tabular figures prevent this jitter by making every digit occupy the same horizontal space. It's an OpenType feature supported by most modern system fonts."

**Red flag:** "It makes numbers look better." — Too vague. The specific benefit is equal-width digits preventing layout shift.

### Q3: "How does accessibilityLayer work in Recharts 3.x?"

**Context if you need it:** Tests whether you understand the library feature or just copied a prop.

**Strong answer:** "accessibilityLayer adds a transparent overlay to the chart SVG that traps keyboard focus. When a user Tabs into the chart, they can use arrow keys to move between data points. Each movement updates the active dot and triggers the tooltip — which, combined with the aria-live region, means screen readers announce each value. It's built on top of SVG focusable elements with appropriate ARIA roles."

**Red flag:** "I just added the prop because the docs said to." — Suggests no understanding of the mechanism.

### Q4: "Why wrap the chart in role='img' when it already has accessibilityLayer?"

**Context if you need it:** Probes whether you understand the layered accessibility approach.

**Strong answer:** "They serve different user flows. role='img' with aria-label gives a text summary for users who just want the headline — 'Line chart showing monthly revenue trend, most recent January at $45,000.' They can skip the chart entirely. accessibilityLayer is for users who want to explore individual data points. Not everyone who uses a screen reader wants to keyboard through 12 data points — some just need the summary."

**Red flag:** "They do the same thing, I should probably remove one." — Misses that they serve different navigation strategies.

---

## 7. Data Structures

### RevenueTrendPoint (from shared/types)

**What it is:** An object with `month` (string, like "Jan" or "2024-01") and `revenue` (number or null). Each point represents one month on the chart.

**Where it appears:** The `data` prop, passed directly to Recharts' `LineChart` as its data source.

**Why this shape:** Recharts expects an array of objects with consistent keys. `month` maps to XAxis's `dataKey`, `revenue` maps to Line's `dataKey`. Null revenue creates a gap in the line — Recharts handles this natively.

**How to say it in an interview:** "Each RevenueTrendPoint has a month label and a nullable revenue value. Null creates a gap in the line — Recharts' native null handling. The shape maps directly to Recharts' dataKey system."

### CHART_CONFIG (from shared/constants)

**What it is:** A constants object shared between frontend and backend. Contains `RESIZE_DEBOUNCE_MS`, `ANIMATION_DURATION_MS`, `ANIMATION_EASING`, `LAZY_THRESHOLD`, and `SKELETON_FADE_MS`. Extracted to shared so chart behavior is consistent and configurable from one place.

**Where it appears:** `ResponsiveContainer`'s debounce, `Line`'s animation props.

**Why shared:** If the API ever needed to know chart timing (e.g., for SSR optimization or performance budgets), it could import the same constants. More practically, it prevents magic numbers scattered across chart components.

---

## 8. Impress the Interviewer

### The Three-Layer Accessibility Model

**What's happening:** This chart has three distinct accessibility mechanisms: (1) a text summary via `role="img"` + `aria-label` on the chart wrapper — for users who want the headline without exploring, (2) keyboard navigation via `accessibilityLayer` — for users who want to arrow through data points, (3) live announcements via `aria-live="assertive"` on the tooltip — for real-time feedback during navigation. Each layer serves a different user intent.

**Why it matters:** Most charting implementations stop at `alt` text on an image. This approach matches WCAG 2.1 Level AA and demonstrates that you think about accessibility as user experience, not checkbox compliance.

**How to bring it up:** "The chart has three accessibility layers targeting different interaction modes: a text summary for users who want the headline, keyboard navigation for data exploration, and live tooltip announcements for real-time feedback. Most chart libraries give you the first one — I added the other two."

### Tabular Figures Are a Senior-Level Typography Detail

**What's happening:** `fontFeatureSettings: '"tnum"'` enables equal-width digits. When the tooltip shows "$12,345" then "$98,765", the text width stays constant. Without it, the tooltip would jiggle as you hover between data points because proportional digits (especially 1 vs. 8) have different widths.

**Why it matters:** This is the kind of detail that separates "it works" from "it's polished." Interviewers at design-conscious companies will notice. It shows you understand OpenType features and pay attention to micro-interactions.

**How to bring it up:** "I enabled tabular figures on all numeric displays. It's an OpenType feature that gives every digit the same width, preventing the tooltip from shifting as values change. Small detail, but it eliminates visual jitter during chart interaction."

### Motion Reduction Flows Through Two Separate Systems

**What's happening:** The `useReducedMotion` hook reads the OS preference and returns a boolean. Recharts' `isAnimationActive={!reducedMotion}` disables JS-driven animations. Tailwind's `motion-reduce:transition-none` and `motion-reduce:hover:shadow-sm` disable CSS transitions. Two independent systems, one user preference. If you only handled one, the chart would still animate (or the card would still transition) for users who asked for no motion.

**Why it matters:** Reduced motion is a legal accessibility requirement in many contexts (WCAG 2.1, Section 508). But beyond compliance, it shows architectural thinking — the preference needs to flow through both the JS runtime and the CSS layer, and you handled both.

**How to bring it up:** "Reduced motion is handled at two layers: a React hook for Recharts' JavaScript animations and Tailwind's motion-reduce variant for CSS transitions. Both read from prefers-reduced-motion, but they operate independently — you need both to fully respect the preference."
