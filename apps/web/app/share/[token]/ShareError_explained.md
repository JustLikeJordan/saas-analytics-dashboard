# ShareError.tsx — Error State Component

## Elevator Pitch

A server component that renders graceful error states when a shared insight link is invalid or expired. Two variants, one component — driven by a `variant` prop that indexes into a static config object. Mirrors the visual language of the invite page's error states for consistency.

In an interview: "It's a variant-driven error component — a single component handles multiple error cases through a lookup table rather than conditional branching."

## Why This Approach

Could have made two separate components (`ShareNotFound` and `ShareExpired`), but they're identical in structure — just different copy. A variant prop with a config object is less code, less testing surface, and trivially extensible if a third error type appears.

This is a Server Component (no `'use client'`) because it's pure static HTML. No state, no effects, no event handlers. The `<Link>` component from Next.js works in server components.

## Code Walkthrough

**`VARIANTS` config (lines 3-12):** A `const` assertion object mapping variant names to `{ title, message }` pairs. The `as const` makes TypeScript infer literal types, so `keyof typeof VARIANTS` resolves to `'not-found' | 'expired'` — no separate enum needed.

What's happening → How to say it: "I used a const assertion lookup table instead of conditionals, which gives me type-safe variant handling with zero runtime branching."

**`ShareError` component (lines 14-26):** Destructures the variant config, renders a centered card with title, description, and a homepage link. The card styling (`max-w-sm`, `rounded-lg`, `shadow-sm`) matches the invite page's error state exactly.

## Complexity / Trade-offs

- **O(1) everything.** Object lookup, static render, no computation.
- **Trade-off: Variant config vs. separate components.** Config is less code but slightly less discoverable. If the error states diverged significantly (one needs a form, one needs an image), you'd split them.

## Patterns Worth Knowing

- **Const assertion for variant configs** — `as const` + `keyof typeof` gives you a type-safe enum without actually declaring one. Common in React component libraries.
- **Server Component for static error UI** — No reason to ship JS to the browser for a page that just shows text and a link.

## Interview Questions

**Q1: Why `as const` instead of a TypeScript enum?**
Enums add runtime code. A const assertion is purely a type-level construct — it disappears at compile time. You get the same exhaustive type checking with zero bundle cost.

**Q2: When would you split this into separate components?**
When the variants diverge structurally — if one needs interactive elements (a retry button, a form) and the other doesn't. Right now they're identical layouts with different copy, so one component is the right call.

**Q3: Why is this a Server Component?**
It renders static HTML with no interactivity. Shipping a client-side JavaScript bundle for text and a link would be waste. The Next.js `<Link>` component works in server components, so navigation is handled.

## Data Structures & Algorithms

- **Variant map:** `Record<'not-found' | 'expired', { title: string, message: string }>` — O(1) property access.

## Impress the Interviewer

The variant pattern here is the same idea behind component libraries like Radix or shadcn/ui — a single component with a `variant` prop that controls rendering. The difference is scale: they use `cva()` for style variants, we use a lookup table for content variants. Same principle, different axis. Worth mentioning if the interviewer asks about design system patterns.
