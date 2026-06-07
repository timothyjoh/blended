import { id, i, init, type InstaQLEntity, type TransactionChunk } from '@instantdb/react'

// ---------------------------------------------------------------------------
// Blended data spine — the SINGLE source of the InstantDB schema and client.
//
// Per ADR-0001 and ADR-0003 this module is the only place that initializes the
// InstantDB client and defines the Blended schema. ALL product mutations MUST
// route through `writeEvent()` so that every interaction becomes a replayable
// `sessionEvents` row written atomically with its projection update(s). No
// product code path may write a Blended projection row except via `writeEvent`.
// ---------------------------------------------------------------------------

/**
 * Validate the InstantDB app id at module-init time. Throws (rather than
 * initializing a silently-broken client) when the env var is missing or empty.
 */
export function requireAppId(value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      'PUBLIC_INSTANTDB_APP_ID is missing or empty — set it in .env (see .env.example)'
    )
  }
  return value
}

const APP_ID = requireAppId(import.meta.env.PUBLIC_INSTANTDB_APP_ID)

/** Closed set of event actor roles (SPEC §7.2). */
export const ACTOR_ROLES = ['teacher', 'student', 'ai', 'system', 'unknown'] as const
export type ActorRole = (typeof ACTOR_ROLES)[number]

// ---------------------------------------------------------------------------
// Schema — the eight MVP Blended entities (SPEC §5 + §7.2 envelope).
// Enums are expressed as `i.string<Union>()` for type-level constraint; hard
// runtime constraints the SPEC demands (actorRole, integer schemaVersion) are
// enforced in `writeEvent()` before any transaction is issued.
// ---------------------------------------------------------------------------
export const schema = i.schema({
  entities: {
    users: i.entity({
      // `email` is private (SPEC §5) — kept optional at the storage layer.
      email: i.string().optional(),
      username: i.string(),
      // Global admin level, separate from per-session Participant.role (ADR-0003).
      adminLevel: i.number(),
      createdAt: i.number(),
    }),
    sessions: i.entity({
      title: i.string(),
      status: i.string<'draft' | 'live' | 'ended' | 'archived'>(),
      teacherId: i.string(),
      joinCode: i.string().unique(),
      joinSlug: i.string().optional(),
      createdAt: i.number(),
      startedAt: i.number().optional(),
      endedAt: i.number().optional(),
      activeResourceId: i.string().optional(),
      interactionMode: i.string<'none' | 'cursor_vote'>(),
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
      activatedAt: i.number().optional(),
    }),
    participants: i.entity({
      sessionId: i.string().indexed(),
      userId: i.string(),
      role: i.string<'teacher' | 'student' | 'assistant' | 'ai'>(),
      username: i.string(),
      // NOTE: no `email` field. The canonical private email lives ONLY on the
      // own-row-locked `users` namespace (cycle 0003). InstantDB view rules are
      // row-level, not column-level, so a participant row that other students
      // can read MUST carry no email at all — privacy is structural (SPEC §16.1).
      joinedAt: i.number(),
      lastSeenAt: i.number(),
      chatStatus: i.string(),
    }),
    // §7.2 event envelope — the append-only interaction log.
    sessionEvents: i.entity({
      sessionId: i.string().indexed(),
      type: i.string(),
      schemaVersion: i.number(),
      // string | null — modeled as optional and omitted when null.
      actorId: i.string().optional(),
      actorRole: i.string<ActorRole>(),
      occurredAt: i.number().indexed(),
      receivedAt: i.number(),
      correlationId: i.string().optional(),
      payload: i.json<Record<string, unknown>>(),
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
      createdAt: i.number(),
    }),
    questions: i.entity({
      sessionId: i.string().indexed(),
      status: i.string(),
      activeResourceIdAtSubmission: i.string().optional(),
      addressedBy: i.string().optional(),
      answerSummary: i.string().optional(),
      createdAt: i.number(),
    }),
    endorsements: i.entity({
      sessionId: i.string().indexed(),
      questionId: i.string().indexed(),
      // anonymous — no actor stored on the projection row (CONTEXT.md).
      createdAt: i.number(),
    }),
  },
  links: {
    // Cycle 0003: make `sessionResources` ownership checkable against the REAL
    // parent session (not a client-supplied field) so the create/update/delete
    // permission rule can require `auth.id in data.ref('session.teacherId')`.
    // The forward `session` label is what that rule traverses; the reverse
    // `resources` label lets a session enumerate its resource rows.
    sessionResourceSession: {
      forward: { on: 'sessionResources', has: 'one', label: 'session' },
      reverse: { on: 'sessions', has: 'many', label: 'resources' },
    },
    // Cycle 0007: make `participants` ownership checkable against the REAL parent
    // session (not a client-supplied field) so the tightened create/update/delete
    // rule can require `auth.id in data.ref('session.teacherId')` for the owning
    // teacher — exactly mirroring `sessionResourceSession`. The join write sets
    // the forward `session` link; the reverse `participants` label lets a session
    // enumerate its participant rows (used by the presence/status view).
    participantSession: {
      forward: { on: 'participants', has: 'one', label: 'session' },
      reverse: { on: 'sessions', has: 'many', label: 'participants' },
    },
    // Cycle 0008: link each `messages` row to its parent session (mirroring
    // `participantSession`) so a session can enumerate its message rows and a
    // future tightened `messages` rule can traverse `data.ref('session.teacherId')`.
    // The chat submit sets the forward `session` link; the reverse `messages`
    // label lets a session enumerate its message rows.
    messageSession: {
      forward: { on: 'messages', has: 'one', label: 'session' },
      reverse: { on: 'sessions', has: 'many', label: 'messages' },
    },
  },
})

