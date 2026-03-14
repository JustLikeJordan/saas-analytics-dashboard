# TransparencyPanel.tsx -- Interview Companion Doc

## 1. Elevator Pitch

TransparencyPanel is a sidebar that shows users *how* the AI reached its conclusions. It displays which statistical methods were used, how insights were scored, and what prompt version generated the summary. The idea is simple: if your product uses AI to explain business data, users should be able to peek behind the curtain. This is a progressive disclosure pattern -- the panel stays hidden until a user actively asks for it, then slides open alongside the AI summary card using a CSS Grid column animation.

In an interview, you'd say: "I built a transparency sidebar that progressively discloses AI methodology metadata. It uses semantic HTML, keyboard accessibility, and a CSS Grid animation that avoids layout reflow."

## 2. Why This Approach

**Why an `<aside>` and not a modal?**

A modal says "stop what you're doing and deal with this." That's wrong here. The transparency info is supplementary -- you want to glance at it while still reading the AI summary next to it. The HTML `<aside>` element with `role="complementary"` communicates exactly this relationship to assistive technology: "this content is related to the main content but not part of it."

Because it's not a modal, you don't need a focus trap. Modals require trapping focus inside them (tab can't escape) because the backdrop blocks interaction with everything else. An aside doesn't block anything. The user can tab out of the panel into the main content freely. You just need an escape key handler and a close button.

**Why CSS Grid column animation instead of width or transform?**

The panel animates its grid column from `0fr` to `320px`. Most developers would reach for `width: 0` to `width: 320px` or a `translateX` transform. Both have problems:

- Animating `width` causes layout reflow on every frame. The browser recalculates the position of every sibling element 60 times per second. On a dashboard with charts, that's a stutter factory.
- `translateX` avoids reflow but the panel either overlaps content or you need to manually manage the space it occupies.

CSS Grid's `grid-template-columns` transition handles both: the browser knows the layout relationship between the summary card and the panel, so it can optimize the reflow. The `1fr` column (the AI summary) stays stable as the `0fr` column grows to `320px`. One line of CSS, no JavaScript animation library.

**Why conditional rendering *and* `isOpen`?**

The component returns `null` when `!isOpen || !metadata`. You might ask: if the parent controls visibility via CSS Grid (collapsing the column to `0fr`), why also return null? Two reasons. First, screen readers would still announce the content of a visually hidden panel. Returning null removes it from the accessibility tree entirely. Second, the escape key handler and focus management effects shouldn't run when the panel is closed -- returning null means those effects never mount.

## 3. Code Walkthrough

**The `formatRelativeTime` utility**

This function converts an ISO timestamp into a human-readable relative string like "2 hours ago" or "3 days ago." It uses the `Intl.RelativeTimeFormat` API, which is built into every modern browser and handles localization automatically.

*What's happening:* The function calculates the time difference in seconds, then picks the largest unit (seconds, minutes, hours, days) that fits.

*How to say it in an interview:* "I used the Intl.RelativeTimeFormat API for relative timestamps instead of pulling in a library like date-fns or moment. It's zero-bundle-cost since it's a browser built-in, and it handles i18n automatically if we add locale support later."

The negative sign in `rtf.format(-seconds, 'second')` matters. `Intl.RelativeTimeFormat` uses the sign to determine direction: negative means "ago," positive means "in X seconds." A common gotcha.

**The `STAT_TYPE_LABELS` lookup**

A flat record mapping internal stat type keys to human-readable labels. The fallback in the template (`STAT_TYPE_LABELS[st] ?? st`) means unknown stat types render their raw key instead of crashing. This is defensive in the right way -- the API might add new stat types before the frontend gets updated.

**Focus management**

```typescript
useEffect(() => {
  if (isOpen) closeRef.current?.focus();
}, [isOpen]);
```

When the panel opens, focus moves to the close button. This is an accessibility requirement: if a user triggered the panel via keyboard, they need to know where focus went. The close button is the logical target because it's the primary action within the panel.

*What's happening:* A ref on the close button gets focused when isOpen flips to true.

*How to say it in an interview:* "I manage focus programmatically when the panel opens. Since it's an aside and not a modal, I move focus to the close button rather than implementing a full focus trap. This follows the WAI-ARIA pattern for complementary landmarks."

**Escape key handler**

The early return when `!isOpen` prevents the listener from being added when the panel is closed. The cleanup function in the return removes the listener when the panel closes or the component unmounts. This is textbook `useEffect` cleanup -- if you skip it, you leak event listeners.

*What's happening:* A keydown listener is added to the document when the panel opens, and removed when it closes.

*How to say it in an interview:* "The effect returns a cleanup function that removes the event listener. This prevents memory leaks and avoids the stale closure problem where an old onClose reference gets called."

Note that `onClose` is in the dependency array. If the parent passes a new `onClose` callback (unlikely with `useCallback`, but possible), the effect re-runs: removes the old listener referencing the old `onClose`, adds a new one referencing the current `onClose`. Without this dependency, you'd have a stale closure bug.

**The `aria-live="polite"` attribute**

This tells screen readers: "when content inside this element changes, announce it -- but wait for the user to finish what they're doing first." The alternative is `aria-live="assertive"`, which interrupts immediately. Polite is correct here because transparency metadata is informational, not urgent.

**The touch target**

The close button has `min-h-11 min-w-11` (44x44px). This meets WCAG 2.5.8's minimum target size. Small touch targets are the most common mobile accessibility failure, and interviewers notice when you get this right.

## 4. Complexity / Trade-offs

**Time complexity:** Rendering is O(n) where n is the number of stat types -- typically 3-5. The scoring weights section iterates over a fixed tuple of 3 keys. Nothing here will ever be a performance concern.

**Trade-off: Client-side relative time.** `formatRelativeTime` computes the relative time at render. It doesn't update live -- if the panel stays open for 10 minutes, "2 hours ago" won't tick forward. For a transparency panel that users glance at briefly, this is fine.

**Trade-off: Document-level keydown listener.** The escape handler listens on `document`, not on the panel element. This means pressing Escape anywhere on the page closes the panel. That's the expected behavior for panels and drawers -- but if another component also listens for Escape (like a modal on top), you'd need to coordinate.

**Trade-off: No animation on the component itself.** The parent (`DashboardShell`) handles the CSS Grid column animation. The panel just renders or returns null. This separation is clean -- the panel doesn't need to know how it's being revealed.

## 5. Patterns Worth Knowing

**Progressive Disclosure.** You show users only what they need at first, then let them drill deeper on demand. The AI summary card shows the conclusion. The transparency panel shows the methodology. This pattern reduces cognitive load -- most users never open the panel, but power users and skeptics can verify the AI's work.

**Semantic HTML as accessibility infrastructure.** `<aside>` + `role="complementary"` + `aria-label` + `aria-live` -- four attributes that make the component fully accessible without any JavaScript accessibility library. Screen readers announce the panel as a complementary landmark with the label "AI analysis methodology."

**Effect cleanup for event listeners.** The escape key effect is a textbook example of the `useEffect` cleanup pattern. Effects that add event listeners should always return a cleanup function.

**Nullish coalescing for graceful degradation.** `STAT_TYPE_LABELS[st] ?? st` -- if the label map doesn't have an entry, show the raw key. Better than crashing, better than silently hiding unknown types.

## 6. Interview Questions

**Q: Why did you use `<aside>` instead of `<div>` for this panel?**
A: `<aside>` is a sectioning element that creates a "complementary" landmark in the accessibility tree. Screen reader users can jump directly to it using landmark navigation. A `<div>` would be invisible to assistive technology unless you added `role="complementary"` manually. I used both because some older screen readers don't map `<aside>` to the complementary role automatically.

**Q: Why not use a focus trap here?**
A: Focus traps are for modal dialogs -- components that block interaction with the rest of the page. This panel is non-modal. The user should be able to read the panel, then tab back to the AI summary or interact with charts without closing it first.

**Q: What would happen if you forgot the `useEffect` cleanup for the keydown listener?**
A: Two problems. First, a memory leak -- every time `isOpen` toggles, a new listener gets added without removing the old one. Second, stale closures -- old listeners would reference old `onClose` callbacks, potentially calling functions from unmounted component renders.

**Q: How does the CSS Grid animation work without layout thrashing?**
A: The parent uses `grid-template-columns` with a transition. When the panel opens, the column goes from `0fr` to `320px`. The browser's layout engine knows both columns belong to the same grid context, so it can batch the reflow. The `motion-reduce:duration-0` class respects the user's reduced motion preference.

**Q: Why return null instead of just hiding with CSS?**
A: Returning null removes the component from both the DOM and the React tree. CSS `display: none` would leave the content in the DOM, where screen readers might still discover it. It also means the `useEffect` hooks for focus and keyboard handling don't run when the panel is closed.

## 7. Data Structures

**`TransparencyMetadata` (from `shared/types`)**

```typescript
interface TransparencyMetadata {
  statTypes: string[];           // e.g., ['trend', 'anomaly', 'category_breakdown']
  categoryCount: number;         // how many data categories the AI analyzed
  insightCount: number;          // how many insights the AI generated
  scoringWeights: {
    novelty: number;             // 0-1, how much novelty affected ranking
    actionability: number;       // 0-1, how much actionability affected ranking
    specificity: number;         // 0-1, how much specificity affected ranking
  };
  promptVersion: string;         // e.g., 'v1'
  generatedAt: string;           // ISO 8601 timestamp
}
```

Think of this as an audit trail for AI output. The `scoringWeights` tell you what the curation pipeline prioritized when ranking insights. The `promptVersion` lets you trace which prompt template was active.

**`STAT_TYPE_LABELS` record** -- A simple lookup table mapping internal keys to display strings. It lives at module scope because it never changes.

## 8. Impress the Interviewer

**Connect it to AI trust and explainability.** This component exists because of a real product concern: users don't trust AI that operates as a black box. You can reference "explainable AI" (XAI) and say that transparency panels are the UI layer of an XAI strategy. The backend curates `ComputedStat[]` (never raw data -- privacy by architecture), and this component makes that curation visible.

**Mention the mobile adaptation.** The parent component renders `TransparencyPanel` inside a `BottomSheet` on mobile instead of a side panel. This shows you think about responsive design at the component architecture level, not just with CSS breakpoints.

**Talk about the 0fr trick.** Animating `grid-template-columns` from `0fr` to a fixed width is a technique most candidates haven't used. It avoids the classic problem of animating `height: auto` or `width: auto`, which CSS can't transition natively. The grid fractional unit `0fr` collapses the column to zero without removing it from the grid context, so the transition works smoothly.

**Point out what you didn't build.** There's no animation library, no accessibility library, no date formatting library. `Intl.RelativeTimeFormat` replaces date-fns. Semantic HTML replaces @radix-ui/react-dialog. CSS Grid replaces framer-motion. The things you chose not to add matter as much as the things you built.
