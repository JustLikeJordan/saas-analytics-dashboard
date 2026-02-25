# config.ts — environment validation with Zod

## 1. 30-second elevator pitch

This file is the gatekeeper for the entire API server. Before anything else runs — before the database connects, before a single HTTP request is handled — this module checks that every required environment variable exists and has the right shape. It uses a library called Zod to define a "schema" (a blueprint) of what the environment *must* look like, then validates `process.env` against that blueprint at startup. If anything is missing or malformed, the server crashes immediately with a clear error message instead of silently breaking ten minutes later when some feature tries to use a variable that isn't there.

**How to say it in an interview:** "I used Zod to validate environment variables at startup so the app fails fast with an actionable error message instead of encountering cryptic undefined-value bugs at runtime. It's the 'crash early, crash loud' philosophy."

---

## 2. Why this approach?

### Decision 1: Schema-based validation instead of manual checks

**What's happening:** Instead of writing a bunch of `if (!process.env.DATABASE_URL) throw new Error(...)` checks by hand, we define a single schema object that describes every variable, its type, and its constraints. Zod then does all the checking for us in one pass.

**Why it matters:** Manual checks are tedious and easy to forget. When you add a new environment variable six months from now, you just add one line to the schema. With manual checks, you'd need to remember to add a new `if` block, and if you forget, you get a silent bug.

**How to say it in an interview:** "A schema-based approach gives me a single source of truth for configuration requirements. It's declarative: I describe *what* I need, not *how* to check it, and it scales cleanly as the app grows."

### Decision 2: Fail-fast at startup

**What's happening:** The `loadConfig()` function runs the moment the module is imported (because `export const env = loadConfig()` executes at import time). If validation fails, it throws an error, which crashes the Node.js process before the server starts listening for requests.

**Why it matters:** Imagine your server starts up, handles traffic for an hour, and then someone hits the Stripe checkout flow — only for it to crash because `STRIPE_SECRET_KEY` was never set. That's a production outage you could have caught before serving a single request. Fail-fast means you find out about misconfigurations during deployment, not during a customer interaction.

**How to say it in an interview:** "The server validates its entire configuration at boot time. If any required variable is missing, it refuses to start. This pushes configuration errors to deploy-time, which is when you actually want to catch them — not at 2 AM when a user hits an edge case."

### Decision 3: Type inference from the schema (`z.infer`)

**What's happening:** The line `export type Env = z.infer<typeof envSchema>` tells TypeScript: "Look at that Zod schema and figure out what the resulting object's type would be." This means you define your validation rules once and get TypeScript types for free — you never have to keep a separate interface in sync with your validation logic.

**Why it matters:** In many codebases, you'll see a `Config` interface *and* separate validation code, and they can drift apart. Here, the type is derived directly from the schema, so they can never disagree.

**How to say it in an interview:** "I used Zod's type inference so the TypeScript types are derived directly from the validation schema. There's one source of truth — the schema — and the types follow automatically. No drift, no duplication."

### Decision 4: Human-readable error formatting

**What's happening:** When validation fails, instead of dumping a raw Zod error object (which is deeply nested and hard to read), the code reformats it into a clean list like:

```
Missing or invalid environment variables:
  DATABASE_URL: Required
  JWT_SECRET: String must contain at least 32 character(s)
```

**Why it matters:** The person reading this error is probably a developer setting up the project for the first time, or an ops engineer debugging a deployment. A clear, scannable list saves them minutes of confusion.

**How to say it in an interview:** "I formatted the validation errors into a human-readable list so that when a deploy fails, the engineer can immediately see which variables are missing without digging through a stack trace."

---

## 3. Code walkthrough

### Block 1: The schema definition (lines 3-15)

```ts
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  CLAUDE_API_KEY: z.string().min(1),
  // ...
  PORT: z.coerce.number().default(3001),
});
```

Think of this like a form you're filling out. Each field has rules:
- `z.string().url()` means "must be a string, and that string must look like a URL." If someone puts `DATABASE_URL=not-a-url`, Zod will reject it.
- `z.string().min(1)` means "must be a string with at least one character." This catches the case where someone sets `CLAUDE_API_KEY=` (empty string).
- `z.string().min(32)` on `JWT_SECRET` enforces a minimum length because short secrets are a security risk. A 32-character minimum ensures at least 256 bits of entropy.
- `z.enum(['development', 'production', 'test'])` means `NODE_ENV` can only be one of those three exact strings. Anything else (like a typo: `NODE_ENV=producton`) gets rejected.
- `z.coerce.number().default(3001)` is interesting — `coerce` means "if this is the string `"3001"`, convert it to the number `3001`." Environment variables are always strings, so coercion is needed for numeric values. The `.default(3001)` means if `PORT` isn't set at all, just use 3001.

### Block 2: The type export (line 17)

```ts
export type Env = z.infer<typeof envSchema>;
```

