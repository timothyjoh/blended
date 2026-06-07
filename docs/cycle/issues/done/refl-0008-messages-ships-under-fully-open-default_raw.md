---
id: refl-0008-messages-ships-under-fully-open-default
source: reflection
title: messages-ships-under-fully-open-default-permission-rule
added_at: 2026-06-07T07:23:08.653Z
triage_attempts: 0
priority: high
origin_cycle_id: "0008"
---

Cycle 0008 is the first cycle to write real `messages` rows, but the `messages` entity still falls under the permissive `$default` rule (`$default: { allow: { $default: 'true' } }`, `src/lib/perms.ts:26`) — every operation is allowed for everyone, not even gated on `auth.id`. Any client (including unauthenticated) can read every session's chat, create messages spoofing another `participantId`, and edit or delete other students' messages. The realtime stream relies on open cross-student reads, which is why the plan deferred tightening, but write/delete were never meant to stay open once rows exist.

This mirrors the already-filed participants follow-up (`refl-0003-tighten-participants-fail-open-update-an`). The `messageSession` link was added this cycle precisely to enable a participant/owner-scoped rule, but no rule uses it yet. The next cycle (question derivation, `txt-20260606-213639`) builds on `messages`, so the open default should be closed before more surfaces depend on it: scope `create` to the owning participant, `update`/`delete` to the row owner + owning teacher/admin, keep reads open for the live stream, and push via `npm run perms:push`.
