// ---------------------------------------------------------------------------
// Cycle 0016: the shared realtime resource pane. ONE component, mounted in both
// the teacher facilitation view (SessionLifecycle) and the student view
// (StudentSession). It renders from the live session row's `currentUrl` /
// `activeResourceId` — no resources query of its own — so activation propagates
// for free when the host's `db.useQuery` re-renders. The iframe is sandboxed
// WITHOUT `allow-same-origin` (so it is never combined with `allow-scripts`);
// embeds requiring same-origin are the deferred blocked-embed concern. When no
// resource is active, it renders an explicit empty element, never a blank region.
// It renders resource/session URL fields only — never email.
// ---------------------------------------------------------------------------

export default function ResourcePane({
  activeResourceId,
  currentUrl,
}: {
  activeResourceId?: string | null
  currentUrl?: string | null
}) {
  const url = (currentUrl ?? '').trim()
  if (!activeResourceId || url === '') {
    return (
      <div data-testid="resource-pane" className="rounded-md border">
        <p data-testid="resource-pane-empty" className="p-6 text-sm text-muted-foreground">
          No active resource yet. When the teacher activates a resource it appears here.
        </p>
      </div>
    )
  }
  return (
    <div data-testid="resource-pane" className="rounded-md border">
      <iframe
        data-testid="resource-pane-frame"
        data-resource-id={activeResourceId}
        src={url}
        title="Active resource"
        className="h-[60vh] w-full"
        sandbox="allow-scripts allow-popups allow-forms"
        referrerPolicy="no-referrer"
      />
    </div>
  )
}
