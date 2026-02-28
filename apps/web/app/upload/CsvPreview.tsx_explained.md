# CsvPreview.tsx — Interview-Ready Documentation

> Source file: `apps/web/app/upload/CsvPreview.tsx` (104 lines)

---

## 1. 30-Second Elevator Pitch

When a user uploads a CSV, they get a preview before committing. This component renders that preview: a table showing the first 5 rows, column type badges (date/number/text), a total row count, any validation warnings, and confirm/cancel actions. It's deliberately stateless — just a rendering function that takes data and callbacks. All the decision-making lives in its parent.

**How to say it in an interview:** "CsvPreview is a pure presentational component. It receives preview data and callbacks via props, renders a semantically accessible table with column type indicators, and delegates all state management to its parent. Stateless components like this are trivially testable because output is a pure function of props."

---

## 2. Why This Approach?

### Decision 1: Semantic HTML `<table>` instead of a component library

**What's happening:** Instead of reaching for a prebuilt Table component from shadcn/ui (which the project uses elsewhere), this is a raw HTML `<table>` with `<thead>`, `<tbody>`, `<caption>`, and `<th scope="col">`. The reason is control and accessibility. A native table gives screen readers structural information for free — users can navigate cell-by-cell with arrow keys, and the `<caption>` announces what the table represents. Component libraries sometimes wrap tables in divs or use CSS grid, which can break that screen reader navigation.

**How to say it in an interview:** "I used a native HTML table because assistive technology understands table semantics out of the box — caption, scope attributes, and cell navigation. A CSS-grid-based table component would need extra ARIA roles to replicate what the browser provides natively."

**Over alternative:** shadcn/ui's Table component adds styling abstractions but could interfere with the accessibility features we need. For a simple 5-row preview, the native element is the right tool.

### Decision 2: Stateless presentational component

**What's happening:** CsvPreview has zero `useState` or `useEffect` calls. It takes four props — the preview data, two callbacks, and a boolean — and returns JSX. Think of it like a receipt printer: you feed it data, it prints the receipt. It doesn't decide what to print or when.

**How to say it in an interview:** "This follows the container/presentational pattern. The parent component owns all state transitions — CsvPreview is a pure rendering function. This makes it trivially testable: pass props, assert output, no mocking needed."

**Over alternative:** Putting confirm/cancel logic inside CsvPreview would couple data fetching to rendering. If we later wanted to use this preview in a different context (like a dataset detail page), we'd have to rip out the wired-in logic.

### Decision 3: Lookup object for badge colors instead of a switch/if-chain

**What's happening:** The `typeBadgeColors` object maps column types to Tailwind class strings. When rendering each header's badge, it does a simple key lookup: `typeBadgeColors[columnTypes[header]]`. If the type doesn't match (shouldn't happen, but defensive), it falls back to `typeBadgeColors.text`.

**How to say it in an interview:** "I used a lookup object rather than conditional branching for the badge styles. It's O(1) per lookup, easy to extend with new types, and keeps the render function clean of branching logic."

**Over alternative:** A switch statement or ternary chain would work but gets messy as column types grow. The lookup object scales without adding nesting.

---

## 3. Code Walkthrough

### Type badge color map (lines 14-18)

A `Record<string, string>` mapping column types to Tailwind utility classes. Three variants: blue for dates, green for numbers, gray for text. Defined outside the component so it's allocated once, not on every render.

### The component function (lines 20-103)

Destructures four props. The function body is one `return` statement with conditional blocks — no intermediate variables, no logic, just JSX. That's the tell that this is a presentational component.

### Warnings block (lines 25-33)

Conditionally renders a yellow warning box if the parsed CSV had non-fatal issues (like skipped rows). Each warning gets its own `<li>`. The whole block disappears if the warnings array is empty — no empty box, no "0 warnings" label.

### The table (lines 35-71)

Three semantic parts:
- **`<caption>`** (line 37-39): "Preview of uploaded data — X rows detected." Uses `validRowCount.toLocaleString()` so "1234" becomes "1,234". Screen readers announce this before reading cell data, giving context.
- **`<thead>`** (lines 40-56): Each `<th>` has `scope="col"` (tells assistive tech "this header labels the column below it"). The header text is followed by a type badge — a small `<span>` with the column's inferred type.
- **`<tbody>`** (lines 58-69): Renders `sampleRows` (up to 5). Alternating row backgrounds via modulo: `rowIdx % 2 === 0` gets a subtle tint. Each cell uses `row[header] ?? ''` — the nullish coalescing handles any missing values without blowing up.

