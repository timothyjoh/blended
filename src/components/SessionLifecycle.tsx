import { useState } from 'react'
import { db } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'
import { startSession, endSession, isJoinEnabled, answerQuestion } from '@/lib/sessions'
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
//
// Cycle 0010: below the lifecycle controls it also mounts the teacher question
// queue — a realtime, session-scoped list of OPEN Questions only (a second
// `db.useQuery` over `questions` by `sessionId`, filtered `status !== 'answered'`,
// sorted client-side by `createdAt` then `id`). Each row shows the Question's
// source-message text (reached strictly via the `questionMessage` link in the
// same query — there is NO standalone `messages` query and NO chat island, so the
// teacher exclusion of SPEC §9.3 is preserved and a non-`?` chat message can never
// enter the queue) and a mark-answered control with an optional summary input.
// Resolving routes through the sole sanctioned `answerQuestion` → a
// `QuestionAnswered` dual-write; on success the live query drops the row. A query
// error or a rejected write surfaces inline (`role="alert"`) + `console.error`,
// never swallowed, leaving the Question in the queue so the teacher can retry; a
// per-Question pending latch + the builder's already-answered guard suppress a
// double-resolution.
// ---------------------------------------------------------------------------

export default function SessionLifecycle({ sessionId }: { sessionId: string }) {
  const { user } = useAuth()
  const q = db.useQuery(sessionId ? { sessions: { $: { where: { id: sessionId } } } } : null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // Cycle 0010: realtime open-Question queue. A second live query over
  // `questions` by `sessionId`, pulling each Question's source-message text via
  // the `questionMessage` link (no standalone `messages` query — teacher
  // exclusion preserved). Per-Question summary drafts, a per-Question pending
  // latch, and a dedicated queue error string surfaced through `surfaceQuestion`.
  const qq = db.useQuery(sessionId ? { questions: { $: { where: { sessionId } }, message: {} } } : null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [qError, setQError] = useState<string | null>(null)

  // Query errors: surface them (never swallow). The controls are gated on a
  // loaded session below, so a failed query renders the non-actionable error
  // state; a failed questions query is logged and the queue stays empty/observable.
  if (q.error) console.error('[SessionLifecycle] session query error:', q.error)
  if (qq.error) console.error('[SessionLifecycle] questions query error:', qq.error)

  const session = q.data?.sessions?.[0] ?? null

  // Open Questions only (answered ones leave the queue), sorted by createdAt then
  // id for a stable order without a server-side index (mirrors StudentChat).
  const openQuestions = [...(qq.data?.questions ?? [])]
    .filter((x) => x.status !== 'answered')
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
    })

  function surfaceQuestion(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setQError(message)
    console.error('[SessionLifecycle] answer failed:', err)
  }

  async function markAnswered(question: { id: string; status: string }) {
    setQError(null)
    if (!user?.id) {
      setQError('You must be signed in to answer a question')
      return
    }
    setPendingId(question.id)
    try {
      await answerQuestion({
        questionId: question.id,
        sessionId,
        currentStatus: question.status,
        actor: { id: user.id, role: 'teacher' },
        answerSummary: drafts[question.id],
      })
      // On success the live query drops the answered row; nothing local to set
      // beyond clearing this Question's draft.
      setDrafts((d) => {
        const next = { ...d }
        delete next[question.id]
        return next
      })
    } catch (err) {
      // Leave the Question in the queue (driven by the unchanged live query) and
      // surface the failure inline — never swallowed.
      surfaceQuestion(err)
    } finally {
      setPendingId(null)
    }
  }

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

      <Card>
        <CardHeader>
          <CardTitle>Questions</CardTitle>
        </CardHeader>
        <CardContent>
          <div data-testid="teacher-question-queue" className="flex flex-col gap-3">
            {openQuestions.length === 0 ? (
              <p
                data-testid="teacher-question-queue-empty"
                className="text-sm text-muted-foreground"
              >
                No open questions yet. Student questions will appear here in real time.
              </p>
            ) : (
              openQuestions.map((question) => (
                <div
                  key={question.id}
                  data-testid="teacher-question-item"
                  data-question-id={question.id}
                  className="flex flex-col gap-2 rounded-md border p-3"
                >
                  <p data-testid="teacher-question-text" className="text-sm">
                    {question.message?.text ?? '(question text unavailable)'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      data-testid="question-answer-summary"
                      className="flex-1 rounded-md border px-2 py-1 text-sm"
                      placeholder="Optional answer summary"
                      value={drafts[question.id] ?? ''}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [question.id]: e.target.value }))
                      }
                    />
                    <Button
                      data-testid="question-mark-answered"
                      variant="outline"
                      disabled={pendingId === question.id}
                      onClick={() => markAnswered(question)}
                    >
                      {pendingId === question.id ? 'Working…' : 'Mark answered'}
                    </Button>
                  </div>
                </div>
              ))
            )}
            {qError ? (
              <p
                data-testid="teacher-question-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {qError}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
