# Blended Product and Technical Specification

**Status:** Draft v2 — expanded implementation specification  
**Project context:** 2-week hackathon product moving toward a durable classroom-session platform  
**Created:** 2026-06-05  
**Last updated:** 2026-06-06  
**Primary audience:** builders, coding agents, designers, demo operators, and future maintainers  
**Source baseline:** working product notes and the current application routes in this repository  
**Canonical repository:** `https://github.com/Timothyjoh/blended`

## Purpose

This specification defines the expected behavior, domain model, event model, user journeys, safety constraints, and validation plan for **Blended**: an event-sourced, synchronous learning-session application where a teacher controls lesson resources, students participate through questions and cursor-voting, AI keeps high-signal questions visible, and every meaningful action becomes replayable session evidence.

The product MUST NOT be treated as a generic chat room, video-call clone, or passive document viewer. The product spine is the **session event stream**. Chat, resources, AI classifications, cursor votes, question clusters, moderation outcomes, and replay views all derive value from the same durable session timeline.

---

## For Review — Agent Assumptions and Judgment Calls

The user asked the agent to make solid guesses instead of blocking on questions. The following assumptions are intentionally marked **For Review** so they can be accepted, revised, or deleted later.

1. **Hackathon-first but architecture-aware.** The MVP SHOULD optimize for a credible 2-week demo while preserving an event-sourced architecture that can grow into production.
2. **InstantDB is the initial realtime/auth/data system of record.** The schema names below are implementation guidance for InstantDB; exact collection/index syntax is implementation-defined until the first schema migration lands.
3. **AI provider is implementation-defined.** The spec describes model inputs/outputs, confidence handling, and moderation policy, but does not mandate OpenAI, Anthropic, local models, or a specific routing layer.
4. **Teacher speech transcription is not MVP.** The event model reserves transcript and spoken-answer events, but the first build MUST support manual answered-state transitions before AI listening exists.
5. **External resource embedding remains best-effort.** Blended SHOULD embed known-compatible web resources and MUST provide graceful fallback for blocked iframes. It MUST NOT promise DOM-level instrumentation of arbitrary third-party content.
6. **Student email privacy is strict by default.** Email is used for authentication and private records; live classroom surfaces SHOULD display only a derived username unless an explicit school/admin policy later says otherwise.
7. **The `/spec` route is documentation infrastructure, not product surface.** It MAY be public in the hackathon app, but production deployments SHOULD gate or omit internal specs if they include sensitive roadmap details.
8. **Optimistic moderation is acceptable for MVP only if reversible.** Student messages MAY appear optimistically while AI moderation is pending, but rejected messages MUST be hidden from other students after validation and recorded as moderation events.
9. **Replay is event-log-first.** The hackathon replay SHOULD be a chronological event/activity timeline with selected summaries, not video/audio reconstruction.
10. **Package manager drift should be cleaned later.** This repository currently contains npm and pnpm lockfile context. The team SHOULD choose one package manager policy before production hardening.

---

## Normative Language

The key words `MUST`, `MUST NOT`, `REQUIRED`, `SHOULD`, `SHOULD NOT`, `RECOMMENDED`, `MAY`, and `OPTIONAL` in this document are to be interpreted as described in RFC 2119.

`Implementation-defined` means the implementation must choose and document a behavior, but this specification does not prescribe a single universal policy.

`MVP` means the minimum credible hackathon/demo implementation. MVP requirements are still normative for the hackathon slice when marked with `MUST`.

---

## 1. Product Shape

Blended is a live learning-session system that turns synchronous classroom activity into a replayable, AI-assisted learning artifact.

A teacher can create a bounded session, queue lesson resources, invite students by link, control the active resource, receive student participation, run cursor-voting prompts, and end with a session timeline. Students can join with low friction, follow the active lesson context, ask questions naturally, endorse existing questions, and later review what was answered.

The product MUST make the following distinction clear:

| Product concept | Blended interpretation | What it is not |
|---|---|---|
| Session | Bounded instructional event with lifecycle and replay | Permanent chat room |
| Resource | Teacher-controlled lesson artifact | Shared browser with student control |
| Message | Raw participation signal | The product's primary object |
| Question cluster | AI/human-curated classroom need | A plain chat thread |
| Cursor vote | Lightweight spatial attention/confusion signal | Freehand whiteboard annotation |
| Replay | Event-derived learning record | Full video recording in MVP |

---

## 2. Goals and Non-Goals

### 2.1 Goals

