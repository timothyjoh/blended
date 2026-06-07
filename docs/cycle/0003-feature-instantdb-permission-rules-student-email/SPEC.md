# SPEC — Cycle 0003: InstantDB Permission Rules — Student Email Privacy + Session Write Authorization

## WHY
Blended now has an event-spine schema (cycle 0001) and an authenticated identity gate (cycle 0002), but every security invariant the product depends on currently lives only in convention and UI code. The InstantDB app is reactive and client-queryable: a signed-in student can open a console, hand-craft an InstaQL query, and read any row — including another participant's private `email` — or hand-craft a `transact()` and mutate session state they have no authority over (flip the active resource, edit the resource queue, rename a session). SPEC §16.1 makes email protection a MUST and §3 makes "students MUST NOT activate global resources or manage session lifecycle" a MUST; ADR-0001 explicitly says security-sensitive projections (email privacy, "students cannot activate resources") must move to the data layer (permission rules), not be trusted to the client. Today no permission rules are committed at all, so both invariants are enforceable only by a cooperating client — i.e. not enforced.

## CONCRETE USER BENEFIT
After this cycle, a student's privacy and a teacher's authority hold even against a hostile or hand-crafted client. A student can no longer obtain a classmate's email address by any client query, and can no longer alter the lesson everyone is following (the active resource, the resource queue, the session itself) — only the owning teacher can. A teacher can trust that the resource on every student's screen is the one *they* chose, and a student can trust their email stays private, regardless of what code anyone runs in their browser. Before this cycle, both protections evaporated the moment someone bypassed the UI; after it, they are enforced by the database.

## USABLE END-STATE
- A student-authenticated client that issues a raw query for another participant's `email` receives no email value — the data is not returned.
- A student-authenticated client that attempts a raw write to `sessions`, `sessionResources`, or the active-resource projection field (`sessions.activeResourceId`) is rejected by the data layer with a permission error; the stored state is unchanged.
- The owning teacher's writes to their own session's state succeed and propagate in realtime to every joined student.
- A teacher attempting to write a *different* teacher's session is rejected.
- The permission rules are committed to the repo as `instant.perms.ts` and pushed to the live Instant app, and the rules are documented in `AGENTS.md`.

## Objective
This cycle authors, commits, and pushes a single InstantDB permission-rules artifact (`instant.perms.ts`) that enforces two spec-mandated invariants at the data layer rather than in the UI: (1) student email privacy — a participant's `email` is readable only by that user, never by other students; and (2) session-state write authorization — only the owning teacher (plus system/admin) may create or mutate `sessions` and `sessionResources` rows, while any authenticated participant may still append to the append-only `sessionEvents` log. It matters because every downstream session feature (queue a resource, activate a resource, teacher URL broadcast) assumes these guarantees already hold; building them on an unprotected data layer would ship a classroom tool that leaks student PII and lets any student hijack the lesson.

## Source Issue
`txt-20260606-213625-instant-permission-rules-email-privacy` — "InstantDB permission rules: student email privacy + session write authorization"

## Scope

### In Scope
- An `instant.perms.ts` permission-rules file enforcing **email privacy** (the canonical private email on the `users` namespace is viewable only by its own user; participant roster rows carry no email for client reads) and **session-state write authorization** (`sessions` and `sessionResources` create/update/delete restricted to the owning teacher and system/admin; `sessionEvents` remains append-only-writable by authenticated participants).
- Pushing the rules to the live Instant app and verifying they take effect, plus documenting the data-layer authorization model in `AGENTS.md`.
- A Playwright e2e spec proving both invariants from a real student-authenticated context (email read denied; unauthorized session-state write rejected; authorized teacher write still propagates).

### Out of Scope
- Organization-scoped permission rules (future).
- Moderation / message-visibility rules and any `messages`/`questions`/`endorsements` read-visibility policy (Batch 2).
- The `currentUrl` teacher-broadcast field and its sync behavior — that field is introduced by cycle `txt-20260606-213636`; this cycle protects the existing `sessions.activeResourceId` projection field, and the rule set is written so the later `currentUrl` write inherits the same owner-only `sessions` policy.
- Admin-console and admin-promotion flows (separate cycles); this cycle only reserves the system/admin write path in the rules, it does not build admin UI.
- Schema changes beyond the minimal link or denormalized owner field required to make `sessionResources` ownership checkable in a permission rule.

## Requirements
- Permission rules MUST be expressed in a committed `instant.perms.ts` consumed by `npx instant-cli push perms`; they MUST NOT depend on any client cooperation to hold.
- **Email privacy**: the `users` namespace view rule MUST restrict reads to the requesting user's own row (`auth.id == data.id`), so no client can read another user's `email`. `participants` projection rows MUST NOT carry an `email` value usable by clients — the canonical private email lives solely on the own-row-locked `users` namespace, so a hand-crafted `participants` query yields no email. (No participant rows are written yet; this establishes the invariant before the join-via-link cycle creates them.)
- **Write authorization**: `sessions` create/update/delete MUST be allowed only when `auth.id == data.teacherId` (teacherId is the auth user id per SPEC §5) or the actor is system/admin. `sessionResources` create/update/delete MUST be allowed only when the requester owns the parent session (or is system/admin); if the current string-foreign-key (`sessionResources.sessionId`) cannot be traversed in a rule, add the minimal mechanism (an InstantDB link to `sessions`, or a denormalized owner/teacher id on the resource row) needed to make ownership checkable, and document it.
- `sessionEvents` MUST remain writable (append) by any authenticated participant so the dual-write `writeEvent()` path for legitimate student actions (messages, questions) is not broken; events are append-only (no client update/delete).
- The rules MUST NOT break the existing authenticated flows (cycle 0002 sign-in, first-sign-in `users`-row creation via `writeEvent()` under `IDENTITY_SCOPE`, the `/dev/event-spine` harness) — first-sign-in creation of one's own `users` row MUST remain permitted.
- The `todos` demo namespace, if present, MUST remain unaffected (its existing open access is exempt).
- **Failure behavior**: a denied read MUST return no data for the protected field/row (empty/omitted), never a partial leak; a denied write MUST be rejected by InstantDB with a surfaced permission error and MUST leave stored state unchanged (no partial projection write). When `instant.perms.ts` cannot be pushed (CLI/auth/network failure), the push step MUST fail loudly with a non-zero exit and a clear message rather than silently leaving the live app unprotected. The e2e suite MUST skip loudly (not pass) when `INSTANT_ADMIN_TOKEN` is unset, matching the existing `e2e/auth.spec.ts` convention.

