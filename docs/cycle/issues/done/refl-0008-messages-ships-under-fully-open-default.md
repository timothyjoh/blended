---
id: refl-0008-messages-ships-under-fully-open-default
title: Tighten messages from fail-open default to participant-scoped create +
  row-owner update/delete
workflow: feature
depends_on:
  - refl-0003-tighten-participants-fail-open-update-an
triaged_at: 2026-06-07T07:27:08.244Z
source: triage
priority: high
---
Cycle 0008 is the first cycle to write real `messages` rows, but the `messages` entity still falls under the permissive `$default` rule in `src/lib/perms.ts:26` (`$default: { allow: { $default: 'true' } }`). Every operation is allowed for everyone — not even gated on `auth.id`. Today any client (including unauthenticated) can read every session's chat, create messages spoofing another `participantId`, and edit or delete other students' messages. The plan deferred tightening because the realtime stream relies on open cross-student reads, but write/delete were never meant to stay open once rows exist.

This mirrors the already-filed participants follow-up (`refl-0003-tighten-participants-fail-open-update-an`); land that pattern first and reuse it here. The `messageSession` link was added this cycle precisely to enable a participant/owner-scoped rule, but no rule uses it yet.

## Scope

Add an explicit `messages` rule in `src/lib/perms.ts` (do not leave it on `$default`):

- **create** — scope to the owning participant: the new row's `participantId` must match the authenticated user's participant in the owning session (via the `messageSession` link). Reject messages that spoof another `participantId`.
- **update** / **delete** — restrict to the row owner (the participant who authored it) plus the owning teacher/admin.
- **read** — keep open for now so the live cross-student stream keeps working; note this explicitly so it isn't mistaken for an oversight.

After updating the rule, push with `npm run perms:push`.

## Why now

The next cycle (`txt-20260606-213639-auto-create-question-from-question-mark`) builds on `messages`, so close the open default before more surfaces depend on it. Order this work ahead of that cycle.

## Done when

- `messages` has its own rule (no longer covered by the permissive `$default`).
- create is participant-scoped via `messageSession`; update/delete are row-owner + owning teacher/admin; reads remain open for the stream.
- Permissions pushed via `npm run perms:push` and the existing chat send + realtime stream still works.
