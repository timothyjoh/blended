// ---------------------------------------------------------------------------
// SINGLE source of the InstantDB permission rules (cycle 0003). Pushed to the
// live Instant app via `npm run perms:push` (scripts/push-perms.mjs →
// `instant-cli push perms`, which loads the root `instant.perms.ts` adapter that
// re-exports this object). These rules move two SPEC-mandated invariants from UI
// convention into the data layer, so they hold even against a hand-crafted
// client: (1) student email privacy and (2) session-state write authorization.
//
// Reads stay open where students MUST follow the lesson (`sessions`,
// `sessionResources`); writes are owner-only. System/admin actions run through
// `@instantdb/admin`, which BYPASSES these rules entirely — so no admin clause
// is needed today; the future *client-side* admin slot is reserved by the
// `isAdmin` bind evaluating to `"false"` (ADR-0003 `User.adminLevel`).
//
// The type annotation is intentionally omitted: `InstantRules<…>` marks every
// entity block optional, which makes the structural guard test (perms.test.ts)
// fight the type system to read `rules.users.allow.view`. Keeping the literal
// inferred type gives the guard precise, non-optional access. `astro check`
// confirms the object is well-formed; the structural test locks the semantics.
// ---------------------------------------------------------------------------
const rules = {
  // Permissive default preserves today's behavior for `todos` (demo, must stay
  // open) and the Batch-2 namespaces (`messages`/`questions`/`endorsements`),
  // whose real read-visibility policy is explicitly out of scope this cycle.
  // Tightening this default is a documented Batch-2 follow-up.
  $default: { allow: { $default: 'true' } },

  users: {
    // Row-level: a user can only ever see/create/update their OWN row, so no
    // client can read another user's `email` (the canonical private email lives
    // ONLY here). The `users` row id IS the auth id, so first-sign-in creation
    // (`db.tx.users[authUserId].update(...)`) satisfies `data.id == auth.id` and
    // remains permitted. No user row is ever deletable by a client.
    allow: {
      view: 'auth.id == data.id',
      create: 'auth.id == data.id',
      update: 'auth.id == data.id',
      delete: 'false',
    },
  },

  sessions: {
    // `isOwner` = the requester owns this session. `isAdmin` reserves the future
    // client-admin slot (ADR-0003 `User.adminLevel`); it evaluates false today —
    // server/admin writes use the admin SDK, which bypasses rules. Reads are open
    // so every joined student can follow the lesson; only the owner may mutate
    // session state (incl. the `activeResourceId` projection, and the later
    // `currentUrl` field which inherits this same owner-only policy).
    bind: ['isOwner', 'auth.id == data.teacherId', 'isAdmin', 'false'],
    allow: {
      view: 'true',
      create: 'isOwner || isAdmin',
      update: 'isOwner || isAdmin',
      delete: 'isOwner || isAdmin',
    },
  },

  sessionResources: {
    // Ownership is checked against the REAL parent session via the `session`
    // link (db.ts), NOT the denormalized `teacherId` field. `teacherId` is
    // client-supplied on create, so a bare `auth.id == data.teacherId` check
    // admitted resource-injection: a student could create a row with
    // `teacherId = <their own id>` and `sessionId = <victim teacher's session>`
    // and pass the check, injecting a resource into another teacher's lesson.
    // `data.ref('session.teacherId')` returns the linked parent session's owner,
    // which the client cannot forge — so create/update/delete are admitted only
    // when the requester actually owns the parent session (SPEC line 39). Reads
    // stay open so every joined student follows the lesson. `isAdmin` reserves
    // the future client-admin slot (false today; the admin SDK bypasses rules).
    bind: ['isSessionOwner', "auth.id in data.ref('session.teacherId')", 'isAdmin', 'false'],
    allow: {
      view: 'true',
      create: 'isSessionOwner || isAdmin',
      update: 'isSessionOwner || isAdmin',
      delete: 'isSessionOwner || isAdmin',
    },
  },

  // Append-only by any AUTHENTICATED participant — keeps `writeEvent()` legal
  // for legitimate student actions (messages, questions) AND for first-sign-in
  // `users`-row creation under `IDENTITY_SCOPE`. No client update/delete: events
  // are immutable once appended (SPEC §7.2).
  sessionEvents: {
    allow: {
      view: 'true',
      create: 'auth.id != null',
      update: 'false',
      delete: 'false',
    },
  },

  // Owner-scoped (cycle 0007), closing the fail-open hole flagged in AGENTS.md
  // BEFORE any participant row exists. Mirrors `sessionResources`: `isOwnRow`
  // admits a user managing their OWN row (`auth.id == data.userId`, which is what
  // a legitimate self-join sets); `isSessionOwner` admits the owning teacher,
  // checked against the LINKED parent session's `teacherId` (forgery-proof — the
  // client cannot fake the link traversal); `isAdmin` reserves the future
  // client-admin slot (false today; the admin SDK bypasses rules). A signed-in
  // user can no longer create/update/delete a participant row they don't own.
  // Reads stay open so presence/roster is visible. Rows carry NO email by design
  // (privacy is structural — the field does not exist on the entity; see db.ts).
  participants: {
    bind: [
      'isOwnRow', 'auth.id == data.userId',
      'isSessionOwner', "auth.id in data.ref('session.teacherId')",
      'isAdmin', 'false',
    ],
    allow: {
      view: 'true',
      create: 'isOwnRow || isSessionOwner || isAdmin',
      update: 'isOwnRow || isSessionOwner || isAdmin',
      delete: 'isOwnRow || isSessionOwner || isAdmin',
    },
  },
}

export default rules
