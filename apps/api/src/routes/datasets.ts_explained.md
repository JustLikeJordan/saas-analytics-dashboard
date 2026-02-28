# datasets.ts — Interview-Ready Documentation

## 1. 30-Second Elevator Pitch

This file handles the two-step CSV upload flow: preview and confirm. When a user picks a CSV file, the preview endpoint parses it, validates the data, and sends back a summary with sample rows, column types, and a cryptographically signed token. The confirm endpoint persists the data to PostgreSQL — but only after verifying that token proves the file hasn't been swapped since the user previewed it. The persistence step wraps both the dataset record creation and the row batch insert in a single database transaction, so a partial failure leaves nothing behind.

**How to say it in an interview:** "This is a two-phase upload system with TOCTOU protection and transactional persistence. The preview endpoint validates the CSV and returns an HMAC-signed token binding the file's SHA-256 hash to the user's org. The confirm endpoint verifies that token, then writes the dataset header and all data rows inside a single transaction — so the database never ends up with a dataset record that has no rows."

---

## 2. Why This Approach?

### Decision 1: Two-phase upload (preview -> confirm) instead of single upload

**What's happening:** Instead of uploading and saving data in one shot, the user first uploads to see a preview — column names, sample rows, row counts, warnings. Only after they click "Confirm" does the data get written to the database. Think of it like a "dry run" before the real thing.

**How to say it in an interview:** "We split upload into preview and confirm phases so users can catch column mismatches or data quality issues before committing. This reduces support burden from bad uploads and gives us a natural place to inject integrity verification."

**Over alternative:** A single-step upload that auto-imports everything. Simpler, but users can't catch mistakes before they're persisted.

### Decision 2: HMAC-signed stateless preview tokens instead of server-side session storage

**What's happening:** After previewing, the server creates a token containing the file's SHA-256 hash, the org ID, and a timestamp — then signs it with HMAC-SHA-256 using the server's JWT secret. When the user confirms, the server re-hashes the uploaded file and checks whether the token's hash matches. No database row, no Redis key, no session state.

Think of a notarized document. The notary (server) stamps it with a tamper-evident seal. If anyone changes the document after stamping, the seal breaks — you don't need to keep a copy of the original to detect tampering.

**How to say it in an interview:** "I used an HMAC-signed token containing a SHA-256 file hash, org ID, and timestamp. The server verifies the token at confirm time by recomputing the HMAC and comparing hashes. It's stateless — no Redis or DB storage needed — and uses timing-safe comparison to prevent side-channel attacks."

**Over alternative:** Storing the file hash in Redis with a TTL. Works, but adds a cache dependency for correctness (if Redis evicts the key, the user can't confirm). The HMAC approach is zero-infrastructure and survives server restarts.

### Decision 3: `timingSafeEqual` for HMAC comparison

**What's happening:** When you compare two strings with `===`, the computer stops comparing as soon as it finds a difference. An attacker can measure how long the comparison takes to figure out how many bytes of their forged signature are correct, then iterate. `timingSafeEqual` always takes the same time regardless of where the difference is.

**How to say it in an interview:** "I used Node's `timingSafeEqual` for the HMAC comparison to prevent timing side-channel attacks. Regular string comparison leaks information about how many bytes match, which lets an attacker forge signatures iteratively."

**Over alternative:** Plain `===` comparison. Functionally correct but leaks timing information. One line fix for a real attack vector.

### Decision 4: Key normalization in `normalizeSampleRows` at the route level

**What's happening:** csv-parse returns row objects keyed by the original header text — so if the file says `Date,Amount,Category`, the row keys are `Date`, `Amount`, `Category`. But the preview response sends lowercase headers (`date`, `amount`, `category`). Without normalization, the frontend gets headers that don't match the row keys and renders empty table cells.

**How to say it in an interview:** "csv-parse preserves original header casing in row objects, but we normalize headers to lowercase for consistency. I added a `normalizeSampleRows` function that remaps each row's keys to match the normalized headers, so the frontend always gets a consistent key space."

**Over alternative:** Normalizing inside the adapter. We avoided that because the adapter is a general-purpose parsing layer — other callers might need original-case keys. Normalization at the route level keeps the adapter reusable.

### Decision 5: `db.transaction()` for atomic persistence + seed cleanup

**What's happening:** The confirm endpoint does three things atomically inside `db.transaction()`: (1) deletes any seed datasets for the org, (2) creates the new dataset record, (3) inserts all data rows. If any step fails, everything rolls back — no orphan datasets, no half-deleted seed data. The seed deletion is a safety net (user orgs don't normally have seed data under Option C), but running it inside the transaction costs nothing and guarantees the org transitions cleanly. After the writes, `getUserOrgDemoState` reads the org's state inside the same transaction, so it reflects the just-committed data — not a stale external read.

