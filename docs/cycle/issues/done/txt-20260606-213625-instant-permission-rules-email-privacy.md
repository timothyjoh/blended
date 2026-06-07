---
id: txt-20260606-213625-instant-permission-rules-email-privacy
title: "InstantDB permission rules: student email privacy + session write
  authorization"
workflow: feature
depends_on:
  - txt-20260606-213624-schema-write-event-foundation
triaged_at: 2026-06-06T21:51:22.519Z
source: triage
priority: high
---
## Problem

Enforce spec §16.1 (MUST) and the security thread from ADR-0001 at the **data layer**, not just in the UI. Two invariants must hold even against a hand-crafted client query:

1. **Email privacy** — a Student MUST NOT be able to read another Participant's `email`.
2. **Write authorization** — a Student MUST NOT be able to mutate `sessions`, `sessionResources`, or active-resource/`currentUrl` projection state. Only the owning Teacher (and system/admin) may write session state.

Implement InstantDB permission rules (plus any server-side check needed) so these hold regardless of what the client sends.

## Acceptance Criteria

- [ ] A student-authenticated client cannot read any other Participant's `email`.
- [ ] A student cannot write `sessions`, `sessionResources`, or active-resource/`currentUrl` projection fields.
- [ ] The owning Teacher can write their own session's state; other Teachers cannot write someone else's session.
- [ ] Permission rules are committed (e.g. `instant.perms.ts` or equivalent) and briefly documented.

## Verification (Playwright)

- [ ] Two contexts (Teacher + Student) in the same session. From the Student context, attempt to read another participant's email (via the app surface or a dev probe) → returns denied/empty.
- [ ] From the Student context, attempt to change the active resource → rejected; then the Teacher changes it and the Student's view updates, proving authorized writes still propagate.

## Out of Scope

- Organization-scoped permission rules (future).
- Moderation/visibility rules (Batch 2).

## Dependencies

Builds on the InstantDB schema and `writeEvent()` helper established in `txt-20260606-213624-schema-write-event-foundation`; the entities and fields referenced here (`sessions`, `sessionResources`, `currentUrl`, participant `email`) must exist before these rules can be authored and tested.
