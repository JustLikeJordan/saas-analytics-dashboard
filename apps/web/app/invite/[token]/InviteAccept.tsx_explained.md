# InviteAccept.tsx — interview-ready documentation

## Section 1: 30-second elevator pitch

This is the invite landing page component — what users see when they click an invite link. It validates the token against the API, shows the org name, and gives them a "Join with Google" button. The clever bit: the invite token survives the OAuth redirect by getting stashed in `sessionStorage` before the browser leaves, then plucked out by the callback handler when it returns.

**How to say it in an interview:** "This is a client component that validates an invite token via the BFF proxy, displays org info, and initiates OAuth with the invite token persisted in sessionStorage. The sessionStorage bridge lets the invite context survive the full-page redirect to Google and back."

---

## Section 2: Why this approach?

### Decision 1: sessionStorage for invite token persistence

OAuth is redirect-based — the browser navigates to Google and back. Any React state is wiped during navigation. `sessionStorage` persists across navigations within the same tab but clears on tab close. No cross-tab leakage, no cleanup burden.

**How to say it in an interview:** "The OAuth redirect destroys client-side state, so we persist the invite token in sessionStorage before redirecting. The callback handler reads and immediately clears it."

Over alternative: `localStorage` persists across sessions — stale tokens could interfere. URL params would expose the token in browser history. Cookies add unnecessary complexity.

### Decision 2: Validate before showing the join button

On mount, the component checks the invite via the BFF proxy. If it's expired or invalid, we show an error immediately — before the user goes through OAuth. Nobody wants to sign in only to discover the invite was invalid.

### Decision 3: BFF proxy for validation

The component fetches `/api/invites/${token}` — a Next.js route that forwards to Express. Browser never talks to Express directly. Same-origin, no CORS.

---

## Section 3: Code walkthrough

### State setup (lines 11-14)
Four state variables: `invite` (org info), `error` (failure message), `loading` (validation in progress), `joining` (OAuth redirect in progress — prevents double-clicks).

### Validation effect (lines 16-36)
On mount, fetches BFF proxy. Extracts error from standard envelope (`body.error?.message`) with fallback. Sets `loading: false` regardless. Fire-once effect — `[token]` dependency won't change since the page is server-rendered per URL.

### handleJoin (lines 38-54)
Sets `joining: true`, stashes token in sessionStorage, fetches `/api/auth/login` for the OAuth URL, then does `window.location.href` redirect. Programmatic redirect (not `<a>`) because we need to stash the token first.

### Loading state (lines 56-63)
Spinner + "Checking invite..." — flashes briefly since validation is fast.

### Error state (lines 65-75)
Error message with guidance to request a new link. Covers expired, used, and invalid tokens.

### Join state (lines 77-116)
Org name heading, Google OAuth button (same SVG and styling as login page), brief explanation.

---

## Section 4: Complexity and trade-offs

Two API calls total: validation on mount, login URL on click. Both via BFF proxy.

The sessionStorage approach assumes the OAuth round-trip happens in the same tab. Cross-tab or cross-browser scenarios lose the invite context. Acceptable for MVP — the alternative is encoding the invite token in the OAuth state parameter, which complicates state verification.

**How to say it in an interview:** "The sessionStorage bridge assumes same-tab OAuth. The alternative — encoding invite data in the OAuth state parameter — adds complexity to state verification without meaningful security benefit."

---

## Section 5: Patterns worth knowing

### BFF proxy pattern
Browser makes same-origin requests to Next.js, which forwards to Express. No CORS, no exposed backend URLs.

**Interview-ready line:** "The BFF proxy keeps Express internal-only. The browser talks same-origin to Next.js."

### sessionStorage as a redirect bridge
Write before redirect, read after redirect, clear immediately. Persists within tab, auto-clears on close.

**Interview-ready line:** "sessionStorage bridges the OAuth redirect — tab-scoped and ephemeral, making it effectively single-use."

---

## Section 6: Interview questions

### Q1: "Why not pass the invite token through the OAuth state parameter?"
"The state parameter is designed for CSRF prevention. Overloading it works but conflates purposes. sessionStorage is simpler and doesn't require changes to the OAuth callback verification."

### Q2: "What if the invite expires between validation and OAuth completion?"
"The backend validates again during the callback (in `handleGoogleCallback`). The page-load check is optimistic for UX; the callback check is the security boundary."

---

## Section 7: Data structures

Standard React state management with fetch calls. Linear state machine: loading -> (error | ready) -> joining -> redirected.

---

## Section 8: Impress the interviewer

### Two-phase validation
The invite token is validated twice — on page load (UX: show org name, catch failures early) and during the callback (security: prevent race conditions). First is optimistic, second is authoritative.

How to bring it up: "We validate twice — optimistically for UX on page load, authoritatively during the callback for security."

### sessionStorage scoping
`sessionStorage` is tab-scoped and origin-scoped. Can't be read by other tabs, other origins, or persisted across sessions. The callback handler clears it immediately after reading.

How to bring it up: "sessionStorage is ideal here — tab-scoped, ephemeral, and cleared immediately after use."