**How to say it in an interview:** "The transaction bundles seed cleanup, dataset creation, row insertion, and demo state derivation into a single atomic unit. A failure at any point rolls back everything. The demo state query runs inside the transaction so it sees the new data, not a stale snapshot from before the write."

**Over alternative:** Two sequential `await` calls with manual cleanup in a `catch` block. But what if the cleanup also fails? You're stuck with an orphan and an exception, writing recovery logic for the recovery logic. Transactions handle this atomically.

### Decision 6: Side effects outside the transaction boundary

**What's happening:** `trackEvent` and `logger.info` run *after* `await db.transaction()` resolves, not inside the callback. The transaction returns `{ datasetId, rowCount }`, and the outer code uses those values. Side effects don't belong inside transactions because: (1) they're not rollback-able — you can't un-send an analytics event, (2) a side effect failure shouldn't undo a successful data write, (3) long-running side effects hold the transaction open, blocking other writers.

**How to say it in an interview:** "I keep analytics and logging outside the transaction. If `trackEvent` fails, that's not a reason to roll back a successful data import. The transaction returns the data the outer code needs, so there's no re-querying."

### Decision 7: Express 5 async error propagation

**What's happening:** No `try/catch` wrapping the handler bodies. Express 5 catches rejected promises from async handlers and forwards them to error middleware.

**How to say it in an interview:** "Express 5 natively catches async rejections. The code just throws and trusts the framework to route errors to the global handler. In Express 4 you'd need try/catch or express-async-errors."

---

## 3. Code Walkthrough

### Multer setup (lines 18-29)

Configures file upload handling with in-memory storage, a 10MB size limit, and MIME type filtering. The `fileFilter` callback accepts CSV-adjacent MIME types and falls back to checking the `.csv` extension — some browsers report CSVs as `text/plain` or `application/vnd.ms-excel`.

### Multer error handler (lines 31-39)

Multer throws its own error objects with a `code` property. This middleware intercepts `LIMIT_FILE_SIZE` and converts it into a user-friendly `ValidationError` that flows through the standard error handler. Other multer errors pass through unchanged.

### Column type inference (lines 41-57)

`inferColumnType` guesses whether a cell value is a date, number, or text by trying numeric parsing first, then date parsing. `buildColumnTypes` samples the first non-empty value per column. This drives the type badges shown in the preview UI.

### Sample row normalization (lines 59-68)

The bridge between csv-parse's original-cased row objects and the lowercase headers the API returns. Iterates each raw header, maps the value to a normalized key. Without this, a CSV with `Date,Amount,Category` headers would produce `{Date: "2025-01-15"}` row objects but `["date"]` in the headers array — the frontend table would render empty cells.

This was Critical fix #1 from code review.

### TOCTOU protection functions (lines 70-107)

Four functions working together:
- `computeFileHash`: SHA-256 of the raw file buffer
- `signPreviewToken`: Packs hash + orgId + timestamp into a JSON payload, HMAC-signs it, base64url-encodes the whole thing
- `verifyPreviewToken`: Decodes the token, recomputes the HMAC, checks hash/org/TTL with timing-safe comparison
- The 30-minute TTL prevents stale tokens from being reused indefinitely

The token format is `base64url(JSON({ hash, orgId, iat, sig }))`. The signature covers `hash:orgId:iat` — all three fields are bound, so you can't swap any of them independently.

This was Critical fix #3 from code review — closing the TOCTOU gap.

### Preview endpoint — `POST /` (lines 111-179)

