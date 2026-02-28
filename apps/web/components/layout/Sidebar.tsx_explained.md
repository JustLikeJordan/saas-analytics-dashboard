# Sidebar.tsx — Interview-Ready Documentation

> Source file: `apps/web/components/layout/Sidebar.tsx` (128 lines)

---

## 1. 30-Second Elevator Pitch

Sidebar is a dual-mode navigation component: on desktop (lg: breakpoint), it's a static `<aside>` that's always visible. On mobile and tablet, it's a sheet overlay triggered by context state — a backdrop, a slide-in panel with `aria-modal="true"`, escape key dismissal, and body scroll lock. Both modes render the same `SidebarNav` extraction, which handles active link highlighting, org name display, and the close button (mobile only). Navigation auto-closes the mobile sheet via a `usePathname` effect.

**How to say it in an interview:** "Sidebar renders a permanent aside on desktop and a modal sheet overlay on mobile, sharing the same SidebarNav component. Context-based state drives the mobile open/close. Auto-close on navigation, escape key handling, and body scroll lock make the mobile overlay behave like a proper dialog."

---

## 2. Why This Approach?

### Decision 1: Dual render (static aside + modal overlay) instead of one animated sidebar

**What's happening:** Instead of one sidebar that slides in/out at all breakpoints, there are two separate DOM elements: a `hidden lg:flex` aside that's always rendered but CSS-hidden below lg:, and a conditionally rendered (`{open && ...}`) overlay for mobile. The desktop sidebar never mounts/unmounts or animates. The mobile overlay only exists in the DOM when open.

**How to say it in an interview:** "Two separate DOM elements instead of one animated sidebar. Desktop is a static aside — always rendered, no mounting cost, no animation overhead. Mobile is a conditional overlay — not in the DOM when closed, so it doesn't affect layout or accessibility tree. It's simpler than managing one element with breakpoint-dependent behavior."

**Over alternative:** A single sidebar with CSS transforms (translateX) would mean the mobile sidebar is always in the DOM even when offscreen. Screen readers would announce hidden nav links. You'd need `aria-hidden` toggling and `inert` to fix that. Two elements avoids the problem entirely.

### Decision 2: Context-based state management (useSidebar)

**What's happening:** The sidebar open/close state lives in `SidebarContext`, not in the Sidebar component itself. This is because the trigger (a hamburger button) lives in `AppHeader` — a sibling component, not a parent or child of Sidebar. Context lets both components access the same state without prop drilling through their shared ancestor.

**How to say it in an interview:** "The sidebar state lives in context because the trigger and the sidebar are siblings in the component tree. The hamburger button in AppHeader calls setOpen(true), the Sidebar reads open from the same context. Context is the lightest coordination mechanism for sibling components."

**Over alternative:** Lifting state to the shared parent and passing it down as props. Works, but means the layout component needs to know about sidebar state — a concern that belongs to the sidebar subsystem, not the page layout.

### Decision 3: Auto-close on navigation via usePathname

**What's happening:** A `useEffect` watches `pathname` from Next.js's `usePathname` hook. Every time the pathname changes (user clicks a link), `setOpen(false)` fires. This closes the mobile sheet after navigation without requiring each link's `onClick` to explicitly close the sidebar.

**How to say it in an interview:** "The pathname effect auto-closes the mobile sidebar after any navigation — not just clicks on sidebar links. If something else triggers a route change (a redirect, a programmatic push), the sidebar still closes. It's reactive rather than imperative."

**Over alternative:** Adding `onClick={() => setOpen(false)}` to every Link. Fragile — add a new link and forget the handler, the sidebar stays open. The `onNavigate` callback on SidebarNav links is there too (for immediate visual feedback), but the pathname effect is the safety net.

### Decision 4: Body scroll lock when open

**What's happening:** When the mobile overlay opens, `document.body.style.overflow = 'hidden'` prevents background scrolling. The cleanup function restores it. Without this, users could scroll the page behind the overlay — disorienting because the content moves while the overlay stays fixed.

**How to say it in an interview:** "Setting body overflow to hidden prevents background scroll while the overlay is open. The effect cleanup restores it on close or unmount. It's a basic scroll lock — no scroll position save/restore needed because the overlay doesn't affect the page's scroll position."

**Over alternative:** Using a library like `body-scroll-lock` that handles iOS Safari's quirks (rubber-banding, input focus scroll). The `overflow: hidden` approach works for most browsers but can have edge cases on iOS. Acceptable for MVP.

### Decision 5: Escape key handling in an effect

**What's happening:** When `open` is true, a `keydown` listener on `document` listens for Escape. This matches the expected behavior of modal dialogs (WAI-ARIA dialog pattern). The listener is added/removed in the effect cleanup, so it only exists while the overlay is visible.

