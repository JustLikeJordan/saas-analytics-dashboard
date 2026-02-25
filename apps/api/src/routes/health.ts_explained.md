# health.ts — Explained

## 1. 30-Second Elevator Pitch

This file defines a single API endpoint: `GET /health`. When something hits that URL, the server checks whether both the database (PostgreSQL) and the cache (Redis) are alive, measures how long each check took, and returns a JSON report. If everything is fine, it returns HTTP 200 with `"status": "ok"`. If either service is down, it returns HTTP 503 with `"status": "degraded"`. This endpoint exists so that load balancers, container orchestrators (like Kubernetes), and monitoring dashboards can automatically detect when the server is unhealthy and route traffic away from it.

**How to say it in an interview:** "The health endpoint aggregates dependency checks for Postgres and Redis, returns latency metrics for each, and uses HTTP status codes — 200 for healthy, 503 for degraded — so upstream infrastructure like load balancers can make routing decisions automatically."

---

## 2. Why This Approach?

### Decision 1: Check dependencies, not just the server itself

**What's happening:** Instead of returning a hardcoded `{ status: 'ok' }` (which only proves the Node.js process is running), we actually ping PostgreSQL and Redis to make sure they're reachable.

**Why this matters:** A web server can be "up" but completely useless if it can't reach its database. Imagine a restaurant where the front door is open but the kitchen is on fire. A shallow health check (just returning 200) is like checking if the door is unlocked. A deep health check (pinging dependencies) is like checking if the kitchen can actually make food. Load balancers need to know the difference.

**How to say it in an interview:** "We do a deep health check that verifies downstream dependencies, not just process liveness. A server that can't reach its database isn't really healthy, even if it's accepting TCP connections."

### Decision 2: `Promise.all` for parallel checks

**What's happening:** We check the database and Redis at the same time rather than one after the other.

**Why this matters:** If the database check takes 50ms and the Redis check takes 20ms, running them sequentially would take 70ms total. Running them in parallel with `Promise.all` takes only ~50ms (the slower of the two). Health endpoints get called frequently — every 10-30 seconds by load balancers — so shaving off milliseconds matters at scale. More importantly, if the database is slow or timing out, you don't want that to delay the Redis check too.

Think of it like this: if you need to check whether your fridge has milk AND whether your car has gas, you'd send one person to check the fridge and another to check the car at the same time, rather than waiting for the fridge person to come back before sending someone to the car.

**How to say it in an interview:** "We run dependency checks concurrently with Promise.all to minimize health endpoint latency. Since the checks are independent, there's no reason to serialize them."

### Decision 3: HTTP 503 for degraded, not 500

**What's happening:** When a dependency is down, we return status code 503 (Service Unavailable) instead of 500 (Internal Server Error).

**Why this matters:** These codes mean different things to infrastructure:
- **500** means "the server has a bug" — something unexpected happened in code.
- **503** means "the server is temporarily unavailable" — try again later.

Load balancers (like AWS ALB or nginx) treat 503 as a signal to stop sending traffic to this instance and try another one. Monitoring tools treat it as a transient issue rather than a code defect. Using the right status code means your infrastructure responds appropriately.

**How to say it in an interview:** "We use 503 specifically because it signals temporary unavailability to load balancers and monitoring systems. A 500 would imply a code bug, but a degraded dependency is an infrastructure issue — the distinction matters for automated remediation."

### Decision 4: Latency measurement in every check

**What's happening:** Both `checkDatabaseHealth` and `checkRedisHealth` record the time before and after each check, returning the difference as `latencyMs`.

**Why this matters:** Knowing that a service is "up" is only half the picture. If Redis is responding but taking 500ms instead of the usual 2ms, that's a sign of trouble — maybe the server is swapping to disk or the network is congested. By including latency in the health response, monitoring dashboards can alert on performance degradation before it becomes a full outage.

**How to say it in an interview:** "We include latency measurements so monitoring can catch performance degradation early. A service responding in 500ms versus 2ms is technically 'up' but effectively degraded — the latency metric surfaces that."

### Decision 5: Excluded from request logging

**What's happening:** The health endpoint is configured in the main `index.ts` to be excluded from pino-http's automatic request logging.

**Why this matters:** Load balancers hit `/health` every 10-30 seconds. That's 2-6 log entries per minute per instance, adding up to thousands of useless log lines per day. These pollute your logs, making it harder to find real issues and increasing your log storage costs. Excluding health checks from auto-logging keeps logs clean and focused on actual user traffic.

**How to say it in an interview:** "We exclude the health endpoint from auto-logging to reduce log noise. Load balancer health checks can generate thousands of log entries per day that add no diagnostic value and increase storage costs."

