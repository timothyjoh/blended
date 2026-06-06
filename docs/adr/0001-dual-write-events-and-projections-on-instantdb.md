# Dual-write SessionEvents and projections on InstantDB

**Status:** accepted

## Context & decision

The spec (§7) mandates an append-only `SessionEvent` log that replay and audit can be reconstructed from, but our system of record is InstantDB — a live-sync document store whose strength is reactive queries over current-state rows, not folding an event log on every read. Pure event-sourcing (events as sole truth, projections folded client-side on read) would be the most faithful but makes every live query slower and more code, hurting a 2-week hackathon.

We will **dual-write**: every meaningful action goes through a single `writeEvent()` helper that, in one InstantDB `transact()` call, both updates the live projection row(s) (Session, Participant, Resource, Message, Cluster…) and appends a `SessionEvent` envelope. Live UI reads projections; replay/audit reads the event log.

## Consequences

- **Drift is the main risk** (spec §15 flags projection-vs-log divergence). Mitigation: *all* mutations route through `writeEvent()`; no direct projection writes. The projection update and event append share one transaction so they land together.
- **Security-sensitive projections** (e.g. email privacy, "students cannot activate resources", moderation outcomes) will move server-side: the client appends the event, and trusted server-side code in Astro (InstantDB admin SDK + permission rules) performs/validates the projection. The exact split is decided per slice when trust is actually required, not up front.
- Replay UI is out of scope for the current phase, but because the event log is written from day one, replay remains reconstructable later without reworking writes.
