# ShareMenu Component — Explained

## Elevator Pitch

Two components that handle the "share as image" UI across screen sizes. `ShareMenu` is a desktop popover triggered by an inline button. `ShareFab` is a mobile floating action button that opens a bottom sheet. Both render the same `ShareOptions` subcomponent inside, so the share actions (download PNG, copy to clipboard) are identical regardless of how you opened the menu.

## Why This Approach

The core challenge is responsive UX: mobile users expect a FAB (floating action button) and a bottom drawer, while desktop users expect inline buttons with dropdown menus. Rather than one component with a bunch of conditional rendering, the file exports two focused components that share a common interior.

- **`ShareOptions` as the shared core** — Both `ShareMenu` and `ShareFab` render this. It handles the status display (spinner, error, success check), the two action buttons, and the generate-then-act pattern. Extracting it avoids duplicating the action logic.
- **Popover vs Sheet** — Desktop uses a custom positioned `div` (not a full dialog/popover from a library) because the interaction is lightweight — click to open, Escape to close. Mobile uses shadcn's `Sheet` component (`side="bottom"`) because bottom drawers are the expected mobile pattern and Sheet handles touch gestures, focus trapping, and backdrop dismissal.
- **FAB in DashboardShell, not AiSummaryCard** — The FAB is `position: fixed`, so it visually floats over everything. Rendering it inside a scrollable card would be semantically wrong and could cause z-index issues. `DashboardShell` owns it and controls visibility.

## Code Walkthrough

**ShareOptions (lines 19-76)**

The shared interior. Two callbacks — `handleDownload` and `handleCopy` — both call `onGenerate` first, then their specific action. This means clicking "Download PNG" generates the image on the spot, then triggers the download. The generate-then-act pattern means the user doesn't need a separate "generate" step.

Status feedback is screen-reader accessible: `role="status"` with `aria-live="polite"` on both the spinner and error message. The `motion-reduce:animate-none` on the spinner respects users who've set `prefers-reduced-motion`.

**ShareMenu (lines 78-117)**

A `relative` container with a toggle button and a conditionally rendered dropdown. The dropdown uses `animate-in fade-in-0 zoom-in-95` for a subtle entrance animation (with `motion-reduce:duration-0` to disable it for accessibility). Escape key handling is explicit via `onKeyDown`.

The `aria-expanded` and `aria-haspopup` attributes on the trigger button are important for screen readers — they announce whether the menu is open and that clicking will produce a popup.

**ShareFab (lines 127-157)**

Early returns do the heavy lifting: if not visible or not mobile, render nothing. The `useIsMobile()` hook (built with `useSyncExternalStore` + `matchMedia`) handles the responsive check without hydration mismatches.

The FAB itself is a 48x48px (`h-12 w-12`) circle — that's the minimum touch target size recommended by WCAG 2.5.5 and Apple's HIG. It sits `fixed bottom-4 right-4 z-50`, which means it floats above the page content in the bottom-right corner.

## Complexity and Trade-offs

**Trade-off: custom popover vs headless UI library** — A production app at scale would probably use Radix's `Popover` (which shadcn wraps). Here, the popover is two actions with simple open/close, so a positioned `div` is sufficient and avoids the overhead. If the menu grew to 5+ items or needed nested submenus, switching to a proper popover component would be the right call.

**Trade-off: generate-on-action vs generate-on-open** — The menu generates the PNG when you click Download or Copy, not when you open the menu. This avoids wasted work (user opens menu then closes it) but means there's a delay between clicking and getting the result. For a single dashboard screenshot (~200-400ms), that's acceptable. For heavier captures, you might want to pre-generate on open.

**Trade-off: two exports vs one** — `ShareMenu` and `ShareFab` could be unified into one component that internally branches on `useIsMobile()`. But that would mean the desktop version imports `Sheet` even though it never uses it, and the component's responsibilities would be muddled. Two focused components with a shared interior is cleaner.

## Patterns Worth Knowing