---

## 3. Code Walkthrough

### Block 1: Imports (lines 1-4)

```ts
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { db } from '../lib/db.js';
import { checkRedisHealth } from '../lib/redis.js';
```

Four imports, each with a distinct role:
- **`Router`** from Express — a mini-application that can have its own routes. Think of it as a section of your restaurant menu: the health router handles health-related routes, the auth router handles auth routes, etc. The main app assembles all these routers together.
- **`sql`** from Drizzle ORM — a tagged template function that lets you write raw SQL safely. Drizzle is our ORM (Object-Relational Mapper — a library that lets you interact with the database using TypeScript instead of raw SQL strings). But for a simple `SELECT 1`, the raw `sql` tag is cleaner than building a full query object.
- **`db`** — our database connection instance, similar to the Redis singleton pattern. It's created once and shared across the app.
- **`checkRedisHealth`** — the function we covered in the redis.ts explanation. It pings Redis and returns `{ status, latencyMs }`.

### Block 2: Route definition (lines 6-25)

```ts
const router = Router();

router.get('/health', async (_req, res) => {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const status = dbHealth.status === 'ok' && redisHealth.status === 'ok'
    ? 'ok'
    : 'degraded';

  const statusCode = status === 'ok' ? 200 : 503;

  res.status(statusCode).json({
    data: {
      status,
      services: {
        database: dbHealth,
        redis: redisHealth,
      },
      timestamp: new Date().toISOString(),
    },
  });
});
```

Let's unpack this piece by piece:

**`router.get('/health', async (_req, res) => { ... })`** — This registers a handler for GET requests to `/health`. The `_req` parameter has an underscore prefix, which is a naming convention that says "I know this parameter exists but I'm not using it." We don't need anything from the request — no query parameters, no body, no headers. We just need to respond.

**`const [dbHealth, redisHealth] = await Promise.all([...])`** — This is called "destructuring assignment" combined with `Promise.all`. `Promise.all` takes an array of promises and runs them concurrently. When both resolve, it returns an array of their results. The `[dbHealth, redisHealth]` syntax "destructures" that array — it's shorthand for "put the first result in `dbHealth` and the second in `redisHealth`."

**The status logic** — Simple boolean: if both services report 'ok', the overall status is 'ok'. If either is down, it's 'degraded'. There's no "partial" or "warning" state because for our purposes, any dependency failure means the server can't fully serve requests.

**The response** — We wrap everything in a `data` property. This is a convention in our API — all responses have a `data` wrapper. The `timestamp` in ISO 8601 format (`2026-02-24T12:00:00.000Z`) tells monitoring tools exactly when this check ran. This is useful when you're looking at cached health responses or debugging time-related issues.

### Block 3: Database health check (lines 27-35)

```ts
async function checkDatabaseHealth(): Promise<{ status: 'ok' | 'error'; latencyMs: number }> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch {
    return { status: 'error', latencyMs: Date.now() - start };
  }
}
```

**`db.execute(sql\`SELECT 1\`)`** — `SELECT 1` is the lightest possible database query. It doesn't read any tables, doesn't scan any rows, doesn't allocate any buffers. It just asks PostgreSQL, "Can you understand SQL and respond?" If this fails, the database connection is truly broken. The `sql` template tag tells Drizzle to pass this through as a raw query.

**The try/catch pattern** — Same as the Redis health check: we never throw. We always return a well-structured result. If PostgreSQL is unreachable (network partition, server crashed, connection pool exhausted), the `catch` block handles it gracefully.

**`Date.now()` timing** — `Date.now()` returns the current time in milliseconds since January 1, 1970 (the "Unix epoch"). By recording it before and after the operation, we get the wall-clock duration of the database round trip. This includes network latency, PostgreSQL processing time, and any connection pool wait time.

### Block 4: Export (line 37)

```ts
export default router;
```

We export the router as a default export. In the main `index.ts`, this gets mounted with something like `app.use(healthRouter)`. This modular structure means each route file is self-contained and testable in isolation.

---

## 4. Complexity and Trade-offs

**Time complexity:** O(1) for both checks. `SELECT 1` does constant work. `PING` does constant work. `Promise.all` with 2 items is constant overhead.

**Space complexity:** O(1). The response object is a small, fixed-size JSON structure regardless of how much data the app holds.

**Trade-off 1: Deep check vs. shallow check.**
A shallow check (just return 200) is faster and never fails due to dependency issues. But it lies — it says the server is healthy when it might not be able to serve any real requests. A deep check (ping dependencies) is slightly slower (~50ms) but gives honest information. We chose deep checks because accurate health reporting is more valuable than the marginal latency savings. The risk is that a slow dependency (e.g., Postgres under heavy load) makes the health check itself slow, potentially causing the load balancer to time out the check.

