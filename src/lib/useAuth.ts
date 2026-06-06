import { useEffect, useRef } from 'react'
import type { User as AuthUser } from '@instantdb/react'
import { db, writeEvent } from '@/lib/db'
import {
  IDENTITY_SCOPE,
  USER_SIGNED_IN,
  deriveUsername,
  shouldCreateUserRow,
} from '@/lib/auth'

// ---------------------------------------------------------------------------
// The SINGLE app-wide auth seam (SPEC §38). Every teacher/student/admin passes
// through this hook; product code MUST NOT call `db.useAuth()` directly. It
// wraps the InstantDB auth surface, exposes the derived username (never the raw
// email in UI, SPEC §40), and performs idempotent first-sign-in `users`-row
// creation routed through `writeEvent()` under the `IDENTITY_SCOPE` sentinel.
// ---------------------------------------------------------------------------

export type UseAuth = {
  /** InstantDB auth user (id, email). `null`/`undefined` when signed out. */
  user: AuthUser | null | undefined
  isLoading: boolean
  /** Auth-subsystem error message (e.g. session refresh failure), or null. */
  error: string | null
  /** Derived username = email local-part. Empty string when signed out. */
  username: string
  sendCode: (email: string) => Promise<void>
  verifyCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): UseAuth {
  const { isLoading, user, error } = db.useAuth()
  const authUserId = user?.id ?? null
  // Guards against a double-fire of the creation effect under fast re-render.
  const inFlight = useRef(false)

  // Query the `users` projection by auth id to drive the create-only-if-absent
  // guard. `null` query when signed out → InstantDB skips it.
  const usersQ = db.useQuery(authUserId ? { users: { $: { where: { id: authUserId } } } } : null)
  const usersLoaded = !!authUserId && !usersQ.isLoading && !usersQ.error
  const existingUserCount = usersQ.data?.users?.length ?? 0
  const email = user?.email ?? null

  useEffect(() => {
    if (
      !shouldCreateUserRow({
        authUserId,
        usersLoaded,
        existingUserCount,
        inFlight: inFlight.current,
      })
    ) {
      return
    }
    inFlight.current = true
    const username = deriveUsername(email)
    // The users entity id IS the auth user id, so this is a keyed upsert — even a
    // duplicate-effect race resolves to a single row. `writeEvent` is atomic
    // (event + projection commit together), so a rejection leaves no partial row.
    writeEvent(
      USER_SIGNED_IN,
      {
        sessionId: IDENTITY_SCOPE,
        actor: { id: authUserId, role: 'unknown' },
        payload: { userId: authUserId, username },
      },
      [
        db.tx.users[authUserId as string].update({
          email: email ?? undefined,
          username,
          adminLevel: 0,
          createdAt: Date.now(),
        }),
      ]
    )
      .catch((err: unknown) => {
        // Surface, never swallow. Auth state still reflects the live session; the
        // guarded creation re-attempts on the next auth/query resolution rather
        // than crashing the app (SPEC §47).
        console.error('[useAuth] users row creation failed:', err)
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [authUserId, usersLoaded, existingUserCount, email])

  return {
    user,
    isLoading,
    error: error?.message ?? null,
    username: deriveUsername(email),
    sendCode: (addr: string) => db.auth.sendMagicCode({ email: addr }).then(() => {}),
    verifyCode: (addr: string, code: string) =>
      db.auth.signInWithMagicCode({ email: addr, code }).then(() => {}),
    signOut: () => db.auth.signOut(),
  }
}
