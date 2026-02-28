# UploadDropzone.tsx — Interview-Ready Documentation

> Source file: `apps/web/app/upload/UploadDropzone.tsx` (383 lines)

---

## 1. 30-Second Elevator Pitch

This is the complete file upload interface for the analytics dashboard. It handles the full lifecycle: drag-and-drop or click-to-browse, real upload progress via XMLHttpRequest, server-validated preview, user confirmation with TOCTOU protection, data persistence, and auto-redirect to the dashboard. The whole thing is modeled as a 6-state finite state machine — `default`, `dragHover`, `processing`, `preview`, `success`, `error` — so the UI always shows exactly one state at a time. No boolean soup.

**How to say it in an interview:** "UploadDropzone is a client component modeling the full CSV upload lifecycle as a 6-state FSM. It uses XHR for real upload progress, delegates preview rendering to a presentational child component, re-sends the original file on confirm with an HMAC-signed token for TOCTOU protection, and auto-redirects after successful persistence. Every error path preserves the file reference for retry."

---

## 2. Why This Approach?

### Decision 1: Finite state machine over boolean flags

**What's happening:** Six states: `default`, `dragHover`, `processing`, `preview`, `success`, `error`. A single `state` variable drives the entire render. Compare this to doing it with booleans: `isLoading`, `isDragging`, `hasError`, `showPreview`, `isSuccess` — that's 5 booleans, 32 possible combinations, and most of them are nonsense. Can you be loading AND showing a preview AND in an error state? With booleans, nothing stops that. With a union type, it's impossible.

**How to say it in an interview:** "A single state discriminant replaces multiple booleans. With 6 booleans you'd have 64 possible combinations, most of them invalid. The state machine makes illegal states unrepresentable — the type system enforces it at compile time."

**Over alternative:** Multiple booleans with ad-hoc guards. Works at first, then someone adds a flag and forgets to reset another one.

### Decision 2: XMLHttpRequest instead of fetch for uploads

**What's happening:** The Fetch API doesn't expose upload progress events. `ReadableStream` gives download progress, but there's no equivalent for the request body. XHR's `upload.onprogress` fires as bytes leave the browser — the only way to show a real progress bar that correlates to actual transfer speed.

**How to say it in an interview:** "fetch doesn't support upload progress — only download progress via ReadableStream. XHR's upload event listener fires during transmission, which is the only browser API for real upload progress. It's one of the few cases where XHR is still the right tool."

**Over alternative:** Faking progress with a timer. Dishonest UX — users notice when a bar doesn't correlate with actual speed.

### Decision 3: Re-sending the file on confirm instead of caching rows client-side

**What's happening:** When the user clicks "Upload {N} rows," the component sends the original CSV file again via FormData along with the `previewToken`. The server re-parses, validates the token's HMAC to confirm the file hasn't changed, then persists. The alternative — storing all parsed rows in browser memory from the initial upload — would mean shipping potentially 50K rows as JSON through the BFF proxy. The CSV file is more compact than its JSON representation, and the user already waited to upload it once.

**How to say it in an interview:** "I re-send the original file on confirm rather than caching parsed rows client-side. A 50K-row CSV is more compact than its JSON equivalent, and the HMAC-signed preview token lets the server verify it's the same file without storing session state. It's a stateless, space-efficient approach."

**Over alternative:** Storing rows in browser state would skip the re-upload but balloon memory usage. Storing them server-side in Redis would add infrastructure for a transient need.

### Decision 4: HMAC preview token for TOCTOU protection

**What's happening:** TOCTOU stands for "Time of Check to Time of Use" — a class of bugs where state changes between when you verify something and when you act on it. Here, the user previews file A, then swaps it for file B before clicking confirm. Without the token, the server would blindly persist file B even though the user only saw file A's preview. The `previewToken` is an HMAC-signed blob containing the file's SHA-256 hash and org ID. On confirm, the server re-hashes the uploaded file and verifies the signature matches.

