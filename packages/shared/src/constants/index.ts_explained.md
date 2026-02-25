# constants/index.ts — Explained

## 1. 30-Second Elevator Pitch

This file is the single source of truth for every magic number and configuration value shared between the frontend (Next.js) and the backend (Express). Instead of scattering `10 * 1024 * 1024` in the upload handler and `10485760` in the frontend validation (hoping they stay in sync), we define it once here and import it everywhere. It covers file size limits, AI timeouts, rate-limiting tiers, and user roles. Because this lives in a shared package in our monorepo, both `apps/web` and `apps/api` can import these constants and stay perfectly aligned.

**How to say it in an interview:** "This module centralizes shared constants — file size limits, timeout thresholds, rate-limit configurations, and role definitions — in a monorepo shared package so the frontend and backend always agree on the same values. It uses TypeScript's `as const` assertion for type-safe literal types."

---

## 2. Why This Approach?

### Decision 1: Shared package in a monorepo

**What's happening:** This file lives in `packages/shared/`, not in `apps/api/` or `apps/web/`. Both apps import from this package.

**Why this matters:** Imagine the frontend says "max file size is 10 MB" and shows an error if you try to upload 11 MB. But the backend says "max file size is 5 MB" because someone changed one without the other. The user sees "file uploaded successfully" on the frontend but gets a 413 error from the server. That's a terrible user experience caused by duplicated constants falling out of sync.

By putting these values in one place that both apps import, there's a single source of truth. Change it in one file, both apps pick it up automatically. Monorepo tooling (pnpm workspaces) makes this straightforward — you just write `import { MAX_FILE_SIZE_BYTES } from '@repo/shared'`.

**How to say it in an interview:** "Shared constants eliminate drift between frontend and backend. In a monorepo, the shared package is a contract — both apps import the same values, so they can never disagree on limits, timeouts, or role definitions."

### Decision 2: `as const` assertion for literal types

**What's happening:** The `RATE_LIMITS` and `ROLES` objects use `as const` at the end.

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

---

## 3. Code Walkthrough

### Block 1: File size constant (line 1)

