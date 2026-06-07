import { db } from '@/lib/db'
import ResourcePane from './ResourcePane'

// ---------------------------------------------------------------------------
// The student session view (cycle 0007). Mounted inside `RouteGuard` on
// `/s/[joinCode]`, it is a read-only, live-syncing presence/status surface — the
// minimal proof of late-joiner sync, NOT the full roster (that is its own cycle).
// It re-resolves the Session by `joinCode` and subscribes to the Session's
// participants via `db.useQuery`, so a context that loads AFTER others immediately
// reflects the current shared state (live status + the present-participant set)
// with no manual refresh. Reads are open (`sessions.view = 'true'`), so this view
// renders regardless of membership; it does NOT gate on being a participant (out
// of scope). It never renders email — the field does not exist on the row.
//
// Cycle 0016: it also mounts the shared `ResourcePane`, driven SOLELY by the
// existing session-by-`joinCode` query's `activeResourceId`/`currentUrl` (no
// `sessionResources` query is added — that is exactly why `currentUrl` lives on
// the session row). When the teacher activates a resource the live query
// re-renders and the pane switches with no reload; a context that loads after
// activation immediately shows the current active resource; before any activation
// it renders an explicit empty state.
//
// Cycle 0018: a NARROWLY-scoped active-resource title read (a live query over the
// single `sessionResources` row whose id is `session.activeResourceId`; open reads
// permit this) feeds the fallback card's heading — with a hostname fallback when
// the title is absent, so the student card is never headingless. The student pane
// passes NO `onEmbedBlocked` callback: students lack `sessionResources` write
// permission by design, so their fallback card is local-only (no
// `ResourceEmbedChecked` write). A title-query error is logged and degrades to the
// hostname heading — never blank, never a crash.
// ---------------------------------------------------------------------------

export default function StudentSession({ joinCode }: { joinCode: string }) {
  const sessionQ = db.useQuery(joinCode ? { sessions: { $: { where: { joinCode } } } } : null)
  const session = sessionQ.data?.sessions?.[0] ?? null

  const partsQ = db.useQuery(
    session?.id ? { participants: { $: { where: { sessionId: session.id } } } } : null
  )
  const participants = partsQ.data?.participants ?? []

  // Cycle 0018: a narrowly-scoped read of the single active resource, for the
  // fallback card heading. Open reads permit this; the card degrades to the URL
  // hostname when no title is resolvable.
  const resQ = db.useQuery(
    session?.activeResourceId
      ? { sessionResources: { $: { where: { id: session.activeResourceId } } } }
      : null
  )
  const activeResourceTitle = resQ.data?.sessionResources?.[0]?.title ?? null

  // Query errors: surface (never swallow). Rendered as the error state below.
  if (sessionQ.error) console.error('[StudentSession] session query error:', sessionQ.error)
  if (partsQ.error) console.error('[StudentSession] participants query error:', partsQ.error)
  if (resQ.error) console.error('[StudentSession] active resource query error:', resQ.error)

  if (sessionQ.error) {
    return (
      <div data-testid="student-session-root">
        <p role="alert" className="text-sm text-destructive">
          Could not load this session. Please try again.
        </p>
      </div>
    )
  }

  if (partsQ.error) {
    return (
      <div data-testid="student-session-root">
        <p role="alert" className="text-sm text-destructive">
          Could not load this session. Please try again.
        </p>
      </div>
    )
  }

  if (sessionQ.isLoading) {
    return (
      <div data-testid="student-session-root">
        <p className="text-sm text-muted-foreground">Loading session…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div data-testid="student-session-root">
        <p data-testid="student-session-not-found" className="text-sm text-destructive">
          We couldn’t find a session for this link.
        </p>
      </div>
    )
  }

  return (
    <div data-testid="student-session-root" className="flex flex-col gap-4">
      <p className="text-sm">
        Status:{' '}
        <span data-testid="student-session-status" className="font-medium">
          {session.status}
        </span>
      </p>
      <ResourcePane
        activeResourceId={session.activeResourceId}
        currentUrl={session.currentUrl}
        currentUrlVersion={session.currentUrlVersion}
        title={activeResourceTitle}
      />
      <div>
        <p className="text-sm text-muted-foreground">In this session:</p>
        <ul data-testid="student-session-presence" className="mt-1 flex flex-col gap-1">
          {participants.map((p) => (
            <li
              key={p.id}
              data-testid="student-session-presence-item"
              className="text-sm font-medium"
            >
              {p.username}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
