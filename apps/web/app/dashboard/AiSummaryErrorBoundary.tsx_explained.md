# AiSummaryErrorBoundary.tsx — Interview-Ready Documentation

## 1. Elevator Pitch

This is a safety net for the AI summary card. If AiSummaryCard throws a render error — maybe a null reference, maybe a bad state — this boundary catches it and shows a friendly fallback instead of crashing the entire dashboard. The charts, filters, and everything else keep working. It's one of two error boundaries in DashboardShell, each isolating a different failure domain.

**How to say it in an interview:** "This is a React error boundary that isolates AI card render failures from the rest of the dashboard. If the AI component crashes, charts and data keep rendering. It's a blast-radius containment strategy."

## 2. Why This Approach

**Class component, not a function component.** React doesn't have a hook equivalent for `getDerivedStateFromError`. Error boundaries *must* be class components — that's a React constraint, not a style choice. You'll see this pattern in every React codebase that handles render errors.

**How to say it in an interview:** "Error boundaries require class components because React's error-catching lifecycle methods — getDerivedStateFromError and componentDidCatch — don't have hook equivalents. This is one of the few places where class components are still the right tool."

**Separate from ChartErrorBoundary.** DashboardShell has two error boundaries: this one wraps AiSummaryCard, and ChartErrorBoundary wraps the chart grid. If we used a single boundary around both, an AI crash would also hide the charts. Separate boundaries mean separate failure domains.

**How to say it in an interview:** "I used separate error boundaries for the AI summary and charts so their failure domains are independent. An AI rendering crash doesn't take down the charts, and a chart crash doesn't hide the AI summary."

**Reset via "Try again" button.** The boundary has a `handleReset` method that sets `hasError` back to `false`, re-rendering the children. If the render crash was caused by transient state (e.g., a race condition during remounting), this gives the user a way to recover. If the crash is a genuine code bug, the boundary will catch it again immediately.

**`componentDidCatch` for logging.** The boundary logs errors via `console.error` in `componentDidCatch`. This is the only lifecycle method that receives the error info with component stack — you can't log in `getDerivedStateFromError` because it's a pure state update. In production, this would be wired to an error reporting service.

## 3. Code Walkthrough

### Props and State (lines 6-13)

The component takes `children` (the AiSummaryCard it wraps) and an optional `className` for spacing. State is a single boolean — `hasError`. That's it. Error boundaries don't need more.

### getDerivedStateFromError (lines 18-20)

This static method runs when a child component throws during rendering. React calls it with the error, and whatever you return becomes the new state. We return `{ hasError: true }` — the simplest possible response. We don't log here because this is a pure state update — logging happens in `componentDidCatch`.

### componentDidCatch (lines 22-24)

Logs the error and component stack via `console.error`. This is where you'd wire up Sentry or another error reporter in production. Separated from `getDerivedStateFromError` because logging is a side effect and state derivation should be pure.

### handleReset (lines 26-28)

Sets `hasError` back to `false`, which re-renders children. The "Try again" button in the fallback UI calls this.

### render (lines 30-56)

Two paths. If `hasError` is false, render children normally — the error boundary is invisible. If true, render the fallback UI: a card with a destructive left-accent border, the error message, and a reassurance note. The styling matches AiSummaryCard's error state exactly — same border color, same reassurance message, same `aria-live="assertive"` for screen readers.

**What's not obvious:** The `cn()` call merges the component's own classes with the parent's `className` prop. This lets DashboardShell pass `className="mb-6"` for spacing without the boundary needing to know about layout.

## 4. Complexity and Trade-offs

This is about as simple as a component gets. No loops, no data structures, no async. The "complexity" is conceptual — understanding React's error boundary lifecycle.

**Known limitation:** Error boundaries don't catch errors in event handlers, async code, or server-side rendering. They only catch errors during rendering, lifecycle methods, and constructors of child components. An API failure in `useAiStream` won't trigger this boundary — that's handled by the hook's own error state. This boundary catches things like "the component tried to read `.length` on null during render."

