# AiSummarySkeleton.tsx — Interview Documentation

## 1. 30-Second Elevator Pitch

`AiSummarySkeleton` is a loading placeholder that renders while an AI-generated text summary is being fetched. It mimics the visual structure of the real summary card — same border, same padding, same card background — but replaces the actual text with animated gray bars.

The bars are four lines at widths of 100%, 90%, 95%, and 60%. That final short line is intentional. Paragraphs in prose almost never end flush to the right margin, so the short last line makes the skeleton read as a real paragraph rather than a grid of rectangles.

Accessibility is handled without ceremony: a `role="status"` on the container plus a visually-hidden `<span>` with `sr-only` gives screen readers something to announce. Users who have requested reduced motion get the static version — no pulse animation.

**How to say it in an interview**: "It's a skeleton screen component that preserves layout continuity during async loading. The card dimensions and border treatment match the live AI summary card so the page doesn't jump when content loads."

---

## 2. Why This Approach

**Why skeleton screens instead of a spinner?**

Spinners communicate "something is happening" but give the user no sense of what's coming. A skeleton screen tells the user the shape of the content — where the heading will be, roughly how long the text is. That's useful information. Research on perceived performance consistently shows users rate skeleton screens as faster, even when load times are identical.

**Why the specific line widths (100%, 90%, 95%, 60%)?**

A set of full-width bars looks like a loading bar, not a paragraph. The variation — including the 95% line that's slightly wider than the 90% line — breaks the mechanical rhythm. The 60% final line mimics how a short last sentence terminates in the middle of a line. The widths are hardcoded as a `const` tuple at module scope so they're not recomputed per render.

**Why `as const`?**

`LINE_WIDTHS` is an array of string literals. Without `as const`, TypeScript widens the type to `string[]`. With it, TypeScript knows the exact strings, which matters if you ever need to constrain which Tailwind classes are permitted.

**Why `motion-reduce:animate-none`?**

The `prefers-reduced-motion` media query is a user-level accessibility setting. People with vestibular disorders can find pulsing animations disorienting. Stripping the animation in reduced-motion contexts is the minimum responsible behavior — and Tailwind 4's `motion-reduce:` variant makes it a one-liner.

---

## 3. Code Walkthrough

```tsx
const LINE_WIDTHS = ['w-full', 'w-[90%]', 'w-[95%]', 'w-[60%]'] as const;
```

Module-level constant. Four Tailwind width classes stored as a typed tuple. Defining this outside the component avoids recreating the array on every render, though for a tiny static array the difference is negligible — it's mostly a clarity choice.

```tsx
export function AiSummarySkeleton({ className }: { className?: string }) {
```

Single optional prop. The `className` passthrough lets the parent override or extend styles without modifying this file — the standard "escape hatch" pattern for UI primitives.

```tsx
<div
  className={cn(
    'rounded-lg border border-border border-l-4 border-l-primary bg-card p-4 shadow-md md:p-6',
    className,
  )}
  role="status"
  aria-label="Loading AI summary"
>
```

`cn` merges base classes with any caller-supplied overrides, resolving conflicts so the last value wins. `role="status"` is the correct ARIA role for live region content that appears without user interaction. `aria-label` gives the role a human-readable name.

The border classes deserve attention: `border border-border` sets the default card border, then `border-l-4 border-l-primary` overrides the left side specifically. This is the same left-accent treatment the live AI summary card uses — keeping the skeleton visually consistent with its resolved state.

```tsx
<div className="mb-4 h-5 w-36 rounded bg-muted animate-skeleton-pulse motion-reduce:animate-none" />
```

The heading placeholder. Fixed height (`h-5`) and width (`w-36`) approximate a short heading. `animate-skeleton-pulse` is a custom Tailwind animation — likely a keyframe that cycles opacity or background color to create a shimmer effect.

```tsx
{LINE_WIDTHS.map((width, i) => (
  <div
    key={i}
    data-testid={`skeleton-line-${i}`}
    className={cn(
      'h-4 rounded bg-muted animate-skeleton-pulse motion-reduce:animate-none',
      width,
    )}
  />
))}
```