**Trade-off 2: No authentication on health endpoint.**
The health endpoint is public — anyone can call it and learn that we use PostgreSQL and Redis. We could add authentication, but then load balancers would need credentials, and health check configuration becomes more complex. The information exposed is minimal (service names and latencies) and doesn't include version numbers, internal IPs, or credentials. The trade-off is acceptable.

**Trade-off 3: `Promise.all` fails fast.**
If one check throws before the other resolves, `Promise.all` rejects immediately. But since both our checks catch their own errors internally (they return `{ status: 'error' }` instead of throwing), `Promise.all` always resolves. This is a deliberate design — we want both results even if one service is down.

**How to say it in an interview:** "The health endpoint runs both checks in parallel and always returns a complete response, even when dependencies are down. We chose deep checks over shallow ones because load balancers need truthful status information to make good routing decisions."

---

## 5. Patterns and Concepts Worth Knowing

### Health Check Pattern (also called "Liveness" and "Readiness" probes)
In production systems, especially container orchestrated ones like Kubernetes, there are typically two kinds of health checks:
- **Liveness probe:** "Is the process alive?" If no, restart it.
- **Readiness probe:** "Can the process serve traffic?" If no, stop sending it requests.

Our `/health` endpoint functions as a readiness probe. It returns 503 when dependencies are down, which tells load balancers to send traffic elsewhere. A separate liveness check might just verify the process is running (which the OS handles).

### Parallel Async Operations with `Promise.all`
`Promise.all` is a fundamental concurrency tool in JavaScript. It takes an array of promises and returns a single promise that resolves when ALL of them resolve. The key insight: JavaScript is single-threaded but non-blocking. While waiting for the database response, the event loop can process the Redis response. The two checks literally run at the same time from the perspective of I/O.

### Modular Router Pattern (Express)
Express routers let you break a large application into small, focused files. Each router handles one "concern" — health checks, authentication, user management, etc. The main app imports all routers and mounts them. This makes the codebase navigable (want to understand health checks? Look at one file) and testable (you can mount a router in a test server without booting the whole app).

### Graceful Degradation Reporting
Instead of crashing or returning vague errors when dependencies fail, this endpoint reports exactly what's wrong and what's working. This is part of a broader principle called "observability" — making your system's internal state visible to operators. Good observability means when something breaks at 3 AM, the on-call engineer can look at the health endpoint response and immediately know "the database is down but Redis is fine" instead of guessing.

---

## 6. Potential Interview Questions

### Q1: "Why not just return a hardcoded 200 OK?"

**Strong answer:** "A hardcoded 200 only proves the Node.js process is running and can accept TCP connections. It doesn't tell you whether the server can actually do useful work. If the database is down, every API call will fail — but the load balancer would keep sending traffic to this instance because the health check says it's fine. By checking actual dependencies, we give the load balancer accurate information to make routing decisions. The slight cost in latency (~50ms) is worth the operational reliability."

**Red flag:** "That's simpler and faster" without acknowledging the consequences, or not understanding what load balancers do with health check responses.

### Q2: "What would happen if you used `Promise.allSettled` instead of `Promise.all`?"

**Strong answer:** "`Promise.allSettled` waits for all promises to complete regardless of whether they resolve or reject, and returns the outcome of each one. `Promise.all` short-circuits on the first rejection. In our case, both health check functions have internal try/catch blocks — they never reject, they always resolve with a status object. So functionally, `Promise.all` and `Promise.allSettled` would behave identically here. But if we ever changed the health checks to throw on failure, `Promise.allSettled` would be the safer choice since we want both results regardless."

**Red flag:** Not knowing the difference between `Promise.all` and `Promise.allSettled`, or thinking `Promise.all` runs things sequentially.

### Q3: "Why 503 and not 500 for degraded status?"

**Strong answer:** "500 means Internal Server Error — something unexpected happened in the application code, like an unhandled exception or a bug. 503 means Service Unavailable — the server is temporarily unable to handle requests, typically due to being overloaded or in maintenance. When a dependency is down, it's not a code bug — it's a transient infrastructure issue. Load balancers and monitoring systems treat these codes differently: 503 triggers retry logic and traffic rerouting, while 500 might trigger code-level alerting. Using the semantically correct code helps the entire infrastructure stack respond appropriately."

**Red flag:** "All error codes are basically the same" or not knowing what 503 means.

### Q4: "How would you add a timeout to the health checks so a slow dependency doesn't hang the endpoint?"

