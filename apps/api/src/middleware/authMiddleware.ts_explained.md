# authMiddleware.ts — Explained

## 1. 30-second elevator pitch

This middleware is the bouncer at the door of every protected API route. It pulls a JWT out of an httpOnly cookie, verifies the signature and expiry through jose 6.x, validates the claims with Zod, and attaches the parsed user identity to the request object. If any of that fails, the request never reaches the route handler — it gets kicked to the error handler with a 401. It is 21 lines of code, and it is the single point that turns an anonymous HTTP request into an authenticated, tenant-scoped one.

**How to say it in an interview:**
"This is Express authentication middleware that extracts a JWT from an httpOnly cookie, verifies it cryptographically and validates its claims with a Zod schema, then attaches the parsed payload to the request. It is the gatekeeper — every protected route sits behind it."

---

## 2. Why This Approach?

### Decision 1: httpOnly cookie instead of Authorization header

**What's happening:** The middleware reads the token from `req.cookies[AUTH.COOKIE_NAMES.ACCESS_TOKEN]` — a cookie — not from an `Authorization: Bearer ...` header.

**Why it matters:** This app uses a BFF (Backend For Frontend) proxy pattern. The browser talks to Next.js, which proxies to Express, all on the same origin. Because everything is same-origin, we can use cookies instead of headers. httpOnly cookies cannot be read by JavaScript at all — `document.cookie` will not show them, and neither will any XSS payload. An `Authorization` header, by contrast, has to be stored somewhere JavaScript can reach (localStorage, sessionStorage, a variable), which means any XSS vulnerability leaks the token. Cookies with httpOnly eliminate that entire attack surface.

**How to say it in an interview:**
"We use httpOnly cookies rather than Authorization headers because the BFF proxy makes everything same-origin. This means the token is never accessible to client-side JavaScript, which eliminates token theft via XSS entirely."

### Decision 2: Explicit type extension, not global augmentation

**What's happening:** The file exports `AuthenticatedRequest extends Request` with a `user: JwtPayload` property. It does not use `declare global` to add `user` to every Request like the correlationId middleware does.

**Why it matters:** Not every request in the system is authenticated. The health check route, the login route, public dashboard routes — none of these go through `authMiddleware`, so their Request objects genuinely do not have a `user` property. If we used global augmentation, TypeScript would tell you `req.user` exists everywhere, even in routes where it has not been set. That is a lie that would compile fine but crash at runtime. By making `AuthenticatedRequest` a separate type, only route handlers that explicitly cast to it (or are typed with it) can access `req.user`. The type system matches the runtime reality.

**How to say it in an interview:**
"We use an explicit interface extension instead of global augmentation because only protected routes have a user on the request. Global augmentation would lie to the type system — it would say req.user exists on routes that never run the auth middleware."

### Decision 3: No try-catch in the middleware

**What's happening:** The function is `async` and just throws if the token is missing. It calls `verifyAccessToken()` which also throws. There is no try-catch wrapping any of it.

**Why it matters:** Express 5 (unlike Express 4) automatically catches rejected promises from async middleware and forwards them to the error handler. In Express 4, an unhandled promise rejection in async middleware would crash the process or hang the request. Express 5 fixed this, so there is no reason to catch-and-forward manually. The code stays flat and readable — no nesting, no `try { ... } catch (err) { next(err) }` boilerplate.

**How to say it in an interview:**
"Express 5 auto-forwards rejected promises from async route handlers and middleware to the error handler. That is why there is no try-catch here — thrown errors propagate automatically. In Express 4 you needed express-async-errors or manual catch-and-next."

### Decision 4: Zod validation inside verifyAccessToken

**What's happening:** The middleware calls `verifyAccessToken(token)`, which internally calls `jwtVerify()` (cryptographic signature check) and then `jwtPayloadSchema.parse()` (structural validation of the claims).

**Why it matters:** JWT verification only tells you the token was signed by your server and has not expired. It does not tell you the payload has the shape you expect. A token could be cryptographically valid but missing `org_id`, or have `role` set to some garbage string. The Zod schema (`jwtPayloadSchema`) guarantees that `sub` is a string, `org_id` is an integer, `role` is exactly `'owner'` or `'member'`, and `isAdmin` is a boolean. If any of that fails, the token is rejected. You get defense in depth — cryptographic integrity plus structural correctness.

