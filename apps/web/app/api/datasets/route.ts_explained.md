# datasets/route.ts — Explained

## 1. 30-Second Elevator Pitch

This is a BFF (Backend for Frontend) proxy that handles CSV file uploads. When the browser POSTs a multipart form to `/api/datasets`, this handler streams the raw request body straight to the Express backend without buffering it in memory. It forwards cookies for auth, relays Set-Cookie headers back for token refresh, and returns the response to the browser. The browser has no idea it's talking to Express — it only sees Next.js.

**How to say it in an interview:** "This is a streaming BFF proxy for file uploads. It passes the multipart body as a ReadableStream to the Express API using `duplex: 'half'`, avoiding buffering in the Next.js process. It also handles cookie forwarding for JWT auth and refresh token rotation."

---

## 2. Why This Approach?

### Decision 1: Explicit route handler instead of Next.js rewrites

**What's happening:** Next.js has a `rewrites` config that can proxy requests automatically. But rewrites don't reliably forward cookies or preserve multipart form boundaries. So this file takes full control.

Think of choosing to drive yourself instead of relying on a bus that sometimes skips your stop.

**How to say it in an interview:** "Next.js rewrites can't be trusted with multipart boundaries and cookie forwarding. A manual route handler gives explicit control over which headers are forwarded and how the body is streamed."

### Decision 2: Streaming with `duplex: 'half'`

**What's happening:** `request.body` is a ReadableStream. Normally you'd read the entire body into a Buffer before forwarding — holding the whole CSV in memory. With `duplex: 'half'`, the Fetch API starts sending chunks to Express while still receiving from the browser. Like a relay race where the second runner starts moving before the baton fully arrives.

**How to say it in an interview:** "We pass the request body as a ReadableStream with `duplex: 'half'` to stream uploads. A 10MB CSV doesn't sit in Next.js memory — it flows through as a pipe."

**Over alternative:** `await request.arrayBuffer()` doubles memory usage and adds latency.

### Decision 3: `runtime = 'nodejs'` instead of edge

**What's happening:** Edge runtime doesn't support streaming request bodies — can't pass a ReadableStream as fetch body. So this route is pinned to Node.js.

**How to say it in an interview:** "The edge runtime doesn't support the duplex option. Since file uploads need body streaming, this route requires the Node.js runtime."

---

## 3. Code Walkthrough

### Header extraction (lines 13-14)

Grabs `content-type` and `cookie` from the incoming request. The content-type contains the multipart boundary string — the delimiter the Express body parser needs to split file data from form fields. The cookie carries the JWT access token.

### Stream to Express (lines 16-24)

Calls Express at the internal Docker URL. The key detail is `body: request.body` — passes the ReadableStream directly. `duplex: 'half'` tells Fetch the request body is a stream that may not be fully available when the request starts. The `as RequestInit` cast exists because TypeScript's built-in types don't include `duplex` yet.

### Parse response (lines 26-28)

Reads the Express response as JSON and creates a NextResponse with the same status code. The Express API returns `{ data: T }` or `{ error: { code, message } }` — this proxy doesn't transform it.

### Cookie relay (lines 30-33)

Loops through Set-Cookie headers from Express. This matters because auth middleware may rotate the refresh token on any authenticated request, not just login. If these headers are dropped, the browser has a stale refresh token.

---

## 4. Complexity and Trade-offs

**No error handling for network failures.** If Express is down, `fetch()` throws. The unhandled rejection becomes a 500 in Next.js. Production would add try/catch returning 502 Bad Gateway.

**Response is fully buffered on the way back.** We call `response.json()`, reading the entire response into memory. Fine because the response is a small JSON object (preview metadata), not the file itself. Intentional asymmetry: stream the large upload, buffer the small response.

**No file size validation at proxy layer.** The proxy streams whatever the browser sends. Size limits are enforced at Express via multer. A future improvement: check `content-length` before forwarding.