**How to say it in an interview:** "Error boundaries are a render-time safety net, not a general-purpose error handler. They catch synchronous rendering failures. Async errors like API failures need separate handling — in our case, the useAiStream hook manages those."

## 5. Patterns Worth Knowing

**React Error Boundary.** An error boundary is a class component that implements `getDerivedStateFromError` (to update state) or `componentDidCatch` (to log). When a child throws during render, React walks up the tree until it finds a boundary, calls these methods, and re-renders the boundary with the fallback UI. Without boundaries, a render error crashes the entire app — React unmounts the whole tree.

**Where it appears:** The entire component *is* an error boundary. DashboardShell wraps AiSummaryCard in it at line 178.

**How to say it in an interview:** "Error boundaries let you contain render failures to a subtree instead of crashing the entire application. They're React's equivalent of a try-catch for the component tree."

**Blast Radius Isolation.** The pattern of wrapping independent UI sections in separate error boundaries is about controlling how much of the page breaks when something goes wrong. It's the same principle as bulkheads in a ship — a breach in one compartment doesn't sink the whole vessel.

**How to say it in an interview:** "We use separate error boundaries to create independent failure domains. The AI summary and charts can fail independently without affecting each other."

## 6. Interview Questions

**Q: Why is this a class component when everything else is a function component?**

*Context if you need it:* React hooks can't replicate error boundary behavior. There's no `useErrorBoundary` hook in React core.

*Strong answer:* "React's error-catching lifecycle methods — getDerivedStateFromError and componentDidCatch — only exist on class components. There's no hook equivalent. This is one of the few remaining cases where class components are necessary."

*Red flag answer:* "We just prefer class components for some things." This suggests you don't understand the technical constraint.

**Q: Why not use a single error boundary around the whole dashboard?**

*Context:* This tests whether you understand failure isolation.

*Strong answer:* "A single boundary would mean any render crash — whether in the AI card or a chart — would replace the entire dashboard with a fallback. With separate boundaries, a chart crash still shows the AI summary, and an AI crash still shows the charts. You want the smallest blast radius possible."

*Red flag answer:* "It's cleaner to have separate components." This misses the point — it's about failure isolation, not code organization.

**Q: What errors does this NOT catch?**

*Context:* This tests understanding of error boundary limitations.

*Strong answer:* "Error boundaries only catch synchronous errors during rendering. They don't catch errors in event handlers, async code like API calls, or setTimeout callbacks. Our API failures are handled by the useAiStream hook's error state, not this boundary."

*Red flag answer:* "It catches all errors in the AI card." No — it only catches render-time errors.

## 7. Data Structures

No meaningful data structures here. State is a single boolean. This section is intentionally brief — the file's value is architectural, not algorithmic.

## 8. Impress the Interviewer

**Matching visual language between error boundary and component error state.** The fallback UI uses the same destructive left-accent border, the same reassurance message ("Your data and charts are still available below"), and the same `aria-live="assertive"` as AiSummaryCard's own error state. From the user's perspective, any AI failure — whether it's an API error caught by the hook or a render crash caught by the boundary — looks and feels the same. That kind of consistency takes deliberate coordination.

**How to bring it up:** "I made sure the error boundary's fallback matches the component's own error state visually. Users shouldn't have to understand the difference between a render crash and an API failure — both look the same and both reassure them that their data is still available."

**The assertive aria-live choice.** Screen readers have two politeness levels: "polite" waits for a pause in speech, "assertive" interrupts immediately. We use "assertive" for errors because a crash is urgent information a screen reader user needs right away. The streaming state uses "polite" because interrupting every text chunk would be annoying.

**How to bring it up:** "We use aria-live='assertive' specifically for error states so screen readers announce the failure immediately, rather than waiting for a pause. It's a deliberate UX decision for accessibility — errors are urgent, streaming text isn't."
