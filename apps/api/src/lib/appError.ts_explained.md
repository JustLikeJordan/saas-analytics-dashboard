# appError.ts -- Explained

## 1. 30-Second Elevator Pitch

This file creates a family of custom error classes for our Express API. Instead of throwing generic `new Error("something broke")` everywhere and then scrambling to figure out what HTTP status code to send, we define purpose-built error types -- `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, and `ExternalServiceError` -- that each carry their own status code, a machine-readable error code string, and optional detail data. Any code in the API can throw one of these, and a single centralized error handler (in `errorHandler.ts`) catches it and knows exactly what to send back to the client.

**How to say it in an interview:** "We built a custom error hierarchy so that any layer of the application -- routes, services, middleware -- can throw a typed error with its HTTP status code baked in. A single error-handling middleware catches everything and formats a consistent JSON response. It separates the 'what went wrong' decision from the 'how to respond' decision."

---

## 2. Why This Approach?

### Decision 1: A base class (`AppError`) with specialized subclasses

**What's happening:** We have one parent class `AppError` that extends the built-in JavaScript `Error`. Then we create child classes like `ValidationError` and `AuthenticationError` that extend `AppError`. Each child pre-fills the status code and error code string so the thrower doesn't have to remember them.

Think of it like a restaurant kitchen. `AppError` is the general concept of "something the kitchen needs to tell the waiter about." `ValidationError` is specifically "the customer ordered something that isn't on the menu" (400 -- bad request). `NotFoundError` is "we're out of that dish" (404). The waiter (error handler) looks at which slip came out and knows exactly what to say to the customer.

**Why not just use plain `Error` with a status code property?** You could, but then every `catch` block has to check `if (err.statusCode === 400)` or `if (err.code === 'VALIDATION_ERROR')`. With subclasses, you can use `instanceof` checks, which are cleaner and let TypeScript narrow the type for you automatically.

**How to say it in an interview:** "We chose class inheritance over ad-hoc error properties because `instanceof` checks are more readable, TypeScript can narrow the type automatically, and adding a new error category is a one-liner subclass instead of updating constants and conditionals everywhere."

### Decision 2: `readonly` properties with constructor shorthand

**What's happening:** TypeScript has a shorthand where writing `public readonly code: string` in the constructor parameter list both declares the property on the class and assigns the argument to it. The `readonly` keyword means once an `AppError` is created, you can't accidentally change its `code` or `statusCode` later. Errors are facts -- they shouldn't mutate after creation.

**How to say it in an interview:** "The error objects are immutable after construction. This is important in async code -- if an error gets passed through multiple middleware or logging layers, you need confidence that nobody changed its status code along the way."

### Decision 3: Machine-readable `code` strings alongside human-readable `message`

**What's happening:** Every error carries two descriptions: a `message` like `"Authentication required"` (meant for humans reading logs or debugging) and a `code` like `"AUTHENTICATION_ERROR"` (meant for frontend code to switch on). The frontend can show a localized message in any language but still use the code string to decide which UI to render.

Imagine you're building a mobile app that consumes this API. Your app is available in English and Spanish. You can't parse the English message string to figure out what happened -- that's fragile and breaks when someone changes the wording. But the code `"AUTHENTICATION_ERROR"` is a stable contract: your app sees that code and shows the login screen, regardless of language.

**How to say it in an interview:** "We separate machine-readable error codes from human-readable messages. This makes the API stable for client developers -- they can switch on the code string without worrying about message text changes, and it supports internationalization since the client can map codes to localized messages."

### Decision 4: Optional `details` field typed as `unknown`

**What's happening:** Some errors need to carry extra context. A `ValidationError` might want to include which fields failed validation and why. An `ExternalServiceError` might include the upstream response. The `details` field is typed as `unknown` (not `any`) which means TypeScript forces you to check the type before using it -- this is safer.

The conditional spread `...(err.details !== undefined && { details: err.details })` in the error handler means the `details` key only appears in the JSON response when there actually are details. Clients get a clean, predictable shape.

**How to say it in an interview:** "The optional details field uses `unknown` instead of `any` to maintain type safety. It's structurally flexible -- validation errors can attach field-level messages, external service errors can attach upstream responses -- without sacrificing TypeScript's guarantees."

### Decision 5: Default messages on subclasses

**What's happening:** `AuthenticationError` defaults to `"Authentication required"` and `AuthorizationError` defaults to `"Insufficient permissions"`. This means most call sites can just write `throw new AuthenticationError()` without even passing a message. But if you need a custom message -- say `throw new AuthenticationError("Token expired")` -- you still can.

This is a small ergonomic choice, but in a codebase with hundreds of route handlers, it adds up. It also ensures consistency: every auth error says the same thing unless someone deliberately overrides it.

**How to say it in an interview:** "Default messages reduce boilerplate and enforce consistency across the codebase. Most call sites throw a one-liner, but the escape hatch for custom messages is always there."

---

## 3. Code Walkthrough

### Block 1: The base `AppError` class (lines 1-11)

```ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}
```

This is the foundation. Let's break down what each line does:

- `extends Error` -- JavaScript has a built-in `Error` class. By extending it, our `AppError` gets everything a normal error has: a `message` property, a `stack` trace (the list of function calls that led here), and compatibility with `try/catch` and `instanceof`.

- `super(message)` -- This calls the parent `Error` constructor and sets `this.message`. If you forget this, the error won't have a message.

- `this.name = this.constructor.name` -- By default, all errors have `name` set to `"Error"`. This line makes it so a `ValidationError` shows up as `"ValidationError"` in stack traces and logs, not just `"Error"`. The trick is using `this.constructor.name` instead of hardcoding `"AppError"` -- this way, subclasses automatically get their own name without having to set it themselves.

- The four constructor parameters become properties: `message` (inherited from `Error`), `code` (the machine-readable string), `statusCode` (the HTTP status), and `details` (optional extra data). The `?` after `details` makes it optional.

### Block 2: `ValidationError` (lines 13-17)

```ts
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}
```

This is the pattern every subclass follows: extend `AppError`, call `super(...)` with the specific code and status code pre-filled. The caller only needs to provide the parts that change (message, maybe details). HTTP 400 means "bad request" -- the client sent something the server can't process. Think: missing required fields, wrong data types, a date in the future when it should be in the past.

### Block 3: `AuthenticationError` (lines 19-23)

```ts
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}
```

HTTP 401 means "who are you?" The server doesn't know who is making the request. No token, expired token, invalid token. Notice the default parameter `message = 'Authentication required'` -- this is the default message pattern mentioned in the decisions above.

### Block 4: `AuthorizationError` (lines 25-29)

```ts
export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}
```

HTTP 403 means "I know who you are, but you're not allowed to do that." The difference between 401 and 403 is a classic interview topic. 401 = "show me your ID." 403 = "I see your ID, but you're not on the guest list."

In this project, a member trying to access owner-only billing settings would get a 403. Someone with no login token at all would get a 401.

### Block 5: `NotFoundError` (lines 31-35)

```ts
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
  }
}
```

HTTP 404 -- the resource doesn't exist. In a multi-tenant SaaS app, this is also used when a resource exists but belongs to a different organization. You return 404 instead of 403 to avoid leaking information about other tenants' data. This is called "information hiding" and it's a deliberate security choice.

### Block 6: `ExternalServiceError` (lines 37-41)

```ts
export class ExternalServiceError extends AppError {
  constructor(service: string, details?: unknown) {
    super(`External service error: ${service}`, 'EXTERNAL_SERVICE_ERROR', 502, details);
  }
}
```

HTTP 502 means "bad gateway" -- our server tried to talk to another service (like the Claude AI API for generating insights, or a payment processor) and that service failed or returned something unexpected. The `service` parameter gets baked into the message so logs immediately tell you which upstream service had the problem. The `details` field can carry the upstream error for debugging.

---

## 4. Complexity and Trade-offs

### Runtime Complexity

This code is all O(1) -- constant time. Creating an error object is just allocating memory and setting a few properties. There are no loops, no data structure lookups, no computation. The one hidden cost is `Error`'s stack trace capture, which walks the call stack -- but JavaScript engines optimize this heavily, and it only happens when an error is actually thrown (the "sad path"), not on every request.

### Space Complexity

Each error object holds a handful of string and number properties plus a stack trace string. Negligible. In a server handling thousands of requests per second, the garbage collector reclaims these quickly since errors are short-lived objects.

### Trade-offs

| Choice | Benefit | Cost |
|--------|---------|------|
| Class inheritance over union types | `instanceof` checks, automatic `name`, extensible | Slightly more boilerplate than a factory function; class hierarchies can get deep if overused |
| `unknown` for `details` instead of `any` | Type safety -- forces consumers to narrow before using | Slightly more code at consumption sites (type guards) |
| Pre-filled status codes in subclasses | One-liner throws, consistent codes | If you need a custom status code for an edge case, you have to use `AppError` directly |
| Default messages | Clean call sites, consistency | Developers might be lazy and not provide context-specific messages when they should |
| Machine-readable `code` strings | Stable API contract for clients | You need to document and maintain the code vocabulary |

**How to say it in an interview:** "The main trade-off is a small amount of class boilerplate in exchange for a strongly-typed, self-documenting error system. We accepted that trade-off because in a multi-tenant SaaS API, consistent error responses aren't optional -- they're part of the API contract. And the class hierarchy is intentionally shallow (one level of inheritance) to avoid the fragile base class problem."

---

## 5. Patterns and Concepts Worth Knowing

### Pattern 1: Error Hierarchy (a.k.a. Exception Hierarchy)

This is a well-established pattern in languages like Java, C#, and Python. You create a tree of error types where each branch represents a category of failure. The root of the tree (`AppError`) is your "application-level" error, and everything below it is a specific case.

The benefit is **polymorphism** -- the error handler can catch `AppError` (the parent) and handle all application errors uniformly, or it can check for specific subtypes when it needs to behave differently for, say, validation errors vs. auth errors.

### Pattern 2: Separation of Concerns -- Throw Site vs. Handle Site

The code that detects a problem (a route handler, a service function) is different from the code that formats the HTTP response (the error handler middleware). This file is the bridge -- it gives the throw site a clean vocabulary to describe what went wrong, and it gives the handle site a clean structure to read from.

Think of it like a hospital. A nurse (the throw site) fills out a standardized form describing the patient's condition. The doctor (the error handler) reads that form and decides the treatment. The form is the `AppError` -- it standardizes communication between two different parts of the system.

### Pattern 3: Constructor Parameter Shorthand (TypeScript-specific)

Writing `public readonly code: string` in the constructor parameter list is equivalent to:

```ts
readonly code: string;
constructor(code: string) {
  this.code = code;
}
```

This is a TypeScript feature, not JavaScript. It's widely used in professional codebases and will show up in lots of code you read. Know what it means.

### Pattern 4: Defensive Defaults

Default parameter values (`message = 'Authentication required'`) are an example of designing for the common case while allowing the uncommon case. This is sometimes called the "pit of success" -- make the right thing easy to do, and developers will do it.

### Concept: HTTP Status Code Semantics

The status codes chosen here follow the HTTP specification precisely:
- **400** -- Client sent a malformed or invalid request
- **401** -- Client is not authenticated (identity unknown)
- **403** -- Client is authenticated but not authorized (identity known, permission denied)
- **404** -- Resource doesn't exist (or is hidden for security)
- **502** -- The server, acting as a gateway, got a bad response from an upstream service

Knowing these distinctions and being able to explain them is valuable in any backend interview.

---

## 6. Potential Interview Questions

### Q1: "Why create custom error classes instead of just throwing objects with status codes?"

**Strong answer:** "Custom error classes give us three things: `instanceof` checking for clean control flow in catch blocks, automatic stack traces from extending `Error`, and TypeScript type narrowing so the error handler can safely access properties like `code` and `statusCode` without type assertions. They also make the codebase self-documenting -- when I see `throw new AuthorizationError()` I immediately know the HTTP semantics, whereas `throw { status: 403, message: '...' }` is just an anonymous object with no guarantees."

**Red flag answer:** "Because it's a best practice." (This says nothing. Interviewers want to hear *why* it's considered a best practice -- the specific benefits it provides.)

### Q2: "What's the difference between a 401 and a 403?"

**Strong answer:** "401 means the server doesn't know who you are -- you haven't provided credentials, or the credentials are invalid. 403 means the server knows exactly who you are but you don't have permission to do what you're asking. In our app, a request with no auth token gets a 401 from the authentication middleware. A logged-in member trying to delete the organization -- an owner-only action -- gets a 403 from the authorization layer."

**Red flag answer:** "401 is unauthorized and 403 is forbidden." (That's just reading the spec names back. The interviewer wants you to demonstrate understanding with a concrete example.)

### Q3: "Why is `details` typed as `unknown` instead of `any`?"

**Strong answer:** "`unknown` is the type-safe counterpart to `any`. With `any`, TypeScript lets you do anything with the value without checking -- you could call methods on it, access properties, pass it anywhere. With `unknown`, TypeScript forces you to narrow the type first with a type guard or assertion. Since `details` can be anything -- validation field errors, upstream API responses, raw objects -- `unknown` ensures that whoever reads `details` has to check what they're dealing with before using it. It's a guardrail that prevents a whole class of runtime errors."

**Red flag answer:** "I don't know the difference between `any` and `unknown`." (This is a fundamental TypeScript concept. If you're interviewing for a TypeScript role, know this.)

### Q4: "How does `this.name = this.constructor.name` work, and why is it there?"

**Strong answer:** "When you extend `Error`, the `name` property defaults to `'Error'`. Setting it to `this.constructor.name` dynamically picks up the name of whatever class is actually being instantiated. So `new ValidationError(...)` gets `name = 'ValidationError'`, and `new NotFoundError(...)` gets `name = 'NotFoundError'` -- without any of the subclasses needing to set it themselves. This shows up in stack traces and `console.log` output, making debugging much easier. The beauty of putting it in the base class is that every current and future subclass gets this behavior for free."

**Red flag answer:** "It sets the name." (Too shallow. Explain *what* name, *why* it matters, and *how* `this.constructor.name` achieves it dynamically.)

### Q5: "If you needed to add rate-limiting errors, how would you extend this?"

**Strong answer:** "I'd add a `RateLimitError` subclass with status code 429 (Too Many Requests). I might also add a `retryAfter` property so the error handler can set the standard `Retry-After` HTTP header. The error handler would need a small update to check for that property and add the header. The whole thing is maybe 10 lines of code -- that's the benefit of the inheritance pattern. The error vocabulary grows without modifying existing code."

**Red flag answer:** "I'd add a new `if` statement in the error handler for status 429." (This skips the subclass pattern entirely and starts scattering logic.)

### Q6: "Why use a 404 instead of a 403 when a resource belongs to another tenant?"

**Strong answer:** "This is an information disclosure concern. If I request `/api/orgs/abc123/datasets/5` and I get a 403, I've just confirmed that dataset 5 exists -- it belongs to someone else but it's real. If I get a 404, I can't tell whether the dataset doesn't exist at all or just isn't mine. In a multi-tenant SaaS application, leaking the existence of other tenants' resources is a security vulnerability. Returning 404 for 'exists but not yours' is a standard practice."

**Red flag answer:** "Because the user doesn't have access, so it's not found for them." (Directionally correct but doesn't articulate the security reasoning -- *why* we want to hide existence.)

---

## 7. Data Structures & Algorithms Used

### Data Structure: Class Hierarchy (Inheritance Tree)

```
Error (built-in)
  |
  +-- AppError (base application error)
        |
        +-- ValidationError (400)
        +-- AuthenticationError (401)
        +-- AuthorizationError (403)
        +-- NotFoundError (404)
        +-- ExternalServiceError (502)
