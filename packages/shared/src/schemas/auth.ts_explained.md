# schemas/auth.ts — Interview-Ready Documentation

## Section 1: 30-Second Elevator Pitch

This file is the single source of truth for what "valid data" looks like in the auth system. It defines Zod schemas — objects that describe the shape, types, and constraints of users, orgs, memberships, JWTs, and API payloads. These schemas do double duty: they validate data at runtime (catch bad input before it hits the database) and generate TypeScript types at compile time (catch type errors before code even runs). One definition, two layers of safety.

**How to say it in an interview:** "This is the shared validation layer using Zod schemas — they define data shapes used by both the API and frontend. Each schema is a single source of truth for runtime validation and TypeScript type inference, eliminating the drift between what the code expects and what it actually validates."

---

## Section 2: Why This Approach?

### Decision 1: Zod for runtime validation + type inference

**What's happening:** In TypeScript, types disappear when your code compiles to JavaScript. A function typed as `(email: string)` won't stop someone from passing `null` at runtime — the type only exists at compile time. Zod solves this by giving you objects that validate data at runtime AND generate TypeScript types. One schema, two purposes.

**How to say it in an interview:** "Zod bridges the gap between compile-time type safety and runtime validation. TypeScript types are erased at runtime, but Zod schemas persist and actively validate incoming data — so we get type inference for development and runtime protection for production."

**Over alternative:** Hand-writing TypeScript interfaces alongside manual validation logic (like `if (!email || typeof email !== 'string')`) means maintaining two parallel definitions that drift apart over time.

### Decision 2: Separate entity schemas vs. create schemas

**What's happening:** `userSchema` describes a full user record (including `id`, `createdAt`, etc.), while `createUserSchema` only includes the fields needed when creating a user. The database auto-generates `id` and `createdAt`, so the create schema shouldn't include them — it would be misleading to accept an `id` from user input.

**How to say it in an interview:** "We have separate entity schemas (full record with generated fields) and create schemas (only user-provided fields). This prevents clients from submitting auto-generated fields like IDs or timestamps, and gives us distinct types for different contexts."

**Over alternative:** Using one schema with optional fields is looser — it doesn't enforce the difference between "this field exists on a saved record" and "this field shouldn't be in the request."

### Decision 3: `z.coerce.date()` for timestamp fields

**What's happening:** Data crosses boundaries — JSON from an API, rows from a database, URL parameters. Timestamps might arrive as ISO strings (`"2024-01-15T..."`) or Date objects. `z.coerce.date()` accepts both and always produces a JavaScript `Date` object. It's like an adaptor that accepts both plug types and always outputs the right one.

**How to say it in an interview:** "We use `z.coerce.date()` for timestamps to handle the string/Date mismatch between JSON serialization and JavaScript — API responses send ISO strings, but application code works with Date objects. The coercion normalizes them automatically."

**Over alternative:** `z.date()` rejects strings, which means every JSON response would fail validation. `z.string()` accepts the string but doesn't give you a Date object.

### Decision 4: Pinned to Zod 3.x

**What's happening:** Zod 4 exists but introduces breaking changes in its API. Drizzle ORM's `drizzle-zod` package depends on Zod 3.x internals. Upgrading to Zod 4 would break the ORM integration. So we pin to 3.x until drizzle-zod catches up.

**How to say it in an interview:** "We're deliberately on Zod 3.x because drizzle-zod depends on Zod 3 internals. This is a pragmatic pinning decision — the Zod 4 upgrade is blocked by a downstream dependency, not by preference."

---

## Section 3: Code Walkthrough

### roleSchema (line 3)

`z.enum(['owner', 'member'])` — a schema that only accepts these two exact strings. This mirrors the PostgreSQL `user_role` enum from the database schema. Using the same values in both layers means a role that's valid in Zod is guaranteed to be valid in PostgreSQL.

### Entity schemas: userSchema, orgSchema, userOrgSchema (lines 5-29)

Full record shapes including auto-generated fields (`id`, `createdAt`, `updatedAt`). These are used to validate data coming *out* of the database or *into* the frontend. The `z.coerce.date()` on timestamp fields handles the string → Date conversion from JSON.

`avatarUrl` is `z.string().url().nullable()` — it must be a valid URL if present, or explicitly `null`. Not just any string.

### Create schemas: createUserSchema, createOrgSchema (lines 31-41)

Subset schemas for creation payloads. `createOrgSchema` has a regex on the slug field: `/^[a-z0-9-]+$/` enforces lowercase alphanumeric with hyphens only. This is validated at the schema level, so invalid slugs are rejected before any database call.

### Auth-specific schemas (lines 43-70)

`jwtPayloadSchema` validates the structure of decoded JWTs. `googleCallbackSchema` validates the OAuth callback body (code + state). `loginResponseSchema` defines the shape of what the callback endpoint returns to the frontend. These are the API contract — both the backend (to ensure it sends correct data) and the frontend (to validate received data) can use them.

---

## Section 4: Complexity and Trade-offs

**Validation is O(n)** where n is the number of fields. For these small schemas (< 15 fields), validation takes microseconds and is never a bottleneck.

**Schema explosion risk:** As the app grows, this file could become unwieldy. The common solution is splitting by domain — `schemas/auth.ts`, `schemas/dataset.ts`, etc. The current structure already does this (the file is `auth.ts`, not `schemas.ts`).

**Zod runtime cost:** Zod schemas add a small bundle size (~14KB minified) to the frontend if tree-shaking doesn't eliminate unused schemas. For a monorepo shared package, this is negligible.

