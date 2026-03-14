# BottomSheet.tsx — Interview Companion Doc

## 1. Elevator Pitch

A thin React wrapper around the native HTML `<dialog>` element that presents content as a mobile bottom sheet. It bridges React's declarative state model with the browser's imperative `showModal()`/`close()` API using a `useEffect` + `useRef` combo. No third-party dependencies, no portal hacks, no focus-trap libraries — the browser handles all of that for free.

## 2. Why This Approach

**Why native `<dialog>` instead of a library like shadcn Sheet or Radix?**

This project doesn't have shadcn/ui configured. Adding it just for a bottom sheet would pull in Radix primitives, class-variance-authority, and a bunch of config files. The native `<dialog>` element gives you modal behavior, focus trapping, `Escape` key dismissal, and a `::backdrop` pseudo-element — all built into the browser. For a simple bottom sheet, that's everything you need.

**Why `showModal()` instead of `show()`?**

`showModal()` places the dialog on the browser's top layer and creates a backdrop. It also traps focus inside the dialog and prevents interaction with content behind it. `show()` does none of that — it just makes the element visible, like toggling `display: none`. For a sheet that overlays the page, you want the modal variant.

**What's happening:** The component syncs a boolean `open` prop to imperative DOM calls.
**How to say it in an interview:** "I used a controlled component pattern where React state drives the imperative dialog API through a `useEffect`, keeping the source of truth in the parent while leveraging native browser modal behavior."

## 3. Code Walkthrough

The component accepts three props: `open` (boolean toggle), `onClose` (callback for when the dialog closes), and `children` (the sheet content).

`useRef<HTMLDialogElement>` grabs a direct reference to the DOM node. You need this because `<dialog>` has no declarative `open` attribute that triggers modal mode — `showModal()` is method-only.

The `useEffect` watches `open` and calls `showModal()` or `close()` accordingly. The guards (`!dialog.open` and `dialog.open`) prevent calling `showModal()` on an already-open dialog, which throws an `InvalidStateError`.

The `onClose` handler is wired to the dialog's native `close` event. This fires when the user presses `Escape` or when `dialog.close()` is called programmatically — so the parent's state stays in sync either way.

**What's happening:** The `useEffect` has guards to avoid double-calling `showModal()`.
**How to say it in an interview:** "The effect includes idempotency checks because calling `showModal()` on an already-open dialog throws. This is a common gotcha with imperative DOM APIs in React's strict mode, where effects can run twice in development."

## 4. Complexity / Trade-offs

**Runtime complexity:** O(1) — it's toggling a single DOM element.

**Trade-offs worth mentioning:**

- **No animation on close.** The `animate-slide-up` class handles the open animation, but closing is instant. Adding exit animations with native `<dialog>` requires listening for the `close` event and delaying removal — more complexity than this component warrants right now.
- **No backdrop click-to-dismiss.** The native `<dialog>` backdrop is a pseudo-element, so you can't attach a click handler to it directly. You'd need a `click` handler on the `<dialog>` itself that checks if the click target is the dialog (not its children). This component relies on `Escape` for dismissal instead.
- **Browser support.** `<dialog>` and `showModal()` are supported in all modern browsers (Chrome 37+, Firefox 98+, Safari 15.4+). Not an issue for this project's audience.

## 5. Patterns Worth Knowing

**Imperative DOM bridge pattern.** React is declarative; some browser APIs are imperative. The `useRef` + `useEffect` combo is the standard way to bridge that gap. You'll see this same pattern with `<video>` (`.play()` / `.pause()`), `<canvas>` (`.getContext()`), and Web Animations API (`.animate()`).

**The `::backdrop` pseudo-element.** When you call `showModal()`, the browser creates a fullscreen backdrop behind the dialog. You can style it with `dialog::backdrop` in CSS — here it's `backdrop:bg-black/40` via Tailwind. This replaces the manual overlay `<div>` that older modal patterns required.

**Top layer.** `showModal()` places the dialog in the browser's top layer, which sits above all other stacking contexts. This means you never have to fight `z-index` wars. The top layer is a relatively recent browser concept and a good thing to know about.

## 6. Interview Questions

**Q: Why not just toggle a CSS class or use conditional rendering instead of `showModal()`?**
A: Conditional rendering (`{open && <div>...}`) gives you visibility, but you'd need to manually implement focus trapping, `Escape` handling, scroll locking, and stacking order. `showModal()` gives you all of that from the browser. It's less code and more accessible by default.

**Q: What happens if you call `showModal()` on a dialog that's already open?**
A: It throws an `InvalidStateError`. That's why the effect checks `!dialog.open` before calling it. In React 18+ strict mode, effects run twice in development, so this guard is load-bearing.

**Q: How does the parent component know the dialog was closed via Escape?**
A: The `<dialog>` element fires a native `close` event when dismissed by any means — `Escape`, `dialog.close()`, or form submission. The `onClose` prop is wired to that event, so the parent's state updates regardless of how the dialog was closed.

**Q: How would you add backdrop-click dismissal?**
A: Attach an `onClick` to the `<dialog>` element. When you click the backdrop, `event.target` is the dialog itself. When you click content inside, `event.target` is a child element. So: `if (e.target === dialogRef.current) onClose()`.

## 7. Data Structures

Minimal here. The props interface is the only structure:

```typescript
interface BottomSheetProps {
  open: boolean;       // controlled toggle — parent owns the state
  onClose: () => void; // sync callback for Escape / programmatic close
  children: ReactNode; // sheet content
}
```

No internal state. The component is fully controlled — the parent decides when it opens and closes. The `useRef` holds a mutable reference to the DOM node but isn't "state" in the React sense (changing it doesn't trigger re-renders).

## 8. Impress the Interviewer

If you're asked about this in an interview, the thing that separates a good answer from a great one is understanding *why* the native `<dialog>` element exists and what problems it solved.

Before `<dialog>`, every modal library had to reimplement focus trapping (with edge cases around shadow DOM and iframes), scroll locking (with edge cases on iOS Safari), and stacking order (with `z-index` hacks). The `<dialog>` element and the top layer spec moved all of that into the browser. The fact that this component is 36 lines with zero dependencies and still gets focus trapping, `Escape` dismissal, and proper stacking — that's the payoff.

You can also mention that this pattern (imperative DOM bridge via `useRef` + `useEffect`) is one of the few legitimate uses for `useEffect` in modern React. The React team has been vocal about `useEffect` being overused for data fetching and state sync, but bridging to imperative browser APIs is exactly what it was designed for.
