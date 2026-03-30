# webhookHandler.ts — Explained

## Elevator Pitch

This is the nerve center for Stripe subscription events. When a customer upgrades, cancels, renews, fails a payment, or has their subscription fully terminated, Stripe fires a webhook — and this handler translates those raw events into database state changes and analytics tracking. Four event types, four handler functions, one switch statement. It's the single source of truth for subscription lifecycle transitions, including the unhappy paths (payment failures, expiration).

**How to say it in an interview:** "This is an event-driven state machine for subscription lifecycle. Stripe webhooks arrive, we dispatch by event type, apply idempotent database mutations, and fire analytics. The handler covers the full lifecycle — creation, cancellation, payment failure, and terminal expiration. Every operation is safe to replay because we designed for at-least-once delivery."

## Why This Approach

Stripe's webhook model sends different event types for different lifecycle moments, and the data shape varies between them. `customer.subscription.updated` carries the subscription object directly (with `metadata.orgId`). `invoice.payment_failed` carries an invoice, not a subscription — so you need a database lookup to find which org is affected. Rather than normalizing everything into one handler, we let each handler own its extraction logic and share the common mutation path (`updateSubscriptionStatus`).

The handler delegates all persistence to query functions that are themselves idempotent. `updateSubscriptionStatus` includes a `WHERE status != $target` guard, so if Stripe retries a webhook (which it will — at least 3 times), calling the same handler twice produces the same database state. No event deduplication table needed.

We also hit a real-world Stripe SDK quirk. The TypeScript types for Stripe SDK v20 moved `current_period_end` from `Subscription` to `SubscriptionItem`, but the webhook payload still includes it at the subscription root. The intersection type `SubscriptionWebhookPayload` bridges that gap. Similarly, `Stripe.Invoice` doesn't expose `subscription` as a property in v20's types, but the webhook payload absolutely includes it — hence `InvoiceWebhookPayload`.

## Code Walkthrough

**`handleWebhookEvent(event)`** — The entry point. Receives a verified `Stripe.Event` (verification already happened in the route middleware via `constructEvent`). The switch dispatches based on `event.type` to one of four handlers. Unhandled events get logged at info level — not warn, because Stripe sends many event types you might not care about yet.

**`handleCheckoutCompleted(session)`** — The initial upgrade path. Extracts `orgId` and `userId` from session metadata (always strings in Stripe, so `Number()` conversion is needed). Normalizes Stripe's polymorphic fields — `session.customer` can be a string ID or an expanded object. Validates required fields, and if anything is missing, logs error and returns without throwing. Webhook handlers should almost never throw — a 500 triggers Stripe retries for genuinely malformed data, creating an infinite retry loop. Upserts the subscription with `currentPeriodEnd: null` — the `subscription.updated` webhook fills that in moments later.

**`handleSubscriptionUpdated(subscription)`** — The lifecycle handler covering cancellation, reactivation, and payment failure status:

1. **Always update period** — `updateSubscriptionPeriod` runs first regardless of state. Keeps `currentPeriodEnd` fresh so `getActiveTier` makes correct access decisions.