### Action buttons (lines 73-101)

Cancel is a text link (underlined, muted color), not a button — visually de-emphasized since it's the non-primary action. Confirm is a full button: "Upload {N} rows" in the default state, or a spinning Loader2 icon + "Uploading..." when `isConfirming` is true. Both are disabled during confirmation to prevent double-submits.

---

## 4. Complexity and Trade-offs

**Time complexity:** Rendering is O(h * r) where h = number of headers and r = number of sample rows. With a maximum of 5 rows and maybe 10-15 columns, this is bounded at ~75 cells. Basically nothing.

**Space complexity:** O(1) beyond the props — no internal state, no memoized values, no refs.

**What would break first:** Large column counts. If a CSV had 50+ columns, the table would overflow horizontally. The `overflow-x-auto` wrapper handles this with a scrollbar, but the UX gets rough. For a real analytics product with wide datasets, you'd want column virtualization or a "show first 8 columns" truncation.

**Known limitation:** The type badges use client-inferred types (date/number/text). These are best-effort guesses from sampling the first 5 rows. A column of IDs that happen to look numeric would get a "number" badge even if they're really identifiers. The badge is informational, not authoritative.

**How to say it in an interview:** "This component is designed for the happy path of small-to-medium CSVs. The bounded sample size (5 rows) keeps rendering trivial. For wide datasets, I'd add horizontal truncation with a column selector."

---

## 5. Patterns and Concepts Worth Knowing

### Presentational/Container Pattern

A way of splitting React components into two roles. "Container" components own state and logic. "Presentational" components just render props into JSX. CsvPreview is purely presentational — it doesn't know about API calls, file uploads, or state machines. It just knows how to draw a table.

**Interview-ready:** "CsvPreview follows the presentational component pattern — zero internal state, output is a pure function of props. This makes it reusable across contexts and testable without mocking."

### Nullish Coalescing for Safe Access

The `??` operator in `row[header] ?? ''` returns the left side if it's not `null`/`undefined`, otherwise the right side. Since `row` is a `Record<string, string>`, accessing a key that doesn't exist returns `undefined`. The `??` turns that into an empty string so the cell renders blank instead of crashing.

**Interview-ready:** "I used nullish coalescing for safe property access on the row records. TypeScript's Record type doesn't guarantee every key exists at runtime, so the fallback prevents rendering undefined as visible text."

### Accessible Table Markup

HTML tables have built-in accessibility when you use them correctly. `<caption>` announces what the table is about before a screen reader starts reading cells. `<th scope="col">` tells assistive tech "this header applies to everything below it in this column." Without `scope`, screen readers have to guess which header goes with which cell — and they don't always guess right.

**Interview-ready:** "I used native table semantics — caption, th with scope — because screen readers understand HTML table structure natively. ARIA table roles are a fallback for when you can't use real table elements, not a replacement."

---

## 6. Potential Interview Questions

### Q1: "Why not use a component library table here?"

**Context if you need it:** The interviewer wants to know if you considered the trade-off between convenience and control, and whether you understand when abstractions help vs. hurt.

**Strong answer:** "The preview table has specific accessibility requirements — caption, scoped headers, and simple cell navigation. A native HTML table gives all of that for free. Component library tables sometimes use CSS grid or flex under the hood, which breaks the implicit table semantics that screen readers rely on. For 5 rows of read-only data, the native element is simpler and more accessible."

**Red flag:** "I always use component libraries for tables." — Shows you're reaching for tools without evaluating fit.

### Q2: "What happens if columnTypes is missing a key for one of the headers?"

**Context if you need it:** This tests defensive coding awareness. The type badge renders conditionally based on `columnTypes[header]`.

**Strong answer:** "The conditional `columnTypes[header] &&` guards the badge — if the key is missing, no badge renders. And the fallback `?? typeBadgeColors.text` handles unknown type values. So worst case, you get a header with no badge or a gray badge. No crash, no broken layout."

