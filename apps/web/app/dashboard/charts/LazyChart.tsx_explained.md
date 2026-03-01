# LazyChart.tsx — Interview-Ready Documentation

> Source file: `apps/web/app/dashboard/charts/LazyChart.tsx` (76 lines)

---

## 1. 30-Second Elevator Pitch

LazyChart is a viewport-aware wrapper that defers chart rendering on mobile until the element scrolls into view. On desktop, it renders children immediately — no observer overhead. The viewport detection uses `useSyncExternalStore` instead of the typical useState-in-useEffect pattern, which avoids a React lint warning about synchronous state updates in effects and gives a hydration-safe server snapshot. When the chart becomes visible on mobile, it fades in from a skeleton placeholder.

**How to say it in an interview:** "LazyChart uses IntersectionObserver on mobile to defer below-fold chart rendering. Desktop renders immediately since charts are in-viewport. Viewport detection uses useSyncExternalStore for lint-safe, hydration-safe breakpoint tracking — the server snapshot returns false to avoid SSR mismatches."

---

## 2. Why This Approach?

### Decision 1: useSyncExternalStore for viewport detection instead of useState + useEffect

**What's happening:** The typical React pattern for tracking window width is `useState` + `useEffect` with a resize listener. But calling `setState` synchronously during the initial effect run triggers the `useEffect` shouldn't call setState synchronously lint rule. `useSyncExternalStore` is React's official API for subscribing to external data sources — the window resize event is exactly that. You provide a subscribe function, a getSnapshot function (client), and a getServerSnapshot function (SSR).

**How to say it in an interview:** "useSyncExternalStore is the React-sanctioned way to subscribe to browser APIs like window resize. It avoids the setState-in-useEffect lint error and gives you a clean SSR story through the server snapshot parameter. The subscribe function adds the resize listener, getSnapshot reads window.innerWidth, and getServerSnapshot returns false so the server always renders the mobile path."

**Over alternative:** `useState(false) + useEffect(() => { setState(window.innerWidth >= 768); window.addEventListener('resize', ...) })`. Works but triggers the lint rule, causes an unnecessary re-render on mount (false -> true on desktop), and has no SSR story without a typeof window guard.

### Decision 2: IntersectionObserver only on mobile

**What's happening:** The `useEffect` that creates the IntersectionObserver has an early return: `if (isDesktop) return`. On desktop, both charts are visible in a two-column grid — there's nothing below the fold to lazy-load. The observer would fire immediately on mount and disconnect, adding overhead for no benefit. On mobile, charts stack vertically, so the second chart starts below the fold.

**How to say it in an interview:** "The observer only runs on mobile where charts stack vertically and the second one starts below the fold. On desktop, the two-column grid puts both charts in the viewport — observing would fire immediately and disconnect, wasting a browser API call for nothing."

**Over alternative:** Always observing. The overhead is small (one IntersectionObserver per chart), but it's conceptually wrong — why observe something that's already visible? The `isDesktop` gate makes the intent explicit.

### Decision 3: Server snapshot returns false

**What's happening:** `getIsDesktopServer` always returns `false`. During SSR, React calls the server snapshot function instead of `getIsDesktop` (which would crash because `window` doesn't exist). Returning `false` means the server always renders the mobile/observer path. On hydration, the client runs `getIsDesktop` — if the user is on desktop, `isDesktop` flips to `true` and the component re-renders to show children directly.

**How to say it in an interview:** "The server snapshot returns false because there's no window object during SSR. This means the server always renders the skeleton/observer path. On hydration, the client detects the real viewport — if it's desktop, a single re-render swaps to immediate rendering. The hydration mismatch is brief and harmless because the skeleton looks right at any size."

**Over alternative:** Returning `true` from the server snapshot would cause a hydration mismatch on mobile — the server renders children, the client renders a skeleton. Returning `false` is safer: the worst case (desktop user sees a skeleton flash) is barely noticeable.

