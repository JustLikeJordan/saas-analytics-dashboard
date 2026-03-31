---
file: AdminOrgTable.tsx
purpose: Client component rendering the admin org list with shadcn Table
---

# Elevator Pitch

A presentational React component that takes an array of org data and renders a table. No state, no side effects, no data fetching — just props in, DOM out. Uses shadcn Table components for consistent styling with the rest of the app.

# Why This Approach

Separation between data fetching (RSC in `page.tsx`) and rendering (client component here). The server component fetches data and passes it as props. This component only needs `'use client'` because shadcn Table components use client-side features internally.

The `tierBadge` helper is a local function, not a separate component, because it's a simple conditional that returns a styled span. Extracting it into its own file would be premature abstraction for a 10-line function used exactly once.

# Code Walkthrough

**`tierBadge(tier)`** — Returns a colored pill: green-ish `bg-primary/10` for "Pro", grey `bg-muted` for everything else (including null). The `null` case maps to "Free" because any org without a subscription is on the free tier.

**`AdminOrgTable`** — Maps over `orgs` to render `TableRow` elements. Each row shows name, slug (monospace), member count, dataset count, tier badge, and creation date. The date uses `Intl.DateTimeFormat` with `dateStyle: 'medium'` for locale-aware formatting.

**Empty state** — When `orgs.length === 0`, a single row spans all 6 columns with "No organizations yet". This prevents the table from looking broken with just headers and no body.

**Tabular figures** — `fontFeatureSettings: '"tnum"'` on count cells ensures numbers align vertically. Without this, proportional digits make columns of numbers look misaligned.

# Patterns Worth Knowing

- **`Intl.DateTimeFormat`** — Browser-native date formatting. Locale-aware, no library needed. The `dateStyle: 'medium'` gives you something like "Jan 15, 2026" in English. In an interview, mention this over importing `date-fns` or `moment` — it's built in and zero-bundle-cost.
- **shadcn Table** — Thin wrappers around `<table>`, `<thead>`, `<tr>`, `<td>` with Tailwind classes. Not a data grid library — just styled HTML. You own the source code (it's in `components/ui/table.tsx`).
- **Tabular figures** — OpenType feature `tnum` forces fixed-width digits. Essential for any column of numbers in a table.

# Interview Questions

**Q: Why is this a client component when it has no interactivity?**
You: "shadcn Table components use `'use client'` internally. Any component importing them gets pulled into the client bundle. The data still comes from the server — the parent `page.tsx` is a server component that fetches and passes props down. This is the standard RSC pattern: server components own data, client components own rendering."

**Q: How would you add row click navigation to org detail?**
You: "Wrap each `TableRow` in a Next.js `Link` (or add an `onClick` with `router.push`). The row already has the `org.id`. For accessibility, you'd want the entire row to be keyboard-navigable, so a `Link` around the first cell or a button-styled row is better than an `onClick` on the `tr`."

# Impress the Interviewer

The empty state handling is a small detail that separates production code from demos. A table with headers but no rows looks broken. The `colSpan={6}` centered message is the minimum viable empty state — no illustration, no call-to-action, just a clear signal that there's no data yet. Mention this as "defensive UI" in an interview.
