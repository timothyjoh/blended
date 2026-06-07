import { db } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'
import { compareSessionsForList, sessionDisplayTitle } from '@/lib/sessions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ---------------------------------------------------------------------------
// The teacher dashboard session list (cycle 0012). Mounted inside the existing
// `RouteGuard` on `/dashboard` beside `NewSession`, so it hydrates only when
// authenticated. It reads identity through `useAuth` (never `db.useAuth()`) and
// runs a SINGLE owner-scoped live query over the `sessions` projection
// (`where: { teacherId: user.id }`) — the filter is applied server-side, and the
// query is null-guarded until the user id resolves (mirrors SessionLifecycle's
// `sessionId ? … : null`) so no unscoped query is ever issued. Rows reflect
// InstantDB changes (creation, status transition) in realtime — a live query,
// not polling. It renders explicit, mutually-exclusive states: unresolved auth
// (nothing actionable), error (`role="alert"` + `console.error`, never a
// falsely-empty list), loading (never a flash of empty), empty (never a blank
// region), and the populated list. Each row links into the existing facilitation
// view at `/dashboard/sessions/:id`. Rows show title (with a non-blank fallback)
// and status only — never raw email (the `sessions` projection carries none;
// privacy is structural).
// ---------------------------------------------------------------------------

export default function SessionList() {
  const { user } = useAuth()
  // Owner-scoped, server-side filter; null-guarded until the user id resolves so
  // no unscoped query is issued (mirrors SessionLifecycle's `sessionId ? … : null`).
  const q = db.useQuery(
    user?.id ? { sessions: { $: { where: { teacherId: user.id } } } } : null
  )

  // Surface query errors — never swallow (mirrors SessionLifecycle :57-58).
  if (q.error) console.error('[SessionList] sessions query error:', q.error)

  // 1. Unresolved auth: render nothing actionable. The `null` query above is not
  //    issued, so there is nothing to scope and nothing to show yet.
  if (!user?.id) return null

  // 2. Error: surface inline + logged above; NEVER collapse to the empty state.
  if (q.error) {
    return (
      <Card data-testid="session-list" className="mt-6">
        <CardHeader>
          <CardTitle>Your sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            data-testid="session-list-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {String(q.error?.message ?? q.error)}
          </p>
        </CardContent>
      </Card>
    )
  }

  // 3. Loading: explicit element, never a flash of "no sessions".
  if (q.isLoading) {
    return (
      <Card data-testid="session-list" className="mt-6">
        <CardHeader>
          <CardTitle>Your sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <p data-testid="session-list-loading" className="text-sm text-muted-foreground">
            Loading your sessions…
          </p>
        </CardContent>
      </Card>
    )
  }

  // Stable client-side order (createdAt asc, tie-break by id) via the pure,
  // unit-tested comparator — deterministic without a server-side index.
  const rows = [...(q.data?.sessions ?? [])].sort(compareSessionsForList)

  return (
    <Card data-testid="session-list" className="mt-6">
      <CardHeader>
        <CardTitle>Your sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p data-testid="session-list-empty" className="text-sm text-muted-foreground">
            You don’t own any sessions yet. Create one above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((s) => (
              <a
                key={s.id}
                data-testid="session-list-item"
                data-session-id={s.id}
                href={`/dashboard/sessions/${s.id}`}
                className="flex items-center justify-between rounded-md border px-4 py-3 transition-colors hover:bg-accent"
              >
                <span data-testid="session-list-item-title" className="font-medium">
                  {sessionDisplayTitle(s.title)}
                </span>
                <span
                  data-testid="session-list-item-status"
                  className="text-sm text-muted-foreground"
                >
                  {s.status}
                </span>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
