# webhookHandler.ts — Explained

## Elevator Pitch

This file processes Stripe webhook events after they've been verified. Right now it handles exactly one event type — `checkout.session.completed` — which upgrades an org from Free to Pro. It's deliberately narrow: a switch statement with one case and a default that logs and moves on. Future Stripe events (cancellations, renewals, payment failures) will slot into the same switch.

## Why This Approach

The handler is separated from the route for a clear reason: the route deals with HTTP concerns (signature verification, request/response), while this file deals with business logic (what does "checkout completed" mean for our data model?). This separation means you can test the business logic by passing in a mock `Stripe.Event` without spinning up an HTTP server.

The switch-on-event-type pattern is what Stripe themselves recommend. You could build an event registry or use a pub/sub system, but for a handful of event types, a switch statement is honest and readable. Over-engineering this into an event bus when you have one case would be premature abstraction.

One interesting choice: `currentPeriodEnd` is set to `null` with a comment that Story 5.2 will populate it via `subscription.updated`. This is intentional incompleteness — the checkout event doesn't carry period info reliably, so rather than guess, the code leaves it null and lets a future webhook fill it in.

## Code Walkthrough

**`handleWebhookEvent(event)`** — The entry point. Receives a verified `Stripe.Event` (verification already happened in the route). The switch dispatches based on `event.type`. Unhandled events get logged at info level — not warn, because Stripe sends many event types you might not care about yet.

**`handleCheckoutCompleted(session)`** — This is where the money is (literally). It does four things:

1. **Extracts metadata** — Pulls `orgId` and `userId` from the session's metadata. These are the same values that `createCheckoutSession` embedded earlier. The `Number()` conversion is necessary because Stripe metadata is always strings.

2. **Normalizes Stripe's polymorphic fields** — `session.customer` and `session.subscription` can be either a string ID or an expanded object, depending on your Stripe API version and expand settings. The ternary handles both shapes. This is a gotcha that trips people up in production.

3. **Validates required fields** — If anything is missing, it logs an error and returns without throwing. This is important: webhook handlers should almost never throw. Throwing would cause a 500 response, and Stripe would retry the webhook — but if the data is malformed, retrying won't help. You'd just get an infinite retry loop.

4. **Upserts the subscription** — Uses `upsertSubscription` so it works whether this is the org's first subscription or a re-subscription after cancellation. Sets `plan: 'pro'` and `status: 'active'`.

After the DB write, it fires an analytics event (`SUBSCRIPTION_UPGRADED`) and logs success. The `trackEvent` call is fire-and-forget — it doesn't await a response, so analytics failures don't break the payment flow.

## Complexity / Trade-offs

**Gained:** Clean separation of concerns. The webhook route is ~30 lines of HTTP plumbing, and this file is pure business logic. Testability is high — mock the DB queries and analytics, pass in a fake event, assert the upsert was called.

**Sacrificed:** Only one event type is handled. Cancellation, payment failure, and subscription renewal are all deferred to future stories. An org that cancels in Stripe won't have their status updated in the DB until Story 5.2 ships.

**Design tension:** The fail-silently-on-bad-data approach (early return instead of throw) means you could silently lose upgrade events if there's a bug in metadata propagation. The structured error log is your safety net — you'd need alerting on these log entries.

## Patterns Worth Knowing

- **Event Handler / Command Pattern** — Each event type maps to a handler function. In interviews, describe this as "dispatching commands based on event type." The switch is the dispatcher, each handler is a command.
- **Idempotent Upsert** — Using `upsertSubscription` instead of `insertSubscription` means processing the same webhook twice won't fail or create duplicates. Stripe guarantees at-least-once delivery, so idempotency isn't optional.
- **Metadata Round-Trip** — The `orgId`/`userId` embedded during checkout creation come back here. This closes the async loop. If an interviewer asks "how do you know which org just paid?", this is the answer.
- **Graceful Degradation** — Missing data logs an error and returns 200 to Stripe. No retry storm. This is the correct behavior for webhooks from third-party services.

## Interview Questions

**Q: Why return early instead of throwing when metadata is missing?**
A: If the handler throws, the route returns a 500, and Stripe retries the webhook. But if the data is genuinely malformed, retries will keep failing — you get an infinite retry loop that burns through your webhook quota and generates noise. Returning early with an error log lets you investigate manually while keeping Stripe happy.

**Q: Why is `currentPeriodEnd` set to null?**
A: The `checkout.session.completed` event doesn't reliably carry subscription period information. Stripe sends a separate `customer.subscription.updated` event with that data. Rather than extract incorrect dates, the code defers to the right event. This is an example of not guessing when you can wait for authoritative data.

**Q: What does "at-least-once delivery" mean for webhook design?**
A: Stripe may send the same event multiple times (network issues, timeouts, retries). Your handler must produce the same result regardless of how many times it runs. The `upsert` achieves this — writing `status: 'active', plan: 'pro'` twice is the same as writing it once. If you used an `INSERT`, the second call would fail with a unique constraint violation.

**Q: Why is `trackEvent` not awaited?**
A: Analytics is non-critical. If tracking fails, you still want the subscription upgrade to succeed. Fire-and-forget keeps the critical path short. In a larger system, you might push analytics to a queue, but the principle is the same — don't let observability failures break business logic.

## Data Structures

```typescript
// Stripe.Checkout.Session (relevant fields)
{
  id: string;
  customer: string | Stripe.Customer | null;      // polymorphic
  subscription: string | Stripe.Subscription | null; // polymorphic
  metadata: { orgId: string; userId: string } | null;
}

// upsertSubscription input
{
  orgId: number;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: 'active';
  plan: 'pro';
  currentPeriodEnd: null;
}

// Analytics event
ANALYTICS_EVENTS.SUBSCRIPTION_UPGRADED  // constant from shared package
{ stripeSessionId: string }             // event properties
```

## Impress the Interviewer

Bring up **Stripe's polymorphic field shapes**. Most candidates write webhook handlers that assume `session.customer` is a string. In production, depending on your API version and whether you've called `expand`, it might be a full `Customer` object. The ternary on line 22-23 handles both — and that kind of defensive normalization is what separates code that works in development from code that works at 3am when Stripe changes their default expand behavior. If you've dealt with this in production, say so. It's the kind of battle scar interviewers respect.
