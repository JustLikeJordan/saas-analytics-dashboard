# subscriptionGate.ts — Interview-Ready Documentation

## 1. Elevator Pitch

Express middleware that enriches every request with a `subscriptionTier` property ('free' or 'pro') by querying the subscriptions table. It never blocks — even on errors or missing auth, the request continues as 'free'. Downstream route handlers read the tier and decide what to do with it (truncate AI summaries, limit features, etc.).

**How to say it in an interview:** "The subscription gate is an annotating middleware, not a blocking one. It looks up the org's subscription tier and attaches it to the request, but it never returns a 403. If anything fails — no user, no org, DB error — it defaults to 'free' and lets the request through. This means the paywall logic lives in the individual endpoints, not in a global gate."

## 2. Why This Approach

**Annotation over blocking.** A blocking middleware would return 403 for free-tier users trying to access premium endpoints. That puts paywall policy in the middleware layer, which gets messy fast — you'd need allowlists, different behavior per route, special handling for endpoints that show partial content. Instead, the gate just answers "what tier is this user?" and lets each route decide independently. The AI summary route truncates at 150 words for free. A future billing route might show nothing. Different routes, different policies, one shared tier lookup.

**TieredRequest interface instead of module augmentation.** The obvious pattern in Express is `declare module 'express-serve-static-core'` to add `subscriptionTier` to every request. That doesn't work with TypeScript's `moduleResolution: "bundler"` — the module can't be resolved, so the augmentation silently fails. The fix is a `TieredRequest` interface extending `Request`, with consumers casting `req as TieredRequest` at usage sites. Less magical, more explicit.

**How to say it in an interview:** "Module augmentation didn't work because the project uses bundler module resolution. So I created a TieredRequest interface that extends Express Request. It's more explicit — you cast when you need the tier, and TypeScript catches any access on a plain Request."

**Fail-open on every path.** Three failure modes, all defaulting to 'free': no user/org (unauthenticated request), DB error (connection lost, table doesn't exist), and missing subscription row (org never subscribed). Free is always safe — worst case, a pro user sees a truncated preview for one request.

## 3. Code Walkthrough

### TieredRequest interface (lines 8-10)

Extends `Request` with an optional `subscriptionTier`. Optional because the middleware sets it, not the Express framework — type safety without lying to TypeScript.

### subscriptionGate function (lines 12-31)

Casts the request to both `AuthenticatedRequest` (for `user.org_id`) and `TieredRequest` (for `subscriptionTier`). If no `orgId`, sets free and calls `next()` immediately — anonymous requests skip the DB lookup entirely. The `try/catch` wraps the query; failures log a warning with the org and error message, then default to free.

The `logger.warn` call follows the project's Pino convention: structured object first (`{ orgId, err }`), message string second. The error message is cast from `unknown` via `(err as Error).message` — Express 5 catch blocks receive `unknown`, not `Error`.

## 4. Complexity and Trade-offs

**Double casting.** The function casts `req` to two different types — `AuthenticatedRequest` for user context, `TieredRequest` for the tier property. This is a consequence of the interface approach: if Express augmentation worked, both properties would live on `Request`. The double cast is a little ugly but explicit about what the middleware reads vs. writes.

**No caching.** Every request triggers a DB query. For a dashboard that loads once and streams an AI summary, this is one query per page load — fine. If the app grew to dozens of API calls per page, you'd want a short TTL cache (Redis or in-memory) keyed by `orgId`.

**How to say it in an interview:** "The middleware trades simplicity for a per-request DB hit. At our current call volume — one lookup per dashboard load — that's fine. If we scaled to many API calls per page, I'd add a short Redis cache keyed by org_id."

## 5. Patterns Worth Knowing

**Annotating middleware.** A pattern where middleware enriches the request with computed data rather than making pass/fail decisions. Other examples: correlation ID middleware (adds a trace ID), locale middleware (detects language from headers). The pattern keeps policy decisions out of the middleware layer and in the route handlers.

**How to say it in an interview:** "I prefer annotating middleware that enriches requests over blocking middleware that enforces policy. It keeps each route in control of its own access rules and avoids global allowlists."

**Fail-open by design.** In security contexts, fail-open is risky. In a freemium context, fail-open is correct — if we can't determine the tier, showing free-tier content is safe. The alternative (fail-closed, returning 500 on DB errors) would block all users whenever the subscriptions table has issues.

## 6. Interview Questions

**Q: Why not use `declare module` to add `subscriptionTier` to Express's Request type?**
A: The project uses `moduleResolution: "bundler"`, which can't resolve `express-serve-static-core` for augmentation. The explicit `TieredRequest` interface works everywhere and makes the tier access visible in the code — you see the cast at the usage site.
*Red flag:* "Just switch to Node module resolution." That breaks the rest of the monorepo's import resolution.

**Q: Why does this middleware never return 403?**
A: Because paywall behavior differs per endpoint. The AI summary route shows a truncated preview. A future export route might block entirely. A billing page needs to work for free users. Centralizing that policy in middleware creates a growing allowlist. Each route reads `subscriptionTier` and implements its own policy.

**Q: What happens if the subscriptions table doesn't exist yet?**
A: The `getActiveTier` query itself has a try/catch that returns 'free' if the table is missing. And the middleware has its own try/catch as a second safety net. Double defense for the pre-Epic 5 period when the table might not be migrated yet.

## 7. Data Structures

**TieredRequest:** `Request & { subscriptionTier?: SubscriptionTier }`. The `?` is intentional — middleware hasn't run yet at the type level. Consumers use `(req as TieredRequest).subscriptionTier ?? 'free'` for the final fallback.

**SubscriptionTier:** `'free' | 'pro'` — imported from `shared/types`, the single source of truth for both frontend and backend.

## 8. Impress the Interviewer

**The annotating vs. blocking distinction.** Most candidates write middleware that blocks. Explaining why annotation is better for freemium — different routes need different paywall policies, fail-open is safe, the gate is just a data lookup — shows you think about middleware as infrastructure, not policy enforcement.

**How to bring it up:** "The subscription gate annotates rather than blocks. Free tier is always safe as a default, and different routes implement different paywall behaviors. The AI endpoint truncates, a future billing endpoint shows upsell UI, and a data endpoint might not care about tier at all."

**The module augmentation failure.** TypeScript module augmentation is the "standard" approach, and most tutorials show it. Knowing it fails under specific `moduleResolution` settings — and having a clean workaround — shows real-world TypeScript experience beyond tutorial-level knowledge.