This is a TypeScript-only construct — it generates no JavaScript code at runtime. It tells TypeScript "the `Env` type is whatever shape comes out of that schema." So everywhere in the codebase that imports `env`, TypeScript knows `env.PORT` is a `number`, `env.NODE_ENV` is `'development' | 'production' | 'test'`, and so on. You get autocomplete and type-checking for free.

### Block 3: The Validation Function (lines 19-30)

```ts
function loadConfig(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // format and throw
  }
  return result.data;
}
```

The key method here is `safeParse` (not `parse`). The difference:
- `parse()` throws an exception if validation fails.
- `safeParse()` returns a result object: `{ success: true, data: ... }` or `{ success: false, error: ... }`.

We use `safeParse` because we want to format the error ourselves before throwing. If we used `parse`, we'd have to wrap it in a try-catch just to reformat the error, which is clunkier.

The error formatting logic iterates over the formatted error object, filters out the top-level `_errors` key (which is Zod internal bookkeeping), and builds a clean string.

### Block 4: The Export (line 32)

```ts
export const env = loadConfig();
```

This single line does a lot of work. Because it's a top-level `const` that calls a function, it executes the moment any other file imports from `config.ts`. This is what makes the fail-fast behavior work: the very first `import { env } from './config.js'` in your app triggers validation.

---

## 4. Complexity and Trade-offs

### Runtime Complexity

This code runs exactly once at startup. It iterates over a fixed set of environment variable names (13 in this schema). The time complexity is O(n) where n is the number of variables, but n is tiny and constant. This adds essentially zero overhead — maybe 1-2 milliseconds at boot.

### Trade-off 1: Startup crash vs. graceful degradation

**Choice made:** Crash if any variable is missing.
**Alternative:** You could let the server start and disable features that depend on missing variables (e.g., skip Stripe if `STRIPE_SECRET_KEY` is missing).
**Why we chose crashing:** In a SaaS product handling payments, a "partially working" server is more dangerous than a server that refuses to start. A partial server could silently fail to process payments, which is worse than downtime. This is a deliberate choice for a multi-tenant system where data integrity matters.

### Trade-off 2: Zod as a dependency vs. writing validation by hand

**Choice made:** Use Zod (adds ~50KB to the bundle).
**Alternative:** Write manual `if` checks or use a simpler library like `envalid`.
**Why we chose Zod:** The project already uses Zod elsewhere (API request validation, form validation in the frontend). Using the same library for environment validation means one fewer dependency to learn and maintain. Consistency across the stack matters for a team.

### Trade-off 3: All-or-nothing validation vs. partial checks

**Choice made:** Validate every variable in one pass and report all failures at once.
**Alternative:** Check variables one at a time and fail on the first missing one.
**Why we chose all-at-once:** If three variables are missing, you want to know about all three in one deploy attempt, not fix one, redeploy, find the next one, fix it, redeploy again. This respects the developer's time.

---

## 5. Patterns and Concepts Worth Knowing

### Pattern: Schema Validation

A schema is a formal description of what valid data looks like. Instead of writing imperative code ("check this, then check that"), you write a declarative specification ("this field must be a URL, that field must be a number"). The schema library handles the actual checking. This pattern shows up everywhere: database schemas, API request validation, form validation, configuration files. Zod is one of many schema libraries — JSON Schema, Joi, Yup, and Ajv are others you'll encounter.

### Pattern: Fail-Fast Initialization

The idea is simple: if something is wrong, find out as early as possible. The earlier you catch a problem, the cheaper it is to fix. In this case, "as early as possible" means "at import time, before the server starts." This pattern applies broadly — database migration checks at startup, SSL certificate validation before accepting connections, etc.

### Concept: Environment Variables

Environment variables are key-value pairs set outside your code, usually by the operating system, a shell, or a deployment platform. They're the standard way to pass configuration (especially secrets) to an application without hardcoding values in source code. `process.env` in Node.js is an object containing all environment variables as string key-value pairs.

### Concept: Type Inference

Type inference is when the type system figures out types automatically instead of you writing them out by hand. `z.infer<typeof envSchema>` is an advanced form of this — it asks TypeScript to "reverse engineer" the output type from the runtime validation schema. This bridges the gap between runtime validation (JavaScript) and compile-time type checking (TypeScript).

### Pattern: Single Source of Truth (SSOT)

This file is a textbook example of SSOT. The schema defines: (1) what variables are required, (2) what types they must be, (3) what constraints they must satisfy, and (4) the TypeScript type for the resulting config object. All four concerns are derived from one place. If you add a new variable, you change one line in one file, and everything — validation, types, error messages — updates automatically.

---

## 6. Potential Interview Questions

### Q1: "Why validate environment variables at startup instead of where they're used?"

**Strong answer:** "Validating at startup follows the fail-fast principle. If a required secret is missing, I want to know during deployment — not when a customer hits the payment flow at midnight. Centralized validation also means every variable is checked in one place, so you can't forget to validate one. It gives the entire application a guarantee: if the server is running, the config is valid."

