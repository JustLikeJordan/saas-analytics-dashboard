# route.ts (BFF AI Summary Proxy) — Interview-Ready Documentation

## 1. Elevator Pitch

This is the Backend-for-Frontend proxy that sits between the browser and the Express API for AI summary requests. It handles two response types from one upstream endpoint — SSE streams are passed through without buffering, JSON cache hits are forwarded directly. It manages cookie-based auth forwarding, error mapping, and Next.js runtime configuration for streaming support.

**How to say it in an interview:** "I built the BFF proxy layer for AI summaries. It forwards requests to Express, sniffs the response Content-Type, and either passes through the SSE stream as a raw `ReadableStream` or forwards the JSON cache response. The browser never talks to Express directly."

## 2. Why This Approach

**BFF pattern over direct API calls.** The browser calls `/api/ai-summaries/42` on the same origin. Next.js proxies to Express at `localhost:3001`. This means no CORS, cookies flow naturally (same origin), and the internal API URL never leaks to the client. The Express API could move to a different host/port without touching any frontend code.

**Stream passthrough, not buffering.** For SSE responses, we do `new Response(upstream.body)` — passing the `ReadableStream` directly. We don't await the body, buffer it, or transform it. This is load-bearing for streaming — buffering would defeat the purpose of SSE (the client would wait for the full response instead of seeing chunks).

**`runtime = 'nodejs'` and `dynamic = 'force-dynamic'`.** Next.js needs the Node.js runtime (not Edge) for streaming responses. `force-dynamic` prevents static optimization — this route must execute on every request, not be pre-rendered.

## 3. Code Walkthrough

**Lines 8-12: Route handler entry.** The Next.js App Router passes `params` as a Promise (Next.js 16 convention). We `await` it to get `datasetId`. The `cookie` header is forwarded verbatim — it contains the JWT access token.

**Lines 16-25: Upstream fetch with error handling.** If Express is unreachable (network error, not running), catch the error and return 502. This is the only place we catch — all other errors come as HTTP responses from upstream.

**Lines 27-36: Non-OK error forwarding.** If upstream returns 4xx/5xx and it's NOT an SSE response, map 5xx to 502 (the client shouldn't see internal server errors as-is) and forward the error body. The Content-Type check is important — an SSE stream that starts with headers sent (even on error) can't be re-interpreted as JSON.

**Lines 39-49: SSE passthrough.** The key line: `new Response(upstream.body, { status: 200, headers: {...} })`. `upstream.body` is a `ReadableStream<Uint8Array>` — we hand it directly to the browser. The headers explicitly set SSE content type, no caching, keep-alive, and `X-Accel-Buffering: no`. That last header tells nginx (if it's sitting in front of Next.js) to disable response buffering for this request. Without it, nginx collects the entire SSE response before forwarding — which turns your real-time stream into a batch response. The browser's `fetch` in `useAiStream` reads this stream chunk by chunk.

**Lines 51-58: JSON forwarding.** Cache hits come as JSON. Parse and re-serialize through `NextResponse.json()`. This adds Next.js's standard headers and handles serialization edge cases.

## 4. Complexity and Trade-offs

**No request body transformation.** This is a GET endpoint — no body to forward. If it were POST (e.g., sending filters), we'd need to forward the request body too.

**Error body parsing.** We `try/catch` the `upstream.json()` call in both error and success paths. If the upstream response isn't valid JSON (server crash, nginx error page), we return a synthetic error object instead of crashing.

**5xx → 502 mapping.** The client sees "502 Bad Gateway" instead of "500 Internal Server Error." This is correct — from the client's perspective, the BFF is the server, and Express is an upstream dependency. A 500 from Express is a gateway failure for the BFF.

## 5. Patterns Worth Knowing

**ReadableStream passthrough.** `new Response(readableStream)` is the Web API way to create a streaming response. The Response constructor accepts a `ReadableStream` body without consuming it. The browser reads chunks as they arrive from upstream. No buffering, no transformation, minimal memory overhead.

**`X-Accel-Buffering: no` header.** This is an nginx-specific directive. Nginx buffers responses by default — great for static assets, terrible for SSE. Setting this header per-response tells nginx to proxy the stream without buffering. The Express `streamHandler.ts` sets the same header on its SSE response. Both layers need it because nginx might sit in front of either service depending on deployment topology. If you're not behind nginx, the header is harmless — unknown headers are ignored.

**Next.js 16 dynamic params.** `params` is a `Promise` in Next.js 16's App Router. This is a breaking change from earlier versions where `params` was a plain object. The `await` is required.

**BFF as architecture boundary.** This file is 60 lines of plumbing, but it enforces a boundary: the browser never knows Express exists. API URLs, internal ports, auth forwarding — all hidden behind this proxy. If Express migrates to a different service (or gets replaced), only this file changes.

## 6. Interview Questions

**Q: Why pass `upstream.body` directly instead of reading and re-emitting the stream?**
A: Buffering would defeat SSE. The user would wait for the full AI generation (3-15 seconds) before seeing any text. Passthrough delivers chunks as they arrive from Claude. Memory-wise, the proxy holds zero bytes of the response — it's a pipe, not a tank.

**Q: Why set `X-Accel-Buffering: no` in both the Express handler and the BFF proxy?**
A: Depends on where nginx sits. If nginx is in front of the BFF (common in production), the BFF's header matters. If nginx is in front of Express directly (less common, but possible in some deployments), the Express header matters. Setting it in both layers is defensive — it costs nothing and prevents a class of "SSE works in dev but buffers in production" bugs that are painful to debug.

**Q: What happens if the client disconnects mid-stream?**
A: The browser's `AbortController` aborts the fetch to this BFF route. Next.js tears down the response. The upstream fetch to Express loses its reader, which triggers Express's `req.on('close')` event, which aborts the Claude stream. Cancellation cascades through all three layers.

**Q: Why `force-dynamic`?**
A: Without it, Next.js might try to statically optimize or cache this route. AI summaries are user-specific and time-sensitive — every request must hit the handler fresh.

## 7. Data Structures

**Upstream response (two shapes):**
- SSE: `Content-Type: text/event-stream` with a `ReadableStream` body. Response headers include `X-Accel-Buffering: no` for nginx compatibility.
- JSON: `Content-Type: application/json` with `{ data: { content, metadata, fromCache } }`

**Error shape:** `{ error: { code: string, message: string } }` — matches the project's standard error envelope.

## 8. Impress the Interviewer

**The Content-Type branching.** One upstream endpoint, two response formats, handled by a single proxy. Point out that this is cleaner than having separate `/api/ai-summaries/stream/:id` and `/api/ai-summaries/cached/:id` routes. The client doesn't need to know whether its summary is cached — it just fetches and reacts to what comes back.

**Cascading abort.** Trace the abort path: browser `AbortController` → BFF request tear-down → Express `req.close` → Claude SDK `stream.abort()`. Four layers, one cancellation signal, no leaked resources. This is the kind of end-to-end thinking that impresses in system design interviews.