1. Blended MUST let a teacher create, start, manage, end, and replay a synchronous learning session.
2. Blended MUST support teacher-controlled active resources selected from a teacher-managed queue.
3. Blended MUST let students join an existing session through a low-friction session link and passwordless email authentication.
4. Blended MUST capture meaningful session activity as timestamped events that can be replayed or audited later.
5. Blended MUST let students submit natural-language messages without requiring them to choose whether each message is chat, question, feedback, or confusion.
6. Blended SHOULD use AI to classify messages, surface likely questions, cluster similar questions, and reduce teacher overload.
7. Blended MUST let teachers manually mark question clusters as answered even when AI/transcription is unavailable.
8. Blended SHOULD make surfaced question clusters visible to students so duplicate questions become upvotes/endorsements instead of repeated noise.
9. Blended MUST support a cursor-voting interaction mode that records normalized spatial signals over the active resource viewport.
10. Blended SHOULD preserve answered questions and answer summaries for late, distracted, or replaying students.
11. Blended MUST provide graceful resource fallback when an external URL cannot be embedded.
12. Blended MUST keep live student identity display privacy-preserving by default.
13. Blended SHOULD be mobile-responsive for student participation and desktop/tablet optimized for teacher facilitation.
14. Blended MUST provide a convincing hackathon demo path that works without external URL embedding luck or full AI transcription.

### 2.2 Non-Goals

1. Blended MUST NOT become a video conferencing product for the MVP.
2. Blended MUST NOT require native mobile app installation for student participation.
3. Blended MUST NOT require arbitrary third-party webpages to expose DOM events to Blended.
4. Blended MUST NOT implement freehand collaborative drawing in the MVP.
5. Blended MUST NOT require teachers to type every answer into chat during live presentation.
6. Blended SHOULD NOT expose raw student emails in live classroom surfaces.
7. Blended SHOULD NOT make AI moderation irreversible without event evidence and review affordances.
8. Blended SHOULD NOT attempt full video, audio, pointer-stream, or transcript replay in the hackathon slice.
9. Blended MUST NOT let students change the active session resource for everyone.
10. Blended MUST NOT hide important product decisions in mockup-only behavior; routes and prototypes must map back to this spec or later amendments.

---

## 3. Actors and Permissions

| Actor | Description | MVP capabilities | Explicit limits |
|---|---|---|---|
| Teacher | Session owner/facilitator | Create session, queue resources, start/end session, activate resource, view participants, view clusters, start cursor votes, mark answered | SHOULD NOT see rejected student moderation content during live teaching |
| Student | Session participant | Join session, view active resource, scroll/interact locally, submit messages/questions, upvote/endorse clusters, participate in cursor votes, view answered clusters | MUST NOT activate global resources or manage session lifecycle |
| AI assistant | Automated classifier/moderator/clusterer | Classify messages, group questions, recommend priority, detect likely answered state when evidence exists, moderate content | MUST expose confidence/category/reason events; MUST NOT be sole irreversible authority |
| System | Application runtime and data layer | Persist events, maintain projections, sync state, enforce permissions | MUST protect secrets and private identity fields |
| Demo operator | Person running the hackathon demo | Seed data, run scripted session, use fallback resources | MUST be able to recover demo if embeddings or AI fail |

---

## 4. System Overview

### 4.1 Main Components

| Component | Responsibility |
|---|---|
| Marketing / entry surface | Explains value, routes teachers to auth/dashboard, routes students through join links |
| Teacher dashboard | Session setup, resource queue, live facilitation controls, question triage, cursor-vote controls, replay review |
| Student experience | Mobile-first active resource view, chat/question input, surfaced clusters, cursor-vote participation, answered review |
| Event store | Append-only session events and replay source of truth |
| Projections | Current session state derived from events: active resource, participants, clusters, answered state, moderation state |
| Realtime sync | InstantDB-backed propagation of session state, presence, messages, and event projections |
| AI pipeline | Message classification, question clustering, moderation, answered detection, future transcript answer matching |
| Resource renderer | Controlled wrapper around embeddable resources with fallback handling and cursor overlay |
| Documentation route | `/spec` route that renders this markdown specification as HTML for internal review |

### 4.2 Data Flow Summary

1. Teacher creates a draft session.
2. Teacher queues resources before or during class.
3. Teacher starts the session; system appends `SessionStarted`.
4. Students join via session link and authenticate.
5. Teacher activates a resource; system appends `ResourceActivated`.
6. Students submit messages; system appends `ChatMessageSubmitted` and launches classification/moderation.
7. AI emits classification/moderation events.
8. Question-like messages become questions and/or are merged into clusters.
9. Teacher sees ranked clusters and manually answers or marks them addressed.
10. Teacher starts cursor voting; students produce ephemeral pointer positions and sampled prompt data.
11. Cursor-vote end emits a summary event.
12. Session ends; replay view reconstructs the timeline from events and projections.

