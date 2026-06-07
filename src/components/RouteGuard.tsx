import { useEffect, useRef, type ReactNode } from 'react'
import { useAuth } from '@/lib/useAuth'
import { loginRedirectTarget, type AuthzDecision } from '@/lib/routing'

// ---------------------------------------------------------------------------
// The SINGLE client-side route guard for protected islands (cycle 0004). It
// reads identity EXCLUSIVELY through `useAuth` (never `db.useAuth()` — AGENTS.md
// single-auth-seam rule) and resolves four states:
//   - loading      → stable `route-guard-loading` shell, NO redirect (avoids a
//                    flash-redirect before auth resolves)
//   - unauthenticated → `window.location.replace` to `/login?next=<encoded dest>`
//                    so the intended destination survives the login round-trip
//   - auth error   → `route-guard-denied` (logged, never collapsed to "authed")
//   - authorized   → renders children
// Ownership-scoped routes pass a PRECOMPUTED `authorize` decision (the owning
// `db.useQuery` cannot run inside a predicate closure — see SessionRouteGuard),
// which only refines the already-authenticated state.
// ---------------------------------------------------------------------------

export default function RouteGuard({
  children,
  authorize,
}: {
  children: ReactNode
  authorize?: AuthzDecision
}) {
  const { user, isLoading, error } = useAuth()
  // One-shot latch so a re-render / StrictMode double-invoke never double-navigates.
  const redirected = useRef(false)

  useEffect(() => {
    // Only redirect once auth has RESOLVED to "no user" and there is no auth
    // error (an error is surfaced as denial, not a bounce). Loading never
    // redirects — prevents the flash-redirect before auth settles.
    if (isLoading || error || user || redirected.current) return
    if (typeof window === 'undefined') return
    redirected.current = true
    window.location.replace(
      loginRedirectTarget({
        pathname: window.location.pathname,
        search: window.location.search,
      })
    )
  }, [isLoading, error, user])

  // Auth-subsystem error: surface (log) AND render denial — never silently treat
  // as authenticated (SPEC §45).
  if (error) {
    console.error('[RouteGuard] auth error:', error)
    return (
      <p data-testid="route-guard-denied" role="alert" className="text-sm text-destructive">
        You don’t have access.
      </p>
    )
  }

  // Loading auth, or resolved-but-unauthenticated (the effect above is bouncing
  // us to /login): hold the stable loading shell, never the protected children.
  if (isLoading || !user) {
    return (
      <p data-testid="route-guard-loading" className="text-sm text-muted-foreground">
        Loading…
      </p>
    )
  }

  // Authenticated — refine with the optional ownership decision.
  if (authorize === 'loading') {
    return (
      <p data-testid="route-guard-loading" className="text-sm text-muted-foreground">
        Loading…
      </p>
    )
  }
  if (authorize === 'denied') {
    return (
      <p data-testid="route-guard-denied" role="alert" className="text-sm text-destructive">
        You don’t have access.
      </p>
    )
  }

  return <>{children}</>
}
