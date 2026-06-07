---
id: refl-0013-tighten-questions-from-fully-open-defaul
source: reflection
title: tighten-questions-from-fully-open-default-to-author-owner-scoped
added_at: 2026-06-07T09:37:18.930Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0013"
---

This cycle made the openness of `questions` (and `endorsements`) **explicit** via `allow: { $default: 'true' }` blocks in `src/lib/perms.ts`, but their real authorization policy is still fully world-open: any client can read, create, update, or delete any question, and there is no `auth.id` gate so authorship can be spoofed. BUILD.md and the SPEC both name the participant/owner-scoped policy for `messages`/`questions`/`endorsements` as the deferred Batch-2 follow-up, but only the `messages` half is filed (`refl-0008-messages-ships-under-fully-open-default`). The `questions` tightening — built and carrying real rows since cycles 0009/0010 — has no tracking issue.

Mirror the `refl-0008` pattern once it lands: give `questions` its own rule — create scoped to the authoring participant via the existing question/session links, update/delete restricted to the row author plus owning teacher/admin, reads kept open if a flow needs them (note it explicitly). `endorsements` is the same class but its product flow (`txt-…-endorse-a-question`) is still unbuilt, so it should get the equivalent rule when that feature ships rather than now. After updating, push via `npm run perms:push`. Depends on the participants/messages tightening pattern already queued.