---

## 5. Core Domain Model

### 5.1 Entity Summary

| Entity | Stable ID | Owner | Persisted? | Purpose |
|---|---|---|:---:|---|
| `User` | `userId` | Auth system | yes | Authenticated teacher/student identity |
| `Session` | `sessionId` | Teacher | yes | Bounded live/replayable classroom event |
| `SessionResource` | `resourceId` | Teacher/session | yes | Queued resource that can become active |
| `Participant` | `participantId` | Session | yes | User's role-scoped membership in a session |
| `SessionEvent` | `eventId` | System | yes | Append-only fact in session timeline |
| `Message` | `messageId` | Participant | yes | Raw student/teacher text input |
| `Question` | `questionId` | Participant/system | yes | Question-like participation unit |
| `QuestionCluster` | `clusterId` | System/teacher | yes | Grouped question theme surfaced to teacher/students |
| `QuestionEndorsement` | `endorsementId` | Student | yes | Anonymous upvote/support signal |
| `CursorVotePrompt` | `promptId` | Teacher/session | yes | Bounded spatial voting interaction |
| `CursorVoteSample` | `sampleId` | Prompt/participant | optional | Sampled normalized pointer data |
| `CursorVoteSummary` | `summaryId` | Prompt/system | yes | Aggregated cursor-vote result for replay |
| `ModerationDecision` | `decisionId` | AI/system | yes | Audit record for message visibility action |
| `TranscriptSegment` | `transcriptSegmentId` | Future audio pipeline | later | Teacher speech evidence |

### 5.2 Session

| Field | Type | Required | Description |
|---|---:|:---:|---|
| `id` | string | yes | Stable session identifier. MUST be unique. |
| `title` | string | yes | Teacher-visible lesson title. |
| `status` | enum | yes | `draft`, `live`, `ended`, or `archived`. |
| `teacherId` | string | yes | Auth user ID of owner/facilitator. |
| `joinCode` | string | yes | Human-shareable join token. MUST be unguessable enough for MVP privacy. |
| `joinSlug` | string | optional | Friendly URL slug if available. |
| `createdAt` | timestamp | yes | Creation time. |
| `startedAt` | timestamp | conditional | Required after start. |
| `endedAt` | timestamp | conditional | Required after end. |
| `activeResourceId` | string/null | yes | Current teacher-selected resource. |
| `interactionMode` | enum | yes | `none`, `cursor_vote`, future modes. |

### 5.3 SessionResource

| Field | Type | Required | Description |
|---|---:|:---:|---|
| `id` | string | yes | Stable resource ID. |
| `sessionId` | string | yes | Owning session. |
| `url` | string | yes | URL to render/open. MUST be validated. |
| `title` | string | yes | Teacher-visible title. May be provided or inferred. |
| `type` | enum | yes | `generic_url`, `google_slides`, `form`, `pdf`, `controlled_page`, `unknown`. |
| `sortOrder` | number | yes | Queue ordering value. |
| `embedMode` | enum | yes | `iframe`, `provider_embed`, `external_fallback`, `app_hosted`. |
| `embedStatus` | enum | yes | `unchecked`, `embeddable`, `blocked`, `failed`, `unknown`. |
| `createdAt` | timestamp | yes | Queue time. |
| `activatedAt` | timestamp/null | optional | Last activation time. |

### 5.4 Participant

| Field | Type | Required | Description |
|---|---:|:---:|---|
| `id` | string | yes | Stable membership ID. |
| `sessionId` | string | yes | Joined session. |
| `userId` | string | yes | Auth user ID. |
| `role` | enum | yes | `teacher`, `student`, `assistant`, `ai`. |
| `username` | string | yes | Live display name. For students, defaults to email local-part. |
| `email` | string | yes/private | Stored privately. MUST NOT be shown to other students. |
| `joinedAt` | timestamp | yes | First join time. |
| `lastSeenAt` | timestamp | yes | Presence heartbeat or last activity. |
| `chatStatus` | enum | yes | `allowed`, `warned`, `revoked`. |

### 5.5 Message and Question