**How to say it in an interview:** "The preview token prevents TOCTOU attacks. It's an HMAC-signed payload containing the file's SHA-256 hash and org ID. On confirm, the server recomputes the hash and verifies the signature — no server-side session storage needed. Timing-safe comparison prevents side-channel leakage."

**Over alternative:** Trusting the client. In a multi-tenant SaaS app, you can't assume the file the user confirms is the file they previewed.

### Decision 5: Auto-redirect countdown after success

**What's happening:** After confirmation, the component shows a success state with a 3-second countdown, then automatically navigates to `/dashboard`. No "click here to continue" button. The countdown uses `useEffect` with a `setTimeout` chain — each second decrements the counter, and when it hits 0, `router.push('/dashboard')` fires.

**How to say it in an interview:** "The success state auto-redirects after a 3-second countdown using a useEffect timer chain. It keeps users in the flow without an extra click. The countdown is visible so the redirect isn't disorienting."

**Over alternative:** A "Go to Dashboard" button. Works, but adds friction for zero benefit — there's nothing else to do after uploading.

### Decision 6: Client-side validation before upload

**What's happening:** Three checks run before the network request: file size, file type (extension AND MIME), and empty file. Instant feedback, no round-trip.

**How to say it in an interview:** "Client-side validation is a UX optimization, not a security boundary. The server validates independently. But catching a 15MB file before upload saves the user from watching a progress bar that ends in error."

### Decision 7: Focus management on errors

**What's happening:** After setting error state, a `setTimeout(100ms)` focuses the alert container. Screen readers announce via `aria-live="assertive"`, keyboard users land right on the error.

**How to say it in an interview:** "The setTimeout focus handles two accessibility concerns: triggers the aria-live announcement for screen readers, and moves keyboard focus to the error so users don't have to tab around to find it."

---

## 3. Code Walkthrough

### Imports and types (lines 1-19)

Two groups: React hooks and Next.js router, then project internals. `DropzoneState` is a union of 6 string literals — the state machine's values. `UploadError` carries an error message, optional per-column validation errors, and the file name. `CsvPreview` is imported from the sibling presentational component.

### Touch detection and constants (lines 21-24)

`isTouchDevice` runs once at module scope (guarded by `typeof window` for SSR safety). Used to swap prompt text: "Tap to select" for mobile, "Drag your CSV here" for desktop. `REDIRECT_DELAY_S` is extracted as a named constant.

### State declarations (lines 26-38)

