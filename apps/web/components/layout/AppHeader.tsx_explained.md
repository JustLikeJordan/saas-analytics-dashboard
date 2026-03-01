# AppHeader.tsx — Interview-Ready Documentation

> Source file: `apps/web/components/layout/AppHeader.tsx` (49 lines)

---

## 1. 30-Second Elevator Pitch

AppHeader is the top navigation bar for the dashboard layout. It handles three jobs: a hamburger menu button that opens the sidebar on mobile (hidden on desktop where the sidebar is always visible), a brand mark that only appears on small screens (since the sidebar already shows branding on large screens), and an auth-conditional right side that renders either a user avatar or a sign-in link.

**How to say it in an interview:** "AppHeader is a responsive nav bar that adapts by viewport. On mobile, it shows a hamburger button and brand logo because the sidebar is hidden. On desktop, both disappear because the persistent sidebar handles navigation and branding. The right side conditionally renders a user avatar or login link based on an `isAuthenticated` prop."

---

## 2. Why This Approach?

### Decision 1: Consuming sidebar state via context, not prop callbacks

**What's happening:** The hamburger button calls `setOpen(true)` from a `useSidebar()` context hook. The header doesn't own sidebar state — it just pokes the context to say "open up." The sidebar component reads the same context and renders accordingly.

**How to say it in an interview:** "The header and sidebar coordinate through shared context rather than prop drilling. The header calls setOpen, the sidebar reads isOpen — neither component knows about the other's internals. Adding a third trigger (like a keyboard shortcut) wouldn't require touching either component."

**Over alternative:** Lifting state to the parent and passing callbacks down would couple the header to the sidebar through the parent's props interface. Every new sidebar trigger would mean another prop thread. Context decouples trigger from consumer.

### Decision 2: Duplicating brand mark on mobile instead of moving it

**What's happening:** The brand logo (BarChart3 icon + "Insight" text) appears inside the header with `lg:hidden`. On desktop, the sidebar has its own brand section. So the brand exists in two places, each conditionally visible at different breakpoints.

**How to say it in an interview:** "The brand mark lives in both the header and the sidebar, toggled by breakpoint. On mobile the sidebar is off-screen, so the header shows the brand. On desktop the sidebar is visible, so the header hides it. Duplication is intentional — CSS-only visibility is simpler than portaling a single element between containers."

**Over alternative:** You could use a React portal or a shared brand component that moves between DOM locations on resize. That's more "DRY" but adds JavaScript-driven layout logic for something CSS handles with one utility class.

### Decision 3: Auth as a prop, not fetched internally

**What's happening:** `isAuthenticated` comes in as a boolean prop. The header doesn't call any auth hook or check a session — it just renders conditionally. The parent component (or server component above it) owns the auth check.

**How to say it in an interview:** "Auth state is the parent's responsibility. The header is a presentational component that takes a boolean and renders accordingly. This makes it testable without mocking auth providers — pass true or false, assert the output."

**Over alternative:** Calling `useSession()` or similar inside the header would work but couples it to a specific auth implementation. A boolean prop is framework-agnostic and trivially testable.

---

## 3. Code Walkthrough

### Imports and interface (lines 1-9)

`'use client'` marks this as a client component — it needs event handlers (the button click) and context (useSidebar). Four Lucide icons are pulled in: `BarChart3` for the brand, `LogIn` and `User` for auth states, `Menu` for the hamburger. The props interface is just `{ isAuthenticated: boolean }`.

### Left side — hamburger + brand (lines 16-28)

The hamburger button has a 40x40px touch target (`h-10 w-10`) and disappears at `lg:` breakpoint via `lg:hidden`. The brand mark sits next to it, also `lg:hidden`, because on desktop the sidebar takes over branding duties.

### Spacer (line 30)

`<div className="hidden lg:block" />` is a flex spacer that only exists on desktop. It pushes the right-side content to the far edge when the left side is empty (since the hamburger and brand are both hidden at `lg:`). On mobile, `justify-between` on the parent already handles spacing.

### Right side — auth conditional (lines 32-46)

