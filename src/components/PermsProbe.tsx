import { useMemo, useState } from 'react'
import { db, writeEvent, id } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'

// ---------------------------------------------------------------------------
// Dev-only permissions probe — NOT a product surface. It issues RAW client
// reads/writes (bypassing `writeEvent`) so the permissions e2e spec can, from a
// real signed-in context, attempt a forbidden email read and a forbidden
// session-state write and OBSERVE the data layer's verdict. Every outcome
// (success OR surfaced permission error) is rendered to a testid and logged —
// nothing is swallowed. Gated out of production by the wrapping .astro route.
// ---------------------------------------------------------------------------

function param(name: string): string {
  if (typeof window === 'undefined') return ''
  return new URLSearchParams(window.location.search).get(name) ?? ''
}

export default function PermsProbe() {
  const targetUserId = useMemo(() => param('targetUserId'), [])
  const targetSessionId = useMemo(() => param('targetSessionId'), [])
  const targetTeacherId = useMemo(() => param('targetTeacherId'), [])
  const { user } = useAuth()

  const [readResult, setReadResult] = useState<string>('—')
  const [writeResult, setWriteResult] = useState<string>('—')

  // Live view of the target session so the spec can assert realtime propagation
  // of an owner write AND re-read the (unchanged) value after a denied write.
  const sessionQ = db.useQuery(
    targetSessionId ? { sessions: { $: { where: { id: targetSessionId } } } } : null
  )
  const activeResourceId = sessionQ.data?.sessions?.[0]?.activeResourceId ?? 'none'

  function surface(setter: (v: string) => void, err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setter('error:' + message)
    console.error('[PermsProbe]', err)
  }

  // Email privacy: a raw query for another user's row. The own-row-only `users`
  // view rule returns ZERO rows for anyone but that user, so no email leaks.
  async function readEmail() {
    setReadResult('…')
    try {
      const res = await db.queryOnce({ users: { $: { where: { id: targetUserId } } } })
      const row = res.data?.users?.[0]
      setReadResult(row?.email ? 'email:' + row.email : 'no-email')
    } catch (err) {
      surface(setReadResult, err)
    }
  }

  // Forbidden write: raw transact against someone else's session. The owner-only
  // rule must reject it; the promise rejects and we render the permission error.
  function writeSession() {
    setWriteResult('…')
    try {
      db.transact(db.tx.sessions[targetSessionId].update({ activeResourceId: 'probe-' + Date.now() }))
        .then(() => setWriteResult('ok'))
        .catch((err: unknown) => surface(setWriteResult, err))
    } catch (err) {
      surface(setWriteResult, err)
    }
  }

  // Forbidden write: raw transact creating a resource declaring the VICTIM
  // teacher as owner, linked to the victim's session. The link-based rule
  // (`auth.id in data.ref('session.teacherId')`) denies it — the requester is
  // not the parent session's owner.
  function writeResource() {
    setWriteResult('…')
    try {
      db.transact(
        db.tx.sessionResources[id()]
          .update({
            sessionId: targetSessionId,
            teacherId: targetTeacherId,
            url: 'https://example.com/probe',
            title: 'probe',
            type: 'link',
            sortOrder: 0,
            embedMode: 'none',
            embedStatus: 'unknown',
            createdAt: Date.now(),
          })
          .link({ session: targetSessionId })
      )
        .then(() => setWriteResult('ok'))
        .catch((err: unknown) => surface(setWriteResult, err))
    } catch (err) {
      surface(setWriteResult, err)
    }
  }

  // The DANGEROUS create-time injection vector (cycle 0003 fix): a student
  // creates a resource declaring THEMSELVES (`user.id`) as `teacherId` but
  // links it to the VICTIM teacher's session. The old self-asserted
  // `auth.id == data.teacherId` rule would have admitted this (the student does
  // equal their own declared teacherId), injecting a resource into a foreign
  // lesson. The link-based rule checks the parent session's real owner, so the
  // student — not the session's teacher — is rejected.
  function injectResource() {
    setWriteResult('…')
    if (!user?.id) {
      surface(setWriteResult, new Error('not signed in'))
      return
    }
    try {
      db.transact(
        db.tx.sessionResources[id()]
          .update({
            sessionId: targetSessionId,
            teacherId: user.id,
            url: 'https://example.com/inject',
            title: 'inject',
            type: 'link',
            sortOrder: 0,
            embedMode: 'none',
            embedStatus: 'unknown',
            createdAt: Date.now(),
          })
          .link({ session: targetSessionId })
      )
        .then(() => setWriteResult('ok'))
        .catch((err: unknown) => surface(setWriteResult, err))
    } catch (err) {
      surface(setWriteResult, err)
    }
  }

  // Deny-by-default proof (cycle 0013): a raw write to an UNDECLARED namespace.
  // Under the global `$default: 'false'` rule the live app rejects it — the
  // promise rejects and we render the permission error (never swallowed). This
  // demonstrates the "next entity is locked by default" guarantee.
  function writeUndeclared() {
    setWriteResult('…')
    try {
      db.transact(
        (db.tx as Record<string, any>).forbiddenProbe[id()].update({ note: 'probe-' + Date.now() })
      )
        .then(() => setWriteResult('ok'))
        .catch((err: unknown) => surface(setWriteResult, err))
    } catch (err) {
      surface(setWriteResult, err)
    }
  }

  // Authorized write: create a session the SIGNED-IN user owns, via the dual-write
  // choke point. Proves owner-create is allowed (and seeds a session the spec
  // then mutates to assert realtime propagation).
  function createOwnedSession() {
    setWriteResult('…')
    if (!user?.id) {
      surface(setWriteResult, new Error('not signed in'))
      return
    }
    const ownerId = user.id
    try {
      writeEvent(
        'SessionCreated',
        {
          sessionId: targetSessionId,
          actor: { id: ownerId, role: 'teacher' },
          payload: { id: targetSessionId, title: 'Probe Session', teacherId: ownerId },
        },
        [
          db.tx.sessions[targetSessionId].update({
            title: 'Probe Session',
            status: 'draft',
            teacherId: ownerId,
            joinCode: targetSessionId,
            createdAt: Date.now(),
            interactionMode: 'none',
          }),
        ]
      )
        .then(() => setWriteResult('ok'))
        .catch((err: unknown) => surface(setWriteResult, err))
    } catch (err) {
      surface(setWriteResult, err)
    }
  }

  return (
    <section data-testid="perms-probe">
      <p>
        Self: <code data-testid="probe-self-id">{user?.id ?? 'signed-out'}</code>
      </p>
      <p>
        Target session active resource:{' '}
        <code data-testid="probe-active-resource">{activeResourceId}</code>
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button data-testid="probe-create-owned-session" onClick={createOwnedSession} className="btn">
          Create owned session
        </button>
        <button data-testid="probe-write-session" onClick={writeSession} className="btn">
          Write session (raw)
        </button>
        <button data-testid="probe-write-resource" onClick={writeResource} className="btn">
          Write resource (raw)
        </button>
        <button data-testid="probe-inject-resource" onClick={injectResource} className="btn">
          Inject resource (own teacherId)
        </button>
        <button data-testid="probe-read-email" onClick={readEmail} className="btn">
          Read target email (raw)
        </button>
        <button data-testid="probe-write-undeclared" onClick={writeUndeclared} className="btn">
          Write undeclared entity (raw)
        </button>
      </div>
      <p>
        Read result: <code data-testid="probe-read-result">{readResult}</code>
      </p>
      <p>
        Write result: <code data-testid="probe-write-result">{writeResult}</code>
      </p>
    </section>
  )
}