| Field | Type | Required | Description |
|---|---:|:---:|---|
| `message.id` | string | yes | Raw text message ID. |
| `message.sessionId` | string | yes | Owning session. |
| `message.participantId` | string | yes | Author participant. |
| `message.text` | string | yes | Original text. MUST be preserved for audit unless retention policy later changes. |
| `message.visibility` | enum | yes | `pending`, `visible`, `author_only_rejected`, `hidden_from_students`, `admin_only`. |
| `message.classificationStatus` | enum | yes | `pending`, `classified`, `failed`, `manual_review`. |
| `question.id` | string | yes | Question object ID when message is question-like. |
| `question.status` | enum | yes | `submitted`, `needs_review`, `clustered`, `surfaced_to_teacher`, `answered`, `dismissed`, `unresolved`. |
| `question.activeResourceIdAtSubmission` | string/null | optional | Resource context. |
| `question.addressedBy` | enum/null | optional | `teacher`, `ai`, `system`. |
| `question.answerSummary` | string/null | optional | Human/AI answer summary. |

### 5.6 QuestionCluster

| Field | Type | Required | Description |
|---|---:|:---:|---|
| `id` | string | yes | Stable cluster ID. |
| `sessionId` | string | yes | Owning session. |
| `title` | string | yes | Short teacher/student visible theme. |
| `summary` | string | yes | AI or system summary of the shared question. |
| `status` | enum | yes | `open`, `surfaced`, `answered`, `dismissed`, `unresolved`. |
| `questionIds` | string[] | yes | Member questions. |
| `endorsementCount` | number | yes | Anonymous aggregate upvotes/support. |
| `priorityScore` | number | yes | Ranking score; formula MAY be implementation-defined. |
| `confidence` | number | optional | AI confidence from 0..1 when AI-created. |
| `answerSummary` | string/null | optional | Stored when answered. |
| `createdAt` | timestamp | yes | Creation time. |
| `updatedAt` | timestamp | yes | Last mutation time. |

---

## 6. Session Lifecycle State Machine

### 6.1 Session States

| State | Meaning | Terminal? | Persisted? |
|---|---|:---:|:---:|
| `draft` | Teacher is preparing resources and settings | no | yes |
| `live` | Students can participate in a running session | no | yes |
| `ended` | Live interaction is closed; replay is available | no | yes |
| `archived` | Session is retained but hidden from active lists | yes | yes |

### 6.2 Legal Transitions

| From | To | Trigger | Preconditions | Side effects |
|---|---|---|---|---|
| none | `draft` | teacher creates session | authenticated teacher | append `SessionCreated` |
| `draft` | `live` | teacher starts session | at least zero resources; title present | append `SessionStarted`; enable join flow |
| `live` | `ended` | teacher ends session | teacher owns session | append `SessionEnded`; close live prompts |
| `ended` | `archived` | teacher archives | replay generated or not required | append `SessionArchived` |
| `draft` | `archived` | teacher discards | teacher owns session | append `SessionArchived` |

Illegal transitions MUST fail with an actionable error and MUST NOT partially mutate projections.

---

## 7. Event-Sourced Architecture

### 7.1 Core Principle

Blended MUST store an append-only `SessionEvent` log for each session. Current UI state MAY be stored as projections for performance, but replay and audit behavior MUST be reconstructable from events or documented summary events.

### 7.2 Event Envelope

Every session event MUST use a consistent envelope:

| Field | Type | Required | Description |
|---|---:|:---:|---|
| `id` | string | yes | Unique event ID. |
| `sessionId` | string | yes | Owning session. |
| `type` | string | yes | Event type name. |
| `schemaVersion` | integer | yes | Event payload version. |
| `actorId` | string/null | yes | User/participant/system/AI actor. |
| `actorRole` | enum | yes | `teacher`, `student`, `ai`, `system`, `unknown`. |
| `occurredAt` | timestamp | yes | Client/server reconciled event time. |
| `receivedAt` | timestamp | yes | Server/data-layer receipt time. |
| `correlationId` | string | optional | Groups related AI or UI actions. |
| `payload` | object | yes | Type-specific data. |

### 7.3 Required MVP Event Types

| Area | Event types |
|---|---|
| Session lifecycle | `SessionCreated`, `SessionStarted`, `SessionEnded`, `SessionArchived` |
| Resources | `ResourceQueued`, `ResourceReordered`, `ResourceRemoved`, `ResourceEmbedChecked`, `ResourceActivated` |
| Participants | `ParticipantJoined`, `ParticipantLeft`, `ParticipantReconnected`, `ParticipantPresenceUpdated` |
| Messages | `ChatMessageSubmitted`, `MessageClassified`, `MessageVisibilityChanged`, `MessageUpvoted` |
| Questions | `QuestionCreated`, `QuestionClusterCreated`, `QuestionAddedToCluster`, `QuestionSurfacedToTeacher`, `QuestionClusterAnswered`, `QuestionMarkedUnresolved` |
| Cursor voting | `CursorVotePromptCreated`, `CursorVoteStarted`, `CursorVoteSampled`, `CursorVoteEnded`, `CursorVoteSummaryCreated` |
| AI and moderation | `AIMessageClassified`, `AIQuestionReviewed`, `AIModerationDecisionCreated`, `AIClusterSuggested`, `AIAnswerMatchCreated` |
| Replay | `ReplayProjectionGenerated` |

