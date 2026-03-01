# useReducedMotion.ts — Explained

## 1. Elevator Pitch

A 23-line React hook that tells you whether the user has enabled "reduce motion" in their operating system settings. It uses `useSyncExternalStore` — the React 19-recommended way to subscribe to browser APIs — and handles server-side rendering safely. Every animated component in the dashboard checks this hook before running transitions or chart animations.

## 2. Why This Approach

**`useSyncExternalStore` instead of `useState` + `useEffect`.**

The naive approach looks like this:

```ts
const [prefersReduced, setPrefersReduced] = useState(false);
useEffect(() => {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  setPrefersReduced(mql.matches);
  mql.addEventListener('change', () => setPrefersReduced(mql.matches));
  return () => mql.removeEventListener('change', ...);
}, []);
```

That works, but it has two problems. First, there's a flash: `useState(false)` renders one frame with motion enabled, then `useEffect` fires and flips it. During that frame, an animation might start and then abruptly stop. Second, React 19's `useEffect` lint rules flag subscriptions to external state — the React team explicitly created `useSyncExternalStore` for this pattern.

`useSyncExternalStore` solves both issues. It reads the current value synchronously during render (no intermediate frame), and it subscribes to changes through a stable API that React can optimize for concurrent rendering.

**`getServerSnapshot` returns `false` (assume motion is fine).** During SSR, there's no `window.matchMedia`. The third argument to `useSyncExternalStore` provides the server-side value. Returning `false` means "animations are allowed" — the progressive-enhancement default. If the user actually has reduced motion enabled, the client hydration will pick up the real value without a visible flash because `useSyncExternalStore` reconciles before the first paint.

## 3. Code Walkthrough

**Line 5: `QUERY` constant.** The media query string is defined once. This avoids typos if you ever need to reference the same query elsewhere. It matches when the OS-level "reduce motion" setting is active.

**Lines 7-11: `subscribe`.** This is the first argument to `useSyncExternalStore`. React calls it with a `callback` function and expects you to wire that callback to the external source's change event. Here, we create a `matchMedia` listener. The returned cleanup function removes the listener — same contract as `useEffect` cleanup.

*What's happening:* Wiring React's re-render trigger to a browser media query change event.
*How to say it:* "subscribe connects React's internal scheduler to the matchMedia change event, so when the user toggles reduced motion in system settings, React knows to re-render."

**Lines 13-15: `getSnapshot`.** The second argument. React calls this during render to get the current value. It's synchronous — no async, no promises. Just read `window.matchMedia(QUERY).matches` and return a boolean.

**Lines 17-19: `getServerSnapshot`.** The third argument. Called during SSR when `window` doesn't exist. Returns `false` because we can't know the user's preference on the server, and "allow animations" is the safe default that matches what most users expect.

**Lines 21-23: `useReducedMotion`.** The hook itself is a one-liner that passes the three functions to `useSyncExternalStore`. Consumers just call `const reducedMotion = useReducedMotion()` and get a boolean.

## 4. Complexity & Trade-offs

Time complexity is O(1) for everything. `getSnapshot` is a single property read. `subscribe` adds one event listener. No loops, no data structures.

**Trade-off: Server assumes motion is allowed.** If someone with reduced motion enabled loads the page, the server-rendered HTML will include animation classes. During hydration, `getSnapshot` reads the real value and React updates before the first paint. In practice, this means animations never actually play for reduced-motion users — but if you were rendering an animated SVG inline in the server HTML, there'd be a brief flash. For this project, all chart animations are client-side (Recharts), so the trade-off is invisible.

**Trade-off: `matchMedia` is called twice** — once in `subscribe` and once in `getSnapshot`. You could cache the `MediaQueryList` object, but `window.matchMedia` with the same query returns a cached object in all modern browsers anyway. Not worth the added complexity.

## 5. Patterns Worth Knowing

- **The subscribe/getSnapshot/getServerSnapshot trio.** This is the canonical pattern for hooking React into any external state source — browser APIs, third-party stores, WebSocket connections, you name it. If an interviewer asks "how would you subscribe to X in React 19?", this triple is the answer.
- **Progressive enhancement default.** Returning `false` from `getServerSnapshot` means "assume the most common case on the server, correct on the client." This same pattern applies to dark mode, viewport size, and any other client-only preference.
- **Media query as external store.** The `matchMedia` API is an observable — it has events and a current value. That makes it a perfect fit for `useSyncExternalStore`, which was designed exactly for this kind of external observable.

## 6. Interview Questions

**Q: Why `useSyncExternalStore` instead of `useState` + `useEffect`?**
A: Two reasons. First, `useEffect` fires after paint, so there's a frame where the state hasn't been read yet — you'd see animations start and then stop. `useSyncExternalStore` reads the value synchronously during render, so the first paint already reflects the user's preference. Second, React 19's linter rules specifically flag subscriptions to external state inside `useEffect` and point you toward `useSyncExternalStore`.

**Q: What would happen if you omitted `getServerSnapshot`?**
A: During SSR, `getSnapshot` would try to access `window.matchMedia`, which doesn't exist on the server. You'd get a "window is not defined" crash. The `getServerSnapshot` parameter exists precisely for this — it provides a safe fallback value when there's no browser environment.

**Q: Could this cause a hydration mismatch?**
A: Technically yes — the server renders with `false` and the client might have `true`. But `useSyncExternalStore` is designed to handle this. React reconciles the external store value during hydration before committing to the DOM, so the user never sees a flash. If you used raw `useState(false)` + `useEffect`, the mismatch would be visible as a flash.

**Q: How would you test this hook?**
A: Mock `window.matchMedia` to return an object with `matches: true` and a no-op `addEventListener`. Then render a component using the hook and assert that it reflects the mocked value. To test reactivity, capture the `change` event listener from the mock and call it, then assert the component re-renders.

## 7. Data Structures

There aren't any custom data structures here. The hook works with:

- **`MediaQueryList`** — the browser's built-in object returned by `window.matchMedia()`. It has a `matches: boolean` property and `addEventListener`/`removeEventListener` methods.
- **Return value:** A plain `boolean`. `true` = user wants reduced motion. `false` = animations are fine.

## 8. Impress the Interviewer

- **"useSyncExternalStore replaced an entire class of useEffect bugs."** Before React 18, subscribing to external state in useEffect was the only option, and it caused tearing in concurrent mode — components could read stale values mid-render. `useSyncExternalStore` guarantees consistency by reading synchronously. Mention "tearing" in a React interview and you'll stand out.

- **"The server snapshot is a progressive enhancement contract."** The pattern of "assume the common default on the server, correct on the client before paint" applies broadly — dark mode, locale, viewport breakpoints, feature flags. This hook is 23 lines, but the architectural thinking behind `getServerSnapshot` translates directly to any SSR-aware external state subscription.
