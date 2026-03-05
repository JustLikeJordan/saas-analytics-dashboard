# DemoModeBanner.tsx — Interview Companion

## 1. Thirty-Second Elevator Pitch

This component is a contextual notification bar that tells unauthenticated or new users what kind of data they're looking at — sample data seeded by the app, or an empty state with no data at all. It renders for exactly two of four possible demo states: `seed_only` and `empty`. For the other two (`seed_plus_user`, `user_only`), the user has real data and doesn't need the nudge, so the component returns nothing.

The interesting part isn't the rendering logic — it's the exit behavior. When the user uploads a CSV, the demo state transitions away from `seed_only`. Rather than vanishing instantly, the banner plays a 300ms CSS dissolve animation and then removes itself from the DOM. This is driven by a `useRef` tracking the previous state value, which is the standard React pattern for reacting to state *transitions* rather than state *values*.

---

## 2. Why This Approach

**A lookup table instead of conditional strings.**

The messages live in a `MESSAGES` object keyed by `DemoModeState`. You could write the same thing as an `if/else` chain, but the object approach has two advantages: adding a new state message means adding one line, not finding the right branch; and `message = MESSAGES[demoState]` is a single expression that either resolves or doesn't.

The `Partial<Record<DemoModeState, string>>` type is worth paying attention to. `Record<K, V>` means every key of `K` must be present. `Partial` relaxes that. So the type says "this object may have an entry for any demo state, but not all of them." That's exactly right — `seed_plus_user` and `user_only` don't need messages because the component bails out before it would ever check them.

**`useRef` for transition detection, not `useEffect` with two state values.**

The dissolve animation needs to fire when `demoState` *changes from* `seed_only`, not when it *is* `seed_only`. That's a transition event, and React doesn't have a built-in hook for transitions. The conventional solution is to store the previous render's value in a ref. A ref doesn't trigger a re-render when it changes, which is exactly what you want here — you're reading history, not driving UI directly from it.

**CSS animation via `onAnimationEnd`, not a `setTimeout`.**

Using `setTimeout(300)` to match a 300ms animation duration is a maintenance trap. You change the animation duration in CSS, forget to update the timeout, and now there's a flash. Listening to `onAnimationEnd` ties the DOM removal directly to the animation completing, regardless of how long that animation takes.

---

## 3. Code Walkthrough

**State setup**

```tsx
const [dismissed, setDismissed] = useState(false);
const [dissolving, setDissolving] = useState(false);
const prevStateRef = useRef(demoState);
```

Three pieces of state manage the banner's lifecycle. `dismissed` is the user explicitly clicking X. `dissolving` is the animated exit triggered by a state transition. `prevStateRef` is the memory of what `demoState` was on the last render — a ref, not state, because changing it shouldn't cause a re-render.

**Transition detection**

```tsx
useEffect(() => {
  if (prevStateRef.current === 'seed_only' && demoState !== 'seed_only') {
    setDissolving(true);
  }
  prevStateRef.current = demoState;
}, [demoState]);
```

Every time `demoState` changes, this effect runs. It checks: was the previous value `seed_only` and is the new value something else? If so, trigger the dissolve. Then unconditionally update `prevStateRef` to the current value so the next render has accurate history. The order matters — check first, then update.

**Early returns**

```tsx
if (demoState === 'seed_plus_user' || demoState === 'user_only') return null;
if (dismissed && !dissolving) return null;
```

The first guard handles states where the banner should never appear. The second handles the dismissed case but has a subtle condition: `!dissolving`. If the banner is mid-animation, `dismissed` might be true from a previous interaction — we don't want to cut the animation short by bailing here.

**The animation handoff**

```tsx
onAnimationEnd={() => {
  if (dissolving) setDismissed(true);
}}
```

When the CSS animation finishes, `setDismissed(true)` causes the component to re-render. Now `dismissed` is true and `dissolving` is true, so the second early return fires and the component disappears cleanly.

**Conditional dismiss button**