### 7.4 Future Event Types

Future transcription events MAY include `TranscriptSegmentCreated`, `TranscriptSegmentCorrected`, `SpokenAnswerDetected`, `TranscriptAnswerMatchCreated`, and `SpokenAnswerSummaryStored`.

### 7.5 High-Volume Cursor Event Rule

The implementation MUST NOT persist every pointer movement forever. Live cursor positions SHOULD use ephemeral realtime presence state. A cursor-vote prompt MAY sample positions during the prompt window and MUST persist either bounded samples, aggregate heatmaps, or summary clusters sufficient for replay.

---

## 8. Resource Rendering Contract

### 8.1 Resource Activation

Only teachers and authorized system actions MAY activate a global session resource. When a resource is activated:

1. The system MUST validate that the resource belongs to the session.
2. The system MUST append `ResourceActivated`.
3. Student clients MUST update their active resource context.
4. Existing student local scroll state MAY remain local unless a future follow-mode is enabled.

### 8.2 Embedding and Fallback

| Embed status | Required behavior |
|---|---|
| `embeddable` | Render in controlled pane with Blended overlay. |
| `blocked` | Show fallback card with title, URL, and “open externally” action. |
| `failed` | Show recovery instructions and allow retry. |
| `unknown` | Attempt render with timeout and detect failure if feasible. |

Blended MUST NOT silently show a blank resource pane. A blocked embed MUST produce a visible fallback and event evidence.

### 8.3 Priority Resource Types

The MVP SHOULD prioritize:

- Google Slides
- Gamma.app presentations
- Reveal.js presentations
- Slides.com presentations
- Generic embeddable URLs
- App-hosted static demo resources

---

## 9. Chat, Questions, and AI Triage

### 9.1 Natural Input

Students MUST be able to type naturally. They SHOULD NOT need to choose a message type before submitting. The system classifies after submission.

Initial AI classification categories:

| Category | Meaning | Possible behavior |
|---|---|---|
| `question` | Direct or implied request for explanation | Create question; cluster/surface |
| `answer_response` | Student responding to teacher prompt | Keep visible; optionally summarize |
| `peer_discussion` | Student-to-student discussion | Keep visible if appropriate |
| `positive_feedback` | “got it”, “nice”, etc. | Keep visible or aggregate |
| `agreement_support` | Endorsement of existing question/idea | Convert to upvote when matched |
| `confusion_signal` | “I’m lost”, “what?” | Treat as question-like signal |
| `off_topic_noise` | Irrelevant chatter | Deprioritize or moderate |
| `abuse_or_profanity` | Unsafe/bad-vibes content | Hide from others; record decision |
| `unclear` | Low confidence | Keep visible or request review |

### 9.2 Question Cluster Rules

1. Similar questions SHOULD be grouped into clusters.
2. Clusters MUST preserve links to source questions/messages.
3. Ranking SHOULD consider endorsement count, similarity count, recency, active resource relevance, repeated confusion language, and teacher pinning.
4. A cluster marked answered MUST remain available in an answered section.
5. Students SHOULD be able to mark a cluster still unresolved after an answer.
6. Teacher-visible surfaces SHOULD prioritize clusters over raw stream reading.

### 9.3 Answering Paths

| Path | MVP? | Behavior |
|---|:---:|---|
| Teacher manual answered | yes | Teacher marks cluster answered; optional summary; append event. |
| Teacher typed answer | yes | Teacher reply links to cluster; append answer event. |
| AI from text context | yes/optional | AI suggests already-answered or summary from textual evidence; teacher may confirm. |
| AI from transcription | no/future | AI matches spoken answer to cluster and stores summary with confidence. |

---

## 10. Moderation and Visibility

### 10.1 Moderation Policy

AI MAY moderate messages to reduce live-teaching burden. Moderation decisions MUST be auditable and MUST record category, confidence, reason, visibility outcome, and actor.

### 10.2 Optimistic Display

MVP behavior MAY be:

