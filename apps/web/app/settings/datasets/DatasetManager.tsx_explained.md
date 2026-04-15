# DatasetManager.tsx — Explained

## Elevator Pitch

`DatasetManager` is the settings page where users manage the CSV datasets loaded into their org. It lets you set a dataset as active (so the dashboard uses it), rename one in-place, or delete one — with a cascade warning showing exactly how many rows, AI summaries, and share links will vanish.

Architecturally it's a pure client component: it fetches from the BFF proxy at `/api/datasets/manage`, holds all UI state locally, and re-fetches whenever the browser tab regains focus. No server component nesting, no shared state, no context — just `useState` plus a few callbacks.

---

## Why This Approach

The per-card state design (a `Record<number, CardState>`) is the interesting call here. The alternative — one state object per card, pulled up into individual `useState` calls — works fine until the dataset list is dynamic. When you can create, delete, or rearrange cards, a map keyed by dataset ID is cleaner: you don't end up with orphaned state for deleted items, and adding a new dataset just means initializing a new key.

The `patchCard` helper wraps `setCardStates` so call sites only specify what changed — no boilerplate spread at every action handler.

Optimistic updates on rename make the UI feel instant. If the PATCH fails, the name reverts and an error banner appears. For delete, there's no optimism — delete is irreversible, so the user clicks through a confirmation that fetches the cascade counts first. That extra GET request before confirming is deliberate: you can't know the counts without asking the server, and showing "0 AI summaries" when there are actually 12 would be deceptive.

The `visibilitychange` refetch is a standard technique for settings pages. If a user uploads a new dataset in another tab, switching back here shows the updated list without requiring a manual reload.

---

## Code Walkthrough

### Interfaces

```typescript
interface DatasetItem { ... }    // list shape — what /datasets/manage returns
interface DatasetDetail extends DatasetItem { // detail shape — adds summaryCount, shareCount
  summaryCount: number;
  shareCount: number;
}
interface CardState { ... }      // per-card UI: rename/delete mode, draft name, loading flags
```

`DatasetDetail` extends `DatasetItem` rather than duplicating fields. That's intentional — the detail GET returns everything the list does, plus the cascade counts. Extending keeps the types honest.

### State initialization

```typescript
const [cardStates, setCardStates] = useState<Record<number, CardState>>({});
```

On each `load()`, `setCardStates` merges existing state with fresh server data:

```typescript
setCardStates((prev) => {
  const next: Record<number, CardState> = {};
  for (const ds of data) {
    next[ds.id] = prev[ds.id] ?? emptyCardState(ds.name);
  }
  return next;
});
```

