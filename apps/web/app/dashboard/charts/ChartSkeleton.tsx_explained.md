# ChartSkeleton.tsx — Explained

## 1. Elevator Pitch

A loading placeholder component that mimics the actual chart shapes — a polyline for line charts, rectangles for bar charts — so the layout doesn't shift when real data arrives. It uses a custom 1500ms pulse animation, respects the user's reduced-motion preference via CSS, and announces its loading state to screen readers. This is the component you see for the fraction of a second between page load and data fetch completion.

## 2. Why This Approach

**Shape-matched skeletons over generic gray boxes.** Most skeleton loaders are featureless rectangles. That works for text, but a chart area is distinctive — users recognize "that wavy line is where my revenue chart goes." By drawing an SVG polyline (line variant) or a set of rects (bar variant), the skeleton communicates *what's loading*, not just *that something is loading*. This reduces perceived latency because the user's brain starts processing the layout before real data appears.

**Custom animation timing (1500ms) instead of Tailwind's default `animate-pulse`.** Tailwind's built-in pulse is 2 seconds with a cubic-bezier ease-in-out. That feels sluggish for a data-loading state. The project defines a 1500ms `animate-skeleton-pulse` keyframe (configured in Tailwind config, sourced from `CHART_CONFIG.SKELETON_PULSE_MS`). Faster pulse = "we're working on it." Slower pulse = "something might be wrong."

**`motion-reduce:animate-none` via CSS, not JS.** The `ChartSkeleton` doesn't import the `useReducedMotion` hook. It doesn't need to — Tailwind's `motion-reduce:` variant maps directly to `@media (prefers-reduced-motion: reduce)`. For a simple pulse animation, CSS-only handling is lighter weight than a React hook. The actual chart components (RevenueChart, ExpenseChart) use the JS hook because they need to pass a boolean prop to Recharts.

## 3. Code Walkthrough

**Lines 5-8: `ChartSkeletonProps`.** Two optional props: `className` for layout overrides and `variant` to switch between `'line'` and `'bar'` shapes. Defaults to `'line'`.

**Lines 12-18: Outer wrapper.** The `div` gets `role="status"` and `aria-label="Loading chart"`. `role="status"` tells assistive technology this is a live region whose content is loading. Screen readers will announce "Loading chart" when this component appears.

*What's happening:* ARIA semantics communicate loading state to non-visual users.
*How to say it:* "We use role='status' because it's the ARIA landmark for polite live regions — the screen reader announces the content without interrupting the user's current action."

**Line 21: Title placeholder.** A `div` with fixed width (`w-32`) and height (`h-6`) that mimics the chart title. It pulses with the skeleton animation.

**Lines 24-48: Shape-matched SVG.** The `aspect-video` wrapper gives a 16:9 aspect ratio — matching the actual chart's `aspect-video` container. Inside, an SVG with `viewBox="0 0 320 180"` draws:

- **Line variant (lines 31-38):** A `polyline` with 7 points that traces an upward-trending line. The `points` values are hand-picked to suggest "data going up" without being misleading. Stroke classes use `stroke-muted` to stay within the skeleton color palette.
- **Bar variant (lines 40-46):** Five `rect` elements with varying heights. They're spaced to suggest category bars with realistic proportions. Each has `rx="4"` for rounded top corners matching the real bar chart's `radius={[4, 4, 0, 0]}`.

The SVG itself has `aria-hidden="true"` because it's decorative — the loading semantics are handled by the parent's `role="status"`.

**Line 52: Value callout placeholder.** Below the chart area, a thin bar mimics the "Total: $X" line that the real chart renders.

**Line 54: Screen-reader-only text.** `<span className="sr-only">Loading chart...</span>` provides a fallback text alternative. Belt and suspenders with the `aria-label` on the parent.

## 4. Complexity & Trade-offs

Rendering complexity is O(1) — it's static SVG with no data dependencies. No state, no effects, no subscriptions.