### Decision 4: Skeleton-to-content fade transition

**What's happening:** When IntersectionObserver fires (element is visible), `visible` flips to `true`. The children are wrapped in a div with `animate-fade-in` and a duration from `CHART_CONFIG.SKELETON_FADE_MS`. The `motion-reduce:animate-none` variant removes the fade for users who prefer reduced motion — the chart just appears.

**How to say it in an interview:** "The fade transition softens the skeleton-to-content swap. Without it, the chart would pop in abruptly as you scroll, which can be disorienting. motion-reduce:animate-none removes the fade for users who've requested reduced motion."

**Over alternative:** No animation — content replaces skeleton instantly. Works but feels jarring, especially on slower connections where the observer fires mid-scroll.

### Decision 5: Disconnect observer after first intersection

**What's happening:** Inside the observer callback, after setting `visible(true)`, the observer disconnects: `observer.disconnect()`. Once the chart is visible, it stays visible forever — there's no scenario where you'd want to un-render it. Disconnecting frees the observer's resources and removes it from the browser's observation loop.

**How to say it in an interview:** "The observer disconnects after the first intersection. Lazy loading is a one-way gate — once the chart renders, it stays rendered. Keeping the observer running after that would waste resources watching for an event we no longer care about."

---

## 3. Code Walkthrough

### Module-level functions (lines 13-24)

Three functions extracted outside the component:

**subscribeToResize (lines 13-16):** The subscribe function for `useSyncExternalStore`. Adds a resize listener, returns a cleanup function that removes it. This shape matches what `useSyncExternalStore` expects — a function that takes a callback, subscribes it, and returns an unsubscribe function.

**getIsDesktop (lines 18-20):** The client snapshot. Reads `window.innerWidth` and returns `true` if >= 768px (the `md:` breakpoint). Called on every render to check if the value has changed.

**getIsDesktopServer (lines 22-24):** The server snapshot. Always returns `false`. Used during SSR where `window` doesn't exist.

These are module-level (not inline) because `useSyncExternalStore` compares function references. Inline functions would create new references every render, causing the hook to resubscribe on every render cycle.

### LazyChart component (lines 33-75)

**Props (line 33):** `children` (the chart to render), `className` (optional wrapper class), and `skeletonVariant` (which skeleton shape to show — line or bar).

**Hooks (lines 34-36):** A ref for the container div (IntersectionObserver target), a `visible` boolean state (has the element scrolled into view?), and `isDesktop` from `useSyncExternalStore`.

**IntersectionObserver effect (lines 39-57):** Gated on `!isDesktop`. Gets the ref'd element, creates an observer with `threshold` from `CHART_CONFIG.LAZY_THRESHOLD`. The callback checks `entry.isIntersecting` — when the element enters the viewport past the threshold, it sets `visible(true)` and disconnects. Cleanup disconnects the observer (handles unmount during scroll).

The `[isDesktop]` dependency array means: if the user resizes from mobile to desktop (isDesktop flips from false to true), the effect re-runs. The early return means the observer cleans up and doesn't restart. If they resize back to mobile (isDesktop flips to false), a new observer is created. This handles the unlikely but possible resize-across-breakpoint case.

**Desktop fast path (line 59):** `if (isDesktop) return <>{children}</>`. No wrapper div, no observer, no skeleton. Just render the chart directly. The fragment avoids an extra DOM node.

**Mobile render (lines 61-74):** A div with the ref (so IntersectionObserver can watch it). If `visible`, the children are wrapped in a fade-in animated div. If not, a `ChartSkeleton` with the matching variant is shown. The `motion-reduce:animate-none` class on the fade wrapper respects the reduced-motion preference.

---

## 4. Complexity and Trade-offs

