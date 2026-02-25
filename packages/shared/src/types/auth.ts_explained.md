# types/auth.ts — Interview-Ready Documentation

## Section 1: 30-Second Elevator Pitch

This file exists so you never have to write `z.infer<typeof userSchema>` everywhere. It takes each Zod schema from the sibling `schemas/auth.ts` file and extracts a named TypeScript type from it. The result: you import `User`, `Org`, `Role` as clean type names, and the actual shape is always derived from the Zod schemas — one source of truth, zero drift.

**How to say it in an interview:** "This is the type extraction layer — it uses `z.infer` to derive TypeScript types from Zod schemas. Types are inferred, not hand-written, so they're guaranteed to match the validation logic. It's the single-source-of-truth pattern applied to the type system."

---

## Section 2: Why This Approach?

### Decision 1: Inferred types over hand-written interfaces

**What's happening:** Instead of writing `interface User { id: number; email: string; ... }` by hand, we write `type User = z.infer<typeof userSchema>`. The type is automatically computed from the schema definition. If you add a field to the schema, the type updates instantly.

**How to say it in an interview:** "Types are inferred from schemas, not maintained separately. This eliminates the entire class of bugs where the validation schema and the TypeScript type disagree — which is surprisingly common when they're maintained as separate definitions."

**Over alternative:** Hand-written interfaces require manual synchronization with the schemas. Forget to update one when you add a field and you get either a runtime validation error or a type error, depending on which side is behind.

### Decision 2: `import type` for zero-runtime footprint

**What's happening:** The `import type` syntax tells TypeScript "I only need these for type checking, not at runtime." When the code compiles to JavaScript, these imports vanish completely. The file has zero runtime cost — no code, no imports, nothing.

**How to say it in an interview:** "We use `import type` to ensure this module is purely a compile-time artifact. It disappears entirely from the JavaScript output, so it adds zero bytes to the bundle."

---

## Section 3: Code Walkthrough

### Import (lines 1-12)

Imports the Zod `z` type helper and all schemas from `../schemas/auth.js`. The `import type` keyword means these imports are stripped during compilation — no runtime dependency on the schemas module from this file.

### Type exports (lines 14-22)

Nine type aliases, each extracting a TypeScript type from a Zod schema using `z.infer`. For example, `z.infer<typeof userSchema>` produces `{ id: number; email: string; name: string; googleId: string | null; ... }` — the exact shape the schema validates.

This gives consumers clean names: `User` instead of `z.infer<typeof userSchema>`.

---

## Section 4: Complexity and Trade-offs

**No runtime complexity.** This file compiles to empty JavaScript. It's purely a type-system convenience.

**The trade-off is indirection.** To understand what `User` actually contains, you need to read the schema definition in `schemas/auth.ts`. This is one hop of indirection that most developers find acceptable for the DRY benefit.

**How to say it in an interview:** "The only trade-off is one level of indirection — you need to check the schema to see the type's fields. But this is worth it because it guarantees the types match the validation logic at all times."

---

## Section 5: Patterns and Concepts Worth Knowing

### Type Inference from Schemas (`z.infer`)

Zod's `z.infer<typeof schema>` is a TypeScript utility type that computes the output type of a Zod schema. It recursively resolves nested objects, enums, nullable fields, and coerced types into a plain TypeScript type.

**Where it appears:** Every line of this file.

**Interview-ready line:** "z.infer extracts TypeScript types from Zod schemas at compile time. This is the mechanism that makes single-source-of-truth possible — the schema defines both validation and typing."

### `import type` (Type-Only Imports)

TypeScript's `import type` ensures the import is used only for type checking and is completely removed during compilation. This prevents circular dependency issues at runtime and keeps bundle sizes minimal.

**Where it appears:** Lines 1-12 — the entire import block uses `import type`.

**Interview-ready line:** "import type is stripped during compilation, so this module has zero runtime cost. It's a purely compile-time convenience for named type exports."

---

## Section 6: Potential Interview Questions

### Q1: "Why not just export the types alongside the schemas in the same file?"

**Strong answer:** "Separation of concerns. Schemas carry runtime code (Zod validators). Types are compile-time only. Keeping them separate means a consumer that only needs types doesn't pull in the Zod runtime. It also makes the import ergonomics cleaner: `import type { User } from 'shared/types'` vs `import type { userSchema } from 'shared/schemas'; type User = z.infer<typeof userSchema>`."

**Red flag answer:** "It's just how the project is organized." — The interviewer wants the technical reason about runtime vs compile-time separation.

### Q2: "What happens if you change a schema but forget to update this file?"

**Strong answer:** "Nothing needs updating — that's the point. Since types are inferred from schemas, they update automatically. The `z.infer` type is recomputed every time TypeScript checks the code. There's no manual step to forget."

**Red flag answer:** "You'd get a type mismatch." — This would be true for hand-written types, but `z.infer` makes it impossible. The question is testing whether you understand the inference mechanism.

### Q3: "Could this file cause circular dependencies?"

**Strong answer:** "No. `import type` is erased at compile time, so it can't create runtime circular dependencies. The types flow one direction: schemas → types → consumers. Even if a consumer imported both schemas and types, there's no cycle because types has no runtime code."

**Red flag answer:** "Circular dependencies aren't possible in TypeScript." — They absolutely are, and they cause real issues. The right answer is that `import type` specifically avoids them.

---

## Section 7: Data Structures & Algorithms Used

No data structures or algorithms — this file is purely a compile-time type extraction layer. It compiles to empty JavaScript.

---

## Section 8: Impress the Interviewer

### The Monorepo Type Contract

**What's happening:** These types are exported from `packages/shared` and imported by both `apps/web` (frontend) and `apps/api` (backend). They form the contract between the two applications. When a schema changes, TypeScript immediately shows every place in both apps that needs to adapt.

**How to bring it up:** "These shared types are the API contract between frontend and backend. A schema change propagates through the type system to both apps immediately — TypeScript shows every consumer that needs to handle the change. It's cross-application type safety without code generation or OpenAPI specs."