**How to say it in an interview:** "The main trade-off is co-locating validation with type definitions, which creates a runtime dependency on Zod. The 14KB bundle cost is acceptable for the type safety and validation guarantees it provides."

---

## Section 5: Patterns and Concepts Worth Knowing

### Schema-First / Single Source of Truth

Instead of defining types and validation separately, the schema IS the type definition. You define the shape once in Zod, then extract the TypeScript type with `z.infer`. If you change the schema, the type updates automatically. No drift.

**Where it appears:** Every schema in this file. The companion `types/auth.ts` file extracts types via `z.infer`.

**Interview-ready line:** "The Zod schema is the single source of truth — TypeScript types are inferred from it, not maintained separately. This eliminates the entire category of bugs where the validation logic and the type definition disagree."

### Runtime Validation at System Boundaries

Validation happens where untrusted data enters the system — API requests, OAuth callbacks, database results. Internal function-to-function calls trust the types because the data was already validated at entry.

**Where it appears:** `googleCallbackSchema` validates the OAuth callback, `loginResponseSchema` validates the API response shape.

**Interview-ready line:** "We validate at system boundaries — where data crosses from untrusted to trusted. Internal code operates on validated types, which eliminates redundant checks throughout the codebase."

### Enum as Discriminated Union

`z.enum(['owner', 'member'])` creates a type that's `'owner' | 'member'` — TypeScript's discriminated union. This is more precise than `string` because the compiler knows exactly which values are valid and can check exhaustiveness in switch statements.

**Where it appears:** `roleSchema` and its use in `userOrgSchema`.

**Interview-ready line:** "We use Zod enums for role types rather than plain strings, giving us both runtime validation and TypeScript discriminated unions. This means the compiler catches invalid role values at build time and Zod catches them at runtime."

---

## Section 6: Potential Interview Questions

### Q1: "Why use Zod instead of just TypeScript interfaces?"

**Strong answer:** "TypeScript types are erased at runtime — they can't validate incoming data from APIs, user input, or database results. Zod gives us runtime validation plus automatic type inference. One definition covers both compile-time safety and runtime protection."

**Red flag answer:** "Zod is more popular." — Popularity isn't a technical argument. The interviewer wants to hear about the compile-time vs runtime gap.

### Q2: "What happens if the Zod schema and database schema get out of sync?"

**Strong answer:** "The Zod schema validates what the application expects, and the database schema defines what's stored. If they diverge — say, a column is added to the database but not to Zod — the extra column would be silently ignored on read (Zod strips unknown keys by default) or the insert would fail. The fix is to use drizzle-zod to generate Zod schemas directly from the database schema, ensuring they stay aligned."

**Red flag answer:** "They can't get out of sync because they're both TypeScript." — They absolutely can. Being in the same language doesn't mean they're connected.

### Q3: "Why separate entity and create schemas instead of using `.partial()` or `.pick()`?"

**Strong answer:** "Explicit schemas are clearer about intent. A create schema that's derived from the entity schema via `.omit({ id: true, createdAt: true })` is technically equivalent but harder to read — you need to mentally subtract fields. Separate schemas make it obvious at a glance what each context expects. The trade-off is some duplication, but for 5-8 fields, clarity wins."

**Red flag answer:** "DRY — you should never repeat yourself." — DRY is a guideline, not a law. Sometimes a little repetition is clearer than abstraction.

### Q4: "What does `z.coerce.date()` do that `z.date()` doesn't?"

**Strong answer:** "JSON doesn't have a Date type — dates are serialized as ISO strings. When data comes from a JSON API or database driver, timestamps arrive as strings. `z.coerce.date()` accepts both strings and Date objects and converts them to Dates. `z.date()` only accepts Date objects, which means every JSON-parsed timestamp would fail validation."

**Red flag answer:** "Coerce just means it converts the type." — The interviewer wants to hear about the JSON serialization boundary specifically.

---

## Section 7: Data Structures & Algorithms Used

Zod schemas internally compile to a chain of validator functions — each field gets a predicate that checks its type and constraints. Validation runs O(n) where n is the number of fields. For nested objects, it recurses into sub-schemas. The `z.enum` internally uses a `Set` for O(1) membership checks.

---

## Section 8: Impress the Interviewer

### Shared Package Means Validated on Both Ends

**What's happening:** These schemas live in `packages/shared`, not in the API or frontend alone. Both apps import the same schemas. The API uses `googleCallbackSchema.safeParse(req.body)` to validate input; the frontend could use `loginResponseSchema.safeParse(data)` to validate the API response.

**Why it matters:** In most apps, the API and frontend have separate, hand-maintained definitions of what data looks like. They drift apart over time, causing subtle bugs. A shared schema package makes it impossible for the two sides to disagree.

**How to bring it up:** "The schemas are in a shared package imported by both the API and the frontend. This means the same validation logic runs on both sides — the API validates what it receives, the frontend validates what the API sends back. Any contract change is a single-file edit that TypeScript enforcement propagates to both consumers."

### Regex Validation on Slugs Is a Security Measure

**What's happening:** `createOrgSchema` enforces `/^[a-z0-9-]+$/` on slugs. This isn't just formatting — it prevents injection attacks. If slugs were unrestricted, a malicious slug could contain path traversal characters (`../`), URL-encoding tricks, or characters that break routing.

**How to bring it up:** "The slug regex isn't just cosmetic — it's input sanitization. By restricting to `[a-z0-9-]`, we prevent path traversal, URL encoding attacks, and routing ambiguity. Validation at the schema level means no slug ever reaches the database without passing this check."