**Strong answer:** "I'd wrap each check in a `Promise.race` against a timer. Something like `Promise.race([checkDatabaseHealth(), timeout(5000)])` where `timeout` returns `{ status: 'timeout', latencyMs: 5000 }` after 5 seconds. This way, if PostgreSQL is reachable but taking 10 seconds to respond, the health endpoint still returns within 5 seconds and reports the database as timed out. The load balancer's own timeout (usually configurable) acts as a secondary safeguard, but having our own timeout gives us cleaner error reporting."

**Red flag:** "I'd just increase the load balancer timeout" without addressing the root issue, or not knowing about `Promise.race`.

### Q5: "This health check runs `SELECT 1` on every call. Could that cause problems at scale?"

**Strong answer:** "SELECT 1 is extremely lightweight — it doesn't touch any tables or use any indexes. PostgreSQL can handle thousands of these per second. However, if health checks run every 10 seconds from every load balancer node, and you have 50 instances behind the load balancer, that's 5 queries per second just from health checks. Still negligible for Postgres. The bigger concern would be connection pool exhaustion — if the health check consumes a connection from a limited pool while real requests are waiting. In practice, SELECT 1 returns in under a millisecond, so the connection is returned almost immediately. If it ever became a problem, we could use a separate lightweight connection outside the pool."

**Red flag:** "SELECT 1 is expensive" or being unaware that connection pools are a finite resource.

### Q6: "How would you test this endpoint?"

**Strong answer:** "I'd write integration tests using supertest, which lets you make HTTP requests against an Express app in-process without starting a real server. For the happy path: mock both health checks to return 'ok', call GET /health, assert 200 and the correct JSON structure. For degraded state: mock the database check to return 'error' while Redis returns 'ok', assert 503 and status 'degraded'. I'd also verify the response includes latency numbers and a valid ISO timestamp. For unit tests, I'd test `checkDatabaseHealth` in isolation by mocking the `db.execute` call."

**Red flag:** "I'd manually test it with curl" as the only testing strategy, or not considering both healthy and degraded scenarios.

---

## 7. Data Structures & Algorithms Used

| Concept | Where | Why |
|---|---|---|
| **Promise.all (concurrent execution)** | `await Promise.all([checkDatabaseHealth(), checkRedisHealth()])` | Runs independent I/O operations in parallel to minimize total wait time. |
| **Destructuring assignment** | `const [dbHealth, redisHealth] = ...` | Extracts individual results from the Promise.all array into named variables for readability. |
| **Discriminated union type** | `status: 'ok' \| 'error'` | TypeScript literal union — the status can only ever be exactly the string `'ok'` or `'error'`, nothing else. This eliminates typos and makes switch/if statements exhaustive. |
| **Wall-clock timing** | `Date.now() - start` | Measures elapsed real time in milliseconds. Simple but effective for latency reporting. |
| **Router composition** | `Router()` | Express pattern for building modular route handlers that get assembled into the main application. |

---

## 8. Impress the Interviewer

### Talking point 1: "Health checks are a contract with your infrastructure"
"I think of health endpoints as a contract between the application and the infrastructure layer. The load balancer promises to check `/health` periodically and respect the response code. The application promises to return an honest answer quickly. If the health check lies (returns 200 when the database is down), the load balancer sends traffic to a broken instance. If it's too slow (blocks for 30 seconds), the load balancer times out and assumes the worst. Keeping this contract reliable is what makes auto-scaling and zero-downtime deployments possible."

### Talking point 2: "The response structure is designed for both machines and humans"
"The JSON response serves two audiences. Machines (load balancers, monitoring) use the HTTP status code — 200 means route traffic here, 503 means don't. Humans (engineers debugging at 3 AM) use the JSON body — they can see exactly which service is down and how much latency it's adding. The ISO timestamp helps correlate health check results with other logs. Designing APIs that serve both automated systems and human operators is a habit that pays off in production."

### Talking point 3: "Excluding health checks from logging shows production awareness"
"One thing I learned is that health check endpoints can generate more log entries than all your real traffic combined. A load balancer checking every 10 seconds across 10 instances is 86,400 log entries per day — none of them useful. Excluding the health route from auto-logging keeps your log volume manageable and your log search results relevant. It's a small configuration detail, but it shows awareness of operational costs."

### Talking point 4: "This pattern scales to more complex dependency graphs"
"Right now we check two dependencies, but the pattern extends cleanly. If we added an external API (like the Claude AI service), we'd add a `checkClaudeHealth()` function, include it in the `Promise.all` array, and add it to the services object. The overall status logic — degraded if any dependency is down — stays the same. You could also add granularity: 'ok' when everything works, 'degraded' when non-critical services are down (like the cache), and 'critical' when essential services are down (like the database)."
