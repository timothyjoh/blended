---
id: txt-20260606-213636-teacher-url-broadcast-student-sync
source: text
title: "Teacher-driven URL broadcast + student follow/re-sync"
added_at: 2026-06-06T21:36:36Z
triage_attempts: 0
priority: critical
---

## Problem

Implement the teacher-driven URL sync model (see `docs/adr/0002-teacher-driven-url-sync-for-embedded-resources.md`). The Teacher advances position through Blended's own controls (a current-URL field and/or prev/next over the resource), updating the active resource's `currentUrl`, which broadcasts to all students. Students' iframes load each broadcast URL; students MAY scroll/click/navigate locally afterward, and snap to the teacher's URL again on the next broadcast. Because cross-origin iframes hide internal navigation, sync is driven by Blended state, not by reading the iframe.

## Acceptance Criteria

- [ ] Teacher can change the current URL of the active resource; a URL-change event is appended and `currentUrl` updated.
- [ ] All student iframes update to the broadcast URL in realtime.
- [ ] After a student navigates locally, the next teacher broadcast re-syncs that student to the teacher's URL.
- [ ] A late joiner loads the current broadcast URL, not the resource's original URL.

## Verification (Playwright)

- [ ] Teacher (A) sets URL to slide-3 route; Students (B, C) iframes show slide-3.
- [ ] Student B navigates locally to slide-5; Teacher then broadcasts slide-4; assert B (and C) are both on slide-4.
- [ ] A late context D joins mid-session and lands on the teacher's current URL.

## Blocked by

- txt-20260606-213635-activate-resource-render-embed

## Out of Scope

- postMessage/provider-API capture so the teacher can click inside the deck (Batch 2 spike, per ADR-0002).
