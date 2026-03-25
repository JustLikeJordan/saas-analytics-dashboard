# stripeService.ts — Explained

## Elevator Pitch

This file is the thin wrapper between your application and Stripe's API. It handles two things: creating checkout sessions (so free users can upgrade to Pro) and creating billing portal sessions (so Pro users can manage their subscription). Everything Stripe-related in the app flows through here, keeping the rest of the codebase blissfully unaware of Stripe's SDK.

## Why This Approach

The big decision here is **lazy singleton initialization** for the Stripe client. Rather than creating the client at module load time (which would blow up if the env var is missing during test imports), the `getStripe()` function defers instantiation until first use. This is a common pattern in Node services that talk to external APIs — you want the module to be importable without side effects.

The alternative would be top-level instantiation (`const stripe = new Stripe(...)`) which works fine in production but makes testing painful. You'd need to mock the env before any import happens, and import ordering in test files becomes fragile.

Another choice worth noting: the function re-exports `getStripe` specifically so the webhook route can call `stripe.webhooks.constructEvent()` for signature verification. Rather than duplicating the Stripe client or passing it through dependency injection, re-exporting keeps a single source of truth.

## Code Walkthrough

**`getStripe()`** — The lazy singleton. First call creates the Stripe instance with `maxNetworkRetries: 2` (Stripe's SDK handles exponential backoff internally). Subsequent calls return the cached instance. The `_stripe` variable lives at module scope, so it persists for the lifetime of the process.

**`createCheckoutSession(orgId, userId)`** — This is the upgrade flow entry point. It first checks whether the org already has a Stripe customer ID (from a previous checkout attempt or subscription). If so, it passes `customer` to avoid creating a duplicate customer in Stripe. The spread of `customerParam` is a clean pattern — empty object means no `customer` key gets sent. Metadata carries `orgId` and `userId` as strings (Stripe metadata is always string-valued), which the webhook handler later reads to know which org to upgrade.

**`createPortalSession(stripeCustomerId)`** — Simpler. Pro users already have a customer ID, so this just opens Stripe's hosted portal where they can cancel, update payment methods, etc. The `return_url` sends them back to `/billing` when they're done.

Both functions catch Stripe SDK errors and wrap them in `ExternalServiceError`, which is the app's custom error class for third-party failures. This keeps error handling consistent across the API — the global error handler knows how to format these.

## Complexity / Trade-offs

**Gained:** A single place to change Stripe configuration, retry policy, or error handling. The rest of the app never imports `stripe` directly.

**Sacrificed:** The lazy singleton isn't truly testable without resetting module state. If you wanted proper DI, you'd pass the Stripe instance as a parameter. For a service this small, the trade-off is fine — you can reset `_stripe` in tests by importing and overwriting.

**Missing:** No idempotency keys on checkout creation. If a user double-clicks "Upgrade," they could get two checkout sessions. Stripe handles this gracefully (the second session just expires), but idempotency keys would be more correct.

## Patterns Worth Knowing

- **Lazy Singleton** — Defer expensive initialization until first use. In an interview, say "lazy initialization pattern" and mention it avoids side effects at import time.
- **Façade Pattern** — This file is a façade over Stripe's SDK. The rest of the app calls `createCheckoutSession()`, not `stripe.checkout.sessions.create()`. If you swapped payment providers, only this file changes.
- **Metadata Round-Trip** — Passing `orgId`/`userId` in Stripe metadata, then reading them back in the webhook. This is how you correlate async payment events with your own data model. Interviewers love hearing about this because it shows you understand async event-driven flows.

## Interview Questions

**Q: Why not instantiate the Stripe client at the top of the file?**
A: Module-level side effects make testing harder. If `STRIPE_SECRET_KEY` is missing, the import itself would throw. Lazy initialization lets you import the module in tests without needing every env var set. It also means the Stripe SDK's network stack isn't initialized until you actually need it.

**Q: What happens if `createCheckoutSession` is called twice for the same org simultaneously?**
A: Two checkout sessions get created. Stripe is fine with this — only the one the user completes will trigger a webhook. The other expires after 24 hours. For belt-and-suspenders, you'd add an idempotency key based on `orgId` + a short time window.

**Q: Why does this file re-export `getStripe`?**
A: The webhook route needs the Stripe instance for signature verification (`constructEvent`). Re-exporting avoids creating a second Stripe client or passing it through a DI container. Single source of truth.

**Q: How does `ExternalServiceError` differ from a generic `Error`?**
A: It carries the service name ("Stripe") and the original error. The global error handler can then return a 502 (bad gateway) instead of a 500, and structured logging captures which external service failed. This distinction matters for on-call debugging — "Stripe is down" vs "our code is broken" are very different incidents.

## Data Structures

```typescript
// Input to createCheckoutSession
orgId: number    // which org is upgrading
userId: number   // who initiated it (for audit trail)

// Return from createCheckoutSession
{ checkoutUrl: string }  // Stripe-hosted checkout page URL

// Return from createPortalSession
{ portalUrl: string }    // Stripe-hosted billing portal URL

// Stripe session.metadata (string-valued)
{ orgId: "42", userId: "7" }
```

The Stripe SDK types (`Stripe.Checkout.Session`, etc.) are imported from the `stripe` package — you don't define them yourself.

## Impress the Interviewer

Talk about the **metadata round-trip pattern**. When you create a checkout session, you embed your internal IDs in Stripe's metadata. Minutes or hours later, when the `checkout.session.completed` webhook fires, those same IDs come back to you. This is the standard way to correlate async payment events with your domain model without polling. It's the same pattern used by any system that hands off to a third party and needs to reconcile later — think OAuth state parameters or job queue correlation IDs. Mentioning this shows you understand event-driven architectures beyond basic request-response.
