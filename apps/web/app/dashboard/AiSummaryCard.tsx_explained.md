# AiSummaryCard.tsx — Interview-Ready Documentation

## 1. Elevator Pitch

The AiSummaryCard is a React client component that renders AI-generated business summaries with 6 distinct visual states: idle (invisible), connecting (skeleton loader), streaming (progressive text with blinking cursor), done (full text with action buttons), error (with retry), and cached (instant display for anonymous visitors). It handles accessibility, reduced motion preferences, and responsive typography.

**How to say it in an interview:** "I built the AI summary card that handles real-time streaming display with a state-driven architecture. It renders differently based on the hook's state — progressive text with a cursor during streaming, a skeleton while connecting, error recovery with retry, and instant display for cached content. It's accessible with ARIA live regions and respects `prefers-reduced-motion`."

## 2. Why This Approach

**State-driven rendering over imperative DOM manipulation.** Instead of show/hide logic or CSS transitions between states, the component branches on `status`. Each state returns a completely self-contained JSX tree. No `display: none`, no conditional classes — just "if connecting, render skeleton; if streaming, render text + cursor." This makes it impossible to accidentally show a cursor in the done state or show error text during streaming.

**Cached content as a separate code path.** Anonymous visitors see seed data summaries from the server (passed as `cachedContent` prop). Rather than faking a "completed stream" by dispatching actions, the component short-circuits entirely — `hasCached` skips the hook and renders static text. This avoids unnecessary fetch calls for users who can't stream anyway (no JWT).

**`useRef` for analytics deduplication.** The completion analytics event should fire exactly once per stream. Without the ref, changing `status` to `done` could fire the effect multiple times (React 18 strict mode double-invokes effects). The `completedRef` boolean gates the side effect. It resets when `datasetId` changes — a new dataset means a new stream, a new completion event.

**Composition over configuration.** `StreamingCursor`, `SummaryText`, and `PostCompletionFooter` are small, focused components rather than configuration props on a monolithic card. Each owns its own styling and behavior. Adding the transparency panel (Story 3.6) means adding a new component in the footer, not threading props through the card.

## 3. Code Walkthrough

### StreamingCursor (lines 14-23)

```typescript
function StreamingCursor() {
  return (
    <span className="animate-blink motion-reduce:animate-none" aria-hidden="true">
      ▋
    </span>
  );
}
```

The `▋` character (lower half block) is a common terminal cursor representation. `animate-blink` is a custom CSS animation defined in `globals.css` — 530ms on/off cycle using `step-end` timing. `motion-reduce:animate-none` respects the `prefers-reduced-motion` media query. `aria-hidden="true"` keeps the cursor character out of screen reader announcements.

### SummaryText (lines 25-35)

Splits the AI response on double newlines (`\n\n`) to create paragraphs. The `filter(Boolean)` removes empty strings from consecutive newlines. Typography classes set `max-w-prose` (65ch width), responsive font sizes (16px mobile, 17px desktop), and paragraph spacing via `[&>p+p]:mt-[1.5em]` — the adjacent-sibling selector scoped to the component.

### PostCompletionFooter (lines 37-60)

Fades in after streaming completes via `animate-fade-in`. Contains three elements: "Powered by AI" label, "How I reached this conclusion" button (placeholder for Story 3.6 transparency panel), and a "Share" button (placeholder for Story 4.1). Both buttons are `disabled` — they're UI scaffolding that will be wired up in later stories.

### AiSummaryCard (lines 62-153)

The main component. The rendering logic:

**Cached path (79-94).** If `cachedContent` exists and there's no `datasetId` to stream from, render the text immediately with the full card chrome (border, shadow, footer). No hook involvement at all.

**Idle (96).** Return `null`. The card is invisible until streaming starts or cached content is available.

**Connecting (98-107).** Render `AiSummarySkeleton` (reused from an earlier story) with an "Analyzing your data..." label. The label fades in with `animate-fade-in`.

**Error (109-129).** Red left border (`border-l-destructive`), error message, and a retry button that calls `start()` from the hook. The retry re-triggers the full fetch cycle.

**Streaming and Done (131-152).** Same container, different details. Both render `SummaryText`. During streaming, `aria-busy={true}` and the cursor is visible. On done, `aria-busy={false}`, cursor gone, `PostCompletionFooter` fades in.

The `transition-opacity duration-150` on the container provides a subtle crossfade when the status changes, avoiding jarring visual jumps.

### Analytics effects (67-77)