1. Message appears optimistically to the author and possibly the room while validation is pending.
2. If approved, it remains visible.
3. If rejected, it becomes hidden from other students.
4. The author still sees the rejected message struck through or otherwise marked.
5. The teacher does not see rejected/problem messages during live presentation.
6. Rejected/problem messages remain available in an end-of-session moderation log.

### 10.3 Safety Requirements

- The system MUST distinguish “hidden from students” from “deprioritized from teacher queue.”
- The system MUST NOT delete moderation evidence during MVP unless a retention policy explicitly requires deletion.
- A future strike policy MAY revoke chat privileges after repeated violations, but MVP SHOULD avoid irreversible punishment without teacher/admin review.

---

## 11. Cursor-Voting Contract

### 11.1 Interaction Model

When a teacher enables cursor-voting mode, students use a translucent cursor/marker over the active resource viewport to answer a spatial prompt such as:

- “Point to the part you do not understand.”
- “Hover over the answer you think is correct.”
- “Show me where you got stuck.”
- “Which section should we discuss next?”

### 11.2 Coordinate Rules

Cursor-vote samples MUST use normalized coordinates relative to the visible resource container.

| Field | Type | Required | Description |
|---|---:|:---:|---|
| `xNorm` | number | yes | 0..1 horizontal position in resource viewport. |
| `yNorm` | number | yes | 0..1 vertical position in resource viewport. |
| `viewportWidth` | number | yes | Client viewport/container width. |
| `viewportHeight` | number | yes | Client viewport/container height. |
| `resourceId` | string | yes | Active resource at sample time. |
| `promptId` | string | yes | Active cursor-vote prompt. |
| `sampledAt` | timestamp | yes | Sample time. |

Coordinates are approximate classroom signal, not precise semantic annotations. UI copy SHOULD avoid implying pixel-perfect correctness across devices.

### 11.3 Summary Rules

At prompt end, the system SHOULD store a `CursorVoteSummaryCreated` event with aggregate clusters/heatmap data. Summary data MUST be sufficient to explain the result in replay without needing every raw pointer movement.

---

## 12. Authentication and Identity

### 12.1 Teacher Flow

1. Teacher arrives from marketing or app entry.
2. Teacher enters email.
3. System sends a magic link or code.
4. Teacher authenticates.
5. Teacher lands in dashboard.
6. Dashboard guides teacher to create or resume sessions.

### 12.2 Student Flow

1. Student opens a session join link.
2. Student enters email.
3. System sends a magic link or code.
4. Student authenticates.
5. Student lands directly in the target session.

### 12.3 Live Identity Display

Initial student username MUST default to the email local-part.

```text
alex.chen@school.edu -> alex.chen
```

Students SHOULD NOT manually set display names in the MVP. Email MUST remain private/admin-only in live session views.

---

## 13. UI Surface Requirements

### 13.1 Teacher Dashboard

The teacher dashboard MUST support:

- Session create/edit/start/end.
- Resource queue management.
- Active resource control.
- Participant awareness.
- Ranked question clusters.
- Manual answer/answered controls.
- Cursor-voting prompt controls.
- Basic replay/event-log access after end.

### 13.2 Student Surface

The student surface MUST support:

- Active resource view.
- Local scrolling/interactions where embedded resource permits.
- Message/question input.
- Surfaced question clusters and answered section.
- Anonymous upvote/endorsement behavior.
- Cursor-vote participation when active.
- Mobile-responsive layout.

### 13.3 `/spec` Documentation Route

The application MUST provide `/spec`, a route that converts `docs/SPEC.md` from Markdown to HTML at request/build time.

Requirements:

1. `/spec` MUST render this document's Markdown as HTML.
2. The route SHOULD preserve headings, lists, tables, code blocks, links, and emphasis.
3. The route SHOULD include a clear “Blended Specification” heading and link to the raw repository context if desired.
4. The route MUST NOT require a separate CMS or manual HTML copy.
5. The route MAY style the rendered document independently from product UI.
6. For Review: production deployments SHOULD decide whether `/spec` is public, private, or disabled.

---

## 14. Configuration and Environment

### 14.1 Required MVP Environment

| Key | Context | Required | Description |
|---|---|:---:|---|
| `PUBLIC_INSTANTDB_APP_ID` | client | yes | InstantDB app identifier used by client-side realtime/auth integration. |
| `AI_API_KEY` or provider-specific equivalent | server | optional MVP | Needed only when live AI classification is enabled. |
| `AI_MODEL` | server | optional | Model selection if provider supports it. |

Secrets MUST NOT be committed. Public client IDs are not passwords, but environment files SHOULD still be gitignored to avoid environment drift.

### 14.2 Package and Runtime