export const db = init({ appId: APP_ID, schema })

// Re-export `id` so callers can build projection transactions without a second
// import of `@instantdb/react`.
export { id }

// Schema-derived entity types (SPEC requires exported InstaQLEntity types).
export type User = InstaQLEntity<typeof schema, 'users'>
export type Session = InstaQLEntity<typeof schema, 'sessions'>
export type SessionResource = InstaQLEntity<typeof schema, 'sessionResources'>
export type Participant = InstaQLEntity<typeof schema, 'participants'>
export type SessionEvent = InstaQLEntity<typeof schema, 'sessionEvents'>
export type Message = InstaQLEntity<typeof schema, 'messages'>
export type Question = InstaQLEntity<typeof schema, 'questions'>
export type Endorsement = InstaQLEntity<typeof schema, 'endorsements'>

// ---------------------------------------------------------------------------
// applyEvent / fold (SPEC §17.1) — pure, in-memory reconstruction of a session
// projection from an ordered event list, so the log stays the source of truth.
// ---------------------------------------------------------------------------

/** Minimal structural shape an event needs to be folded. */
export type EventLike = {
  id: string
  type: string
  occurredAt: number
  receivedAt: number
  payload: Record<string, unknown>
}

export type SessionProjection = {
  sessionId: string
  session: { id: string; title: string; status: string; teacherId: string } | null
  participants: Record<string, { id: string; userId: string; role: string; username: string }>
  messages: Record<string, { id: string; participantId: string; text: string; createdAt: number }>
}

/** Raised when `applyEvent` meets a type it does not know — never silently dropped. */
export class UnknownEventTypeError extends Error {
  constructor(type: string) {
    super(`Unknown event type: ${type}`)
    this.name = 'UnknownEventTypeError'
  }
}

export function emptyProjection(sessionId: string): SessionProjection {
  return { sessionId, session: null, participants: {}, messages: {} }
}

/**
 * Total order over events (SPEC §17.1): occurredAt, then receivedAt, then id.
 * Stable and deterministic so an out-of-order list folds to the same result.
 */
export function compareEvents(a: EventLike, b: EventLike): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt - b.occurredAt
  if (a.receivedAt !== b.receivedAt) return a.receivedAt - b.receivedAt
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/**
 * Fold a single event into a projection. Returns a new projection (pure).
 * Throws `UnknownEventTypeError` for an unrecognized type so log/projection
 * divergence is loud and detectable.
 */
export function applyEvent(projection: SessionProjection, event: EventLike): SessionProjection {
  switch (event.type) {
    case 'SessionCreated': {
      const p = event.payload as { id?: string; title?: string; teacherId?: string }
      return {
        ...projection,
        session: {
          id: p.id ?? projection.sessionId,
          title: typeof p.title === 'string' ? p.title : '',
          status: 'draft',
          teacherId: typeof p.teacherId === 'string' ? p.teacherId : '',
        },
      }
    }
    // Lifecycle fold cases (cycle 0006). Mirror `SessionCreated`'s defensive,
    // no-mutation style: update only `status`, and tolerate an absent prior
    // session (out-of-order / partial logs) by building a minimal session from
    // the payload rather than throwing a spurious `UnknownEventTypeError`.
    case 'SessionStarted': {
      const p = event.payload as { id?: string }
      const prev = projection.session
      return {
        ...projection,
        session: prev
          ? { ...prev, status: 'live' }
          : { id: p.id ?? projection.sessionId, title: '', status: 'live', teacherId: '' },
      }
    }
    case 'SessionEnded': {
      const p = event.payload as { id?: string }
      const prev = projection.session
      return {
        ...projection,
        session: prev
          ? { ...prev, status: 'ended' }
          : { id: p.id ?? projection.sessionId, title: '', status: 'ended', teacherId: '' },
      }
    }
    case 'ParticipantJoined': {
      const p = event.payload as {
        participantId?: string
        userId?: string
        role?: string
        username?: string
      }
      const participantId = p.participantId ?? event.id
      return {
        ...projection,
        participants: {
          ...projection.participants,
          [participantId]: {
            id: participantId,
            userId: typeof p.userId === 'string' ? p.userId : '',
            role: typeof p.role === 'string' ? p.role : 'student',
            username: typeof p.username === 'string' ? p.username : '',
          },
        },
      }
    }
    case 'ChatMessageSubmitted': {
      // Cycle 0008: fold a student chat message into the `messages` map, keyed by
      // the deterministic message id (=== the client action id). Mirrors
      // `ParticipantJoined`: tolerant of absent prior state + partial payload
      // (defensive defaults) so an out-of-order/partial log folds without a
      // spurious throw, and re-folding the same event reproduces the same entry.
      const p = event.payload as {
        messageId?: string
        participantId?: string
        text?: string
        createdAt?: number
      }
      const messageId = p.messageId ?? event.id
      return {
        ...projection,
        messages: {
          ...projection.messages,
          [messageId]: {
            id: messageId,
            participantId: typeof p.participantId === 'string' ? p.participantId : '',
            text: typeof p.text === 'string' ? p.text : '',
            createdAt: typeof p.createdAt === 'number' ? p.createdAt : event.occurredAt,
          },
        },
      }
    }
    default:
      // Identity-scope events (e.g. `UserSignedIn`, written under the
      // `IDENTITY_SCOPE` sentinel by `useAuth`) are intentionally NOT folded
      // here — they belong to no real session, so they never reach this fold.
      // Reaching the default with one means a genuine log/projection divergence.
      throw new UnknownEventTypeError(event.type)
  }
}