**Red flag answer:** "Because that's what the tutorial showed." (Shows no understanding of why the pattern exists.)

### Q2: "What's the difference between `parse` and `safeParse` in Zod?"

**Strong answer:** "`parse` throws a ZodError if validation fails, which means you'd need a try-catch to handle it. `safeParse` returns a discriminated union — an object with `success: true` and the data, or `success: false` and the error. I used `safeParse` here because I wanted to format the error into a human-readable message before throwing. It gives you more control over error handling without the overhead of exception flow."

**Red flag answer:** "I think they're the same thing." (Shows unfamiliarity with the library they're using.)

### Q3: "How does `z.coerce.number()` work, and why is it needed for PORT?"

**Strong answer:** "Environment variables in Node.js are always strings — `process.env.PORT` gives you `'3001'`, not `3001`. `z.coerce.number()` first converts the string to a number using JavaScript's `Number()` constructor, then validates it's actually a valid number. Without coercion, the validation would fail because `'3001'` is a string, not a number. This is a common gotcha when working with `process.env`."

**Red flag answer:** "PORT is a number so I used a number validator." (Misses the important detail that env vars are always strings.)

### Q4: "What happens if someone adds a new feature that needs a new API key but forgets to update this schema?"

**Strong answer:** "They'd access `process.env.NEW_API_KEY` directly, which TypeScript wouldn't type-check, and it could be `undefined` at runtime. To prevent this, I'd establish a team convention: all environment variables must go through the schema. You can enforce this with a lint rule that flags direct `process.env` access outside of `config.ts`. The schema becomes the single source of truth."

**Red flag answer:** "That's just a code review problem." (Misses the opportunity to discuss automated enforcement.)

### Q5: "Isn't it a security risk to log the names of missing environment variables?"

**Strong answer:** "Good catch — but notice we only log the *names* of the variables and generic error messages like 'Required,' never the *values*. Logging the variable names in a startup error is generally safe and necessary for debugging. If we were logging values, that would be a serious security concern, especially for `JWT_SECRET` or `STRIPE_SECRET_KEY`. The distinction between logging keys versus values matters a lot."

**Red flag answer:** "We should encrypt all error messages." (Overcomplicates the solution and misunderstands the actual risk.)

---

## 7. Data Structures & Algorithms Used

### Zod Schema Object (Declarative Configuration)

**What it is:** The Zod schema is essentially a tree of validator functions. The root is `z.object()`, which holds key-value pairs where each value is a validator chain (e.g., `z.string().url()` is a chain of "must be string" then "must match URL pattern"). At runtime, Zod walks this tree for each input property and collects all validation errors.

**Analogy:** Think of it like a customs checkpoint at an airport. Each lane (schema field) has its own rules. Some lanes check for valid passports (URLs), some check for minimum baggage weight (min length), some only allow certain nationalities (enums). Every traveler (env var) goes through their assigned lane, and at the end you get a full report of who passed and who didn't.

### Discriminated Union (safeParse Result)

**What it is:** The return type of `safeParse` is `{ success: true, data: Env } | { success: false, error: ZodError }`. This is called a discriminated union — a type where one field (`success`) tells you which shape the rest of the object has. When you check `if (!result.success)`, TypeScript narrows the type so that inside the `if` block, `result.error` is available, and outside it, `result.data` is available.

**Analogy:** It's like opening an envelope that either has a check (success) or a rejection letter (failure). You look at the first line to know which one you got, and that tells you what else is inside.

### Key-Value Iteration (Error Formatting)

**What it is:** `Object.entries(formatted)` converts an object into an array of `[key, value]` pairs, which is then filtered and mapped to produce the error message string. This is a straightforward O(n) iteration over a small, fixed-size collection.

---

## 8. Impress the Interviewer

### Talking Point 1: "This pattern enables infrastructure-as-code validation"

"In a real deployment pipeline, this schema is a contract between the application and the infrastructure. If we use Terraform or Pulumi to provision secrets, we can export the schema's required keys and automatically verify that all secrets are provisioned before deployment even starts. It's a bridge between your app code and your infrastructure code, not just a runtime check."

### Talking Point 2: "Zod schemas compose across the stack"

"Because we're already using Zod for API request validation and form validation on the frontend, the team only needs to learn one validation paradigm. You could even share schemas between the frontend and backend in a monorepo (which we do via the `packages/shared` workspace). A Zod schema for a Stripe webhook payload, for example, can be defined once and used in both the API's request handler and the frontend's type definitions."

### Talking Point 3: "The `.default()` pattern handles development ergonomics"

"Notice that `PORT` has a default but `DATABASE_URL` doesn't. That's intentional — a developer should never accidentally connect to the wrong database, but defaulting the port to 3001 is safe and convenient. Each field's constraints are a micro-decision about developer experience versus safety. In a team setting, these constraints double as documentation: a new developer reading this schema immediately knows what the app needs."