- **Compound component pattern (lite)** — `ShareOptions` isn't exported. It's an internal building block shared between two public components. This is a lightweight version of the compound component pattern (like `<Tabs>`, `<TabsList>`, `<TabsContent>`) — same idea of composable pieces, just simpler.
- **FAB as fixed-position overlay** — The FAB lives outside the normal document flow. Its parent component controls `visible` as a prop, which prevents it from showing during states where sharing doesn't make sense (no data, streaming in progress).
- **`aria-expanded` + `aria-haspopup`** — Standard ARIA pattern for disclosure widgets. Screen readers announce "Share, collapsed, has popup" so users know clicking will reveal more options.

## Interview Questions

**Q: Why is ShareFab a separate component from ShareMenu?**
A: Different rendering contexts. ShareMenu sits inline within a card footer — it's part of the document flow. ShareFab is `position: fixed` — it floats over the entire viewport. They have different trigger patterns (inline button vs FAB), different reveal patterns (dropdown vs bottom sheet), and different lifecycle requirements (ShareFab only appears on mobile and only when data exists). Merging them would conflate two distinct UX patterns.

**Q: What happens if a user rapidly clicks Download PNG multiple times?**
A: Each click calls `onGenerate` (which calls `generatePng`), but the hook sets status to `generating` immediately, and the button is `disabled` during that state. So the second click is blocked. If there were no disabled state, you'd get concurrent `toPng` calls, which would work but waste resources. The UI-level guard is sufficient here.

**Q: How would you handle the case where the Clipboard API isn't available?**
A: The hook's `copyToClipboard` would throw when `navigator.clipboard.write` is undefined. You could check for `navigator.clipboard?.write` and either hide the copy button or show a fallback message. Safari on older iOS versions is the main edge case — it gained Clipboard API support in iOS 13.4 but with some restrictions on when it can be called (must be in response to a user gesture).

**Q: Why use `onKeyDown` for Escape instead of a click-outside handler?**
A: Both are needed in a production popover. This implementation handles Escape (keyboard accessibility requirement) but doesn't close on outside clicks — that's a gap. A real popover component (like Radix `Popover`) handles both. For this scope, Escape covers the keyboard accessibility requirement from the acceptance criteria.

## Data Structures

- **`ShareStatus`** (re-exported type) — Same four-state union as the hook. Re-exported from this file so consumers don't need to import from two places.
- **`ShareMenuProps` / `ShareFabProps`** — Props interfaces that mirror the hook's return value. The component is a "dumb" UI layer that delegates all logic to the hook via callbacks.

## Impress the Interviewer

Point out the separation of concerns across the share feature. Three layers, each with a single job:

1. **`useShareInsight`** (hook) — Owns the side effects: DOM capture, data URL management, clipboard/download triggers, analytics.
2. **`ShareMenu` / `ShareFab`** (components) — Own the UI: responsive layout, popover/sheet rendering, accessibility attributes, status display.
3. **`DashboardShell`** (parent) — Owns the wiring: creates the capture ref, instantiates the hook, passes callbacks down.

No layer knows about the internals of another. The hook doesn't know whether it's triggered by a popover or a FAB. The components don't know how PNG generation works. The shell doesn't care about accessibility attributes. This makes each piece independently testable — the hook tests mock `html-to-image`, the component tests mock the hook, and the shell tests mock the entire ShareMenu.

---

## Story 4.1 Code Review Addendum

### What Changed

The code review identified three gaps in the desktop popover and one in the feedback UX. All fixed.

**Click-outside dismissal (lines 110-119).** The popover now registers a `mousedown` listener on `document` when open, and closes if the click target isn't inside the container ref. The listener attaches only when `open` is true and cleans up on close or unmount. `mousedown` (not `click`) is standard for click-outside — it fires before focus changes, preventing race conditions with focus management.

**Focus management (lines 122-134).** On open, focus moves to the first non-disabled button inside the panel via `panelRef.current?.querySelector('button:not(:disabled)')`. On Escape, focus returns to the trigger button via `triggerRef.current?.focus()`. Three refs now — `containerRef` (for click-outside boundary), `triggerRef` (for focus return), `panelRef` (for focus-into target). This satisfies WCAG 2.4.3 (Focus Order) — opening a popover should move focus into it, closing should return focus to the trigger.

