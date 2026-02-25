# InviteManager.tsx — interview-ready documentation

## Section 1: 30-second elevator pitch

This is the control panel where an org owner generates and manages invite links. It fetches active invites on load, lets the owner create new ones, copy the link to clipboard, and see which invites are still outstanding. If you're not an owner, it shows a polite "you can't do this" message instead of the controls.

**How to say it in an interview:** "InviteManager is a client component that handles the full invite lifecycle — listing active invites via GET, creating new ones via POST, clipboard copy, and graceful degradation to a 'forbidden' state for non-owners. All API calls go through our BFF proxy with automatic token refresh on 401."

---

## Section 2: Why this approach?

### Decision 1: Client-side role detection via 403

Instead of passing the user's role as a prop or reading it from context, the component tries to fetch active invites. If the API returns 403 ("Owner access required"), it flips to a `forbidden` state and shows a read-only message.

**What's happening:** Imagine a door that doesn't have a sign saying "employees only." You just try to open it, and if it's locked, you know you're not supposed to be there. The server is the authority on who's allowed — the client just reacts.

**How to say it in an interview:** "We detect authorization client-side by attempting the API call and handling the 403. The server is the single source of truth for role enforcement — no client-side role checks that could be bypassed."

**Over alternative:** Passing `role` as a prop would require the parent to know the user's role, creating a dependency. The app has no auth context — cookies are httpOnly, so the client can't inspect the JWT.

### Decision 2: Reload active invites after creating

After a successful POST, `loadActiveInvites()` runs again. This keeps the list in sync without manually merging the new invite into state. Simpler than optimistic updates for a low-frequency action.

**How to say it in an interview:** "We refetch after mutation rather than optimistic update — invite creation is infrequent enough that the extra round-trip is negligible, and it keeps the state simple."

### Decision 3: No auth context or provider

The app uses httpOnly cookies for auth. The client has no access to the token and no `useAuth()` hook. Components call the BFF, which forwards cookies automatically. Authentication is invisible to the UI layer.

**How to say it in an interview:** "Authentication is handled entirely via httpOnly cookies and the BFF proxy. The UI never touches tokens — it just makes fetch calls and the browser handles cookie attachment."

---

## Section 3: Code walkthrough

### State declarations (lines 19-24)
Six pieces of state: the just-created invite (for the copy widget), the active invites list, loading/error flags, clipboard copy feedback, and a `forbidden` flag for non-owners.

### loadActiveInvites (lines 26-34)
Wrapped in `useCallback` so the useEffect dependency is stable. Calls GET `/api/invites`. On 403, sets `forbidden: true` and bails — no error shown since "you're not an owner" isn't an error.

### handleGenerate (lines 40-52)
POST to `/api/invites` with an empty body (uses default 7-day expiry). On success, stores the result (including the URL) and refetches the active list. The `apiClient` wrapper handles 401 refresh automatically.

### handleCopy (lines 54-61)
Uses `navigator.clipboard.writeText` with a 2-second "Copied!" feedback timeout. Falls back to an error message for non-secure contexts (some dev environments).

### Forbidden state render (lines 75-86)
Early return — if the initial fetch returned 403, the entire component renders as a simple message with a back link. No generate button, no invite list.

### Active invites list (lines 125-139)
Maps over `activeInvites` and shows each invite's ID and days remaining. `daysUntil` calculates the time difference and rounds up. The count badge in the header gives a quick summary.

---

## Section 4: Complexity and trade-offs

The component makes at most 2 API calls on mount (one GET) and 2 on generate (one POST + one refetch GET). Network-bound, not compute-bound.

**What would break first:** If an org had hundreds of active invites, the list would get long. Pagination would help but isn't needed at MVP scale — most orgs will have 0-5 active invites.

**What I'd change with more time:** Add a "revoke" button per invite. Currently invites can only expire — there's no way to invalidate one early.

**How to say it in an interview:** "The component is deliberately simple for MVP. The main gap is revocation — currently invites can only expire naturally. Adding a DELETE endpoint and revoke button would be the next iteration."

