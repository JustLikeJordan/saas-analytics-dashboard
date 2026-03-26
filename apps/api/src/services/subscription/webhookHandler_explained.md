# webhookHandler.ts — Explained

## Elevator Pitch

This is the nerve center for Stripe subscription events. When a customer upgrades, cancels, renews, or reactivates their plan, Stripe fires a webhook — and this handler translates those raw events into database state changes and analytics tracking. Two event types, two handler functions, one switch statement. It's the single source of truth for subscription lifecycle transitions.

**How to say it in an interview:** "This is an event-driven state machine for subscription lifecycle. Stripe webhooks arrive, we dispatch by event type, apply idempotent database mutations, and fire analytics. The handler is designed for at-least-once delivery — every operation is safe to replay."

## Why This Approach

Stripe's `customer.subscription.updated` event carries everything you need for cancellation, renewal, and reactivation — all in one event type. Rather than subscribing to a dozen specialized events (`customer.subscription.deleted`, `invoice.paid`, etc.), we handle one event and branch on its fields. This keeps the webhook surface area small and testable.

The handler delegates all persistence to query functions that are themselves idempotent. If Stripe retries a webhook (which it will — at least 3 times), calling the same handler twice produces the same database state. No event deduplication table needed.

We also hit a real-world Stripe SDK quirk here. The TypeScript types for Stripe SDK v20 moved `current_period_end` from `Subscription` to `SubscriptionItem`, but the webhook payload still includes it at the subscription root. The intersection type `SubscriptionWebhookPayload` bridges that gap without lying about the runtime shape.

## Code Walkthrough

**`handleWebhookEvent(event)`** — The entry point. Receives a verified `Stripe.Event` (verification already happened in the route). The switch dispatches based on `event.type` to one of two handlers. Unhandled events get logged at info level — not warn, because Stripe sends many event types you might not care about yet.

**`handleCheckoutCompleted(session)`** — The initial upgrade path. It:

1. **Extracts metadata** — Pulls `orgId` and `userId` from the session's metadata. These were embedded during `createCheckoutSession`. The `Number()` conversion is necessary because Stripe metadata is always strings.

2. **Normalizes Stripe's polymorphic fields** — `session.customer` and `session.subscription` can be either a string ID or an expanded object. The ternary handles both shapes.

3. **Validates required fields** — If anything is missing, logs an error and returns without throwing. Webhook handlers should almost never throw — a 500 would trigger Stripe retries for data that's genuinely malformed, creating an infinite retry loop.

4. **Upserts the subscription** — Sets `plan: 'pro'` and `status: 'active'` with `currentPeriodEnd: null`. The null is deliberate — the `subscription.updated` webhook fills in the period end moments later.

**`handleSubscriptionUpdated(subscription)`** — The lifecycle handler, added in Story 5.2. This is where cancellation, reactivation, and period renewal happen:

1. **Extract and validate** — `orgId` from subscription metadata. If missing, log and bail. No orgId means we can't update anything.

2. **Guard against `past_due`** — Payment failure is a different domain (Story 5.4). Early return.

3. **Always update period** — `updateSubscriptionPeriod` runs regardless of cancellation state. This keeps `currentPeriodEnd` fresh so `getActiveTier` can make correct access decisions.