**How to say it in an interview:** "The proxy is intentionally thin. It streams uploads to avoid memory pressure but buffers the small JSON response. Error handling and validation live in Express, not the proxy."

---

## 5. Patterns and Concepts Worth Knowing

### Half-Duplex Streaming

In the Fetch API, `duplex: 'half'` means "start sending the request body before expecting a response." Without it, Fetch expects the body to be fully available upfront. With it, the body can be a ReadableStream that produces chunks over time. Node.js 18+ feature.

**Interview-ready line:** "`duplex: 'half'` tells Fetch to begin transmitting a ReadableStream body immediately, without waiting for it to be fully buffered."

### Multipart Boundary Preservation

When a browser sends a file upload, `content-type` looks like `multipart/form-data; boundary=----WebKitFormBoundary7MA4`. That boundary string tells the server where the file starts and ends. If the proxy sets its own content-type or re-encodes the body, the boundary won't match and the upload breaks.

**Interview-ready line:** "We forward content-type verbatim because it contains the multipart boundary. Re-encoding the body or constructing new FormData would change the boundary and break the parser."

---

## 6. Potential Interview Questions

### Q1: "Why not let Next.js rewrites handle the proxy?"

**Strong answer:** "Rewrites work for simple JSON APIs but don't reliably forward cookies or preserve multipart boundaries. An explicit handler gives full control."

**Red flag:** "Rewrites can do everything this handler does." — They can't for multipart + auth.

### Q2: "What does `duplex: 'half'` do?"

**Strong answer:** "It tells Fetch the request body is a ReadableStream to transmit incrementally. Without it, fetch expects the body fully available before sending. 'Half' means one direction at a time — streaming the body, then waiting for the response."

**Red flag:** "It means bidirectional streaming." — Half-duplex is one direction at a time.

### Q3: "Why cast with `as RequestInit`?"

**Strong answer:** "TypeScript's built-in RequestInit type doesn't include `duplex` because it's a recent Fetch spec addition. The cast is a type-level workaround — the Node.js Fetch implementation supports it fine."

### Q4: "What happens if Express is unreachable?"

**Strong answer:** "fetch() throws a network error, surfacing as a 500 in Next.js. For production, I'd add try/catch returning 502 with a structured error, plus an AbortController timeout."

### Q5: "Why forward Set-Cookie headers on an upload route?"

**Strong answer:** "Auth middleware may rotate refresh tokens on any authenticated request. If the proxy drops Set-Cookie, the browser's refresh token goes stale and the next token refresh fails."

---

## 7. Data Structures & Algorithms Used

No meaningful data structures. The route is a pass-through proxy. The only "data" is the ReadableStream flowing from browser to Express — never parsed or transformed. The `getSetCookie()` return is a string array iterated once.

---

## 8. Impress the Interviewer

### Streaming Without Buffering

Most proxy tutorials show `const body = await request.arrayBuffer()` then `fetch(url, { body })`. That reads the entire upload into memory. This handler passes `request.body` (a ReadableStream) directly. The bytes flow through like water through a pipe — they never accumulate. For a 10MB CSV, that's the difference between 10MB heap usage and near-zero.

**How to bring it up:** "We stream the multipart body as a ReadableStream rather than buffering. With duplex: 'half', chunks flow to Express as they arrive from the browser. Memory footprint stays constant regardless of file size."

### The Multipart Boundary Is Part of the Content-Type

Many developers have uploaded files but never looked at what's actually in the `content-type` header. It's not just `multipart/form-data` — it includes a `boundary` parameter the server uses to split the byte stream into parts. If a proxy strips or modifies this header, the backend can't parse the upload. Knowing this shows you understand HTTP at the wire level.

**How to bring it up:** "The content-type contains the multipart boundary string. If the proxy re-encodes the body or sets its own content-type, the boundary won't match the body's delimiters. That's why we forward the header verbatim."
