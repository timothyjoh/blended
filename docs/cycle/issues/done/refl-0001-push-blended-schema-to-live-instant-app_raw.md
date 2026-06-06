---
id: refl-0001-push-blended-schema-to-live-instant-app
source: reflection
title: push-blended-schema-to-live-instant-app
added_at: 2026-06-06T22:52:35.566Z
triage_attempts: 0
priority: medium
origin_cycle_id: "0001"
---

BUILD.md "Deferred / follow-up" notes that `npx instant-cli push schema` was never run against the live Instant app, and AGENTS.md documents it only as a prerequisite "if a deployment uses schema enforcement." No issue has been filed for it (no matching `reflection.deferred_issue_written` in the engine log).

A future cycle that deploys against an app with schema enforcement on will have every `writeEvent()` transaction rejected until the schema is pushed. The rejection is observable (it propagates to the caller, not swallowed), but the operational step is currently tracked only in prose. File it so the deploy prerequisite is a real work item.