The `?? emptyCardState(ds.name)` means: if we already have state for this card (e.g., it's mid-rename), keep it. Only initialize new cards. Refetching on tab focus won't blow away an in-progress rename.

### Rename flow

1. User clicks the pencil icon → `patchCard(id, { renaming: true, draftName: ds.name })`
2. Input renders; `useEffect` in `DatasetCard` focuses it when `state.renaming` becomes true
3. Enter or blur → `handleRenameSubmit` — no-ops if name unchanged, otherwise fires PATCH
4. PATCH succeeds → `renaming: false`, local name updated
5. PATCH fails → name reverted to pre-edit value, error shown

Escape → `onRenameCancel` skips the PATCH entirely.

### Delete flow

1. Click trash → `handleDeleteStart` sets `deleting: true` + `loadingDetail: true`, fires `GET /datasets/manage/:id`
2. Response populates `deleteDetail`; the card reveals the confirmation with cascade counts
3. "Yes, delete" → `DELETE /datasets/manage/:id`, then remove from local state
4. "Cancel" → clear `deleting` and `deleteDetail`

### DatasetCard component

Extracted into its own function (not a separate file) because it's only ever used here. It receives all the event handlers as props rather than closing over `setCardStates` directly — makes the data flow explicit and the component testable in isolation if needed.

The `inputRef` + `useEffect` for focus is a common React pattern. You can't call `.focus()` synchronously in the click handler because the input doesn't exist in the DOM yet — the render happens after the state update.

---

## Complexity and Trade-offs

**Per-card state map vs. flat state per card**: The map approach handles dynamic lists cleanly. The cost is slightly more ceremony at call sites (`cardStates[ds.id]`), but the alternative — `useState` calls inside a loop — isn't legal in React anyway.

**No debounce on rename blur**: Blur fires `handleRenameSubmit`, which is async. If the user blurs and immediately navigates away, there's a dangling request. Acceptable for a settings page with low traffic.

**Detail fetch on delete start, not on hover**: Fetching on hover feels clever but burns requests for users who poke "Delete" to see what happens and cancel. Fetching on click keeps it predictable.

**`as CardState` cast in `patchCard`**: TypeScript can't prove that spreading `Partial<CardState>` over a `CardState` produces a `CardState` — the spread result has all fields optional. The cast is safe here because `prev[id]` is always initialized via `emptyCardState` before any patch fires.

---

## Patterns Worth Knowing

**`visibilitychange` for settings refetch** — standard technique. The MDN page has the canonical example. It's the right level of polling for a settings page: no timers, no websockets, triggered only when the user actually comes back.

**Optimistic update with revert** — update local state before the network call, then revert if it fails. The UX feels faster. The failure path is important to implement correctly — if you forget to revert, the UI lies.

**Extending interfaces for richer shapes** — `DatasetDetail extends DatasetItem` avoids duplication and makes it clear the detail endpoint is a superset of the list endpoint. Worth knowing for interview discussions about API design and TypeScript interface composition.

**Map keyed by entity ID for per-item UI state** — `Record<number, CardState>` is the right data structure when you need per-row state in a dynamic list. Alternatives (parallel arrays, state inside child components) have their own trade-offs, but the map approach keeps the truth in one place.

---

## Interview Questions

**Q: Why keep card states in the parent rather than inside each card?**

A: If state lives inside `DatasetCard`, it's destroyed and recreated every time the parent re-renders. More importantly, actions like activate update multiple cards at once (only one can be active). Lifting state up lets the parent handle that cleanly.

**Q: What happens if two tabs are open and a dataset is deleted in the other tab?**

A: The `visibilitychange` listener will refetch on focus, so the deleted dataset disappears. Between focus events, the state is stale — clicking "Set active" on the deleted dataset would get a 404 from the API, which shows an error banner. Acceptable for a settings page.

**Q: Why fetch cascade counts at delete-confirm time rather than pre-populating them in the list?**

A: The list endpoint would need to JOIN summaries and shares for every dataset on every page load — that's extra query cost for data users rarely need. Fetching on demand keeps the list fast.

**Q: What's the purpose of `emptyCardState`?**

A: It centralizes the default shape for a card's UI state. If you add a new field to `CardState` later (say, `copying: boolean`), you only update `emptyCardState` — you don't hunt for every place that initializes card state.

---

## Data Structures

```
datasets: DatasetItem[]           — ordered list from server
cardStates: Record<number, CardState>  — UI state keyed by dataset ID
  CardState {
    renaming: boolean             — input visible
    draftName: string             — current value of rename input
    deleting: boolean             — confirmation panel visible
    deleteDetail: DatasetDetail | null  — cascade counts from GET
    loadingDetail: boolean        — spinner while fetching detail
    saving: boolean               — spinner/disabled while PATCH or DELETE in flight
  }
```

The two arrays are kept in sync: `load()` rebuilds `cardStates` whenever `datasets` changes, preserving existing per-card state for cards still present in the response.

---

## Impress the Interviewer

The refetch-on-visibility pattern is worth mentioning by name: "I used the `visibilitychange` event for a lightweight cache invalidation strategy — no polling timers, no WebSocket overhead, fires exactly when the user returns to the page." That phrasing lands well.

The optimistic rename with revert shows you understand that perceived performance and correctness aren't at odds — you can do both, you just need to write the failure path. A lot of candidates implement the happy path and hand-wave the error case.

The detail-fetch-on-demand design for delete is a good example of deferring work until it's actually needed. The interviewer might push back: "what if the GET fails?" — the answer is that `handleDeleteStart` catches it, clears `deleting`, and shows an error. The user can try again. No partial state left behind.