The text body placeholder. Each line gets a `data-testid` with its index, which makes targeting specific lines in tests straightforward without relying on DOM position. Using array index as `key` is fine here — the array is static and never reordered.

```tsx
<span className="sr-only">Loading AI summary...</span>
```

Screen reader fallback. `sr-only` hides this visually via absolute positioning and clipping. The `role="status"` container will announce its label, but this `<span>` gives assistive technologies the same text as a readable string within the live region.

---

## 4. Complexity and Trade-offs

**Time complexity**: O(n) where n is the number of lines (currently 4). Not worth analyzing further — it's a render function returning static JSX.

**The `key={i}` choice**: Using index as key is typically discouraged when list items can reorder. Here, `LINE_WIDTHS` is a module-level constant that never changes, so index keys are safe. If the widths were ever made dynamic or user-configurable, this would need revisiting.

**Hardcoded widths**: The line widths are opinions baked into code. That's fine for a skeleton — there's no data to derive them from. But if the AI summary card ever gets a significantly different layout (say, a bulleted list instead of prose), you'd need to revisit whether four paragraph lines still make sense. The fix is cheap when it comes up.

**No loading duration management**: The component doesn't know how long it's been showing. If the AI summary takes 30 seconds to load, the skeleton pulses indefinitely. The parent (`DashboardShell`) owns the loading state and decides when to swap in the real component — `AiSummarySkeleton` has no opinion about timeouts or error states.

**CSS animation vs. JS animation**: Using a CSS keyframe animation (`animate-skeleton-pulse`) keeps the pulsing off the main thread. JavaScript-driven animations that touch layout properties can cause jank. This is the right call.

---

## 5. Patterns and Concepts Worth Knowing

**Skeleton screens**

A UI pattern where you render the structural "ghost" of content before the content loads. The goal is to reduce perceived latency. The shape matters — a skeleton that looks nothing like the final content is more disorienting than helpful.

**What's happening**: The component renders gray bars in roughly the same positions the real text will occupy.
**How to say it in an interview**: "Skeleton screens preserve layout continuity and reduce cumulative layout shift. They signal to the user what type of content is coming, which reduces cognitive load compared to a generic spinner."

**`cn` utility (clsx + tailwind-merge)**

`cn` is typically `clsx` plus `tailwind-merge` under one function. `clsx` handles conditional class joining; `tailwind-merge` resolves Tailwind conflicts (e.g., if the caller passes `p-8`, it should win over the default `p-4`, not stack with it).

**What's happening**: `cn(baseClasses, className)` produces a single clean class string with conflicts resolved.
**How to say it in an interview**: "We use `tailwind-merge` to ensure caller-supplied classes can cleanly override defaults without specificity fights or duplicate properties."

**`role="status"` and ARIA live regions**

`role="status"` marks a container as a live region with `aria-live="polite"`. Screen readers will announce changes to this region without interrupting whatever the user is currently hearing.

**What's happening**: When this component mounts, screen readers announce "Loading AI summary" based on `aria-label`. When it unmounts and the real content appears, screen readers announce that content.
**How to say it in an interview**: "We use `role='status'` to create an ARIA live region so screen reader users get notified about loading state changes without explicit user interaction."

**`prefers-reduced-motion`**

A CSS media query that reflects a user's OS-level accessibility preference to minimize motion. Tailwind 4's `motion-reduce:` variant applies styles only when this preference is active.

**What's happening**: `motion-reduce:animate-none` strips the pulse animation for users who've opted out of motion.
**How to say it in an interview**: "Respecting `prefers-reduced-motion` is an accessibility baseline. Vestibular disorders make animation physically uncomfortable for some users, so we disable it when they've indicated that preference at the OS level."

---

## 6. Potential Interview Questions

**Q: Why use a skeleton screen instead of a loading spinner?**