**Single breakpoint, no hysteresis.** The `isDesktop` check is a hard threshold at 768px. Resizing the window back and forth across 768px causes the component to flip between observer-mode and immediate-mode. There's no debounce on the resize itself (SWR's `useSyncExternalStore` fires on every resize event). For most users, window resizing isn't a frequent action, but it could cause brief flickers if someone drags the window edge across the breakpoint.

**Server always renders mobile path.** This means desktop users see a brief skeleton flash during hydration before `isDesktop` resolves to `true`. The flash is typically under 50ms — one frame — because hydration runs immediately. But on slow devices, it could be visible. The alternative (server renders desktop path, `getServerSnapshot` returns `true`) would cause a hydration mismatch on mobile, which is worse.

**No rootMargin for pre-loading.** The observer fires when the element actually enters the viewport. Adding `rootMargin: '100px'` would fire 100px before the element is visible, giving the chart a head start on rendering. Currently, there might be a brief flash where the skeleton is visible as you scroll into it. Adding rootMargin is a trivial improvement.

**visible state is one-way.** Once `visible` is true, it never goes back to false. If you wanted to virtualize charts (unmount when scrolled out of view), you'd need bidirectional observation. Not needed here — charts are small enough to stay in memory.

**How to say it in an interview:** "The main trade-off is the server snapshot returning false — desktop users get a one-frame skeleton flash during hydration. The alternative (returning true) would cause hydration mismatches on mobile, which is worse. I'd add rootMargin to the observer for pre-loading and a resize debounce if the threshold-crossing flicker became an issue."

---

## 5. Patterns Worth Knowing

### useSyncExternalStore for Browser APIs

`useSyncExternalStore` is React 18's answer to "how do I subscribe to something outside React's state system?" — window size, media queries, localStorage, WebSocket connections. It takes three functions: subscribe (how to listen for changes), getSnapshot (read the current value), getServerSnapshot (what to return during SSR). React calls getSnapshot on every render and re-renders if the value changed.

The key insight: this is the same hook that Redux and Zustand use under the hood. It's the fundamental subscription primitive in React's API.

**Interview-ready:** "useSyncExternalStore is React's primitive for subscribing to external data sources. I used it for window.innerWidth, but it's the same hook Redux uses internally. The three-function API cleanly separates subscribe, read, and SSR fallback concerns."

### IntersectionObserver for Lazy Rendering

IntersectionObserver is a browser API that fires a callback when an element enters or leaves the viewport (or any ancestor scroll container). Unlike scroll event listeners, it doesn't run on every pixel of scroll — it only fires at threshold crossings. This makes it more performant and removes the need for scroll-position math.

**Interview-ready:** "IntersectionObserver is the performant alternative to scroll listeners for viewport detection. It fires at threshold crossings, not on every scroll event. The browser handles the geometry calculation natively, so there's no JS-side getBoundingClientRect polling."

### The isDesktop Gate Pattern

On desktop, the observer is unnecessary — charts are already visible. The early return in the effect (`if (isDesktop) return`) prevents observer creation, and the early return in the render (`if (isDesktop) return <>{children}</>`) skips the wrapper div entirely. This is the "gate pattern" — check a condition first, skip everything if it doesn't apply.

**Interview-ready:** "The isDesktop gate skips both the observer and the wrapper div on desktop. It's not an optimization — it's about correctness. Observing an already-visible element would fire immediately and disconnect, adding setup/teardown overhead for something that was never below the fold."

### Hydration-Safe Server Snapshot

The server snapshot (`getIsDesktopServer`) returns a value that works on both mobile and desktop without causing hydration mismatches. Returning `false` means the server always renders the observer/skeleton path. On desktop, the client immediately re-renders to the direct-children path. The brief mismatch is invisible because: (1) it lasts one frame, and (2) the skeleton looks correct at any viewport width.

**Interview-ready:** "The server snapshot returns false to avoid hydration mismatches. The server can't know the viewport width, so it renders the safe default — the skeleton path. On desktop, the first client render detects the real viewport and swaps to immediate rendering. The flash is sub-frame."

