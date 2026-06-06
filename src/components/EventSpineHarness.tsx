import { useMemo, useState } from 'react'
import { db, writeEvent, id } from '@/lib/db'

// ---------------------------------------------------------------------------
// Dev-only scratch harness — NOT a product surface. It exercises the dual-write
// `writeEvent()` choke point for two event types and renders the resulting
// `sessionEvents` rows and their matching projection rows live, so the spine
// and InstantDB realtime sync can be observed and verified by Playwright across
// two browser contexts. Gated out of production by the wrapping .astro route.
// ---------------------------------------------------------------------------

function resolveSessionId(): string {
  // A second browser context can target the same session via ?sessionId=.
  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('sessionId')
    if (fromQuery && fromQuery.trim() !== '') return fromQuery
  }
  // InstantDB entity ids must be UUIDs; `id()` produces one.
  return id()
}

export default function EventSpineHarness() {
  const sessionId = useMemo(resolveSessionId, [])
  const [error, setError] = useState<string | null>(null)

  const { isLoading, error: queryError, data } = db.useQuery({
    sessionEvents: { $: { where: { sessionId } } },
    sessions: { $: { where: { id: sessionId } } },
    participants: { $: { where: { sessionId } } },
  })

  function createSession() {
    setError(null)
    try {
      writeEvent(
        'SessionCreated',
        {
          sessionId,
          actor: { id: 'dev-teacher', role: 'teacher' },
          payload: { id: sessionId, title: 'Dev Session', teacherId: 'dev-teacher' },
        },
        [
          db.tx.sessions[sessionId].update({
            title: 'Dev Session',
            status: 'draft',
            teacherId: 'dev-teacher',
            joinCode: sessionId,
            createdAt: Date.now(),
            interactionMode: 'none',
          }),
        ]
      ).catch((err: unknown) => surface(err))
    } catch (err) {
      surface(err)
    }
  }

  function joinParticipant() {
    setError(null)
    const participantId = id()
    try {
      writeEvent(
        'ParticipantJoined',
        {
          sessionId,
          actor: { id: 'dev-student', role: 'student' },
          payload: { participantId, userId: 'dev-student', role: 'student', username: 'student' },
        },
        [
          db.tx.participants[participantId].update({
            sessionId,
            userId: 'dev-student',
            role: 'student',
            username: 'student',
            joinedAt: Date.now(),
            lastSeenAt: Date.now(),
            chatStatus: 'allowed',
          }),
        ]
      ).catch((err: unknown) => surface(err))
    } catch (err) {
      surface(err)
    }
  }

  function invalidWrite() {
    setError(null)
    try {
      // Intentionally illegal: projection-only writes are rejected before any
      // transaction is issued, so no row is ever written.
      writeEvent(
        'SessionCreated',
        { sessionId, actor: { id: 'dev-teacher', role: 'teacher' }, payload: {} },
        []
      ).catch((err: unknown) => surface(err))
    } catch (err) {
      surface(err)
    }
  }

  function surface(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setError(message)
    console.error('[EventSpineHarness] writeEvent failed:', err)
  }

  if (isLoading) return <p data-testid="harness-loading">Loading…</p>
  if (queryError) {
    return <div data-testid="harness-query-error">Error querying data: {queryError.message}</div>
  }

  const events = data.sessionEvents ?? []
  const sessions = data.sessions ?? []
  const participants = data.participants ?? []

  return (
    <section data-testid="event-spine-harness">
      <p>
        Session: <code data-testid="session-id">{sessionId}</code>
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button data-testid="btn-create-session" onClick={createSession} className="btn">
          Create session
        </button>
        <button data-testid="btn-join-participant" onClick={joinParticipant} className="btn">
          Join participant
        </button>
        <button data-testid="btn-invalid-write" onClick={invalidWrite} className="btn">
          Invalid write (no projection)
        </button>
      </div>

      {error && (
        <p data-testid="harness-error" role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}

      <h2>Events (<span data-testid="event-count">{events.length}</span>)</h2>
      <ul>
        {events.map((e) => (
          <li key={e.id} data-testid="event-row">
            {e.type} — actor {e.actorRole}/{e.actorId ?? 'null'} @ {e.occurredAt}
          </li>
        ))}
      </ul>

      <h2>Sessions (<span data-testid="session-count">{sessions.length}</span>)</h2>
      <ul>
        {sessions.map((s) => (
          <li key={s.id} data-testid="session-row">
            {s.title} [{s.status}]
          </li>
        ))}
      </ul>

      <h2>Participants (<span data-testid="participant-count">{participants.length}</span>)</h2>
      <ul>
        {participants.map((p) => (
          <li key={p.id} data-testid="participant-row">
            {p.username} ({p.role})
          </li>
        ))}
      </ul>
    </section>
  )
}
