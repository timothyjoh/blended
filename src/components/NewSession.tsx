import { useState } from 'react'
import { useAuth } from '@/lib/useAuth'
import { createSession, type SessionRecord } from '@/lib/sessions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ---------------------------------------------------------------------------
// The "New session" dashboard control (cycle 0005). Mounted inside the existing
// `RouteGuard` on `/dashboard`, so it hydrates only when authenticated. It reads
// identity through `useAuth` (never `db.useAuth()`), collects a title, and calls
// `createSession`, which routes the dual-write through `writeEvent`. On success
// it renders the created session (title, `draft` status, join code) without
// navigating away; on any failure it surfaces an inline `role="alert"` error AND
// `console.error`s — never swallowed. Creating a session makes the user its
// teacher (session-scoped role, no account type). Shows title only — never raw
// email (SPEC §40).
// ---------------------------------------------------------------------------

export default function NewSession() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [created, setCreated] = useState<SessionRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function surface(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setError(message)
    console.error('[NewSession] createSession failed:', err)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // Defense-in-depth behind RouteGuard: refuse to write with no auth id.
    if (!user?.id) {
      setError('You must be signed in to create a session')
      return
    }
    setPending(true)
    try {
      const record = await createSession({ title, teacherId: user.id })
      setCreated(record)
      setTitle('')
    } catch (err) {
      // Both the synchronous validation throw (blank title) and an async
      // `writeEvent` rejection (permission/collision/network) land here; the
      // created-session UI state is left untouched (no half-created session).
      surface(err)
    } finally {
      setPending(false)
    }
  }

  const errorEl = error ? (
    <p data-testid="new-session-error" role="alert" className="mt-3 text-sm text-destructive">
      {error}
    </p>
  ) : null

  if (!open) {
    return (
      <div className="mt-6 flex flex-col">
        <Button data-testid="new-session-open" onClick={() => setOpen(true)}>
          New session
        </Button>
        {errorEl}
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <form data-testid="new-session-form" onSubmit={onSubmit} className="flex flex-col gap-3">
        <label htmlFor="new-session-title" className="text-sm font-medium">
          Session title
        </label>
        <Input
          id="new-session-title"
          data-testid="new-session-title"
          type="text"
          placeholder="e.g. Algebra — Lesson 3"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button data-testid="new-session-submit" type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create session'}
        </Button>
        {errorEl}
      </form>

      {created && (
        <Card data-testid="created-session">
          <CardHeader>
            <CardTitle data-testid="created-session-title">{created.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>
              Status:{' '}
              <span data-testid="created-session-status" className="font-medium">
                {created.status}
              </span>
            </p>
            <p>
              Join code:{' '}
              <code data-testid="created-session-joincode" className="font-mono font-medium">
                {created.joinCode}
              </code>
            </p>
            <p className="text-muted-foreground">
              You’re the teacher of this session. Share the join code to let students in.
            </p>
            <a
              data-testid="created-session-link"
              href={`/dashboard/sessions/${created.id}`}
              className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open session
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
