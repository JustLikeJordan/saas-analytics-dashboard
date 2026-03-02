# FilterBar.tsx — Interview-Ready Documentation

## 1. 30-Second Elevator Pitch

This file is the dashboard's filter toolbar — it lets users narrow down chart data by date range (via preset time windows like "Last 3 months") and expense category (e.g., "Payroll"). The filters are two accessible custom dropdown menus with active filter badges that you can dismiss individually, plus a "Reset filters" button. The whole bar sticks below the app header when you scroll.

**How to say it in an interview:** "This is a fully accessible filter toolbar built without a component library. It uses the WAI-ARIA listbox pattern for keyboard navigation, manages open/close state locally, and delegates filter state upward through a callback — the parent owns the filter values and the SWR cache key."

## 2. Why This Approach?

### Custom dropdowns instead of native `<select>`

**What's happening:** A native HTML `<select>` element would give you accessibility for free, but you can't style the dropdown menu, add icons to the trigger, or animate the open/close. Since the UX spec calls for styled dropdown menus with calendar/tag icons, chevron rotation, and active filter badges — none of which are possible with native selects — the file builds its own dropdown using buttons and lists.

**How to say it in an interview:** "We built custom listbox dropdowns to meet the UX requirements for styled triggers and animated menus, but implemented the full WAI-ARIA listbox pattern — `aria-haspopup`, `aria-expanded`, `role='listbox'`, `role='option'`, keyboard navigation with arrow keys, Escape to close — so screen readers get the same experience as a native select."

**Over alternative:** Native `<select>` (no styling control), or installing Radix UI (adds a dependency for two dropdowns — overkill when the component is self-contained).

### Preset date ranges instead of a date picker

**What's happening:** Instead of letting users pick arbitrary from/to dates with a calendar widget, the filter offers five presets: All time, Last month, Last 3 months, Last 6 months, Last year. This is a UX decision — the target users are small business owners who think in "last quarter" not "2025-09-15 to 2025-12-14." The `computeDateRange` function converts a preset string into actual ISO date strings that get sent as query params.

**How to say it in an interview:** "For MVP, we used date presets rather than a date picker because the user research showed our target persona thinks in relative time periods. The presets map to date ranges at call time, so 'Last 3 months' always means 'from 3 months ago to today' regardless of when you click it."

**Over alternative:** A full date picker component (more complex, requires a calendar UI, and user testing showed preset ranges cover 90%+ of use cases).

### Controlled filter state with parent ownership

**What's happening:** The FilterBar doesn't own its filter values — it receives them as a `filters` prop and calls `onFilterChange` when the user makes a selection. This is React's "controlled component" pattern, like how an `<input value={x} onChange={...} />` works. The parent (`DashboardShell`) holds the real filter state, converts it to URL params for the SWR cache key, and the data refetches automatically.

**How to say it in an interview:** "The FilterBar is a controlled component — the parent owns the source of truth for filter state and encodes it into the SWR cache key. When filters change, SWR detects a new key, fires a fresh request, and the charts update. This means filter state and data fetching are decoupled — the FilterBar doesn't know anything about how data is fetched."

