# LoginButton.tsx — Interview-Ready Documentation

> Source file: `apps/web/app/(auth)/login/LoginButton.tsx` (64 lines)

---

## 1. 30-Second Elevator Pitch

This is the "Sign in with Google" button — the one UI element that kicks off the entire OAuth login flow. When clicked, it calls the BFF proxy to get Google's authorization URL, then redirects the browser there. If the user was trying to reach a protected page (like `/billing`), it saves that destination in sessionStorage so they land in the right place after signing in.

**How to say it in an interview:** "This is a client component that initiates the Google OAuth flow. It fetches the authorization URL from our BFF proxy, preserves the user's intended redirect destination in sessionStorage, and handles the browser redirect to Google. The loading and error states are managed locally since this is a single-interaction component."

---

## 2. Why This Approach?

### Decision 1: Client Component for the button, Server Component for the page

**What's happening:** In Next.js, server components render on the server and can't have click handlers or state. Client components (marked `'use client'`) render in the browser and can be interactive. The login page itself is a server component (it just reads the URL params and renders HTML), but the *button* needs to handle clicks, show loading spinners, and make fetch calls — so it's a client component. Think of it like a paper form (server) with a clickable "Submit" button (client) glued onto it.

**How to say it in an interview:** "The page is a server component for fast initial render and SEO, while the button is a client component because it needs interactivity — click handlers, loading state, and fetch calls. This is the standard Next.js composition pattern."

**Over alternative:** Making the whole page a client component would work but sacrifices server-side rendering benefits and sends more JavaScript to the browser.

### Decision 2: sessionStorage for redirect persistence

**What's happening:** The OAuth flow involves leaving your app (redirect to Google) and coming back (callback). Any in-memory state (React state, variables) is lost when the browser navigates away. sessionStorage survives navigation within a tab — it persists until the tab is closed. So we stash the redirect path there before leaving for Google, and the callback handler reads it when we come back.

**How to say it in an interview:** "We use sessionStorage to persist the redirect destination across the OAuth round-trip. React state and memory don't survive full-page navigation to Google and back, but sessionStorage does. It's scoped to the tab, so opening login in two tabs doesn't interfere."

**Over alternative:** Passing the redirect through the OAuth `state` parameter would work but complicates the state verification logic (the state already carries a CSRF token). A cookie would also work but is heavier — sessionStorage is the lightest solution for tab-scoped persistence.

### Decision 3: `window.location.href` instead of `router.push` for the Google redirect

**What's happening:** `router.push()` is Next.js's client-side navigation — it works for moving between pages in your app without a full page reload. But we're redirecting to `accounts.google.com`, which is a completely different domain. That's a full browser navigation, so we use `window.location.href` — the browser's native "go to this URL" mechanism.

**How to say it in an interview:** "We use `window.location.href` for the Google redirect because it's a cross-origin navigation — Next.js router only handles same-origin client-side transitions."

**Over alternative:** `router.push()` would fail or behave unexpectedly with an external URL. `window.location.assign()` would also work but `href` is more idiomatic.

---

## 3. Code Walkthrough

### State management (lines 6-7)

