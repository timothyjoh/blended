import { useRef, useState } from 'react'
import { db } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'
import {
  startSession,
  endSession,
  isJoinEnabled,
  answerQuestion,
  queueResource,
  activateResource,
  broadcastResourceUrl,
  recordEmbedStatus,
  RESOURCE_TYPES,
} from '@/lib/sessions'
import { validateResourceUrl } from '@/lib/resources'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ResourcePane from './ResourcePane'

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
//
// Cycle 0015: below the question queue it also mounts the teacher add-resource
// control + a realtime, read-only queue list. A THIRD `db.useQuery` over
// `sessionResources` by `sessionId` renders the queued resources ordered by
// `sortOrder` (tie-broken by id). The add form (url + title + type selector) gates
// the URL through the single `validateResourceUrl` seam BEFORE any write — an
// unsafe-scheme/blank/unparseable URL surfaces inline (`role="alert"`) +
// `console.error` and writes nothing — then routes the dual-write through the sole
// sanctioned `queueResource` → a `ResourceQueued` event + `sessionResources` row in
// one transaction, placing the new resource at the end of the queue
// (`currentMaxSortOrder` derived from the live query). A query error renders an
// inline alert checked BEFORE the empty state (an errored query never reads as
// falsely-empty); a rejected write surfaces inline and retains the entered values
// for retry; a per-submit pending latch suppresses a double-submit. Reorder/remove/
// embed-check are deferred to sibling cycles.
//
// Cycle 0016: each queued resource row carries an **Activate** control routing the
// sole sanctioned `activateResource` → a `ResourceActivated` dual-write that sets
// the session's `activeResourceId` + derived `currentUrl` in one transaction. The
// active row is marked `data-active="true"` and its button reads "Active" + is
// disabled. The shared `ResourcePane` (also mounted in the student view) renders
// the active resource in a sandboxed iframe from the live session row, switching
// live with no reload; before any activation it shows an explicit empty state. A
// failed activation surfaces inline (`role="alert"`) + `console.error`, leaving the
// live row unchanged; a per-row pending latch suppresses a double-submit.
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

  // Cycle 0015: realtime resource queue. A third live query over
  // `sessionResources` by `sessionId`. Add-form drafts, a per-submit pending
  // latch, and a dedicated error string surfaced inline (never swallowed).
  const rq = db.useQuery(
    sessionId ? { sessionResources: { $: { where: { sessionId } } } } : null
  )
  const [resUrl, setResUrl] = useState('')
  const [resTitle, setResTitle] = useState('')
  const [resType, setResType] = useState<string>('generic_url')
  const [resError, setResError] = useState<string | null>(null)
  const [resPending, setResPending] = useState(false)

  // Cycle 0016: per-row activation. A pending latch (the resource id in flight)
  // suppresses a double-submit; a dedicated error string surfaces inline.
  const [activatingId, setActivatingId] = useState<string | null>(null)
  const [activateError, setActivateError] = useState<string | null>(null)

  // Cycle 0017: teacher current-URL broadcast. A URL draft, a dedicated error
  // string surfaced inline (never swallowed), and a per-action pending latch that
  // suppresses a double-submit. Enabled only when a resource is active.
  const [broadcastUrl, setBroadcastUrl] = useState('')
  const [broadcastError, setBroadcastError] = useState<string | null>(null)
  const [broadcastPending, setBroadcastPending] = useState(false)

  // Cycle 0018: blocked-embed fallback. A dedicated error string surfaced inline
  // (never swallowed) when the teacher-side `recordEmbedStatus` write is rejected,
  // and a per-resource latch (keyed by resource id + the broadcast version) that —
  // together with a convergence guard against the live `embedStatus` — suppresses
  // duplicate `ResourceEmbedChecked` writes from repeated detections. The latch key
  // includes the version token so a re-broadcast/re-activation re-checks the embed.
  const [embedStatusError, setEmbedStatusError] = useState<string | null>(null)
  const embedWrittenRef = useRef<Set<string>>(new Set())

  // Query errors: surface them (never swallow). The controls are gated on a
  // loaded session below, so a failed query renders the non-actionable error
  // state; a failed questions query is logged and the queue stays empty/observable.
  if (q.error) console.error('[SessionLifecycle] session query error:', q.error)
  if (qq.error) console.error('[SessionLifecycle] questions query error:', qq.error)
  if (rq.error) console.error('[SessionLifecycle] resources query error:', rq.error)

  const session = q.data?.sessions?.[0] ?? null

  // Cycle 0015: ordered queue (inline comparator, mirroring the question sort) —
  // by sortOrder, tie-broken by id for a stable order without a server index.
  const resources = [...(rq.data?.sessionResources ?? [])].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
  const currentMaxSortOrder = resources.length
    ? Math.max(...resources.map((r) => r.sortOrder))
    : null

  async function addResource() {
    setResError(null)
    if (!user?.id) {
      setResError('You must be signed in to queue a resource')
      return
    }
    // Client-side gate through the SINGLE validation seam BEFORE any write — an
    // unsafe scheme / blank / unparseable URL is rejected with no `queueResource`
    // call, entered values retained.
    const valid = validateResourceUrl(resUrl)
    if (!valid.ok) {
      setResError(
        valid.reason === 'unsafe_scheme'
          ? 'That URL scheme is not allowed. Use an http(s) link.'
          : valid.reason === 'blank'
            ? 'Enter a URL.'
            : 'That URL could not be parsed.'
      )
      console.error('[SessionLifecycle] add resource rejected:', valid.reason)
      return
    }
    if ((resTitle ?? '').trim() === '') {
      setResError('Enter a title.')
      return
    }
    setResPending(true)
    try {
      await queueResource({
        sessionId,
        url: resUrl,
        title: resTitle,
        type: resType,
        actor: { id: user.id, role: 'teacher' },
        currentMaxSortOrder,
      })
      // Clear the form only on success; the live query renders the new row.
      setResUrl('')
      setResTitle('')
      setResType('generic_url')
    } catch (err) {
      // Surface the rejection inline + log — never swallowed; retain inputs for retry.
      const message = err instanceof Error ? err.message : String(err)
      setResError(message)
      console.error('[SessionLifecycle] add resource failed:', err)
    } finally {
      setResPending(false)
    }
  }

  async function activate(resourceId: string) {
    setActivateError(null)
    if (!user?.id) {
      setActivateError('You must be signed in to activate a resource')
      return
    }
    setActivatingId(resourceId)
    try {
      // Route the dual-write through the sole sanctioned path. On success the live
      // session query advances `activeResourceId`/`currentUrl` and the pane re-renders.
      await activateResource({
        sessionId,
        resourceId,
        actor: { id: user.id, role: 'teacher' },
        resources,
      })
    } catch (err) {
      // Surface inline + log — never swallowed; the live row is unchanged so the
      // resource stays activatable for a retry.
      const message = err instanceof Error ? err.message : String(err)
      setActivateError(message)
      console.error('[SessionLifecycle] activate failed:', err)
    } finally {
      setActivatingId(null)
    }
  }

  async function broadcast() {
    setBroadcastError(null)
    if (!user?.id) {
      setBroadcastError('You must be signed in to broadcast a URL')
      return
    }
    if (!session?.activeResourceId) {
      // Structurally prevented by the disabled control, but guarded in depth.
      setBroadcastError('Activate a resource before broadcasting a URL')
      return
    }
    // Client-side gate through the SINGLE validation seam BEFORE any write — an
    // unsafe scheme / blank / unparseable URL is rejected with no
    // `broadcastResourceUrl` call, the entered value retained.
    const valid = validateResourceUrl(broadcastUrl)
    if (!valid.ok) {
      setBroadcastError(
        valid.reason === 'unsafe_scheme'
          ? 'That URL scheme is not allowed. Use an http(s) link.'
          : valid.reason === 'blank'
            ? 'Enter a URL.'
            : 'That URL could not be parsed.'
      )
      console.error('[SessionLifecycle] broadcast rejected:', valid.reason)
      return
    }
    setBroadcastPending(true)
    try {
      // Route the dual-write through the sole sanctioned path. On success the live
      // session query advances `currentUrl`/`currentUrlVersion`; the version-keyed
      // pane remounts for every connected view.
      await broadcastResourceUrl({
        sessionId,
        url: broadcastUrl,
        actor: { id: user.id, role: 'teacher' },
        activeResourceId: session.activeResourceId,
      })
      // Clear the field only on success; the live query re-syncs the pane.
      setBroadcastUrl('')
    } catch (err) {
      // Surface inline + log — never swallowed; retain the entered URL for retry.
      const message = err instanceof Error ? err.message : String(err)
      setBroadcastError(message)
      console.error('[SessionLifecycle] broadcast failed:', err)
    } finally {
      setBroadcastPending(false)
    }
  }

  // Cycle 0018: the live active resource (for the pane's fallback title + the
  // convergence guard). Matched by the session's `activeResourceId`.
  const activeResource = resources.find((r) => r.id === session?.activeResourceId) ?? null

  // Cycle 0018: the `ResourcePane` reports a settled blocked/failed embed. Persist
  // it via the sole sanctioned `recordEmbedStatus` path. A per-resource latch +
  // convergence guard suppress duplicate writes from repeated detections; a
  // rejected write surfaces inline (`role="alert"`) + `console.error` and is never
  // swallowed — the fallback card (prop-driven in the pane) stays visible
  // regardless. The latch key folds in the version token so a re-broadcast/
  // re-activation re-checks the new embed.
  async function onEmbedBlocked(detected: 'blocked' | 'failed') {
    setEmbedStatusError(null)
    const resourceId = session?.activeResourceId
    if (!user?.id || !resourceId) return
    const latchKey = `${resourceId}::${session?.currentUrlVersion ?? session?.currentUrl ?? ''}`
    if (embedWrittenRef.current.has(latchKey)) return
    if (activeResource?.embedStatus === detected) {
      // Already converged to this status — don't re-append an event, but latch so
      // repeated detections of the same settled outcome stay quiet.
      embedWrittenRef.current.add(latchKey)
      return
    }
    embedWrittenRef.current.add(latchKey)
    try {
      await recordEmbedStatus({
        sessionId,
        resourceId,
        embedStatus: detected,
        actor: { id: user.id, role: 'teacher' },
      })
    } catch (err) {
      // Allow a retry on failure: drop the latch, surface inline + log. The card
      // stays visible (the visual guarantee does not depend on this write).
      embedWrittenRef.current.delete(latchKey)
      const message = err instanceof Error ? err.message : String(err)
      setEmbedStatusError(message)
      console.error('[SessionLifecycle] record embed status failed:', err)
    }
  }

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
          <CardTitle>Active resource</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Cycle 0017: teacher current-URL broadcast control. Always rendered
              (stable testids) but non-actionable until a resource is active. */}
          <div data-testid="broadcast-url-control" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                data-testid="broadcast-url-input"
                className="flex-1 rounded-md border px-2 py-1 text-sm"
                placeholder="https://… broadcast the next URL"
                value={broadcastUrl}
                disabled={!session.activeResourceId}
                onChange={(e) => setBroadcastUrl(e.target.value)}
              />
              <Button
                data-testid="broadcast-url-submit"
                disabled={!session.activeResourceId || broadcastPending}
                onClick={broadcast}
              >
                {broadcastPending ? 'Broadcasting…' : 'Broadcast'}
              </Button>
            </div>
            {broadcastError ? (
              <p
                data-testid="broadcast-url-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {broadcastError}
              </p>
            ) : null}
          </div>
          {/* Cycle 0016: the shared pane, driven by the live session row.
              Cycle 0017: version-keyed so each broadcast remounts the iframe.
              Cycle 0018: supply the active resource title for the fallback card
              heading and a teacher-only callback that records a settled
              blocked/failed embed outcome. */}
          <ResourcePane
            activeResourceId={session.activeResourceId}
            currentUrl={session.currentUrl}
            currentUrlVersion={session.currentUrlVersion}
            title={activeResource?.title}
            onEmbedBlocked={onEmbedBlocked}
          />
          {embedStatusError ? (
            <p
              data-testid="embed-status-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {embedStatusError}
            </p>
          ) : null}
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>Resources</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <input
              data-testid="add-resource-url"
              className="rounded-md border px-2 py-1 text-sm"
              placeholder="https://… resource URL"
              value={resUrl}
              onChange={(e) => setResUrl(e.target.value)}
            />
            <input
              data-testid="add-resource-title"
              className="rounded-md border px-2 py-1 text-sm"
              placeholder="Resource title"
              value={resTitle}
              onChange={(e) => setResTitle(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <select
                data-testid="add-resource-type"
                className="rounded-md border px-2 py-1 text-sm"
                value={resType}
                onChange={(e) => setResType(e.target.value)}
              >
                {RESOURCE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Button
                data-testid="add-resource-submit"
                disabled={resPending}
                onClick={addResource}
              >
                {resPending ? 'Adding…' : 'Add'}
              </Button>
            </div>
            {resError ? (
              <p
                data-testid="add-resource-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {resError}
              </p>
            ) : null}
          </div>

          <div data-testid="resource-queue" className="flex flex-col gap-2">
            {rq.error ? (
              <p
                data-testid="resource-queue-error"
                role="alert"
                className="text-sm text-destructive"
              >
                The resource queue could not be loaded.
              </p>
            ) : rq.isLoading ? (
              <p
                data-testid="resource-queue-loading"
                className="text-sm text-muted-foreground"
              >
                Loading resources…
              </p>
            ) : resources.length === 0 ? (
              <p
                data-testid="resource-queue-empty"
                className="text-sm text-muted-foreground"
              >
                No resources queued yet. Add one above and it appears here in real time.
              </p>
            ) : (
              resources.map((r) => {
                const isActive = session.activeResourceId === r.id
                return (
                  <div
                    key={r.id}
                    data-testid="resource-item"
                    data-resource-id={r.id}
                    data-sort-order={r.sortOrder}
                    data-active={isActive ? 'true' : undefined}
                    className="flex flex-col gap-1 rounded-md border p-3"
                  >
                    <p data-testid="resource-title" className="text-sm font-medium">
                      {r.title}
                    </p>
                    <p
                      data-testid="resource-url"
                      className="break-all text-xs text-muted-foreground"
                    >
                      {r.url}
                    </p>
                    <p data-testid="resource-type" className="text-xs text-muted-foreground">
                      {r.type}
                    </p>
                    <div className="mt-1">
                      <Button
                        data-testid="activate-resource"
                        variant={isActive ? 'default' : 'outline'}
                        disabled={resPending || activatingId === r.id || isActive}
                        onClick={() => activate(r.id)}
                      >
                        {isActive ? 'Active' : activatingId === r.id ? 'Activating…' : 'Activate'}
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
            {activateError ? (
              <p
                data-testid="activate-resource-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {activateError}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