---

## 6. Potential Interview Questions

### Q1: "Why useSyncExternalStore instead of useState + useEffect for tracking window width?"

**Context if you need it:** This is the core technical decision of the component. The interviewer wants to know if you understand the problem useState-in-useEffect creates.

**Strong answer:** "Three reasons. First, calling setState synchronously in a useEffect triggers a React lint rule and causes an unnecessary double-render on mount — the initial state (false) renders, then the effect runs, sets state to true, and renders again. useSyncExternalStore reads the value synchronously during render, so you get the correct value on the first paint. Second, it has a built-in server snapshot parameter for SSR — no typeof window guard needed. Third, it's React's official API for external subscriptions. It handles tearing (concurrent mode edge cases) that a manual approach wouldn't."

**Red flag:** "It's basically the same thing." — Misses the double-render, lint, SSR, and tearing differences.

### Q2: "Why does the server snapshot return false instead of true?"

**Context if you need it:** Tests your understanding of hydration mismatches and which direction is safer.

**Strong answer:** "If the server returns true (desktop) and the user is on mobile, the server-rendered HTML has the chart content but the client expects a skeleton. That's a hydration mismatch — React would need to tear down and rebuild the DOM, which is slow and can cause visual glitches. If the server returns false (mobile) and the user is on desktop, the server renders a skeleton and the client immediately re-renders with the content. That's also a mismatch, but the skeleton-to-content swap on desktop is nearly invisible — it happens in one frame during hydration."

**Red flag:** "It doesn't matter which way you go." — It does. Desktop-to-mobile mismatch is more disruptive than mobile-to-desktop.

### Q3: "Why disconnect the observer after the first intersection?"

**Context if you need it:** Probes whether you understand resource management with browser APIs.

**Strong answer:** "Lazy loading is a one-way transition. Once visible, the chart stays rendered forever — there's no scenario where you'd want to replace it with a skeleton again. A connected observer keeps running in the browser's observation loop, checking geometry on every scroll and resize. Disconnecting frees those resources. If I needed bidirectional observation (virtualization), I'd keep it connected."

**Red flag:** "To prevent the callback from firing multiple times." — The observer could be configured with `{ once: true }` if that were the only concern. The real reason is resource cleanup.

### Q4: "What happens when a user resizes their browser across the 768px breakpoint?"

**Context if you need it:** Tests understanding of the interaction between useSyncExternalStore and the effect.

**Strong answer:** "useSyncExternalStore fires the subscribe callback on resize. getIsDesktop re-evaluates and returns a new value. If isDesktop changes, the component re-renders. The effect has [isDesktop] in its dependency array, so it re-runs: if desktop, the early return cleans up any existing observer. If mobile, a new observer is created. The visible state persists across mode switches — if the chart was already shown, it stays shown. No content loss."

**Red flag:** "I don't handle that case." — You do, through the effect's dependency array and cleanup function.

### Q5: "Why are subscribeToResize, getIsDesktop, and getIsDesktopServer defined outside the component?"

**Context if you need it:** Tests understanding of referential stability in hooks.

**Strong answer:** "useSyncExternalStore compares function references between renders. If subscribe or getSnapshot are inline functions, they create new references every render, causing the hook to resubscribe every render — remove listener, add listener, over and over. Module-level functions have stable references by definition. It's the same reason you'd extract a useCallback, but without needing the hook."

**Red flag:** "For readability." — True but misses the technical reason.

---

## 7. Data Structures

### IntersectionObserverEntry

**What it is:** The browser-provided object passed to the IntersectionObserver callback. Key property: `isIntersecting` — a boolean indicating whether the observed element is within the viewport (past the configured threshold).

**Where it appears:** The observer callback destructures the entries array: `([entry]) => { if (entry?.isIntersecting) ... }`.