The X button only renders when `demoState === 'seed_only'`. The `empty` state has no dismiss — there's nothing to dismiss from when there's no data, and removing the nudge would leave the user with a blank screen and no guidance.

**Accessibility**

```tsx
<div role="status" aria-live="polite">
```

`role="status"` with `aria-live="polite"` tells screen readers this content can change, and they should announce it when they get a chance — not interrupt whatever the user is doing. That's the right call for a notification that isn't urgent.

---

## 4. Complexity and Trade-offs

**The dissolve-then-dismiss handoff is slightly fragile.**

The flow is: `dissolving = true` → CSS animation plays → `onAnimationEnd` fires → `dismissed = true` → early return removes element. This works when the animation completes normally. If the element is removed by something else mid-animation (a parent unmounting, a route change), `onAnimationEnd` never fires. The element just disappears. That's acceptable — the alternative is cleanup logic in `useEffect` that probably adds more complexity than it prevents.

**Session-only dismissal.**

`dismissed` lives in `useState`, so it resets on page reload. This is intentional per the architecture — the banner comes back on the next visit if the user is still in demo mode. Persisting to localStorage would be a one-liner, but it creates a new class of bugs: what if the state changed between visits? The current approach is stateless and correct.

**`motion-reduce:hidden` on the dissolving state.**

For users with `prefers-reduced-motion`, the animation class gets hidden entirely rather than playing a reduced version. That's a reasonable accessibility choice — a suddenly-missing element is better than a half-baked motion effect for users who specifically opted out of animation.

**The `Partial<Record<...>>` guard at the end of early returns.**

After the two early returns, the code does `const message = MESSAGES[demoState]` and then `if (!message) return null`. TypeScript can't prove at this point that `demoState` is specifically `seed_only` or `empty`, so the lookup returns `string | undefined`. The null check handles the case where a new state is added to `DemoModeState` but the developer forgets to add a message — the banner silently hides rather than rendering blank.

---

## 5. Patterns and Concepts Worth Knowing

**Previous-value pattern with `useRef`**

Storing `prevStateRef.current = value` at the end of a `useEffect` is the idiomatic way to compare the last render's value to the current one. You see this in animation triggers, transition detection, and "did this prop just change from X" logic. A common mistake is using a second state variable instead — that causes an extra render cycle and can create race conditions.

**`onAnimationEnd` for DOM cleanup**

Tying DOM removal to animation completion via `onAnimationEnd` is the React equivalent of listening to `transitionend` in vanilla JS. It keeps your animation timing in CSS where it belongs and your component logic in JSX where it belongs.

**`Partial<Record<K, V>>`**

`Record<K, V>` generates `{ [key in K]: V }` — every key required. `Partial` wraps it to `{ [key in K]?: V }` — every key optional. Together they say "a dictionary with these specific keys, but you don't have to include all of them." More expressive than `{ [key: string]: string }` because it constrains the key type.

**`aria-live="polite"` vs `"assertive"`**

Polite announcements queue behind whatever the screen reader is currently saying. Assertive interrupts immediately. Banners and status updates should almost always be polite — you're informing, not alarming. Use assertive for errors that require immediate attention.

**`cn()` utility**

The `cn` function (from `clsx` + `tailwind-merge` under the hood) merges class names and resolves Tailwind conflicts. Passing conditional class names as a second or third argument means they only apply when truthy. `dissolving && 'animate-banner-dissolve'` reads cleanly and compiles to nothing when false.

---

## 6. Potential Interview Questions

**Q: Why use `useRef` to track the previous state instead of storing it in `useState`?**

A ref update doesn't schedule a re-render. If `prevState` were in `useState`, updating it after every `demoState` change would cause an extra render on every transition. More importantly, the extra render could fire effects again before the DOM has had a chance to react, making the transition detection unreliable. A ref is the right tool when you need to remember a value across renders without *causing* renders.

**Q: What happens if the user dismisses the banner manually and then uploads a CSV?**

