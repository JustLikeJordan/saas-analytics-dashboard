# stripeWebhook.ts — Explained

## Elevator Pitch

This is the HTTP endpoint that receives webhook events from Stripe. It does exactly two things: verify the request is genuinely from Stripe (signature check), then hand off to the business logic handler. It's the thinnest possible route — 30 lines of security plumbing and delegation.

## Why This Approach

The most important design decision here is **raw body parsing**. Stripe's signature verification requires the exact bytes that arrived over the wire. If Express's JSON parser touches the body first, `constructEvent` will fail because the re-serialized JSON won't match the signature. That's why this route uses `express.raw({ type: 'application/json' })` as route-level middleware instead of relying on the app-wide JSON parser.

This is also why the Stripe webhook route must be mounted **before** the global `express.json()` middleware in the Express app. The middleware chain order (documented in CLAUDE.md) puts Stripe webhooks at position 2, before the JSON body parser at position 3. If you get this ordering wrong, every webhook will fail signature verification, and you'll spend hours debugging what looks like a Stripe configuration issue.

The alternative — parsing JSON globally and then trying to reconstruct the raw body — is fragile and error-prone. Stripe's own docs explicitly warn against it.

## Code Walkthrough

**Route setup** — A standalone `Router()` exported as `stripeWebhookRouter`. It's isolated from the main API router so it can have its own body parsing behavior.

**`express.raw({ type: 'application/json' })`** — Route-level middleware that captures the body as a `Buffer` instead of parsing it as JSON. The `type` filter ensures it only triggers for JSON content types. After this middleware, `req.body` is a raw `Buffer`.

**Signature check** — The `stripe-signature` header contains an HMAC that Stripe computed over the raw request body using your webhook secret. `constructEvent` recomputes the HMAC and compares. If they don't match — someone is sending fake events to your endpoint. The 400 response with `INVALID_SIGNATURE` tells the caller (but not too much about why).

**Missing signature guard** — Before even attempting verification, the handler checks if the header exists. Without this, `constructEvent` would throw a less informative error. Early return keeps things clean.

**Delegation** — If verification passes, the raw body has been parsed into a typed `Stripe.Event`. This gets passed to `handleWebhookEvent`, which contains the actual business logic. After handling, the route returns `{ received: true }` — Stripe's expected acknowledgment format.

**Async handler** — Express 5 automatically catches promise rejections from async route handlers, so there's no need for a try-catch around `handleWebhookEvent`. If it throws, the global error handler picks it up. The only explicit try-catch is around `constructEvent`, which is expected to throw on bad signatures.

## Complexity / Trade-offs

**Gained:** Rock-solid signature verification. This route can't be spoofed without knowing the webhook secret. The raw body approach is the only reliable way to do this with Stripe.

**Sacrificed:** The route has to live outside the normal middleware chain. Any developer adding middleware to the Express app needs to know about this ordering constraint, or they'll silently break payments. This is documented but still a maintenance burden.

**Missing:** No replay protection beyond what Stripe provides. Stripe includes a timestamp in the signature, and `constructEvent` checks it (default tolerance: 300 seconds). If you needed tighter replay protection, you'd store processed event IDs in Redis.

## Patterns Worth Knowing

- **Raw Body Middleware** — Using `express.raw()` at the route level while the rest of the app uses `express.json()`. This is the standard pattern for webhook endpoints that need signature verification. AWS SNS, GitHub webhooks, and Twilio all have similar requirements.
- **Middleware Chain Ordering** — Position in the middleware chain determines which middleware processes the request. This route must come before the JSON parser. In interviews, this demonstrates you understand Express's pipeline model.
- **Fail-Fast Validation** — Check for the header's existence before attempting verification. Two separate 400 responses with distinct error codes (`MISSING_SIGNATURE` vs `INVALID_SIGNATURE`) make debugging easier in production.
- **Separation of Concerns** — Route handles HTTP + security; handler handles business logic. You can test each independently.

## Interview Questions

**Q: Why does this route need raw body parsing instead of JSON parsing?**
A: Stripe computes an HMAC signature over the exact bytes of the request body. If Express's JSON parser deserializes and the handler re-serializes, whitespace or key ordering might change, producing a different byte sequence. The HMAC would fail to verify even though the payload is legitimate. Raw parsing preserves the original bytes.

**Q: What happens if this route is mounted after `express.json()` in the middleware chain?**
A: The JSON parser consumes the body stream and replaces `req.body` with a parsed JavaScript object. When `constructEvent` tries to verify the signature against this parsed object (now re-stringified), the bytes won't match. Every single webhook will return 400, and no payment events will be processed. It's a silent, total failure.

**Q: Why return `{ received: true }` instead of just a 200 status?**
A: Stripe's webhook delivery system expects a 2xx response to consider the delivery successful. The `{ received: true }` body is a convention from Stripe's documentation. Technically, an empty 200 would work, but the explicit body makes log inspection easier when debugging delivery issues.

**Q: How does Express 5 change error handling here?**
A: Express 5 natively catches rejected promises from async handlers and forwards them to the error middleware. In Express 4, you'd need `express-async-errors` or a wrapper function. That's why there's no try-catch around `handleWebhookEvent` — if it throws, the global `errorHandler` middleware catches it automatically.

## Data Structures

```typescript
// Request
req.headers['stripe-signature']: string  // Stripe-Signature header
req.body: Buffer                          // raw bytes (not parsed JSON)

// After constructEvent
event: Stripe.Event {
  id: string;          // evt_xxx
  type: string;        // e.g. 'checkout.session.completed'
  data: {
    object: unknown;   // varies by event type
  };
}

// Response (success)
{ received: true }

// Response (error)
{ error: { code: 'MISSING_SIGNATURE' | 'INVALID_SIGNATURE', message: string } }
```

## Impress the Interviewer

Talk about the **middleware ordering constraint** as a real-world production pitfall. Every team that integrates Stripe webhooks with Express hits this at some point. The symptom — all webhooks returning 400 — looks like a Stripe misconfiguration, but it's actually a middleware ordering bug on your side. Knowing this shows you've actually shipped payment integrations, not just read the docs. Bonus points if you mention that this is why the project's CLAUDE.md documents the exact middleware chain order — it's a team knowledge issue, not just a code issue.
