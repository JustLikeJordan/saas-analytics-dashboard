# trackEvent.ts — Explained

## 1. 30-Second Elevator Pitch

`trackEvent` is a fire-and-forget function that records analytics events (like "user signed in" or "dataset uploaded") to the database without blocking the caller. It wraps an async database insert, intentionally skips `await`, catches any errors via `.catch()`, and logs them with Pino. The return type is `void`, not `Promise<void>` — callers don't know or care whether the write succeeded. This is 20 lines of code, but it encodes an opinion that matters in production: analytics must never crash or slow down the thing you're actually trying to do for the user.

**How to say it in an interview:** "It's a fire-and-forget wrapper around a database insert. The function returns synchronously, the promise runs in the background, and failures get logged but never propagated. The caller's flow is completely decoupled from whether the analytics write succeeds."

## 2. Why This Approach?

The alternative is `await`ing the insert. That means every route handler that tracks an event pays the cost of one extra database round-trip in its response time — and if the insert fails, the handler has to decide what to do about it. Should a failed analytics write cause a 500 on a CSV upload? Obviously not.

Fire-and-forget solves both problems. The caller keeps moving, the write happens in the background, and the `.catch()` makes sure no unhandled promise rejection crashes the process. This pattern shows up everywhere in production systems: metrics collection, audit logs, usage tracking. The principle is always the same — observability infrastructure should observe, not interfere.

Returning `void` instead of `Promise<void>` is the key design signal. It tells TypeScript (and every developer reading the code) that there is nothing to await. The function call looks synchronous at the call site. That's deliberate.

## 3. Code Walkthrough

```typescript
export function trackEvent(
  orgId: number,
  userId: number,
  eventName: AnalyticsEventName,
  metadata?: Record<string, unknown>,
): void {
```

**What's happening:** The signature takes multi-tenant context (`orgId`, `userId`), a typed event name, and optional freeform metadata. The return type is `void` — not `Promise<void>`. This is the first thing to notice.

**How to say it in an interview:** "The `void` return type is a contract. It tells callers they can't and shouldn't await this function. There's no promise to chain on."

```typescript
  analyticsEventsQueries
    .recordEvent(orgId, userId, eventName, metadata)
    .catch((err) => {
      logger.error({ err, orgId, userId, eventName }, 'Failed to record analytics event');
    });
```

**What's happening:** `.recordEvent()` returns a `Promise` (it does a Drizzle `db.insert().returning()`). We don't `await` it. Instead we chain `.catch()` directly, which handles any rejection by logging the error with full context — the org, user, event name, and the error itself. After `.catch()`, the resulting promise is intentionally discarded.

**How to say it in an interview:** "The `.catch()` is what makes this safe. Without it, a rejected promise would become an unhandled rejection, which in Node.js can terminate the process. The `.catch()` turns a potential crash into a log line."

The Pino logging follows the project convention: structured object first (`{ err, orgId, userId, eventName }`), message string second. This makes the error searchable and filterable in any log aggregation tool.

## 4. Complexity and Trade-offs

**Time complexity:** O(1) from the caller's perspective — it kicks off a promise and returns immediately. The actual database insert is O(1) for a single row.

**Trade-off — reliability vs. speed:** You're trading guaranteed delivery for non-blocking behavior. If the database is down, you lose events silently (well, they're logged, but not persisted). For analytics, that's usually fine. For billing or audit trails, it wouldn't be.

**Trade-off — testability:** Fire-and-forget functions are slightly awkward to test because the promise isn't exposed. The test file handles this with a `flushPromises()` helper — `new Promise((r) => setTimeout(r, 0))` — which drains the microtask queue so assertions can run after the `.catch()` handler.

**What this doesn't do:** There's no retry, no queue, no backpressure. If the database is slow, these promises pile up. For a dashboard with moderate traffic, that's fine. At high scale, you'd want a buffer (write to Redis or an in-memory queue, flush in batches).

## 5. Patterns and Concepts Worth Knowing

**Fire-and-forget pattern.** You call an async operation but intentionally don't await the result. The operation runs in the background. This works in Node.js because the event loop keeps processing the promise chain after your synchronous code returns. The danger is unhandled rejections — you *must* attach a `.catch()` or the process might crash (Node.js made unhandled rejections fatal by default starting in v15).

**Void vs. Promise\<void\>.** This distinction matters. `Promise<void>` says "I'm async, await me if you want." `void` says "I'm synchronous from your perspective, there's nothing to await." The return type communicates intent to both TypeScript and human readers.

**Structured logging.** Pino takes an object as the first argument and a message string as the second. This means `{ err, orgId, userId, eventName }` becomes searchable JSON fields in your log output, not just a string you have to regex-parse. If you're running this in production with Datadog or Grafana, you can query `eventName:"dataset.uploaded" AND level:error` directly.