Two pieces of local state: `loading` (boolean for the button's disabled/spinner state) and `error` (string or null for error messages). These are React's `useState` — the simplest way to track UI state in a component.

### handleSignIn (lines 9-29)

The click handler. Three steps:
1. **Save redirect** — If the user was heading somewhere specific (not just `/dashboard`), stash it in sessionStorage. The condition `redirectPath !== '/dashboard'` avoids storing the default, since the callback handler already defaults to `/dashboard`.
2. **Fetch auth URL** — Calls the BFF proxy at `/api/auth/login`, which forwards to the Express backend, which generates a Google authorization URL with the proper OAuth parameters and CSRF state.
3. **Redirect to Google** — Takes the URL from the response and navigates the browser there.

The error handling only catches network failures or non-200 responses from the BFF proxy. It doesn't catch Google-side errors (those come back through the callback URL).

### The button JSX (lines 31-57)

A standard Google sign-in button with the official Google "G" logo SVG. The `disabled={loading}` prevents double-clicks during the redirect. The button text switches from "Sign in with Google" to "Redirecting..." to give visual feedback.

### Error display (lines 59-62)

A conditional red error message below the button. Only renders when `error` is non-null.

---

## 4. Complexity and Trade-offs

**No retry on fetch failure:** If the `/api/auth/login` call fails (network error, backend down), the user sees an error and has to click again manually. Automatic retry would be inappropriate here — it's a user-initiated action, not a background operation.

**sessionStorage tab-scoping:** The redirect is stored per-tab. If a user opens the login page in two tabs from different protected routes, each tab preserves its own redirect. This is actually the right behavior — each tab should go back to where it came from.

**No CSRF on the button itself:** The button just fetches a URL and redirects. The actual OAuth CSRF protection is in the `state` parameter generated by the backend — the button doesn't need its own CSRF token because it's not submitting a form.

**How to say it in an interview:** "The button is intentionally simple — it initiates the flow but delegates all security concerns to the backend. CSRF protection lives in the OAuth state parameter, token management lives in httpOnly cookies, and redirect persistence uses sessionStorage for cross-navigation survival."

---

## 5. Patterns and Concepts Worth Knowing

### OAuth Authorization Code Flow (Client-Side Initiation)

OAuth 2.0 is a protocol that lets users sign in with a third party (like Google) without giving your app their password. The "authorization code flow" works in three steps: (1) redirect to Google, (2) user approves, (3) Google redirects back with a code that your server exchanges for tokens. This button handles step 1.

**Where it appears:** `handleSignIn` fetches the Google auth URL and redirects the browser.

**Interview-ready line:** "This component initiates the OAuth authorization code flow by fetching the auth URL from our backend and redirecting to Google. The backend generates the URL with the proper scope, redirect URI, and CSRF state parameter."

### Client Component Composition

In Next.js App Router, you can nest client components inside server components. The server component renders HTML on the server, and the client component "hydrates" (becomes interactive) in the browser. The boundary is the `'use client'` directive.

**Where it appears:** `LoginButton` is a client component composed into the server-rendered `LoginPage`.

**Interview-ready line:** "The page uses server/client component composition — the server component handles the initial render with searchParams, while the client component provides interactivity. This minimizes the JavaScript bundle for the page."

---

## 6. Potential Interview Questions

### Q1: "Why not pass the redirect URL through the OAuth state parameter?"

**Context if you need it:** The OAuth `state` parameter is commonly used for CSRF protection. Some implementations also encode redirect info in it.

**Strong answer:** "The state parameter already carries a CSRF token that the backend verifies on callback. Overloading it with redirect info adds complexity and increases the token size. sessionStorage is simpler and doesn't couple the redirect logic to the OAuth security mechanism."

**Red flag answer:** "What's the state parameter?" — Shows unfamiliarity with OAuth CSRF protection.

### Q2: "What happens if sessionStorage is full or unavailable?"

**Context if you need it:** sessionStorage has a ~5MB limit and can be disabled in some browsers.

**Strong answer:** "sessionStorage.setItem would throw. Since we don't catch that, the redirect wouldn't be saved, and after login the user would land on `/dashboard` — the default. This is acceptable degradation. The login itself still works; only the redirect-back is lost."

**Red flag answer:** "The login would break." — It wouldn't. The redirect preservation is a UX enhancement, not a critical path.

### Q3: "Why does the button use `window.location.href` instead of Next.js router?"

**Context if you need it:** Tests understanding of client-side vs full-page navigation.

**Strong answer:** "Next.js router handles same-origin client-side transitions. The Google OAuth URL is a different domain — you can't do that with client-side routing. `window.location.href` triggers a full browser navigation, which is the only way to leave your app's domain."

**Red flag answer:** "They do the same thing." — They fundamentally don't. Router is SPA navigation, `location.href` is a full page navigation.

---

## 7. Data Structures & Algorithms Used

This component uses no meaningful data structures beyond React's useState hooks (which are simple value containers) and sessionStorage (a browser key-value store). No algorithms to speak of.

---

## 8. Impress the Interviewer

### The Full Redirect Chain

**What's happening:** Preserving the user's intended destination requires a chain of four handoffs: (1) proxy.ts adds `?redirect=/billing` to the login URL, (2) LoginPage reads it from searchParams and passes to LoginButton, (3) LoginButton saves it to sessionStorage before redirecting to Google, (4) CallbackHandler reads it from sessionStorage after the OAuth callback and pushes to the final destination.

**Why it matters:** Each handoff crosses a different boundary — server to client, browser memory to persistent storage, your domain to Google and back. Most tutorial implementations lose the redirect at step 3 (the Google round-trip). The sessionStorage bridge is the key design choice.

**How to bring it up:** "The redirect destination survives a four-step handoff — from the proxy's query parameter, through the server component, into sessionStorage, across the Google OAuth round-trip, and back to the callback handler. sessionStorage is the bridge that survives the cross-domain navigation."

### Loading State Prevents Double-Submit

**What's happening:** Setting `loading = true` immediately on click disables the button. Without this, a user could click "Sign in" multiple times during the brief window while the auth URL is being fetched, triggering multiple OAuth flows with different state tokens.

**Why it matters:** Double-submit prevention is a basic UX and security pattern. Multiple OAuth initiations could confuse the state verification on callback — which state token is the valid one?

**How to bring it up:** "The immediate loading state prevents double-submit during the auth URL fetch. Multiple OAuth initiations would generate different CSRF state tokens, and only one would be valid on callback — the others would fail state verification."
