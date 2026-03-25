# BillingContent.tsx — Explained

## Elevator Pitch

This is the billing page's client component — the UI that shows a user their current plan and lets them either upgrade to Pro or manage an existing subscription. It talks to the BFF proxy (not Stripe directly), handles loading and error states, and redirects to Stripe-hosted pages for the actual payment flow. No sensitive data touches the browser.

## Why This Approach

The component delegates all payment operations to Stripe's hosted pages (Checkout for upgrades, Billing Portal for management). This is the **Stripe-hosted approach** vs the embedded approach (Stripe Elements). Hosted pages mean you don't handle card numbers, PCI compliance is Stripe's problem, and the UI is maintained by Stripe. The trade-off is less control over the look and feel, but for an MVP, that's a great deal.

All API calls go through `/api/subscriptions` — the Next.js BFF proxy route — not directly to the Express backend. This is the project's same-origin architecture: the browser never talks to port 3001. The BFF pattern means no CORS, and auth cookies flow naturally.

The component uses SWR for the subscription status fetch. SWR gives you caching, revalidation, and a clean `isLoading` state without writing any of that yourself. For the mutation calls (checkout, portal), it uses plain `fetch` with `useCallback` because these are one-shot actions that redirect away from the page — there's nothing to cache or revalidate.

## Code Walkthrough

**`fetcher`** — A minimal SWR fetcher. Checks `res.ok` and throws on non-2xx. SWR catches the throw and exposes it via its `error` property (not used here, but available).

**`useSWR('/api/subscriptions', fetcher)`** — Fetches the current subscription status on mount. Returns `data.data.tier` which is either `'free'` or `'pro'`. The double `.data` is because the API wraps responses in `{ data: T }` (API convention) and SWR wraps that in its own `{ data }`.

**`handleCheckout`** — POSTs to `/api/subscriptions?action=checkout`. On success, redirects the browser to Stripe's checkout page via `window.location.href`. This is a full-page redirect, not a client-side navigation — you're leaving the app entirely. The `useCallback` with an empty dependency array is correct here because none of the function's captured variables change.

**`handlePortal`** — Same pattern, different action. POSTs `?action=portal`, redirects to Stripe's billing portal.

**Error handling** — Both handlers try to extract a structured error message from the API response (`json.error?.message`). If the response isn't JSON or doesn't have the expected shape, a generic fallback message appears. The error state renders as a red banner between the plan card and the action button.

**Loading skeleton** — While SWR fetches the subscription status, a pulsing placeholder renders. This prevents layout shift and signals to the user that content is coming.

**Conditional rendering** — Free users see "Upgrade to Pro" (indigo button, prominent). Pro users see "Manage Subscription" (zinc/neutral button, less prominent). The visual hierarchy is intentional — upgrading is the primary action, managing is secondary.

## Complexity / Trade-offs

**Gained:** The component is about 100 lines and handles the entire billing page. No state management library, no context providers, no complex form handling. Stripe's hosted pages eliminate 90% of the complexity you'd normally associate with payments UI.

**Sacrificed:** Zero customization of the checkout or portal experience. You can't add a testimonial next to the payment form or show a comparison table on the checkout page. For an MVP targeting small business owners, the clean Stripe-hosted experience is probably better than a custom one anyway.

**UX gap:** After the user completes checkout on Stripe's page, they're redirected back to `/billing?session_id=...`. But the component doesn't use `session_id` for anything — no success toast, no confirmation message. The user just sees their plan is now "Pro" because SWR refetches. This works but isn't as satisfying as an explicit success state.

## Patterns Worth Knowing

- **BFF Proxy Pattern** — The browser calls `/api/subscriptions` (same origin), which proxies to the Express backend. No CORS, no exposed internal URLs, auth cookies pass through automatically. In interviews, call this "Backend for Frontend" and explain it eliminates an entire class of browser security issues.
- **Stale-While-Revalidate (SWR)** — The hook name is literal. It returns cached data immediately while revalidating in the background. For subscription status, this means the page loads instantly on repeat visits. Name-drop the HTTP `Cache-Control` header directive it's named after.
- **Redirect-Based Payment Flow** — Instead of embedding payment forms, you redirect to Stripe and they redirect back. This is the OAuth-style "out and back" pattern applied to payments. Mention it reduces PCI scope to SAQ-A (the easiest level).
- **Optimistic UI with Loading States** — The button text changes to "Redirecting..." during the API call. This is a micro-interaction that prevents double-clicks and communicates progress without a spinner component.

## Interview Questions

**Q: Why use `window.location.href` instead of Next.js `router.push` for the redirect?**
A: You're navigating to an external domain (checkout.stripe.com). `router.push` is for client-side navigation within your Next.js app. Setting `window.location.href` triggers a full-page navigation to Stripe's hosted page. When the user finishes, Stripe redirects back to your `success_url`, which is a full page load back into your app.

**Q: Why are the checkout and portal handlers wrapped in `useCallback`?**
A: They're passed as `onClick` handlers. Without `useCallback`, new function references would be created on every render, which could cause unnecessary re-renders of the button components. The empty dependency array is correct because these functions only use `setLoading` and `setError` (stable state setters) and `fetch` (global).

**Q: What's the double `.data` in `data?.data?.tier`?**
A: SWR wraps the fetch result in `{ data, error, isLoading }`. The API response itself uses `{ data: T }` as its standard envelope. So `data` is SWR's wrapper, `.data` is the API's wrapper, and `.tier` is the actual field. It reads awkwardly but both conventions are correct individually.

**Q: Why no `try-catch` around the SWR fetcher's error?**
A: SWR expects the fetcher to throw on errors — that's how it populates its `error` state. The throw in the fetcher (`throw new Error(...)`) is intentional, not a bug. SWR catches it internally.

**Q: How would you add a success message after checkout?**
A: Check for `session_id` in the URL search params on mount. If present, show a success toast and clear the param from the URL with `router.replace`. You'd use `useSearchParams()` from Next.js to read it.

## Data Structures

```typescript
// SWR response shape (GET /api/subscriptions)
{
  data: {
    tier: 'free' | 'pro';
    // potentially more fields in future
  }
}

// Checkout response (POST /api/subscriptions?action=checkout)
{
  data: {
    checkoutUrl: string;  // https://checkout.stripe.com/...
  }
}

// Portal response (POST /api/subscriptions?action=portal)
{
  data: {
    portalUrl: string;    // https://billing.stripe.com/...
  }
}

// Error response shape
{
  error: {
    code: string;
    message: string;
  }
}
```

## Impress the Interviewer

Point out the **PCI compliance implications** of this architecture. By redirecting to Stripe's hosted checkout instead of embedding Stripe Elements, the app qualifies for PCI SAQ-A — the simplest self-assessment questionnaire. Card numbers never touch your servers or even your frontend JavaScript. This isn't just a convenience choice; it's a security architecture decision that reduces your compliance surface from ~300 requirements to ~20. For a small SaaS product, that difference is the difference between "fill out a form" and "hire a security consultant." If you can articulate why an architectural choice reduces compliance burden, that's the kind of thinking that separates senior engineers from everyone else.
