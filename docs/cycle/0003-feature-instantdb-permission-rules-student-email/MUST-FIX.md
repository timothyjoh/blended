# Must-Fix Items: Cycle 0003

## Summary
2 critical issues, 2 minor issues found in review. The permission-rule
artifacts, push wrapper, probe, and e2e spec are well-built and the local
gates are green — but (1) the rules were never pushed to the live Instant
app, so the SPEC's stated user benefit is **not actually delivered** and no
acceptance criterion was proven against a live app; and (2) the
`sessionResources` create rule does not enforce "owns the parent session"
as the SPEC requires — a student can inject a resource into another
teacher's session.

## Tasks

- [x] ### Task 1 (Undeliverable User Benefit): Push rules to the live app and prove the e2e acceptance criteria
  **Status:** ❌ Could not fix
  **Reason:** This is an operator step against shared live infrastructure and
    cannot be executed in this build environment. `PUBLIC_INSTANTDB_APP_ID` and
    `INSTANT_ADMIN_TOKEN` are unset and there is no `instant-cli` auth config
    (no `~/.config/instant*`), so `npx instant-cli push schema` /
    `npm run perms:push` (which require interactive `instant-cli login` as the
    app operator) and the live `e2e/permissions.spec.ts` run (3 skipped loudly
    without the admin token) are not runnable here. The fail-loud, idempotent
    push wrapper is committed and its missing-credentials failure path is unit-
    verified; pushing remains the documented operator step in BUILD.md. The rule
    delta in Task 2 lands so that when the operator runs the push, enforcement
    (including the closed injection hole) is correct. BUILD.md's "deferred"
    caveat is therefore retained, not removed.
  **Priority:** Critical
  **Files:** live Instant app (operator step), `e2e/permissions.spec.ts`,
    `docs/cycle/0003-feature-instantdb-permission-rules-student-email/BUILD.md`
  **Problem:** SPEC `## CONCRETE USER BENEFIT` promises "a student can no
    longer obtain a classmate's email address by any client query, and can
    no longer alter the lesson everyone is following … only the owning
    teacher can." SPEC `## Acceptance Criteria` requires "`instant.perms.ts`
    is committed and the rules are pushed to the live Instant app" and that
    the privacy/authorization scenarios hold "from a student-authenticated
    browser context." BUILD.md (lines 11, 25, 27) openly states the live
    `npx instant-cli push schema` + `npm run perms:push` step "could not be
    performed in this build environment" and is "deferred." Until the schema
    delta (`sessionResources.teacherId`, removed `participants.email`) and
    the perms are live, **zero enforcement exists** — every protection in
    this cycle is inert on the running app, and `e2e/permissions.spec.ts`
    has never executed against it (it skips loudly without
    `INSTANT_ADMIN_TOKEN`). The promised benefit cannot be realized in the
    current state.
  **Fix:**
    1. As the Instant app operator, run `npx instant-cli push schema` (so
       `sessionResources.teacherId` is accepted and `participants.email` is
       removed), then `npm run perms:push`. Both must exit 0.
    2. With `INSTANT_ADMIN_TOKEN` and `PUBLIC_INSTANTDB_APP_ID` set, run
       `npm run test:e2e` and confirm `e2e/permissions.spec.ts` runs (not
       skips) and passes — email-privacy denial, raw-write denial with
       unchanged state, owner realtime propagation, and cross-teacher denial
       all green against the live app.
    3. Update BUILD.md to record the push was executed and the live e2e
       passed (remove the "deferred" caveat).
  **Verify:** `npm run test:e2e -- e2e/permissions.spec.ts` reports the
    three permission tests as **passed** (0 skipped) with the env set; a
    manual student-context raw `db.queryOnce` for another user's row returns
    no email; a manual student raw `transact` on a foreign `sessions` row is
    rejected.