If authenticated, a circular avatar placeholder renders (32x32px muted circle with a User icon). If not, a Link to `/login` with a LogIn icon and "Sign in" text. The text has `hidden md:inline` — on very small screens you just see the icon, at `md:` the label appears.

---

## 4. Complexity and Trade-offs

**No real user data in the avatar.** The User icon is a static placeholder. A real avatar (initials, profile photo) would need user data threaded through, which this component doesn't have. Fine for now — the avatar slot is ready to swap when user profile data is available.

**Touch target is 40x40, not 48x48.** Apple's HIG recommends 44pt minimum, Google's Material recommends 48dp. The 40px (`h-10 w-10`) hamburger button is slightly undersized. The padding area around it provides some forgiveness, but a bump to `h-12 w-12` would be more accessible. Worth noting in a review.

**Brand duplication.** The brand text "Insight" is hardcoded in two places (here and the sidebar). A shared constant or component would prevent drift if the brand name changes. Low risk for now — the name isn't likely to change during MVP.

**How to say it in an interview:** "The main trade-off is simplicity over polish. The avatar is a placeholder, the touch target is slightly under guidelines, and the brand name is duplicated. All acceptable for an MVP, all easy to improve with a follow-up pass."

---

## 5. Patterns Worth Knowing

### Context as a Coordination Bus

Instead of threading callbacks through props, the header and sidebar share state via React context. The header writes (`setOpen`), the sidebar reads (`isOpen`). You can think of it like a pub/sub system scoped to a React subtree — publishers don't know about subscribers, they just update the shared state.

**Interview-ready:** "useSidebar is a context-based coordination pattern. The header triggers state changes, the sidebar reacts to them, and neither imports the other. It scales to multiple triggers without prop threading."

### Breakpoint-Driven Conditional Rendering (CSS, Not JS)

The hamburger and brand use Tailwind's `lg:hidden` instead of a JavaScript media query hook. No `useMediaQuery`, no `window.matchMedia` listener, no re-renders on resize. The DOM elements exist at all viewport sizes — CSS just toggles visibility.

**Interview-ready:** "I use CSS breakpoint utilities instead of JavaScript media queries for responsive visibility. The elements are always in the DOM, so there's no hydration mismatch between server and client. No resize listeners, no re-render on breakpoint changes."

### Progressive Disclosure on Small Screens

The sign-in link's label uses `hidden md:inline` — icon-only on small screens, icon + text on medium+. This keeps the header compact on phones without losing meaning (the LogIn icon is recognizable enough solo).

**Interview-ready:** "The sign-in label progressively discloses at the md: breakpoint. On small screens, the icon communicates enough. On wider screens, the text label reinforces it. No JavaScript involved — just responsive utility classes."

---

## 6. Potential Interview Questions

### Q1: "Why use context instead of passing an onToggle callback as a prop?"

**Context if you need it:** The interviewer is testing whether you understand the trade-offs between prop drilling and context.

**Strong answer:** "Context decouples the trigger from the consumer. The header doesn't need to know which component responds to setOpen — it could be a sidebar, a modal, or both. If I used a prop callback, the parent would have to wire header and sidebar together explicitly, and adding a new trigger (keyboard shortcut, swipe gesture) would mean more prop plumbing. Context gives me a coordination layer that scales."

**Red flag:** "I always use context to avoid prop drilling." — Context has costs (re-renders on every state change for all consumers). Using it for everything suggests you haven't thought about when props are actually better.

### Q2: "Why duplicate the brand mark in both the header and sidebar?"

**Context if you need it:** Tests whether you made a deliberate choice or just forgot to DRY it up.

**Strong answer:** "The brand appears in two different layout containers that are visible at different breakpoints. On mobile, the sidebar is off-screen, so the header needs its own brand. On desktop, the sidebar is persistent, so the header hides its copy. I could extract a shared Brand component, but the duplication is two lines of JSX — the abstraction would cost more in indirection than it saves in repetition."

**Red flag:** "I didn't realize it was duplicated." — Shows you weren't thinking about the responsive layout as a system.

### Q3: "The touch target is 40x40px. Is that accessible?"

**Context if you need it:** Probes whether you know platform accessibility guidelines for touch targets.

