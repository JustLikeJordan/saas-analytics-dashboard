# Epic 9 — Retro Pending Ledger

Rolling list of retro-item candidates surfaced during Epic 9 implementation. Compiled into the formal retrospective after `epic-9-retrospective`.

---

## From Story 9.1 — Email Infrastructure & Provider Integration

### Retroactive email unification (CLOSED VACUOUS)

**Item:** The Epic 9 sprint plan originally called for preserving the invite flow (Story 1.5) and payment-failure flow (Story 5.4) email paths with TODO comments pointing here.

**Finding (2026-04-23):** Grep of the codebase confirms neither path implements an email send today. Invite flow is link-copy only (clipboard → recipient pastes into their own email). Payment-failure flow logs + revokes Pro access but never emailed the user.

**Resolution:** Vacuously satisfied. No TODO comments to add; no code to preserve. If a future business decision adds either email path, it must route through `services/email/` — never `emailDigest/`.

**Closed:** 2026-04-23 (Story 9.1 dev pass)

### Deviation — react-email v1 vs. spec's `^0.x`

**Item:** Story 9.1 AC #8 pinned `@react-email/components@^0.x`. Actual latest stable major is `^1.0.x` (v1.0.12 at install time).

**Finding:** v0.x is deprecated per pnpm warning. v1.0 carries the same API (`render(...)` remains async; same component primitives). No breaking change to the code this story ships.

**Resolution:** Deviation accepted — the spec's intent was "latest stable major", which is now 1.0. Flag for Story 9.3 to confirm before building the digest template.

### Deviation — `providers/` subdirectory vs. root-level placement

**Item:** Story 9.1's proposed layout puts `console.ts` + `resend.ts` in a `providers/` subdirectory. `services/aiInterpretation/` keeps its single implementation at the root (`claudeClient.ts`).

**Rationale accepted:** Email has three implementations (console + Resend + Postmark stub) — a subdirectory keeps the root barrel clean. Single-implementation services can stay flat.

**Carry-forward:** If code review prefers flattening, collapse the subdirectory in Story 9.2's cutover. Low cost.

### Deferred — lint rule for `sendEmail` chokepoint

**Item:** AC #9 says "a lint rule or code-review guard enforces this (deferred — documented, not implemented in 9.1)."

**What shipped:** `project-context.md` documents the rule. Code review is the only enforcement.

**Suggested follow-up:** ESLint `no-restricted-imports` rule blocking `resend` + `@react-email/components` imports anywhere except `apps/api/src/services/email/`. Cheap to add; prevents drift. Land in Story 9.5 observability work or earlier if a reviewer catches a violation.

### Carry-forward — `emailDigest/` retirement

**Item:** Prior scaffolding at `apps/api/src/services/emailDigest/` is still operational and untouched. Story 9.2 replaces it with `apps/api/src/jobs/digest/`; this directory gets deleted as part of that story.

**Risk:** If Story 9.2 slips, the retirement README in `emailDigest/` is a visible reminder but not a forcing function. Set a reminder to verify deletion at Epic 9 retro.

### Carry-forward — `DIGEST_FROM_EMAIL` deprecation

**Item:** `config.ts` still carries `DIGEST_FROM_EMAIL` with a deprecation comment pointing to Story 9.2.

**Resolution path:** Delete `DIGEST_FROM_EMAIL` + `isDigestConfigured()` in Story 9.2's `emailDigest/` retirement. Confirm at Epic 9 retro.

### Followup — Sentry tag normalization across services

**Item:** Resend provider's Sentry capture uses `tags: { provider: 'email', template, retryable }`. Commit `4c51140` established a similar pattern for audit captures.

**Observation:** There's no central list of "which Sentry tags the app emits and what they mean." Growing this organically works for now; revisit if oncall can't filter effectively during an incident.