When the user clicks X, `dismissed` becomes true and the component returns null. The `useEffect` still runs on state changes, but the component is no longer in the DOM — nothing renders. The dissolve path never fires because there's nothing to animate. This is correct behavior: the user already dismissed it, so it just stays gone.

**Q: Why does the second early return check `!dissolving`?**

If you removed that check, a banner mid-animation could get cut off. When `dissolving` is true, the CSS animation is playing. `dismissed` could theoretically be false (the transition was triggered automatically, not by user click), but even if it were true, you'd want the animation to finish. The guard says: even if dismissed, don't short-circuit if we're still animating.

**Q: What does `role="status"` tell assistive technology?**

It marks the element as a live region with `aria-live="polite"` semantics. Screen readers will announce content changes in this region when they're not busy with other announcements. Without this, a dynamically rendered banner might never be read aloud to users who can't see it appear.

**Q: If you needed to add a banner for a new demo state — say, `importing` — what would you change?**

One line in the `MESSAGES` object: `importing: "Your CSV is being processed..."`. The `Partial<Record<DemoModeState, string>>` type means TypeScript already knows `importing` is a valid key if it's in the union, and the `if (!message) return null` guard handles it gracefully if you forget. The early-return guards for `seed_plus_user` and `user_only` would need updating if `importing` should also be hidden.

**Q: What's the difference between `onAnimationEnd` and a `setTimeout` to clean up after an animation?**

`setTimeout` hard-codes a duration in JavaScript that has to stay in sync with the CSS. Drift between the two is a real source of bugs — the animation finishes, then 50ms later the element snaps out, or vice versa. `onAnimationEnd` fires exactly when the browser finishes the animation, with no coupling to a numeric duration. It also handles paused, cancelled, or reduced-motion animations more gracefully because it tracks the actual animation lifecycle.

---

## 7. Data Structures and Algorithms Used

**Finite state machine (implicit)**

The demo mode is a 4-state machine defined in `shared/types`. This component implements a view over two of those states and a transition detector. The `useRef` + `useEffect` pattern is a hand-rolled way to observe state machine transitions in React — you're computing "did we just move from state A to state B?" on every render.

**Lookup table**

`MESSAGES` is a hash map from state name to display string. Lookup is O(1). The `Partial<Record<...>>` type makes the absence of a key explicit at the type level, so the fallback `if (!message) return null` isn't defensive paranoia — it's handling a real edge case the type system acknowledges.

**Ref as mutable container**

`useRef` returns a stable object `{ current: T }` that persists across renders. Unlike state, mutating `current` is synchronous and doesn't trigger React's reconciliation. It's closer to a plain JavaScript variable that happens to survive re-renders than it is to any React-specific concept. That mental model makes it easier to reason about why it works here.

---

## 8. Impress the Interviewer

Most candidates reach for `useEffect` with two state variables when they need previous-value tracking. That works, but it adds a render cycle. The `useRef` approach is one render, zero extra state, and reads clearly once you know the pattern.

The `onAnimationEnd` cleanup is the kind of decision that separates developers who write features from developers who maintain them. Anybody can make the banner disappear. Fewer people think about what happens when the animation duration changes six months later and someone who never touched this file updates the CSS. Binding removal to the animation event makes that a non-issue.

The `!dissolving` guard in the early return is easy to miss on first read. In an interview, pointing it out unprompted — and explaining exactly which scenario it protects against — signals that you read component logic end-to-end, not just top-down until it makes sense.

Accessibility-wise, the `role="status"` / `aria-live="polite"` combination is correct and proportionate. An animated notification that screen readers can't perceive is just a visual decoration. Annotating it properly takes one line and makes it real content for everyone.

Finally, the `Partial<Record<DemoModeState, string>>` type isn't just TypeScript pedantry. It documents intent: this isn't a complete mapping of all states. New states won't accidentally break anything because the `if (!message) return null` guard is the natural consequence of the type. The type and the runtime behavior agree.