**Over alternative:** Having FilterBar manage its own state and call an API directly (tight coupling, harder to test, and the filter state wouldn't be available to the parent for the SWR key).

### `null` as "no filter" instead of a sentinel string

**What's happening:** When no date filter is active, `filters.datePreset` is `null`, not `"all"` or `""`. This makes the "has any filters active?" check trivial: `filters.datePreset !== null || filters.category !== null`. The first option in each dropdown ("All time", "All categories") maps to `null` when selected. This avoids subtle bugs where you forget to check for the sentinel string somewhere.

**How to say it in an interview:** "We represent 'no filter' as null rather than a magic string, which makes the active-filter check a simple null check and prevents the category where someone forgets to handle the sentinel value."

## 3. Code Walkthrough

### Lines 7-20: Type definitions and presets

`FilterState` is the shape of all filter state — just two nullable strings. `DATE_PRESETS` is a readonly array of `{ label, value }` objects that defines the five available time windows. The `as const` assertion lets TypeScript narrow the types to literal strings, and `DatePresetValue` extracts the union type of all preset values.

### Lines 22-50: `computeDateRange`

This pure function converts a preset string like `"last-3-months"` into `{ from: "2025-12-02", to: "2026-03-02" }` — ISO date strings ready to send as URL params. The "last month" case is special: it returns the first and last day of the previous calendar month (not "30 days ago"), which matches how business owners think about monthly periods. All other presets compute a relative offset from today. Returns `null` for "all" (no date filtering).

The non-obvious part: JavaScript's `Date` constructor handles month overflow gracefully — `new Date(2026, -1, 1)` gives you December 1, 2025. This means `getMonth() - 3` works even in January/February without edge case handling.

### Lines 53-217: `FilterDropdown` (internal component)

The reusable accessible dropdown. Key mechanics:

- **Open/close state** (`open`) — toggled by click or Enter/Space, closed by Escape or outside click.
- **Focus index** (`focusIdx`) — tracks which option has visual focus. Arrow keys increment/decrement, Home/End jump to first/last. When the dropdown opens, focus starts at the currently selected option.
- **Outside click handler** (lines 77-87) — a `mousedown` listener on `document` that checks if the click target is inside the container ref. Added only when open, cleaned up on close.
- **Scroll into view** (lines 90-96) — when `focusIdx` changes, the focused list item scrolls into the visible area of the dropdown. This matters when the list is long enough to scroll (category dropdown with many categories).
- **Selection logic** (lines 109-116, 154-159) — selecting the first option (index 0) emits `null` to indicate "clear this filter." Any other option emits its value string.

### Lines 219-245: `FilterBadge`

A small pill that shows the active filter value with an X button to dismiss. The `animate-badge-in` class triggers a 100ms scale-in CSS animation (defined in globals.css). When `prefers-reduced-motion` is active, the animation class is omitted. The dismiss button has an aria-label like "Last 3 months filter active, press to remove" — long, but it tells a screen reader user exactly what the button does and what will happen.

### Lines 254-343: `FilterBar` (exported main component)

Orchestrates two `FilterDropdown` instances (date range and category), renders active filter badges conditionally, and shows a "Reset filters" ghost button when any filter is active. Uses the `role="toolbar"` landmark so screen readers announce it as a toolbar.

The sticky positioning (`sticky top-14`) pins it 56px from the top (matching the AppHeader height). The negative margins (`-mx-4` etc.) expand the background to full-width while the content stays within the page padding — a common pattern for sticky bars that need to "bleed" to the edges.

## 4. Complexity and Trade-offs

**Time complexity:** Everything is O(n) where n is the number of options (5 date presets + however many expense categories). Even with 50 categories, this is trivial. The keyboard navigation just increments/decrements an index — O(1) per keystroke.

**Space:** No real concerns. Each dropdown holds a `focusIdx` integer and an `open` boolean. The `containerRef` and `listRef` are just pointers to DOM nodes.

**What would break first:** If the category list grew to hundreds of items, the dropdown would need search/typeahead. The current approach renders all options in a scrollable list, which is fine up to ~50 but would feel sluggish past that. Adding a text input at the top of the dropdown that filters the options array would solve it.

**Filter state resets on page refresh.** The UX spec explicitly decided against putting filters in URL params for MVP. That means if you refresh the page, you're back to "All time" and "All categories." This is a known trade-off — adding URL state sync (via `useSearchParams` or similar) would be the obvious improvement.

**No debounce on filter changes.** Each selection fires an API request immediately. The backend query is fast enough (<100ms for 50k rows) that debouncing adds complexity without benefit. If the API were slower (e.g., hitting a real database aggregation), you'd want to debounce or use SWR's `keepPreviousData` option (which the DashboardShell already enables).

**How to say it in an interview:** "The main trade-off is simplicity versus feature completeness. Filters reset on refresh because we deliberately skipped URL state sync for MVP. The dropdown is a simple listbox — no search, no virtualization — which works at the scale we're targeting but would need enhancement for larger datasets."

## 5. Patterns and Concepts Worth Knowing

### WAI-ARIA Listbox Pattern

**What it is:** A standard way to make custom dropdown menus accessible to screen readers and keyboard users. Instead of just showing/hiding a `<div>`, you mark it with `role="listbox"` and each item with `role="option"`, and set `aria-selected` on the current selection. The trigger button gets `aria-haspopup="listbox"` and `aria-expanded` to tell screen readers whether the dropdown is open.

**Where it appears:** `FilterDropdown` — the button has `aria-haspopup="listbox"` and `aria-expanded`, the `<ul>` has `role="listbox"`, each `<li>` has `role="option"` with `aria-selected`.

**How to say it in an interview:** "I implemented the WAI-ARIA listbox pattern for the custom dropdowns — it gives screen readers the same semantics as a native select while allowing full visual customization."

### Controlled Component Pattern

**What it is:** A React pattern where a component doesn't manage its own value — instead, the parent passes the current value as a prop and provides a callback to update it. This means the parent is the single source of truth. It's like a puppet: the FilterBar shows whatever the parent tells it to show, and reports back when the user clicks something.

**Where it appears:** `FilterBar` receives `filters` (current state) and `onFilterChange` (update callback). It never calls `useState` for the filter values themselves.

**How to say it in an interview:** "FilterBar is a controlled component — the parent owns filter state and passes it down. This lets the parent derive the SWR cache key from filter state without any synchronization issues."

### Event Delegation for Outside Click

**What it is:** Instead of putting click handlers on every element *outside* the dropdown (which would be every element on the page), you put a single listener on `document` and check if the click target is inside your component. If it's not, close the dropdown. This is a common pattern for menus and popups.

**Where it appears:** Lines 77-87 in `FilterDropdown`. The `mousedown` listener is added when `open` becomes true and removed on cleanup.

**How to say it in an interview:** "The outside-click handler uses event delegation on `document` rather than tracking every possible click target. It checks containment using a ref, and the listener is only attached while the dropdown is open to avoid unnecessary event handling."

### Sticky Positioning with Bleed-Through Background

**What it is:** CSS `position: sticky` pins an element at a fixed offset from the viewport edge as you scroll. The FilterBar sticks at `top: 56px` (below the app header). The `backdrop-blur-sm` with `bg-background/95` creates a frosted-glass effect so scrolling content is visible but dimmed underneath.

**Where it appears:** The outer `<div>` of `FilterBar` — `sticky top-14 z-30` with negative margins to extend to full width.

**How to say it in an interview:** "The filter bar uses sticky positioning with a backdrop blur to stay pinned below the header on scroll, with negative margins to extend the background to full width while keeping content aligned with the page padding."

## 6. Potential Interview Questions

### Q1: "Why build a custom dropdown instead of using a component library like Radix UI?"

**Context if you need it:** Radix UI is a popular headless component library that provides accessible primitives like dropdowns, dialogs, and popovers. The interviewer is testing whether you considered alternatives.

**Strong answer:** "We needed exactly two dropdowns with specific styling — icons in the trigger, filter badges, chevron rotation. Installing Radix for just this felt like bringing a toolbox to hang a picture. The listbox pattern isn't that complex — the main work is keyboard navigation and ARIA attributes — and keeping it self-contained means no dependency to track or upgrade."

**Red flag answer:** "I didn't know about Radix" or "component libraries are always bad." Both miss the point — you should know your options and explain why you chose what you did.

### Q2: "What happens if the user selects a date range that excludes all data?"

**Context if you need it:** This tests edge case thinking. The API returns empty arrays when filters exclude everything.

**Strong answer:** "The DashboardShell checks for empty chart data when filters are active and shows a dedicated 'No data matches these filters' state with a reset button. This is separate from the 'no data at all' empty state that shows an upload CTA — the user needs to know the data exists but their filters are too narrow."

**Red flag answer:** "The charts would just be empty" — this suggests you haven't thought about the user experience of empty states.

### Q3: "How would you add a custom date range picker alongside the presets?"

**Strong answer:** "I'd add a 'Custom range' option to the DATE_PRESETS array that, when selected, renders two date inputs instead of closing the dropdown. The FilterState would grow a `customFrom` and `customTo` field, and `computeDateRange` would check for those before falling back to preset logic. The main risk is mobile usability — native date inputs vary by browser, so you might want a purpose-built calendar component for the custom case."

**Red flag answer:** "Just add two input fields" — misses the UX implications and the state management question.

### Q4: "What's the accessibility story here? Walk me through a screen reader user's experience."

**Strong answer:** "The whole bar is a `role='toolbar'` with an aria-label. Each dropdown trigger announces 'Filter by date range' and its expanded state. When open, arrow keys navigate options which are announced as 'option, selected' or just 'option.' Active filter badges have dismiss buttons with descriptive labels like 'Last 3 months filter active, press to remove.' The Reset button has 'Clear all filters' as its label. A screen reader user can operate the full filter flow without seeing the screen."

**Red flag answer:** "We added aria labels" — too vague, doesn't demonstrate understanding of the full keyboard/screen reader interaction flow.

### Q5: "Why does selecting the first option emit `null` instead of the option's value?"

**Strong answer:** "The first option in each dropdown represents 'no filter' — 'All time' or 'All categories.' Emitting `null` makes it trivial to check whether any filter is active: just `datePreset !== null || category !== null`. If we emitted `'all'`, every consumer would need to know that `'all'` means 'no filter' and handle it specially. Null is the universal 'nothing here' value — you can't accidentally treat it as a real filter."

**Red flag answer:** "That's just how it works" — doesn't explain the reasoning behind the design choice.

## 7. Data Structures & Algorithms Used

### Array as Option List

**What it is:** A plain JavaScript array where each element has a `label` (what the user sees) and `value` (what gets sent). Think of it like a menu at a restaurant — the label is the dish name, the value is the order number the kitchen uses.

**Where it appears:** `DATE_PRESETS` (lines 12-18) and `categoryOptions` (lines 265-268).

**Why this one:** Arrays preserve insertion order and support index-based access, both of which matter for keyboard navigation (ArrowDown increments the index, ArrowUp decrements it). A Map or object wouldn't give you natural ordering or O(1) index access.

**Complexity:** Looking up by index is O(1). Finding a match by value (`.find()`) is O(n), but with 5-50 items this is effectively instant.

**How to say it in an interview:** "The options are stored in an ordered array because keyboard navigation needs index-based access — ArrowDown/Up just increment/decrement the focus index, which is O(1) per keystroke."

### Integer Index as Focus Tracker

**What it is:** Instead of storing a reference to the focused DOM element or the focused option's value, the component tracks focus as a simple integer (`focusIdx`). Arrow keys do `+1` or `-1`, clamped to `[0, options.length - 1]`. The focused option is the one whose array index matches `focusIdx`.

**Where it appears:** `focusIdx` state in `FilterDropdown` (line 69), updated in `handleKeyDown`.

**Why this one:** An integer is the simplest possible state for sequential navigation. You don't need to look up which element is focused — just check `idx === focusIdx` during render. It also avoids holding DOM refs for every option.

**How to say it in an interview:** "Focus tracking uses a single integer index rather than DOM refs or option IDs. Arrow keys just increment/decrement the index, clamped to bounds — it's the minimum state needed for sequential keyboard navigation."

## 8. Impress the Interviewer

### Presets vs. Picker — a UX-Driven Technical Decision

**What's happening:** The decision to use preset time windows instead of a date picker isn't a technical limitation — it's a deliberate UX choice based on the target persona. Small business owners don't think in exact dates; they think in "last quarter" or "this year." The technical implementation is simpler too, but that's a side effect, not the reason.

**Why it matters:** This shows you make engineering decisions driven by user needs, not just technical convenience. The simplest code that serves the user is better than the most flexible code that confuses them.

**How to bring it up:** "We went with presets over a date picker based on user research — our target persona thinks in relative time periods, not exact dates. It also simplified the implementation, but the UX need drove the decision."

### The Null Semantics Pattern

**What's happening:** Using `null` to represent "no filter" instead of a sentinel string like `"all"` creates a clean semantic boundary. Code that checks whether filters are active never needs to know the specific sentinel value. This is a small decision that prevents an entire class of bugs where someone adds a new feature, checks `if (filters.category)`, and accidentally treats `"all"` as an active filter.

**Why it matters:** In production systems, sentinel value bugs are insidious because they pass type checks and look correct in code review. The code works fine until someone adds a downstream consumer that doesn't know about the magic string.

**How to bring it up:** "We deliberately chose null over a sentinel string for 'no filter' — it means any downstream code can just do a truthiness check without knowing our domain-specific magic values."

### Accessibility as Architecture, Not Afterthought

**What's happening:** The ARIA attributes and keyboard handlers aren't bolted on after the UI works — they're part of the component's core API. The `role="toolbar"` wrapping, `aria-haspopup` on triggers, full keyboard navigation (Enter, Space, ArrowDown/Up, Escape, Home, End), and descriptive badge dismiss labels all exist because they were designed in, not added later.

**Why it matters:** Accessibility retrofits are expensive and brittle. Building ARIA semantics into the component from the start means the DOM structure naturally supports assistive technology. It also means the keyboard navigation tests serve as regression tests for the mouse interaction flow — if arrow keys can select an option, the click handler is definitely wired up.

**How to bring it up:** "The accessibility isn't a layer on top — the component was designed around the WAI-ARIA listbox pattern from the start. The keyboard navigation tests actually give us confidence in the mouse flow too, since they exercise the same selection logic."
