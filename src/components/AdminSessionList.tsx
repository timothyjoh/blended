import { db } from '@/lib/db'
import { buildAdminSessionRows, ADMIN_VALUE_NONE } from '@/lib/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ---------------------------------------------------------------------------
// The uber-admin session console (cycle 0020, ADR-0003 — internal observability).
// Mounted inside the existing `AdminRouteGuard` on `/admin`, so it hydrates only
// for an `uber` admin — this island writes NO access-control logic; access is
// the guard's job. Unlike `SessionList` (owner-scoped via `useAuth` +
// `where: { teacherId }`), this runs three UNSCOPED live queries over the
// `sessions`/`participants`/`questions` projections to observe the whole system
// regardless of owner or status. The open-read permission rules already permit
// these unscoped client reads — no `perms:push` this cycle. The three results are
// folded through the pure, total `buildAdminSessionRows` seam (createdAt-asc, id
// tie-break ordering — no server index) into per-session operator rows.
//
// Invariants: READ-ONLY (no mutation, no `writeEvent`); NO email is read or
// rendered (owner is `teacherId` only — privacy is structural). Render states are
// explicit and mutually exclusive: error (`role="alert"` + `console.error`,
// checked BEFORE empty so an errored query never renders falsely-empty) →
// loading (never a flash of empty) → empty (never a blank region) → populated.
// Each row links to `/admin/sessions/:id` carrying `data-session-id` — the
// event-log inspector drill-in target, reserved for a sibling cycle.
//
// Deferred trade-off: the unscoped reads are full-table scans (no server-side
// index/pagination) — accepted at MVP scale, noted in AGENTS.md as follow-up.
// ---------------------------------------------------------------------------

export default function AdminSessionList() {
  const sessionsQ = db.useQuery({ sessions: {} })
  const participantsQ = db.useQuery({ participants: {} })
  const questionsQ = db.useQuery({ questions: {} })

  // First-failure precedence; surface inline + logged — never swallowed.
  const error = sessionsQ.error ?? participantsQ.error ?? questionsQ.error
  if (error) console.error('[AdminSessionList] sessions/participants/questions query error:', error)

  // 1. Error: surfaced inline, checked BEFORE empty so an errored query never
  //    renders as a falsely-empty list.
  if (error) {
    return (
      <Card data-testid="admin-session-list" className="mt-6">
        <CardHeader>
          <CardTitle>All sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            data-testid="admin-session-list-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {String(error?.message ?? error)}
          </p>
        </CardContent>
      </Card>
    )
  }

  // 2. Loading: explicit element, never a flash of "no sessions". Gates the first
  //    paint until all three queries resolve (so counts never show partial).
  if (sessionsQ.isLoading || participantsQ.isLoading || questionsQ.isLoading) {
    return (
      <Card data-testid="admin-session-list" className="mt-6">
        <CardHeader>
          <CardTitle>All sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <p data-testid="admin-session-list-loading" className="text-sm text-muted-foreground">
            Loading sessions…
          </p>
        </CardContent>
      </Card>
    )
  }

  const rows = buildAdminSessionRows(
    sessionsQ.data?.sessions,
    participantsQ.data?.participants,
    questionsQ.data?.questions
  )

  return (
    <Card data-testid="admin-session-list" className="mt-6">
      <CardHeader>
        <CardTitle>All sessions</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p data-testid="admin-session-list-empty" className="text-sm text-muted-foreground">
            No sessions exist yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <a
                key={r.id}
                data-testid="admin-session-item"
                data-session-id={r.id}
                href={`/admin/sessions/${r.id}`}
                className="flex flex-col gap-1 rounded-md border px-4 py-3 transition-colors hover:bg-accent"
              >
                <span className="font-medium">{r.title}</span>
                <span className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-3">
                  <span>
                    status:{' '}
                    <span data-testid="admin-session-status">{r.status ?? ADMIN_VALUE_NONE}</span>
                  </span>
                  <span>
                    owner:{' '}
                    <span data-testid="admin-session-owner">{r.teacherId ?? ADMIN_VALUE_NONE}</span>
                  </span>
                  <span>
                    participants:{' '}
                    <span data-testid="admin-session-participant-count">{r.participantCount}</span>
                  </span>
                  <span>
                    resource:{' '}
                    <span data-testid="admin-session-active-resource">
                      {r.activeResourceId ?? ADMIN_VALUE_NONE}
                    </span>
                  </span>
                  <span>
                    url:{' '}
                    <span data-testid="admin-session-current-url">
                      {r.currentUrl ?? ADMIN_VALUE_NONE}
                    </span>
                  </span>
                  <span>
                    open questions:{' '}
                    <span data-testid="admin-session-open-questions">{r.openQuestionCount}</span>
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