## Acceptance Criteria
- [ ] **(User benefit)** From a student-authenticated browser context, a raw query for another participant's / user's `email` returns no email value (denied or empty) — the classmate's address is unreadable by any client query.
- [ ] **(User benefit)** From a student-authenticated context, a raw write to `sessions`, `sessionResources`, or `sessions.activeResourceId` is rejected and the stored value is unchanged; then the owning teacher changes the active resource and the student's realtime view updates — proving authorized writes still propagate while unauthorized ones are blocked.
- [ ] The owning teacher can create/update their own session and its resources; a different authenticated teacher attempting to write that session is rejected.
- [ ] **(Failure path)** A student `transact()` against a protected namespace surfaces an InstantDB permission error (observable in the e2e probe) and leaves the row unmodified — the write is not silently dropped or silently applied.
- [ ] **(Failure path)** Running the perms push with an unavailable Instant app / missing credentials exits non-zero with a clear message rather than reporting success.
- [ ] `instant.perms.ts` is committed and the rules are pushed to the live Instant app.
- [ ] `AGENTS.md` documents the data-layer authorization model (which namespaces are owner-restricted, where private email lives, and how to push perms).
- [ ] First-sign-in `users`-row creation, the cycle-0002 auth flow, and the `/dev/event-spine` harness still work under the new rules.
- [ ] All existing tests still pass (`npm run test`, `npm run test:e2e`).
- [ ] No compiler/linter warnings introduced (`npm run astro check` clean).

## Testing Strategy
- **Playwright (`e2e/permissions.spec.ts`)** is the primary gate, since the invariants are data-layer behaviors observable only against the live Instant app. Use the existing `INSTANT_ADMIN_TOKEN` path (`@instantdb/admin` `generateMagicCode`, no email sent) to deterministically sign in two distinct users — a teacher and a student — in two browser contexts in the same session; skip loudly if the token is unset.
- Key scenarios:
  - **Happy path**: owning teacher writes session state (e.g. sets `activeResourceId`); student context observes the realtime update.
  - **Email privacy (failure-path / denial)**: student context issues a raw query for the other user's `email` → no email returned.
  - **Write authorization (failure-path / denial)**: student context attempts a raw `transact()` against `sessions` / `sessionResources` / `activeResourceId` → rejected with a permission error, stored state unchanged on re-read.
  - **Cross-teacher denial**: a second teacher attempts to write the first teacher's session → rejected.
  - **Regression**: the cycle-0002 auth flow, first-sign-in `users`-row creation, and `/dev/event-spine` dual-write still succeed under the new rules.
- Any rule expression with non-trivial logic (e.g. an ownership helper) that can be extracted into a pure module gets a Vitest unit test beside it (`*.test.ts`); rules that are pure CEL-style strings are covered by the e2e gate.
- Honor `playwright.config.ts` (`retries: 3`) to absorb realtime-sync flake; run `npm run astro check` alongside.

## Documentation Updates
- **AGENTS.md**: add a short "Permission rules / data-layer authorization" note under the Data Layer section — that `instant.perms.ts` is the single source of permission rules, that `users`/`sessions`/`sessionResources` are owner-restricted, that private email lives only on the own-row-locked `users` namespace (participant rows carry no client-readable email), that `sessionEvents` is append-only by authenticated participants, and the `npx instant-cli push perms` command (mirroring the existing `push schema` note).
- **README.md / release notes**: note that permission rules now exist and must be pushed to the Instant app; no new required env var (the e2e-only `INSTANT_ADMIN_TOKEN` is already documented).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- The InstantDB schema and `writeEvent()` helper from cycle 0001 (`src/lib/db.ts`) — the `users`, `sessions`, `sessionResources`, `participants`, and `sessionEvents` entities and the `sessions.teacherId` / `*.email` fields referenced here must already exist (they do).
- The cycle-0002 auth flow (`src/lib/useAuth.ts`, `src/lib/auth.ts`): `sessions.teacherId` and the `users` row id are the InstantDB auth user id (`auth.id`), which the ownership rules compare against.
- `@instantdb/admin` and `instant-cli` (already in `package.json`) for pushing perms and for deterministic e2e sign-in.
- Env: `PUBLIC_INSTANTDB_APP_ID` (app), and the e2e-only `INSTANT_ADMIN_TOKEN` for the Playwright verification; Instant app admin access for `instant-cli push perms`.
