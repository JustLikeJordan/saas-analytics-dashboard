# DashboardShell.tsx — Explained

## Elevator Pitch

This is the main dashboard container — the component that orchestrates charts, AI summaries, filters, sharing, and the demo mode banner into one cohesive page. It's a client component because it manages a lot of interactive state (filters, transparency panel, share actions), but it receives server-rendered initial data as props so the first paint is fast. The Story 5.4 addition is small but architecturally interesting: a tier downgrade detector that toasts the user when their subscription drops from Pro to free.

**How to say it in an interview:** "DashboardShell is the orchestration layer for the dashboard page. It composes about a dozen child components, manages filter state and SWR data fetching, and handles real-time subscription tier changes. The tier downgrade toast uses a ref-based previous value pattern to detect transitions without false positives on initial render."

## Why This Approach

The dashboard needs to react to subscription changes that happen outside the user's browser session — a failed payment, an expired subscription. Rather than polling a dedicated endpoint or building a WebSocket channel, we piggyback on SWR's `revalidateOnFocus` behavior. The `useSubscription` hook refetches the tier whenever the user refocuses the tab. If the backend now returns `'free'` where it used to return `'pro'`, the tier downgrade effect fires a toast.

This is intentionally passive. The user isn't making a subscription change in this tab — it happened asynchronously via Stripe webhooks. The toast tells them their access level changed without interrupting whatever they were doing.

## Code Walkthrough

The Story 5.4 change is a small addition to a large file. I'll focus on the new code and provide enough context on the surrounding architecture to make sense of it.

**Tier downgrade detection (lines 131-137):**

```typescript
const prevTierRef = useRef(tier);
useEffect(() => {
  if (prevTierRef.current === 'pro' && tier === 'free') {
    toast.warning("Your Pro subscription has ended. You're now on the free plan.");
  }
  prevTierRef.current = tier;
}, [tier]);
```

This is a "previous value" pattern. `useRef` holds the last known tier across renders without triggering re-renders itself. The effect fires whenever `tier` changes. It checks: was the previous value `'pro'` and the new value `'free'`? If so, toast. Then it updates the ref to the current value for next time.

The `useRef` approach matters here for two reasons:

1. **No false positive on mount** — When the component first renders, `prevTierRef.current` is whatever `tier` was at initialization. If the user loads the page as a free user, `prev === 'free'` and `tier === 'free'` — no toast. If they load as pro, `prev === 'pro'` and `tier === 'pro'` — no toast. You only get the toast when the value actually transitions.

2. **React StrictMode safe** — StrictMode double-invokes effects in development. With this pattern, the first invocation sets `prevTierRef.current = tier`, and the second sees `prev === tier` — no duplicate toast.

**Where the tier comes from:**

```typescript
const { tier } = useSubscription({ enabled: hasAuth, fallbackData: serverTier });
```

`useSubscription` is an SWR hook that fetches `/api/subscriptions`. It has `revalidateOnFocus: true`, meaning when a user switches back to this tab after their payment failed (and the webhook updated the DB), the hook refetches and returns the new tier. `getActiveTier` on the backend returns `'free'` for `past_due` or `expired` subscriptions.

**The toast itself:**

```typescript
import { toast } from 'sonner';
```

Sonner is shadcn/ui's recommended toast library. The `<Toaster>` provider lives in `app/layout.tsx` (added in this story). `toast.warning()` renders with an amber/yellow style via the `richColors` prop.

## Complexity and Trade-offs

**Passive propagation vs. push notification**: We're relying on SWR's revalidate-on-focus to detect tier changes. This means there's a delay — the user won't see the toast until they refocus the tab. For a payment failure that happened minutes or hours ago, that's fine. For real-time UX ("your payment just failed"), you'd want a WebSocket or Server-Sent Events channel. We chose the simpler path because payment failures are rare events, and the next time the user interacts with the app is the right moment to tell them.

**One-directional detection**: We only detect pro -> free, not free -> pro. That's deliberate. The upgrade path goes through a dedicated checkout flow with its own success UI. You don't need a dashboard toast for something the user just did intentionally.