Two `useEffect` hooks:
1. When `status` transitions to `done` and the ref hasn't fired yet, mark as completed. This is where you'd call `trackEvent()` — currently just sets the flag (the actual analytics call is wired in the backend's `AI_SUMMARY_COMPLETED` event).
2. When `datasetId` changes, reset the ref. New dataset = new stream = new completion event.

## 4. Complexity and Trade-offs

**Component size.** At ~150 lines, this component is bigger than most in the codebase. It could be split into `AiSummaryCardStreaming`, `AiSummaryCardCached`, etc. — but the branching logic is the interesting part, and splitting it would scatter the state machine across files. The current structure makes it easy to see all states in one place.

**No error retry limit.** The retry button calls `start()` with no counter. A user could hammer retry indefinitely. Story 3.4 adds proper retry logic with exponential backoff and a max-attempts cap. For now, the hook already has `cancel()` to prevent concurrent streams.

**Key on `i` for paragraphs.** The `SummaryText` component uses array index as the React key for paragraphs. Normally this is a red flag, but these paragraphs are static after rendering — they never reorder, insert, or delete. Index keys are fine for static lists.

## 5. Patterns Worth Knowing

**`role="region"` + `aria-label`.** This creates a landmark region that screen readers can navigate to directly. "AI business summary" tells the user what's in this region without having to read through it. Combined with `aria-live="polite"`, new text content is announced after the screen reader finishes its current speech — not interrupting, just queuing.

**`aria-busy` during streaming.** When `aria-busy={true}`, screen readers know the region is changing and may wait to announce content until it stabilizes. When streaming finishes and `aria-busy` flips to `false`, the full content is announced. Without this, a screen reader would try to announce every text chunk — overwhelming for the user.

**`motion-reduce:` Tailwind prefix.** Maps to `@media (prefers-reduced-motion: reduce)`. People with vestibular disorders or seizure conditions use this OS setting. The cursor still renders (it's informational), but the animation stops. This is one line of CSS with a big accessibility impact.

**`satisfies` for prop destructuring.** Not used here but relevant — the component uses TypeScript interface for props, which gives better error messages than inline types. The interface is short enough to live in the same file.

## 6. Interview Questions

**Q: How does the component handle the transition from streaming to done without a visual flicker?**
A: The same container is rendered for both states — only the inner content changes (cursor disappears, footer fades in). The `transition-opacity duration-150` on the container smooths any re-render artifacts. React reconciles the same JSX structure, so the DOM node persists — no unmount/remount.
Red flag: "I'd add a loading spinner between states."

**Q: Why is `cachedContent` a separate code path instead of initializing the hook's state?**
A: Two reasons. First, the cached path doesn't need the hook at all — no `fetch`, no `AbortController`, no cleanup. Initializing the hook with cached content would still create an effect and a ref for nothing. Second, the cached path is for anonymous visitors who don't have a JWT. The hook would try to fetch and get a 401. Short-circuiting avoids that entirely.
Red flag: "I'd dispatch a CACHE_HIT action in a useEffect."

**Q: What accessibility issues would this component have without the ARIA attributes?**
A: Screen readers wouldn't know this is a distinct region (no landmark navigation). During streaming, every text chunk would be announced immediately, creating a torrent of speech. The cursor character would be read as "lower half block" on every render. And without `aria-busy`, there's no signal to wait for content to stabilize.

**Q: Why use `useRef` instead of `useState` for the analytics completion flag?**
A: The flag doesn't affect rendering — it's purely a side-effect guard. Using `useState` would trigger a re-render when the flag changes, which triggers the effect again, creating unnecessary work. Refs are the right tool for values that change but don't need to re-render.

**Q: How would you test the reduced-motion behavior?**
A: In the unit test, we query for the cursor element and check its class includes `motion-reduce:animate-none`. We don't need to mock the media query — we're verifying the class is present, and Tailwind's responsive prefixes are applied via CSS (not JS). The actual animation behavior is a browser concern, not a React concern.

## 7. Data Structures

**Props interface:** `{ datasetId: number | null, cachedContent?: string, className?: string }`. The `datasetId` drives the hook — `null` means "don't stream." `cachedContent` is the server-fetched summary for anonymous visitors. `className` allows the parent to add margin/spacing.

**Hook return:** `{ status, text, error, start, cancel }`. The component reads `status` to branch rendering, `text` for the summary content, `error` for the error message, and `start` for the retry button. `cancel` isn't used directly but runs on unmount via the hook's effect cleanup.

## 8. Impress the Interviewer

**The dual rendering path.** Point out that the component handles two fundamentally different flows — server-cached content for anonymous visitors and client-streamed content for authenticated users — without conditional hook calls (which would violate Rules of Hooks). The `hasCached` check happens before the JSX branches, and `useAiStream` is always called but receives `null` when cached content is present, causing it to stay idle.

**Progressive enhancement mindset.** Anonymous visitors get instant cached content. Authenticated users get real-time streaming. Users with slow connections see a skeleton. Users who lose connection see an error with retry. Users with vestibular disorders see a static cursor. Each layer degrades gracefully. Mention this as a design philosophy, not a checklist.

**Component composition for future extensibility.** The footer has placeholder buttons for sharing (Story 4.1) and transparency (Story 3.6). Rather than adding props like `showShareButton` or `onTransparencyClick`, each feature gets its own component slotted into the footer. This keeps the card's interface stable as features are added — new stories don't change `AiSummaryCard`'s props.