**How to say it in an interview:**
"We layer Zod schema validation on top of JWT signature verification. The signature tells us the token was not tampered with; the schema tells us the payload has the exact shape our code expects. This is defense in depth — even a properly signed token gets rejected if its claims do not match the schema."

---

## 3. Code Walkthrough

This file is small enough that we can walk through it linearly. There are really only two logical parts: the type definition and the middleware function.

### Part 1: The AuthenticatedRequest type (lines 7-9)

```ts
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}
```

This creates a new TypeScript type that is "Request, but with a `user` property." `JwtPayload` comes from the shared package and looks like this:

```ts
{ sub: string, org_id: number, role: 'owner' | 'member', isAdmin: boolean, iat: number, exp: number }
```

`sub` is the user's ID (as a string — JWT convention). `org_id` tells you which tenant they belong to. `role` is their permission level within that org. `isAdmin` is a platform-level flag (separate from org role). `iat` and `exp` are standard JWT timestamps for when it was issued and when it expires.

This type is exported so downstream middleware (like `roleGuard`) and route handlers can import it and safely access `req.user`.

### Part 2: The middleware function (lines 11-21)

```ts
export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH.COOKIE_NAMES.ACCESS_TOKEN];
  if (!token) {
    throw new AuthenticationError('Missing access token');
  }

  const payload = await verifyAccessToken(token);
  (req as AuthenticatedRequest).user = payload;
  next();
}
```

Line by line:

- **`req.cookies?.[AUTH.COOKIE_NAMES.ACCESS_TOKEN]`** — Reads the `access_token` cookie. The `?.` optional chaining is there because `req.cookies` could be undefined if the cookie-parser middleware has not run (defensive, though in practice it always has). `AUTH.COOKIE_NAMES.ACCESS_TOKEN` resolves to the string `'access_token'` — using a constant rather than a magic string so renaming the cookie happens in one place.

- **`if (!token) throw new AuthenticationError(...)`** — Early return pattern. No cookie means no token means you are not authenticated. `AuthenticationError` is a custom error class that sets the HTTP status to 401 and the error code to `'AUTHENTICATION_REQUIRED'`. Throwing here means Express 5 catches it and sends it to the error handler — the route handler never sees this request.

- **`await verifyAccessToken(token)`** — This does two things: runs the token through jose's `jwtVerify()` (checks the HMAC-SHA256 signature and expiration), then parses the decoded payload through `jwtPayloadSchema` (Zod validation). If either step fails, it throws `AuthenticationError('Invalid or expired access token')`.

- **`(req as AuthenticatedRequest).user = payload`** — Attaches the validated claims to the request. The `as AuthenticatedRequest` cast is necessary because `req` is typed as plain `Request` in the function signature — TypeScript does not know we are enriching it. This is a one-way cast at the mutation site; downstream code that imports `AuthenticatedRequest` gets full type safety on `req.user`.

- **`next()`** — Passes control to the next middleware or route handler. If we reach this line, the user is authenticated and their identity is attached.

---

## 4. Complexity and Trade-offs

### Runtime complexity

This middleware is O(1) in terms of algorithmic complexity. Cookie lookup is a hash map access. JWT verification involves one HMAC-SHA256 computation — that is constant time regardless of payload size (the payload is always small). Zod parsing on a fixed-shape schema with 6 fields is also constant.

The real-world cost is the HMAC computation, which takes roughly 1-5 microseconds on modern hardware. That is negligible compared to the network latency of the request itself.

### Memory

One `JwtPayload` object per request, garbage collected when the request completes. Tiny.

### Trade-off: Casting to AuthenticatedRequest

The `(req as AuthenticatedRequest)` cast is a small type safety hole. TypeScript will not stop you from accessing `req.user` in a route that forgot to register `authMiddleware`. The alternative — global augmentation with `user?: JwtPayload` (optional) — would force null checks everywhere, including in routes where the user is guaranteed to exist. The explicit extension is the better trade-off: you get clean access in protected routes, and if you forget the middleware, you get a runtime error (undefined property access) rather than a silent `undefined` that slips through.

