import { init as init$1, tx, id } from '@instantdb/admin';
import { i, init } from '@instantdb/react';

const IDENTITY_SCOPE = "identity";

function requireAppId(value) {
  if (value.trim() === "") {
    throw new Error(
      "PUBLIC_INSTANTDB_APP_ID is missing or empty — set it in .env (see .env.example)"
    );
  }
  return value;
}
const APP_ID = requireAppId("9199c9db-f464-4c8f-a692-088fa39139b9");
const schema = i.schema({
  entities: {
    users: i.entity({
      // `email` is private (SPEC §5) — kept optional at the storage layer.
      email: i.string().optional(),
      username: i.string(),
      // Global admin level, separate from per-session Participant.role (ADR-0003).
      // The NAMED domain value `'none' | 'uber'` (cycle 0019, src/lib/admin.ts);
      // the elevated `'uber'` is only ever written server-side via the admin SDK
      // (the tightened `users` rule forbids a client from writing it).
      // `normalizeAdminLevel` tolerates legacy numeric/absent values at READ time
      // (they degrade to `'none'`), so the field-type change needs no data
      // migration — just `npx instant-cli push schema`.
      adminLevel: i.string(),
      createdAt: i.number()
    }),
    sessions: i.entity({
      title: i.string(),
      status: i.string(),
      teacherId: i.string(),
      joinCode: i.string().unique(),
      joinSlug: i.string().optional(),
      createdAt: i.number(),
      startedAt: i.number().optional(),
      endedAt: i.number().optional(),
      activeResourceId: i.string().optional(),
      // Cycle 0016: derived URL of the active resource, set alongside
      // `activeResourceId` by the `ResourceActivated` dual-write so the shared
      // ResourcePane can render from the single session row (no resources query
      // needed in the student view). Additive — requires `instant-cli push schema`.
      currentUrl: i.string().optional(),
      // Cycle 0017: a fresh per-broadcast token minted on every URL broadcast
      // (and on activation) by the `ResourceUrlChanged`/`ResourceActivated`
      // dual-write. It is the value `ResourcePane` keys its iframe on, so a new
      // token forces a remount — re-snapping students who navigated locally,
      // even when the broadcast URL equals the URL they wandered from. Additive
      // — requires `instant-cli push schema`; inherits the owner-only rule.
      currentUrlVersion: i.string().optional(),
      interactionMode: i.string()
    }),
    sessionResources: i.entity({
      sessionId: i.string().indexed(),
      // Denormalized owner = parent session's teacher (auth id). Mirrors
      // `sessions.teacherId` and stays useful for queries, BUT it is NOT the
      // basis of the write-permission rule: a client supplies this field on
      // create, so trusting it admitted resource-injection (a student could set
      // `teacherId` to their own id and `sessionId` to a victim's session). The
      // permission rule instead checks ownership against the LINKED parent
      // session (`data.ref('session.teacherId')`, see perms.ts + the `session`
      // link below), which the client cannot forge. Resource creators MUST set
      // both this field and the `session` link to the parent session.
      teacherId: i.string().indexed(),
      url: i.string(),
      title: i.string(),
      type: i.string(),
      sortOrder: i.number(),
      embedMode: i.string(),
      embedStatus: i.string(),
      createdAt: i.number(),
      activatedAt: i.number().optional()
    }),
    participants: i.entity({
      sessionId: i.string().indexed(),
      userId: i.string(),
      role: i.string(),
      username: i.string(),
      // NOTE: no `email` field. The canonical private email lives ONLY on the
      // own-row-locked `users` namespace (cycle 0003). InstantDB view rules are
      // row-level, not column-level, so a participant row that other students
      // can read MUST carry no email at all — privacy is structural (SPEC §16.1).
      joinedAt: i.number(),
      lastSeenAt: i.number(),
      chatStatus: i.string()
    }),
    // §7.2 event envelope — the append-only interaction log.
    sessionEvents: i.entity({
      sessionId: i.string().indexed(),
      type: i.string(),
      schemaVersion: i.number(),
      // string | null — modeled as optional and omitted when null.
      actorId: i.string().optional(),
      actorRole: i.string(),
      occurredAt: i.number().indexed(),
      receivedAt: i.number(),
      correlationId: i.string().optional(),
      payload: i.json()
    }),
    messages: i.entity({
      sessionId: i.string().indexed(),
      participantId: i.string(),
      // Cycle 0008: the client-minted action id that de-dups a double-submit. The
      // `messages` row id IS this value (deterministic keyed upsert), so a repeated
      // logical submit collapses to one row. Indexed so the per-action-id probe is
      // server-queryable.
      clientActionId: i.string().indexed(),
      text: i.string(),
      visibility: i.string(),
      classificationStatus: i.string(),
      createdAt: i.number()
    }),
    questions: i.entity({
      sessionId: i.string().indexed(),
      status: i.string(),
      activeResourceIdAtSubmission: i.string().optional(),
      addressedBy: i.string().optional(),
      answerSummary: i.string().optional(),
      createdAt: i.number()
    }),
    endorsements: i.entity({
      sessionId: i.string().indexed(),
      questionId: i.string().indexed(),
      // anonymous — no actor stored on the projection row (CONTEXT.md).
      createdAt: i.number()
    })
  },
  links: {
    // Cycle 0003: make `sessionResources` ownership checkable against the REAL
    // parent session (not a client-supplied field) so the create/update/delete
    // permission rule can require `auth.id in data.ref('session.teacherId')`.
    // The forward `session` label is what that rule traverses; the reverse
    // `resources` label lets a session enumerate its resource rows.
    sessionResourceSession: {
      forward: { on: "sessionResources", has: "one", label: "session" },
      reverse: { on: "sessions", has: "many", label: "resources" }
    },
    // Cycle 0007: make `participants` ownership checkable against the REAL parent
    // session (not a client-supplied field) so the tightened create/update/delete
    // rule can require `auth.id in data.ref('session.teacherId')` for the owning
    // teacher — exactly mirroring `sessionResourceSession`. The join write sets
    // the forward `session` link; the reverse `participants` label lets a session
    // enumerate its participant rows (used by the presence/status view).
    participantSession: {
      forward: { on: "participants", has: "one", label: "session" },
      reverse: { on: "sessions", has: "many", label: "participants" }
    },
    // Cycle 0008: link each `messages` row to its parent session (mirroring
    // `participantSession`) so a session can enumerate its message rows and a
    // future tightened `messages` rule can traverse `data.ref('session.teacherId')`.
    // The chat submit sets the forward `session` link; the reverse `messages`
    // label lets a session enumerate its message rows.
    messageSession: {
      forward: { on: "messages", has: "one", label: "session" },
      reverse: { on: "sessions", has: "many", label: "messages" }
    },
    // Cycle 0009: a `questions` row is promoted from a single student `messages`
    // row (the trailing-`?` heuristic in `classifyMessage`). These three links
    // mirror `messageSession` (forward `one` / reverse `many`) so a Question
    // points back to its source message, its author participant, and its session,
    // and each of those can enumerate its questions. The links carry the
    // relationship structurally — the `questions` row stores no participant id or
    // email column, keeping privacy structural (SPEC §16.1).
    questionMessage: {
      forward: { on: "questions", has: "one", label: "message" },
      reverse: { on: "messages", has: "many", label: "questions" }
    },
    questionParticipant: {
      forward: { on: "questions", has: "one", label: "participant" },
      reverse: { on: "participants", has: "many", label: "questions" }
    },
    // Cycle 0014: link each `messages` row to its AUTHOR participant (mirroring
    // `questionParticipant`) so the tightened `messages` rule can traverse the
    // REAL author — `data.ref('participant.userId')` for the author check and
    // `data.ref('participant.id')` for the anti-spoof scalar↔link coupling —
    // instead of trusting the client-supplied `participantId` scalar. The chat
    // submit sets the forward `participant` link; the reverse `messages` label
    // lets a participant enumerate its authored messages.
    messageParticipant: {
      forward: { on: "messages", has: "one", label: "participant" },
      reverse: { on: "participants", has: "many", label: "messages" }
    },
    questionSession: {
      forward: { on: "questions", has: "one", label: "session" },
      reverse: { on: "sessions", has: "many", label: "questions" }
    }
  }
});
init({ appId: APP_ID, schema });
function buildEventEnvelope(type, meta, now) {
  return {
    sessionId: meta.sessionId,
    type,
    schemaVersion: meta.schemaVersion ?? 1,
    actorId: meta.actor.id ?? void 0,
    actorRole: meta.actor.role,
    occurredAt: meta.occurredAt ?? now,
    receivedAt: meta.receivedAt ?? now,
    ...meta.correlationId ? { correlationId: meta.correlationId } : {},
    payload: meta.payload ?? {}
  };
}