- [x] ### Task 2: Close the `sessionResources` create-time ownership hole
  **Status:** ✅ Fixed
  **What was done:** Took option (a). Added an InstantDB link
    `sessionResourceSession` (`src/lib/db.ts`) — forward `session` (has one) on
    `sessionResources`, reverse `resources` (has many) on `sessions` — so
    ownership is checkable against the REAL parent session. Rewrote the
    `sessionResources` rule (`src/lib/perms.ts`) to bind
    `isSessionOwner = "auth.id in data.ref('session.teacherId')"` and apply it to
    create/update/delete (replacing the self-asserted `auth.id == data.teacherId`
    bind), so a student can no longer pass the check by declaring their own id as
    `teacherId`; the linked session's real owner is what is compared. Updated the
    `perms.test.ts` structural guard to assert the bind uses
    `data.ref('session.teacherId')` and that no write op contains the bare
    `data.teacherId` self-assertion. The denormalized `teacherId` field is kept
    for queries (db.ts comment updated to note it is no longer the permission
    basis). `npm run test` → 50 passed; `astro check` → 0 errors/0 warnings.
  **Priority:** Critical
  **Files:** `src/lib/perms.ts`, `src/lib/db.ts`, `e2e/permissions.spec.ts`,
    `src/lib/perms.test.ts`
  **Problem:** SPEC Requirements (line 39) mandate "`sessionResources`
    create/update/delete MUST be allowed only when the requester **owns the
    parent session**." The implemented rule
    (`src/lib/perms.ts:61-67`) is `create: 'isOwner || isAdmin'` with
    `isOwner = auth.id == data.teacherId`, where `teacherId` is a
    client-supplied denormalized field on the new row (`src/lib/db.ts:66`)
    and `sessionResources` has **no link to `sessions`**. On *create* a
    student can write a row with `sessionId = <victim teacher's session>`
    and `teacherId = <their own auth id>`; the rule sees
    `auth.id == data.teacherId` (true) and admits it. The row then appears
    in every `sessionResources where sessionId == <victim session>` query —
    i.e. the student has injected a resource into another teacher's lesson,
    violating the SPEC MUST that "students MUST NOT … manage … the resource
    queue." (update/delete of pre-existing rows are safe because their
    `teacherId` was set by the legitimate owner; only create is exploitable.)
  **Fix:** Make ownership checkable against the *parent session*, not a
    self-asserted field. Either:
    (a) Add an InstantDB link from `sessionResources` to `sessions` in
        `src/lib/db.ts` and change the rule so create requires the linked
        session's `teacherId == auth.id` (e.g.
        `auth.id in data.ref('session.teacherId')`), or
    (b) If link traversal in CEL is not workable, restrict client
        `sessionResources` create to deny (`create: 'isAdmin'`) and route
        all resource creation through the server/admin SDK (`writeEvent`
        choke point run with admin), documenting that clients never create
        resource rows directly.
    Update the `perms.test.ts` structural guard to assert the create
    expression is no longer a bare self-asserted `data.teacherId` check.
  **Verify:** Add an `e2e/permissions.spec.ts` case: a signed-in student
    sets `targetSessionId = <teacher session>` and a probe path that writes
    `sessionResources` with `teacherId = <their own id>`; assert
    `probe-write-result` contains `error:` and that no row with that
    `sessionId` was created. `npm run test` passes with the tightened guard.

- [x] ### Task 3 (Missing test case): Test resource-injection vector in the probe and spec
  **Status:** ✅ Fixed
  **What was done:** Added an `injectResource()` probe + `probe-inject-resource`
    button (`src/components/PermsProbe.tsx`) that writes a `sessionResources` row
    with `teacherId = user.id` (the attacker's OWN id) linked to the victim's
    `targetSessionId` — the exact create-time vector Task 2 closed. Also set the
    `session` link on the existing `writeResource()` probe so it exercises the
    link-based rule path. Added a spec assertion (`e2e/permissions.spec.ts`) that
    `probe-inject-resource` surfaces `error:`. The runnable regression at the
    rule level is the tightened `perms.test.ts` guard (the live e2e assertion is
    gated/skipped without `INSTANT_ADMIN_TOKEN`, per Task 1).
  **Priority:** Minor
  **Files:** `src/components/PermsProbe.tsx:68-89`, `e2e/permissions.spec.ts:90-94`
  **Problem:** The probe's `writeResource` only ever writes
    `teacherId: targetTeacherId` (the victim teacher's id), which the rule
    correctly denies. It never exercises the dangerous vector — a resource
    whose `teacherId` is the *attacker's own* id pointed at the victim's
    `sessionId`. The current "resource denied" assertion
    (`e2e/permissions.spec.ts:91-94`) therefore gives false confidence that
    resource writes are locked down (see Task 2).
  **Fix:** After Task 2 is fixed, extend `PermsProbe.tsx` with a probe
    button (or query param) that writes a `sessionResources` row using
    `user.id` as `teacherId` and `targetSessionId` as the parent, and add a
    spec assertion that it is rejected with `error:`.
  **Verify:** `npm run test:e2e -- e2e/permissions.spec.ts` shows the new
    injection-denial assertion passing against the live app.

- [x] ### Task 4 (Observation / harden later): `participants` writes fully open to any authenticated user
  **Status:** ✅ Acknowledged (no action required this cycle)
  **What was done:** No code change — the task explicitly states this is out of
    this cycle's SPEC scope (no participant rows are written yet; join-via-link
    is a later cycle) and "No action required this cycle beyond noting it." It is
    recorded here as a Batch-2 follow-up: when the participant-creation cycle
    lands, tighten `participants` update/delete to the row owner
    (`auth.id == data.userId`) plus the owning teacher/admin, alongside the
    `$default` tightening already noted in PLAN.md.
  **Priority:** Minor
  **Files:** `src/lib/perms.ts:86-93`
  **Problem:** `participants` allows `update`/`delete` to any
    `auth.id != null`, so any signed-in student can mutate or delete another
    student's participant row (username, role, chatStatus). This is outside
    this cycle's SPEC scope (participant join-via-link is a later cycle and
    no rows are written yet), so it is not a release blocker — but it is a
    fail-open default worth recording as a follow-up so the join cycle does
    not inherit it silently.
  **Fix:** When the participant-creation cycle lands, tighten `update`/
    `delete` to the row's own `userId` (`auth.id == data.userId`) plus the
    owning teacher/admin. No action required this cycle beyond noting it.
  **Verify:** A future `participants` rule restricts update/delete to the
    row owner; tracked as a Batch-2 follow-up alongside the `$default`
    tightening already noted in PLAN.md.