4. **Branch on cancellation state:**
   - `cancel_at_period_end === true`: Mark as `canceled`, look up the org owner for analytics (webhooks don't carry userId), fire the `SUBSCRIPTION_CANCELLED` event. If the owner lookup fails, log a warning but don't fail — analytics is non-critical.
   - `status === 'active'` and not canceling: This is reactivation. Someone canceled then changed their mind. Flip back to `active`.

## Complexity and Trade-offs

**Idempotency without a dedup table**: `updateSubscriptionStatus` includes `WHERE status != $target`. Calling it twice with the same status is a database no-op. Simpler than maintaining a processed-events table, but you can't distinguish "already processed" from "first time" in logs.

**Our `canceled` diverges from Stripe's `canceled`**: Stripe doesn't set `status: 'canceled'` immediately when a user cancels. It sets `cancel_at_period_end: true` while status remains `active`. The actual Stripe status flip happens at period end. We write `canceled` to our database immediately, which means our status and Stripe's disagree for the remainder of the billing period. That's intentional — `getActiveTier` bridges the gap by checking whether `currentPeriodEnd` is still in the future.

**Type assertion on webhook payload**: The `as SubscriptionWebhookPayload` cast is unavoidable. Stripe's SDK types don't match the webhook payload shape for `current_period_end`. You could validate with Zod at runtime, but that's overhead for a field Stripe has shipped in webhook payloads since launch.

**Org owner lookup for analytics**: Webhooks don't carry `userId` — only `orgId` lives in subscription metadata. We look up the org owner to attribute the cancellation analytics event. If the lookup fails, we skip analytics rather than failing the webhook. Correct trade-off: analytics is observability, not business logic.

## Patterns Worth Knowing

**Event-driven state machine**: The subscription lifecycle (active → canceled → reactivated → active) is managed through webhook events rather than user-initiated API calls. The database is a projection of Stripe's state, not the source of truth. In an interview, you'd call this "event sourcing lite" — we don't store the events themselves, just apply their effects.

**Metadata as the join key**: Stripe subscriptions carry arbitrary `metadata`. We store `orgId` there during checkout, so the `subscription.updated` handler knows which org to update without a separate mapping table.

**Fire-and-forget analytics**: `trackEvent` doesn't block the webhook response. If analytics fails, subscription state is still correct.

**Graceful degradation at every level**: Missing metadata → log and return. Missing org owner → skip analytics. Past due → defer to future story. The handler never throws.

## Interview Questions

**Q: Why not use `customer.subscription.deleted` for cancellations?**
A: Stripe fires `deleted` only after the period actually ends. We want to mark the cancellation immediately (when the user clicks "cancel") so the UI can show "Your plan ends on [date]." The `updated` event with `cancel_at_period_end: true` gives us that signal in real time.

**Q: What happens if Stripe sends the same webhook twice?**
A: Nothing breaks. `updateSubscriptionPeriod` overwrites with the same date. `updateSubscriptionStatus` has a `WHERE status != $target` guard, so duplicate cancellations are no-ops. The analytics event fires twice, but that's acceptable — analytics pipelines are designed for at-least-once delivery.

**Q: How does a canceled subscription still grant access?**
A: `getActiveTier` checks both `status` and `currentPeriodEnd`. A canceled subscription with a future period end still returns `'pro'`. The user keeps access until their paid time runs out. This is the behavioral keystone of the subscription system.

**Q: Why store orgId in Stripe metadata instead of looking it up from the customer ID?**
A: A customer ID → org ID lookup would require a database read on every webhook. Metadata travels with the event payload, so we get the org ID for free. It also means the handler works even if our database is temporarily unreachable for reads — we only need write access.

**Q: Why is currentPeriodEnd null after checkout?**
A: The `checkout.session.completed` event doesn't carry period info reliably. Stripe fires `customer.subscription.updated` moments later with the authoritative period dates. Rather than guess, we leave it null and let the right event fill it in.

## Data Structures

```typescript
// Intersection type — bridges Stripe SDK v20 types and actual webhook payload
type SubscriptionWebhookPayload = Stripe.Subscription & {
  current_period_end: number; // Unix seconds, multiply by 1000 for JS Date
};

// Stripe.Checkout.Session (relevant fields)
{
  id: string;
  customer: string | Stripe.Customer | null;      // polymorphic
  subscription: string | Stripe.Subscription | null; // polymorphic
  metadata: { orgId: string; userId: string } | null;
}

// Analytics events
ANALYTICS_EVENTS.SUBSCRIPTION_UPGRADED   // fired on checkout completion
ANALYTICS_EVENTS.SUBSCRIPTION_CANCELLED  // fired on cancel_at_period_end: true
```

## Impress the Interviewer

The subtlety people miss: our `canceled` status means something different from Stripe's. In Stripe, `canceled` means the subscription has fully ended — period over, no access. In our system, `canceled` means the user has requested cancellation but may still have active access. This semantic gap is bridged entirely by `getActiveTier`'s period-aware query. If you drew the subscription state diagram on a whiteboard, you'd show two parallel state machines — Stripe's and ours — with `currentPeriodEnd` as the synchronization point.

The `past_due` guard is also worth mentioning. It's a single `if` statement and an early return, but it shows awareness of event modeling. Payment failures are a different domain with different business rules (retry logic, grace periods, dunning emails). Handling them in the same branch as voluntary cancellation would muddy both. The deferred Story 5.4 comment makes this intentional, not lazy.
