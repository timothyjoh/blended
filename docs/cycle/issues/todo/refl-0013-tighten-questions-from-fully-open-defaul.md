---
id: refl-0013-tighten-questions-from-fully-open-defaul
title: Tighten questions from fully-open default to author/owner-scoped create +
  update/delete
workflow: feature
depends_on:
  - refl-0008-messages-ships-under-fully-open-default
triaged_at: 2026-06-07T09:40:43.211Z
source: triage
priority: medium
---
## Problem

Cycle 0013 made the openness of `questions` (and `endorsements`) **explicit** via `allow: { $default: 'true' }` blocks in `src/lib/perms.ts`, but the real authorization policy for `questions` is still fully world-open: any client can read, create, update, or delete any question, and there is no `auth.id` gate, so authorship can be spoofed. `questions` has been built and carrying real rows since cycles 0009/0010 (auto-create from chat `?` messages + teacher queue), yet — unlike `messages` (`refl-0008-messages-ships-under-fully-open-default`) — it has no tracking issue for the deferred Batch-2 tightening that BUILD.md and the SPEC call for.

## Ask

Mirror the `refl-0008` messages-tightening pattern once it lands, applied to `questions`:

- **Create** scoped to the authoring participant via the existing question→session / question→participant links (gate on `auth.id`; no spoofing the author).
- **Update / delete** restricted to the row author plus the owning teacher/admin (same owner-scoped shape used for participants in cycle 0013 and messages in refl-0008).
- **Reads** kept open if a product flow needs them — if so, note it explicitly in the rule comment rather than leaving it as an implicit `$default: true`.
- After updating `src/lib/perms.ts`, push via `npm run perms:push`.

## Out of scope

- **`endorsements`** is the same authorization class, but its product flow (`txt-20260606-213641-endorse-a-question`) is still unbuilt. Do **not** tighten `endorsements` here — it should get the equivalent author/owner-scoped rule when that feature ships. Leaving its explicit-open `$default` in place for now is correct.

## Dependency

Builds on the participants/messages tightening pattern already queued — land after `refl-0008-messages-ships-under-fully-open-default` so the `questions` rule reuses the established link-based create + row-owner/owning-teacher update/delete shape.