```

This is a **tree** with depth 2 (Error -> AppError -> specific errors). The shallow depth is intentional -- deep inheritance hierarchies become brittle and hard to reason about. This is sometimes called the "prefer composition over inheritance" wisdom, applied carefully: we use exactly one level of inheritance where it genuinely helps, and we stop there.

### Algorithm: Prototype Chain Lookup (how `instanceof` works under the hood)

When the error handler does `err instanceof AppError`, JavaScript walks the prototype chain of `err`:

1. Is `err`'s prototype `AppError.prototype`? If yes, return `true`.
2. If no, is `err`'s prototype's prototype `AppError.prototype`? Check up the chain.
3. Continue until you hit `null` (the end of the chain).

For a `ValidationError`, the chain is: `ValidationError.prototype` -> `AppError.prototype` -> `Error.prototype` -> `Object.prototype` -> `null`. So `err instanceof AppError` is `true`, and `err instanceof ValidationError` is also `true`. This is O(d) where d is the depth of the inheritance chain -- in our case, always 2 or 3, so effectively O(1).

### Data Structure: Plain Object (the error response body)

The JSON response `{ error: { code, message, details? } }` is a plain object with a consistent shape. This is an informal **schema** -- clients can rely on the `error.code` field always being present. The optional `details` field uses conditional spread (`...(condition && { key: value })`) to avoid sending `details: undefined` in the JSON, which keeps the response payload clean.

---

## 8. Impress the Interviewer

### Talking Point 1: "This pattern eliminates an entire category of bugs"

"In codebases without a custom error hierarchy, I've seen the same bug over and over: someone throws a generic `Error`, the error handler defaults to 500, and now a simple validation failure looks like a server crash in monitoring dashboards. With typed errors, that's structurally impossible -- a `ValidationError` always produces a 400, a `NotFoundError` always produces a 404. The mapping is in the class definition, not scattered across handlers."

### Talking Point 2: "It's the Open/Closed Principle in practice"

"The Open/Closed Principle says code should be open for extension but closed for modification. When we add a new error type -- say `ConflictError` for 409 responses -- we create a new subclass and that's it. The error handler already knows how to handle any `AppError` via `instanceof`. We extend the system by adding code, not by modifying existing code. That means existing error handling is never at risk of regression."

### Talking Point 3: "The security angle matters in multi-tenant SaaS"

"In a multi-tenant application, error messages are a potential data leak. We intentionally separate the machine-readable `code` (which the client switches on) from the human-readable `message` (which might contain sensitive context in logs). The error handler controls exactly what goes to the client. This is a defense-in-depth strategy -- even if a developer accidentally puts tenant-specific data in the error message, the error handler can be updated to sanitize it in one place rather than hunting down every throw site."

### Talking Point 4: "The `details` field bridges the gap between DX and UX"

"The optional `details` field on `ValidationError` is where developer experience meets user experience. A validation error can carry structured field-level errors like `{ fields: { email: 'must be a valid email', revenue: 'must be positive' } }`. The frontend reads this and renders inline error messages next to each form field. Without structured details, the frontend gets a single error message and can only show a generic toast -- that's bad UX. The `unknown` type means we stay flexible about what goes in `details` while TypeScript keeps us honest about checking it on the other end."
