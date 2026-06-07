# SPEC — Cycle 0018: Blocked-embed fallback card (never a blank pane)

## WHY
Cycle 0016 renders the active resource in a sandboxed iframe (`ResourcePane`), and cycle 0017 re-snaps it on each broadcast. But many real lesson URLs refuse to embed: sites send `X-Frame-Options: DENY` / `Content-Security-Policy: frame-ancestors`, and our sandbox deliberately omits `allow-same-origin`, so anything needing same-origin breaks too. Other URLs simply fail or hang. Today every one of those produces a **blank or broken iframe** with no title, no link, and no way out — the student is stranded and the teacher cannot tell the room "open it yourselves." SPEC §8.2 is explicit: *Blended MUST NOT silently show a blank resource pane; a blocked embed MUST produce a visible fallback and event evidence.* That guarantee is currently unmet.

## CONCRETE USER BENEFIT
When a teacher activates (or broadcasts) a resource that cannot be embedded, every person in the session — the teacher and every student — sees a **fallback card** showing the resource's title and URL with a working "Open externally" button that launches it in a new tab. Nobody is left staring at an empty rectangle; the lesson can continue with one click. Resources that *do* embed are unaffected and still render inline.

## USABLE END-STATE
A teacher activates a non-embeddable URL. Within a short, bounded delay the iframe is replaced — for the teacher and for all joined students — by a readable card: resource title, the URL as text, and an "Open externally" link/button that opens the resource in a new browser tab. An embeddable URL continues to render inline with no card and no flicker. The teacher's client records the outcome as a `ResourceEmbedChecked` event and flips the resource's `embedStatus` from `unchecked` to `blocked`/`failed`, so the timeline carries evidence that the embed was checked.

## Objective
Deliver the SPEC §8.2 "never a blank pane" guarantee as one vertical slice: add best-effort client-side detection of a blocked/failed embed to the shared `ResourcePane`, render a fallback card (title + URL + open-externally) in its place for both the teacher and student contexts, and — from the teacher's authorized context only — persist the outcome by recording a `ResourceEmbedChecked` event that transitions the resource's `embedStatus`. Embeddable URLs continue to render inline with no false fallback.

## Source Issue
`txt-20260606-213637-blocked-embed-fallback` — "Blocked-embed fallback card (never a blank pane)"

## Scope

### In Scope
- **Detection + fallback in `ResourcePane`**: best-effort client-side detection of a blocked/failed embed via the iframe's `onError` and a bounded load timeout (cleared on `onLoad`), rendering a fallback card — resource title, URL as readable text, and an "Open externally" action opening the URL in a new tab (`target="_blank"` + `rel="noopener noreferrer"`) — in place of the blank/broken iframe, in **both** the teacher view (`SessionLifecycle`) and the student view (`StudentSession`). Detection state resets when the active resource / URL version changes.
- **Recorded embed status (teacher context only)**: a single sanctioned path `recordEmbedStatus` / `buildEmbedStatusCheck` (`src/lib/sessions.ts`) that routes a dual-write through `writeEvent('ResourceEmbedChecked', …)`, updating `sessionResources[activeResourceId].embedStatus` (`unchecked` → `blocked` / `failed`) in one transaction; `applyEvent` folds `ResourceEmbedChecked` into the resources projection. Wired from `SessionLifecycle` via a `ResourcePane` callback; `StudentSession` passes no callback (students cannot write `sessionResources` — their fallback is local-only).
- **Title availability for the card**: `SessionLifecycle` supplies the active resource's `title` from its existing `sessionResources` query; `StudentSession` resolves it via a narrowly-scoped active-resource title lookup (open reads permit this). The card falls back to the URL's hostname as its heading only if no title is resolvable, so the card is never headingless.

### Out of Scope
- Server-side preflight probing of URLs (best-effort client detection only — explicit in the issue).
- The `failed` → recovery-instructions-with-retry affordance (SPEC §8.2 `failed` row) beyond rendering the fallback card; a dedicated retry UI is a later cycle.
- Auto-flipping `embedMode` or auto-re-embedding once a URL is later found embeddable.
- Any change to the activation (0016) or broadcast (0017) write paths, or to the URL-validation seam (`validateResourceUrl`).
- Persisting embed status from the student context (students lack write permission on `sessionResources` by design).

