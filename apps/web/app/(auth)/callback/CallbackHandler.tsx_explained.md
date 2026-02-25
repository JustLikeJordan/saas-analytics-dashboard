# CallbackHandler.tsx — Interview-Ready Documentation

> Source file: `apps/web/app/(auth)/callback/CallbackHandler.tsx` (84 lines)

---

## 1. 30-Second Elevator Pitch

After a user approves the sign-in on Google, Google redirects the browser back to your app with a one-time authorization `code`. This component catches that redirect, sends the code to your backend (which exchanges it for real tokens), and then sends the user to wherever they were originally trying to go. It shows a spinner while the token exchange happens, then navigates away.

**How to say it in an interview:** "This is the OAuth callback handler. It receives the authorization code from Google, exchanges it via the BFF proxy for access and refresh tokens (set as httpOnly cookies by the backend), reads the saved redirect destination from sessionStorage, validates it against open redirect attacks, and navigates the user to their intended page."

---

## 2. Why This Approach?

### Decision 1: useEffect for the code exchange, not a server action

**What's happening:** The code exchange happens in a `useEffect` — React's way of running side effects after a component renders. Why not do this on the server? Because the response from the exchange sets httpOnly cookies, and those cookies need to be set in the browser's context. The BFF proxy forwards the `Set-Cookie` headers from the Express backend, and the browser processes them automatically. A server action couldn't set browser cookies in the same way.

**How to say it in an interview:** "The code exchange runs in useEffect because the response sets httpOnly cookies via Set-Cookie headers. The browser needs to receive these headers directly to store the cookies — a server-side exchange would require manual cookie forwarding."

**Over alternative:** A server action or route handler could do the exchange, but cookie handling becomes awkward — you'd need to forward Set-Cookie headers manually through the Next.js response pipeline.

### Decision 2: Cleanup function to prevent stale state updates

**What's happening:** The useEffect returns `() => { cancelled = true }`. If the component unmounts while the fetch is in-flight, the `cancelled` flag prevents updating state on an unmounted component.

**How to say it in an interview:** "The cleanup function sets a cancellation flag to prevent state updates after unmount. This avoids the React 'can't perform a state update on an unmounted component' warning and prevents stale updates from racing with navigation."

**Over alternative:** AbortController would cancel the fetch itself (more aggressive), but the cancellation flag is simpler and sufficient — we don't need to cancel the network request, just ignore its result.

### Decision 3: sessionStorage for redirect destination, with /dashboard fallback

**What's happening:** After the code exchange succeeds, the handler checks sessionStorage for a saved redirect path. If found, it navigates there and cleans up. If not found, it defaults to `/dashboard`.

**How to say it in an interview:** "The redirect destination survives the OAuth round-trip via sessionStorage. The LoginButton saves it before redirecting to Google, and the callback handler reads and cleans it up after the exchange."

### Decision 4: Open redirect guard on the stored redirect path

**What's happening:** Before navigating to the stored redirect, the handler validates it's a relative path — it must start with `/` but not `//`. An attacker who can write to sessionStorage (via XSS) could set `auth_redirect` to `//evil.com`. Browsers interpret `//evil.com` as `https://evil.com`, but it starts with `/`, so a naive check would let it through. The double-slash check catches that.

**How to say it in an interview:** "We validate the stored redirect before navigating. It must start with a single slash — that guarantees it's a relative path on our origin. Protocol-relative URLs like `//evil.com` are rejected because they start with `//`. Anything failing validation falls back to `/dashboard`."

**Over alternative:** You could parse the URL with `new URL()` and compare origins, but that's heavier machinery for a simple check. The `startsWith('/') && !startsWith('//')` pattern is well-understood, cheap, and covers the attack vectors for path-based redirects.

---

## 3. Code Walkthrough

### Props and state setup (lines 6-14)

The component receives `code` and `state` as props — these come from Google's callback URL query parameters, parsed by the parent server component.

### The useEffect (lines 16-60)

The core logic:
1. **Validates props** — If `code` or `state` is missing, sets an error immediately.
2. **Reads invite token** — Checks sessionStorage for `pending_invite_token` (set by the invite acceptance page when a user clicks "Join with Google"). Removes it immediately regardless of outcome.
3. **Exchanges the code** — POSTs `{ code, state, inviteToken }` to `/api/auth/callback`. If `inviteToken` is present, the backend redeems the invite and adds the user to the inviting org instead of auto-creating a new one.
4. **Validates and redirects** — Reads the saved redirect from sessionStorage, removes it, then validates the value is a safe relative path (starts with `/`, does not start with `//`). Falls back to `/dashboard` on failure. Uses `router.push()` to navigate.

The `cancelled` flag and cleanup return prevent stale updates if the component unmounts.

### Error UI (lines 59-73)

Error card with "Sign In Failed" heading, the error message, and a "Try Again" link back to `/login`.

### Loading UI (lines 76-83)

Spinning circle with "Signing you in..." — shown during the code exchange.

---

## 4. Complexity and Trade-offs

**Single attempt, no retry:** If the code exchange fails, the user sees an error and must click "Try Again." Authorization codes are single-use, so retrying the same exchange would fail anyway.

