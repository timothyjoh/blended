import { useState } from 'react'
import { db } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'
import { startSession, endSession, isJoinEnabled } from '@/lib/sessions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ---------------------------------------------------------------------------
// Session lifecycle controls (cycle 0006). Mounted inside `SessionRouteGuard` on
// `/dashboard/sessions/[id]`, so it hydrates only for the owning teacher. It
// reads identity through `useAuth` (never `db.useAuth()`) and the live session
// through `db.useQuery`, shows the current status and the join-gate state derived
// SOLELY from `isJoinEnabled` (so the gate can never drift from status), and
// renders Start / End controls that route the dual-write through
// `startSession` / `endSession` → `writeEvent`. Starting opens the join gate;
// ending closes live participation. Both controls are visible so an illegal
// transition (e.g. End on a draft) is observably rejected by the builder guard:
// on any failure it surfaces an inline `role="alert"` error AND `console.error`s
// — never swallowed — and the displayed status (driven by the live query) is
// unchanged. Shows status only, never raw email (SPEC §40).
// ---------------------------------------------------------------------------

export default function SessionLifecycle({ sessionId }: { sessionId: string }) {
  const { user } = useAuth()
  const q = db.useQuery(sessionId ? { sessions: { $: { where: { id: sessionId } } } } : null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Query error: surface it (never swallow). The controls are gated on a loaded
  // session below, so a failed query renders the non-actionable error state.
  if (q.error) console.error('[SessionLifecycle] session query error:', q.error)

  const session = q.data?.sessions?.[0] ?? null

  function surface(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setError(message)
    console.error('[SessionLifecycle] transition failed:', err)
  }

  async function run(transition: typeof startSession | typeof endSession) {
    setError(null)
    // Defense-in-depth behind SessionRouteGuard: refuse to write with no auth id
    // or before the live session has loaded.
    if (!user?.id) {
      setError('You must be signed in to manage this session')
      return
    }
    if (!session) {
      setError('Session is still loading')
      return
    }
    setPending(true)
    try {
      await transition({
        session: { id: session.id, status: session.status, teacherId: session.teacherId },
        actorId: user.id,
      })
      // On success the live query advances the displayed status; nothing local to
      // set. On rejection the status is left untouched (no half-applied state).
    } catch (err) {
      surface(err)
    } finally {
      setPending(false)
    }
  }

  const errorEl = error ? (
    <p
      data-testid="session-lifecycle-error"
      role="alert"
      className="mt-3 text-sm text-destructive"
    >
      {error}
    </p>
  ) : null

  if (q.isLoading) {
    return (
      <div data-testid="session-root">
        <p data-testid="session-lifecycle-loading" className="text-sm text-muted-foreground">
          Loading session…
        </p>
      </div>
    )
  }

  if (!session) {
    return (
      <div data-testid="session-root">
        <p className="text-sm text-destructive">This session could not be loaded.</p>
        {errorEl}
      </div>
    )
  }

  const joinEnabled = isJoinEnabled(session)
  const joinCopy =
    session.status === 'live'
      ? 'Students can join now.'
      : session.status === 'draft'
        ? 'Start the session to let students join.'
        : 'Live participation is closed.'

  return (
    <div data-testid="session-root" className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle data-testid="session-title">{session.title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            Status:{' '}
            <span data-testid="session-status" className="font-medium">
              {session.status}
            </span>
          </p>
          <p>
            Join:{' '}
            <span
              data-testid="session-join-state"
              data-join-enabled={joinEnabled ? 'true' : 'false'}
              className="font-medium"
            >
              {joinEnabled ? 'enabled' : 'disabled'}
            </span>{' '}
            <span className="text-muted-foreground">— {joinCopy}</span>
          </p>
          {joinEnabled && (
            <p>
              Join code:{' '}
              <code data-testid="session-joincode" className="font-mono font-medium">
                {session.joinCode}
              </code>
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button
          data-testid="session-start"
          variant={session.status === 'draft' ? 'default' : 'outline'}
          disabled={pending}
          onClick={() => run(startSession)}
        >
          {pending ? 'Working…' : 'Start session'}
        </Button>
        <Button
          data-testid="session-end"
          variant={session.status === 'live' ? 'default' : 'outline'}
          disabled={pending}
          onClick={() => run(endSession)}
        >
          {pending ? 'Working…' : 'End session'}
        </Button>
      </div>

      {errorEl}
    </div>
  )
}