**Removed incorrect `role="menu"`** from the popover div. The dropdown isn't a menu in the ARIA sense — it doesn't have `menuitem` children or arrow-key navigation. It's a disclosure widget (button + revealed content). The `aria-expanded` and `aria-haspopup` on the trigger are sufficient.

**Per-action success feedback (ShareOptions, lines 30-69).** Instead of relying on the global share `status` for feedback, each action (download, copy) now tracks its own success state via `ActionFeedback` — a union of `'idle' | 'downloaded' | 'copied'`. After a successful action, the Check icon appears next to that specific button and a green confirmation message ("Downloaded!" or "Copied to clipboard!") shows for 2 seconds before auto-dismissing. A `useRef` timer with cleanup on unmount prevents stale timeouts.

### Updated Code Walkthrough

**ShareOptions (lines 23-101).** Now manages its own `feedback` state and `feedbackTimer` ref. The `showFeedback` callback clears any existing timer, sets the feedback type, and schedules a reset after `FEEDBACK_DURATION_MS` (2000ms). `handleDownload` and `handleCopy` call `showFeedback` after their respective actions succeed. The Check icon now reflects which action was performed — `feedback === 'downloaded'` for the download button, `feedback === 'copied'` for the copy button — rather than just checking whether status is `'done'`.

**ShareMenu (lines 103-167).** The three-ref pattern (`containerRef`, `triggerRef`, `panelRef`) is standard for accessible popovers. The click-outside effect uses a named function (`onDocClick`) for the event handler so it can be removed in the cleanup. The focus-into effect runs on `open` change and targets `button:not(:disabled)` to skip the disabled state during generation.

### Interview-Relevant Patterns

**Click-outside via document listener.** The pattern: `document.addEventListener('mousedown', handler)` in a `useEffect` that depends on `open`. The handler checks `containerRef.current?.contains(e.target)`. If the click is outside, close. `mousedown` fires before `blur`/`focus`, so focus management stays predictable. Libraries like Radix use the same approach internally.

**Focus trapping vs. focus management.** This isn't a full focus trap (Tab doesn't cycle within the popover). For a two-button dropdown, a focus trap would be overkill — the user can Tab out naturally. Focus management (move focus in on open, return on close) is the right level of accessibility for this interaction. If the popover grew to include form fields or complex navigation, a focus trap via `FocusTrap` or Radix would be appropriate.

**How to say it in an interview:** "The popover uses focus management, not focus trapping. On open, focus moves to the first action button. On Escape, focus returns to the trigger. Tab moves naturally in and out. For a two-button disclosure widget, this matches WCAG expectations without the overhead of a full trap. If the popover grew to a form, I'd switch to Radix Popover which handles trapping automatically."

**Per-action feedback with auto-dismiss.** The `ActionFeedback` type is a tiny state machine: `idle → downloaded | copied → idle`. The timer-based auto-dismiss is a common pattern for transient success messages. Using `useRef` for the timer (not state) avoids re-renders from the timer itself. The `clearTimeout` before setting ensures rapid actions don't stack up stale timers.

### Updated Q&A

**Q: Why use `mousedown` instead of `click` for outside detection?**
A: `mousedown` fires before focus changes and before `click`. If you use `click`, the click-outside handler might fire after the popover has already lost focus and closed via another mechanism, causing double-firing. `mousedown` gives you first chance to decide. Radix, Floating UI, and Headless UI all use `mousedown` for the same reason.

**Q: The previous version mentioned "no click-outside handler" as a gap. Why not use Radix Popover instead of building it yourself?**
A: Three reasons. First, the popover has exactly two buttons — Radix Popover brings collision detection, arrow positioning, and portal rendering that aren't needed here. Second, adding a new shadcn component means a new dependency and a new file in the components directory for a feature that works fine with 15 lines of event handling. Third, the click-outside + focus management pattern is worth knowing — it's what Radix does internally, just without the positioning engine.
