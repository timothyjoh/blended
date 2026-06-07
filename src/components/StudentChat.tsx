import { useRef, useState } from 'react'
import { db, id } from '@/lib/db'
import { useAuth } from '@/lib/useAuth'
import { isJoinEnabled, shouldSubmitChatMessage, submitChatMessage } from '@/lib/sessions'

// ---------------------------------------------------------------------------
// The student chat island (cycle 0008). Mounted beside `StudentSession` inside
// `RouteGuard` on `/s/[joinCode]`, it is the FIRST surface where a student can
// participate: a single natural-text input (no message-type selector, SPEC §9.1)
// + a realtime-syncing message stream. It reads identity through `useAuth` (never
// `db.useAuth()`), resolves the Session by `joinCode`, resolves the caller's own
// participant from the session's participant set, and gates input SOLELY on
// `isJoinEnabled` (live) AND the participant's `chatStatus === 'allowed'`.
//
// Submitting non-blank text dual-writes a `ChatMessageSubmitted` envelope + a
// `messages` projection row in ONE transaction via the sanctioned
// `submitChatMessage` path. Idempotency per logical submit: a per-submit
// `currentActionId` ref mints one `id()` reused as the deterministic `messages`
// row id; `shouldSubmitChatMessage` + an `inFlight` ref latch suppress a
// double-fire, and the keyed-upsert id collapses any duplicate to one row. On
// success the input + action-id ref clear (next send mints a fresh id); on failure
// the id is RETAINED so a retry reuses it. Every failure renders an observable,
// non-blank state AND logs — never swallowed. The stream renders the participant
// `username` (local-part) only — never an email (privacy is structural).
//
// The teacher facilitation view deliberately does NOT mount this island (SPEC
// §9.3): the teacher works from curated Questions, not the raw chat stream.
// ---------------------------------------------------------------------------

export default function StudentChat({ joinCode }: { joinCode: string }) {
  const { user } = useAuth()
  const inFlight = useRef(false)
  const currentActionId = useRef<string | null>(null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessionQ = db.useQuery(joinCode ? { sessions: { $: { where: { joinCode } } } } : null)
  const session = sessionQ.data?.sessions?.[0] ?? null

  // The session's participant set — drives both the username map for the stream
  // and the caller's own participant resolution (mirroring JoinSession's probe,
  // but reusing the by-session query the page already needs).
  const partsQ = db.useQuery(
    session?.id ? { participants: { $: { where: { sessionId: session.id } } } } : null
  )
  const participants = partsQ.data?.participants ?? []
  const myParticipant = user?.id ? participants.find((p) => p.userId === user.id) ?? null : null
  const participantId = myParticipant?.id ?? null

  // Realtime stream: every message for this session, sorted client-side by
  // createdAt (tie-break by id) so no server-side order index is required.
  const messagesQ = db.useQuery(
    session?.id ? { messages: { $: { where: { sessionId: session.id } } } } : null
  )
  const messagesLoaded = !!session?.id && !messagesQ.isLoading && !messagesQ.error
  const messages = [...(messagesQ.data?.messages ?? [])].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  // Map participantId → username so the stream renders the local-part display
  // name (never an email — the field does not exist on the row).
  const usernameById = new Map(participants.map((p) => [p.id, p.username]))

  const eligible = isJoinEnabled(session) && myParticipant?.chatStatus === 'allowed'

  // Query errors: surface (never swallow). Logged here AND rendered inline through
  // the `student-chat-error` alert below (a failed stream load is observable, not a
  // silently empty stream — SPEC §Requirements/Failure behavior).
  if (sessionQ.error) console.error('[StudentChat] session query error:', sessionQ.error)
  if (partsQ.error) console.error('[StudentChat] participants query error:', partsQ.error)
  if (messagesQ.error) console.error('[StudentChat] messages query error:', messagesQ.error)
  const queryError = sessionQ.error || partsQ.error || messagesQ.error

  function surface(err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    setError(message)
    console.error('[StudentChat] submit failed:', err)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!eligible) {
      // Rejected, never silently dropped — a non-blank, observable message.
      setError('This session isn’t open for chat right now.')
      return
    }
    if (inFlight.current) return
    // Mint one action id per pending submit; reused on retry so a double-fire of
    // the SAME logical submit collapses to one keyed-upsert row.
    if (!currentActionId.current) currentActionId.current = id()
    const clientActionId = currentActionId.current

    const existingForActionId = messages.filter((m) => m.clientActionId === clientActionId).length
    if (
      !shouldSubmitChatMessage({
        authUserId: user?.id,
        participantId,
        messagesLoaded,
        existingForActionId,
        inFlight: inFlight.current,
        text,
      })
    ) {
      // Blank text is the only user-actionable failure here; a non-zero
      // existingForActionId is a duplicate (a silent no-op for storage). Any other
      // non-blank rejection (e.g. stream not yet loaded) is surfaced, not dropped.
      if (text.trim() === '') {
        setError('Type a message before sending.')
      } else if (existingForActionId === 0) {
        setError('Chat isn’t ready yet — please retry.')
      }
      return
    }

    inFlight.current = true
    setPending(true)
    try {
      await submitChatMessage({
        sessionId: session!.id,
        participantId,
        userId: user!.id,
        clientActionId,
        text,
      })
      // Success: clear the input + mint a fresh id for the next send.
      setText('')
      currentActionId.current = null
    } catch (err) {
      // Keep the action id so a retry reuses it (idempotent).
      surface(err)
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }

  const disabled = !eligible || pending

  return (
    <div data-testid="student-chat-root" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">Chat</p>

      <ul data-testid="student-chat-stream" className="flex flex-col gap-1">
        {messages.map((m) => (
          <li
            key={m.id}
            data-testid="student-chat-message-item"
            className="text-sm"
          >
            <span className="font-medium">{usernameById.get(m.participantId) ?? 'student'}</span>
            {': '}
            <span>{m.text}</span>
          </li>
        ))}
      </ul>

      {error || queryError ? (
        <p data-testid="student-chat-error" role="alert" className="text-sm text-destructive">
          {error ?? 'Chat is temporarily unavailable — please retry.'}
        </p>
      ) : null}

      {!eligible ? (
        <p data-testid="student-chat-disabled" className="text-sm text-muted-foreground">
          Chat opens when the session is live.
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <input
          data-testid="student-chat-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder="Type a message…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Message"
        />
        <button
          data-testid="student-chat-send"
          type="submit"
          disabled={disabled}
          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
