# page.tsx — Shared Insight Public Page

## Elevator Pitch

This is the public-facing page that renders when someone clicks a shared insight link. It's a React Server Component that fetches the insight data server-side, sets Open Graph meta tags for rich social previews, and renders either the insight card or an error state. No authentication, no navigation chrome — just the insight and a signup CTA.

In an interview, you'd say: "It's a server-rendered public page that combines data fetching with metadata generation, optimized for both social sharing previews and fast initial paint."

## Why This Approach

The page is an RSC (not a client component) for two reasons:

1. **OG tags require server rendering.** When WhatsApp or Slack fetch a URL for a link preview, they read the HTML `<meta>` tags from the initial response. If you generate those tags client-side, the crawler sees nothing. `generateMetadata()` runs on the server and injects `og:title`, `og:description`, and `og:type` into the HTML head before it ships.

2. **Performance.** The content is static after fetch — no interactivity, no client state. Server-rendering means the HTML arrives complete on first paint. No loading spinners, no client-side fetch waterfalls.

An alternative would be using a client component with `useEffect` fetching (like the invite page does). That works for interactive pages but defeats OG tags and adds a visible loading state.

## Code Walkthrough

**`fetchShare` helper (lines 16-32):** Returns a discriminated union — `{ ok: true, data }` or `{ ok: false, status, message }`. This avoids throwing from the page body (which would trigger Next.js error boundaries) and keeps the branching logic explicit in JSX. The `cache: 'no-store'` option prevents Next.js from caching the response, since each visit increments the view count.

What's happening → How to say it: "I used a Result type pattern instead of try/catch in the render path, keeping the page component's control flow visible and testable."

**`generateMetadata` (lines 34-52):** An async function that Next.js calls before rendering. It fetches the same share data and returns metadata for the HTML `<head>`. Next.js 16 deduplicates fetch calls with the same URL in the same render pass, so this doesn't cause a double HTTP request.

What's happening → How to say it: "Next.js has a built-in request deduplication mechanism — calling the same URL in generateMetadata and the page component results in only one actual network request."

**`SharePage` component (lines 54-81):** Awaits params (a Promise in Next.js 16), calls `fetchShare`, and branches: error → `ShareError` with the right variant, success → `SharedInsightCard` with the snapshot data.

## Complexity / Trade-offs

- **Time complexity:** O(1) — single API call, no loops, no computation.
- **Space complexity:** O(n) where n is the AI summary length. Held in memory during render, then garbage collected.
- **Trade-off: Server fetch vs. client fetch.** Server fetch means no loading state visible to the user, but it also means the server blocks on the API call before streaming HTML. For a fast internal Docker network call, this is fine. Over a slow external API, you'd want streaming with Suspense boundaries.
- **Trade-off: Discriminated union vs. exceptions.** The union approach is more verbose but keeps error handling visible in the component tree rather than relying on error boundaries.

## Patterns Worth Knowing

- **Discriminated union for fetch results** — Common in TypeScript when you want exhaustive error handling without exceptions.
- **`generateMetadata` + server fetch** — The idiomatic Next.js 16 pattern for dynamic social previews. Worth mentioning in any discussion about SSR vs. CSR trade-offs.
- **`params` as a Promise** — A Next.js 16 change. All request APIs (params, searchParams, cookies, headers) are async now.
- **`cache: 'no-store'`** — Opts out of Next.js fetch caching. Without it, the framework might serve stale data.

## Interview Questions

**Q1: Why is this a Server Component instead of a Client Component?**
Two reasons: OG meta tags must be in the initial HTML response for social crawlers (WhatsApp, Slack, iMessage) to pick them up, and the page content is entirely static after fetch — no client-side interactivity needed beyond the CTA link.

**Q2: How does `generateMetadata` avoid making two API calls?**
Next.js 16 deduplicates `fetch` calls with the same URL during a single render pass. Both `generateMetadata` and the page component call `fetchShare(token)`, but only one HTTP request fires.

**Q3: Why use a discriminated union instead of throwing errors?**
Throwing from a Server Component triggers Next.js error boundaries, which replace the entire page with a generic error UI. The union pattern lets us render specific error states (not-found vs. expired) within the normal page layout.

**Q4: What's the privacy model here?**
Privacy-by-architecture: the `insightSnapshot` stored in the database contains only `orgName`, `dateRange`, `aiSummaryContent`, and `chartConfig`. No raw data rows, no sharer identity. The page physically can't leak what it doesn't have.

**Q5: How would you add an OG image later?**
Add an `og:image` field to the metadata return, pointing to a URL that generates a PNG server-side (e.g., via `@vercel/og` or a headless browser). The `chartSnapshotUrl` column already exists in the shares table but is nullable and unused.

## Data Structures & Algorithms

- **`ShareData` interface:** `{ orgName, dateRange, aiSummaryContent, chartConfig, viewCount }` — mirrors the Express API response shape.
- **`FetchResult` discriminated union:** `{ ok: true, data: ShareData } | { ok: false, status: number, message: string }` — the status code drives which error variant renders (410 → expired, everything else → not-found).

## Impress the Interviewer

The interesting design decision is that this page doesn't use the project's `api-client.ts` or `api-server.ts` wrappers. It fetches directly because it's a public page with no auth cookies to forward, and the response shape is simple enough that a typed helper function is sufficient. Knowing when NOT to use an abstraction is as important as knowing when to build one.

Also worth noting: the `cache: 'no-store'` annotation is load-bearing. Without it, Next.js 16 would cache the server fetch, and the view count would stop incrementing. This is a subtle gotcha that catches people who assume "server component = always fresh."