**Why the destructure:** IntersectionObserver always passes an array (it can observe multiple elements). Since we're observing one element, we take the first entry. The optional chain (`entry?`) guards against an empty array, which shouldn't happen in practice but satisfies TypeScript.

**How to say it in an interview:** "The observer callback receives an array of IntersectionObserverEntry objects. I destructure the first (and only) entry and check isIntersecting. The optional chain is a TypeScript guard — the array should always have one element since I'm observing one target."

### CHART_CONFIG Constants

**What it is:** A shared constants object from `packages/shared`. The relevant properties here are `LAZY_THRESHOLD` (the IntersectionObserver threshold, probably 0.1 or 0.2) and `SKELETON_FADE_MS` (the fade-in animation duration).

**Where it appears:** Observer constructor options and the fade-in animation inline style.

**Why shared:** The threshold and fade duration could be adjusted from one place. If the API needed to know about lazy-loading behavior (e.g., for performance metrics), it could import the same constants.

---

## 8. Impress the Interviewer

### useSyncExternalStore Solves Three Problems at Once

**What's happening:** The useState + useEffect approach for tracking window.innerWidth has three issues: (1) a React lint warning about synchronous setState in effects, (2) a double-render on mount (initial state -> effect runs -> state update -> re-render), (3) no SSR story without a typeof window guard. useSyncExternalStore fixes all three — it reads the value synchronously during render, has a dedicated server snapshot parameter, and is the React-team-blessed API for external subscriptions.

**Why it matters:** Most candidates would use useState + useEffect and dismiss the lint warning. Reaching for useSyncExternalStore shows you understand React's subscription model at a deeper level. It's the same hook that powers Redux's useSelector and Zustand's useStore.

**How to bring it up:** "I used useSyncExternalStore instead of the typical useState + useEffect for viewport tracking. It avoids the setState-in-effect lint warning, eliminates the double-render on mount, and has built-in SSR support via the server snapshot. It's the same primitive Redux uses under the hood."

### The isDesktop Gate Is About Correctness, Not Performance

**What's happening:** On desktop, the observer would fire immediately (the element is already in viewport), set visible to true, and disconnect. The net effect: a brief skeleton flash followed by the chart. The gate pattern skips all of this — no observer, no state update, no flash. But the real reason isn't performance (the overhead is trivial). It's that the observer is semantically wrong on desktop. You're observing "when does this enter the viewport?" for something that was never outside it.

**Why it matters:** This shows you think about API semantics, not just whether something "works." Using IntersectionObserver on an already-visible element is like setting an alarm for a time that's already passed — it fires immediately, but the intent is wrong.

**How to bring it up:** "The isDesktop gate isn't about performance — the observer overhead is negligible. It's about correctness. IntersectionObserver answers 'when does this enter the viewport?' For a desktop chart that's already visible, the question doesn't make sense. The gate skips an API call whose answer is predetermined."

### Server Snapshot Strategy Is a Bet on Which Mismatch Is Cheaper

**What's happening:** SSR can't detect viewport width. The server snapshot picks a default: `false` (mobile path). This creates a hydration mismatch on desktop — the server sends a skeleton, the client renders content. The alternative mismatch (server sends content, mobile client expects skeleton) would be more expensive because tearing down rendered chart content is heavier than replacing a skeleton.

**Why it matters:** This shows you reason about hydration mismatches quantitatively, not just "avoid them." Sometimes they're unavoidable — the question is which direction is cheaper. Skeleton-to-content is a lightweight swap (replace simple DOM nodes with complex ones). Content-to-skeleton would mean tearing down a full Recharts SVG tree and replacing it with a simpler structure — more work, more visual disruption.

**How to bring it up:** "The server can't know viewport width, so a hydration mismatch is unavoidable. I chose the direction where the mismatch is cheaper. Server renders skeleton, desktop client swaps to content — that's replacing simple nodes with complex ones. The reverse (tearing down a rendered chart to show a skeleton on mobile) would be heavier and more visible to the user."
