# ExpenseChart.tsx — Explained

## 1. Elevator Pitch

The bar chart component that visualizes expense breakdown by category — think Marketing, Payroll, Rent — on the dashboard. It's the counterpart to `RevenueChart.tsx` (which renders a line chart for time-series revenue data). Built on Recharts with a custom accessible tooltip, centralized animation config, reduced-motion support, and a total-expenses callout beneath the chart. This is the component a small business owner glances at to see where their money goes.

## 2. Why This Approach

**Recharts over D3 or Chart.js.** Recharts is a React-native charting library — every chart element is a React component, so it composes naturally with JSX, props, and the component lifecycle. D3 gives you more control but fights React's rendering model. Chart.js uses imperative canvas drawing, which makes accessible tooltips harder. Since this project already uses Recharts for `RevenueChart`, using the same library for `ExpenseChart` keeps the dependency surface flat and the mental model consistent.

**Custom tooltip component instead of Recharts' default.** The built-in Recharts tooltip is a plain div with no ARIA attributes. `ExpenseTooltip` adds `role="status"` and `aria-live="assertive"` so screen readers announce the hovered value. It also uses `fontFeatureSettings: '"tnum"'` for tabular numbers — digits that all have the same width, preventing the tooltip from jiggling as values change.

**`CHART_CONFIG` from shared constants.** Animation duration, easing, and resize debounce are defined once in `packages/shared/src/constants/index.ts`. Both `RevenueChart` and `ExpenseChart` pull from the same config, so if the design team changes the animation timing, it's a one-line edit. This avoids the classic bug where one chart animates at 500ms and another at 300ms because someone hardcoded a number.

**`useReducedMotion` for conditional animation.** Recharts accepts `isAnimationActive` as a boolean prop on `Bar`. When the user has "reduce motion" enabled at the OS level, the hook returns `true`, and we pass `false` to `isAnimationActive`. Bars appear instantly instead of growing upward. Compare this with `ChartSkeleton`, which handles the same preference via CSS-only (`motion-reduce:animate-none`). The difference: Recharts needs a JS boolean; Tailwind CSS can handle it declaratively.

**`<figure>` + `<figcaption>` semantic wrapper.** The chart is wrapped in `<figure>` with the title in `<figcaption>`. This is the correct HTML semantics for a self-contained illustration with a caption. Screen readers announce the relationship between the caption and the content. Many chart implementations use `<div>` + `<h3>`, which works visually but loses the semantic grouping.

## 3. Code Walkthrough

**Lines 1-15: Imports.** Recharts components, the shared type `ExpenseBreakdownItem`, centralized `CHART_CONFIG`, the reduced-motion hook, and local formatters. The import order follows the project convention: third-party, then shared packages, then local.

**Lines 21-46: `ExpenseTooltip`.** A custom tooltip renderer that Recharts calls when the user hovers a bar. The function signature matches Recharts' tooltip callback shape — `active`, `payload`, and `label` are injected by the library.

- Line 26: Early return if the tooltip isn't active or has no data. Recharts sometimes calls the tooltip with `active: false` during transitions.
- Line 29: Handles `null` values explicitly — if a category has no data, the tooltip says "No data for this category" instead of showing "$0" (which would imply the value is known to be zero).
- Lines 33-34: `role="status"` and `aria-live="assertive"` make the tooltip announce itself to screen readers. `assertive` is appropriate here because the user explicitly interacted (hovered/focused) to trigger the tooltip — it's not an unsolicited interruption.
- Line 41: `fontFeatureSettings: '"tnum"'` activates tabular numbers. Without this, the digit "1" is narrower than "0" in most fonts, causing the tooltip to resize as you hover across bars.

*What's happening:* Custom tooltip that handles null data and announces to screen readers.
*How to say it:* "We replace Recharts' default tooltip with a custom component that adds ARIA live-region semantics and handles null values as a distinct state from zero."

**Lines 48-51: Component setup.** `useReducedMotion()` gets the motion preference. `totalExpenses` is computed via `reduce` — used in the callout at the bottom. `topCategory` grabs the first item (the data comes pre-sorted from the API).

**Lines 53-59: `<figure>` wrapper and title.** The outer `figure` has hover shadow transitions with `motion-reduce:transition-none` — if the user doesn't want motion, they don't get the shadow transition either. The `lineHeight: '1.4'` on the `h3` prevents the title from feeling cramped at `text-xl`.

