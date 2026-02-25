# CallbackHandler.tsx — Interview-Ready Documentation

> Source file: `apps/web/app/(auth)/callback/CallbackHandler.tsx` (82 lines)

---

## 1. 30-Second Elevator Pitch

After a user approves the sign-in on Google, Google redirects the browser back to your app with a one-time authorization `code`. This component catches that redirect, sends the code to your backend (which exchanges it for real tokens), and then sends the user to wherever they were originally trying to go. It's the "landing strip" for the OAuth round-trip — it shows a spinner while the token exchange happens, then navigates away.

**How to say it in an interview:** "This is the OAuth callback handler. It receives the authorization code from Google, exchanges it via the BFF proxy for access and refresh tokens (set as httpOnly cookies by the backend), reads the saved redirect destination from sessionStorage, and navigates the user to their intended page."

---

## 2. Why This Approach?

### Decision 1: useEffect for the code exchange, not a server action

**What's happening:** The code exchange happens in a `useEffect` — React's way of running side effects after a component renders. Why not do this on the server? Because the response from the exchange sets httpOnly cookies, and those cookies need to be set in the browser's context. The BFF proxy forwards the `Set-Cookie` headers from the Express backend, and the browser processes them automatically. A server action couldn't set browser cookies in the same way.

**How to say it in an interview:** "The code exchange runs in useEffect because the response sets httpOnly cookies via Set-Cookie headers. The browser needs to receive these headers directly to store the cookies — a server-side exchange would require manual cookie forwarding, which is more complex."

**Over alternative:** A server action or route handler could do the exchange, but cookie handling becomes awkward — you'd need to forward Set-Cookie headers manually through the Next.js response pipeline.

### Decision 2: Cleanup function to prevent stale state updates

**What's happening:** The useEffect returns `() => { cancelled = true }`. If the component unmounts while the fetch is in-flight (user navigates away, React re-renders), the `cancelled` flag prevents updating state on an unmounted component. It's like putting a note on a package: "if I've moved, don't deliver."

**How to say it in an interview:** "The cleanup function sets a cancellation flag to prevent state updates after unmount. This avoids the React 'can't perform a state update on an unmounted component' warning and prevents stale updates from racing with navigation."

**Over alternative:** AbortController would cancel the fetch itself (more aggressive), but the cancellation flag is simpler and sufficient — we don't need to cancel the network request, just ignore its result.

### Decision 3: sessionStorage for redirect destination, with `/dashboard` fallback

**What's happening:** After the code exchange succeeds, the handler checks sessionStorage for a saved redirect path (set by LoginButton before the Google redirect). If found, it navigates there and cleans up. If not found (user went directly to `/login` without coming from a protected page), it defaults to `/dashboard`.

**How to say it in an interview:** "The redirect destination survives the OAuth round-trip via sessionStorage. The LoginButton saves it before redirecting to Google, and the callback handler reads and cleans it up after the exchange. The `/dashboard` fallback handles direct login navigation."

---

## 3. Code Walkthrough

### Props and state setup (lines 6-14)

The component receives `code` and `state` as props — these come from Google's callback URL query parameters, parsed by the parent server component (`CallbackPage`). The `error` state tracks exchange failures.

### The useEffect (lines 16-55)

The core logic. It:
1. **Validates props** — If `code` or `state` is missing, sets an error immediately. This handles cases where Google redirects without the expected parameters (user denied permission, URL was tampered with).
2. **Exchanges the code** — POSTs `{ code, state }` to `/api/auth/callback` (the BFF proxy), which forwards to the Express backend. The backend verifies the CSRF state, exchanges the code with Google for tokens, creates or finds the user, and responds with Set-Cookie headers for the access and refresh tokens.
3. **Redirects** — Reads the saved redirect from sessionStorage, cleans it up, and uses `router.push()` to navigate. Unlike the Google redirect in LoginButton (which used `window.location.href`), this is a same-origin navigation, so Next.js router handles it efficiently.

The `cancelled` flag and cleanup return prevent stale updates if the component unmounts during the async operation.

### Error UI (lines 57-72)

A simple error card with "Sign In Failed" heading, the error message, and a "Try Again" link back to `/login`. Uses an `<a>` tag instead of Next.js `Link` for the retry — this forces a full page reload, clearing any stale state.

### Loading UI (lines 74-81)

A spinning circle with "Signing you in..." — shown during the code exchange. The CSS animation is pure Tailwind (`animate-spin` with a half-transparent border for the spinner effect).

---

## 4. Complexity and Trade-offs

**Single attempt, no retry:** If the code exchange fails, the user sees an error and must click "Try Again." Authorization codes are single-use, so retrying the same exchange would fail anyway — the user needs to restart the OAuth flow from scratch.

**State verification happens server-side:** This component sends `state` to the backend but doesn't verify it. The backend compares it against the CSRF token stored in the session cookie. This is correct — CSRF verification must happen server-side where the session state lives.

**Race with React.StrictMode:** In development, React.StrictMode double-mounts components, which would fire the useEffect twice. The cancellation flag on the first unmount prevents the first effect's cleanup from interfering, but the code exchange could be attempted twice. Authorization codes are single-use, so the second attempt would fail. In production (no StrictMode double-mount), this isn't an issue.