```ts
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
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

### Block 4: Role definitions and type (lines 11-16)

```ts
export const ROLES = {
  OWNER: 'owner',
  MEMBER: 'member',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
```

This is the most TypeScript-heavy part of the file, so let's break the type line down step by step:

1. **`typeof ROLES`** — gives us the type of the ROLES object: `{ readonly OWNER: "owner"; readonly MEMBER: "member" }`.
2. **`keyof typeof ROLES`** — gives us the keys of that type: `"OWNER" | "MEMBER"`.
3. **`(typeof ROLES)[keyof typeof ROLES]`** — looks up the values at those keys: `"owner" | "member"`.

So `Role` is the type `"owner" | "member"`. This is called a "union type" — a variable of type `Role` can only be one of those two strings.

The elegant part: if you add a new role to the `ROLES` object (say, `ADMIN: 'admin'`), the `Role` type automatically updates to `"owner" | "member" | "admin"`. You don't have to manually maintain a separate type definition. The type is derived from the runtime object, so they can never fall out of sync.

In the codebase, this gets used in function signatures like `function setRole(userId: string, role: Role)` — TypeScript ensures you can only pass valid role strings.

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

**How to say it in an interview:** "We chose hardcoded shared constants over environment variables because these values need to be identical on both the client and server and change infrequently. The trade-off is that changes require a redeploy, but for things like file size limits and role definitions, that's appropriate — you want those changes to go through code review and testing, not be flipped at runtime."

---

## 5. Patterns and Concepts Worth Knowing

### Eliminating Magic Numbers
A "magic number" is a numeric literal in code with no explanation — like `if (file.size > 10485760)`. Named constants replace them with readable names. This is one of the most universally agreed-upon best practices in software engineering. It makes code self-documenting and maintainable.

### Single Source of Truth (SSOT)
SSOT means every piece of knowledge in a system is defined in exactly one place. When both the frontend and backend need to know the file size limit, putting it in a shared package ensures there's one definition. If it were duplicated in both apps, they could drift apart — one of the most common sources of subtle bugs.

### Derived Types (`typeof` + `keyof`)
The `type Role = (typeof ROLES)[keyof typeof ROLES]` pattern is called a "derived type" — the type is computed from a runtime value rather than defined independently. This technique is powerful because it eliminates the possibility of the type and the value disagreeing. You'll see this pattern throughout well-written TypeScript codebases, especially for configuration objects, enum-like constants, and API route definitions.

### Immutable Configuration
Using `as const` makes configuration objects deeply readonly at the type level. This is related to the broader concept of immutability — data that can't be changed after creation. Immutable data is easier to reason about because you never have to wonder "did something modify this somewhere else?" In functional programming, immutability is the default; in TypeScript, `as const` gives you that guarantee for constant objects.

### Numeric Separators
The `15_000` syntax uses numeric separators — underscores in numbers that JavaScript ignores but humans can read. It's like writing "15,000" instead of "15000" — both are the same value, but one is easier to read at a glance. This feature was added in ES2021 and works in TypeScript too.

---

## 6. Potential Interview Questions

### Q1: "Why put constants in a shared package instead of defining them in each app?"

**Strong answer:** "Duplication across apps means the values can drift apart. If the frontend thinks the max file size is 10 MB but the backend was updated to 5 MB, users get confusing errors — the frontend accepts the upload but the server rejects it. A shared package creates a single source of truth that both apps import. When you change the constant, both apps pick it up in the next build. In a monorepo with pnpm workspaces, the import just works — `@repo/shared` resolves to the local package, no publishing to npm needed."

**Red flag:** "You could just copy-paste the values" or not understanding why duplication is a problem.

### Q2: "What does `as const` actually do? Why not just use a regular object?"

**Strong answer:** "`as const` does two things. First, it makes the entire object deeply readonly — TypeScript will error if any code tries to mutate it, like `ROLES.OWNER = 'admin'`. Second, it narrows the types from general to literal — instead of `OWNER: string`, it becomes `OWNER: 'owner'`. This enables the derived `Role` type to be `'owner' | 'member'` instead of just `string`. Without `as const`, any string would satisfy the `Role` type, defeating the purpose of type safety."

**Red flag:** "It's just to make it readonly" (missing the literal type narrowing), or not understanding the difference between `string` and `'owner'` as types.

### Q3: "Walk me through how the `Role` type is derived."

**Strong answer:** "It's a three-step type computation. `typeof ROLES` gives us the type of the constant object: `{ readonly OWNER: 'owner'; readonly MEMBER: 'member' }`. `keyof typeof ROLES` extracts the keys as a union: `'OWNER' | 'MEMBER'`. Then `(typeof ROLES)[keyof typeof ROLES]` is an indexed access type — it looks up the values at those keys, giving us `'owner' | 'member'`. The beauty is that adding a new entry to `ROLES` automatically extends the `Role` type. You never have to update the type manually."

**Red flag:** Not being able to explain any of the three steps, or saying "I'd just write `type Role = 'owner' | 'member'`" (which works but doesn't auto-update).

### Q4: "Why are the rate limits different for each tier?"

**Strong answer:** "Each tier protects against a different kind of abuse and has a different cost profile. Auth endpoints need tight limits — 10 per minute — because login and registration are targets for credential stuffing and brute-force attacks. AI endpoints are even tighter — 5 per minute — because each request calls a paid LLM API, and a single malicious user could generate hundreds of dollars in API costs. Public endpoints are more relaxed — 60 per minute — because they're cheap database reads and normal browsing easily stays under 1 request per second. The three-tier approach lets us be strict where the risk or cost is high and permissive where it's low."

**Red flag:** "I'd just use one rate limit for everything" without considering cost differences, or not recognizing that AI endpoints cost real money.

### Q5: "Could these constants be environment variables instead? When would you prefer one over the other?"

**Strong answer:** "You'd use environment variables for values that differ between environments — like database URLs, API keys, or feature flags. You'd use hardcoded constants for values that should be the same everywhere and change rarely — like file size limits, role names, or API timeout thresholds. These particular constants also need to be available in the browser, which can't access `process.env` directly. You could inject them via Next.js's `NEXT_PUBLIC_` prefix, but that adds complexity for no benefit. If we ever needed runtime-adjustable rate limits, we'd move that configuration to Redis or a database, not environment variables."

**Red flag:** "Everything should be an environment variable" or "Everything should be hardcoded" — both extremes miss the nuance.

---

## 7. Data Structures & Algorithms Used

| Concept | Where | Why |
|---|---|---|
| **Object literal** | `RATE_LIMITS`, `ROLES` | Groups related constants into a named structure. Cleaner than separate `const AUTH_MAX = 10; const AUTH_WINDOW = 60000;` declarations. |
| **Union type** | `Role = "owner" \| "member"` | Restricts a variable to a fixed set of string values, caught at compile time. Similar in purpose to an enum but lighter weight. |
| **Indexed access type** | `(typeof ROLES)[keyof typeof ROLES]` | Derives a type from an object's values — a TypeScript meta-programming technique that keeps types and values in sync. |
| **Numeric literal type** | `max: 10` (with `as const`) | The number `10` becomes the type `10`, not `number`. Enables exhaustive type checking in switch statements and prevents accidental reassignment. |

---

## 8. Impress the Interviewer

### Talking point 1: "Derived types eliminate a whole class of desynchronization bugs"
"One thing I really value about the `typeof` + `keyof` pattern is that it makes the type and the runtime value a single source of truth. In a lot of codebases, you see something like `type Role = 'owner' | 'member'` defined separately from the roles object. Then someone adds an `'admin'` role to the object but forgets to update the type, or vice versa. By deriving the type from the object, they can never go out of sync. It's a small technique but it's prevented real bugs in our codebase."

### Talking point 2: "Three-tier rate limiting reflects real cost modeling"
"The rate limit tiers are directly tied to the economic cost of each endpoint category. A public GET request costs maybe $0.0001 in compute. An AI request costs $0.01-0.05 in Claude API tokens — 100-500 times more expensive. If we used the same rate limit for both, either normal users would be throttled on public endpoints (frustrating) or we'd be hemorrhaging money on AI abuse (expensive). The tiered approach is like a gym having different rules for the free weights area versus the pool — different resources need different access controls."

### Talking point 3: "`as const` is TypeScript's answer to true enums"
"TypeScript has an `enum` keyword, but many TypeScript teams avoid it because enums generate extra JavaScript at runtime and have some quirky behaviors around reverse mappings. The `as const` object pattern gives you the same benefits — named constants, literal types, type-safe access — without any runtime overhead. The object is just a plain JavaScript object after compilation. It's become the idiomatic TypeScript approach for constant sets."