**How to say it in an interview:** "Escape dismissal matches the WAI-ARIA dialog pattern. The keydown listener lives in an effect gated on the open state — added when the overlay mounts, removed on cleanup. No global listener hanging around when the sidebar is closed."

---

## 3. Code Walkthrough

### Imports (lines 1-8)

React hooks (`useEffect`, `useCallback`), Next.js navigation (`Link`, `usePathname`), Lucide icons for nav items and the close button, the `cn` utility for conditional classnames, and `useSidebar` from the dashboard's context.

### NAV_ITEMS constant (lines 10-14)

A `const` array (with `as const` for literal types) defining the three navigation items: Dashboard, Upload, Settings. Each has an `href`, `label`, and `icon` component. Declared outside the component to avoid re-creating the array on every render.

### SidebarNav (lines 16-71)

An extracted component that both the desktop aside and mobile overlay render. Takes `orgName` (optional) and `onNavigate` (optional callback, only passed in mobile mode).

**Header (lines 21-39):** A flex row with the app logo/name on the left. When `onNavigate` exists (mobile mode), a close button appears on the right — `lg:hidden` ensures it never shows on desktop even if `onNavigate` is somehow passed.

**Org name (lines 41-45):** If `orgName` is provided, a bordered section shows it with `truncate` to handle long names.

**Nav links (lines 47-68):** Maps over `NAV_ITEMS`. Active detection uses `pathname === href || pathname.startsWith(href + '/')` — matching exact and nested routes. Active links get a left border highlight (`border-l-4 border-primary bg-accent`), inactive links get a transparent border (same width, no layout shift). Each link calls `onNavigate` on click (closing the mobile sheet) and sets `aria-current="page"` when active.

### Sidebar (lines 73-127)

The main export. Reads `open` and `setOpen` from context, `pathname` from the router.

**close callback (line 76):** Memoized with `useCallback` to avoid re-creating the function on every render. Used as the backdrop click handler and escape key handler.

**Auto-close effect (lines 79-81):** Fires on pathname change. Calls `setOpen(false)`. Even if the sidebar is already closed, this is a no-op — React won't re-render for setting state to the same value.

**Escape and scroll lock effect (lines 84-98):** Only runs when `open` is true (early return on `!open`). Adds a keydown listener for Escape, sets body overflow to hidden. Cleanup removes the listener and restores overflow. The dependency array includes both `open` and `close` — `close` is stable thanks to `useCallback`, so it doesn't trigger unnecessary re-runs.

**Desktop aside (lines 103-105):** `hidden lg:flex` — invisible below 1024px, a 240px-wide flex column above. Renders `SidebarNav` without `onNavigate` (no close button needed).

