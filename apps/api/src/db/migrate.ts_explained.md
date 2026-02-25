# migrate.ts — Interview-Ready Documentation

## Section 1: 30-Second Elevator Pitch

Before an app can store data, the database needs the right tables and columns. This file is a standalone script that sets up (or updates) the database structure. It runs before the main app starts — like a construction crew that finishes the building before the tenants move in. If the database is missing tables or has an older version, this script brings it up to date.

**How to say it in an interview:** "This is a standalone migration script that runs via Docker entrypoint before the Express app boots. It uses Drizzle's migrator to apply pending SQL migrations and exits — keeping migration concerns completely separate from the application runtime."

---

## Section 2: Why This Approach?

### Decision 1: Standalone script instead of running migrations at app boot

**What's happening:** Some apps run migrations when the server starts up. This script runs *before* the server starts, as a separate process. It's like checking that the stage is set up before the performers walk on — you don't want to discover a missing table halfway through serving traffic.

**How to say it in an interview:** "Migrations run as a separate process before the app starts, triggered by the Docker entrypoint. This ensures the database is fully migrated before any request is served, and prevents multiple app instances from racing to run the same migrations."

**Over alternative:** Running migrations on app boot risks multiple instances competing to apply the same migration simultaneously. It also means a slow migration blocks app startup and health checks, potentially triggering container restarts.

### Decision 2: process.env and console.log instead of config.ts/Pino

**What's happening:** The main app has a fancy config system (Zod validation) and structured logging (Pino). This script uses raw `process.env` and `console.log` instead. That's intentional — the config system validates ALL env vars (Redis URL, Claude API key, etc.), which aren't relevant for migrations. Loading the full config would fail because those vars aren't set in the migration context.

**How to say it in an interview:** "The migration script bypasses the app's Zod-validated config and Pino logger because it runs in a minimal context where only DATABASE_URL is available. The eslint-disable comments document this as an intentional exception, not carelessness."

**Over alternative:** Importing config.ts would require setting every env var just to run migrations, which defeats the purpose of having a lean, standalone script.

### Decision 3: Single connection (`max: 1`) for migrations

**What's happening:** The migration client connects with `max: 1` — only one database connection at a time. Migrations run sequentially by nature (you can't apply step 3 before step 2), so one connection is all you need. No point holding a pool of 10 connections when you'll only use one.

**How to say it in an interview:** "Migrations use a single connection because they're inherently sequential. A connection pool would be wasted resources and could interfere with migration locking in PostgreSQL."

**Over alternative:** A connection pool wastes resources and, depending on the migration tool, could cause issues with transaction isolation during schema changes.

---

## Section 3: Code Walkthrough

### Block 1: Header comment (lines 1-6)

Documents why this file breaks two CLAUDE.md rules (no process.env, no console.log). This is good practice — when you intentionally break a codebase convention, leave a comment explaining why so the next developer (or linter) doesn't "fix" it.

### Block 2: Environment check (lines 11-15)

Reads `DATABASE_URL` and exits with code 1 if missing. `process.exit(1)` signals to Docker that the container failed, which prevents the app from starting with no database. The eslint-disable comments are inline to keep the suppression as narrow as possible.

### Block 3: Migration client (line 17)

Creates a postgres.js connection with `max: 1`. This connection is used only for migrations and closed when done — it doesn't stay open for the app.

### Block 4: runMigrations function (lines 19-27)

Wraps the Drizzle db in a new instance, runs all pending migrations from the `./drizzle/migrations` folder, and closes the connection. The console output is for Docker logs — operators need to see whether migrations ran and whether they succeeded.

### Block 5: Error handler (lines 29-32)

The `.catch()` on the top-level `runMigrations()` call ensures any error kills the process with exit code 1. Without this, a failed migration would silently exit with code 0, and Docker would think everything is fine and start the app against a broken database.

---

## Section 4: Complexity and Trade-offs

**Idempotency:** Drizzle's migrator tracks which migrations have already been applied (via a `__drizzle_migrations` table). Running this script multiple times is safe — it only applies new migrations.

**What happens on failure:** If a migration fails mid-way, PostgreSQL rolls back the current migration's transaction (Drizzle wraps each migration in a transaction by default). The database stays at the last successfully applied version. The script exits with code 1, Docker doesn't start the app.

**No rollback mechanism:** This script only moves forward. If you need to undo a migration, you'd write a new migration that reverses the changes. This is standard practice — rollback scripts are rarely maintained and often wrong.

**How to say it in an interview:** "The migration script is idempotent and fail-safe — it tracks applied migrations, wraps each in a transaction, and exits with a non-zero code on failure so Docker won't start the app against a broken schema."

