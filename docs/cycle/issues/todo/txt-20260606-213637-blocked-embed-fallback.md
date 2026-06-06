---
id: txt-20260606-213637-blocked-embed-fallback
title: Blocked-embed fallback card (never a blank pane)
workflow: feature
depends_on:
  - txt-20260606-213635-activate-resource-render-embed
triaged_at: 2026-06-06T21:54:55.868Z
source: triage
priority: high
---
## Problem

Some resources cannot be embedded (X-Frame-Options / CSP) or fail/time out to load. Per spec §8.2, Blended MUST NOT show a blank resource pane: a blocked/failed embed MUST produce a visible fallback card (title, URL, "open externally" action) and record embed status (`ResourceEmbedChecked` / embed status field). Detection is best-effort via iframe load error/timeout.

This builds directly on the resource activation + render slice ([[txt-20260606-213635-activate-resource-render-embed]]): activation must already render an embed for both teacher and students before a fallback path can hook in.

## Scope

One vertical slice covering both teacher and student rendering contexts:

- Best-effort client-side detection of a blocked/failed embed via iframe load error and a load timeout.
- A fallback card UI shown in place of a blank iframe: resource title, URL, and an "open externally" action (new tab).
- Embed status field transitions (`unchecked` → `blocked` / `failed`) persisted, with a recorded event (`ResourceEmbedChecked` or equivalent embed-status event) via the existing `writeEvent()` dual-write helper.
- Embeddable URLs continue to render normally with no false fallback.

## Acceptance Criteria

- [ ] A known-blocked URL renders a fallback card (title + URL + open-externally), never a blank pane, for both teacher and students.
- [ ] Load failure/timeout transitions embed status (`unchecked`→`blocked`/`failed`) and records an event.
- [ ] An embeddable URL still renders normally (no false fallback).

## Verification (Playwright)

- [ ] Activate a known X-Frame-Options-blocked URL; assert the fallback card is shown (no blank iframe) in both a teacher and a student context.
- [ ] Activate a known embeddable URL; assert it renders and no fallback appears.

## Out of Scope

- Active server-side preflight probing of URLs (best-effort client detection is enough here).
