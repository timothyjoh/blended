import { useEffect, useRef, useState } from 'react'
import { db } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'
import { isJoinEnabled, joinSession, shouldCreateParticipant } from '@/lib/sessions'

// ---------------------------------------------------------------------------
// The student join entry point (cycle 0007). Mounted inside `RouteGuard` on
// `/join/[joinCode]`, so an unauthenticated visitor bounces to
// `/login?next=/join/<code>` for free (no new auth path) and we hydrate only
// once authenticated. It reads identity through `useAuth` (never `db.useAuth()`),
// resolves the Session by `joinCode` via a live query, gates eligibility SOLELY
// on `isJoinEnabled` (true only when `live`), and on a live Session creates the
// student `Participant` exactly once via the sole sanctioned `joinSession` →
// `writeEvent('ParticipantJoined', …)` dual-write before routing to `/s/<code>`.
//
// Idempotency per (user, session): a live `participants` query keyed on
// (sessionId, userId) drives `shouldCreateParticipant`; an already-joined reload
// routes straight in without a second write, and an `inFlight` ref latch guards
// the create effect against a re-render double-fire (mirroring `useAuth`). Every
// failure renders an observable, non-blank state AND logs — never swallowed, never
// a false "joined". The `username` is the email local-part only; email is never
// stored on or shown for the participant row (privacy is structural).
// ---------------------------------------------------------------------------

export default function JoinSession({ joinCode }: { joinCode: string }) {
  const { user, username } = useAuth()
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const sessionQ = db.useQuery(joinCode ? { sessions: { $: { where: { joinCode } } } } : null)
  const session = sessionQ.data?.sessions?.[0] ?? null

  // Per-(user, session) membership probe — drives idempotency. `null` query until
  // both the session and the auth id are known, so InstantDB skips it.
  const partsQ = db.useQuery(
    session?.id && user?.id
      ? { participants: { $: { where: { sessionId: session.id, userId: user.id } } } }
      : null
  )
  const existingCount = partsQ.data?.participants?.length ?? 0
  const alreadyJoined = existingCount > 0
  const partsLoaded = !!session?.id && !!user?.id && !partsQ.isLoading && !partsQ.error

  // Query errors: surface (never swallow). Rendered as the error state below.
  if (sessionQ.error) console.error('[JoinSession] session query error:', sessionQ.error)
  if (partsQ.error) console.error('[JoinSession] participants query error:', partsQ.error)

  function goToSession() {
    if (typeof window !== 'undefined') window.location.assign(`/s/${joinCode}`)
  }

  function surface(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setError(message)
    console.error('[JoinSession] join failed:', err)
  }

  // Already a participant (incl. after a successful create): route straight in,
  // no write. Safe to re-run — `window.location.assign` is idempotent.
  useEffect(() => {
    if (alreadyJoined) goToSession()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyJoined])

  // Create-once effect: only fires for a loaded, live, not-yet-joined session.
  useEffect(() => {
    if (error) return
    if (!session || !isJoinEnabled(session) || !user?.id) return
    if (alreadyJoined) return
    if (
      !shouldCreateParticipant({
        authUserId: user.id,
        participantsLoaded: partsLoaded,
        existingCount,
        inFlight: inFlight.current,
      })
    ) {
      return
    }
    inFlight.current = true
    joinSession({ sessionId: session.id, userId: user.id, username })
      .then(() => {
        goToSession()
      })
      .catch((err: unknown) => {
        surface(err)
      })
      .finally(() => {
        inFlight.current = false
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, user?.id, partsLoaded, existingCount, alreadyJoined, error])

  // --- Render: every branch is an observable, non-blank state. ---

  if (error) {
    return (
      <div data-testid="join-root">
        <p data-testid="join-error" role="alert" className="text-sm text-destructive">
          Could not join this session: {error}
        </p>
      </div>
    )
  }

  if (sessionQ.error) {
    return (
      <div data-testid="join-root">
        <p data-testid="join-error" role="alert" className="text-sm text-destructive">
          Could not load this session. Please try again.
        </p>
      </div>
    )
  }

  if (partsQ.error) {
    return (
      <div data-testid="join-root">
        <p data-testid="join-error" role="alert" className="text-sm text-destructive">
          Could not load this session. Please try again.
        </p>
      </div>
    )
  }

  if (sessionQ.isLoading) {
    return (
      <div data-testid="join-root">
        <p data-testid="join-loading" className="text-sm text-muted-foreground">
          Looking up the session…
        </p>
      </div>
    )
  }

  if (!session) {
    return (
      <div data-testid="join-root">
        <p data-testid="join-not-found" className="text-sm text-destructive">
          We couldn’t find a session for this link. Check the link and try again.
        </p>
      </div>
    )
  }

  if (!isJoinEnabled(session)) {
    return (
      <div data-testid="join-root">
        <p data-testid="join-not-open" className="text-sm text-muted-foreground">
          This session isn’t open for joining right now.
        </p>
      </div>
    )
  }

  // Live session: either routing an already-joined student in, or the create
  // effect is committing the join. Show the joining shell while that resolves.
  return (
    <div data-testid="join-root">
      <p data-testid="join-loading" className="text-sm text-muted-foreground">
        Joining the session…
      </p>
    </div>
  )
}
