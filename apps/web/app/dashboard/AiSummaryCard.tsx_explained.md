# AiSummaryCard.tsx — Interview-Ready Documentation

## 1. Elevator Pitch

The AiSummaryCard is a React client component that renders AI-generated business summaries with 8 distinct visual states: idle (invisible), connecting (skeleton loader), streaming (progressive text with blinking cursor), done (full text with footer), timeout (partial text with "we focused on the key findings" message), error (classified message with conditional retry), free_preview (gradient blur + upgrade CTA over truncated content), and cached (instant display for anonymous visitors, with tier-aware truncation for free users). It maps error codes to user-friendly messages, caps retries at 3, uses different `aria-live` politeness levels for different failure severity, and implements subscription-tier-aware content gating with two distinct truncation paths (SSE stream truncation via backend, cached content truncation via `truncateAtWordBoundary`).

**How to say it in an interview:** "I built the AI summary card with a state-driven architecture that handles 8 rendering states, including a free-tier preview with gradient blur and upgrade CTA. There are two truncation paths — the backend truncates live streams at 150 words and sends an `upgrade_required` SSE event, while cached content gets client-side truncation via word boundary splitting. Both paths produce the same visual: readable preview text, gradient fade, blurred placeholder, and a centered upgrade CTA."

## 2. Why This Approach

**State-driven rendering over imperative DOM manipulation.** Instead of show/hide logic or CSS transitions between states, the component branches on `status`. Each state returns a completely self-contained JSX tree. No `display: none`, no conditional classes — just "if timeout, render partial text + message; if error, render error card."

**ERROR_MESSAGES record for code-based message mapping.** The server sends structured error codes (`RATE_LIMITED`, `AI_UNAVAILABLE`, `PIPELINE_ERROR`, etc.), but users shouldn't see those. The `ERROR_MESSAGES` record maps each code to a sentence a non-technical person can understand. The `userMessage()` helper falls back to the raw error string if the code isn't recognized — defensive but practical.

**How to say it in an interview:** "Error codes from the API get mapped to user-friendly messages via a lookup record. The fallback is the raw error string, so new error codes degrade gracefully without a code change."

**Timeout framed as intentional curation.** The UX spec explicitly says timeout should feel like "we focused on what matters" rather than "something broke." The italic message — "We focused on the most important findings to keep things quick" — reframes a 15-second timeout as a deliberate editorial choice. The partial text still gets the full card treatment (border, footer, "Powered by AI").

**How to say it in an interview:** "We frame timeout as intentional curation rather than failure. The user sees their partial summary with a message that positions the truncation positively. It's a UX decision — the same technical event (timeout) gets very different emotional treatment depending on how you present it."

**Derived state over synchronized state.** The `retryPending` flag is computed as `status === 'connecting' && text === ''` — a pure derivation from the stream hook's state. An earlier version used `useState` + three `useEffect` blocks to synchronize `retryPending` with `status` and `datasetId` changes. React 19's `react-hooks/set-state-in-effect` rule flagged all three effects. The fix wasn't to suppress the rule — it was to realize that `retryPending` was never independent state. It's a function of what's already known.

**How to say it in an interview:** "I replaced three useEffects with a single derived value. If the component is connecting and has no text yet, a retry is pending. That's a boolean expression, not a piece of state. React 19's lint rule caught the unnecessary synchronization — the fix was to stop treating a derived value as independent state."

**Conditional retry with max cap.** The retry button only shows when `retryable && !maxRetriesReached`. After 3 retries, it's replaced by "Please try again later." — the user knows the system tried but needs time. This prevents infinite retry loops while keeping the UI honest about what's happening.