The happy path:
1. Extract authenticated user's org and ID
2. Parse CSV via the adapter
3. Check for empty/rejected files (warnings, header validation, >50% failure)
4. Build normalized sample rows (first 5) and column types
5. Compute file hash and sign preview token
6. Return the full preview payload including `fileHash` and `previewToken`

Three different failure modes are checked in sequence. First, zero rows with warnings (empty file, header-only). Second, header validation failures (missing required columns). Third, zero valid rows from a non-empty file (>50% row failure rate). Each gets a different error message.

### Confirm endpoint — `POST /confirm` (lines 203-271)

1. Extract user context, check for file
2. **Token gate**: reject if `previewToken` is missing or fails verification
3. Re-parse and re-validate (the file buffer is self-contained)
4. Normalize rows for DB insertion
5. **Transaction block**: `db.transaction(async (tx) => { ... })` runs four steps atomically:
   - `deleteSeedDatasets(orgId, tx)` — cleans up any seed data in the org (safety net; usually a no-op)
   - `createDataset(orgId, { ... }, tx)` — inserts the dataset record
   - `insertBatch(orgId, dataset.id, normalizedRows, tx)` — inserts all data rows
   - `getUserOrgDemoState(orgId, tx)` — derives the org's demo state from the just-written data
   - Returns `{ datasetId, rowCount, demoState }`
6. **Post-transaction**: track analytics event and respond using the returned `result` object

The non-obvious part: `req.body?.previewToken` works because multer populates `req.body` with text form fields alongside `req.file`. The frontend appends both the file and the token to the same FormData object.

The transaction pattern: `createDataset`, `insertBatch`, `deleteSeedDatasets`, and `getUserOrgDemoState` all accept an optional `client` parameter. Inside the transaction callback, they receive `tx` — outside, they default to the module-level `db`. The query functions don't know or care whether they're in a transaction; the route handler controls the boundary.

The `demoState` return is important for the frontend. After a first upload, the dashboard needs to know the org transitioned from `empty` to `user_only` so it can stop showing seed data. Reading state inside the transaction avoids a race where a concurrent request could see stale state.

---

## 4. Complexity and Trade-offs

### Time complexity

- **SHA-256 hashing**: O(n) where n is file size. For a 10MB max file, ~2ms. Computed twice (preview + confirm).
- **HMAC signing/verification**: O(1) relative to the token size (~100 bytes).
- **CSV parsing**: O(n*m) where n is rows and m is columns. Happens twice in the confirm flow. For 50K rows, 200-500ms — the bottleneck.

### What would break first

- **Double parse on confirm**: The file gets fully parsed twice — preview and confirm. For large files near the 50K row limit, this adds latency. A future optimization could cache the parsed result server-side (Redis, keyed by file hash) and skip re-parsing at confirm time.
- **Memory**: `multer.memoryStorage()` holds the entire file in RAM. 10 concurrent 10MB uploads = 100MB. Fine for an MVP. At scale, you'd stream to disk or S3.
- **Token TTL**: The 30-minute window is hardcoded. If a user previews, goes to lunch, and comes back — they get an error. Could be configurable, but 30 minutes covers most real usage.

**How to say it in an interview:** "The stateless HMAC approach trades double-parsing for zero server-side state. At MVP scale with a 10MB limit, the compute cost is negligible. If we needed larger files, I'd add a Redis-backed parse cache keyed by file hash to skip the redundant parse on confirm."

### Known limitation

The preview token doesn't bind to a specific user — only to an org. Two users in the same org could preview on one machine and confirm on another. This is by design — the org-level binding matches our multi-tenant model where org members share dataset access.

---

## 5. Patterns and Concepts Worth Knowing

### HMAC (Hash-based Message Authentication Code)

A way to prove that data hasn't been tampered with, using a secret key. Think of a wax seal — only someone with the seal (secret) can create it, and breaking the seal (modifying data) is obvious. HMAC combines a hash function (SHA-256) with a secret to produce a signature tied to both the data and the key.

**Where it appears:** `signPreviewToken` and `verifyPreviewToken` (lines 78-107).

**Interview-ready line:** "HMAC gives us tamper-evident tokens without server-side storage. The secret key ensures only our server can create valid tokens, and the hash binding ensures any file modification invalidates the token."

### TOCTOU (Time-of-Check-to-Time-of-Use)