2. **Branch on state:**
   - `cancel_at_period_end === true`: Mark as `canceled`, look up the org owner for analytics (webhooks don't carry userId), fire `SUBSCRIPTION_CANCELLED`.
   - `status === 'active'` and not canceling: Reactivation. Someone canceled then changed their mind.
   - `status === 'past_due'`: Stripe flagged a payment failure at the subscription level. Mirror it to our DB.

**`handleInvoicePaymentFailed(invoice)`** — The payment failure handler. This is the trickiest handler because the data shape differs:

1. **Extract subscription ID** — `invoice.subscription` can be a string, an expanded object, or null. The ternary chain handles all three.
2. **DB lookup** — Unlike subscription events, invoices don't carry `metadata.orgId`. We look up the subscription row by Stripe ID to find the org.
3. **Mark past_due** — Calls `updateSubscriptionStatus` without a period end argument. The period date doesn't change just because a payment failed.
4. **Analytics via org owner** — `analytics_events.userId` is NOT NULL, so we can't pass null. We look up the org owner as a proxy — same pattern as the cancellation handler.

**`handleSubscriptionDeleted(subscription)`** — The terminal state. Stripe fires this after all retry attempts are exhausted and the subscription is truly over. Marks the subscription as `expired`, which causes `getActiveTier` to return `'free'` immediately (no period-end grace). Fires `SUBSCRIPTION_EXPIRED` analytics via org owner lookup.

## Complexity and Trade-offs

**Idempotency without a dedup table**: `updateSubscriptionStatus` includes `WHERE status != $target`. Calling it twice with the same status is a database no-op. Simpler than maintaining a processed-events table, but you can't distinguish "already processed" from "first time" in logs.

**Our `canceled` diverges from Stripe's `canceled`**: Stripe doesn't set `status: 'canceled'` immediately when a user cancels. It sets `cancel_at_period_end: true` while status remains `active`. We write `canceled` immediately so the UI can show "Your plan ends on [date]." `getActiveTier` bridges the gap by checking whether `currentPeriodEnd` is still in the future.

**Two paths to `past_due`**: Both `subscription.updated` (with `status === 'past_due'`) and `invoice.payment_failed` can mark a subscription as past_due. This redundancy is intentional — Stripe doesn't guarantee event ordering. If the invoice event arrives first, the subscription event is a no-op (idempotent status write). If the subscription event arrives first, same thing. Belt and suspenders.

**Invoice vs. subscription data asymmetry**: `invoice.payment_failed` carries an invoice object with a subscription reference but no org metadata. `customer.subscription.deleted` carries a subscription object with org metadata directly. This means the payment failure handler needs a DB read that the deletion handler doesn't. You might be tempted to unify them, but the extraction logic is genuinely different.

**Type assertions on webhook payloads**: The `as SubscriptionWebhookPayload` and `as InvoiceWebhookPayload` casts are unavoidable. Stripe's SDK types don't match the webhook payload shapes. You could validate with Zod at runtime, but that's overhead for fields Stripe has shipped in webhook payloads since launch.

**Org owner lookup for analytics**: Webhooks don't carry `userId` — only `orgId` lives in subscription metadata (or is looked up from the subscription row). We attribute analytics to the org owner. If the lookup fails, we skip analytics rather than failing the webhook. Correct trade-off: analytics is observability, not business logic.

## Patterns Worth Knowing

**Event-driven state machine**: The subscription lifecycle (active -> canceled -> active, or active -> past_due -> expired) is managed through webhook events rather than user-initiated API calls. The database is a projection of Stripe's state, not the source of truth. In an interview, you'd call this "event sourcing lite" — we don't store the events themselves, just apply their effects.

**Graceful degradation at every level**: Missing metadata -> log and return. Missing subscription in DB -> skip. Missing org owner -> skip analytics. The handler never throws. This matters because webhook endpoints face the same pressures as public APIs — malformed data, retries, partial failures — but with no human on the other end to debug a 500.

**Data shape normalization**: Stripe's type system is polymorphic in confusing ways. The same field (`subscription`) can be a string ID, an expanded object, or null depending on the event type and your Stripe dashboard settings. Each handler normalizes its input before doing anything else.

**Belt-and-suspenders status updates**: Having two event types both write `past_due` is a deliberate reliability choice, not a code smell. Distributed systems should tolerate event reordering. The idempotent write guard makes this safe.

## Interview Questions

**Q: Why handle both `invoice.payment_failed` and `subscription.updated` with `past_due`?**
A: Stripe doesn't guarantee event ordering. The invoice event might arrive before the subscription event, or vice versa. By handling both, we're resilient to any delivery order. The idempotent `WHERE status != 'past_due'` guard means the second write is a no-op regardless of which came first.

**Q: Why does `handleInvoicePaymentFailed` need a DB lookup but `handleSubscriptionDeleted` doesn't?**
A: Different payload shapes. Invoice events carry an invoice object — no subscription metadata. The only identifier is the subscription ID, so you need a DB read to find the org. Subscription events carry the full subscription object with `metadata.orgId` baked in. The data model reflects Stripe's domain boundaries, not ours.

**Q: What happens if Stripe sends the same webhook twice?**
A: Nothing breaks. `updateSubscriptionStatus` has a `WHERE status != $target` guard, so duplicate writes are no-ops at the database level. Analytics events fire twice, but analytics pipelines are designed for at-least-once delivery.

**Q: How does `expired` differ from `canceled` in access control?**
A: `canceled` + future `currentPeriodEnd` = still has Pro access (grace period). `expired` = immediate revocation, no grace period check. `getActiveTier` returns `'free'` for `expired` regardless of dates. This matches Stripe's semantics — `deleted` means all retries failed and the subscription is terminal.

**Q: Why store orgId in Stripe metadata instead of looking it up from the customer ID?**
A: A customer ID -> org ID lookup would require a database read on every webhook that carries a subscription. Metadata travels with the event payload, so we get the org ID for free. It also means the handler works even if our database is temporarily unreachable for reads — we only need write access. The invoice handler is the exception, where metadata isn't available.

## Data Structures

```typescript
// Bridges Stripe SDK v20 types and actual webhook payload
type SubscriptionWebhookPayload = Stripe.Subscription & {
  current_period_end: number; // Unix seconds, multiply by 1000 for JS Date
};

// Invoice webhook payload — subscription field not typed in Stripe SDK v20
type InvoiceWebhookPayload = Stripe.Invoice & {
  subscription: string | { id: string } | null;
};

// Subscription status flow:
// 'active' -> 'canceled' (user requested, grace period)
// 'active' -> 'past_due' (payment failed, still retrying)
// 'past_due' -> 'expired' (all retries exhausted)
// 'canceled' -> 'active' (user reactivated before period ended)
// 'canceled' -> 'expired' (period ended without reactivation)

// Analytics events
ANALYTICS_EVENTS.SUBSCRIPTION_UPGRADED       // checkout completed
ANALYTICS_EVENTS.SUBSCRIPTION_CANCELLED      // cancel_at_period_end: true
ANALYTICS_EVENTS.SUBSCRIPTION_PAYMENT_FAILED // invoice.payment_failed
ANALYTICS_EVENTS.SUBSCRIPTION_EXPIRED        // subscription.deleted (terminal)
```

## Impress the Interviewer

The state machine here has two "unhappy paths" that look similar but behave differently. `canceled` means voluntary — the user chose to leave, and they keep access until their paid period ends. `past_due` means involuntary — a payment failed, Stripe is retrying, and the user loses Pro features immediately. `expired` is terminal — Stripe gave up on collection. Drawing this three-way distinction on a whiteboard shows you understand the business semantics behind the technical status field.

The `invoice.payment_failed` handler is also a good example of working around your own schema constraints. `analytics_events.userId` is NOT NULL (a decision made in Epic 1 to enforce attribution), but webhooks don't carry user context. The org owner lookup is the pragmatic answer — it's the best available proxy for "who should this event be attributed to." In an interview, this shows you can work within existing constraints rather than reaching for a schema migration every time something doesn't fit.

Finally, the dual-path `past_due` write (from both `invoice.payment_failed` and `subscription.updated`) is worth calling out as a distributed systems pattern. Stripe's webhook delivery is at-least-once with no ordering guarantees. Designing for event reordering — by making every write idempotent and covering the same state transition from multiple event sources — is exactly how you build reliable integrations with third-party systems.
