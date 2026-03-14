# UpgradeCta.tsx — Interview-Ready Documentation

## 1. Elevator Pitch

A shared React component for the "Upgrade to Pro" call-to-action, with two visual variants: `overlay` (centered card floating over blurred content) and `inline` (full-width banner with left accent). Uses `aria-disabled` instead of HTML `disabled` so click handlers still fire — pre-Epic 5, clicks track upgrade intent without navigating anywhere. WCAG touch targets (44x44px minimum) via Tailwind's `min-h-11 min-w-11`.

**How to say it in an interview:** "The upgrade CTA is a shared component used wherever we show paywall boundaries. It has overlay and inline variants. I used `aria-disabled` instead of HTML `disabled` so the button still fires click events for analytics tracking, even before the billing system exists."

## 2. Why This Approach

**Two variants, one component.** The overlay variant sits on top of blurred AI summary content — small, centered, floating. The inline variant will be used on settings pages and feature gates — full-width, with the project's left-accent border pattern. Same copy, same button, different container styling. One component means one place to update the CTA copy and one place to wire up the actual upgrade flow in Epic 5.

**`aria-disabled` over HTML `disabled`.** HTML `disabled` prevents the click event from firing at all. Since Epic 5 (billing) doesn't exist yet, the button can't navigate anywhere — but we still want to track that users are trying to upgrade. `aria-disabled` communicates the disabled state to assistive technology while letting the click handler fire. When Epic 5 lands, you swap `aria-disabled` for actual navigation logic.

**How to say it in an interview:** "I chose `aria-disabled` because we're in a pre-billing state — the button can't do anything yet, but we want to track intent. HTML `disabled` would swallow the click entirely. `aria-disabled` tells screen readers it's disabled while keeping the handler active."

**44x44px WCAG touch targets.** `min-h-11` and `min-w-11` (44px in Tailwind's default scale) meet WCAG 2.2 SC 2.5.8. Small buttons are a common accessibility failure — the minimum size prevents frustration on touch devices.

## 3. Code Walkthrough

### Props (lines 5-10)

`variant` controls layout. `onUpgrade` is the click handler (no-op pre-Epic 5, will navigate to billing later). `disabled` and `disabledTooltip` are optional — when both are set, the tooltip text appears as both a `title` attribute (hover) and a visible `<p>` linked via `aria-describedby`.

### Container (lines 17-21)

`cn()` (clsx + twMerge) conditionally applies variant-specific classes. Overlay gets `mx-auto max-w-sm` for a compact centered card. Inline gets `border border-border border-l-4 border-l-primary w-full` — the project's standard accent-border pattern. The class ordering matters: `border border-border` first sets the base, then `border-l-4 border-l-primary` overrides the left side. Reversing the order causes Tailwind's class merging to drop the accent.

### Button (lines 29-44)

`aria-label` gives screen readers the full context ("Upgrade to Pro subscription") even though the visible text is just "Upgrade to Pro." The `aria-describedby` links to the tooltip paragraph when disabled, so screen readers announce both the label and the reason it's disabled.

### Tooltip paragraph (lines 45-49)

Only renders when both `disabled` and `disabledTooltip` are truthy. The `id="upgrade-tooltip"` matches the button's `aria-describedby`. Currently shows "Pro plan coming soon" — a temporary message until Epic 5 billing is implemented.

## 4. Complexity and Trade-offs

**Single `id` for tooltip.** If two UpgradeCta instances render on the same page, both disabled tooltips would have `id="upgrade-tooltip"` — a DOM validity issue. For Story 3.5, only one instance renders at a time (overlay in the AI summary card). If the component gets reused in multiple visible locations, the id should be made unique (e.g., `useId()` hook).

**`aria-disabled` doesn't prevent form submission.** If this button were in a form, `aria-disabled` wouldn't stop the submit. Since it's a standalone `type="button"`, that's not a concern. Worth noting if the component moves contexts.

**How to say it in an interview:** "There's a known limitation — the tooltip id isn't unique across instances. It works now because only one renders at a time. If we reuse the component on a page with multiple instances, I'd switch to React's `useId()` for unique ids."

## 5. Patterns Worth Knowing

**`aria-disabled` vs HTML `disabled` for progressive feature rollout.** When building toward a feature that doesn't exist yet, `aria-disabled` lets you ship the UI shell while still collecting interaction data. Once the feature ships, you remove the disabled state entirely.

**How to say it in an interview:** "`aria-disabled` is my go-to for features that are coming soon. It communicates the disabled state accessibly while letting click handlers fire for analytics. It's a clean pattern for progressive feature rollout."

**Tailwind class ordering with `cn()`.** `cn()` uses `twMerge` under the hood, which resolves conflicting Tailwind utilities by keeping the last one. `border border-border border-l-4 border-l-primary` works because the `border-l-*` variants come after the base `border`. Swap the order and `twMerge` might drop the specific overrides.

## 6. Interview Questions

**Q: Why `aria-disabled` instead of HTML `disabled`?**
A: HTML `disabled` prevents click events entirely. We need clicks to fire for analytics tracking (upgrade intent), even though the button can't navigate to billing yet. `aria-disabled` tells assistive technology the button is non-functional while preserving the click handler.
*Red flag:* "Just use disabled and add a separate click tracker." HTML disabled swallows all pointer events.

**Q: How do you handle the disabled state visually?**
A: `opacity-60` dims the button and `cursor-not-allowed` changes the cursor. The conditional class is applied via `cn()` — when not disabled, the button gets `hover:bg-primary/90` instead.

**Q: What's the 44px minimum for?**
A: WCAG 2.2 SC 2.5.8 requires interactive elements to be at least 44x44 CSS pixels. Tailwind's `min-h-11 min-w-11` (11 * 4px = 44px) satisfies this. It's a touch-target size requirement — smaller buttons are hard to tap on mobile.

## 7. Data Structures

**Props:** `{ variant: 'overlay' | 'inline', onUpgrade: () => void, disabled?: boolean, disabledTooltip?: string }`. The variant is a discriminated string, not a boolean — `isOverlay` would lose meaning when a third variant arrives.

## 8. Impress the Interviewer

**The `aria-disabled` decision.** This is a nuanced accessibility choice that most candidates wouldn't consider. Explaining the difference between HTML `disabled` (suppresses events, removes from tab order) and `aria-disabled` (communicates state, preserves interaction) shows you understand ARIA beyond the basics.

**How to bring it up:** "I used `aria-disabled` instead of HTML `disabled` because we're in a pre-billing phase — the button needs to track intent clicks for product analytics while communicating its disabled state to screen readers. Once billing ships, the disabled state goes away entirely."

**Progressive feature rollout.** The CTA is fully wired — variant styles, accessibility, analytics hooks — but the actual upgrade flow is a no-op. This is intentional infrastructure for Epic 5. Mentioning this shows you build toward upcoming work without over-engineering the current story.