/**
 * Rebuild a session projection from an unordered event list. Sorts into the
 * §17.1 total order, then folds. Deterministic regardless of input order.
 */
export function rebuildSessionProjection(
  sessionId: string,
  events: EventLike[]
): SessionProjection {
  const ordered = [...events].sort(compareEvents)
  return ordered.reduce(applyEvent, emptyProjection(sessionId))
}

// ---------------------------------------------------------------------------
// writeEvent — the dual-write choke point (ADR-0001).
// ---------------------------------------------------------------------------

export type WriteEventMeta = {
  sessionId: string
  actor: { id: string | null; role: ActorRole }
  payload: Record<string, unknown>
  correlationId?: string
  schemaVersion?: number
  occurredAt?: number
  receivedAt?: number
}

/** Projection transactions are caller-supplied `db.tx.<entity>[id].update(...)` chunks. */
export type ProjectionTxn = TransactionChunk<any, any>

/**
 * Append a §7.2 `SessionEvent` envelope AND apply the caller's projection
 * update(s) in a SINGLE `db.transact()` so they land atomically (ADR-0001).
 *
 * This is the only sanctioned place to write a Blended projection row. The
 * signature requires both the event metadata and a non-empty `projectionTxns`
 * array so projection-only writes are never the easy default.
 *
 * Stamps `id`, `occurredAt`, `receivedAt`, and `schemaVersion` when not
 * supplied. Validates all input BEFORE issuing the transaction — on invalid
 * input it throws synchronously and writes nothing. Because the append and the
 * projection share one transaction, a rejected transaction fails atomically
 * (no half-applied dual-write) and the rejection propagates to the caller; it
 * is never swallowed.
 *
 * Not idempotent by design (each call appends a fresh event); dedup is deferred
 * (SPEC §17.2). Atomicity makes a caller retry safe — a rejected call leaves no
 * partial state.
 *
 * @returns the `db.transact()` promise (resolves on commit, rejects on failure).
 */
export function writeEvent(
  type: string,
  meta: WriteEventMeta,
  projectionTxns: ProjectionTxn[]
): Promise<unknown> {
  if (!type) throw new Error('writeEvent: `type` is required')
  if (!meta || !meta.sessionId) throw new Error('writeEvent: `sessionId` is required')
  if (!meta.actor || meta.actor.role === undefined) {
    throw new Error('writeEvent: `actor` with a role is required')
  }
  if (!ACTOR_ROLES.includes(meta.actor.role)) {
    throw new Error(`writeEvent: invalid actor.role "${meta.actor.role}"`)
  }
  const schemaVersion = meta.schemaVersion ?? 1
  if (!Number.isInteger(schemaVersion)) {
    throw new Error('writeEvent: `schemaVersion` must be an integer')
  }
  if (!Array.isArray(projectionTxns) || projectionTxns.length === 0) {
    throw new Error(
      'writeEvent: `projectionTxns` must be a non-empty array — projection-only writes are not allowed'
    )
  }

  const now = Date.now()
  const eventTx = db.tx.sessionEvents[id()].update({
    sessionId: meta.sessionId,
    type,
    schemaVersion,
    actorId: meta.actor.id ?? undefined,
    actorRole: meta.actor.role,
    occurredAt: meta.occurredAt ?? now,
    receivedAt: meta.receivedAt ?? now,
    ...(meta.correlationId ? { correlationId: meta.correlationId } : {}),
    payload: meta.payload ?? {},
  })

  // Single transaction: event append + projection update(s) commit together.
  return db.transact([eventTx, ...projectionTxns])
}
