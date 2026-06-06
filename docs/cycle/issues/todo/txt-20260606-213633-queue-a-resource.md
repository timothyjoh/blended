---
id: txt-20260606-213633-queue-a-resource
title: Teacher queues a resource (with URL validation)
workflow: feature
depends_on:
  - txt-20260606-213628-create-session-draft
triaged_at: 2026-06-06T21:53:42.213Z
source: triage
priority: high
---
## Problem

The Teacher adds a lesson Resource to a session's queue: a URL, a title, and a `type` (`generic_url`, `google_slides`, `form`, `pdf`, `controlled_page`, `unknown`). The URL MUST be validated and unsafe schemes (`javascript:` etc.) rejected (spec §16.3/16.4). Append `ResourceQueued`. New resources get a `sortOrder` placing them at the end of the queue.

This is one vertical slice: schema/projection for queued resources, URL validation, the `ResourceQueued` event written in the same transaction as the projection, and the teacher-facing add-resource control. Reorder/remove, activation, and embedding are explicitly out of scope and tracked separately.

## Acceptance Criteria

- [ ] Teacher can add a resource with url + title + type; it appears in the session's queue ordered by `sortOrder`.
- [ ] URLs are validated; `javascript:` and other unsafe schemes are rejected with a clear error.
- [ ] `ResourceQueued` is appended in the same transaction as the projection.
- [ ] New resources receive a `sortOrder` that places them at the end of the existing queue.

## Verification (Playwright)

- [ ] Teacher adds a valid resource; assert it appears in the queue and a `ResourceQueued` event exists.
- [ ] Teacher attempts a `javascript:` URL; assert it is rejected and nothing is written.

## Dependencies

- Builds on the session draft created in `txt-20260606-213628-create-session-draft` (a session must exist to own the queue).

## Out of Scope

- Reorder/remove, activation, embedding (separate issues).