**Strong answer:** "It's slightly under WCAG 2.5.8's recommendation of 44x44 CSS pixels and under Material Design's 48dp guideline. The surrounding padding gives some extra hit area, but strictly speaking, I'd bump it to h-12 w-12 (48px) for better mobile accessibility. I'd also want to verify the target spacing — adjacent targets should have at least 8px between them."

**Red flag:** "40px is fine, most buttons are that size." — Dismisses an accessibility concern without referencing any standard.

### Q4: "Why is isAuthenticated a prop instead of reading from an auth context or hook?"

**Context if you need it:** Checks whether you understand component design philosophy — presentational vs. container.

**Strong answer:** "Keeping auth out of the header makes it a presentational component. It renders based on inputs, nothing else. Testing is trivial — render with true, assert avatar; render with false, assert login link. No auth provider mocking needed. The parent or server component does the session check and passes the boolean down. If I ever need to reuse this header in an unauthenticated layout, it works without changes."

**Red flag:** "I'll refactor it to use useSession later." — Moves in the wrong direction. Pulling external state into a presentational component makes it harder to test and reuse.

---

## 7. Data Structures

### AppHeaderProps

**What it is:** A single-field interface: `{ isAuthenticated: boolean }`. That's the component's entire data contract.

**Where it appears:** The function signature and the conditional rendering branch on line 33.

**Why this shape:** The header doesn't need user details, org info, or session tokens. It needs one bit of information — is there a logged-in user? A boolean is the simplest possible contract. If the avatar ever needs a name or photo URL, the interface grows to match, but not before.

**How to say it in an interview:** "The props interface is intentionally minimal. A boolean is all the header needs to decide between avatar and login link. Narrow interfaces keep components decoupled from the data layer above them."

### SidebarContext (consumed, not defined here)

**What it is:** A React context that exposes `{ isOpen, setOpen }` for sidebar visibility coordination. AppHeader only uses `setOpen` — it's a write-only consumer.

**Where it appears:** Line 12, via the `useSidebar()` hook.

**Why it matters:** The context is the glue between header and sidebar. AppHeader doesn't import Sidebar, doesn't know its API, doesn't care how it animates open. It calls `setOpen(true)` and moves on.

**How to say it in an interview:** "AppHeader is a write-only consumer of sidebar context. It calls setOpen but never reads isOpen. The principle of least privilege applied to component state — the header knows only what it needs to know."

---

## 8. Impress the Interviewer

### CSS-Only Responsive Layout Avoids Hydration Mismatches

**What's happening:** The hamburger button and brand mark use `lg:hidden` (Tailwind CSS) rather than a JavaScript media query. Both elements exist in the server-rendered HTML and the client-rendered DOM. CSS controls visibility, so there's no mismatch between what the server renders and what the client expects.

**Why it matters:** JavaScript-based responsive rendering (like checking `window.innerWidth` in a useEffect) creates hydration mismatches in SSR frameworks. The server doesn't have a window, so it guesses — often wrong. The client hydrates with a different result, causing a flash. CSS media queries don't have this problem because the DOM structure is identical on both sides.

**How to bring it up:** "I avoided JavaScript media queries for the responsive hamburger button because they cause hydration mismatches in Next.js. The server can't know the viewport width, so it would guess wrong. CSS breakpoint utilities keep the DOM identical between server and client — visibility is a style concern, not a render concern."

### Minimal Props Interface as a Design Signal

**What's happening:** The header takes one prop: a boolean. In a codebase where headers commonly accept user objects, navigation arrays, theme configs, and notification counts, this restraint is intentional. The header does three things, needs one piece of external data, and its props reflect that.

**Why it matters:** Narrow interfaces are a sign of clear component boundaries. An interviewer who sees `{ isAuthenticated: boolean }` knows immediately that this component doesn't do too much. It also signals that you push complexity to the right layer — auth checking happens above, user profile data will live in a different component when needed.

**How to bring it up:** "The props interface is a single boolean. I kept it minimal on purpose — the header's job is layout and navigation triggers, not data display. Auth checking happens in the parent. If the avatar needs user data later, I'd add it to the interface then, not speculatively."