**How to say it in an interview:**
"The cast trades a small type safety gap at the middleware boundary for clean, non-optional access to user data in every protected route. It is a pragmatic choice — the alternative of making user optional everywhere adds noise to dozens of route handlers that will never see an unauthenticated request."

### Trade-off: No token refresh in this middleware

This middleware only validates access tokens. It does not check if the token is about to expire or trigger a refresh. Refresh token rotation happens in a separate endpoint. That means a request with a token that expired 1 millisecond ago will be rejected, and the client needs to know to hit the refresh endpoint first. This is standard — mixing refresh logic into the auth middleware would violate single responsibility and complicate error handling.

---

## 5. Patterns and concepts worth knowing

### The middleware pattern (Chain of Responsibility)

Express processes requests through a chain of middleware functions, each with the signature `(req, res, next)`. Each function can inspect the request, modify it, respond to it, or pass it along by calling `next()`. Auth middleware is a classic use case: it runs before route handlers, and if authentication fails, it short-circuits the chain by throwing (or calling `next(err)` in Express 4).

Think of it like a series of security checkpoints at an airport. The first one checks your ID (correlationId middleware), the second scans your ticket (auth middleware), the third checks your boarding zone (roleGuard). If you fail any checkpoint, you do not get on the plane.

### httpOnly cookies vs. bearer tokens

There are two common ways to send a JWT: as a cookie or in the `Authorization` header. Cookies are set and sent automatically by the browser — no JavaScript needed. httpOnly cookies cannot be read by `document.cookie`, which means XSS attacks cannot steal them. The downside is that cookies are only sent to the same origin (or specific domains), so they do not work for cross-origin APIs. In a BFF pattern where the frontend and backend share an origin, cookies are the safer choice.

### Defense in depth

This middleware layers two independent validation steps: cryptographic verification (jose) and structural validation (Zod). Either one alone has gaps. Signature verification without schema validation accepts tokens with missing or malformed claims. Schema validation without signature verification accepts forged tokens. Together, they cover both threat models.

### Explicit type extension vs. global augmentation

TypeScript lets you extend interfaces in two ways. Global augmentation (`declare global { namespace Express { interface Request { user: JwtPayload } } }`) modifies the type for every usage of `Request` in the entire project. Explicit extension (`interface AuthenticatedRequest extends Request { user: JwtPayload }`) creates a new, separate type. The guideline is: use global augmentation when every request has the property (like `correlationId`), and explicit extension when only some requests do (like `user`).

---

## 6. Potential interview questions

### Q1: "Why use cookies instead of the Authorization header for JWTs?"

**Strong answer:** "This API sits behind a BFF proxy — the browser never talks to Express directly. Everything is same-origin, so cookies work and give us a big security win: httpOnly cookies are invisible to JavaScript, meaning XSS attacks cannot steal the token. With an Authorization header, the token has to be stored somewhere JavaScript can access, which is an attack surface. We also do not need the token for cross-origin requests, so the main downside of cookies does not apply here."

**Red flag answer:** "Cookies are just easier to use." (Misses the security rationale and the architectural context that makes cookies viable.)

### Q2: "What happens if someone sends a request without the cookie?"

**Strong answer:** "The middleware throws an `AuthenticationError`, which Express 5 automatically catches and forwards to the centralized error handler. The error handler maps the 401 status code and `AUTHENTICATION_REQUIRED` code into a standard error response body. The route handler never executes."

**Red flag answer:** "It would crash the server." (Shows unfamiliarity with Express error handling and middleware flow.)

### Q3: "Why not use global augmentation to add `user` to Request?"

**Strong answer:** "Because not every request is authenticated. The health check, login, and public dashboard routes do not pass through this middleware, so their Request objects have no `user` property. Global augmentation would tell TypeScript that `req.user` always exists, which is a lie — you could access it in an unauthenticated route without any compiler warning, and it would be undefined at runtime. The explicit `AuthenticatedRequest` type makes the type system match the actual middleware chain."

