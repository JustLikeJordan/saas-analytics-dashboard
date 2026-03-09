# AiSummaryCard.tsx — Interview-Ready Documentation

## 1. Elevator Pitch

The AiSummaryCard is a React client component that renders AI-generated business summaries with 8 distinct visual states: idle (invisible), connecting (skeleton loader), streaming (progressive text with blinking cursor), done (full text with footer), timeout (partial text with "we focused on the key findings" message), error (classified message with conditional retry), free_preview (placeholder for paywall), and cached (instant display for anonymous visitors). It maps error codes to user-friendly messages, caps retries at 3, and uses different `aria-live` politeness levels for different failure severity.

**How to say it in an interview:** "I built the AI summary card with a state-driven architecture that handles 8 rendering states, including graceful timeout with partial content delivery and classified error handling. Error codes from the SSE stream get mapped to user-friendly messages, retry is capped at 3 attempts, and accessibility is handled with different aria-live politeness levels — polite for normal updates, assertive for errors."

## 2. Why This Approach

**State-driven rendering over imperative DOM manipulation.** Instead of show/hide logic or CSS transitions between states, the component branches on `status`. Each state returns a completely self-contained JSX tree. No `display: none`, no conditional classes — just "if timeout, render partial text + message; if error, render error card."

**ERROR_MESSAGES record for code-based message mapping.** The server sends structured error codes (`RATE_LIMITED`, `AI_UNAVAILABLE`, `PIPELINE_ERROR`, etc.), but users shouldn't see those. The `ERROR_MESSAGES` record maps each code to a sentence a non-technical person can understand. The `userMessage()` helper falls back to the raw error string if the code isn't recognized — defensive but practical.

**How to say it in an interview:** "Error codes from the API get mapped to user-friendly messages via a lookup record. The fallback is the raw error string, so new error codes degrade gracefully without a code change."

**Timeout framed as intentional curation.** The UX spec explicitly says timeout should feel like "we focused on what matters" rather than "something broke." The italic message — "We focused on the most important findings to keep things quick" — reframes a 15-second timeout as a deliberate editorial choice. The partial text still gets the full card treatment (border, footer, "Powered by AI").

**How to say it in an interview:** "We frame timeout as intentional curation rather than failure. The user sees their partial summary with a message that positions the truncation positively. It's a UX decision — the same technical event (timeout) gets very different emotional treatment depending on how you present it."

**Conditional retry with max cap.** The retry button only shows when `retryable && !maxRetriesReached`. After 3 retries, it's replaced by "Please try again later." — the user knows the system tried but needs time. This prevents infinite retry loops while keeping the UI honest about what's happening.

**Cached content as a separate code path.** Anonymous visitors see seed data summaries from the server (passed as `cachedContent` prop). Rather than faking a "completed stream" by dispatching actions, the component short-circuits — `hasCached` causes the hook to receive `null`, keeping it idle. No fetch, no AbortController, no cleanup.

**Composition over configuration.** `StreamingCursor`, `SummaryText`, and `PostCompletionFooter` are small, focused components rather than configuration props on a monolithic card. Each owns its own styling. Adding the transparency panel (Story 3.6) means adding a new component in the footer, not threading props through the card.

## 3. Code Walkthrough

### ERROR_MESSAGES and userMessage (lines 14-26)

A `Record<string, string>` mapping error codes to human-readable messages. Six entries covering every code the server can send. `userMessage()` checks the record first, falls back to the raw error string, and has a final fallback for null errors. Three levels of defense against showing technical garbage to users.

### StreamingCursor (lines 28-37)

The `▋` character (lower half block) with `animate-blink` (530ms on/off, `step-end` timing). `motion-reduce:animate-none` respects `prefers-reduced-motion`. `aria-hidden="true"` hides it from screen readers.

### SummaryText (lines 39-49)

Splits on double newlines to create paragraphs. `filter(Boolean)` removes empties. `max-w-prose` (65ch), responsive sizes (16px→17px), paragraph spacing via `[&>p+p]:mt-[1.5em]`.

### PostCompletionFooter (lines 51-74)

"Powered by AI" label, "How I reached this conclusion" button (placeholder for Story 3.6), "Share" button (placeholder for Story 4.1). Both buttons `disabled`. Fades in via `animate-fade-in`.

### AiSummaryCard — main component (lines 76-202)

**Cached path (93-107).** If `cachedContent` exists and no `datasetId`, render static text with full card chrome. Hook receives `null` → stays idle.

**Idle and free_preview (109).** Return `null`. `free_preview` is a placeholder for Story 3.5's paywall gate — the hook will signal this status when a free-tier user's subscription doesn't cover AI summaries.

**Connecting (111-120).** Skeleton + "Analyzing your data..." label.

**Timeout (122-142).** Partial text in the normal card chrome (primary left accent), then an `<hr>` divider, then an italic message about focusing on key findings. Gets `PostCompletionFooter` — the partial content is complete enough to attribute. `aria-live="polite"` because this is informational, not urgent.

**Error (144-178).** Destructive left accent (`border-l-destructive`). Message comes from `userMessage(code, error)`. Reassurance: "Your data and charts are still available below." — tells the user the AI failure doesn't affect their data. Retry button conditional on `retryable && !maxRetriesReached`. After max retries: "Please try again later." `aria-live="assertive"` — errors should interrupt the screen reader immediately.

**Streaming and Done (180-201).** Same container, different details. Streaming gets cursor + `aria-busy={true}`. Done gets `PostCompletionFooter` + `aria-busy={false}`. The `transition-opacity duration-150` smooths the transition.

### Analytics effects (82-91)

Two `useEffect` hooks: one marks completion (gates future analytics), the other resets the flag when `datasetId` changes.

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

**Props interface:** `{ datasetId: number | null, cachedContent?: string, className?: string }`. `datasetId` drives the hook — `null` means "don't stream." `cachedContent` is the server-fetched summary for anonymous visitors.

**Hook return (destructured):** `{ status, text, error, code, retryable, maxRetriesReached, retry }`. The component reads `status` for branching, `text` for content, `error`/`code` for messages, `retryable`/`maxRetriesReached` for button visibility, and `retry` for the button handler.

**ERROR_MESSAGES:** A `Record<string, string>` — O(1) lookup by error code. Six entries. Falls back gracefully for unknown codes.

## 8. Impress the Interviewer

**The emotional design of failure states.** Timeout and error look completely different to the user despite being similar technically. Timeout uses the success card (primary accent, footer, reassuring message). Error uses destructive styling with assertive aria-live. This shows you think about how technical states map to user emotions — a timeout with content feels like a win, an error feels like a problem.

**How to bring it up:** "I designed timeout and error states with different emotional treatments. Timeout shows partial content positively — 'we focused on what matters.' Errors are visually distinct with a destructive accent and assertive screen reader announcement. The technical distinction drives different user experiences."

**The dual rendering path.** The component handles server-cached content and client-streamed content without conditional hook calls (which would violate Rules of Hooks). `useAiStream` always runs but receives `null` when cached, causing it to idle. Mention this as a subtlety — many developers would try to conditionally call the hook.

**Progressive degradation ladder.** Anonymous → cached instant display. Authenticated → streaming. Slow API → partial + positive reframe. Transient error → retry button. Persistent error → "try again later." Render crash → error boundary. Reduced motion → static cursor. Each layer degrades gracefully without the user feeling abandoned.

**How to bring it up:** "The card has 6 levels of degradation, from instant cached display down to error boundary fallback. Each level gives the user something appropriate — partial content, a retry option, or at minimum a reassurance that their data is still available."
