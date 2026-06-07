import { db, id, writeEvent, type ActorRole, type ProjectionTxn, type WriteEventMeta } from './db'
import { classifyMessage, deriveQuestionId } from './classify'

// ---------------------------------------------------------------------------
// Session creation action (cycle 0005). Mirrors the pure-core pattern of
// `src/lib/auth.ts`: all deterministic logic (`generateJoinCode`,
// `buildSessionCreate`) is db-free and dependency-injectable so it unit-tests
// without a network, and the only impure step is the thin `createSession`
// wrapper that routes the dual-write through `writeEvent('SessionCreated', …)`.
// Creating a session is what makes the signed-in user its teacher — a
// session-scoped role, not an account type (SPEC).
// ---------------------------------------------------------------------------

/**
 * Unambiguous charset (digits 2–9 + A–Z minus the confusable 0,1,I,L,O) and a
 * pinned length for MVP-unguessable bearer join codes (SPEC §16.2 — ~49 bits of
 * entropy over 31^10, sufficient for an MVP bearer token).
 */
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const JOIN_CODE_LENGTH = 10

/**
 * Injectable CSPRNG source. Production defaults to the platform CSPRNG
 * (`crypto.getRandomValues`) so the core stays pure (deterministic) under an
 * injected source for unit tests. If `crypto` were unavailable it throws (loud),
 * never returns a weak or empty code.
 */
export type RandomBytes = (length: number) => Uint8Array
const defaultRandomBytes: RandomBytes = (length) => {
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  return buf
}

/** Pure, unguessable join-code generator. Deterministic given an injected RNG. */
export function generateJoinCode(randomBytes: RandomBytes = defaultRandomBytes): string {
  const bytes = randomBytes(JOIN_CODE_LENGTH)
  let code = ''
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[bytes[i] % JOIN_CODE_ALPHABET.length]
  }
  return code
}

/** The `sessions` projection row this cycle writes — always a fresh `draft`. */
export type SessionRecord = {
  id: string
  title: string
  status: 'draft'
  teacherId: string
  joinCode: string
  createdAt: number
  interactionMode: 'none'
}

export type BuildSessionCreateInput = {
  title: string
  teacherId: string | null | undefined
  // Injectable for deterministic tests; production uses the defaults.
  sessionId?: string
  joinCode?: string
  now?: number
}

export type SessionCreatePlan = { record: SessionRecord; meta: WriteEventMeta }

/**
 * Pure builder: totally validates input and produces the projection record +
 * the `SessionCreated` envelope meta. Throws BEFORE producing any plan on bad
 * input (mirrors `writeEvent`'s validate-before-act and `isValidEmail`'s
 * totality) — empty/whitespace title and a missing `teacherId` are rejected, so
 * nothing is ever written for an invalid create. The title is trimmed before
 * storage; `sessionId === payload.id` so it folds cleanly through the existing
 * `applyEvent` `SessionCreated` case.
 */
export function buildSessionCreate(input: BuildSessionCreateInput): SessionCreatePlan {
  const title = (input.title ?? '').trim()
  if (title === '') throw new Error('createSession: a session title is required')
  const teacherId = input.teacherId
  if (!teacherId) throw new Error('createSession: must be signed in to create a session')

  const sessionId = input.sessionId ?? id()
  const record: SessionRecord = {
    id: sessionId,
    title,
    status: 'draft',
    teacherId,
    joinCode: input.joinCode ?? generateJoinCode(),
    createdAt: input.now ?? Date.now(),
    interactionMode: 'none',
  }
  const meta: WriteEventMeta = {
    sessionId,
    actor: { id: teacherId, role: 'teacher' },
    payload: { id: sessionId, title, teacherId },
  }
  return { record, meta }
}

export type CreateSessionInput = { title: string; teacherId: string | null | undefined }
export type CreateSessionDeps = {
  write?: typeof writeEvent
  buildTxn?: (record: SessionRecord) => ProjectionTxn
}

const defaultBuildTxn = (r: SessionRecord): ProjectionTxn =>
  db.tx.sessions[r.id].update({
    title: r.title,
    status: r.status,
    teacherId: r.teacherId,
    joinCode: r.joinCode,
    createdAt: r.createdAt,
    interactionMode: r.interactionMode,
  })