**How to say it in an interview:** "The main trade-off is simplicity over robustness — no retry logic because OAuth codes are single-use. The component handles the happy path (exchange, redirect) and the sad path (show error, offer retry) without trying to be clever about recovery."

---

## 5. Patterns and Concepts Worth Knowing

### OAuth Authorization Code Exchange

After the user approves your app on Google's consent screen, Google redirects back with a short-lived `code`. Your server sends this code (plus your client secret) to Google's token endpoint and gets back the user's access token and profile info. The code is single-use and expires in minutes — it's like a claim ticket that can only be redeemed once.

**Where it appears:** The `exchangeCode` function POSTs the code to the BFF proxy, which forwards to the Express backend for the actual exchange with Google.

**Interview-ready line:** "The callback handler sends the authorization code to our BFF proxy, which exchanges it server-side with Google. The code never goes directly to Google from the browser — keeping the client secret safe on the server."

### useEffect Cleanup Pattern

React's useEffect can return a cleanup function that runs when the component unmounts or before the effect re-runs. It's the standard way to prevent memory leaks and stale state updates from async operations that outlive their component.

**Where it appears:** `return () => { cancelled = true }` at the end of the useEffect.

**Interview-ready line:** "The useEffect cleanup sets a cancellation flag to prevent state updates after unmount. It's lighter than AbortController since we only need to skip the state update, not cancel the network request."

---

## 6. Potential Interview Questions

### Q1: "Why POST to the BFF proxy instead of exchanging directly with Google?"

**Context if you need it:** The authorization code exchange requires your OAuth client secret. The interviewer is testing whether you know why.

**Strong answer:** "The exchange requires the client secret, which must never be exposed to the browser. Our BFF proxy forwards the code to the Express backend, which has the secret and communicates with Google's token endpoint server-to-server. The browser never sees the client secret."

**Red flag answer:** "We could do it from the browser with a CORS request." — Exposing the client secret in browser code is a critical security vulnerability.

### Q2: "What if the user hits the back button after the exchange completes?"

**Context if you need it:** Tests awareness of navigation edge cases.

**Strong answer:** "They'd land on the callback page again, but without fresh `code` and `state` params (those are consumed). The component would show 'Missing authentication parameters' error since the params would be missing or stale. The 'Try Again' link takes them back to login, which is the correct recovery path."

**Red flag answer:** "Nothing bad happens." — The user would see an error, which is fine but worth acknowledging.

### Q3: "How does the CSRF state parameter prevent attacks?"

**Context if you need it:** The `state` parameter is an anti-CSRF mechanism in the OAuth flow.

**Strong answer:** "The backend generates a random state value, stores it in a session cookie, and includes it in the Google auth URL. When Google redirects back, the callback sends both the state from the URL and the cookie. The backend verifies they match — an attacker can't forge this because they don't have the victim's session cookie."

**Red flag answer:** "It validates the code is from Google." — The code itself doesn't need CSRF validation. The state parameter prevents an attacker from initiating an OAuth flow on behalf of the victim.

---

## 7. Data Structures & Algorithms Used

No meaningful data structures or algorithms. The component uses a boolean flag for cancellation and sessionStorage (browser key-value store) for redirect persistence. The async flow is straightforward fetch → check → navigate.

---

## 8. Impress the Interviewer

### The sessionStorage Handoff Completes the Redirect Chain

**What's happening:** The redirect destination travels through four boundaries: (1) proxy.ts adds `?redirect=` to the login URL, (2) LoginPage passes it as a prop to LoginButton, (3) LoginButton saves it to sessionStorage before the Google redirect, (4) CallbackHandler reads and clears it after the exchange. The sessionStorage is the bridge that survives the cross-domain round-trip to Google.

**Why it matters:** Losing the redirect destination is one of the most common OAuth UX bugs. Users expect to land where they were going, not on a generic dashboard. The sessionStorage bridge is the simplest solution that works.

**How to bring it up:** "The redirect chain spans four components and survives a cross-domain round-trip to Google. sessionStorage is the persistence layer that bridges the gap — it's tab-scoped, so parallel login tabs don't interfere with each other."

### Credentials: 'include' Is the Linchpin

**What's happening:** The fetch to `/api/auth/callback` includes `credentials: 'include'`, which tells the browser to send existing cookies (the OAuth state cookie) and accept new cookies (the access and refresh tokens) from the response. Without this, the browser would ignore the Set-Cookie headers and the tokens would be lost.

**Why it matters:** This is a subtle but critical detail. A developer unfamiliar with cookie-based auth might omit `credentials: 'include'` and wonder why the user isn't being authenticated despite a successful exchange. The tokens were set by the server but never stored by the browser.

**How to bring it up:** "The `credentials: 'include'` on the exchange fetch is essential for the cookie-based auth flow. It tells the browser to both send the CSRF state cookie and accept the new token cookies from the response. Without it, the exchange succeeds but the tokens are silently discarded."
