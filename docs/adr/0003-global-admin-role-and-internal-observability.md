# Global admin role and internal observability via the event log

**Status:** accepted

## Context & decision

Teacher and Student are session-scoped roles (ADR-context: a User is a Teacher only of sessions they own). We also need operators who can observe the whole system to debug and to verify that interactions produce correct data. Making that session-scoped would defeat the purpose, so **Admin is a deliberate exception: a global role stored on the User**, authenticated with the same email magic-code flow as everyone else.

The first level is **uber admin**, which can see and observe all Sessions and system state. Observability is **internal-only** and is built on the existing append-only event log: because every meaningful user interaction is written as a `SessionEvent` (ADR-0001's `writeEvent()` is the single choke point), an Admin can replay any session's event stream to confirm the right series of events produced the right projection data.

## Consequences

- Admin authorization is checked against a global `User.adminLevel`, separate from `Participant.role`. Bootstrapping the first uber admin is via an env allowlist of admin emails (For Review).
- All product mutations MUST flow through `writeEvent()` so the event log is a complete interaction record; ad-hoc projection writes would create observability blind spots.
- **Future (noted, not built):** organizations/groups with org-scoped admins who observe only their organization's sessions. The global uber-admin level is the only one built now.