**State verification happens server-side:** This component sends `state` to the backend but doesn't verify it. The backend compares it against the CSRF token stored in the session cookie.

**How to say it in an interview:** "The main trade-off is simplicity over robustness — no retry logic because OAuth codes are single-use. The component handles the happy path and the sad path without trying to be clever about recovery."

---

## 5. Patterns and Concepts Worth Knowing

### OAuth Authorization Code Exchange

After the user approves your app on Google's consent screen, Google redirects back with a short-lived `code`. Your server sends this code (plus your client secret) to Google's token endpoint and gets back the user's tokens and profile info.

**Where it appears:** The `exchangeCode` function POSTs the code to the BFF proxy.

**Interview-ready line:** "The callback handler sends the authorization code to our BFF proxy, which exchanges it server-side with Google. The code never goes directly to Google from the browser — keeping the client secret safe."

### useEffect Cleanup Pattern

React's useEffect can return a cleanup function that runs when the component unmounts. It prevents memory leaks and stale state updates from async operations.

**Where it appears:** `return () => { cancelled = true }` at the end of the useEffect.

**Interview-ready line:** "The useEffect cleanup sets a cancellation flag to prevent state updates after unmount. It's lighter than AbortController since we only need to skip the state update, not cancel the network request."

### Open Redirect Guard

An open redirect happens when an application takes a user-supplied URL and navigates to it without checking where it points. The classic trick is `//evil.com` — browsers treat this as `https://evil.com`, but it starts with `/`. The fix is: starts with `/` AND does not start with `//`.

**Where it appears:** Lines 41-42, after reading from sessionStorage.

**Interview-ready line:** "We guard against open redirects by validating the stored path starts with a single slash. The `//` check catches protocol-relative URLs — the most common bypass for naive path validation."

---

## 6. Potential Interview Questions

### Q1: "Why POST to the BFF proxy instead of exchanging directly with Google?"

**Strong answer:** "The exchange requires the client secret, which must never be exposed to the browser. Our BFF proxy forwards the code to the Express backend, which has the secret and communicates with Google's token endpoint server-to-server."

**Red flag answer:** "We could do it from the browser with a CORS request." — Exposing the client secret in browser code is a security vulnerability.

### Q2: "How does the CSRF state parameter prevent attacks?"

**Strong answer:** "The backend generates a random state value, stores it in a session cookie, and includes it in the Google auth URL. When Google redirects back, the backend verifies the state matches the cookie. An attacker can't forge this because they don't have the victim's session cookie."

**Red flag answer:** "It validates the code is from Google." — The code doesn't need CSRF validation. State prevents attackers from initiating OAuth flows on behalf of victims.

### Q3: "Why validate the redirect from sessionStorage? Can't you trust your own storage?"

**Strong answer:** "sessionStorage isn't a trusted boundary. If there's an XSS vulnerability anywhere in the app, an attacker can write arbitrary values to sessionStorage. They could set `auth_redirect` to `//evil.com`. Post-auth redirects are high-value targets for phishing because the user just authenticated and trusts the flow. Two lines of validation close that gap."

**Red flag answer:** "sessionStorage is per-origin, so it's safe." — Per-origin doesn't mean per-trust-level. Any JavaScript running on your origin can read and write sessionStorage.

---

## 7. Data Structures & Algorithms Used

No meaningful data structures or algorithms. The component uses a boolean flag for cancellation and sessionStorage (browser key-value store) for redirect persistence. The async flow is fetch -> check -> validate -> navigate.

---

## 8. Impress the Interviewer

### The sessionStorage Handoff Completes the Redirect Chain

The redirect destination travels through four boundaries: (1) proxy.ts adds `?redirect=` to the login URL, (2) LoginPage passes it as a prop to LoginButton, (3) LoginButton saves it to sessionStorage before the Google redirect, (4) CallbackHandler reads and clears it after the exchange.

**How to bring it up:** "The redirect chain spans four components and survives a cross-domain round-trip to Google. sessionStorage is the persistence layer that bridges the gap — it's tab-scoped, so parallel login tabs don't interfere."

### Credentials: 'include' Is the Linchpin

The fetch to `/api/auth/callback` includes `credentials: 'include'`, which tells the browser to send existing cookies (the OAuth state cookie) and accept new cookies (the access and refresh tokens). Without this, the browser would ignore the Set-Cookie headers.

**How to bring it up:** "The `credentials: 'include'` on the exchange fetch is essential. It tells the browser to both send the CSRF state cookie and accept the new token cookies. Without it, the exchange succeeds but the tokens are silently discarded."

### The Two-Character Open Redirect Guard

After reading the stored redirect, the handler checks `stored.startsWith('/') && !stored.startsWith('//')`. That second condition blocks protocol-relative URLs like `//evil.com`. Post-auth redirects are particularly dangerous for phishing because the user just proved their identity — they're primed to trust whatever page appears next.

**How to bring it up:** "We validate the redirect target before navigating. Protocol-relative URLs like `//evil.com` start with a slash, so they'd pass a naive validation. Post-auth redirects are high-value phishing targets — two lines of validation close that gap."