**Multi-tenant context propagation.** Every call passes `orgId` and `userId`. This is the multi-tenant pattern of the codebase — `org_id` appears on every table, and analytics is no exception. Logging these IDs means you can filter failures by tenant when debugging.

## 6. Potential Interview Questions

### Q1: Why does this return `void` instead of `Promise<void>`?

**Strong answer:** "Returning `void` is an intentional design choice. It communicates to callers that this function is fire-and-forget — there's no promise to await, and the caller shouldn't try. If it returned `Promise<void>`, someone might accidentally `await` it, adding latency to the request for no benefit, or worse, try to catch errors that are already handled internally."

**Red flag:** "It's just a shortcut" or "They forgot to add `async`." Both miss the point that the return type is the API contract.

### Q2: What happens if the database insert fails?

**Strong answer:** "The `.catch()` handler logs the error with structured context — the org ID, user ID, event name, and the error itself. The failure is visible in logs but never propagated to the caller. No exception is thrown, no response is affected. For analytics, that's the right trade-off."

**Red flag:** "The error is swallowed." It's not swallowed — it's logged. There's a big difference between silent failure and intentional non-propagation.

### Q3: What would happen if you removed the `.catch()`?

**Strong answer:** "You'd get an unhandled promise rejection. In Node.js 15+, that terminates the process by default. So a database hiccup in your analytics layer would crash the entire API server. The `.catch()` is what makes fire-and-forget safe."

**Red flag:** "Nothing, JavaScript ignores failed promises." That hasn't been true since Node.js 15.

### Q4: How would you test a fire-and-forget function?

**Strong answer:** "You need to drain the microtask queue before asserting. The test file here uses `flushPromises()` — a `setTimeout` wrapped in a promise — to let the `.catch()` handler run before checking the mock. You mock the database layer to return a rejected promise, call `trackEvent`, flush, then assert that the logger was called with the right arguments."

**Red flag:** "You can't test it because there's no return value." You absolutely can — you test the side effects (the database call and the log call).

### Q5: When would fire-and-forget be the wrong pattern?

**Strong answer:** "Anything where losing the write has business consequences. Billing events, audit logs for compliance, transactional writes. For those, you need guaranteed delivery — either await the write, use a transactional outbox, or push to a durable queue. Analytics is a good fit for fire-and-forget because a missed event just means slightly inaccurate counts, not lost revenue or legal exposure."

**Red flag:** "I'd use fire-and-forget everywhere for performance." That's a recipe for data loss.

## 7. Data Structures & Algorithms Used

**`Record<string, unknown>`** — The `metadata` parameter. This is TypeScript's built-in mapped type for an object with string keys and values of any type. It gets stored as JSON in Postgres (the `analyticsEvents` table has a `metadata` column). Using `unknown` instead of `any` forces consumers to narrow the type before using the values, which is safer.

**`AnalyticsEventName`** — A union type derived from `ANALYTICS_EVENTS` using `typeof` + indexed access types. The actual values are strings like `'dataset.uploaded'` and `'user.signed_in'`. Using a typed union instead of plain `string` means the compiler catches typos at build time — you can't accidentally pass `'datset.uploaed'`.

**Promise chain** — `recordEvent().catch()` is a two-node promise chain. The `.catch()` acts as a rejection handler attached to the promise returned by `recordEvent()`. The resulting promise (from `.catch()`) resolves to `undefined` whether the insert succeeded or failed, so there's never an unhandled rejection.

## 8. Impress the Interviewer

If this comes up in a system design or code review discussion, here's what separates a good answer from a great one:

**Name the pattern and its constraints.** "This is fire-and-forget. It trades delivery guarantees for non-blocking execution. The `.catch()` prevents unhandled rejections. The `void` return type communicates intent through the type system."

**Know the Node.js history.** Unhandled promise rejections used to just emit a warning. Node.js 15 made them fatal (the `--unhandled-rejections=throw` behavior became default). This means that in modern Node, a missing `.catch()` on a background promise can kill your server. That single `.catch()` in this file isn't optional — it's a safety net.

**Suggest the next evolution.** If someone asks how you'd scale this, mention batching — collect events in memory and flush them in bulk every N seconds or every M events. That reduces database round-trips from one-per-event to one-per-batch. You'd also mention that at high volume, you might push events to a message queue (Redis Streams, SQS, Kafka) instead of writing directly to Postgres, so the API server isn't coupled to analytics write latency at all.

**Connect it to the codebase architecture.** This function sits between route handlers and the query layer. Routes call `trackEvent()` as a side effect — it doesn't affect the response. The query layer (`analyticsEventsQueries.recordEvent`) handles the actual Drizzle insert. This separation means you could swap the persistence layer (say, to a queue) without touching any route handler.
