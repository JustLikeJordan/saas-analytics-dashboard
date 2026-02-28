# constants/index.ts — Explained

## 1. 30-Second Elevator Pitch

This file is the single source of truth for every magic number and configuration value shared between the frontend (Next.js) and the backend (Express). Instead of scattering `10 * 1024 * 1024` in the upload handler and `10485760` in the frontend validation (hoping they stay in sync), we define it once here and import it everywhere. It covers file size limits, AI timeouts, rate-limiting tiers, user roles, invite configuration, authentication parameters, and a typed catalog of analytics event names. Because this lives in a shared package in our monorepo, both `apps/web` and `apps/api` can import these constants and stay perfectly aligned — whether it's checking a role, setting a cookie expiry, or logging `'dataset.uploaded'` in the analytics pipeline.

**How to say it in an interview:** "This module centralizes shared constants — file size limits, timeout thresholds, rate-limit configurations, role definitions, auth settings, and a typed analytics event catalog — in a monorepo shared package so the frontend and backend always agree on the same values. It uses TypeScript's `as const` assertion for type-safe literal types, and derives union types like `Role` and `AnalyticsEventName` directly from the constant objects so they can never fall out of sync."

---

## 2. Why This Approach?

### Decision 1: Shared package in a monorepo

**What's happening:** This file lives in `packages/shared/`, not in `apps/api/` or `apps/web/`. Both apps import from this package.

**Why this matters:** Imagine the frontend says "max file size is 10 MB" and shows an error if you try to upload 11 MB. But the backend says "max file size is 5 MB" because someone changed one without the other. The user sees "file uploaded successfully" on the frontend but gets a 413 error from the server. That's a terrible user experience caused by duplicated constants falling out of sync.

By putting these values in one place that both apps import, there's a single source of truth. Change it in one file, both apps pick it up automatically. Monorepo tooling (pnpm workspaces) makes this straightforward — you just write `import { MAX_FILE_SIZE_BYTES } from '@repo/shared'`.

**How to say it in an interview:** "Shared constants eliminate drift between frontend and backend. In a monorepo, the shared package is a contract — both apps import the same values, so they can never disagree on limits, timeouts, or role definitions."

### Decision 2: `as const` assertion for literal types

**What's happening:** The `RATE_LIMITS`, `ROLES`, `INVITES`, `ANALYTICS_EVENTS`, and `AUTH` objects all use `as const` at the end.

**Why this matters:** Without `as const`, TypeScript infers broad types. The ROLES object would be typed as `{ OWNER: string, MEMBER: string }` — meaning TypeScript thinks `ROLES.OWNER` could be any string, like `"banana"`. With `as const`, TypeScript infers the exact literal types: `{ readonly OWNER: "owner", readonly MEMBER: "member" }`. Now TypeScript knows `ROLES.OWNER` is specifically the string `"owner"` and nothing else.

This matters because if you write a function that accepts a `Role` parameter, TypeScript will only allow `"owner"` or `"member"` — not any random string. It catches bugs at compile time. If someone writes `checkRole("admin")`, TypeScript flags it as an error immediately.

Think of it like a vending machine. Without `as const`, the machine accepts any coin-shaped object. With `as const`, it only accepts quarters and dimes — the specific coins it's designed for.

**How to say it in an interview:** "The `as const` assertion narrows types from generic `string` to exact literal types. Combined with the `typeof ROLES[keyof typeof ROLES]` pattern, it creates a union type that's always in sync with the object — add a new role to the object and the type updates automatically, no manual maintenance needed."

### Decision 3: Three-tier rate limiting

**What's happening:** `RATE_LIMITS` defines three categories with different limits: auth (10/min), AI (5/min), and public (60/min).

**Why this matters:** Not all API endpoints cost the same. A public endpoint like "get dashboard data" is cheap — it just reads from the database. An AI endpoint like "generate business insight" calls the Claude API, which costs real money (per-token pricing) and takes seconds to complete. An auth endpoint like "login" is a security-sensitive target for brute-force attacks. Each category deserves its own limit:

- **Auth (10/min):** Tight because brute-force attacks try thousands of passwords per minute. 10 attempts per minute is generous for a real user but blocks automated attacks.
- **AI (5/min):** Very tight because each request costs money (Claude API tokens) and takes 5-15 seconds. 5 per minute prevents a single user from running up a massive bill.
- **Public (60/min):** Relaxed because these are normal browsing requests. 60 per minute means one request per second, which is well above what a human browsing the dashboard would generate but still blocks automated scraping.

**How to say it in an interview:** "We use three rate-limiting tiers because endpoint costs vary dramatically. Auth endpoints need tight limits for brute-force protection, AI endpoints are expensive per-call due to LLM token costs, and public endpoints just need general abuse prevention. Tiered limits let us be strict where it matters and generous where it doesn't."

### Decision 4: Named constants instead of inline numbers

**What's happening:** Instead of writing `10 * 1024 * 1024` directly in the upload handler, we give it a name: `MAX_FILE_SIZE_BYTES`.

**Why this matters:** The number `10485760` by itself means nothing. You'd have to do math to figure out it's 10 MB. `MAX_FILE_SIZE_BYTES` tells you exactly what it represents. This is sometimes called eliminating "magic numbers" — unnamed numeric values that appear in code without explanation.

There's also a maintenance benefit. If you need to change the limit to 25 MB, you change one line instead of searching the codebase for every occurrence of `10485760` (and hoping you don't accidentally change a different `10485760` that means something else).

**How to say it in an interview:** "Named constants replace magic numbers with self-documenting code. They centralize values so changes happen in one place, and they make code reviews easier because the reviewer sees `MAX_FILE_SIZE_BYTES` instead of needing to calculate what `10485760` means."

### Decision 5: Dot-notation event naming convention

**What's happening:** `ANALYTICS_EVENTS` uses a `domain.past_tense_action` format: `'user.signed_up'`, `'dataset.uploaded'`, `'ai.summary_requested'`. The keys are `SCREAMING_SNAKE_CASE` for TypeScript access, but the actual string values that get stored in the database are lowercase dot-notation.

**Why this matters:** Event naming is one of those things that seems trivial until you have 50 events in a production system and half of them follow different conventions. Some teams use camelCase (`userSignedUp`), some use past tense, some use present tense (`user.sign_up` vs `user.signed_up`), some mix all of these. Once events are written to the database, renaming them means migrating every historical row — so the convention you pick on day one is the one you live with.

The `domain.action` format does two things well. The dot separates the *entity* (`user`, `dataset`, `org`, `ai`, `share`) from the *thing that happened* (`signed_up`, `uploaded`, `created`). This makes filtering trivial — you can query all user-related events with `WHERE event_name LIKE 'user.%'` or all creation events with `WHERE event_name LIKE '%.created'`. The past tense is deliberate: events record things that already happened, not things that are about to happen. `'dataset.uploaded'` is a fact; `'dataset.upload'` is ambiguous — is it the intent or the completion?

Think of it like a filing system. The dot is the folder. Every `user.*` event goes in the same logical drawer. Without this structure, you'd have a pile of loose papers labeled `signUp`, `UserLogin`, `DATASET_UPLOAD`, and `share-created` — good luck querying that.

**How to say it in an interview:** "We use a `domain.past_tense_action` convention for analytics events — like `'user.signed_up'` or `'dataset.uploaded'`. The dot gives us a natural namespace for filtering, and past tense makes it clear these represent completed actions. The constant keys are typed with `as const` so the database column only ever receives values from a known, compile-time-checked set."

---

## 3. Code Walkthrough

### Block 1: File size constant (line 1)

```ts
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
```

This defines the maximum CSV file size a user can upload. The math: 10 (megabytes) x 1024 (kilobytes per megabyte) x 1024 (bytes per kilobyte) = 10,485,760 bytes. Writing it as `10 * 1024 * 1024` instead of `10485760` makes the intent clear — you can see at a glance that it's "10 megabytes" without needing a calculator.

The frontend uses this to validate file size before uploading (showing an error like "File too large, max 10 MB"). The backend uses it as a second check in the upload handler (because you can never trust the client — someone could bypass the frontend with curl or Postman).