**Large component surface area**: DashboardShell is ~340 lines with a lot of state. The tier detection is 7 lines in a 340-line component. In a strict decomposition, you might extract a `useTierDowngradeToast` hook. But a custom hook that fires a side effect and returns nothing is just indirection for the sake of it. The effect is co-located with the state it depends on, and that's the right call at this size.

## Patterns Worth Knowing

**Previous value via useRef**: This is React's idiomatic way to detect state transitions. `useState` for tracking previous values causes extra re-renders. `useRef` updates synchronously without triggering a render cycle. You'll see this pattern in animation libraries (detecting enter/exit), form libraries (detecting dirty state), and feature flag systems (detecting flag changes).

**SWR as a real-time proxy**: SWR's `revalidateOnFocus` turns a simple fetch hook into a near-real-time data source for infrequent changes. No WebSocket infrastructure, no polling interval. The tradeoff is latency — you get the update when the user comes back, not when it happens. For most SaaS dashboards, that's the right default.

**Server-rendered initial data + client-side revalidation**: `DashboardShell` receives `initialData` and `serverTier` from the server component. SWR uses these as `fallbackData`, so the first paint has real data — no loading spinner. Client-side revalidation then keeps it fresh. This is the standard Next.js App Router pattern for data that's fast to render but needs to stay current.

## Interview Questions

**Q: Why use `useRef` instead of `useState` for the previous tier?**
A: `useState` would cause an extra render on every tier change (one to update the previous state, one for the actual tier change). `useRef` updates synchronously within the effect without triggering a render cycle. Since we're only using the previous value for comparison — not for rendering — a ref is the right tool.

**Q: What happens if the user opens the dashboard for the first time as a free user?**
A: No toast. On first render, `prevTierRef.current` is `'free'` (the initial value from `useSubscription`), and `tier` is `'free'`. The condition `prev === 'pro' && tier === 'free'` is false. The toast only fires on an actual transition.

**Q: How does the tier change propagate from a Stripe webhook to this component?**
A: Four steps: (1) Stripe fires `invoice.payment_failed` or `customer.subscription.deleted`, (2) `webhookHandler.ts` calls `updateSubscriptionStatus` to mark the subscription as `past_due` or `expired`, (3) when the user refocuses their browser tab, SWR refetches `/api/subscriptions`, (4) `getActiveTier` returns `'free'` for non-active statuses, `useSubscription` updates, the effect detects the transition, toast fires.

**Q: Could you get duplicate toasts?**
A: No, because of how the ref works. After the first toast, `prevTierRef.current` is set to `'free'`. Subsequent SWR revalidations that still return `'free'` see `prev === 'free'` and `tier === 'free'` — condition is false. You'd only get another toast if the tier went back to `'pro'` and then back to `'free'` again (resubscribed then failed again).

## Data Structures

```typescript
// From useSubscription hook
type SubscriptionTier = 'free' | 'pro';

// The hook's return
{ tier: SubscriptionTier } // defaults to 'free' when not authenticated

// Toast API (sonner)
toast.warning(message: string) // amber/yellow style with richColors
toast.success(message: string) // green
toast.error(message: string)   // red
```

## Impress the Interviewer

The interesting architectural insight here is the propagation chain: Stripe webhook -> DB mutation -> SWR revalidation -> React state change -> toast. There are four system boundaries (Stripe -> our API, API -> database, database -> SWR fetch, SWR -> React state), and we didn't add any new infrastructure to bridge them. The webhook handler and the subscription query were already in place from previous stories. The SWR hook was already revalidating on focus. All this story needed was 7 lines to detect the transition and fire a toast.

That's the compounding benefit of good architecture — by Story 5.4, the "payment failure" feature is mostly about connecting existing pieces rather than building new ones. If someone asks "how would you estimate this feature," the honest answer is "it depends on what's already in place." In a greenfield app, this is a multi-day feature. In this codebase, it's an afternoon.
