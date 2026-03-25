# SharedInsightCard.tsx — Focused Insight Card + CTA

## Elevator Pitch

A client component that renders a shared AI business insight in a distraction-free layout. No nav, no sidebar, no dashboard chrome — just the org name, date range, AI summary text, and a single CTA button pushing visitors toward signup. It's the "viral loop" endpoint: someone receives a link, sees enough value to want their own account.

In an interview: "It's a focused landing page component designed for conversion — minimal UI, clear value proposition, single call-to-action."

## Why This Approach

The component is a `'use client'` component despite having no interactive state. The story spec marks it as a client component for forward compatibility — future chart rendering would need browser APIs. In practice, this could be an RSC today since it just renders props.

The `SummaryText` helper is duplicated from `AiSummaryCard.tsx` rather than extracted into a shared utility. That's intentional: it's 5 lines of code, and the abstraction cost (new file, import path, shared component ownership) outweighs the DRY benefit. This is a "rule of three" decision — if a third component needs the same pattern, then extract it.

## Code Walkthrough

**`SummaryText` (lines 12-21):** Splits the AI summary on double newlines and renders each chunk as a `<p>`. The Tailwind classes match the dashboard's AI card exactly — 17px on desktop, 1.8 line-height, 65ch max-width.

What's happening → How to say it: "I duplicated a 5-line rendering helper rather than extracting a shared component, because the abstraction overhead wasn't justified for two consumers."

**`SharedInsightCard` (lines 23-56):** Accepts `orgName`, `dateRange`, `aiSummaryContent`, and `viewCount` as props. Renders a card with the insight data and a CTA below it. The `viewCount` prop is accepted but not rendered — the UX spec doesn't call for it, but it's available if we add it later.

**CTA design:** Uses `<Link href="/login">` (Next.js client-side navigation) styled as a button with Tailwind. The `h-12` class gives a 48px touch target (WCAG 2.5.5). `w-full` on mobile, `md:w-auto md:min-w-[320px]` on desktop. `focus-visible:ring-2` handles keyboard accessibility.

What's happening → How to say it: "The CTA is semantically a link, not a button, because it navigates. But it's styled as a button for visual prominence. The focus ring uses focus-visible to avoid showing on mouse clicks."

## Complexity / Trade-offs

- **Time/Space:** O(n) where n is summary length for the paragraph split. Trivial.
- **Trade-off: Link vs. Button.** Navigation actions should be links for semantic HTML and screen reader compatibility. Buttons are for actions that don't navigate. Using `<Link>` also gives us client-side prefetching for free.
- **Trade-off: Unused props.** `viewCount` is accepted but not rendered. Could argue this is dead code, but it's a single prop that documents the API surface and costs nothing.
- **Trade-off: `motion-reduce:duration-0`.** Applied at the wrapper level, so any future animations inside the card automatically respect the user's reduced-motion preference.

## Patterns Worth Knowing

- **Semantic HTML for CTAs** — Links navigate, buttons act. Styling doesn't change semantics.
- **WCAG 2.5.5 touch targets** — 44x44px minimum. We use 48px (`h-12`) for comfortable mobile tapping.
- **`focus-visible` vs `focus`** — `focus-visible` only shows the ring on keyboard navigation, not mouse clicks. Better UX.
- **Responsive without `sm:` breakpoint** — This project skips the 640px breakpoint entirely. Base classes are mobile, `md:` (768px) is the first layout shift.

## Interview Questions

**Q1: Why is the CTA a `<Link>` and not a `<button>`?**
It navigates to `/login`. Links are for navigation, buttons are for actions. Screen readers announce them differently, and links support middle-click/cmd-click to open in a new tab. Styling it as a button is a visual choice that doesn't change the semantic role.

**Q2: Why duplicate `SummaryText` instead of sharing it?**
The original is a private function in `AiSummaryCard.tsx` — 5 lines. Extracting it would mean creating a shared component file, adding an import path, and co-owning the component between two features. That's more maintenance overhead than the duplication cost. I'd extract on the third use.

**Q3: How does reduced motion work here?**
The `motion-reduce:duration-0` Tailwind class on the wrapper sets all animation durations to 0ms when the user has `prefers-reduced-motion: reduce` enabled. This is a blanket accessibility safeguard that covers any future animations added inside the card.

**Q4: Why accept `viewCount` if you don't render it?**
The API returns it, and the prop documents that it's available. If the product team later wants to show "Viewed 42 times," we add one line to the JSX instead of threading a new prop through from the page component.

## Data Structures & Algorithms

- **Props interface:** `{ orgName: string, dateRange: string, aiSummaryContent: string, viewCount: number }` — flat, no nesting, matches the API response shape exactly.
- **Paragraph splitting:** `text.split('\n\n').filter(Boolean)` — linear scan, produces an array of non-empty strings. Each becomes a `<p>` element.

## Impress the Interviewer

The privacy guarantee is architectural, not just policy. The component receives `orgName`, `dateRange`, and `aiSummaryContent` — that's it. There's no sharer name, no email, no user ID in the props. The snapshot stored in the database simply doesn't contain identity information, so even a buggy component can't leak what doesn't exist. That's the difference between "we don't show it" and "we can't show it."

The CTA copy — "See more insights — create your free account" — is doing two things at once: establishing value (more insights exist) and lowering friction (it's free). In a product interview, you'd connect this to the viral acquisition loop: shared link → see value → sign up → upload data → share their own insights.