### Block 2: AI timeout constant (line 3)

```ts
export const AI_TIMEOUT_MS = 15_000; // 15s total, TTFT < 2s
```

This is the maximum time we'll wait for an AI response from the Claude API. The `_` in `15_000` is a numeric separator — it does nothing functionally, it just makes the number easier to read (like writing "15,000" in English). TypeScript and JavaScript both support this.

The comment mentions "TTFT < 2s" — that stands for "Time To First Token." When we stream an AI response (sending it to the user word by word as it's generated), we expect the first word to appear within 2 seconds. If 15 seconds pass with no complete response, we abort the request. These thresholds come from our PRD (Product Requirements Document) which defines acceptable performance for the user experience.

### Block 3: Rate limit configuration (lines 5-9)

```ts
export const RATE_LIMITS = {
  auth: { max: 10, windowMs: 60_000 },
  ai: { max: 5, windowMs: 60_000 },
  public: { max: 60, windowMs: 60_000 },
} as const;
```

Each tier has two properties:
- **`max`** — the maximum number of requests allowed in the time window.
- **`windowMs`** — the time window in milliseconds. `60_000` ms = 60 seconds = 1 minute.

So `auth: { max: 10, windowMs: 60_000 }` means "allow at most 10 authentication requests per minute per client." After the 10th request, subsequent attempts get a 429 (Too Many Requests) response until the 60-second window resets.

The `as const` at the end does two things. First, it makes all values `readonly` — you can't accidentally write `RATE_LIMITS.auth.max = 999` somewhere in your code. Second, it narrows the types: `max` is type `10` (the literal number), not `number`. This is stricter than needed for this particular use case, but it's a good habit — `as const` on configuration objects prevents accidental mutation.

### Block 4: Role definitions and type (lines 11-14)

```ts
export const ROLES = {
  OWNER: 'owner',
  MEMBER: 'member',
} as const;
```

This is a simple constant object defining the two RBAC roles. The `as const` assertion gives us literal types (`'owner'` and `'member'` instead of `string`). There's a corresponding `Role` type derived from this object elsewhere — the same `typeof`/`keyof` pattern described below for analytics events. The two roles map to the `user_orgs.role` column in the database, with org-scoped permissions checked by the RBAC middleware.

### Block 5: Invite configuration (lines 16-19)

```ts
export const INVITES = {
  DEFAULT_EXPIRY_DAYS: 7,
  TOKEN_BYTES: 32,
} as const;
```

Two values that govern the org invite link system. `DEFAULT_EXPIRY_DAYS: 7` means an invite link expires one week after creation. `TOKEN_BYTES: 32` means the invite token is generated from 32 bytes of cryptographic randomness (via `crypto.randomBytes(32)`), which produces a 64-character hex string — long enough that guessing a valid token is computationally impossible.

These are the kind of values that *seem* like they could be hardcoded in the invite service itself, and they could. But putting them here means the frontend can also reference them — for example, showing "This link expires in 7 days" on the invite UI without hardcoding its own `7`.

### Block 6: Analytics event catalog and derived type (lines 22-38)

```ts
export const ANALYTICS_EVENTS = {
  USER_SIGNED_UP: 'user.signed_up',
  USER_SIGNED_IN: 'user.signed_in',
  USER_SIGNED_OUT: 'user.signed_out',
  ORG_CREATED: 'org.created',
  ORG_INVITE_SENT: 'org.invite_sent',
  ORG_INVITE_ACCEPTED: 'org.invite_accepted',
  DATASET_UPLOADED: 'dataset.uploaded',
  DATASET_DELETED: 'dataset.deleted',
  AI_SUMMARY_REQUESTED: 'ai.summary_requested',
  AI_SUMMARY_COMPLETED: 'ai.summary_completed',
  SHARE_CREATED: 'share.created',
  SHARE_VIEWED: 'share.viewed',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
```

This is the event registry for the entire application's analytics pipeline. Let's walk through why it's structured this way.

The keys (`USER_SIGNED_UP`, `DATASET_UPLOADED`, etc.) are what you use in application code: `ANALYTICS_EVENTS.DATASET_UPLOADED`. They follow `SCREAMING_SNAKE_CASE` because that's the convention for constant object keys in TypeScript — you can spot them at a glance and know they're not computed or dynamic.

The values (`'user.signed_up'`, `'dataset.uploaded'`, etc.) are what actually get stored in the `analytics_events.event_name` database column. They follow a strict `domain.past_tense_action` pattern. Five domains cover the whole app: `user`, `org`, `dataset`, `ai`, and `share`. Each domain groups related events — you can see the user lifecycle (`signed_up` -> `signed_in` -> `signed_out`), the data lifecycle (`uploaded` -> `deleted`), and the AI lifecycle (`summary_requested` -> `summary_completed`).

The `AnalyticsEventName` type uses the same derived-type pattern as `Role`:

1. **`typeof ANALYTICS_EVENTS`** — the type of the constant object, with every value narrowed to its literal string.
2. **`keyof typeof ANALYTICS_EVENTS`** — the union of all keys: `'USER_SIGNED_UP' | 'USER_SIGNED_IN' | ... | 'SHARE_VIEWED'`.
3. **`(typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]`** — the union of all values: `'user.signed_up' | 'user.signed_in' | ... | 'share.viewed'`.

So `AnalyticsEventName` is a union of all 12 event strings. Any function that accepts an event name — like `trackEvent(name: AnalyticsEventName, payload: unknown)` — will reject typos and unknown events at compile time. If a developer writes `trackEvent('user.signup', ...)`, TypeScript catches it immediately. The correct value is `'user.signed_up'`, and the compiler knows it.

Adding a new event in the future is one line: add a key-value pair to the object. The `AnalyticsEventName` type updates automatically. No manual type maintenance, no risk of forgetting to update a union.

### Block 7: Seed org configuration (lines 55-58)

```ts
export const SEED_ORG = {
  slug: 'seed-demo',
  name: 'Sunrise Cafe',
} as const;
```

The demo mode system uses a pre-created org called "Sunrise Cafe" with a fixed slug. This constant defines that org's identity so the seed data scripts and demo mode state machine can reference it consistently. The slug `'seed-demo'` is used for URL routing and database lookups. Hardcoding it here (rather than generating it dynamically) means demo mode setup is deterministic — every environment starts with the same org, which makes CI testing and local development predictable.

### Block 8: CSV validation constants (lines 60-63)

```ts
export const CSV_REQUIRED_COLUMNS = ['date', 'amount', 'category'] as const;
export const CSV_OPTIONAL_COLUMNS = ['label', 'parent_category'] as const;
export const CSV_MAX_ROWS = 50_000;
export const ACCEPTED_FILE_TYPES = ['.csv', 'text/csv', 'application/vnd.ms-excel'] as const;
```

Four constants governing CSV upload validation. `CSV_REQUIRED_COLUMNS` lists the three columns every CSV must contain — the backend rejects files missing any of them. `CSV_OPTIONAL_COLUMNS` lists recognized-but-not-mandatory columns. `CSV_MAX_ROWS` caps file size at 50,000 rows to prevent memory exhaustion during parsing (the entire file is buffered in memory via multer). `ACCEPTED_FILE_TYPES` defines valid MIME types and extensions — the frontend checks this before uploading, and multer's `fileFilter` checks it again server-side.

These live in shared constants (not just the backend) because the frontend's `UploadDropzone` component uses `MAX_FILE_SIZE` and `ACCEPTED_FILE_TYPES` for client-side validation before the file ever leaves the browser.

### Block 9: Demo mode state machine (lines 65-70)

```ts
export const DEMO_MODE_STATES = {
  SEED_ONLY: 'seed_only',
  SEED_PLUS_USER: 'seed_plus_user',
  USER_ONLY: 'user_only',
  EMPTY: 'empty',
} as const;
```

The dashboard has a 4-state machine governing what data a user sees. `seed_only` means the user is viewing the pre-loaded demo data (Sunrise Cafe). `seed_plus_user` means they uploaded their own CSV but the demo data is still visible. `user_only` means they've dismissed the demo. `empty` means they deleted everything and haven't uploaded yet. The state transitions drive UI decisions — like showing a "Try with sample data" prompt in the `empty` state, or a "You're viewing demo data" banner in `seed_only`.

### Block 10: Auth configuration (lines 40-53)

```ts
export const AUTH = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY_DAYS: 7,
  OAUTH_STATE_EXPIRY_SECONDS: 600,
  COOKIE_NAMES: {
    ACCESS_TOKEN: 'access_token',
    REFRESH_TOKEN: 'refresh_token',
    OAUTH_STATE: 'oauth_state',
  },
  GOOGLE_AUTH_URL: 'https://accounts.google.com/o/oauth2/v2/auth',
  GOOGLE_TOKEN_URL: 'https://oauth2.googleapis.com/token',
  GOOGLE_JWKS_URL: 'https://www.googleapis.com/oauth2/v3/certs',
  GOOGLE_SCOPES: 'openid email profile',
} as const;
```

This is the biggest constant object in the file and it handles all authentication-related configuration. Let's break down the groups:

**Token lifetimes:** `ACCESS_TOKEN_EXPIRY: '15m'` is a string because it gets passed directly to the `jose` JWT library's expiration parameter. Short-lived access tokens (15 minutes) limit the blast radius if a token is stolen — an attacker has at most 15 minutes before it expires. `REFRESH_TOKEN_EXPIRY_DAYS: 7` is a number because it's used in date math (`new Date(Date.now() + days * 86400000)`). Refresh tokens last a week, which balances security with usability — you don't want to force users to re-login every 15 minutes. The `OAUTH_STATE_EXPIRY_SECONDS: 600` (10 minutes) governs the anti-CSRF state parameter during Google OAuth flows. It only needs to live long enough for the user to click "Allow" on Google's consent screen.

**Cookie names:** Nested under `COOKIE_NAMES` because both the API (which sets the cookies) and the proxy layer (which reads them for route protection) need to agree on names. If the API sets `access_token` but the proxy reads `accessToken`, authentication breaks silently.

**Google OAuth URLs:** Hardcoded here rather than discovered at runtime. Google's OAuth endpoints have been stable for years — they're not going to change without months of deprecation notice. Putting them in constants means you can search the codebase for `AUTH.GOOGLE_AUTH_URL` and find every place that initiates an OAuth flow, rather than grepping for a raw URL string.

**Scopes:** `'openid email profile'` requests the user's email and basic profile info (name, avatar). These are the minimum scopes needed for login. We don't request any Google API access like Drive or Calendar — just identity.

---

## 4. Complexity and Trade-offs

**Time complexity:** N/A. These are constant values — no computation happens when they're used.

**Space complexity:** Negligible. A handful of numbers and strings occupying a few bytes in memory.

**Trade-off 1: Shared constants vs. per-app configuration.**
Shared constants assume both apps always need the same values. If the frontend ever needed a different timeout than the backend, you'd need to split the constant. For now, sharing is correct — the frontend shows "request timed out" after the same `AI_TIMEOUT_MS`, and the backend aborts the LLM call at the same threshold.

**Trade-off 2: `as const` makes objects immutable.**
The `readonly` nature of `as const` means you can't modify these values at runtime. If you ever needed to, say, dynamically adjust rate limits based on load, you couldn't mutate `RATE_LIMITS`. You'd need a different approach (like a function that reads from Redis). For static configuration like this, immutability is a feature, not a limitation — it prevents bugs where some code accidentally overwrites a global constant.

**Trade-off 3: Hardcoded values vs. environment variables.**
These values are hardcoded in TypeScript, not read from environment variables. This means changing the file size limit requires a code change and redeployment. The alternative — reading from `process.env` — would allow runtime changes but adds complexity (validation, type conversion, default values) and makes it harder to share with the frontend (which runs in the browser and doesn't have `process.env`). For values that change rarely and need to be consistent across apps, hardcoded shared constants are the simpler choice.

**Trade-off 4: Flat event catalog vs. nested domain grouping.**
You could imagine structuring `ANALYTICS_EVENTS` as nested objects: `ANALYTICS_EVENTS.user.SIGNED_UP`, `ANALYTICS_EVENTS.dataset.UPLOADED`. That would give you runtime access to all events in a domain (e.g., `Object.values(ANALYTICS_EVENTS.user)`). We went with a flat structure instead because (a) the number of events is small enough that nesting adds ceremony without benefit, (b) the derived `AnalyticsEventName` type works cleanly on a flat object, and (c) autocomplete on `ANALYTICS_EVENTS.` shows you every event in one list without drilling into sub-objects. If the event catalog grew to 50+ events, nesting might become worth the trade-off.

**Trade-off 5: AUTH URLs hardcoded vs. discoverable.**
Google publishes an OpenID Connect discovery document at `https://accounts.google.com/.well-known/openid-configuration` that you could fetch at startup to get the auth, token, and JWKS URLs dynamically. The upside: if Google ever changes these URLs, your app adapts automatically. The downside: your app can't start without a network call to Google, and you're adding a failure mode to boot. Since these URLs have been stable for years, hardcoding wins on simplicity.

**How to say it in an interview:** "We chose hardcoded shared constants over environment variables because these values need to be identical on both the client and server and change infrequently. The trade-off is that changes require a redeploy, but for things like file size limits and role definitions, that's appropriate — you want those changes to go through code review and testing, not be flipped at runtime."

---

## 5. Patterns and Concepts Worth Knowing

### Eliminating Magic Numbers
A "magic number" is a numeric literal in code with no explanation — like `if (file.size > 10485760)`. Named constants replace them with readable names. This is one of the most universally agreed-upon best practices in software engineering. It makes code self-documenting and maintainable.

### Single Source of Truth (SSOT)
SSOT means every piece of knowledge in a system is defined in exactly one place. When both the frontend and backend need to know the file size limit, putting it in a shared package ensures there's one definition. If it were duplicated in both apps, they could drift apart — one of the most common sources of subtle bugs.

### Derived Types (`typeof` + `keyof`)
The `type Role = (typeof ROLES)[keyof typeof ROLES]` pattern is called a "derived type" — the type is computed from a runtime value rather than defined independently. This technique is powerful because it eliminates the possibility of the type and the value disagreeing. You'll see this pattern throughout well-written TypeScript codebases, especially for configuration objects, enum-like constants, and API route definitions. In this file, both `Role` and `AnalyticsEventName` use the same technique — if it works for 2 roles, it works for 12 events, and it'll work for 200 entries without any change to the type derivation.

### Immutable Configuration
Using `as const` makes configuration objects deeply readonly at the type level. This is related to the broader concept of immutability — data that can't be changed after creation. Immutable data is easier to reason about because you never have to wonder "did something modify this somewhere else?" In functional programming, immutability is the default; in TypeScript, `as const` gives you that guarantee for constant objects.

### Numeric Separators
The `15_000` syntax uses numeric separators — underscores in numbers that JavaScript ignores but humans can read. It's like writing "15,000" instead of "15000" — both are the same value, but one is easier to read at a glance. This feature was added in ES2021 and works in TypeScript too.

### Namespaced Event Strings
The `domain.action` pattern in `ANALYTICS_EVENTS` is a common convention in event-driven systems. Stripe uses it (`charge.succeeded`, `invoice.paid`). GitHub webhooks use it (`pull_request.opened`, `issues.labeled`). It's popular because the dot creates a natural hierarchy — you can filter, group, and wildcard-match events by domain without parsing complex event names. Past tense signals completion — the event already happened, it's a fact you're recording, not an intent. If you ever work with message queues, event sourcing, or webhook systems, you'll see this pattern everywhere.

---

## 6. Potential Interview Questions

### Q1: "Why put constants in a shared package instead of defining them in each app?"

**Strong answer:** "Duplication across apps means the values can drift apart. If the frontend thinks the max file size is 10 MB but the backend was updated to 5 MB, users get confusing errors — the frontend accepts the upload but the server rejects it. A shared package creates a single source of truth that both apps import. When you change the constant, both apps pick it up in the next build. In a monorepo with pnpm workspaces, the import just works — `@repo/shared` resolves to the local package, no publishing to npm needed."

**Red flag:** "You could just copy-paste the values" or not understanding why duplication is a problem.

### Q2: "What does `as const` actually do? Why not just use a regular object?"

**Strong answer:** "`as const` does two things. First, it makes the entire object deeply readonly — TypeScript will error if any code tries to mutate it, like `ROLES.OWNER = 'admin'`. Second, it narrows the types from general to literal — instead of `OWNER: string`, it becomes `OWNER: 'owner'`. This enables the derived `Role` type to be `'owner' | 'member'` instead of just `string`. Without `as const`, any string would satisfy the `Role` type, defeating the purpose of type safety."

**Red flag:** "It's just to make it readonly" (missing the literal type narrowing), or not understanding the difference between `string` and `'owner'` as types.

### Q3: "Walk me through how the `AnalyticsEventName` type is derived."

**Strong answer:** "It's the same three-step pattern we use for `Role`, just with more values. `typeof ANALYTICS_EVENTS` gives us the full object type with every value narrowed to its literal string — so the `USER_SIGNED_UP` property has type `'user.signed_up'`, not `string`. `keyof typeof ANALYTICS_EVENTS` extracts all 12 keys as a union. Then `(typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]` is an indexed access type — it looks up the values at all those keys, producing a union of all 12 event strings: `'user.signed_up' | 'user.signed_in' | ... | 'share.viewed'`. Adding a 13th event to the object automatically extends the type. No manual update needed."

**Red flag:** Not being able to explain the indexed access type step, or suggesting you'd maintain the union by hand (`type AnalyticsEventName = 'user.signed_up' | 'user.signed_in' | ...`).

### Q4: "Why use dot-notation for event names instead of camelCase or plain strings?"

**Strong answer:** "Dot-notation creates a natural namespace. `'user.signed_up'` has two parts: the domain and the action. You can query all user-related events with `WHERE event_name LIKE 'user.%'`, or all creation events with `LIKE '%.created'`. Past tense is deliberate — events record what already happened, not intentions. This convention comes from the broader event-driven ecosystem: Stripe uses `charge.succeeded`, GitHub uses `pull_request.opened`. It's familiar to anyone who's worked with webhooks or event sourcing. CamelCase like `userSignedUp` gives you a flat string with no natural boundary to split on."

**Red flag:** "I'd just use any string format" without considering queryability or industry conventions.

### Q5: "Why are the rate limits different for each tier?"

**Strong answer:** "Each tier protects against a different kind of abuse and has a different cost profile. Auth endpoints need tight limits — 10 per minute — because login and registration are targets for credential stuffing and brute-force attacks. AI endpoints are even tighter — 5 per minute — because each request calls a paid LLM API, and a single malicious user could generate hundreds of dollars in API costs. Public endpoints are more relaxed — 60 per minute — because they're cheap database reads and normal browsing easily stays under 1 request per second. The three-tier approach lets us be strict where the risk or cost is high and permissive where it's low."

**Red flag:** "I'd just use one rate limit for everything" without considering cost differences, or not recognizing that AI endpoints cost real money.

### Q6: "Could these constants be environment variables instead? When would you prefer one over the other?"

**Strong answer:** "You'd use environment variables for values that differ between environments — like database URLs, API keys, or feature flags. You'd use hardcoded constants for values that should be the same everywhere and change rarely — like file size limits, role names, or API timeout thresholds. These particular constants also need to be available in the browser, which can't access `process.env` directly. You could inject them via Next.js's `NEXT_PUBLIC_` prefix, but that adds complexity for no benefit. If we ever needed runtime-adjustable rate limits, we'd move that configuration to Redis or a database, not environment variables."

**Red flag:** "Everything should be an environment variable" or "Everything should be hardcoded" — both extremes miss the nuance.

### Q7: "Why is the access token expiry a string ('15m') but the refresh token expiry is a number (7)?"

**Strong answer:** "They're consumed by different APIs. The access token expiry gets passed directly to the `jose` JWT library, which accepts human-readable duration strings like `'15m'`, `'1h'`, or `'7d'`. The refresh token expiry is used in manual date math — `Date.now() + days * 86400000` — so it's a plain number. Matching the type to how the value is consumed avoids unnecessary conversions. You could standardize on one format, but then one consumer would always need a conversion step."

**Red flag:** Not recognizing that the formats match their consumers, or suggesting everything should be milliseconds (which makes the JWT call harder to read).

---

## 7. Data Structures & Algorithms Used

| Concept | Where | Why |
|---|---|---|
| **Object literal** | `RATE_LIMITS`, `ROLES`, `INVITES`, `ANALYTICS_EVENTS`, `AUTH` | Groups related constants into a named structure. Cleaner than separate `const AUTH_MAX = 10; const AUTH_WINDOW = 60000;` declarations. |
| **Nested object literal** | `AUTH.COOKIE_NAMES` | Sub-groups tightly coupled constants (the three cookie name strings) under a parent. Keeps the top-level `AUTH` object organized without polluting it with six flat properties for cookie names. |
| **Union type** | `Role`, `AnalyticsEventName` | Restricts a variable to a fixed set of string values, caught at compile time. Similar in purpose to an enum but lighter weight. |
| **Indexed access type** | `(typeof ROLES)[keyof typeof ROLES]`, `(typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]` | Derives a type from an object's values — a TypeScript meta-programming technique that keeps types and values in sync. |
| **Numeric literal type** | `max: 10` (with `as const`) | The number `10` becomes the type `10`, not `number`. Enables exhaustive type checking in switch statements and prevents accidental reassignment. |
| **String literal type** | `'user.signed_up'` (with `as const`) | The string `'user.signed_up'` becomes a type, not just a value. Any function typed to accept `AnalyticsEventName` rejects strings that don't appear in the catalog. |
| **Namespaced strings** | `ANALYTICS_EVENTS` values | The `domain.action` format creates a hierarchy within flat strings — queryable by prefix (`user.%`) or suffix (`%.created`) at the database level. |

---

## 8. Impress the Interviewer

### Talking point 1: "Derived types eliminate a whole class of desynchronization bugs"
"One thing I really value about the `typeof` + `keyof` pattern is that it makes the type and the runtime value a single source of truth. In a lot of codebases, you see something like `type Role = 'owner' | 'member'` defined separately from the roles object. Then someone adds an `'admin'` role to the object but forgets to update the type, or vice versa. By deriving the type from the object, they can never go out of sync. We use this pattern twice in this file — for `Role` and `AnalyticsEventName` — and it scales to any size. A 50-event catalog would work identically."

### Talking point 2: "Three-tier rate limiting reflects real cost modeling"
"The rate limit tiers are directly tied to the economic cost of each endpoint category. A public GET request costs maybe $0.0001 in compute. An AI request costs $0.01-0.05 in Claude API tokens — 100-500 times more expensive. If we used the same rate limit for both, either normal users would be throttled on public endpoints (frustrating) or we'd be hemorrhaging money on AI abuse (expensive). The tiered approach is like a gym having different rules for the free weights area versus the pool — different resources need different access controls."

### Talking point 3: "`as const` is TypeScript's answer to true enums"
"TypeScript has an `enum` keyword, but many TypeScript teams avoid it because enums generate extra JavaScript at runtime and have some quirky behaviors around reverse mappings. The `as const` object pattern gives you the same benefits — named constants, literal types, type-safe access — without any runtime overhead. The object is just a plain JavaScript object after compilation. It's become the idiomatic TypeScript approach for constant sets."

### Talking point 4: "The event naming convention borrows from Stripe and GitHub"
"I like the `domain.past_tense_action` pattern for analytics events because it's not something we invented — it's a convention from production event systems that handle billions of events. Stripe uses `charge.succeeded`. GitHub uses `pull_request.opened`. The dot is the namespace separator, and past tense communicates that you're recording a fact, not dispatching a command. When you use a well-known convention, anyone who joins the team and has worked with Stripe webhooks or GitHub Actions will immediately understand the event schema. And from a practical standpoint, the dot lets you do prefix queries at the database level — `WHERE event_name LIKE 'org.%'` gives you every org-related event without maintaining a separate list."