**Subscription tier as a rendering concern, not a storage concern.** The `tier` prop (from the RSC's server-side fetch) controls what the user sees, not what the database stores. The AI summary cache always stores the full content. For free-tier users, `truncateAtWordBoundary` slices the cached text at 150 words client-side, then `FreePreviewOverlay` renders the preview with a gradient blur and upgrade CTA. Pro users and anonymous visitors see the full text. This separation means upgrading from free to pro is instant — no re-generation needed, just a different rendering path.

**Two truncation paths, one visual.** SSE streams get truncated by the backend (which sends `upgrade_required` after 150 words), while cached content gets truncated by the client (via `truncateAtWordBoundary`). Both paths render through `FreePreviewOverlay`, producing identical visuals. The backend path exists because you can't un-send SSE chunks. The client path exists because cached content arrives as a complete string.

**How to say it in an interview:** "There are two truncation paths that converge on the same UI. Live streams are truncated server-side because you can't un-stream bytes. Cached content is truncated client-side because it arrives whole. Both feed into the same FreePreviewOverlay component — gradient blur, placeholder text, upgrade CTA."

**Cached content as a separate code path.** Anonymous visitors see seed data summaries from the server (passed as `cachedContent` prop). Rather than faking a "completed stream" by dispatching actions, the component short-circuits — `hasCached` causes the hook to receive `null`, keeping it idle. No fetch, no AbortController, no cleanup. For free-tier authenticated users, the cached path also applies tier gating — `truncateAtWordBoundary` slices at `FREE_PREVIEW_WORD_LIMIT` and triggers the preview overlay.

**Composition over configuration.** `StreamingCursor`, `SummaryText`, and `PostCompletionFooter` are small, focused components rather than configuration props on a monolithic card. Each owns its own styling. Adding the transparency panel (Story 3.6) means adding a new component in the footer, not threading props through the card.

## 3. Code Walkthrough

### ERROR_MESSAGES and userMessage (lines 19-31)

A `Record<string, string>` mapping error codes to human-readable messages. Six entries covering every code the server can send. `userMessage()` checks the record first, falls back to the raw error string, and has a final fallback for null errors. Three levels of defense against showing technical garbage to users.

### truncateAtWordBoundary (lines 33-40)

Exported utility that splits text on whitespace, counts words, and slices at the boundary if over the limit. Returns `{ preview, wasTruncated }` — the caller decides what to do with the truncation flag. `filter(Boolean)` handles multiple spaces and leading/trailing whitespace. The join reconstructs with single spaces — minor normalization, but consistent output.

### FreePreviewOverlay (lines 104-130)

The paywall gate UI. Shows the preview text via `SummaryText`, then a gradient fade (`bg-gradient-to-b from-card/0 to-card`) into blurred placeholder paragraphs (`blur-sm opacity-60`). The placeholder text is hardcoded — it's `aria-hidden="true"` and exists solely to create the visual impression of more content behind the blur. The UpgradeCta overlaps the blur via `z-20 -mt-8`, floating on top with the overlay variant.

### StreamingCursor (lines 56-65)

The `▋` character (lower half block) with `animate-blink` (530ms on/off, `step-end` timing). `motion-reduce:animate-none` respects `prefers-reduced-motion`. `aria-hidden="true"` hides it from screen readers.

### SummaryText (lines 39-49)

Splits on double newlines to create paragraphs. `filter(Boolean)` removes empties. `max-w-prose` (65ch), responsive sizes (16px→17px), paragraph spacing via `[&>p+p]:mt-[1.5em]`.

### PostCompletionFooter (lines 51-74)

"Powered by AI" label, "How I reached this conclusion" button (placeholder for Story 3.6), "Share" button (placeholder for Story 4.1). Both buttons `disabled`. Fades in via `animate-fade-in`.

### AiSummaryCard — main component (lines 132-300)

**Cached path (159-184).** If `cachedContent` exists and no `datasetId`, render static text with full card chrome. Hook receives `null` → stays idle. Now tier-aware: when `tier === 'free'`, `truncateAtWordBoundary` slices the cached text at `FREE_PREVIEW_WORD_LIMIT` (150 words) and renders `FreePreviewOverlay` instead of the full text. Pro users and anonymous visitors (no tier) see the complete content with `PostCompletionFooter`.

**Idle (186).** Returns `null`.

**Free preview from SSE (189-202).** When the backend sends `upgrade_required`, the hook sets status to `free_preview` with the accumulated text. The card renders `FreePreviewOverlay` with the streamed preview text. This path handles the live-stream truncation case — the backend stopped sending after 150 words.

**Connecting (204-213).** Skeleton + "Analyzing your data..." label.

**Timeout (122-142).** Partial text in the normal card chrome (primary left accent), then an `<hr>` divider, then an italic message about focusing on key findings. Gets `PostCompletionFooter` — the partial content is complete enough to attribute. `aria-live="polite"` because this is informational, not urgent.

**Error (144-178).** Destructive left accent (`border-l-destructive`). Message comes from `userMessage(code, error)`. Reassurance: "Your data and charts are still available below." — tells the user the AI failure doesn't affect their data. Retry button conditional on `retryable && !maxRetriesReached`. After max retries: "Please try again later." `aria-live="assertive"` — errors should interrupt the screen reader immediately.

**Streaming and Done (180-201).** Same container, different details. Streaming gets cursor + `aria-busy={true}`. Done gets `PostCompletionFooter` + `aria-busy={false}`. The `transition-opacity duration-150` smooths the transition.

### Hook and derived state (lines 152-163)

The hook returns `{ status, text, metadata: streamMetadata, error, code, retryable, maxRetriesReached, retry }`. The metadata convergence — `streamMetadata ?? cachedMetadata ?? null` — merges SSE stream and RSC cache paths. A `useEffect` lifts metadata up to DashboardShell via `onMetadataReady`.

`retryPending` is derived, not stored: `const retryPending = status === 'connecting' && text === ''`. This replaced three `useEffect` blocks that synchronized a `useState` boolean with `status` and `datasetId` changes — React 19 flagged them as cascading renders.

## 4. Complexity and Trade-offs

**Component size.** At ~200 lines with 8 states, this is one of the larger components. Each state is a self-contained JSX block — splitting into separate components (AiSummaryTimeout, AiSummaryError, etc.) would scatter the state machine across files. Keeping it together makes the rendering logic easy to audit.

**Key on `i` for paragraphs.** `SummaryText` uses array index as the React key. Normally a red flag, but these paragraphs are static after rendering — no reordering, inserting, or deleting. Index keys are fine for static lists.

**`userMessage` could miss new codes.** If the server adds a new error code, `userMessage` falls back to the raw error string. It won't crash, but the message might be technical. The tradeoff: updating `ERROR_MESSAGES` requires a frontend deploy, but it's a one-line addition.

**How to say it in an interview:** "Each error state has a specific message, retry behavior, and accessibility treatment. The timeout state intentionally looks like success — partial text with a positive reframing — while the error state uses a destructive visual style with assertive aria-live. Same component, different emotional design based on what the user can do about it."

## 5. Patterns Worth Knowing

**`role="region"` + `aria-label`.** Creates a landmark region screen readers can jump to. "AI business summary" identifies the content without reading through it. Combined with `aria-live`, updates get announced automatically.

**How to say it in an interview:** "The AI card is an ARIA landmark region with appropriate live-region semantics. Screen readers can navigate directly to it, and content updates are announced automatically based on severity — polite for streaming, assertive for errors."

**`aria-live` politeness levels.** `polite` waits for a pause in speech before announcing. `assertive` interrupts immediately. The component uses `polite` for streaming/timeout (informational) and `assertive` for errors (urgent). This is a deliberate UX decision — not all updates are equally important.

**`aria-busy` during streaming.** Tells screen readers the region is updating — they may wait to announce content until `aria-busy` flips to `false`. Prevents a torrent of announcements during streaming.

**`motion-reduce:` Tailwind prefix.** Maps to `@media (prefers-reduced-motion: reduce)`. The cursor still renders but the animation stops. One line of CSS, big accessibility impact.

**Error code lookup table.** The `ERROR_MESSAGES` record is a simple pattern for decoupling error codes from display text. The server sends machine-readable codes, the client translates. If you need localization later, you swap the record with an i18n lookup.

**Derived state over effect synchronization.** Instead of `useState` + `useEffect` to track a boolean that's fully determined by existing state, compute it inline: `const retryPending = status === 'connecting' && text === ''`. No effect, no stale closure, no cascading render. React 19 explicitly flags the `useState` + `useEffect` pattern — the derived value is the idiomatic alternative.

**Interview-ready:** "If a value can be computed from existing state, it shouldn't be state. Derived values update automatically when their source state changes — no synchronization effects needed, no bugs from forgetting to reset them."

## 6. Interview Questions

**Q: Why use `aria-live="assertive"` for errors but `"polite"` for streaming?**
A: Streaming text is informational — interrupting the screen reader for every chunk would be overwhelming. Errors are urgent — the user needs to know immediately that something failed and whether they can retry. The politeness level maps to urgency, not technical severity.
*Red flag:* "Just use assertive for everything." That makes every text chunk interrupt the user.

**Q: Why frame timeout differently from error?**
A: Timeout with partial text isn't a failure from the user's perspective — they have useful content. Showing a red error card would alarm them unnecessarily. The timeout state uses the same card styling as success (primary border, footer) with an explanatory message. Error states use destructive styling because the user got nothing useful.
*Red flag:* "Timeout is just another error." It's not — the user has partial content they can act on.

**Q: How would you add localization to the error messages?**
A: Replace the `ERROR_MESSAGES` record with an i18n key lookup. The server already sends machine-readable codes (`RATE_LIMITED`, `AI_UNAVAILABLE`), so the translation layer maps `error.RATE_LIMITED` → localized string. No server changes needed.

**Q: Why does `cachedContent` bypass the hook instead of dispatching CACHE_HIT?**
A: Two reasons. First, the cached path doesn't need fetch, AbortController, or cleanup. Second, cached content is for anonymous visitors without a JWT — the hook would try to fetch and get a 401. Short-circuiting avoids that entirely.
*Red flag:* "I'd dispatch CACHE_HIT in a useEffect."

**Q: What happens when maxRetriesReached is true but retryable is also true?**
A: The retry button disappears and "Please try again later." shows instead. The error message still displays. The user knows the system tried (3 times) but needs time to recover. They can always refresh the page for a fresh start (which resets retryCount via a new hook instance).

**Q: How do you test the reduced-motion behavior?**
A: Query for the cursor element and check its class includes `motion-reduce:animate-none`. We verify the class is present — the actual animation is a browser concern, not testable in jsdom.

## 7. Data Structures

**Props interface:** `{ datasetId: number | null, cachedContent?: string, tier?: SubscriptionTier, className?: string }`. `datasetId` drives the hook — `null` means "don't stream." `cachedContent` is the server-fetched summary for anonymous visitors. `tier` is the subscription tier from the RSC — `undefined` for anonymous (no gating), `'free'` for free-tier (truncated preview), `'pro'` for pro (full content).

**truncateAtWordBoundary return:** `{ preview: string, wasTruncated: boolean }`. The `wasTruncated` flag drives the conditional: overlay for truncated, full content for non-truncated.

**Hook return (destructured):** `{ status, text, error, code, retryable, maxRetriesReached, retry }`. The component reads `status` for branching, `text` for content, `error`/`code` for messages, `retryable`/`maxRetriesReached` for button visibility, and `retry` for the button handler.

**ERROR_MESSAGES:** A `Record<string, string>` — O(1) lookup by error code. Six entries. Falls back gracefully for unknown codes.

## 8. Impress the Interviewer

**The emotional design of failure states.** Timeout and error look completely different to the user despite being similar technically. Timeout uses the success card (primary accent, footer, reassuring message). Error uses destructive styling with assertive aria-live. This shows you think about how technical states map to user emotions — a timeout with content feels like a win, an error feels like a problem.

**How to bring it up:** "I designed timeout and error states with different emotional treatments. Timeout shows partial content positively — 'we focused on what matters.' Errors are visually distinct with a destructive accent and assertive screen reader announcement. The technical distinction drives different user experiences."

**The dual rendering path.** The component handles server-cached content and client-streamed content without conditional hook calls (which would violate Rules of Hooks). `useAiStream` always runs but receives `null` when cached, causing it to idle. Mention this as a subtlety — many developers would try to conditionally call the hook.

**Progressive degradation ladder.** Anonymous → cached instant display (full). Free authenticated → cached with 150-word preview + upgrade CTA. Pro authenticated → streaming full content. Slow API → partial + positive reframe. Transient error → retry button. Persistent error → "try again later." Render crash → error boundary. Reduced motion → static cursor. Each layer degrades gracefully without the user feeling abandoned.

**How to bring it up:** "The card has 7 levels of degradation. Anonymous users get the full cached summary instantly. Free users see a 150-word preview with a gradient blur and upgrade CTA. Pro users get the full stream. Each subsequent level — timeout, error, max retries — gives the user something appropriate rather than a blank screen."

**Two convergent truncation paths.** The backend truncates SSE streams (it controls the tap), while the client truncates cached content (it arrives whole). Both feed into `FreePreviewOverlay`. This is worth mentioning because it shows you think about where truncation belongs based on data flow — you can't un-send bytes over SSE, but you can slice a string before rendering it.

---

## Story 3.6 Addendum: Transparency & Metadata

### What Changed

AiSummaryCard gained four new props: `cachedMetadata`, `onToggleTransparency`, `transparencyOpen`, and `onMetadataReady`. These wire the transparency panel feature without changing the card's state machine.

**Metadata convergence.** `const metadata = streamMetadata ?? cachedMetadata ?? null` merges two paths. Stream metadata comes from `useAiStream`'s state (when the SSE `done` event arrives with metadata). Cached metadata comes from the RSC page.tsx fetch (for anonymous users). A `useEffect` calls `onMetadataReady` whenever metadata changes, lifting it up to DashboardShell.

**PostCompletionFooter got props.** Previously a zero-prop component. Now accepts `onToggleTransparency` and `transparencyOpen`. The "How I reached this conclusion" button was `disabled` — now it's active with `aria-expanded`, a rotating chevron, and `onClick` wired to the parent's toggle handler. Appears in both `done` and `timeout` states (metadata is available in timeout because the curation pipeline completes before streaming). Hidden in `free_preview` (PostCompletionFooter doesn't render there).

---

## Story 4.1 Addendum: Share Insight & Stream Completion

### What Changed

AiSummaryCard gained share-related props and a stream completion callback to support the "Share as Image" feature.

**Share props threaded through PostCompletionFooter (lines 22-26, 89-96, 98-148).** Four new props: `onShare`, `onShareDownload`, `onShareCopy`, and `shareState`. These are callbacks and status from `useShareInsight` in DashboardShell, passed through AiSummaryCard into `PostCompletionFooter`, which renders the `ShareMenu` component. The footer conditionally renders — if all three share callbacks exist, it mounts `ShareMenu`; otherwise, a disabled placeholder "Share" button. This means the share feature degrades gracefully if the parent doesn't provide the callbacks.

**`onStreamComplete` callback (lines 21, 204-206, 214-216).** DashboardShell needs to know when the AI summary finishes (done or timeout) to show the mobile ShareFab. Two `useEffect` blocks fire `onStreamComplete`: one for the stream path (`status === 'done' || status === 'timeout'`), one for the cached path (`hasCached`). This follows the same lift-state-up pattern as `onMetadataReady` — the card reports completion, the shell decides what to do with it.

**PostCompletionFooter share integration (lines 128-145).** The footer now has a conditional: if all share callbacks are provided, render `ShareMenu` with the status and callbacks. Otherwise, render a disabled "Share" button as a placeholder. The `ShareMenu` sits in a `ml-auto` div to push it to the right edge of the footer.

### Interview-Relevant Patterns

**Callback-based state lifting.** `onStreamComplete` is the third callback AiSummaryCard fires upward (after `onMetadataReady` and the implicit state from `useAiStream`). The pattern is consistent: the card knows when something happened, the shell decides what to do about it. The card doesn't know about ShareFab, the shell doesn't know about stream status internals.

**How to say it in an interview:** "AiSummaryCard reports events upward via callbacks — metadata ready, stream complete — without knowing what the parent does with them. DashboardShell uses `onStreamComplete` to gate the mobile share FAB's visibility. The card and the FAB are decoupled through the shell."

**Conditional feature rendering.** The `onShare && onShareDownload && onShareCopy` guard in PostCompletionFooter means the share feature is opt-in. If a consumer of AiSummaryCard doesn't pass share callbacks, the footer still renders but with a disabled placeholder. This is useful for testing (render the card without the share hook wired up) and for future contexts where sharing might not make sense (e.g., an embedded widget).
