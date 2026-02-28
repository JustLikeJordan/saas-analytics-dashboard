# datasets.ts — Explained

## 1. 30-Second Elevator Pitch

This file is an Express 5 route handler that accepts CSV file uploads from small business owners, validates the file in three stages, and returns a structured preview of the data. Think of airport security with three checkpoints: multer checks file size and MIME type, the CSV adapter parses and validates structure, and the handler assembles a preview with sample rows, column types, and warnings. No data hits the database here — this is "parse, validate, preview." Actual persistence happens in Story 2.3. The route lives behind authentication middleware, so only logged-in users in a known org can reach it.

**How to say it in an interview:** "This is the CSV upload endpoint — an Express 5 route handler with three-layer validation: multer for size/type, the CSV adapter for structural parsing, and semantic checks for headers and row quality. It returns a preview for user confirmation, not a database write. Express 5's native async error propagation means no try/catch wrappers."

---

## 2. Why This Approach?

### Decision 1: Preview before persist

**What's happening:** The route stops short of writing anything to the database. It returns a `PreviewData` object so the frontend can show users what was parsed.

**Why it matters:** Non-technical business owners shouldn't be surprised by what happens after they upload. Show them what you understood — row count, sample data, column types, warnings. They say "looks right," and a separate endpoint does the write.

**How to say it in an interview:** "Preview-before-persist is a UX decision. The response gives the frontend everything needed to render a confirmation table without another API call. Users verify before committing."

**Over alternative:** Write-on-upload is simpler but doesn't give users a chance to catch mistakes.

### Decision 2: Three-layer validation pipeline

**What's happening:** Multer handles coarse checks (size, MIME), `csvAdapter.parse()` handles structural parsing (empty files, row counts, value validation), `csvAdapter.validate()` handles semantic checks (required columns).

**Why it matters:** Each layer has a single job. Multer never knows about CSV column names. The CSV adapter never knows about HTTP multipart boundaries. Layers are ordered cheap-to-expensive: reject on size before parsing, reject on headers before validating 50,000 rows.

**How to say it in an interview:** "Validation is layered cheap-to-expensive: file size first, then structure, then content. Each failure mode produces a distinct user-facing message."

### Decision 3: Memory storage over disk

**What's happening:** Multer uses `memoryStorage()` — the file lives as a Buffer in Node's heap during the request.

**Why it matters:** Disk storage means temp files, cleanup logic, race conditions on container restarts. Memory keeps the code simple and deployment stateless. With a 10MB limit, heap pressure is manageable.

**How to say it in an interview:** "Memory storage keeps the upload stateless. The buffer exists for the request lifetime and gets GC'd after. With a 10MB cap, heap pressure is bounded."

### Decision 4: Express 5 async error propagation

**What's happening:** No `try/catch` wrapping the handler body. Express 5 catches rejected promises from async handlers and forwards them to error middleware.

**Why it matters:** Every `throw new ValidationError(...)` produces a consistent 400 response without formatting logic at the throw site. The global error handler shapes it into `{ error: { code, message, details } }`.

**How to say it in an interview:** "Express 5 natively catches async rejections. The code just throws and trusts the framework to route errors to the global handler. In Express 4 you'd need try/catch or express-async-errors."

### Decision 5: Custom multer error bridge

**What's happening:** `handleMulterError` sits between `upload.single('file')` and the main handler, translating multer's internal error objects into `ValidationError` instances.

**Why it matters:** Multer throws its own error format with a `code` property. The global error handler expects `AppError` subclasses. This four-line bridge translates between them with a user-friendly message.

**How to say it in an interview:** "The multer error bridge is an adapter at the error boundary — translating framework-specific errors into our domain's error hierarchy."

---

## 3. Code Walkthrough

### Multer configuration (lines 14-25)

Three things: memory storage, a file size limit from shared constants, and a MIME filter that accepts `text/csv`, `application/vnd.ms-excel`, and `text/plain`. Also accepts any file ending in `.csv` as a fallback.

### handleMulterError (lines 27-35)

Express error middleware (four arguments). Checks for multer's `LIMIT_FILE_SIZE` code, wraps it in a `ValidationError`. Anything else passes through unchanged.

### inferColumnType and buildColumnTypes (lines 37-54)

Column type inference for the preview. `inferColumnType` guesses number, date, or text from a single value. `buildColumnTypes` samples the first non-empty value per column. Powers the frontend's column-type indicators so users can verify the system understood their data.

### The main route handler (lines 58-125)

Extracts the authenticated user, runs the file through the CSV adapter, checks three failure conditions (file-level issues, header failures, high error rate), then builds the preview. Three `throw` statements produce three distinct error messages. After validation, it normalizes headers, slices 5 sample rows, infers column types, fires an analytics event, logs the outcome, and returns `{ data: preview }`.

---

## 4. Complexity and Trade-offs

**Validation is effectively O(1).** The CSV adapter samples 100 rows max. Column type inference scans rows looking for the first non-empty value per column — worst case O(n*h) for n rows and h headers, but typically finds values in the first few rows.

**Memory trade-off.** The entire file is in memory. With a 10MB limit and moderate concurrency, this works. At 500MB or 1000 concurrent uploads, you'd need streaming + disk storage.

**Type inference is heuristic.** Single-sample per column. Could misclassify a text column where someone entered "12345" as an ID. The frontend uses these for display hints, not data processing, so a wrong guess is cosmetically awkward but harmless.