## Requirements
- Detection MUST be best-effort and bounded: a load timeout (cleared by `onLoad`) is the primary signal; `onError` is a secondary signal. The timeout duration MUST be a named constant. The spec acknowledges browsers do not reliably surface `X-Frame-Options`/CSP refusals via `onError` or `onLoad`, so the timeout is the dependable trigger.
- The fallback card MUST render the resource title (or hostname fallback), the URL as readable text, and a working "Open externally" action (`target="_blank"`, `rel="noopener noreferrer"`).
- An embeddable URL that loads successfully MUST NOT show the fallback card (no false positive); a successful `onLoad` MUST cancel the pending timeout.
- Detection state MUST reset when `activeResourceId` or `currentUrlVersion` changes, so switching/broadcasting re-checks the new embed.
- The `recordEmbedStatus` path MUST be the sole writer of `embedStatus`; no projection-only `sessionResources` write may exist outside `writeEvent()`. The teacher write MUST be idempotent/convergent — guarded so a resource already at the detected `embedStatus` is not re-written, plus a per-resource latch to suppress repeated writes from repeated detections.
- `applyEvent` MUST fold `ResourceEmbedChecked` (never raising `UnknownEventTypeError`); `rebuildSessionProjection` stays whole.
- No email is read or rendered anywhere in the card or the event.
- **Failure behavior**:
  - *Blocked/failed embed (the primary path)*: render the fallback card in both contexts — never a blank pane. The card renders from props the pane already holds, so it appears even if the teacher-side `ResourceEmbedChecked` write fails or the client cannot write at all (students).
  - *Embed-status write rejected/unavailable*: the teacher-side write surfaces inline (`role="alert"`) + `console.error('[SessionLifecycle] …')`, never swallowed; the fallback card remains visible regardless (the visual guarantee does not depend on the write succeeding).
  - *Bad/missing input to `buildEmbedStatusCheck`* (missing `sessionId`/`resourceId`, non-teacher actor, or a status outside `blocked`/`failed`): rejected before any txn — no event, no projection change.
  - *Detection ambiguity (a slow-but-valid embed)*: bounded timeout means a genuinely slow load may transiently show the card; a late `onLoad` (if it arrives) clears it. This degraded-but-visible outcome is preferable to a blank pane and is accepted.

## Acceptance Criteria
- [ ] **User-observable benefit**: activating a non-embeddable URL shows a fallback card with the resource title, the URL as text, and an "Open externally" action that opens the URL in a new tab — visible in **both** a teacher context and a student context, with no blank/broken iframe.
- [ ] An embeddable URL renders inline in the `ResourcePane` iframe and shows **no** fallback card (no false positive); the pending timeout is cancelled on successful load.
- [ ] On detected block/failure in the teacher context, the resource's `embedStatus` transitions `unchecked` → `blocked`/`failed` and a `ResourceEmbedChecked` event is appended (admin-observable), exactly once per settled outcome.
- [ ] `applyEvent` folds a `ResourceEmbedChecked` event into the resources projection and does not raise `UnknownEventTypeError` (unit test).
- [ ] **Failure-path**: when the teacher-side `recordEmbedStatus` write is rejected, the fallback card still renders for the teacher and the rejection surfaces inline (`role="alert"`) + `console.error`, leaving the pane non-blank rather than crashing or silently swallowing the error.
- [ ] All existing tests still pass.
- [ ] No compiler/linter warnings introduced (`npm run astro check` clean).

## Testing Strategy
- **Vitest** for pure logic: `buildEmbedStatusCheck` total-validation (rejects non-teacher actor, missing `sessionId`/`resourceId`, status outside `blocked`/`failed`; accepts valid input and produces the envelope + keyed projection update); `applyEvent` folding `ResourceEmbedChecked` (sets `embedStatus`, tolerant of an absent prior resource, keyed defensively); any pure helper used for the timeout/hostname-fallback decision.
- **Playwright** (`e2e/blocked-embed-fallback.spec.ts`, skips loudly without admin env):
  - *Blocked*: activate a deterministically non-loading/blocked URL (a test fixture that hangs or refuses framing) and assert the fallback card (title + URL + open-externally control) is shown — no `resource-pane-frame` content — in both a teacher and a student context.
  - *Embeddable*: activate a known-embeddable URL (an in-test same-server page that frames cleanly) and assert the iframe renders and no fallback card appears.
  - *Evidence*: admin-observe exactly one `ResourceEmbedChecked` event and the `blocked`/`failed` `sessionResources` projection row after the blocked activation; assert none after the embeddable one.
  - *Failure leg*: assert students render the fallback card but write no `ResourceEmbedChecked` event (no `sessionResources` write permission).
- E2E is required because this is a UI change; detection relies on real browser iframe load behavior, which only Playwright exercises faithfully.

## Documentation Updates
- **AGENTS.md**: add a cycle-0018 paragraph in the data-layer section documenting `recordEmbedStatus` / `buildEmbedStatusCheck`, the `ResourceEmbedChecked` event + fold, the `embedStatus` transition (`unchecked`→`blocked`/`failed`), the `ResourcePane` detection/fallback props and the teacher-only callback, the new fixed testids, and that there is **no schema push** (`embedStatus` already exists) and **no `perms:push`** (teacher writes `sessionResources` via the existing owner-only rule).
- **README.md**: note that non-embeddable resources now show a fallback "open externally" card instead of a blank pane.
- Fixed testids to introduce: `resource-pane-fallback` (card container), `resource-pane-fallback-title`, `resource-pane-fallback-url`, `resource-pane-open-external` (the open-externally action), `embed-status-error` (teacher inline alert).

Documentation is part of "done" — code without updated docs is incomplete.

## Dependencies
- Cycle 0016 (`activate-resource-render-embed`) — the shared `ResourcePane` and the session row's `activeResourceId`/`currentUrl` it renders from. (Satisfied; `depends_on` in the issue.)
- Cycle 0017 (`broadcast-resource-url`) — `currentUrlVersion` on the session row, used to reset detection state on broadcast. (Satisfied.)
- Existing `sessionResources.embedStatus` / `embedMode` fields (`src/lib/db.ts`) and the owner-only-write permission rule (cycle 0003) — both already present; **no schema push, no `perms:push` this cycle**.
- `writeEvent()` dual-write helper and `applyEvent` fold (`src/lib/db.ts`).
- `PUBLIC_INSTANTDB_APP_ID` (app); `INSTANT_ADMIN_TOKEN` (e2e observability only).
