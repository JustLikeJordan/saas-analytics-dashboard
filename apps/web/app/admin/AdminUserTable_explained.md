---
file: AdminUserTable.tsx
purpose: Client component rendering the admin user list with org membership pills
---

# Elevator Pitch

Renders platform users in a table with their org memberships displayed as inline pills. The interesting bit is the nested data shape — each user has an `orgs` array, and each org shows as a small badge with the role in parentheses. Platform admins get a ShieldCheck icon next to their name.

# Why This Approach

The `orgs` array is pre-grouped by the backend (`getAllUsers` query). This component doesn't need to do any data transformation — it just maps over what it receives. The pill-per-org pattern is compact and scannable: you can see at a glance which orgs a user belongs to and what role they hold.

# Code Walkthrough

**Name column** — Renders user name with an optional `ShieldCheck` icon. The icon has `aria-label="Platform admin"` for accessibility — screen readers announce it, and our tests query by it.

**Org membership pills** — Each org renders as an inline `<span>` with the org name and role. `flex-wrap` handles the case where a user belongs to many orgs — pills flow to the next line rather than overflowing. Users with no orgs get a "No org" text in muted style.

**Empty state** — Same pattern as AdminOrgTable: `colSpan={4}` row with "No users yet".

# Patterns Worth Knowing

- **`aria-label` on decorative-but-meaningful icons** — The ShieldCheck isn't decorative (it conveys admin status), so it needs a label. Pure decorative icons get `aria-hidden="true"` instead.
- **Inline badge pattern** — `inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs` is the standard Tailwind pill recipe. You'll see this everywhere in dashboards and admin UIs.

# Interview Questions

**Q: How would you handle a user with 20+ org memberships?**
You: "The flex-wrap handles rendering, but visually it would overwhelm the row. I'd cap at 3-4 visible pills with a '+N more' overflow indicator, expandable on click. Or switch to a tooltip/popover for the full list. The current implementation is fine for the expected scale (most users in 1-2 orgs)."

**Q: Why use `aria-label` instead of visually hidden text for the admin badge?**
You: "Both work for screen readers. `aria-label` on the SVG is more concise — no extra DOM nodes. The trade-off is that `aria-label` isn't visible when CSS fails to load, but for an icon badge that's acceptable."

# Impress the Interviewer

The "No org" state for users without memberships is a real scenario — a user who signed up via Google OAuth but hasn't been invited to any org yet. Handling this explicitly (rather than showing an empty cell) makes the admin's job easier: they can spot orphaned users at a glance.
