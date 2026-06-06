---
id: txt-20260606-213637-blocked-embed-fallback
source: text
title: "Blocked-embed fallback card (never a blank pane)"
added_at: 2026-06-06T21:36:37Z
triage_attempts: 0
priority: high
---

## Problem

Some resources cannot be embedded (X-Frame-Options / CSP) or fail/time out to load. Per spec §8.2, Blended MUST NOT show a blank resource pane: a blocked/failed embed MUST produce a visible fallback card (title, URL, "open externally" action) and record embed status (`ResourceEmbedChecked` / embed status field). Detection is best-effort via iframe load error/timeout.

## Acceptance Criteria

- [ ] A known-blocked URL renders a fallback card (title + URL + open-externally), never a blank pane, for both teacher and students.
- [ ] Load failure/timeout transitions embed status (`unchecked`→`blocked`/`failed`) and records an event.
- [ ] An embeddable URL still renders normally (no false fallback).

## Verification (Playwright)

- [ ] Activate a known X-Frame-Options-blocked URL; assert the fallback card is shown (no blank iframe) in both a teacher and a student context.
- [ ] Activate a known embeddable URL; assert it renders and no fallback appears.

## Blocked by

- txt-20260606-213635-activate-resource-render-embed

## Out of Scope

- Active server-side preflight probing of URLs (best-effort client detection is enough here).