Spinners tell you *that* something is loading. Skeletons tell you *what's* loading. The layout preservation also prevents cumulative layout shift (CLS), which is a Core Web Vitals metric. If you render a spinner in the same space the content will occupy, the page still doesn't shift — but if you render nothing, content appearing later causes a visible jump. Skeletons solve both perceived performance and CLS simultaneously.

**Q: When is using array index as `key` acceptable?**

When the list is static — same items, same order, every render. React uses `key` to reconcile which DOM nodes correspond to which list items between renders. If items can reorder or be inserted/removed from the middle, index keys cause React to update the wrong nodes. Here, `LINE_WIDTHS` is a module-level constant that never changes, so index keys are fine.

**Q: What does `as const` do to the `LINE_WIDTHS` array?**

Without it, TypeScript infers the type as `string[]`. With `as const`, it infers the more specific `readonly ['w-full', 'w-[90%]', 'w-[95%]', 'w-[60%]']`. That means each element has a literal type rather than just `string`. It also makes the array readonly at the type level, so TypeScript will catch accidental mutation attempts.

**Q: Why put `LINE_WIDTHS` outside the component rather than inside?**

It's a constant — it has no dependency on props or state, so it doesn't need to live inside the render function. Defining it at module scope makes that explicit and avoids allocating the array on every render. In practice the performance difference is negligible for a four-element array, but the clarity benefit is real.

**Q: How does `cn` handle conflicting Tailwind classes?**

`cn` combines `clsx` (for conditional class joining) with `tailwind-merge` (for conflict resolution). If both the base classes and the `className` prop contain a padding utility — say `p-4` and `p-8` — `tailwind-merge` keeps only the last one, just like CSS specificity would with equal-specificity selectors. Without it, both classes would appear in the string and whichever browser parses last in the stylesheet wins, which is unpredictable.

**Q: Why does the heading placeholder use a fixed `w-36` instead of a percentage width?**

Headings are typically short and fixed-length in UI. A percentage width would scale with the container, but a skeleton heading that fills 100% of a wide screen looks wrong — real headings don't do that. `w-36` (9rem / 144px) approximates a short label like "AI Summary" regardless of container width.

---

## 7. Data Structures and Algorithms

**Tuple (`as const` array)**

`LINE_WIDTHS` is effectively a fixed-length typed tuple. The `as const` assertion promotes the inferred type from `string[]` to a readonly tuple of string literals. This is the TypeScript way to express "this array has exactly these values in exactly this order."

**Map over array → JSX**

The `LINE_WIDTHS.map(...)` call is the standard React pattern for rendering lists. Each element produces a JSX node; React reconciles the resulting array against the previous render using the `key` prop. Nothing algorithmically complex here, but it's worth being able to explain reconciliation if asked.

---

## 8. Impress the Interviewer

A few things about this component that go beyond the obvious:

**The line widths tell a story.** 100%, 90%, 95%, 60% — the slight width variation between lines two and three (90% vs 95%) is deliberate. A mechanical descending sequence (100%, 80%, 60%, 40%) reads as a loading bar pattern, not prose. The near-equal middle lines plus the truncated final line reproduce the visual rhythm of a real paragraph. That's a UX detail worth calling out.

**The skeleton matches the resolved state exactly.** The border classes — `border border-border border-l-4 border-l-primary` — are the same ones on the live AI summary card. If the skeleton had different dimensions or border treatment, the page would visually "snap" when content loads. Avoiding that snap is the whole point of skeleton screens.

**The accessibility surface is layered.** `role="status"` creates a polite live region. `aria-label` names it. The `sr-only` span provides readable text within the region. And `motion-reduce:animate-none` handles a third accessibility vector — motion sensitivity. Each layer addresses a different assistive technology or user need. Most skeleton implementations get one of these right; this one gets all three.

**`data-testid` on individual lines** is a small detail that pays off in test maintenance. Tests that target `skeleton-line-0` through `skeleton-line-3` don't break if the component's DOM structure changes as long as the test IDs survive. It's the test stability equivalent of programming to an interface instead of an implementation.
