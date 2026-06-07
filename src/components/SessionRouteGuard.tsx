import { type ReactNode } from 'react'
import { db } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'
import { authorizeOwnership } from '@/lib/routing'
import RouteGuard from '@/components/RouteGuard'

// ---------------------------------------------------------------------------
// Ownership-scoped wrapper around `RouteGuard` for `/dashboard/sessions/[id]`
// (cycle 0004). The owning `db.useQuery` (sessions read is open per cycle-0003
// perms) cannot run inside a predicate closure — hooks can't be conditional — so
// this wrapper runs the query, folds the result through the PURE
// `authorizeOwnership` helper, and hands `RouteGuard` a precomputed decision.
// `RouteGuard` settles the unauthenticated / loading / auth-error cases first;
// `authorize` only refines the authenticated case.
// ---------------------------------------------------------------------------

export default function SessionRouteGuard({
  sessionId,
  children,
}: {
  sessionId: string
  children: ReactNode
}) {
  const { user } = useAuth()
  const q = db.useQuery(sessionId ? { sessions: { $: { where: { id: sessionId } } } } : null)
  // Query error: surface it (never swallow) — `authorizeOwnership` then forces
  // `denied`, so the guard renders denial rather than hanging on a spinner.
  if (q.error) console.error('[SessionRouteGuard] session query error:', q.error)

  const ownerId = q.data?.sessions?.[0]?.teacherId ?? null
  const decision = authorizeOwnership({
    userId: user?.id,
    ownerId,
    loading: q.isLoading,
    error: !!q.error,
  })

  return <RouteGuard authorize={decision}>{children}</RouteGuard>
}