**How to say it in an interview:** "Validation is bounded by the 100-row sample, making it effectively constant-time. The memory ceiling is bounded by the 10MB file limit. Type inference is a heuristic for preview quality, not data correctness."

---

## 5. Patterns and Concepts Worth Knowing

### Middleware Chain Composition

Express routes accept an array of middleware. This route uses `upload.single('file')` → `handleMulterError` → `async handler`. Each middleware either calls `next()` or `next(err)`. This is the Chain of Responsibility pattern.

**Interview-ready line:** "The upload endpoint chains three middleware: multer for parsing, an error bridge for multer-specific errors, and the business logic handler. Express executes them in registration order."

### BFF (Backend for Frontend) Pattern

This Express API never faces the browser directly. Next.js receives uploads at `/api/datasets` and proxies to Express at `:3001/datasets`. Same-origin, no CORS needed.

**Interview-ready line:** "The upload goes through a BFF proxy — browser to Next.js to Express. The API port isn't exposed publicly."

### Pluggable Adapter Pattern

`DataSourceAdapter` defines `parse()` and `validate()`. Only `csvAdapter` exists today, but the interface means a QuickBooks adapter could be swapped in without changing this route.

**Interview-ready line:** "The route depends on the DataSourceAdapter interface, not the CSV implementation. Adding new data sources means new adapters, not route changes."

### Fire-and-Forget Analytics

`trackEvent` is called without `await`. Upload response shouldn't wait on analytics writes. If analytics is down, the upload still succeeds.

---

## 6. Potential Interview Questions

### Q1: "Why no try/catch in the async handler?"

**Strong answer:** "Express 5 catches rejected promises natively. The code throws ValidationError instances and the framework routes them to errorHandler. In Express 4 you'd need try/catch or express-async-errors."

**Red flag:** "You should always wrap async code in try/catch." — True in Express 4, unnecessary in Express 5.

### Q2: "What would you change for 500MB files?"

**Strong answer:** "Switch to disk storage, streaming CSV parsing, and a background job with polling for status. The preview becomes an async operation — return a job ID immediately, poll for completion."

**Red flag:** "Just increase the memory limit." — Ignores heap exhaustion under concurrency.

### Q3: "Why check `rows.length === 0 && rowCount > 0` separately?"

**Strong answer:** "That catches a specific edge case: the CSV parsed but >50% of rows failed validation, so zero valid rows were returned. The earlier check catches file-level problems. These are different failure modes with different messages."

**Red flag:** "They do the same thing." — Different conditions, different user messages.

### Q4: "How do you know the user is authenticated?"

**Strong answer:** "This router is mounted on protectedRouter, which applies authMiddleware to all routes. The middleware reads a JWT from an httpOnly cookie, verifies it, and attaches the payload to req.user. By the time this handler runs, user.org_id and user.sub are guaranteed."

### Q5: "Why is type inference a separate function from validation?"

**Strong answer:** "Validation checks data correctness — are dates valid, are amounts numeric. Type inference guesses column semantics for the preview UI. They serve different consumers: validation gates the upload, type inference aids the user's visual confirmation."

---

## 7. Data Structures & Algorithms Used

### Record<string, string> (ParsedRow)

Each CSV row is a plain object mapping column names to values. O(1) lookups by key. Named keys make code readable compared to positional array indexing.

### PreviewData Interface

The response shape bundles headers, sample rows, counts, column types, warnings, and file name. A materialized view — all derived data computed once, no follow-up API calls needed.

### Set (in csvAdapter)

Skipped row indices stored in a Set for O(1) membership checks during the filter pass. The route handler benefits from this indirectly through the clean ParseResult.

---

## 8. Impress the Interviewer

### Defense in Depth Validation

Three layers — multer, structural parsing, semantic validation — each catching a different class of problem. Ordered cheap-to-expensive: file size check (instant) before parsing (milliseconds) before row validation (bounded by sample). Parallels how firewalls, application auth, and business logic work together.

**How to bring it up:** "Validation is layered cheap-to-expensive. Multer rejects oversized files before any parsing. The CSV adapter catches structural problems before row-level validation. Each layer has a distinct failure message."

### Express 5 Async Error Model

Many candidates still write handlers with try/catch everywhere. Mentioning native promise rejection handling signals framework awareness. The custom `AppError` hierarchy lets the error handler produce structured responses without formatting at each throw site.

**How to bring it up:** "Express 5 catches async rejections natively, so the handler just throws domain-specific errors. The global error handler shapes them into the standard API response format."

### Preview-Before-Persist Is a Product Decision

The target users are small business owners, not data engineers. Showing them a preview with sample rows, column types, and skip counts builds trust. The response shape maps directly to UI elements in the upload flow.

**How to bring it up:** "Preview-before-persist is a trust-building pattern. Non-technical users see exactly what we understood from their file before anything is committed. The PreviewData shape maps 1:1 to UI elements."

### Pluggable Data Sources

Even though only `csvAdapter` exists, the `DataSourceAdapter` interface means adding QuickBooks import requires a new adapter, not changes to this handler. The route calls `adapter.parse()` without caring about format.

**How to bring it up:** "The handler depends on an interface, not the CSV implementation. Adding financial API imports means writing a new adapter, not touching this route. Open-Closed Principle in practice."