---

## Section 5: Patterns and Concepts Worth Knowing

### Database Migrations

A migration is a versioned change to the database structure — adding a table, modifying a column, creating an index. Migrations are applied in order, and a tracking table records which ones have run. It's like a changelog for your database structure.

**Where it appears:** The entire file exists to run migrations.

**Interview-ready line:** "Migrations provide version control for the database schema. Each migration is a forward-only SQL script, applied in order, with a tracking table that ensures each runs exactly once."

### Fail-Fast Pattern

If something critical is wrong (no DATABASE_URL), the script immediately exits with an error rather than trying to continue. The principle: fail loudly and immediately rather than silently producing wrong results later.

**Where it appears:** The `process.exit(1)` on missing DATABASE_URL.

**Interview-ready line:** "The script uses fail-fast — if the database URL is missing, it exits immediately with a non-zero code rather than attempting to connect and failing with a confusing error."

### Process Exit Codes

Exit code 0 means success, anything else means failure. Docker, CI systems, and shell scripts use exit codes to decide what to do next. `process.exit(1)` tells the orchestrator "this failed, don't proceed."

**Where it appears:** `process.exit(1)` on missing env var and on migration failure.

**Interview-ready line:** "Non-zero exit codes signal failure to Docker, which prevents the app container from starting against an unmigrated database."

---

## Section 6: Potential Interview Questions

### Q1: "Why not run migrations when the app starts instead of as a separate script?"

**Context if you need it:** The interviewer wants to hear about deployment race conditions and separation of concerns.

**Strong answer:** "Separate migration scripts prevent race conditions when multiple app instances start simultaneously — only the migration container runs once, not N times in parallel. It also keeps startup fast and predictable — a slow migration doesn't block health checks, and a failed migration doesn't leave the app in a half-started state."

**Red flag answer:** "It's just cleaner." — True but not sufficient. The race condition argument is the key insight.

### Q2: "What happens if a migration fails halfway through?"

**Context if you need it:** Testing your understanding of transactional DDL in PostgreSQL.

**Strong answer:** "Each Drizzle migration is wrapped in a transaction. If it fails, PostgreSQL rolls back the entire migration — no partial schema changes. The tracking table doesn't record it as applied, so it will be retried on the next run. The script exits with code 1, which prevents the app from starting."

**Red flag answer:** "The database would be corrupted." — Not in PostgreSQL, which supports transactional DDL. This would be true in MySQL, which doesn't.

### Q3: "Why use eslint-disable comments instead of just fixing the lint rules?"

**Context if you need it:** The interviewer is checking whether you understand the purpose of lint rules and when exceptions are appropriate.

**Strong answer:** "The lint rules (no process.env, no console.log) exist to enforce the app's config and logging patterns. This script intentionally operates outside those patterns because it runs before the app's infrastructure is available. Inline disable comments with an explanatory header are more appropriate than changing the rules globally, because the rules are correct for 99% of the codebase."

**Red flag answer:** "Lint rules are just guidelines." — They exist for a reason. The right answer is knowing when and how to make documented exceptions.

---

## Section 7: Data Structures & Algorithms Used

This file uses no meaningful data structures or algorithms beyond basic control flow. The migration tracking (which migrations have run) is handled internally by Drizzle's migrator using a database table — this script just invokes it.

---

## Section 8: Impress the Interviewer

### Docker Entrypoint Integration

**What's happening:** This script runs as part of the Docker entrypoint — before the Express server starts. The container startup order is: start PostgreSQL → run migrations → start Express. If migrations fail, Express never starts.

**Why it matters:** In production, you don't want to discover a missing table when the first user request hits. Running migrations in the entrypoint guarantees the database schema is current before any traffic is served.

**How to bring it up:** "The migration script integrates into the Docker entrypoint to ensure schema correctness before the app serves traffic. It's a zero-downtime pattern — the new container runs migrations against the existing database, and if they fail, the old container keeps serving while the new one is rolled back."

### Exit Code Discipline

**What's happening:** Every failure path explicitly calls `process.exit(1)`. This isn't just good practice — it's a contract with the orchestration layer. Docker, Kubernetes, and CI systems all use exit codes to make decisions about retries, rollbacks, and alerts.

**Why it matters:** A script that fails silently (exits 0 on error) can cause cascading failures — the app starts against a broken database, errors propagate to users, and the root cause is obscured.

**How to bring it up:** "The script is deliberate about exit codes — every failure path exits with 1 so the container orchestrator knows the migration failed. Silent failures in deployment scripts are one of the hardest issues to debug in production."
