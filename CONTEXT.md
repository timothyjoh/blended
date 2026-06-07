# Blended

Blended is an event-sourced, synchronous learning-session platform: a teacher controls lesson resources, students participate through messages/questions and (later) cursor-voting, and every meaningful action becomes replayable session evidence. This glossary fixes the domain language so spec, code, and issues stay consistent.

## Language

### Identity & roles

**User**:
An authenticated identity (one per email, via magic-code auth). Carries no global teacher/student designation.
_Avoid_: Account, member

**Teacher**:
The role a User holds in a Session they own (`Session.teacherId`). Role is session-scoped, not a global account type — the same User can be a Teacher in one Session and a Student in another, and any User may create their own Session.
_Avoid_: Instructor, host, owner (as an account type)

**Student**:
The role a User holds in a Session they joined via a join link (`Participant.role = student`). Session-scoped, same as Teacher.
_Avoid_: Attendee, learner, guest

**Participant**:
A User's role-scoped membership in one Session. Carries the live display identity and chat status; the binding place for `role`.
_Avoid_: Member, attendee

**Admin**:
A **global** role on the User (not session-scoped, unlike Teacher/Student — see [[adr-0003]]) granting cross-session observability. Distinct from being a Teacher.
_Avoid_: Superuser, staff

**Uber Admin**:
The first/highest Admin level: can see and observe **all** Sessions across the system. (Future: organization-scoped admins who observe only their org's sessions — noted, not built.)
_Avoid_: Root, owner

### Session & resources

**Session**:
A bounded instructional event with a lifecycle (`draft → live → ended`) and a replayable timeline. Not a permanent chat room.
_Avoid_: Room, class, meeting, call

**Resource** (`SessionResource`):
A teacher-controlled lesson artifact (a URL/embed) queued within a Session; exactly one can be the active resource at a time. Not a shared browser the students can drive.
_Avoid_: Slide, document, link, material

**Active Resource**:
The single Resource the Teacher has currently activated for the Session, plus its teacher-driven **current URL**. Students' view syncs to that broadcast URL (slide-level for decks whose slides are distinct routes); within a page each student may scroll/click locally and is re-synced on the teacher's next navigation. See [[adr-0002]].
_Avoid_: Current slide, current page

### Participation

**Message**:
Raw natural-language text a Participant submits to the Session chat. Students see the chat stream; **Teachers do not** — Teachers see only Questions. A participation signal, not the product's primary object.
_Avoid_: Chat (as the entity), post, comment

**Question**:
A Question-like participation unit. In this phase a Message whose text ends with `?` automatically also becomes a Question (an interim heuristic standing in for AI classification — designed to be swapped for AI with no other change; the decision lives behind the single `classifyMessage` seam in `src/lib/classify.ts`, cycle 0009). Questions are what the Teacher sees and acts on.
_Avoid_: Query, ask

**Answered**:
A Question the Teacher has resolved (optionally with a summary). An answered Question is dismissed from the Teacher's active queue.
_Avoid_: Closed, done, resolved (as the stored status name)

**Question Cluster** (deferred):
A grouped theme of related Questions. Grouping is **not** built in this phase — Questions are a flat list — and clustering becomes AI's job in a later phase. Term retained for the event model and future use.
_Avoid_: Thread, topic, group

**Endorsement** (`QuestionEndorsement`):
An anonymous upvote/support signal a Student adds to a Question, used to prioritize and to make duplicates into support instead of repeated noise.
_Avoid_: Like, vote, upvote (as the stored term)

### Architecture

**Session Event** (`SessionEvent`):
An append-only fact in a Session's timeline (consistent envelope, see spec §7). The durable spine from which replay/audit is reconstructed.
_Avoid_: Log entry, record, action

**Projection**:
Current live state (Session, Participant, Resource, Message, Cluster rows) derived from / written alongside events for fast InstantDB live queries. See [[adr-0001]] for the dual-write strategy.
_Avoid_: View, cache, snapshot

**Observability** (internal):
The discipline of recording **every** meaningful user interaction as a Session Event so the team can verify that a given sequence of interactions produces the correct data. Surfaced only through internal Admin tooling, never to Teachers/Students. See [[adr-0003]].
_Avoid_: Analytics, telemetry, tracking