The app is an Astro/React web application. The repo SHOULD converge on one package manager policy. If pnpm is used, `pnpm-lock.yaml` SHOULD be committed to make installs reproducible.

---

## 15. Failure Model and Recovery

| Failure class | Examples | Detection | Required behavior | Retry? |
|---|---|---|---|:---:|
| Blocked embed | CSP/X-Frame-Options | iframe load timeout/error | Show fallback card; append/embed status event | no/manual |
| Realtime disconnect | network loss | presence heartbeat/client state | Show reconnecting state; replay missed events | yes |
| Auth email delay | magic code not received | user report/timeout | Allow resend and typo correction | yes |
| AI timeout | provider 429/503/timeout | AI client | Mark classification pending/failed; do not block chat indefinitely | yes/backoff |
| Bad AI moderation | false positive/negative | user/teacher review | Preserve event; allow later review/override | manual |
| Duplicate message submit | double click/retry | idempotency key | De-duplicate or mark same client action | no |
| Cursor sample flood | high pointer rate | rate monitor | Throttle/sample; keep summary | yes/throttle |
| Event projection drift | projection does not match log | replay/checksum/test | Rebuild projection from events | manual/automatic |
| Demo resource unavailable | URL down/blocked | preflight/demo check | Use seeded fallback resource | manual |

---

## 16. Security, Privacy, and Operational Safety

1. The system MUST protect student email addresses from student-facing live views.
2. The system MUST treat session join codes as bearer access to a bounded session and SHOULD make them unguessable.
3. The system MUST validate resource URLs before storing or rendering them.
4. The system SHOULD prevent `javascript:` and other unsafe URL schemes.
5. The system MUST redact or avoid logging secrets and provider API keys.
6. AI prompts MUST treat student messages and resource metadata as untrusted input.
7. AI output MUST be parsed/validated before it mutates moderation, classification, or cluster state.
8. The app SHOULD preserve moderation evidence for teacher/admin review while avoiding live exposure of harmful content.
9. The system SHOULD rate-limit message submission, cursor samples, and AI calls.
10. The system SHOULD provide demo-safe seed data that does not include real student personal data.

---

## 17. Reference Algorithms

### 17.1 Applying Events to a Session Projection

```text
function rebuild_session_projection(session_id):
  events = load_events(session_id).sort_by(occurredAt, receivedAt, id)
  projection = empty_session_projection()

  for event in events:
    validate_event_envelope(event)
    projection = apply_event(projection, event)

  return projection
```

### 17.2 Handling a Student Message

```text
function submit_student_message(session_id, participant_id, text, client_action_id):
  assert session.status == live
  assert participant.chatStatus == allowed
  assert not duplicate_client_action(client_action_id)

  message = create_message(text, visibility="pending")
  append_event(ChatMessageSubmitted(message))

  enqueue_ai_classification(message.id)
  return message
```

### 17.3 AI Classification Worker

```text
function classify_message(message_id):
  message = load_message(message_id)
  context = build_ai_context(message.sessionId, message.activeResourceId)
  result = call_ai_classifier(message.text, context)
  parsed = validate_classifier_result(result)

  append_event(AIMessageClassified(message_id, parsed.category, parsed.confidence))

  if parsed.moderation.reject:
    append_event(AIModerationDecisionCreated(message_id, parsed.moderation))
    append_event(MessageVisibilityChanged(message_id, "author_only_rejected"))
  else:
    append_event(MessageVisibilityChanged(message_id, "visible"))

  if parsed.category is question_like:
    question = create_or_update_question(message, parsed)
    cluster = find_or_create_question_cluster(question)
    append_cluster_events(question, cluster)
```

### 17.4 Ending a Cursor Vote

```text
function end_cursor_vote(prompt_id, teacher_id):
  prompt = load_prompt(prompt_id)
  assert prompt.status == active
  assert teacher_owns_session(teacher_id, prompt.sessionId)

  samples = load_bounded_samples(prompt_id)
  summary = aggregate_cursor_samples(samples)

  append_event(CursorVoteEnded(prompt_id))
  append_event(CursorVoteSummaryCreated(prompt_id, summary))
```

---

## 18. Hackathon MVP Plan

### Days 1–2: Technical Spike

- Validate InstantDB auth/realtime fit in Astro.
- Validate resource rendering and fallback behavior.
- Validate active resource sync between teacher and student clients.
- Validate cursor overlay over an embedded or app-hosted resource.
- Confirm mockup direction for teacher and student surfaces.

### Days 3–5: Session Lifecycle and Resource Queue

