---
id: refl-0001-push-blended-schema-to-live-instant-app
title: Push Blended InstantDB schema to the live Instant app
workflow: feature
depends_on:
  - txt-20260606-213624-schema-write-event-foundation
triaged_at: 2026-06-06T22:55:47.127Z
source: triage
priority: medium
---
BUILD.md's "Deferred / follow-up" notes that `npx instant-cli push schema` was never run against the live Instant app. AGENTS.md documents the push only as a prerequisite "if a deployment uses schema enforcement." Today the operational step exists only in prose — no work item tracks it.

The risk: a future cycle that deploys against an app with schema enforcement enabled will have **every** `writeEvent()` transaction rejected until the schema is pushed. The rejection is observable (it propagates to the caller rather than being swallowed), but the fix — pushing the schema — is currently undocumented as an actionable step.

## Scope

- Run `npx instant-cli push schema` against the live Instant app so the deployed schema matches the committed Blended schema (the one introduced by the Foundation cycle).
- Confirm the push succeeds and that the live schema reflects the entities/links/attrs used by `writeEvent()`.
- Update AGENTS.md / BUILD.md so the schema push is recorded as a concrete deploy prerequisite (a checklist/runbook step), not just an incidental note.
- Verify a representative `writeEvent()` transaction is accepted against the live app after the push.

## Notes

This is the operationalization of the deferred follow-up; it depends on the Foundation cycle that defines the schema and the `writeEvent()` dual-write helper. Keep it a single vertical slice: run the push, verify acceptance, and document the prerequisite.