Uint8Array.from([
  113,
  117,
  101,
  115,
  116,
  105,
  14,
  110,
  49,
  100,
  110,
  115,
  48,
  48,
  48,
  57
]);

const ADMIN_LEVEL_NONE = "none";
const ADMIN_LEVEL_UBER = "uber";
function normalizeAdminLevel(raw) {
  return raw === ADMIN_LEVEL_UBER ? ADMIN_LEVEL_UBER : ADMIN_LEVEL_NONE;
}
function parseAdminEmails(raw) {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw.split(/[,\s]+/).map((e) => e.trim().toLowerCase()).filter((e) => e !== "")
    )
  );
}
function isEmailAllowlisted(email, allowlist) {
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}
function decideBootstrap(input) {
  const current = normalizeAdminLevel(input.currentLevel);
  if (current === ADMIN_LEVEL_UBER) return { elevate: false, adminLevel: ADMIN_LEVEL_UBER };
  if (!isEmailAllowlisted(input.verifiedEmail, input.allowlist)) {
    return { elevate: false, adminLevel: ADMIN_LEVEL_NONE };
  }
  return { elevate: true, adminLevel: ADMIN_LEVEL_UBER };
}

const ADMIN_BOOTSTRAPPED = "AdminBootstrapped";
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json" }
});
const POST = async ({ request }) => {
  const appId = process.env.PUBLIC_INSTANTDB_APP_ID;
  const adminToken = process.env.INSTANT_ADMIN_TOKEN;
  if (!appId || !adminToken) {
    console.error(
      "[api/admin/bootstrap] admin SDK unavailable: INSTANT_ADMIN_TOKEN / PUBLIC_INSTANTDB_APP_ID unset"
    );
    return json(500, { error: "admin-unavailable" });
  }
  const admin = init$1({ appId, adminToken });
  const { token } = await request.json().catch(() => ({}));
  let user = null;
  try {
    user = await admin.auth.verifyToken(token);
  } catch (err) {
    console.error("[api/admin/bootstrap] token verify failed:", err);
    return json(401, { error: "unauthorized" });
  }
  if (!user?.id) {
    console.error("[api/admin/bootstrap] token verified but carried no user id");
    return json(401, { error: "unauthorized" });
  }
  const allowlist = parseAdminEmails(process.env.ADMIN_EMAILS);
  let current;
  try {
    const result = await admin.query({
      users: { $: { where: { id: user.id } } }
    });
    current = result.users?.[0]?.adminLevel;
  } catch (err) {
    console.error("[api/admin/bootstrap] current-level query failed:", err);
    return json(500, { error: "query-failed" });
  }
  const decision = decideBootstrap({
    verifiedEmail: user.email,
    allowlist,
    currentLevel: current
  });
  if (!decision.elevate) return json(200, { adminLevel: decision.adminLevel });
  try {
    const envelope = buildEventEnvelope(
      ADMIN_BOOTSTRAPPED,
      {
        sessionId: IDENTITY_SCOPE,
        actor: { id: user.id, role: "system" },
        // No email in the payload — privacy (the verified user id is enough).
        payload: { userId: user.id, adminLevel: ADMIN_LEVEL_UBER }
      },
      Date.now()
    );
    await admin.transact([
      tx.sessionEvents[id()].update(envelope),
      tx.users[user.id].update({ adminLevel: ADMIN_LEVEL_UBER })
    ]);
  } catch (err) {
    console.error("[api/admin/bootstrap] elevation transact failed:", err);
    return json(500, { error: "elevation-failed" });
  }
  return json(200, { adminLevel: ADMIN_LEVEL_UBER });
};

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  POST
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
