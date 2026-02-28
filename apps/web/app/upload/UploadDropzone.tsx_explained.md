# UploadDropzone.tsx — Explained

## 1. 30-Second Elevator Pitch

This is the file upload interface for small business owners to get their CSV data into the analytics dashboard. It handles the full lifecycle: drag-and-drop or click-to-browse, client-side validation (size, type, empty file), real upload progress via XMLHttpRequest, and branching into either a preview state or a detailed error with per-column validation messages. The component is a 6-state finite state machine — each state maps to a distinct visual treatment, so the UI always reflects exactly where the user is in the upload process.

**How to say it in an interview:** "UploadDropzone is a client component that models file upload as a 6-state finite state machine. It uses XMLHttpRequest instead of fetch for real-time upload progress, validates client-side before hitting the network, and renders accessible error states with structured server validation details. All uploads go through a BFF proxy to the Express API."

---

## 2. Why This Approach?

### Decision 1: XMLHttpRequest over fetch for upload progress

**What's happening:** The Fetch API doesn't expose upload progress events. `ReadableStream` gives download progress, but there's no equivalent for the request body. XHR's `upload.onprogress` fires as bytes leave the browser.

**How to say it in an interview:** "fetch doesn't support upload progress — only download progress via ReadableStream. XHR's upload event listener fires during transmission, which is the only way to show real progress. It's one of the few cases where XHR is still the right tool."

**Over alternative:** Faking progress with a timer is dishonest UX. Users notice when a bar doesn't correlate with actual speed.

### Decision 2: Finite state machine for UI states

**What's happening:** Six states: `default`, `dragHover`, `processing`, `preview`, `success`, `error`. A single `state` variable drives the entire render. No boolean soup like `isLoading && !hasError && !isDragOver`.

**How to say it in an interview:** "A single state discriminant replaces multiple booleans. With 6 booleans you'd have 64 possible combinations, most of them invalid. The state machine makes illegal states unrepresentable."

### Decision 3: Client-side validation before upload

**What's happening:** Three checks run before the network request: file size, file type (extension AND MIME), and empty file. Instant feedback, no round-trip.

**How to say it in an interview:** "Client-side validation is a UX optimization, not a security boundary. The server validates independently. But catching a 15MB file before upload saves the user from watching a progress bar that ends in error."

### Decision 4: Touch detection for adaptive copy

**What's happening:** Detects touch devices at module scope and swaps prompt text. Touch users see "Tap to select" instead of "Drag your CSV here."

**How to say it in an interview:** "We detect touch capability using ontouchstart and maxTouchPoints. Drag-and-drop prompts confuse mobile users, so we adapt copy to match their primary interaction."

### Decision 5: Focus management on errors

**What's happening:** After setting error state, a `setTimeout(100ms)` focuses the alert container. Screen readers announce via `aria-live="assertive"`, keyboard users land right on the error.

**How to say it in an interview:** "The setTimeout focus handles two accessibility concerns: triggers aria-live announcement for screen readers, and moves keyboard focus to the error so users don't have to tab around to find it."

---

## 3. Code Walkthrough

### Types and detection (lines 11-20)

`DropzoneState` is a union of 6 string literals — the state machine's values. `UploadError` carries the error message, optional per-column validation errors, and file name. `isTouchDevice` runs once at module scope (guarded by `typeof window` for SSR safety).

### State declarations (lines 22-30)

Five `useState` hooks and three refs. The state variable drives the render. `uploadProgress` is 0-100 for the progress bar. `error` and `previewData` hold terminal state data. `lastFile` remembers the file for retry messaging. Refs target the hidden file input, dropzone container, and error alert.

### Client-side validation (lines 32-48)

`validateClientSide` returns a human-readable error string or `null`. Three checks in priority order: size (cheapest), type (extension OR MIME — because some OSes set CSV MIME to `application/vnd.ms-excel`), then empty file. Think of a bouncer — size limit is the rope, file type is the dress code, empty file is checking if anyone's in the car.

### Upload function (lines 50-117)

The core logic. Wraps XMLHttpRequest in a Promise — bridging callback-based XHR with async/await. Four event listeners: `upload.progress` for the progress bar, `load` for completion (even 4xx/5xx), `error` for network failures, `abort` for cancellation.

After the promise resolves, it checks `response.ok`. On failure, it extracts structured error details from the API's standard envelope (`{ error: { message, details } }`). On success, it pulls `CsvPreviewData` and transitions to `preview`.

Every error path follows the same pattern: set error data, set state to `error`, focus the alert after a tick.

### Drag and drop handlers (lines 119-161)

`handleDragEnter` switches to `dragHover`. `handleDragOver` prevents default (required — otherwise the browser opens the file). `handleDragLeave` checks `e.currentTarget === e.target` to prevent false resets when the cursor crosses child elements. `handleDrop` grabs the first file. `handleInputChange` handles the hidden input, resetting its value so re-selecting the same file triggers `onChange`.

`handleKeyDown` maps Enter and Space to opening the file picker — standard keyboard accessibility for custom buttons.

### Render (lines 167-309)

Conditional tree keyed on `state`. Each branch shows a different visual: default (upload icon, adaptive text), dragHover (primary highlight), processing (pulsing icon, progress bar), preview (file icon, row count), error (destructive icon, retry prompt).

Below the dropzone: error alert with per-column details and sample template link, plus a warnings alert for files that succeeded with non-fatal issues.

The hidden `<input>` has `aria-hidden` and `tabIndex={-1}`. The dropzone div is the interactive element with `role="button"` and keyboard handling.

---

## 4. Complexity and Trade-offs

