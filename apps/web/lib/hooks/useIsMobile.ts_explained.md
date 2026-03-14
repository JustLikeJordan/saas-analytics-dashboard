# useIsMobile.ts — Interview Companion Doc

## 1. Elevator Pitch

A hydration-safe React hook that tells you whether the viewport is mobile-sized (under 768px). It uses `useSyncExternalStore` with `matchMedia` — the same pattern as the codebase's `useReducedMotion` hook. Twenty-four lines, no state, no effects, no hydration mismatch.

## 2. Why This Approach

**Why `useSyncExternalStore` instead of `useState` + `useEffect`?**

The naive approach looks like this:
```typescript
const [isMobile, setIsMobile] = useState(false);
useEffect(() => {
  const mql = window.matchMedia('(max-width: 767px)');
  setIsMobile(mql.matches);
  mql.addEventListener('change', () => setIsMobile(mql.matches));
}, []);
```

This has two problems. First, `setIsMobile` inside `useEffect` triggers the `react-hooks/set-state-in-effect` lint rule — the codebase ran into this in Epic 2 and decided it wasn't worth fighting. Second, there's a hydration mismatch: the server renders with `false` (no `window`), then the effect fires and flips to `true` for mobile users, causing a flash of wrong layout.

`useSyncExternalStore` solves both. It reads the current value synchronously during render (no intermediate state), and it accepts a `getServerSnapshot` function that returns `false` during SSR. React reconciles the difference before the first paint, so users never see a layout flash.

*How to say it in an interview:* "I used `useSyncExternalStore` because it's React 19's idiomatic way to subscribe to browser APIs without hydration mismatches. The hook gives React the server snapshot and the client snapshot, and React handles the reconciliation internally."

**Why `matchMedia` instead of `resize` event + `window.innerWidth`?**

The codebase has another `useSyncExternalStore` hook in `LazyChart.tsx` that uses `window.innerWidth` with resize events. That fires on every pixel of resize. `matchMedia` fires only when crossing the threshold — mobile to desktop or back. Fewer events, fewer re-renders, cleaner mental model.

## 3. Code Walkthrough

**Module-level `mql` constant**

```typescript
const mql = typeof window !== 'undefined' ? window.matchMedia(QUERY) : null;
```

The `MediaQueryList` is created once at module load. `window.matchMedia` returns a cached object for identical queries, so this is cheap even if multiple hooks import it. The `typeof window` guard prevents SSR crashes.

*What's happening:* One `matchMedia` instance shared across all hook consumers.
*How to say it:* "The MediaQueryList is a singleton at module scope. Multiple components using this hook share the same browser subscription."

**`subscribe` function**

Wires React's re-render trigger to the `change` event on the `MediaQueryList`. The returned cleanup function removes the listener. This is the contract `useSyncExternalStore` expects: "subscribe" takes a callback, returns an unsubscribe function.

**`getSnapshot` function**

Synchronous read of `mql.matches`. Called during render to get the current boolean. Must be pure and fast — it runs on every render.

**`getServerSnapshot` function**

Returns `false` — "assume desktop" during SSR. This is the progressive enhancement default: mobile users get the correct layout on hydration, and the one-frame reconciliation is invisible because `useSyncExternalStore` handles it before paint.

## 4. Complexity / Trade-offs

**Time complexity:** O(1) for reads. The `matchMedia` subscription fires only on threshold crossing, not per-pixel.

**Trade-off: SSR assumes desktop.** Returning `false` from `getServerSnapshot` means the server-rendered HTML is always the desktop layout. For mobile users, React reconciles to the mobile layout during hydration. This is a brief moment where the wrong layout exists in the DOM — but `useSyncExternalStore` resolves it before the browser paints, so users don't see it.

**Trade-off: Module-level side effect.** Creating `mql` at module scope means the `matchMedia` call happens on import. In SSR, the `typeof window` guard prevents this from crashing, but it's a side effect that testing frameworks need to mock before importing the module.

## 5. Patterns Worth Knowing

**The subscribe/getSnapshot/getServerSnapshot trio.** This is the canonical pattern for hooking React into any external state source — browser APIs, third-party stores, WebSocket connections. If an interviewer asks "how would you subscribe to X in React 19?", this triple is the answer.

**Progressive enhancement default.** Returning `false` from `getServerSnapshot` means "assume the most common case on the server, correct on the client." This same pattern applies to dark mode, viewport size, and any other client-only preference.

**Media query as external store.** The `matchMedia` API is an observable — it has events and a current value. That makes it a natural fit for `useSyncExternalStore`, which was designed exactly for this kind of external observable.

## 6. Interview Questions

**Q: Why not just use CSS media queries in Tailwind?**
A: CSS media queries handle styling. This hook handles *rendering*. The dashboard conditionally renders completely different component trees for mobile (BottomSheet) vs desktop (CSS Grid panel). You can't do that with `md:hidden` — both trees would mount, potentially creating duplicate SSE connections or duplicate state.

**Q: What would happen if you omitted `getServerSnapshot`?**
A: During SSR, `getSnapshot` would try to access `mql.matches`, and `mql` would be `null` (no `window` on the server). You'd get a null reference crash. The `getServerSnapshot` parameter exists precisely for this.

**Q: Could this cause a hydration mismatch?**
A: Technically yes — the server renders "desktop" and the client may render "mobile." But `useSyncExternalStore` is special-cased in React's reconciler. It detects the mismatch and replays the render with the client value before the first paint. The user never sees the server version.

**Q: How would you test this hook?**
A: Mock `window.matchMedia` to return an object with `matches: true` and mock `addEventListener`. Use dynamic imports so the mock is in place before the module-level `mql` evaluates. The test file uses `vi.resetModules()` + `await import()` for exactly this reason.

## 7. Data Structures

No custom data structures. The hook works with:

- **`MediaQueryList`** — the browser's built-in object returned by `window.matchMedia()`. It has a `matches: boolean` property and `addEventListener`/`removeEventListener` methods.
- **Return value:** A plain `boolean`. `true` = viewport is under 768px. `false` = 768px or wider.

## 8. Impress the Interviewer

The thing that makes this hook interview-worthy isn't the 24 lines of code — it's understanding *why* those 24 lines are better than the 8-line `useState` + `useEffect` alternative. The naive version works in production most of the time. But it has a hydration mismatch that causes a flash of wrong layout, it triggers a lint rule the team cares about, and it creates an unnecessary intermediate render.

`useSyncExternalStore` was added to React specifically because the React team saw everyone writing the same buggy `useState` + `useEffect` pattern for external subscriptions. It's a "pit of success" API — harder to use wrong than right. Mentioning this context shows you understand not just what the API does, but why it exists.

If the interviewer pushes further, point out that the 767px breakpoint matches Tailwind's `md:` breakpoint exactly. The hook and the CSS framework agree on what "mobile" means, which prevents the bug where JavaScript renders "desktop" at 767px but CSS is still showing mobile styles.