**Red flag answer:** "I would just use `any` type." (Throws away all type safety, which defeats the purpose of TypeScript.)

### Q4: "Why is there no try-catch in this async middleware?"

**Strong answer:** "Express 5 natively catches rejected promises from async middleware and route handlers and forwards them to the error handler middleware. In Express 4, you needed `express-async-errors` or a manual `try { } catch (err) { next(err) }` wrapper. Express 5 eliminated that boilerplate. The thrown `AuthenticationError` propagates automatically to the `errorHandler` middleware at the end of the chain."

**Red flag answer:** "We should add try-catch to be safe." (Suggests they have not read the Express 5 changelog and would add dead code.)

### Q5: "How does this middleware support multi-tenancy?"

**Strong answer:** "The JWT payload includes `org_id`, which identifies which tenant the user belongs to. After the middleware attaches the payload to `req.user`, every downstream query can scope itself to `req.user.org_id`. This means tenant isolation is enforced at the authentication layer — a user literally cannot make a request without declaring which org they are acting in. Combined with the `role` claim, the downstream `roleGuard` middleware can also check whether they are an owner or member of that org."

**Red flag answer:** "Multi-tenancy is handled at the database level." (Partially true, but misses that the auth middleware is where the tenant context enters the request.)

---

## 7. Data structures & algorithms used

### JWT (JSON Web Token)

A JWT is three Base64URL-encoded segments separated by dots: `header.payload.signature`. The header says which algorithm was used (HS256 in this project — HMAC with SHA-256). The payload is a JSON object with claims like `sub` (subject / user ID), `exp` (expiration timestamp), and custom fields like `org_id`. The signature is an HMAC of the header and payload using a server-side secret. Verification recomputes the HMAC and compares — if the token was tampered with, the signatures will not match. This whole process is O(1) because the input size is always small and fixed.

A useful analogy: a JWT is like a sealed envelope. You can read the contents (the claims are just Base64, not encrypted), but if you change anything and reseal it, the signature will not match when the server checks.

### Hash map (implicit)

`req.cookies` is a JavaScript object populated by the `cookie-parser` middleware. Cookie names are keys, cookie values are values. Lookup by name is O(1) average case.

### Zod schema parsing

The `jwtPayloadSchema.parse()` call validates the decoded JWT payload against a fixed schema. Internally, Zod walks the schema definition and checks each field — is `sub` a string, is `org_id` an integer, is `role` one of the allowed enum values. For a schema with 6 fixed fields, this is O(1). If validation fails, Zod throws a `ZodError` with details about which field was wrong, but `verifyAccessToken` catches that and re-throws a generic `AuthenticationError` to avoid leaking schema internals.

---

## 8. Impress the interviewer

### Talking point 1: "The type system mirrors the middleware chain."

"I like that `AuthenticatedRequest` is an explicit extension rather than global augmentation. It means the type system tells you the truth about which routes are protected. If you are in a route handler that receives `AuthenticatedRequest`, you know the auth middleware ran — the type guarantees it. If you are in a public route handler with a plain `Request`, there is no `user` property to tempt you. The types are documentation that the compiler enforces."

### Talking point 2: "The BFF pattern eliminates an entire class of token storage bugs."

"The most common JWT vulnerability in SPAs is token storage. localStorage is vulnerable to XSS. SessionStorage does not survive tab closes. In-memory variables are lost on refresh. httpOnly cookies sidestep all of that — the browser manages storage and transmission, and JavaScript cannot touch the token. But this only works because of the BFF proxy pattern — everything is same-origin, so cookies flow naturally. It is an architectural decision at the infrastructure level that makes this 21-line middleware possible and secure."

### Talking point 3: "Defense in depth — two independent validation layers."

"Signature verification and schema validation protect against different threats. A forged token fails signature verification. A properly signed token with malformed claims — maybe from a migration bug or a different service in a shared-secret environment — fails Zod validation. Neither layer alone is sufficient. This is the same principle behind combining a firewall with application-level input validation — redundancy at different abstraction levels."
