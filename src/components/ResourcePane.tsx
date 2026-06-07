import { useEffect, useRef, useState } from 'react'
import { EMBED_LOAD_TIMEOUT_MS, resourceCardHeading } from '@/lib/embed'

// ---------------------------------------------------------------------------
// Cycle 0016: the shared realtime resource pane. ONE component, mounted in both
// the teacher facilitation view (SessionLifecycle) and the student view
// (StudentSession). It renders from the live session row's `currentUrl` /
// `activeResourceId` — no resources query of its own — so activation propagates
// for free when the host's `db.useQuery` re-renders. The iframe is sandboxed
// WITHOUT `allow-same-origin` (so it is never combined with `allow-scripts`).
// When no resource is active, it renders an explicit empty element, never a
// blank region. It renders resource/session URL fields only — never email.
//
// Cycle 0018: "never a blank pane" (SPEC §8.2). Many real lesson URLs refuse to
// embed (X-Frame-Options / CSP frame-ancestors) or hang — producing a blank or
// broken iframe today. The pane now does best-effort client-side detection: a
// bounded load timeout (`EMBED_LOAD_TIMEOUT_MS`, the DEPENDABLE signal since
// browsers don't reliably surface framing refusals via onError/onLoad) is the
// primary trigger, `onError` is secondary, and a real `onLoad` arriving before the
// deadline cancels the pending timeout (the inline frame stays). Once the timeout
// fires the status settles, the iframe is unmounted and the card replaces it; the
// card then stays — a late `onLoad` cannot clear it and the embed is not re-checked
// until `activeResourceId`/`currentUrlVersion` changes. On a detected block/failure
// it renders a fallback card — the
// resource title (or hostname fallback), the URL as readable text, and an
// "Open externally" action (new tab, `rel="noopener noreferrer"`) — IN PLACE of
// the blank iframe. The card is entirely PROP-DRIVEN, so it appears in both the
// teacher and student contexts and even when no callback is provided / the
// teacher write later fails. Detection state resets when `activeResourceId` or
// `currentUrlVersion` (the same token the iframe is keyed on) changes, so
// switching/broadcasting re-checks the new embed. When a callback is provided
// (teacher only), the settled outcome is reported via `onEmbedBlocked(status)` —
// the convergence guard + per-resource latch live in the caller, never here.
// ---------------------------------------------------------------------------

type EmbedStatus = 'blocked' | 'failed'

export default function ResourcePane({
  activeResourceId,
  currentUrl,
  currentUrlVersion,
  title,
  onEmbedBlocked,
}: {
  activeResourceId?: string | null
  currentUrl?: string | null
  // Cycle 0017: a fresh per-broadcast token. The iframe is keyed on it so every
  // broadcast (including re-broadcasting an identical URL) forces a fresh mount,
  // re-snapping a student who navigated locally inside their iframe. Falls back
  // to `url` for pre-0017 session rows that carry no version.
  currentUrlVersion?: string | null
  // Cycle 0018: the active resource's title, for the fallback card heading. Falls
  // back to the URL hostname when absent, so the card is never headingless.
  title?: string | null
  // Cycle 0018: teacher-only. Reports a settled blocked/failed outcome so the
  // teacher's client can persist it. Omitted in the student context (students
  // cannot write `sessionResources` — their fallback card is local-only).
  onEmbedBlocked?: (status: EmbedStatus) => void
}) {
  const url = (currentUrl ?? '').trim()
  // Detection state: 'pending' until the iframe loads or the timeout/`onError`
  // settles it. The reset key is the same token the iframe is keyed on.
  const resetKey = currentUrlVersion ?? url
  const [status, setStatus] = useState<'pending' | 'loaded' | EmbedStatus>('pending')
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // (Re)start detection whenever the active resource / URL version changes. The
  // cleanup clears the pending timeout on reset + unmount, so a stale timer never
  // fires against a since-changed embed (no leak).
  useEffect(() => {
    if (!activeResourceId || url === '') {
      setStatus('loaded')
      return
    }
    setStatus('pending')
    timeoutRef.current = setTimeout(() => setStatus('blocked'), EMBED_LOAD_TIMEOUT_MS)
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
    // `resetKey` folds in `currentUrlVersion ?? url`; `activeResourceId` re-checks
    // a resource switch even if the URL happens to coincide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeResourceId, resetKey, url])

  // Report a settled blocked/failed outcome to the caller (teacher only). The
  // latch/convergence guard live in the caller — never swallowed here.
  useEffect(() => {
    if (status === 'blocked' || status === 'failed') onEmbedBlocked?.(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function clearPendingTimeout() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  if (!activeResourceId || url === '') {
    return (
      <div data-testid="resource-pane" className="rounded-md border">
        <p data-testid="resource-pane-empty" className="p-6 text-sm text-muted-foreground">
          No active resource yet. When the teacher activates a resource it appears here.
        </p>
      </div>
    )
  }

  // Cycle 0018: a detected block/failure replaces the blank iframe with a readable
  // card — title (or hostname), the URL as text, and a working "Open externally"
  // action. Rendered purely from props, so it shows regardless of any write.
  if (status === 'blocked' || status === 'failed') {
    const heading = resourceCardHeading(title, url)
    return (
      <div data-testid="resource-pane" className="rounded-md border">
        <div data-testid="resource-pane-fallback" className="flex flex-col gap-3 p-6">
          <p className="text-sm text-muted-foreground">
            This resource can’t be shown inline here.
          </p>
          <p data-testid="resource-pane-fallback-title" className="font-medium">
            {heading}
          </p>
          <p
            data-testid="resource-pane-fallback-url"
            className="break-all text-sm text-muted-foreground"
          >
            {url}
          </p>
          <a
            data-testid="resource-pane-open-external"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline"
          >
            Open externally
          </a>
        </div>
      </div>
    )
  }

  return (
    <div data-testid="resource-pane" className="rounded-md border">
      <iframe
        key={currentUrlVersion ?? url}
        data-testid="resource-pane-frame"
        data-resource-id={activeResourceId}
        data-url-version={currentUrlVersion ?? undefined}
        src={url}
        title="Active resource"
        className="h-[60vh] w-full"
        sandbox="allow-scripts allow-popups allow-forms"
        referrerPolicy="no-referrer"
        onLoad={() => {
          clearPendingTimeout()
          setStatus('loaded')
        }}
        onError={() => {
          clearPendingTimeout()
          setStatus('failed')
        }}
      />
    </div>
  )
}