A race condition where the state of something changes between checking and acting. Classic example: checking if a file exists, then opening it — but someone deletes it in between. Here, the "check" is preview and the "use" is confirm.

**Where it appears:** The entire preview -> confirm flow. The token bridges the two phases.

**Interview-ready line:** "Without the preview token, there's a TOCTOU gap where an attacker could preview a benign file, then swap in a malicious one before confirming. The HMAC-signed hash binding closes that gap."

### Guard Clauses / Early Returns

Instead of nesting validation inside if/else blocks, each check bails out immediately with an error. The happy path flows straight down without indentation.

**Where it appears:** Both route handlers. The preview endpoint has three sequential validation gates (lines 129-146), the confirm endpoint has the token gate (lines 195-202).

**Interview-ready line:** "I use early returns for validation so the happy path reads linearly. Each guard clause handles one failure mode and exits."

### Timing-Safe Comparison

A comparison technique that always takes the same amount of time regardless of input. Prevents attackers from measuring response times to gradually guess correct values byte by byte.

**Where it appears:** `verifyPreviewToken` uses `timingSafeEqual` at line 97.

**Interview-ready line:** "Standard string comparison short-circuits on the first mismatch, which leaks timing information. `timingSafeEqual` compares every byte regardless, closing the side-channel."

### BFF (Backend For Frontend) Pattern

The browser never talks directly to this Express API. Requests go through Next.js's `/api/*` routes, which proxy to Express. No CORS configuration needed — everything is same-origin.

**Where it appears:** Implicitly — the route doesn't set CORS headers because the BFF proxy handles the cross-service hop.

**Interview-ready line:** "We use a BFF proxy pattern where the Next.js frontend proxies API calls to Express. This eliminates CORS complexity and lets us enforce auth at the proxy layer."

### Pluggable Adapter Pattern

`DataSourceAdapter` defines `parse()` and `validate()`. Only `csvAdapter` exists today, but the interface means a QuickBooks adapter could be swapped in without changing this route.

**Interview-ready line:** "The route depends on the DataSourceAdapter interface, not the CSV implementation. Adding new data sources means new adapters, not route changes."

---

## 6. Potential Interview Questions

### Q1: "Why wrap both writes in one transaction instead of handling the error and cleaning up manually?"

**Context if you need it:** Tests whether you understand why transactions exist and whether you see the edge cases in manual cleanup.

**Strong answer:** "Manual cleanup is error-prone. If `createDataset` succeeds and `insertBatch` fails, you'd need to delete the dataset in the catch block — but what if *that* delete also fails? You're stuck with an orphan and an exception, writing recovery logic for the recovery logic. The transaction handles it atomically — ACID guarantees mean the database does the rollback."

**Red flag answer:** "We could just catch the error and delete the dataset row." Technically possible, but introduces a second failure point with no recovery path.

### Q2: "Why are `trackEvent` and `logger.info` outside the transaction?"

**Context if you need it:** Tests understanding of transaction scope and side effect hygiene.

**Strong answer:** "Two reasons. First, `trackEvent` likely does network I/O — keeping a transaction open during external calls holds a DB connection and blocks other writers. Second, if analytics tracking fails, we don't want to roll back a successful data import. The transaction's job is data integrity. Logging and analytics are best-effort side effects that happen after we know the core write succeeded."

**Red flag answer:** "To keep the transaction small." One of the reasons, but the more important one is that side effects aren't rollback-able.

### Q3: "Why not store the parsed data in a temp table during preview and just commit it on confirm?"

**Context if you need it:** This tests whether you understand the trade-off between stateful and stateless verification. Storing parsed data server-side is a valid approach.

**Strong answer:** "A temp table approach works but introduces server-side state that needs cleanup — expired previews, orphaned rows, TTL sweeps. The HMAC token is stateless and self-expiring. The trade-off is re-parsing the file on confirm, which for our file size limits (10MB, 50K rows) takes under 500ms. At larger scale, I'd consider a hybrid — cache parsed results in Redis keyed by file hash."

**Red flag answer:** "We don't need to store anything because the token has all the data." The token doesn't contain the data; it contains a hash of it. It's a verification mechanism, not storage.

