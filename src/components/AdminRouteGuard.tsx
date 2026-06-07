import { type ReactNode } from 'react'
import { db } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'
import { authorizeAdmin } from '@/lib/routing'
import RouteGuard from '@/components/RouteGuard'

// ---------------------------------------------------------------------------
// Global-admin-scoped wrapper around `RouteGuard` for `/admin` (cycle 0019).
// Mirrors `SessionRouteGuard`: the own-`users`-row `db.useQuery` can't run inside
// a predicate closure (hooks can't be conditional), so this wrapper runs the
// query, folds the row's `adminLevel` through the PURE `authorizeAdmin` helper,
// and hands `RouteGuard` a precomputed decision. `RouteGuard` settles the
// unauthenticated / loading / auth-error cases first; `authorize` only refines
// the authenticated case (authorized ONLY for an `uber` admin).
//
// Identity is read exclusively through `useAuth` (never `db.useAuth()`), per the
// single-auth-seam rule. The query is null-guarded until the auth id resolves.
// ---------------------------------------------------------------------------

export default function AdminRouteGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const authUserId = user?.id ?? null
  const q = db.useQuery(
    authUserId ? { users: { $: { where: { id: authUserId } } } } : null
  )
  // Query error: surface it (never swallow) — `authorizeAdmin` then forces
  // `denied`, so the guard renders denial rather than hanging on a spinner.
  if (q.error) console.error('[AdminRouteGuard] users query error:', q.error)

  const adminLevel = q.data?.users?.[0]?.adminLevel
  const decision = authorizeAdmin({
    adminLevel,
    loading: q.isLoading,
    error: !!q.error,
  })

  return <RouteGuard authorize={decision}>{children}</RouteGuard>
}