**Mobile overlay (lines 108-124):** Only rendered when `open` is true. A `fixed inset-0 z-50` container holds the backdrop and the panel. The backdrop is a semi-transparent div with `onClick={close}` and `aria-hidden="true"` (it's decorative, not interactive content). The panel is an `<aside>` with `role="dialog"`, `aria-modal="true"`, and `aria-label="Navigation menu"`. It renders `SidebarNav` with `onNavigate={close}` for the close button and link click handling.

The `lg:hidden` on the overlay container ensures it never appears on desktop, even if `open` is somehow true.

---

## 4. Complexity and Trade-offs

**No focus trap.** A proper modal dialog should trap Tab focus inside the overlay — pressing Tab on the last focusable element should loop back to the first. This component doesn't implement focus trapping. In practice, the overlay covers the full viewport and body scroll is locked, so the visual experience is correct. But a keyboard user could Tab past the last sidebar link and into the hidden page content. Adding `@radix-ui/react-focus-trap` or a custom trap would fix this.

**No return focus.** When the sidebar closes, focus doesn't return to the hamburger button that opened it. WAI-ARIA dialog pattern says it should. This means a keyboard user who opens the sidebar, navigates, and closes it loses their focus position.

**CSS animation only.** The slide-in and fade-in use CSS animations (`animate-slide-in-left`, `animate-fade-in`) defined in the Tailwind config. No JS animation library. The exit animation is absent — when `open` becomes false, the overlay unmounts immediately. Adding an exit animation would require keeping the element mounted during the transition (e.g., with `AnimatePresence` from framer-motion or a CSS approach with `onTransitionEnd`).

**overflow: hidden on iOS.** Setting `document.body.style.overflow = 'hidden'` doesn't fully prevent scrolling on iOS Safari due to the rubber-band scrolling behavior. A more robust approach would use `-webkit-overflow-scrolling` or `touch-action: none` on the backdrop. For an MVP, the current approach works for most users.

**How to say it in an interview:** "Two gaps worth calling out: no focus trap and no return focus. Both are part of the WAI-ARIA dialog pattern. I'd add a focus trap library and store a ref to the trigger button for return focus. The overlay also lacks an exit animation — it unmounts immediately when closed. A production version would use AnimatePresence or similar for a smooth close."

---

## 5. Patterns Worth Knowing

### Dual-Mode Component (Responsive Rendering)

Instead of one component that behaves differently at different breakpoints, you render two separate DOM trees and let CSS visibility (`hidden lg:flex` / `lg:hidden`) control which one shows. This avoids JavaScript-based breakpoint detection and keeps each mode's logic simple and independent.

**Interview-ready:** "I render two separate DOM elements — a static aside for desktop, a modal overlay for mobile — and use CSS visibility to toggle. It's simpler than one component with breakpoint-dependent behavior, and each mode gets its own accessibility semantics."

### Context as Sibling Communication

When two components at the same level of the tree need to share state, context is the lightest solution. It doesn't require restructuring the component hierarchy or introducing a state management library. The provider wraps their shared ancestor, and both components call `useContext`.

**Interview-ready:** "The hamburger trigger and the sidebar are siblings. Context provides a shared state channel without prop drilling through their common parent. It's lighter than a state library and more appropriate than lifting state — the parent shouldn't need to know about sidebar state."

### SidebarNav Extraction (Shared UI, Different Contexts)

`SidebarNav` renders the same links and layout in both desktop and mobile modes. The `onNavigate` prop differentiates behavior: when present (mobile), clicking a link also closes the overlay. When absent (desktop), links just navigate. This avoids duplicating the nav markup while allowing mode-specific behavior through a single optional prop.

**Interview-ready:** "SidebarNav is extracted so both the desktop aside and mobile overlay render identical navigation without duplicating markup. The onNavigate prop gates mobile-specific behavior — close on click, show the X button. Desktop renders the same component without that prop."

### aria-modal Dialog Semantics

The mobile overlay uses `role="dialog"` and `aria-modal="true"`. This tells assistive technology that the content behind the dialog is inert — screen readers shouldn't let users navigate to it. Combined with the backdrop click handler and escape key, this follows the WAI-ARIA dialog pattern (minus focus trapping, as noted in trade-offs).

**Interview-ready:** "aria-modal='true' tells assistive technology the background is inert while the overlay is open. Combined with escape dismissal and backdrop click, it follows the WAI-ARIA dialog pattern. Focus trapping is the missing piece I'd add next."

---

## 6. Potential Interview Questions

### Q1: "Why two separate DOM elements instead of one animated sidebar?"

**Context if you need it:** Tests whether you considered the single-element approach and had a reason to reject it.

**Strong answer:** "A single sidebar that slides in and out would be in the DOM at all breakpoints. On mobile, when it's offscreen, screen readers would still announce its links unless I added aria-hidden and inert toggling. Two elements avoids that — the mobile overlay doesn't exist in the DOM when closed, so it can't leak into the accessibility tree. The desktop aside is always visible at lg:, so it should always be in the tree."

**Red flag:** "CSS animations are easier with two elements." — The animation argument is irrelevant. The real reason is accessibility tree management.

### Q2: "What's missing from this component to be a fully accessible modal dialog?"

**Context if you need it:** The interviewer wants to know if you understand the WAI-ARIA dialog pattern.

**Strong answer:** "Two things. First, focus trapping — Tab should cycle within the dialog, not escape to the background. I'd add a focus trap using a library or a manual approach with first/last focusable element detection. Second, return focus — when the dialog closes, focus should return to the element that opened it (the hamburger button). I'd store a ref to the trigger and call focus() on close."

**Red flag:** "It has aria-modal, so it's accessible." — aria-modal is a hint to assistive technology, not an enforcement mechanism. Keyboard focus can still escape without a trap.

### Q3: "Why auto-close on pathname change instead of on link click?"

**Context if you need it:** Probes whether you understand the difference between imperative and reactive approaches.

**Strong answer:** "Pathname-based closing catches all navigation, not just clicks on sidebar links. A redirect, a programmatic router.push, or a link in the main content area would all change the pathname and close the sidebar. Click handlers on sidebar links would miss those cases. The pathname effect is a safety net — reactive to the actual navigation event, not the user action that triggered it."

**Red flag:** "It's the same thing." — It's not. Click handlers are imperative and specific to the sidebar's own links. The pathname effect is reactive to any navigation source.

### Q4: "Why useCallback for the close function?"

**Context if you need it:** Tests understanding of referential stability and effect dependencies.

**Strong answer:** "close is used as a dependency in the escape key effect and as an event handler on the backdrop. Without useCallback, a new function reference would be created every render, causing the escape key effect to re-run (remove listener, add listener) on every render cycle. useCallback ensures the function identity is stable as long as setOpen doesn't change — which it won't, since it's a state setter."

**Red flag:** "useCallback makes it faster." — useCallback doesn't make the function itself faster. It stabilizes the reference, which prevents unnecessary effect re-runs and child re-renders.

### Q5: "How would you add an exit animation to the mobile overlay?"

**Context if you need it:** Tests understanding of the mount/unmount animation problem in React.

**Strong answer:** "The overlay currently unmounts immediately when open becomes false. For an exit animation, the element needs to stay mounted during the transition. Three approaches: (1) framer-motion's AnimatePresence, which delays unmount until the exit animation completes. (2) A two-phase state — set a 'closing' state that triggers the CSS animation, then unmount on animationEnd. (3) Keep the overlay always mounted and use CSS transitions with opacity/transform, toggled by the open state. Option 1 is cleanest, option 3 is lightest."

---

## 7. Data Structures

### NAV_ITEMS (Static Configuration Array)

**What it is:** A readonly tuple of three objects, each with `href` (string), `label` (string), and `icon` (Lucide component). Declared at module scope with `as const` for narrowed types.

**Where it appears:** Mapped in `SidebarNav` to render the navigation links.

**Why this shape:** Keeps navigation config declarative and separate from rendering logic. Adding a nav item is a one-line change. The `as const` assertion gives TypeScript literal types for href values, which could enable type-safe routing checks.

**How to say it in an interview:** "NAV_ITEMS is a static config array with as-const for literal types. Navigation changes are one-line additions — the rendering logic doesn't change."

### SidebarState (Context Shape)

**What it is:** `{ open: boolean; setOpen: (open: boolean) => void }`. A boolean flag and its setter, shared via React context.

**Where it appears:** Created in `SidebarContext`, consumed by both `Sidebar` and `AppHeader` (the hamburger trigger).

**Why this shape:** Minimal — just the state and setter. No toggle function, no animation state, no breakpoint tracking. Derived values (like `close = () => setOpen(false)`) are computed in the consuming component. Keeping the context surface small means fewer reasons for consumers to re-render.

**How to say it in an interview:** "The context shape is intentionally minimal — a boolean and a setter. Consumers derive what they need (like a close callback). Keeping the context value small reduces re-renders in consumers that only care about one aspect."

---

## 8. Impress the Interviewer

### The Dual-Render Pattern Solves a Real Accessibility Problem

**What's happening:** A single sidebar that uses translateX to slide offscreen is still in the DOM. Screen readers traverse the full DOM tree, so they'd announce "Dashboard link, Upload link, Settings link" even when the sidebar is visually hidden. You'd need `aria-hidden="true"` and the `inert` attribute (still not fully supported) to fix it. The dual-render approach sidesteps this entirely — the mobile overlay doesn't exist in the DOM when closed.

**Why it matters:** This shows you think about the accessibility tree, not just the visual layout. Many candidates would build a single animated sidebar and never consider that offscreen elements are still announced.

**How to bring it up:** "I split into two DOM elements because a CSS-hidden sidebar is still in the accessibility tree. The mobile overlay conditionally renders, so when it's closed, those links don't exist for screen readers. The desktop aside is always visible at lg:, so it should always be discoverable."

### Auto-Close on Navigation Is Reactive, Not Imperative

**What's happening:** The `useEffect` watching `pathname` closes the sidebar on any navigation — not just sidebar link clicks. This catches programmatic navigation, redirects, and navigation from other parts of the UI. It's a subtle but meaningful distinction from attaching click handlers to each link.

**Why it matters:** Reactive patterns are more resilient than imperative ones. If someone adds a link somewhere else that navigates away, the sidebar still closes. You don't have to remember to wire up a handler. This demonstrates systems thinking.

**How to bring it up:** "I close the sidebar by reacting to pathname changes, not by attaching handlers to each link. It catches all navigation sources — programmatic pushes, redirects, links in other components. The sidebar doesn't need to know what triggered the navigation, just that it happened."

### The onNavigate Prop Is a Clean Seam Between Modes

**What's happening:** `SidebarNav` accepts an optional `onNavigate` callback. In mobile mode, `onNavigate={close}` wires up link clicks and the X button to close the overlay. In desktop mode, `onNavigate` is undefined — the close button hides via the `{onNavigate && ...}` conditional, and link clicks just navigate normally. One component, one prop, two behaviors.

**Why it matters:** This is a clean example of the "optional callback" pattern for conditional behavior. No mode prop, no boolean flag, no conditional logic inside SidebarNav. The presence or absence of the callback determines the behavior. It's the kind of API design detail that makes components composable.

**How to bring it up:** "SidebarNav doesn't know whether it's in a desktop aside or a mobile overlay. The optional onNavigate callback is the only seam — when present, it enables close-on-click and shows the X button. When absent, it's a plain navigation list. The component doesn't branch on a mode prop; the callback's presence IS the mode."