/**
 * Thin wrapper: builds the plan (sync-throws on bad input, writing nothing),
 * then dual-writes the `SessionCreated` envelope + `sessions` projection in ONE
 * `writeEvent` transaction. Because the append and projection share that
 * transaction, a rejected create leaves no partial state (no orphan event, no
 * orphan session). NOT idempotent by design — each call mints a fresh
 * `sessionId`/`joinCode`; a retry simply creates a new session. The rejection
 * propagates to the caller and is never swallowed. `deps` are injectable so the
 * validation and rejection paths are unit-testable without a network.
 */
export async function createSession(
  input: CreateSessionInput,
  deps: CreateSessionDeps = {}
): Promise<SessionRecord> {
  const plan = buildSessionCreate(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultBuildTxn
  await write('SessionCreated', plan.meta, [buildTxn(plan.record)])
  return plan.record
}

// ---------------------------------------------------------------------------
// Session lifecycle state machine (cycle 0006). Mirrors the create pure-core
// split above: a single legal-transition table is the source of SPEC §6.2 truth,
// pure builders (`buildSessionStart`/`buildSessionEnd`) totally validate the
// transition AND owner identity AND a present sessionId and throw BEFORE
// producing any plan, and thin async wrappers (`startSession`/`endSession`) route
// the dual-write through `writeEvent`. `isJoinEnabled` is the sole, pure join
// gate. A `draft` session is a dead end until started; starting opens the join
// gate (true only while `live`), ending closes live participation.
// ---------------------------------------------------------------------------

export type SessionStatus = 'draft' | 'live' | 'ended' | 'archived'

/**
 * SPEC §6.2 — the ONLY transitions this cycle permits. Single source of truth:
 * `draft → live` (start) and `live → ended` (end). `archived` and every other
 * transition are deliberately absent (deferred), so they are rejected.
 */
const LEGAL_TRANSITIONS: Record<string, SessionStatus[]> = {
  draft: ['live'],
  live: ['ended'],
}

/**
 * Throws on any transition not in the §6.2 table — including an unknown or
 * missing `from` status. Total over hostile input: a `null`/`undefined`/unknown
 * `from` has no allowed targets, so it always throws (never silently permits).
 */
export function assertLegalTransition(
  from: string | null | undefined,
  to: SessionStatus
): void {
  const allowed = from ? LEGAL_TRANSITIONS[from] : undefined
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Illegal session transition: ${from ?? '(none)'} → ${to}`)
  }
}

/** Minimal session-like input the builders operate on — db-free, unit-testable. */
export type SessionLike = { id: string; status: string; teacherId: string }

export type BuildTransitionInput = {
  session: SessionLike
  actorId: string | null | undefined
  // Injectable for deterministic tests; production uses the default.
  now?: number
}

export type SessionTransitionPlan = {
  sessionId: string
  meta: WriteEventMeta
  update: { status: SessionStatus; startedAt?: number; endedAt?: number }
}

/**
 * Pure builder for `draft → live`. Totally validates BEFORE producing any plan:
 * a present `sessionId`, owner identity (`actorId === session.teacherId`), and a
 * legal transition from the session's CURRENT status. Fed the live status, the
 * transition check is also the stale-tab / duplicate-event guard — re-issuing
 * start on an already-`live` session throws rather than appending a second
 * event. Stamps `startedAt` (SPEC §5.2). `sessionId === payload.id` so the event
 * folds cleanly through `applyEvent`'s `SessionStarted` case.
 */
export function buildSessionStart(input: BuildTransitionInput): SessionTransitionPlan {
  const { session, actorId } = input
  if (!session?.id) throw new Error('startSession: a sessionId is required')
  if (!actorId || actorId !== session.teacherId) {
    throw new Error('startSession: only the owning teacher can start this session')
  }
  assertLegalTransition(session.status, 'live')
  const startedAt = input.now ?? Date.now()
  return {
    sessionId: session.id,
    meta: {
      sessionId: session.id,
      actor: { id: actorId, role: 'teacher' },
      payload: { id: session.id, status: 'live', startedAt },
    },
    update: { status: 'live', startedAt },
  }
}

/**
 * Pure builder for `live → ended`. Same total validation as `buildSessionStart`
 * (present id, owner identity, legal transition from current status); stamps
 * `endedAt` (SPEC §5.2). Re-issuing end on an already-`ended` session throws.
 */
export function buildSessionEnd(input: BuildTransitionInput): SessionTransitionPlan {
  const { session, actorId } = input
  if (!session?.id) throw new Error('endSession: a sessionId is required')
  if (!actorId || actorId !== session.teacherId) {
    throw new Error('endSession: only the owning teacher can end this session')
  }
  assertLegalTransition(session.status, 'ended')
  const endedAt = input.now ?? Date.now()
  return {
    sessionId: session.id,
    meta: {
      sessionId: session.id,
      actor: { id: actorId, role: 'teacher' },
      payload: { id: session.id, status: 'ended', endedAt },
    },
    update: { status: 'ended', endedAt },
  }
}

export type TransitionDeps = {
  write?: typeof writeEvent
  buildTxn?: (plan: SessionTransitionPlan) => ProjectionTxn
}

const defaultTransitionTxn = (plan: SessionTransitionPlan): ProjectionTxn =>
  db.tx.sessions[plan.sessionId].update(plan.update)

/**
 * Thin wrapper: builds the start plan (sync-throws on illegal transition,
 * non-owner actor, or missing id — writing nothing), then dual-writes the
 * `SessionStarted` envelope + `sessions` projection update in ONE `writeEvent`
 * transaction. Because the append and projection share that transaction, a
 * rejected start leaves no partial state (no orphan event, no half-changed
 * status). NOT idempotent by design — each call appends a fresh event; retry
 * safety comes from the transition guard fed the CURRENT status, which rejects a
 * stale re-issue rather than appending a duplicate. The rejection propagates to
 * the caller and is never swallowed. `deps` are injectable for unit tests.
 */
export async function startSession(
  input: BuildTransitionInput,
  deps: TransitionDeps = {}
): Promise<SessionTransitionPlan> {
  const plan = buildSessionStart(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultTransitionTxn
  await write('SessionStarted', plan.meta, [buildTxn(plan)])
  return plan
}

/**
 * Thin wrapper for `live → ended`: same dual-write/atomicity/non-idempotency
 * contract as {@link startSession}, writing the `SessionEnded` envelope. A
 * rejected end leaves no partial state; the rejection propagates, never swallowed.
 */
export async function endSession(
  input: BuildTransitionInput,
  deps: TransitionDeps = {}
): Promise<SessionTransitionPlan> {
  const plan = buildSessionEnd(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultTransitionTxn
  await write('SessionEnded', plan.meta, [buildTxn(plan)])
  return plan
}

/**
 * The sanctioned join gate. Pure and total: `true` iff the session is `live`.
 * `false` for `draft`/`ended`/`archived`, an unknown status, or a null/absent
 * session — so the detail UI's join affordance can never drift from status.
 */
export function isJoinEnabled(session: { status?: string } | null | undefined): boolean {
  return !!session && session.status === 'live'
}

// ---------------------------------------------------------------------------
// Student join (cycle 0007). The SOLE sanctioned participant-create path,
// following the same pure-core/thin-wrapper split as create/lifecycle above:
// `buildParticipantJoin` totally validates and produces the projection record +
// `ParticipantJoined` envelope BEFORE any write; `joinSession` routes the
// dual-write through `writeEvent('ParticipantJoined', …)`. Unlike create/start,
// `joinSession` MUST be idempotent per (user, session): the caller pre-checks an
// existing-row count via `shouldCreateParticipant` (mirroring `shouldCreateUserRow`)
// so a reload never writes a second row. Email is NEVER part of the record —
// privacy is structural (the field does not exist on the entity, see db.ts); the
// display name is the email local-part only (SPEC §12.3).
// ---------------------------------------------------------------------------

/** The `participants` projection row this cycle writes — always a `student`. */
export type ParticipantRecord = {
  id: string
  sessionId: string
  userId: string
  role: 'student'
  username: string
  joinedAt: number
  lastSeenAt: number
  chatStatus: 'allowed'
}

export type BuildParticipantJoinInput = {
  sessionId: string | null | undefined
  userId: string | null | undefined
  username: string | null | undefined
  // Injectable for deterministic tests; production uses the defaults.
  participantId?: string
  now?: number
}

export type ParticipantJoinPlan = { record: ParticipantRecord; meta: WriteEventMeta }

/**
 * Pure builder: totally validates BEFORE producing any plan. A missing
 * `sessionId`, a missing `userId` (signed-out), or a blank/whitespace derived
 * `username` is rejected, so nothing is ever written for an invalid join. The
 * `participantId === record.id === meta.payload.participantId`, so the event folds
 * cleanly through `applyEvent`'s `ParticipantJoined` case (log/projection
 * consistency). The record carries NO `email` key — privacy is structural.
 */
export function buildParticipantJoin(input: BuildParticipantJoinInput): ParticipantJoinPlan {
  const sessionId = input.sessionId
  if (!sessionId) throw new Error('joinSession: a sessionId is required')
  const userId = input.userId
  if (!userId) throw new Error('joinSession: must be signed in to join a session')
  const username = (input.username ?? '').trim()
  if (username === '') throw new Error('joinSession: a username is required')

  const participantId = input.participantId ?? id()
  const at = input.now ?? Date.now()
  const record: ParticipantRecord = {
    id: participantId,
    sessionId,
    userId,
    role: 'student',
    username,
    joinedAt: at,
    lastSeenAt: at,
    chatStatus: 'allowed',
  }
  const meta: WriteEventMeta = {
    sessionId,
    actor: { id: userId, role: 'student' },
    payload: { participantId, userId, role: 'student', username },
  }
  return { record, meta }
}

/**
 * Pure idempotency gate, mirroring `shouldCreateUserRow`. Returns true ONLY when
 * an auth id exists, the `participants` query has loaded, no row exists yet for
 * (user, session), and no creation write is already in flight — safe across
 * reloads and React re-renders. The caller uses this to decide create-vs-no-op
 * before any write, which is the idempotency-per-(user, session) guarantee.
 */
export function shouldCreateParticipant(input: {
  authUserId: string | null | undefined
  participantsLoaded: boolean
  existingCount: number
  inFlight: boolean
}): boolean {
  const { authUserId, participantsLoaded, existingCount, inFlight } = input
  return Boolean(authUserId) && participantsLoaded && existingCount === 0 && !inFlight
}

export type JoinSessionDeps = {
  write?: typeof writeEvent
  buildTxn?: (record: ParticipantRecord) => ProjectionTxn
}

const defaultParticipantTxn = (r: ParticipantRecord): ProjectionTxn =>
  db.tx.participants[r.id]
    .update({
      sessionId: r.sessionId,
      userId: r.userId,
      role: r.role,
      username: r.username,
      joinedAt: r.joinedAt,
      lastSeenAt: r.lastSeenAt,
      chatStatus: r.chatStatus,
    })
    // Set the forgery-proof ownership link the tightened `participants` rule
    // traverses (`data.ref('session.teacherId')`), exactly like sessionResources.
    .link({ session: r.sessionId })

/**
 * Thin wrapper: builds the plan (sync-throws on bad input, writing nothing),
 * then dual-writes the `ParticipantJoined` envelope + `participants` projection
 * (including the `session` link) in ONE `writeEvent` transaction. Because the
 * append and projection share that transaction, a rejected join leaves no partial
 * participant row. Idempotency per (user, session) is enforced by the CALLER's
 * precheck (`shouldCreateParticipant` over the live `participants` count) — this
 * wrapper assumes the row is absent. The rejection propagates to the caller and is
 * never swallowed. `deps` are injectable so the paths are unit-testable without a
 * network.
 */
export async function joinSession(
  input: BuildParticipantJoinInput,
  deps: JoinSessionDeps = {}
): Promise<ParticipantRecord> {
  const plan = buildParticipantJoin(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultParticipantTxn
  await write('ParticipantJoined', plan.meta, [buildTxn(plan.record)])
  return plan.record
}

// ---------------------------------------------------------------------------
// Student chat submit (cycle 0008). The SOLE sanctioned message-create path,
// following the same pure-core/thin-wrapper split as join above:
// `buildChatMessage` totally validates and produces the projection record +
// `ChatMessageSubmitted` envelope BEFORE any write; `submitChatMessage` routes the
// dual-write through `writeEvent('ChatMessageSubmitted', …)`. Idempotency per
// logical submit comes from a CLIENT ACTION ID: the `messages` row id IS the
// client action id (`record.id === clientActionId === payload.messageId`), a
// deterministic keyed upsert, so re-submitting the same id writes the same row —
// not a second. The caller pre-checks with `shouldSubmitChatMessage` (mirroring
// `shouldCreateParticipant`) + an `inFlight` latch so a double-fire collapses to
// one row. The record carries the participant id only — never an email; the
// stream renders the participant `username` (local-part), privacy is structural.
// ---------------------------------------------------------------------------

/** The `messages` projection row this cycle writes — always `visible`/`unclassified`. */
export type MessageRecord = {
  id: string
  sessionId: string
  participantId: string
  clientActionId: string
  text: string
  visibility: 'visible'
  classificationStatus: 'unclassified'
  createdAt: number
}

export type BuildChatMessageInput = {
  sessionId: string | null | undefined
  participantId: string | null | undefined
  // The submitting user's auth id — becomes the envelope `actor.id`.
  userId: string | null | undefined
  // The client-minted action id — de-dups a double-submit; the row id === this.
  clientActionId: string | null | undefined
  text: string | null | undefined
  // Injectable for deterministic tests; production uses the default.
  now?: number
}

export type ChatMessagePlan = { record: MessageRecord; meta: WriteEventMeta }

/**
 * Pure builder: totally validates BEFORE producing any plan. A missing
 * `sessionId`, a missing/empty `participantId`, a missing `userId` (no actor), a
 * missing `clientActionId`, or blank/whitespace-only `text` is rejected by
 * throwing synchronously — so nothing is ever written for an invalid submit. The
 * `record.id === clientActionId === meta.payload.messageId`, a deterministic keyed
 * upsert, so a repeated logical submit folds to the SAME `messages` row (the
 * idempotency guarantee) and the event folds cleanly through `applyEvent`'s
 * `ChatMessageSubmitted` case. The text is trimmed before storage. The record
 * carries NO `email` key — privacy is structural.
 */
export function buildChatMessage(input: BuildChatMessageInput): ChatMessagePlan {
  const sessionId = input.sessionId
  if (!sessionId) throw new Error('submitChatMessage: a sessionId is required')
  const participantId = input.participantId
  if (!participantId) throw new Error('submitChatMessage: a participantId is required')
  const userId = input.userId
  if (!userId) throw new Error('submitChatMessage: must be signed in to send a message')
  const clientActionId = input.clientActionId
  if (!clientActionId) throw new Error('submitChatMessage: a clientActionId is required')
  const text = (input.text ?? '').trim()
  if (text === '') throw new Error('submitChatMessage: a message cannot be blank')

  const at = input.now ?? Date.now()
  const record: MessageRecord = {
    id: clientActionId,
    sessionId,
    participantId,
    clientActionId,
    text,
    visibility: 'visible',
    classificationStatus: 'unclassified',
    createdAt: at,
  }
  const meta: WriteEventMeta = {
    sessionId,
    actor: { id: userId, role: 'student' },
    payload: { messageId: clientActionId, participantId, text, createdAt: at },
  }
  return { record, meta }
}

/**
 * Pure idempotency gate, mirroring `shouldCreateParticipant`. Returns true ONLY
 * when an auth id exists, a `participantId` is resolved, the per-action-id query
 * has loaded, no `messages` row exists yet for this client action id, no submit is
 * already in flight, AND the text is non-blank. The caller uses this to decide
 * submit-vs-no-op before any write — the per-logical-submit idempotency guarantee.
 */
export function shouldSubmitChatMessage(input: {
  authUserId: string | null | undefined
  participantId: string | null | undefined
  messagesLoaded: boolean
  existingForActionId: number
  inFlight: boolean
  text: string | null | undefined
}): boolean {
  const { authUserId, participantId, messagesLoaded, existingForActionId, inFlight, text } = input
  return (
    Boolean(authUserId) &&
    Boolean(participantId) &&
    messagesLoaded &&
    existingForActionId === 0 &&
    !inFlight &&
    (text ?? '').trim() !== ''
  )
}

// ---------------------------------------------------------------------------
// Question promotion (cycle 0009). When `classifyMessage` says a stored chat
// message is question-like (interim trailing-`?` heuristic), the submit path
// dual-writes a teacher-facing `questions` row + a `QuestionCreated` event. The
// `questions` row id is derived deterministically from the source message id so
// a logical re-submit re-upserts the SAME Question row (keyed-upsert idempotency,
// mirroring the message). The row carries NO email — privacy is structural.
// ---------------------------------------------------------------------------

/** The `questions` projection row promoted from a question-like message. */
export type QuestionRecord = {
  id: string
  sessionId: string
  messageId: string
  participantId: string
  status: 'submitted'
  createdAt: number
}

export type BuildQuestionPlan = { record: QuestionRecord; meta: WriteEventMeta }

/**
 * Pure builder for the promoted Question, derived entirely from the already-built
 * `ChatMessagePlan` so the two writes stay consistent. The question id is
 * `deriveQuestionId(plan.record.id)` (deterministic + collision-free), and the
 * row links back to its source message, author participant, and session. The
 * envelope actor is the same student (`plan.meta.actor`). Throws synchronously on
 * a structurally impossible plan (missing actor/session/participant) before any
 * write — defensive; the message write already validated the same inputs.
 */
export function buildQuestion(plan: ChatMessagePlan): BuildQuestionPlan {
  const messageId = plan.record.id
  const sessionId = plan.record.sessionId
  const participantId = plan.record.participantId
  const userId = plan.meta.actor.id
  if (!sessionId) throw new Error('buildQuestion: a sessionId is required')
  if (!participantId) throw new Error('buildQuestion: a participantId is required')
  if (!userId) throw new Error('buildQuestion: an author userId is required')

  const questionId = deriveQuestionId(messageId)
  const record: QuestionRecord = {
    id: questionId,
    sessionId,
    messageId,
    participantId,
    status: 'submitted',
    createdAt: plan.record.createdAt,
  }
  const meta: WriteEventMeta = {
    sessionId,
    actor: { id: userId, role: 'student' },
    payload: { questionId, messageId, participantId, sessionId, status: 'submitted', createdAt: record.createdAt },
  }
  return { record, meta }
}

const defaultQuestionTxn = (r: QuestionRecord): ProjectionTxn =>
  db.tx.questions[r.id]
    // Scalar columns only — `messageId`/`participantId` are LINKS, not stored
    // columns, so the row carries no participant id or email.
    .update({ sessionId: r.sessionId, status: r.status, createdAt: r.createdAt })
    .link({ message: r.messageId, participant: r.participantId, session: r.sessionId })

export type SubmitChatMessageDeps = {
  write?: typeof writeEvent
  buildTxn?: (record: MessageRecord) => ProjectionTxn
  buildQuestionTxn?: (record: QuestionRecord) => ProjectionTxn
}

const defaultChatTxn = (r: MessageRecord): ProjectionTxn =>
  db.tx.messages[r.id]
    .update({
      sessionId: r.sessionId,
      participantId: r.participantId,
      clientActionId: r.clientActionId,
      text: r.text,
      visibility: r.visibility,
      classificationStatus: r.classificationStatus,
      createdAt: r.createdAt,
    })
    // Set the parent-session link (mirroring the participant join) so the session
    // can enumerate its messages and a future tightened rule can traverse it.
    .link({ session: r.sessionId })

/**
 * Thin wrapper: builds the plan (sync-throws on bad input, writing nothing), then
 * dual-writes the `ChatMessageSubmitted` envelope + `messages` projection (incl.
 * the `session` link) in ONE `writeEvent` transaction. Because the append and
 * projection share that transaction, a rejected submit leaves no partial state (no
 * orphan event, no orphan message row). Idempotency per logical submit comes from
 * the deterministic row id (`messages[clientActionId]` keyed upsert) — a retry of
 * the SAME client action id writes the same row, not a second; the caller's
 * `shouldSubmitChatMessage` pre-check + `inFlight` latch suppress the duplicate
 * envelope. The rejection propagates to the caller and is never swallowed. `deps`
 * are injectable so the paths are unit-testable without a network.
 *
 * Cycle 0009: after the `ChatMessageSubmitted` write SUCCEEDS, the stored text is
 * classified through the single `classifyMessage` seam. If it is question-like, a
 * SECOND `writeEvent('QuestionCreated', …)` dual-writes the `questions` row +
 * event in one transaction (so a Question failure is atomic — no orphan row, no
 * orphan event). It is issued only after the message write commits, so a failed
 * Question write leaves the message chat-only; the rejection propagates to the
 * caller (logged/surfaced by `StudentChat`), never swallowed. Because both the
 * message id and the derived question id are deterministic, a logical re-submit
 * re-upserts the SAME rows, recovering a missing Question without a duplicate.
 */
export async function submitChatMessage(
  input: BuildChatMessageInput,
  deps: SubmitChatMessageDeps = {}
): Promise<MessageRecord> {
  const plan = buildChatMessage(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultChatTxn
  const buildQuestionTxn = deps.buildQuestionTxn ?? defaultQuestionTxn
  await write('ChatMessageSubmitted', plan.meta, [buildTxn(plan.record)])
  if (classifyMessage(plan.record.text).isQuestion) {
    const q = buildQuestion(plan)
    await write('QuestionCreated', q.meta, [buildQuestionTxn(q.record)])
  }
  return plan.record
}

// ---------------------------------------------------------------------------
// Answer a Question (cycle 0010). The teacher-facing consumer of the Question
// object: the SOLE sanctioned resolution path. `buildQuestionAnswer` is the
// pure core — it totally validates input (present questionId/sessionId/actor
// userId, actor.role 'teacher', and the already-answered duplicate-resolution
// guard fed the LIVE status, mirroring `assertLegalTransition`) and trims an
// optional `answerSummary`, omitting it when blank, BEFORE producing any
// txn/envelope. `answerQuestion` is the thin wrapper that routes the dual-write
// through `writeEvent('QuestionAnswered', …)` so the envelope + the keyed
// `questions` projection update commit in one transaction. The projection
// update is a keyed upsert on the existing known questionId — naturally
// convergent on retry; the rejection propagates to the caller, never swallowed.
// ---------------------------------------------------------------------------

export type AnswerQuestionInput = {
  questionId: string
  sessionId: string
  currentStatus: string
  actor: { id: string; role: ActorRole } // must be 'teacher'
  answerSummary?: string
}

export type QuestionAnswerRecord = {
  id: string
  sessionId: string
  status: 'answered'
  addressedBy: string
  answerSummary?: string
}

export type BuildQuestionAnswerPlan = { record: QuestionAnswerRecord; meta: WriteEventMeta }

export function buildQuestionAnswer(input: AnswerQuestionInput): BuildQuestionAnswerPlan {
  const { questionId, sessionId, currentStatus } = input
  if (!questionId) throw new Error('buildQuestionAnswer: a questionId is required')
  if (!sessionId) throw new Error('buildQuestionAnswer: a sessionId is required')
  if (!input.actor?.id) throw new Error('buildQuestionAnswer: an actor userId is required')
  if (input.actor.role !== 'teacher')
    throw new Error('buildQuestionAnswer: only a teacher may answer a question')
  // Duplicate-resolution guard, fed the LIVE status (mirrors assertLegalTransition):
  // answering an already-answered Question is rejected, never appends a second event.
  if (currentStatus === 'answered')
    throw new Error('buildQuestionAnswer: question is already answered')

  const trimmed = input.answerSummary?.trim()
  const record: QuestionAnswerRecord = {
    id: questionId,
    sessionId,
    status: 'answered',
    addressedBy: input.actor.id,
    ...(trimmed ? { answerSummary: trimmed } : {}),
  }
  const meta: WriteEventMeta = {
    sessionId,
    actor: { id: input.actor.id, role: 'teacher' },
    payload: {
      questionId,
      sessionId,
      status: 'answered',
      addressedBy: input.actor.id,
      ...(trimmed ? { answerSummary: trimmed } : {}),
    },
  }
  return { record, meta }
}

const defaultQuestionAnswerTxn = (r: QuestionAnswerRecord): ProjectionTxn =>
  db.tx.questions[r.id].update({
    status: r.status,
    addressedBy: r.addressedBy,
    ...(r.answerSummary !== undefined ? { answerSummary: r.answerSummary } : {}),
  })

export type AnswerQuestionDeps = {
  write?: typeof writeEvent
  buildTxn?: (record: QuestionAnswerRecord) => ProjectionTxn
}

export async function answerQuestion(
  input: AnswerQuestionInput,
  deps: AnswerQuestionDeps = {}
): Promise<QuestionAnswerRecord> {
  const plan = buildQuestionAnswer(input)
  const write = deps.write ?? writeEvent
  const buildTxn = deps.buildTxn ?? defaultQuestionAnswerTxn
  await write('QuestionAnswered', plan.meta, [buildTxn(plan.record)])
  return plan.record
}