**Lines 61-65: Chart container with ARIA.** The `aspect-video` div maintains 16:9 aspect ratio (matching `ChartSkeleton`'s layout to prevent CLS). `role="img"` tells screen readers to treat the whole chart as a single image. The `aria-label` includes the top category and its value — so a screen reader user hears "Bar chart showing expense breakdown by category, highest is Marketing at $4,200" without needing to interact with individual bars.

**Lines 66-99: Recharts composition.** This is the declarative chart definition:

- `ResponsiveContainer` with `debounce={CHART_CONFIG.RESIZE_DEBOUNCE_MS}` — prevents layout thrashing during window resize.
- `CartesianGrid` with dashed lines (`strokeDasharray="3 3"`), styled with `stroke-border` to match the app's design tokens.
- `XAxis` on `category` field, `YAxis` with `formatAbbreviated` for "$1.2K" style ticks. Both axes hide tick lines and axis lines for a clean look.
- `Tooltip` wired to the custom `ExpenseTooltip`.
- `Bar` with `radius={[4, 4, 0, 0]}` — rounded top corners only, giving a modern bar shape. Animation props come from `CHART_CONFIG`, and `isAnimationActive` respects reduced motion.

**Lines 102-108: Total callout.** Below the chart, a text line shows the aggregate: "$12,450 total across 5 categories." The `fontFeatureSettings: '"tnum"'` keeps digits aligned. If total is zero, it shows "$0 total" instead of computing "across 0 categories."

## 4. Complexity & Trade-offs

**Render complexity:** The component itself is O(n) where n is the number of expense categories — `data.reduce` iterates once, and Recharts renders one `<rect>` per category. With the 5-10 categories this dashboard handles, it's effectively constant time.

**Trade-off: `aria-live="assertive"` on the tooltip.** Assertive interrupts the screen reader's current speech. For a tooltip that only appears on deliberate interaction, this is acceptable — the user asked for this information. But if the tooltip were triggered by auto-scrolling or timer-based updates, assertive would be annoying. A polite tooltip (`aria-live="polite"`) would work too, but might get lost if the user is navigating quickly.

**Trade-off: Pre-sorted data assumption.** Line 51 (`const topCategory = data[0]`) assumes the API returns categories sorted by value descending. If the sort order changes, the aria-label would report the wrong "highest" category. The alternative is sorting client-side (like `computeExpenseTrend` does in formatters.ts), but that duplicates work the API already did. The implicit contract is documented by the `ExpenseBreakdownItem[]` type and the API query.

**Trade-off: Recharts bundle size.** Recharts adds ~45KB gzipped to the bundle. For a dashboard that's primarily charts, that's reasonable. If we only needed one simple bar chart, a hand-rolled SVG with `<rect>` elements (like `ChartSkeleton` does) would save the dependency. But once you need interactive tooltips, responsive resizing, animation, and accessibility layers, the library pays for itself.

## 5. Patterns Worth Knowing

- **Centralized chart configuration.** `CHART_CONFIG` in a shared package is a variant of the "configuration object" pattern. It keeps visual consistency across charts and makes design-system changes a single-point edit. In an interview, compare it to a design token system.

- **Accessible tooltip via custom Recharts content.** Recharts' `<Tooltip content={<CustomComponent />}` prop lets you replace the tooltip entirely. The custom component receives the same data Recharts would use internally. This is the render prop pattern — Recharts handles the *when* (hover, focus), you handle the *what* (markup, ARIA attributes).

- **`<figure>` / `<figcaption>` for chart semantics.** HTML5 semantic elements that group an illustration with its caption. Many developers reach for `<div>` + `<h3>` out of habit. Using `<figure>` gives screen readers a structural hint that the caption describes the content — which matters when a page has multiple charts.

- **Tabular numbers via `fontFeatureSettings`.** The `"tnum"` OpenType feature makes all digits the same width. Without it, a tooltip displaying "$1,111" is narrower than one displaying "$8,888" because the glyph for "1" is narrower in proportional fonts. With `tnum`, both strings occupy the same width. This prevents layout jitter in numbers that update frequently.

- **Motion-reduce at two levels.** CSS (`motion-reduce:transition-none` on the figure, `motion-reduce:hover:shadow-sm` to prevent the shadow pop) handles the wrapper transitions. JS (`isAnimationActive={!reducedMotion}`) handles the Recharts bar grow-in animation. Two different mechanisms because Tailwind utilities can't reach into Recharts' internal animation engine.

## 6. Interview Questions

**Q: How does this component handle accessibility for screen reader users?**
A: Three layers. First, the chart container has `role="img"` with a descriptive `aria-label` that includes the top category and its value — so screen reader users get the key insight without interacting. Second, the custom tooltip has `role="status"` and `aria-live="assertive"` so hovering/focusing a bar announces its value. Third, Recharts' `accessibilityLayer` prop adds keyboard navigation to the chart elements. This covers browse mode, interaction mode, and keyboard-only users.

**Q: Why compute `totalExpenses` in the component instead of passing it as a prop?**
A: The data is already there — `data.reduce()` over 5-10 items is negligible. Adding a `totalExpenses` prop would mean the parent has to compute it too (or the API has to return it separately), creating a synchronization risk. If someone updates the data but forgets to update the total prop, the callout is wrong. Deriving it from the source of truth (the data array) eliminates that bug category.

**Q: What's the relationship between this component and `RevenueChart`?**
A: They share the same architecture: custom accessible tooltip, `CHART_CONFIG` constants, `useReducedMotion` hook, `<figure>` semantics, `aspect-video` container, `formatAbbreviated` for Y-axis ticks. The differences are the chart type (Bar vs Line), the data shape (`ExpenseBreakdownItem` vs `RevenueTrendPoint`), and the callout (total across categories vs latest month's value). If a third chart type were added, you'd extract a shared `ChartWrapper` component for the figure/caption/callout structure — but with two charts, that abstraction would be premature.

**Q: Why `aria-live="assertive"` on the tooltip instead of `"polite"`?**
A: The tooltip appears in response to direct user interaction — hovering or focusing a bar. The user is actively asking "what's this bar's value?" Assertive means the answer interrupts immediately, which matches the user's intent. Polite would queue the announcement after the screen reader finishes its current speech, by which time the user may have moved on to another bar. For tooltips triggered by user action, assertive is standard practice.

**Q: How does the 16:9 aspect ratio prevent layout shift?**
A: Both `ChartSkeleton` and `ExpenseChart` use `className="aspect-video"` on their chart containers. When the skeleton is replaced by the real chart, the container keeps the same dimensions. Without a fixed aspect ratio, the chart height would depend on Recharts' internal calculations, which might differ from the skeleton's height, causing visible content shift (bad CLS score).

## 7. Data Structures

**`ExpenseBreakdownItem`** (from `shared/types`): `{ category: string; total: number }`. Each item is one bar in the chart. The array is expected to be sorted by `total` descending from the API.

**`CHART_CONFIG`** (from `shared/constants`):
```ts
{
  ANIMATION_DURATION_MS: 500,
  ANIMATION_EASING: 'ease-in-out',
  SKELETON_PULSE_MS: 1500,
  RESIZE_DEBOUNCE_MS: 200,
  LAZY_THRESHOLD: 0.1,
  SKELETON_FADE_MS: 150,
}
```
Shared across all chart components. The `as const` assertion makes every value a literal type, preventing accidental reassignment.

**Recharts `payload`:** The tooltip receives `payload: Array<{ value: number | null }>` from Recharts. Each entry corresponds to a data key on the chart (we have one: `"total"`). The `value` can be `null` if the data point is missing — our tooltip handles this with an explicit "No data for this category" message.

## 8. Impress the Interviewer

- **"We treat null and zero as semantically different states."** In the tooltip, `null` means "no data exists for this category" and renders "No data for this category." Zero means "we have data, and the value is $0" and renders "$0." This distinction matters for business users — "no data" means the CSV didn't include that category; "$0" means the category exists but had no spend. Collapsing them would mislead the user.

- **"The component derives state instead of accepting it as props, and that's a deliberate correctness choice."** `totalExpenses` is computed from `data` on every render via `reduce`. The React docs call this "derived state" and explicitly recommend it over syncing a separate prop. It's O(n) on 5-10 items — the cost is invisible, and the benefit is that the total is always mathematically consistent with the bars on screen.

- **"We use `fontFeatureSettings: 'tnum'` instead of a monospace font because tabular numbers preserve the typeface's visual design."** Monospace fonts fix the width problem but change the entire aesthetic. Tabular numbers are an OpenType feature that only affects digit width, keeping the font family's character shapes and spacing. Most modern variable fonts (Inter, which this project uses) support `tnum`. It's a small detail, but interviewers in design-heavy companies notice it.