Eight `useState` hooks and three refs. The core `state` variable drives the render. Supporting states: `uploadProgress` (0-100 for the progress bar), `error` (terminal error data), `previewData` (the server's preview response including the HMAC token), `lastFile` (the File object, preserved across retries and cancel), `isConfirming` (loading flag during confirm), `confirmedRowCount` (for the success message), `countdown` (redirect timer). Refs target the hidden file input, the dropzone container, and the error alert.

### Redirect countdown effect (lines 41-51)

A `useEffect` that only runs when `state === 'success'`. Each second, it decrements `countdown`. When it hits 0, `router.push('/dashboard')` fires. The cleanup function clears the timeout — no orphaned timers on unmount.

### Client-side validation (lines 53-69)

`validateClientSide` returns a human-readable error string or `null`. Three checks in priority order: size (cheapest check), type (extension OR MIME — because some OSes set CSV MIME to `application/vnd.ms-excel`), then empty file. Think of a bouncer — size limit is the rope, file type is the dress code, empty file is checking if anyone's in the car.

### Upload function (lines 71-137)

The main upload logic. Wraps XMLHttpRequest in a Promise — bridging callback-based XHR with async/await. Four event listeners: `upload.progress` for the progress bar, `load` for completion (including 4xx/5xx), `error` for network failures, `abort` for cancellation.

After the promise resolves, it checks `response.ok`. On failure: extract structured error details from the API's standard envelope (`{ error: { message, details } }`). On success: store the `CsvPreviewData` and transition to `preview`.

Every error path follows the same pattern: set error data, set state to `error`, focus the alert after a tick.

### handleConfirm (lines 139-182)

The confirm flow. Builds a new `FormData` with the original file (`lastFile`) and the `previewToken` from the preview response. POSTs to the BFF confirm proxy at `/api/datasets/confirm`. On success: stores the row count, clears the file/preview references, resets the countdown, transitions to `success`. On failure: transitions to `error` with the server's message. The `isConfirming` flag prevents double-submits and drives the loading spinner in CsvPreview.

### handleCancel (lines 184-189)

Resets to `default` state. Clears preview data and confirming flag, but preserves `lastFile` — so if the user later hits an error, they still see "Last attempt: filename.csv" instead of a blank prompt.

### File selection and drag handlers (lines 191-231)

`handleFileSelect` delegates to `uploadFile`. Drag handlers manage the `dragHover` state. `handleDragLeave` guards against bubbling: `e.currentTarget === e.target` prevents false resets when the cursor crosses child element boundaries. `handleInputChange` resets the input value after selection so re-selecting the same file still triggers `onChange`.

`handleKeyDown` maps Enter and Space to opening the file picker — standard keyboard accessibility for custom buttons.

### Preview and success renders (lines 238-263)

Two early returns for `preview` and `success` states. The preview state renders the `CsvPreview` component with four props: `previewData`, `onConfirm`, `onCancel`, `isConfirming`. The success state shows a green card with a CheckCircle2 icon, confirmed row count (locale-formatted), and a live countdown: "Redirecting to dashboard in {N}..."

### Default/dragHover/processing/error renders (lines 265-363)

The main dropzone container with conditional content per state. A `cn()` call on the container swaps border and background colors per state. The hidden `<input type="file">` is `aria-hidden` with `tabIndex={-1}` — the dropzone div is the interactive element with `role="button"` and keyboard handling.

The error state shows inside the dropzone (destructive icon, last file name, "Drop a corrected file" prompt) AND below it (a detailed Alert with per-column error breakdown and a sample template link).

### DefaultContent subcomponent (lines 366-383)

Extracted to keep the main render clean. Shows the upload icon, adaptive text (touch vs. desktop), file size constraints, and a sample template link.

---

## 4. Complexity and Trade-offs

**State machine vs useReducer.** The machine uses `useState` with explicit `setState('error')` calls, not `useReducer` with dispatch actions. Works fine because transitions are straightforward — no complex action payloads or conditional next-states. `useReducer` would add ceremony without benefit here. If the FSM grew to 10+ states with conditional transitions, a reducer or library like XState would pay for itself.

**No upload cancellation.** The XHR is wrapped in a Promise, which hides the XHR instance. Adding cancel means storing the XHR ref and exposing it to a cancel handler. For an MVP where uploads are bounded at 10MB, this hasn't been worth the complexity.

**XHR continues on unmount.** If the component unmounts during upload, the XHR keeps running. The progress callbacks call `setState` on an unmounted component — a no-op in React 19 but still wasteful. Fix: store the XHR ref and abort in a cleanup function.

**File reference in memory.** `lastFile` holds the user's File object across state transitions. For a 10MB file, that's 10MB of browser memory until the component unmounts or confirm clears it. Acceptable given the size limit, but worth noting.

**Double network round-trip.** The confirm step re-uploads the file. The user waits for two uploads total: one for preview, one for persist. For files near 10MB on slow connections, that's noticeable. The trade-off buys TOCTOU protection and avoids storing 50K rows in browser memory.

**How to say it in an interview:** "The main trade-offs are no upload cancellation and a double round-trip on confirm. The first is acceptable given the 10MB cap. The second buys TOCTOU protection and avoids holding all parsed rows in memory. I'd add abort support and consider chunked upload if the size limit increased."

---

## 5. Patterns and Concepts Worth Knowing

### Finite State Machines in React

A state machine models something that can only be in one "mode" at a time, with defined transitions. Instead of tracking `isLoading`, `hasError`, `showPreview` as separate booleans (where you can accidentally be loading-and-errored simultaneously), you have one variable that's always exactly one of your defined states. In this file, `DropzoneState` is a TypeScript union of 6 strings.

**Interview-ready:** "A discriminated union state variable makes illegal states unrepresentable. It replaces boolean combinatorics with explicit, named states — the type system enforces valid transitions at compile time."

### Promise-Wrapped XMLHttpRequest

Fetch can't do upload progress. XHR can, but it's callback-based. Wrapping XHR in a Promise gives you real progress events with async/await control flow — the best of both worlds. The trade-off is you lose direct access to the XHR instance, making cancellation harder.

**Interview-ready:** "This bridges a callback API into a Promise for async/await while retaining access to events the newer API doesn't expose."

### Progressive Validation

Client checks first (instant, offline-capable), server validation second (catches everything the client can't). Both feed the same `UploadError` shape — the UI doesn't care where the error came from.

**Interview-ready:** "Client validation is UX optimization; server validation is the security boundary. Both use the same error display because they share the error shape."

### Container/Presentational Split

UploadDropzone is the container — it owns all state, handles effects, makes API calls, manages transitions. CsvPreview is presentational — it renders props into JSX with zero internal state. This split makes CsvPreview trivially testable and reusable in other contexts.

**Interview-ready:** "UploadDropzone manages the state machine and API integration while CsvPreview is a pure rendering function. The split decouples presentation from lifecycle management."

### TOCTOU Mitigation via Signed Tokens

Time-of-Check to Time-of-Use is a class of security bugs. The user previews file A, swaps it for file B, clicks confirm. The preview token prevents this by binding a cryptographic hash of the file to the confirm request. The server re-hashes and verifies — if they don't match, the request is rejected.

**Interview-ready:** "The confirm flow includes an HMAC-signed preview token binding the file's SHA-256 hash to the user's org. The server verifies the token on confirm, preventing file-swap attacks between preview and persist — all stateless."

### Accessible Custom Button

The dropzone is a `<div>` acting as a button: `role="button"`, `tabIndex={0}`, keyboard handler for Enter/Space, `aria-label`, focus-visible ring. The hidden file input is `aria-hidden` with `tabIndex={-1}`.

**Interview-ready:** "The dropzone implements the WAI-ARIA button pattern: role, tabIndex, keyboard events, focus styles. One clear interaction target for screen readers."

---

## 6. Potential Interview Questions

### Q1: "Why XMLHttpRequest instead of fetch?"

**Context if you need it:** The interviewer wants to know if you had a real reason or just grabbed the first answer from a forum.

**Strong answer:** "The Fetch API has no upload progress event. ReadableStream tracks download progress, but nothing fires as the request body is sent. XHR's upload.onprogress is the only browser API for that. The Promise wrapper gives me async/await ergonomics on top."

**Red flag:** "fetch doesn't support FormData." — It does. The issue is specifically upload progress.

### Q2: "How does the state machine prevent invalid states?"

**Context if you need it:** The interviewer is testing whether you understand the structural advantage over booleans.

**Strong answer:** "A single string union type means one state at a time. Compare to 5 booleans: 32 combinations, most nonsensical. The type system won't let you set state to 'loading-but-also-error.' Each render branch matches exactly one state, and TypeScript exhaustiveness checking would catch a missing case."

**Red flag:** "It's just cleaner code." — Vague. The real benefit is structural: illegal states are impossible, not just unlikely.

### Q3: "Why re-send the file on confirm instead of storing the parsed rows?"

**Context if you need it:** This probes your understanding of the space trade-off and the security angle.

**Strong answer:** "Two reasons. First, a 50K-row CSV is more compact than its JSON equivalent — sending the original file avoids bloating the request. Second, the HMAC preview token lets the server verify the file hasn't been swapped since preview. If I sent JSON rows, there'd be no way to verify they came from the original file."

**Red flag:** "To keep the frontend simple." — Misses both the efficiency and TOCTOU protection angles.

### Q4: "What happens if the component unmounts during the countdown?"

**Context if you need it:** Tests whether you understand useEffect cleanup and timer lifecycle.

**Strong answer:** "The useEffect returns a cleanup function that calls clearTimeout. If the component unmounts mid-countdown, the timer is cancelled and router.push never fires. Without cleanup, the redirect would execute against an unmounted component — a no-op in React 19 but a memory leak in older versions."

**Red flag:** "React handles that automatically." — It doesn't. setTimeout is a browser API, not managed by React.

### Q5: "Walk me through the drag-and-drop event flow."

**Context if you need it:** Drag events in the browser are notoriously tricky. The interviewer wants to know if you've dealt with the bubbling issue.

**Strong answer:** "dragenter sets the hover state. dragover calls preventDefault — without that, the browser opens the file. dragleave has a guard: e.currentTarget === e.target. Drag events bubble, so moving from the dropzone onto a child fires dragleave on the parent. The guard prevents flickering by only resetting when you actually leave the dropzone boundary."

**Red flag:** "I just handle onDrop." — Missing the preventDefault on dragover means the drop event won't fire at all.

### Q6: "How would you add upload cancellation?"

**Context if you need it:** Tests whether you understand the XHR-in-Promise trade-off and can extend the design.

**Strong answer:** "The XHR instance is currently hidden inside the Promise constructor. I'd store it in a ref so a cancel button can call xhr.abort(). The abort event listener already exists — it rejects the Promise with 'Upload cancelled.' I'd add a 'cancelling' transition state in the FSM to show feedback while the abort propagates."

**Red flag:** "Just call AbortController." — AbortController works with fetch, not XHR. Shows confusion between the two APIs.

---

## 7. Data Structures & Algorithms Used

### State Machine (String Union Discriminant)

**What it is:** A finite automaton with 6 named states and defined transitions. It's like a traffic light — it can only be red, yellow, or green. Never two at once. Transitions: default ↔ dragHover, default/dragHover → processing, processing → preview/error, preview → success/error (via confirm), error → processing (retry via re-upload), success → (redirect out).

**Where it appears:** The `state` variable and every `setState()` call in the component.

**Why this one:** Compared to boolean flags, a state machine guarantees mutual exclusion. You don't need runtime assertions like "if loading, error can't also be true" — the type system handles it.

**Complexity:** O(1) for state checks and transitions. The render is O(1) per state (each branch does bounded work).

**How to say it in an interview:** "The state machine models the upload lifecycle with explicit transitions. It's O(1) for every operation and eliminates an entire class of bugs — impossible states."

### FormData

**What it is:** The browser's built-in `multipart/form-data` encoder. Handles boundary strings and content-type headers automatically. More efficient than base64-encoding files into JSON (which bloats payload by ~33%).

**Where it appears:** Both `uploadFile` (initial upload) and `handleConfirm` (re-send with preview token).

**Why this one:** The server expects multipart because it uses multer for file parsing. JSON would require base64 encoding, which is larger and slower.

**Complexity:** O(n) where n is the file size — the browser reads file bytes to build the request.

**How to say it in an interview:** "FormData encodes the file as multipart — the native format for file uploads. It's used for both the initial preview upload and the confirm step, where the HMAC preview token rides alongside the file."

### Countdown Timer Chain

**What it is:** A series of `setTimeout` calls, each decrementing a counter by 1. Like a microwave countdown — each second ticks down, and when it hits 0, the action fires. The useEffect dependency on `countdown` creates a chain: state change → effect runs → setTimeout → state change → effect runs again.

**Where it appears:** The redirect countdown useEffect (lines 41-51).

**Why this one:** `setInterval` would also work but is harder to clean up correctly and can drift. Chained `setTimeout` calls are more predictable — each fires exactly once, and cleanup is a single `clearTimeout`.

**Complexity:** O(k) total where k = countdown seconds (default 3). Three timeouts total.

**How to say it in an interview:** "I used chained setTimeouts rather than setInterval for the countdown. Each tick is a discrete effect triggered by state change, which integrates cleanly with React's effect lifecycle and makes cleanup trivial."

### Ref-Based DOM Access

**What it is:** React refs are an "escape hatch" from the declarative rendering model. They give you a direct handle to a DOM element, like grabbing a specific book off a shelf instead of asking the librarian. Three refs here: `fileInputRef` for programmatic `input.click()`, `dropzoneRef` for potential future use, `alertRef` for programmatic `element.focus()` after errors.

**Where it appears:** Declared at the top of the component, used in handlers and the error focus logic.

**Why this one:** Some DOM operations are inherently imperative — clicking a hidden input, focusing an element for accessibility. React's declarative model can't express these naturally.

**Complexity:** O(1) for all ref operations.

**How to say it in an interview:** "Refs bridge React's declarative model with imperative DOM APIs — I use them for programmatic focus management and triggering the hidden file input."

---

## 8. Impress the Interviewer

### TOCTOU Protection Is a Security Pattern, Not an Optimization

**What's happening:** Between preview and confirm, there's a window where the user could swap the file. In a multi-tenant SaaS app, this matters — you need to verify the data being persisted is the data the user reviewed. The HMAC-signed preview token binds the file hash to the org at preview time. The server re-hashes on confirm and rejects mismatches.

**Why it matters:** Most upload tutorials skip this entirely. Mentioning TOCTOU protection in an interview signals that you think about security at the architecture level, not just input validation.

**How to bring it up:** "One thing I'm careful about is the confirm step. There's a TOCTOU window between preview and confirm where the file could be swapped. The server issues an HMAC-signed token binding the file's SHA-256 hash to the user's org, then verifies it on confirm. It's stateless — no Redis or session storage needed."

### Three Interaction Paths, All Accessible

**What's happening:** Desktop users drag-and-drop. Everyone can click-to-browse. Keyboard users press Enter or Space on the dropzone (`role="button"`, `tabIndex={0}`). Touch devices get different copy. Screen readers get `aria-live` announcements on errors.

**Why it matters:** Accessibility isn't optional — it's a legal requirement in many jurisdictions. But practically, an upload component that doesn't work with a keyboard excludes power users and anyone with motor difficulties.

**How to bring it up:** "I built three interaction paths — drag, click, keyboard — each working independently. Touch users get adapted copy, screen readers get live announcements on state changes. The dropzone implements the WAI-ARIA button pattern."

### Error Messages Are For Business Owners, Not Developers

**What's happening:** Every error tells the user what happened and what to do next. "File size exceeds 10MB limit. Try splitting your data into smaller files." instead of "413 Payload Too Large." "This file appears to be empty. Download our sample template" instead of "Validation error: zero rows."

**Why it matters:** The target persona is a small business owner who uploads data monthly. Technical error codes are meaningless to them. Actionable messages reduce support tickets and build trust.

**How to bring it up:** "Every error includes a next step — download a template, split your file, try a different format. We follow a product-blame convention: it's never 'you uploaded the wrong thing,' it's 'we expected a CSV file.'"

### File Reference Preservation Across Retries

**What's happening:** When the user hits an error or cancels a preview, the component preserves `lastFile`. The error state shows "Last attempt: filename.csv" and accepts a new file. Cancel preserves the file reference too. This avoids the frustration of "I had a file selected, where did it go?"

**Why it matters:** Upload flows are high-friction moments. Users are most likely to abandon during errors. Preserving context — the file name, the error details — reduces cognitive load and makes retry feel seamless.

**How to bring it up:** "I preserved the file reference across error and cancel states. Upload is a high-friction moment — losing context during an error is the fastest way to lose a user."
