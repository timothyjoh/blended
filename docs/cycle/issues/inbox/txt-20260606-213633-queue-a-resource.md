---
id: txt-20260606-213633-queue-a-resource
source: text
title: "Teacher queues a resource (with URL validation)"
added_at: 2026-06-06T21:36:33Z
triage_attempts: 0
priority: high
---

## Problem

The Teacher adds a lesson Resource to a session's queue: a URL, a title, and a `type` (`generic_url`, `google_slides`, `form`, `pdf`, `controlled_page`, `unknown`). The URL MUST be validated and unsafe schemes (`javascript:` etc.) rejected (spec §16.3/16.4). Append `ResourceQueued`. New resources get a `sortOrder` placing them at the end of the queue.

## Acceptance Criteria

- [ ] Teacher can add a resource with url + title + type; it appears in the session's queue ordered by `sortOrder`.
- [ ] URLs are validated; `javascript:` and other unsafe schemes are rejected with a clear error.
- [ ] `ResourceQueued` is appended in the same transaction as the projection.

## Verification (Playwright)

- [ ] Teacher adds a valid resource; assert it appears in the queue and a `ResourceQueued` event exists.
- [ ] Teacher attempts a `javascript:` URL; assert it is rejected and nothing is written.

## Blocked by

- txt-20260606-213628-create-session-draft

## Out of Scope

- Reorder/remove, activation, embedding (separate issues).