**State machine vs useReducer.** The machine uses `useState` with explicit `setState('error')` calls, not `useReducer` with dispatch actions. Works fine because transitions are simple — no complex action payloads. `useReducer` would add ceremony without benefit for this component.

**No upload cancellation.** The XHR is wrapped in a Promise, which makes async/await ergonomic but hides the XHR instance. Adding cancel means storing the XHR ref and exposing it to the UI.

**XHR continues on unmount.** If the component unmounts during upload, the XHR runs in the background. Progress callbacks call `setState` on an unmounted component — a no-op in React 19 but still wasteful. Fix: store XHR ref and abort in a cleanup function.

**How to say it in an interview:** "The main trade-off is no upload cancellation. XHR is wrapped in a promise for ergonomics, but that hides the reference needed for abort. Adding cancel means lifting the XHR ref into state."

---

## 5. Patterns and Concepts Worth Knowing

### Finite State Machines in React

A single string discriminant instead of scattered booleans. You can't be in `processing` and `error` simultaneously. The type system enforces it.

**Interview-ready line:** "A discriminated union state variable makes illegal states unrepresentable. It replaces boolean combinatorics with explicit, named states."

### Promise-Wrapped XMLHttpRequest

Fetch can't do upload progress. XHR can, but it's callback-based. Wrapping in a Promise gives you real progress events with async/await control flow.

**Interview-ready line:** "This bridges a callback API into a Promise for async/await while retaining access to events the newer API doesn't expose."

### Progressive Validation

Client checks first (instant, offline-capable), server validation second (catches everything the client can't). Both feed the same `UploadError` shape.

**Interview-ready line:** "Client validation is UX optimization; server validation is the security boundary. Both use the same error display because they share the error shape."

### Accessible Custom Button

The dropzone is a `<div>` acting as a button: `role="button"`, `tabIndex={0}`, keyboard handler for Enter/Space, `aria-label`, focus-visible ring. The hidden file input is `aria-hidden` with `tabIndex={-1}`.

**Interview-ready line:** "The dropzone implements WAI-ARIA button pattern: role, tabIndex, keyboard events, focus styles. One clear interaction target for screen readers."

---

## 6. Potential Interview Questions

### Q1: "Why XMLHttpRequest instead of fetch?"

**Strong answer:** "The Fetch API has no upload progress event. ReadableStream tracks download progress, but nothing fires as the request body is sent. XHR's `upload.onprogress` is the only browser API for that. The Promise wrapper gives me async/await ergonomics."

**Red flag:** "fetch doesn't support FormData." — It does. The issue is specifically upload progress.

### Q2: "How does the state machine prevent invalid states?"

**Strong answer:** "A single string union type means one state at a time. Compare to 5 booleans: 32 combinations, most nonsensical. The type system won't let you set state to 'loading-but-also-error.'"

### Q3: "What happens if the component unmounts during upload?"

**Strong answer:** "The XHR continues — it's not tied to React's lifecycle. The setState calls are no-ops on unmounted components in React 19 but still wasteful. Fix: store the XHR ref and call abort() in a cleanup function."

**Red flag:** "React handles that automatically." — The network request is independent of the component lifecycle.

### Q4: "Why validate both extension and MIME type?"

**Strong answer:** "OSes are inconsistent. Windows sometimes reports CSVs as `application/vnd.ms-excel`. macOS usually says `text/csv`. Checking both extension OR MIME avoids false rejections."

### Q5: "Walk me through the handleDragLeave guard."

**Strong answer:** "Drag events bubble. Moving from the dropzone div onto a child element fires dragLeave on the parent. Without the `currentTarget === target` guard, the highlight flickers on every child boundary crossing. The guard ensures we only reset when actually leaving the dropzone."

---

## 7. Data Structures & Algorithms Used

### State Machine (String Union Discriminant)

Six states forming a finite automaton: default → dragHover ↔ default, default/dragHover → processing → preview/error, error → processing (retry). Each state maps to one render branch.

### FormData

The browser's built-in `multipart/form-data` encoder. Handles boundary strings and content-type headers automatically. More efficient than base64-in-JSON (which bloats payload ~33%).

### Ref-Based DOM Access

Three refs: `fileInputRef` for programmatic `input.click()`, `dropzoneRef` for potential future use, `alertRef` for programmatic `element.focus()`. Refs are React's escape hatch to imperative DOM APIs.

---

## 8. Impress the Interviewer

### Illegal States Are Unrepresentable

Six explicit states vs five booleans means 6 valid configurations instead of 32. Point this out early — it shows you think about state modeling.

**How to bring it up:** "I modeled the upload lifecycle as a finite state machine. Six named states instead of boolean flags — the type system prevents impossible combinations."

### Three Interaction Paths

Drag-and-drop for desktop, click-to-browse for everyone, keyboard Enter/Space for accessibility. Touch devices get adapted copy. Screen readers get `aria-live` announcements. No user left out.

**How to bring it up:** "Three interaction paths — drag, click, keyboard — each working independently. Touch users get different copy, screen readers get live announcements."

### Error Messages Are Actionable

"Try splitting your data into smaller files" instead of "413 Payload Too Large." "Download our sample template" instead of "Invalid schema." The target user is a business owner, not a developer.

**How to bring it up:** "Every error includes a next step. Technical status codes never reach the UI."

### XHR in 2026 Is Pragmatic Engineering

Using XHR sounds like a red flag. But it's the only browser API that tracks upload progress. Wrapping it in a Promise bridges the old API into modern control flow. Using the right tool even when it's not the newest one.

**How to bring it up:** "I chose XHR specifically for upload progress — fetch doesn't support it. The Promise wrapper gives async/await ergonomics. It's pragmatic: the right tool, not the newest."