### Q6: "Why does the confirm endpoint delete seed data and read demo state inside the transaction?"

**Context if you need it:** Tests understanding of transactional reads and the demo mode state machine.

**Strong answer:** "The seed deletion and state read both happen inside the transaction so they see the same snapshot of data as the writes. If `getUserOrgDemoState` ran after the transaction committed, a concurrent request could insert another dataset between our commit and our read, giving us a stale state. Inside the transaction, the read is guaranteed to reflect our writes and nothing else."

**Red flag answer:** "Because it's cleaner to have everything in one place." That's incidental. The actual reason is consistency — a transactional read sees the effects of prior writes in the same transaction.

### Q2: "What happens if two users upload the same file simultaneously?"

**Context if you need it:** Tests understanding of concurrent request handling and whether the HMAC scheme has race conditions.

**Strong answer:** "Each request gets its own multer buffer, its own hash computation, and its own token. Two identical files produce identical hashes, but the `iat` timestamps differ, so the tokens are different. There's no shared mutable state between requests."

**Red flag answer:** "They'd get the same token so one would overwrite the other." Tokens are computed per-request with different timestamps.

### Q3: "Why do you re-parse the CSV in the confirm endpoint instead of trusting the preview?"

**Context if you need it:** Probes your understanding of the TOCTOU problem and why the data needs to be available, not just verified.

**Strong answer:** "The token verifies file integrity — that the bytes haven't changed. But re-parsing is necessary because we need the actual parsed rows to insert into the database. The preview only returns 5 sample rows; confirm needs all of them. We could cache the full parse result, but for MVP file sizes the re-parse cost is trivial."

**Red flag answer:** "Because you can't trust the client." Partially right, but the token already establishes trust in the file content. Re-parsing is about needing the data, not about trust.

### Q4: "How would you modify this to support streaming uploads for large files?"

**Context if you need it:** Tests your ability to think beyond the current implementation. `multer.memoryStorage()` holds the whole file in RAM.

**Strong answer:** "I'd switch from `multer.memoryStorage()` to streaming to disk or S3 during upload, then process in chunks. The hash computation already works incrementally — `createHash('sha256').update(chunk)` can be called repeatedly. csv-parse supports stream mode too. The main architectural change is the preview endpoint would need to process the first N rows while streaming the rest to storage."

**Red flag answer:** "Just increase the memory limit." Doesn't scale. 100 concurrent 10MB uploads = 1GB of RAM just for upload buffers.

### Q5: "Why `base64url` encoding for the token instead of plain JSON?"

**Context if you need it:** Tests understanding of transport encoding.

**Strong answer:** "base64url is URL-safe and doesn't contain characters that need escaping in form fields or query strings. Raw JSON needs percent-encoding for `{`, `}`, `\"`. base64url also produces a shorter string for the same payload."

**Red flag answer:** "For security — base64 makes it harder to read." base64 is not encryption. Anyone can decode it. The security comes from the HMAC signature, not the encoding.

---

## 7. Data Structures & Algorithms Used

### Hash Map (JavaScript Object as key-value store)

**What it is:** A data structure that lets you look up values by key in constant time. In JavaScript, every plain object `{}` is a hash map — you store `obj[key] = value` and retrieve with `obj[key]`. Like a dictionary: look up a word (key) to find its definition (value).

**Where it appears:** `normalizeSampleRows` (lines 60-68) builds a new object per row where keys are normalized header names. `buildColumnTypes` (lines 49-57) builds a `Record<string, string>` mapping headers to inferred types.

**Why this one:** O(1) lookup by column name. An array of `[key, value]` pairs would require O(n) scanning. Since we do this per-row, the difference matters at scale.

**Complexity:** O(1) average for read and write. "O(1)" means the time doesn't grow as you add more entries.

**How to say it in an interview:** "Each row is a hash map keyed by column name, giving O(1) field access. The normalization step remaps keys to ensure the frontend gets a consistent key space regardless of original CSV casing."

### SHA-256 (Cryptographic Hash)

**What it is:** An algorithm that turns any amount of data into a fixed-length string (64 hex characters). Even changing one byte produces a completely different output. Like a fingerprint — unique to the data, much shorter, and irreversible.