- Create session.
- Queue/reorder/remove resources.
- Generate join link.
- Start/end session.
- Activate resource.
- Append core session/resource events.

### Days 6–7: Auth and Identity

- Email magic-link/code join.
- Derived username.
- Participant list.
- Basic reconnect handling.

### Days 8–9: Questions

- Student message/question submission.
- Teacher question dashboard.
- Manual cluster answered state.
- Event logging.

### Days 10–11: Cursor Voting

- Teacher starts cursor-vote prompt.
- Student translucent cursor overlay.
- Normalized pointer tracking.
- Teacher aggregate view.
- Summary event on prompt end.

### Days 12–13: AI Assistant and Replay

- AI message classification.
- Basic clustering/review pipeline.
- Moderation decision events.
- Basic replay/event timeline.

### Day 14: Demo Polish

- Scripted demo session.
- Seed resources.
- Fallback if external resources fail.
- Crisp narrative and stable mockup references.

---

## 19. Demo Narrative

The demo MUST make the value obvious in under three minutes.

Suggested pitch:

> Teachers are overwhelmed by managing slides, chat, questions, and student confusion at the same time. Blended turns a live classroom session into an event-sourced learning timeline. The teacher controls the lesson resources, students participate without taking over the session, and AI keeps important questions from getting lost.

Demo beats:

1. Teacher creates “Biology Review.”
2. Teacher queues slides, article, and form.
3. Students join through email magic-code auth.
4. Teacher activates first resource.
5. Students ask similar questions naturally.
6. AI clusters and ranks them.
7. Teacher starts cursor-vote: “Show me where this is confusing.”
8. Student markers cluster around one diagram area.
9. Teacher answers and marks the cluster addressed.
10. Student sees the answer state.
11. Replay shows resources, questions, answer states, and cursor-vote summary.

---

## 20. Test and Validation Matrix

| Requirement area | Validation |
|---|---|
| Session lifecycle | Create/start/end/archive produce legal states and events. |
| Resource queue | Queue/reorder/remove/activate changes projection and appends events. |
| Embed fallback | Known blocked URL shows fallback instead of blank pane. |
| Student join | Join link routes student into correct session after auth. |
| Identity privacy | Student emails do not appear in live student/teacher participant display unless explicitly admin-only. |
| Message submission | Natural text appears pending then visible/rejected based on moderation. |
| AI classification | Classifier output validates against expected category schema. |
| Question clustering | Similar messages group into a cluster with source links preserved. |
| Manual answered | Teacher can mark cluster answered without AI transcription. |
| Cursor voting | Samples use normalized coordinates and generate summary event. |
| Replay | Replay/event timeline reconstructs key events in chronological order. |
| Rate limiting | Message/cursor floods do not break session state. |
| `/spec` | Markdown in `docs/SPEC.md` renders as HTML at `/spec`. |
| Build | `pnpm run build` or equivalent passes before push. |

---

## 21. Definition of Done

### 21.1 Required for Hackathon Demo

- [ ] Teacher can create a session.
- [ ] Teacher can queue at least three resources.
- [ ] Teacher can start/end session.
- [ ] Student can join through a session link.
- [ ] Teacher can activate a resource and student view updates.
- [ ] Student can submit natural-language messages/questions.
- [ ] Teacher can see surfaced question clusters or a credible approximation.
- [ ] Teacher can manually mark a cluster answered.
- [ ] Cursor-voting prompt can start/end and show visible aggregate signal.
- [ ] Replay/event log shows session lifecycle, resource switches, question states, and cursor-vote summary.
- [ ] Blocked resources have a visible fallback.
- [ ] Demo has seeded fallback data/resources.
- [ ] `/spec` route renders.

### 21.2 Required for Production Hardening

- [ ] Formal InstantDB schema and migration policy.
- [ ] Auth and authorization tests.
- [ ] Data retention policy for events, messages, moderation records, and emails.
- [ ] AI provider abstraction with validated structured outputs.
- [ ] Human review/override path for moderation decisions.
- [ ] Observability dashboard for session health, AI failures, realtime disconnects, and embed failures.
- [ ] Accessibility review for teacher and student surfaces.
- [ ] Package manager policy and reproducible lockfile strategy.
- [ ] Load/rate testing for cursor voting and large classes.
- [ ] Security review for URL rendering, prompt injection, and private data exposure.

---

## 22. Current North Star

Build the smallest believable version of:

> A synchronous learning session where the teacher controls resources, students participate through questions and cursor-voting, AI keeps the teacher from drowning, and every meaningful action becomes replayable.

That is the product. Everything else is garnish until the hackathon demo survives contact with oxygen.