**Trade-off: Hardcoded SVG points vs. generated shapes.** The polyline points and rect positions are hand-written. If the real chart changed to show 12 bars instead of 5, the skeleton wouldn't match. But generating skeleton shapes dynamically from data count would defeat the purpose — you don't have the data yet when the skeleton renders. Hardcoded shapes that approximate the common case are the pragmatic choice.

**Trade-off: CSS-only motion reduction.** If you needed to conditionally swap between a pulsing skeleton and a static one with different markup, you'd need the JS hook. Here, `animate-none` is sufficient — the skeleton is still visible, just not pulsing. That's a fine degradation.

## 5. Patterns Worth Knowing

- **Shape-matched skeleton loading.** A step up from generic gray boxes. Used by Stripe Dashboard, Linear, and other data-heavy apps. In an interview, call it "content-aware skeleton UI" and explain that it reduces perceived load time by priming the user's mental model.
- **SVG as a layout tool.** The `viewBox` attribute makes the SVG scale to any container size without media queries. The `aspect-video` wrapper constrains the aspect ratio. This combo gives you a responsive skeleton with zero JavaScript.
- **ARIA `role="status"`.** The polite live region role. It doesn't interrupt — it waits for the screen reader to finish its current announcement, then reads the new content. Compare with `role="alert"` which interrupts immediately (used for errors, not loading states).
- **`motion-reduce:` Tailwind variant.** Maps to `@media (prefers-reduced-motion: reduce)`. Cheaper than a React hook when all you need is to toggle a CSS property.

## 6. Interview Questions

**Q: Why use `role="status"` instead of `role="alert"` for a loading skeleton?**
A: `role="status"` is a polite live region — the screen reader waits for a natural pause before announcing the content. `role="alert"` is assertive — it interrupts whatever the screen reader is currently saying. A loading skeleton isn't urgent enough to interrupt. You'd use `role="alert"` for an error message or a time-sensitive warning.

**Q: Why `aspect-video` on the skeleton container?**
A: The real chart components also use `aspect-video` (16:9). If the skeleton had a different aspect ratio, the page would shift when the real chart replaced it. Matching the aspect ratio eliminates layout shift, which matters for Core Web Vitals (CLS metric) and for not annoying the user.

**Q: Why is the SVG marked `aria-hidden="true"`?**
A: The shapes inside the SVG are decorative — they don't convey meaningful data. The loading semantics come from `role="status"` and `aria-label` on the parent `div`. If the SVG were announced, a screen reader would try to describe "polyline" or "rect" elements, which is meaningless noise for a loading state.

**Q: How would you test this component?**
A: Render it with each variant and snapshot the output. Assert that `role="status"` is present. Assert that `aria-hidden="true"` is on the SVG. Check that the `motion-reduce:animate-none` class exists. For the variant prop, assert that `'line'` produces a `polyline` element and `'bar'` produces `rect` elements.

## 7. Data Structures

No dynamic data structures. The component is entirely prop-driven:

- **`ChartSkeletonProps`:** `{ className?: string; variant?: 'line' | 'bar' }`. The `variant` discriminant controls which SVG children render. This is a simple tagged union at the prop level — you could think of it as the strategy pattern, where the strategy is "which shapes to draw."

## 8. Impress the Interviewer

- **"Shape-matched skeletons reduce perceived latency more than generic placeholders."** There's UX research (Nielsen Norman Group, Google Web Fundamentals) showing that content-aware loading states feel 15-20% faster than generic spinners or blank boxes. The brain starts processing layout immediately, so when real data arrives, it feels like an update rather than a fresh render.

- **"We handle accessibility at two levels — ARIA semantics for screen readers, and motion reduction for vestibular disorders."** The `role="status"` handles the non-visual case. The `motion-reduce:animate-none` handles the visual-but-motion-sensitive case. These are different user needs served by different mechanisms. Interviewers notice when you distinguish between disability categories rather than treating "accessibility" as a single checkbox.