**Where it appears:** `computeFileHash` (line 74-76) hashes the entire file buffer.

**Why this one:** Collision-resistant and standard. MD5 is faster but has known collision attacks. SHA-256 has no known practical attacks, and ~2ms for a 10MB file is negligible.

**Complexity:** O(n) where n is file size in bytes. Space is O(1) — output is always 32 bytes.

**How to say it in an interview:** "SHA-256 gives us a collision-resistant fingerprint of the file content. If even one byte changes between preview and confirm, the hash differs and token verification fails."

### HMAC-SHA-256 (Keyed Hash)

**What it is:** SHA-256 but with a secret key mixed in. Without HMAC, anyone could compute a hash of a file and forge a valid token. With HMAC, only someone who knows the secret can produce a valid signature. The difference between a photocopy (anyone can make one) and a notarized stamp (only the notary has the seal).

**Where it appears:** `signPreviewToken` (line 81) and `verifyPreviewToken` (lines 90-92).

**Why this one:** Plain SHA-256 provides integrity but not authentication. HMAC adds authentication. We reuse the existing `JWT_SECRET` rather than introducing a separate key.

**Complexity:** O(m) where m is payload length (under 100 chars). Effectively O(1).

**How to say it in an interview:** "HMAC-SHA-256 provides both integrity and authentication. The secret key ensures only our server can create valid tokens — an attacker who knows the file hash still can't forge a token without the key."

---

## 8. Impress the Interviewer

### TOCTOU is a real attack vector, not theoretical

**What's happening:** TOCTOU attacks exploit the gap between checking and acting. In a file upload context, an attacker could use browser dev tools to modify the FormData between preview and confirm requests — swapping in a different file. Straightforward with tools like Burp Suite or even the browser's network tab.

**Why it matters:** Without verification, an attacker in a shared org could preview a benign CSV, gain trust ("looks good, click confirm"), then intercept the confirm request and swap in data that corrupts the org's analytics. The HMAC token closes this gap with zero infrastructure cost.

**How to bring it up:** "I implemented TOCTOU protection because the two-phase upload creates a natural race condition window. The HMAC-signed token binds the file hash, org, and timestamp into a tamper-evident package that the confirm endpoint verifies before persisting."

### Multer populates req.body alongside req.file

**What's happening:** When the frontend sends a FormData with both a file and a text field (`previewToken`), multer parses both. The file goes to `req.file`, the text fields go to `req.body`. Standard multipart behavior that trips people up — they expect `req.body` to be empty when uploading files.

**Why it matters:** The confirm endpoint reads `req.body?.previewToken` alongside `req.file`. If you didn't know multer fills `req.body` for multipart forms, you might reach for a custom header or query parameter instead — messier and less standard.

**How to bring it up:** "The preview token travels as a text field in the same FormData as the file. Multer handles both — `req.file` for the binary, `req.body` for the text fields. Standard multipart behavior, no custom transport needed."

### Stateless verification vs. stateful storage

**What's happening:** Many upload flows store server-side state between preview and confirm — a Redis key, a database row, a temp file. The HMAC approach eliminates all of that. The client holds the token, the server verifies from scratch each time. The trade-off is re-parsing the file on confirm.

**Why it matters:** No cleanup jobs, no TTL management, no "what if Redis evicts the key" edge cases. The server can restart between preview and confirm and nothing breaks. Simpler operations, smaller blast radius from infrastructure failures.

**How to bring it up:** "I chose stateless HMAC tokens over Redis-backed sessions because it eliminates cleanup concerns and survives server restarts. The cost is a redundant parse on confirm, which is acceptable at our file size limits."

### Error messages written for the person reading them at 2am

**What's happening:** Every `ValidationError` includes specific, actionable context. Not "Invalid file" but "We expected a .csv file, but received a application/json file." Not "Validation failed" but "File has changed since preview. Please re-upload and preview again."

**Why it matters:** Generic error messages generate support tickets. Specific messages let users self-serve. The difference between "something went wrong" and telling the user exactly what's wrong and what to do about it.

**How to bring it up:** "I wrote error messages for the end user, not the developer. Every validation failure tells you what's wrong and what to do. The TOCTOU rejection message specifically tells them to re-upload, not just that something failed."