**Red flag:** "That can't happen because TypeScript prevents it." — TypeScript types are erased at runtime. Record access can always return undefined.

### Q3: "How would you handle a CSV with 100 columns?"

**Context if you need it:** Tests whether you've thought about edge cases beyond the happy path.

**Strong answer:** "The overflow-x-auto wrapper adds a horizontal scrollbar, so it wouldn't break. But the UX would be poor — scrolling through 100 columns in a preview defeats the purpose. I'd truncate to the first 8-10 columns with a '+N more' indicator, or add a column selector dropdown."

**Red flag:** "The CSS handles it." — Technically true but misses the UX problem entirely.

### Q4: "Why is the cancel button a styled anchor-like element instead of a real button?"

**Context if you need it:** Tests your understanding of visual hierarchy and the distinction between semantic HTML and visual treatment.

**Strong answer:** "It's actually a `<button>` element styled to look like a text link — underlined, muted color. This gives it the visual weight of a secondary action while keeping correct semantics: buttons trigger actions, links navigate. Cancel discards the preview and resets state, which is an action, not navigation."

**Red flag:** "Links and buttons are interchangeable." — They have fundamentally different semantics and keyboard behaviors.

---

## 7. Data Structures & Algorithms Used

### Lookup Object (Hash Map)

**What it is:** `typeBadgeColors` is a plain JavaScript object used as a hash map — you give it a key (like `"date"`), and it gives you back the associated value (Tailwind classes). Under the hood, JavaScript engines optimize object property access to be nearly instant, regardless of how many properties there are.

**Where it appears:** `typeBadgeColors` at the module level, accessed during header rendering.

**Why this one:** Three color variants could be handled with `if/else` or a `switch`, but the lookup object is more concise and easier to extend. Adding a "currency" type later means adding one line to the object, not another branch.

**Complexity:** O(1) lookup time, O(k) space where k = number of column types (currently 3).

**How to say it in an interview:** "The badge color mapping uses a plain object as a hash map — constant-time lookup and trivially extensible compared to conditional branching."

### Array Iteration (map)

**What it is:** `.map()` transforms each element of an array into something new. Here it's used three times: mapping headers to `<th>` elements, mapping sample rows to `<tr>` elements, and mapping warnings to `<li>` elements.

**Where it appears:** The entire render output is built from `.map()` calls over the props data.

**Why this one:** React's rendering model expects arrays of JSX elements for repeated content. `.map()` is the idiomatic way to produce them. A `for` loop would work but you'd need to push into a temporary array — more ceremony for the same result.

**Complexity:** O(n) per map call, where n is the array length. All arrays here are small (5 rows, ~10 headers, few warnings).

**How to say it in an interview:** "The rendering uses declarative array mapping — standard React pattern for transforming data into element lists."

---

## 8. Impress the Interviewer

### Locale-Aware Number Formatting

**What's happening:** The row count uses `.toLocaleString()` so "1234" displays as "1,234" (or "1.234" in German locale, etc.). It's one method call, but it shows awareness that numbers need formatting for human consumption — especially when your target users are business owners glancing at dashboards, not developers parsing raw integers.

**Why it matters:** Unformatted numbers are a common "developer-built UI" tell. A business owner seeing "12847 rows detected" has to count digits mentally. "12,847" is instantly readable. It's a small thing that signals polish.

**How to bring it up:** "I used toLocaleString for the row count because business owners shouldn't have to count digits. It also respects the user's locale automatically — commas in the US, periods in Germany."

### Visual Hierarchy Through Styling, Not Layout

**What's happening:** The confirm button is visually prominent (primary color, solid background, medium font weight). The cancel action is deliberately subdued (muted text, underline, smaller). Both are equally accessible via keyboard, but the visual weight guides the user toward the expected path: confirm.

**Why it matters:** In UX design, the "happy path" should be visually obvious. Making destructive or abandoning actions equally prominent leads to accidental data loss. This is sometimes called the "asymmetric button" pattern.

**How to bring it up:** "I used visual hierarchy to guide the user — confirm is primary-styled, cancel is a subdued text link. Both are keyboard-accessible, but the visual weight matches the expected user flow. You don't want the 'throw away my data' button competing for attention with 'save it.'"
