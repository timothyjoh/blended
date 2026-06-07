import { db, id, writeEvent, type ProjectionTxn, type WriteEventMeta } from './db'

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