---

## Section 5: Patterns worth knowing

### Server-authoritative role enforcement
The client never checks roles. It attempts the action and handles the 403. This prevents the common bug where client-side guards get out of sync with server-side rules.

**Interview-ready line:** "The server is the single authority on authorization. The client reacts to 403s rather than duplicating role logic."

### BFF proxy pattern
Every API call goes to `/api/*` on the same origin. Next.js route handlers forward to Express. No CORS, no token exposure, automatic cookie passthrough.

**Interview-ready line:** "The BFF proxy pattern means the browser never talks to the API directly. Same-origin requests with cookie passthrough — no CORS configuration needed."

### useCallback + useEffect dependency management
`loadActiveInvites` is wrapped in `useCallback` so the `useEffect` dependency array stays stable. Without it, the function would be recreated every render, causing infinite refetch loops.

**Interview-ready line:** "useCallback stabilizes the function reference so the effect's dependency array doesn't trigger infinite re-renders."

---

## Section 6: Interview questions

### Q1: "Why not show a spinner while loading active invites?"
**Context if you need it:** The initial GET happens on mount. There's no loading state for the list specifically — just the generate button.

**Strong answer:** "The list loads fast and renders as a progressive enhancement below the generate button. A spinner for a ~100ms request adds visual noise. If we had slow queries or pagination, I'd add one."

**Red flag answer:** "I forgot to add it." — Shows you didn't think about the UX deliberately.

### Q2: "How do you handle a user who's logged in but not an owner?"
**Strong answer:** "The component attempts a GET on mount. If the server returns 403, we flip to a `forbidden` state that renders a simple message explaining that only owners can manage invites. No controls are shown — we don't just disable buttons."

**Red flag answer:** "We check the role on the client." — There's no client-side role state in this app. The cookies are httpOnly.

### Q3: "What if two owners generate invites simultaneously?"
**Strong answer:** "No conflict — each POST creates an independent invite with its own token. The refetch after creation means both owners see all active invites. There's no shared mutable state to collide on."

### Q4: "How would you add invite revocation?"
**Strong answer:** "Add a DELETE /invites/:id route behind roleGuard('owner'), update orgInvites queries with a soft-delete (set usedAt to now), and add a revoke button in the active invites list. The validateInviteToken check already rejects used tokens."

---

## Section 7: Data structures

### State as parallel independent values
Six `useState` hooks rather than a single state object. Each piece of state updates independently — `setLoading(true)` doesn't touch `activeInvites`. React batches these into a single re-render.

**Why not useReducer:** The states are mostly independent. A reducer would add ceremony for no benefit here. If the states started interacting (e.g., "can only copy while not loading"), a reducer would help.

**How to say it in an interview:** "Independent useState hooks over useReducer because the states don't interact. React batches the updates into a single render anyway."

---

## Section 8: Impress the interviewer

### Graceful degradation over error throwing
A non-owner visiting this page doesn't see an error. They see a calm explanation. The 403 from the API is caught silently and converted into UI state rather than thrown. Users who aren't allowed to do something shouldn't feel like they broke something.

How to bring it up: "Non-owners see a helpful message, not an error. The 403 is a state transition, not an exception."

### No client-side secrets
This component has zero access to JWTs, API keys, or auth state. Everything flows through httpOnly cookies that the browser manages. Even if XSS compromised this component, there's nothing to steal.

How to bring it up: "The component has no access to credentials. httpOnly cookies mean XSS can't extract tokens — the worst an attacker could do is make authenticated requests within the user's session, which is bounded by cookie expiry."

### Refetch-after-mutation over optimistic updates
For high-frequency actions (like a chat app), you'd want optimistic updates. For invite creation (happens a few times per org lifetime), a simple refetch is simpler and avoids the complexity of rollback on failure.

How to bring it up: "I chose refetch-after-mutation over optimistic updates because invite creation is low-frequency. The simplicity trade-off is worth it — no rollback logic, no stale state edge cases."
