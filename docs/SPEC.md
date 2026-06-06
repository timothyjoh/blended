# Blended — Product Spec

**Project name:** Blended  
**Context:** 2-week hackathon project  
**Created:** 2026-06-05  
**Status:** Working product spec copied from project planning notes  
**Related spec:** [[blended-classroom-session-prd]] / `../ai/blended-classroom-session-prd.md`  
**Related baseline:** `../ai/instantdb-expo-chat-baseline-spec.md`

## 1. One-line Product Shape

Blended is an event-sourced, synchronous learning-session app where a teacher queues web resources, controls the active resource during a live session, students join by magic link, interact with the material locally, ask questions, participate through lightweight cursor-voting, and later replay the session timeline.

## 2. Product Judgment

This should not be positioned as a chat app, a video-call clone, or a generic room system.

The strongest product shape is:

> A live learning session system that turns synchronous classroom activity into a replayable, AI-assisted learning artifact.

The product spine is not messages. It is the **event stream**.

Everything meaningful should become a timestamped session event so the app can reconstruct what happened later:

- resource switches
- session mode changes
- student questions
- teacher answers
- cursor-voting prompts
- cursor-voting summaries
- chat messages
- AI question reviews
- AI answer matches
- future transcript segments

This is the difference between a disposable live app and a durable learning system.

## 3. Current Core Decisions

### Use “sessions,” not “rooms”

The product should call the main object a **session**.

Reasoning:

- Rooms sound persistent and chat-like.
- Sessions sound bounded, instructional, replayable, and event-like.
- A teacher may run many short-lived sessions.
- A session can be archived and replayed after it ends.

### Teachers queue resources before class

A teacher should be able to create a session and queue multiple URL resources before the session starts.

Examples:

- Google Slides presentation
- web presentation
- article
- Google Form
- interactive webpage
- later: uploaded PDF or slide deck converted into controlled images

During the live session, the teacher toggles between queued resources.

### Teacher controls the active resource

Students cannot change the active URL/resource for the whole session.

Students can:

- scroll locally
- click and interact locally
- fill out forms if the embedded resource permits it
- ask questions
- participate in enabled interaction modes

Students cannot:

- change the active resource selected by the teacher
- rename themselves in MVP
- draw/highlight freely on the shared screen in MVP

### Teacher and student authentication

Both teachers and students use the same passwordless email magic link/code mechanism.

No passwords.

The difference is the entry path after authentication.

Teacher flow:

1. Teacher arrives from the marketing page.
2. Teacher enters email.
3. System sends a magic link or code.
4. Teacher authenticates.
5. Teacher lands in a dashboard.
6. Dashboard guides them to set up their first session.

Student flow:

1. Student opens a specific session join link.
2. Student enters email.
3. System sends a magic link or code.
4. Student authenticates.
5. Student lands directly in the existing session.

Initial student identity behavior:

- student enters email
- system stores email privately in the database
- username becomes email local-part
- teacher and other students see only the username during the live session

Example:

```text
alex.chen@school.edu -> alex.chen
```

Students should not manually set display names in MVP.

### Resource rendering strategy

Initial leaning: support URL resources in a controlled browser-like pane, with graceful fallback when embedding is blocked.

Priority resource types:

- Google Slides
- Gamma.app presentations
- Reveal.js presentations
- Slides.com presentations, since they are Reveal.js-based
- generic embeddable web URLs where feasible

This is not the same as guaranteeing deep instrumentation of every web page. The MVP should control the surrounding viewport, active resource selection, overlays, and cursor-voting layer, while accepting that arbitrary embedded content may remain opaque.

### Cursor-voting instead of drawing

Initial highlighting should be cursor-voting, not freehand annotation.

When the teacher enables cursor-voting mode:

- student cursors become partially transparent circles
- pointer positions are tracked over the resource viewport
- students “vote” or indicate confusion by hovering over a region
- teacher sees live/aggregate attention

This supports prompts like:

- “Point to the part you do not understand.”
- “Hover over the answer you think is correct.”
- “Show me where you got stuck.”
- “Which section should we discuss next?”

This is a good hackathon choice because it gives useful classroom signal without the complexity of drawing tools, semantic annotations, or iframe DOM inspection.

### Real-time transcription / AI listening is later, but strategically important

Do not let full real-time transcription hijack the first hackathon slice unless everything else is already working.

However, the product should be designed so teacher speech can later become first-class session evidence.

When AI listening/transcription exists, it should:

- listen to the teacher's spoken presentation
- detect when the teacher appears to answer an open question cluster
- summarize the spoken answer
- store the answer summary with the question group
- mark the question cluster as addressed, ideally with confidence and timestamp
- make the answer available for replay/review

Transcription remains important for accessibility, replay, and richer AI context.

### First AI feature: message classification and question triage

The first AI feature should help the teacher manage mixed student participation without drowning in the stream.

Students should be able to participate naturally rather than choosing rigid message types.

Students can type normally, and the AI decides whether a message is:

- conversational response
- peer discussion
- question
- confusion signal
- positive feedback
- noise/problem content

Questions and positive feedback can be upvoted by other students.

Upvotes are anonymous in the MVP. Upvoting primarily lends higher ranking to a question/cluster when multiple questions are arising for the teacher to see and respond to. The teacher sees aggregate priority, not which students upvoted.

Students can also see the prevailing surfaced questions. On larger screens these can be pinned near the top of the chat/question area; on small mobile screens they may appear in a separate questions pane or tab.

The AI should classify every student message and decide how it should affect the teacher dashboard.

Initial classification categories:

- question
- answer/response to teacher
- peer discussion
- positive feedback
- agreement/upvote-like support
- confusion signal
- off-topic/noise
- profanity/abuse/bad vibes
- unclear

For question-like messages, AI should determine:

1. Has this already been answered?
2. Is it similar to other open questions?
3. Should it be surfaced to the teacher?
4. How many students are asking or endorsing the same question?
5. If the teacher answers later, can the system mark the original question/cluster as addressed?
6. Can the system send a useful answer summary back to the student or group of students?

Teachers will usually not type answers into chat. They are presenting. Question answering therefore has two paths:

- MVP/manual path: teacher clicks “Answered” on a question cluster, which moves it out of the active teacher queue and into an answered section, while preserving it for review/replay.
- AI listening path: when live audio/transcription exists, the AI listens to the teacher's spoken answer, matches it to an open question cluster, summarizes the answer, stores it with the question group, marks the cluster addressed, and moves it into the answered section.

Similar questions should be grouped into clusters and ranked by priority. Two or more similar questions should be treated as a bundle with appropriate weighting, so the teacher responds to the theme rather than duplicate individual messages.

Question clusters should be visible to students as well as the teacher. Student-visible clusters help students recognize that their question is already represented and can be upvoted instead of repeated.

When a question cluster is answered, it should not vanish entirely. It should move into an **Answered** section. This gives students a place to review what has already been addressed and lets late/momentarily distracted students catch up.

Answered section behavior:

- active/open clusters stay in the live questions area
- answered clusters move to an answered section
- if an answer summary exists, show it with the answered cluster
- if the teacher manually marked it answered without a summary, show answered status and preserve it for later review/replay
- students can use the answered section to avoid re-asking the same question

Priority signals may include:

- number of similar questions
- anonymous aggregate upvote count
- repeated confusion language
- relevance to the active resource
- recency
- teacher-pinned importance

The teacher dashboard should surface ranked question clusters rather than forcing the teacher to read the raw stream.

AI should also filter or suppress noise, profanity, abuse, spam, and general bad vibes. For MVP, keep this conservative and auditable: store a moderation decision event with the reason/category, and distinguish between messages hidden from students versus merely deprioritized from the teacher queue.

Because transcription is deferred, the initial AI context can include:

- submitted student messages
- submitted student questions
- anonymous upvote counts
- teacher-written answers/replies
- pinned teacher responses
- manually marked answered questions
- session resource titles/metadata
- previous question clusters

Later, when transcription exists, transcript segments become the main evidence source for “the teacher answered this.”

## 4. Hackathon MVP Shape

For a 2-week hackathon, the goal should be a convincing vertical slice, not the whole platform.

### MVP promise

A teacher can create a live session, queue web resources, invite students, switch the active resource, receive student questions, run a cursor-voting prompt, and end the session with a basic replay/event log.

### Suggested demo story

1. Teacher creates a session called “Photosynthesis Review.”
2. Teacher queues three resources:
   - a slide deck URL
   - a web article URL
   - a form/checkpoint URL
3. Teacher starts the session.
4. Students join from a link using email magic-code authentication.
5. Teacher switches between resources.
6. Students chat/respond naturally, and some ask similar questions.
7. AI classifies the mixed stream, filters bad/noisy messages, and clusters/ranks the important questions.
8. Teacher enables cursor-voting: “Hover over the part of the diagram that is confusing.”
9. Student translucent cursors appear over the resource.
10. Teacher sees a cluster around one area and addresses it.
11. Session ends.
12. Replay shows resource switches, questions, answers/status, and cursor-voting summary.

## 5. Event-Sourced Architecture Notes

### Core event stream principle

The app should store an append-only event log for each session.

A session replay should be generated by applying events in timestamp order.

### Candidate event types

Session lifecycle:

- `SessionCreated`
- `SessionStarted`
- `SessionEnded`

Resource management:

- `ResourceQueued`
- `ResourceReordered`
- `ResourceRemoved`
- `ResourceActivated`

Participants:

- `ParticipantJoined`
- `ParticipantLeft`
- `ParticipantReconnected`

Interaction modes:

- `InteractionModeChanged`
- `CursorVoteStarted`
- `CursorVoteEnded`

Chat/questions:

- `ChatMessageSubmitted`
- `StudentMessageUpvoted`
- `QuestionSubmitted`
- `QuestionClusterCreated`
- `QuestionMarkedAlreadyAnswered`
- `QuestionSurfacedToTeacher`
- `TeacherMarkedQuestionClusterAnswered`
- `TeacherAnsweredQuestion`
- `QuestionMarkedAddressed`
- `QuestionAnswerSummaryStored`
- `StudentMarkedQuestionUnresolved`

Cursor voting:

- `CursorVotePromptCreated`
- `CursorVotePositionSampled`
- `CursorVoteSummaryCreated`

AI:

- `AIQuestionReviewed`
- `AIMessageClassified`
- `AIAnswerMatchCreated`
- `AIModerationDecisionCreated`
- `MessageVisibilityChanged`
- `StudentChatStrikeIssued`
- `StudentChatRevoked`

Future transcription:

- `TranscriptSegmentCreated`
- `TranscriptSegmentCorrected`
- `TranscriptAnswerMatchCreated`
- `SpokenAnswerDetected`
- `SpokenAnswerSummaryStored`

### High-volume event warning

Do not persist every pointer movement forever.

Recommended pattern:

- live cursor positions use ephemeral presence/realtime state
- explicit cursor-voting prompts can sample positions
- replay stores summaries, heatmaps, or sampled points for the prompt window

## 6. Candidate Data Model

Working entities:

- `sessions`
- `sessionResources`
- `participants`
- `sessionEvents`
- `messages`
- `questions`
- `questionClusters`
- `questionAnswerMatches`
- `cursorVotePrompts`
- `cursorVoteSamples` or `cursorVoteSummaries`
- later: `transcriptSegments`

### Session

Fields:

- `id`
- `title`
- `status`: draft | live | ended | archived
- `teacherId`
- `joinCode` / `joinSlug`
- `createdAt`
- `startedAt`
- `endedAt`
- `activeResourceId`
- `interactionMode`

### SessionResource

Fields:

- `id`
- `sessionId`
- `url`
- `title`
- `type`: generic_url | google_slides | form | pdf | controlled_page | unknown
- `sortOrder`
- `createdAt`
- `activatedAt` optional

### Participant

Fields:

- `id`
- `sessionId`
- `userId`
- `role`: teacher | student | assistant | ai
- `username`
- `email` private/admin only
- `joinedAt`
- `lastSeenAt`

### Question

Fields:

- `id`
- `sessionId`
- `participantId`
- `text`
- `status`: submitted | needs_review | already_answered | clustered | surfaced_to_teacher | answered | dismissed | unresolved
- `activeResourceIdAtSubmission`
- `createdAt`
- `addressedAt`
- `addressedBy`: ai | teacher | system
- `answerSummary`

### CursorVotePrompt

Fields:

- `id`
- `sessionId`
- `teacherId`
- `activeResourceId`
- `promptText`
- `startedAt`
- `endedAt`
- `status`

### CursorVoteSample/Summary

Fields:

- `promptId`
- `participantId` optional if individual samples are retained
- `xNorm`
- `yNorm`
- `viewportWidth`
- `viewportHeight`
- `timestamp`
- aggregated cluster/heatmap data for summary

## 7. Technical Shape for Hackathon

Likely stack direction:

- Web-first, mobile-responsive application rather than installed native mobile app.
- AstroJS application stack, starting from the user's existing Astro kickstart repo: `Timothyjoh/astro-kickstart`.
- Teacher dashboard should be browser/web-first.
- Student experience should be mobile-responsive web, optimized for phones but not requiring an app install.
- InstantDB is the chosen realtime/auth/data backbone for the hackathon.
- AI API for message classification, question clustering, moderation, and later answer matching.
- Email magic-link/code flow via InstantDB auth.

Earlier Expo/React Native thinking is deprioritized unless Expo Web proves useful. The product benefits from low-friction browser access: teachers and students should be able to click a link and participate immediately.

### Repository workflow decision

Decision: Blended should be forked/copied from `Timothyjoh/astro-kickstart`, but not before refreshing the kickstart itself.

Workflow:

1. Update dependencies in `Timothyjoh/astro-kickstart`. — Completed in commit `db779a0`.
2. Run install/build/verification on the kickstart. — Completed: `npm run build` and `npm audit`.
3. Commit and push the updated dependencies back to `astro-kickstart`. — Pushed to `main`.
4. Fork/copy from the updated kickstart to start the Blended project. — Local working copy created at `~/wrk/blended`; public GitHub repo created at `https://github.com/timothyjoh/blended`.
5. Begin Blended-specific branding, schema, and implementation work in the new fork/project. — Started with `/mockups` index plus 10 teacher/presenter and 10 student/chat prototype routes using Tailwind + shadcn/ui components.

Rationale: keep the reusable starter healthy first, then start Blended from a clean modern base.

## 8. Major Risks

### Arbitrary URL embedding

Some URLs will refuse iframe embedding due to CSP or X-Frame-Options.

Mitigations:

- detect embed failures
- display graceful fallback
- allow “open externally” fallback
- prioritize known embeddable resource types for demo
- later add controlled resources like PDFs/images/app-hosted pages

### Student interactions inside iframe are opaque

If students interact with arbitrary embedded content, the app may not know what they clicked or typed.

For MVP, that is acceptable. The app only needs to know:

- active resource
- student question/chat
- cursor-voting position over the container

### Cursor-voting coordinate mismatch

Different devices and viewport sizes can make exact coordinate comparison messy.

Mitigations:

- use normalized x/y coordinates
- store viewport metadata
- treat cursor-voting as approximate visual feedback
- use aggregate clusters rather than precise annotations

### AI answer matching without transcription

Without teacher speech transcription, AI can only know answers from textual teacher replies, pinned responses, chat, or manual teacher marks.

Mitigation:

- initial AI should be modest and cautious
- distinguish AI-inferred from teacher-confirmed
- let students mark “still unresolved”

### Scope creep

The product naturally wants to become Zoom + Miro + Canvas + Otter + Discord.

Do not let it.

Hackathon vertical slice should focus on:

1. session lifecycle
2. resource queue/switching
3. student join/auth
4. questions
5. cursor-voting
6. event log/replay foundation

## 9. Unresolved Product Questions

### Teacher authentication

Decision: teachers use the same email magic link/code mechanism as students.

Difference in routing:

- teacher authenticates from marketing page -> dashboard -> create first session
- student authenticates from join link -> existing session

Later option: Google Workspace / school SSO.

### Resource rendering priority

Decision: start with a controlled browser-like pane and fallback behavior.

Priority supported presentation/resource formats:

- Google Slides
- Gamma.app presentations
- Reveal.js presentations
- Slides.com presentations
- generic embeddable web URLs where feasible

This means the app controls the active resource, viewport wrapper, and interaction overlay, but does not promise full DOM access inside every external site.

### Student email visibility

Decision: preserve email in the database, but show only derived username during the live session.

- teacher sees username live
- other students see username live
- canonical email remains stored privately for auth/admin/export needs

### Teacher force-sync behavior

Should teacher be able to force student scroll position?

Options:

- never
- only in presentation/follow mode
- always when teacher chooses

Current leaning: not in MVP. Teacher controls active resource only; students scroll independently.

### Chat behavior

Decision: support natural student participation. Students should not have to explicitly mark a message as chat vs question. They type normally, and AI classifies the message.

The raw student stream may include:

- responses to the teacher
- peer discussion
- lightweight reactions
- explicit or implicit questions
- positive feedback
- duplicate/similar questions
- anonymous upvotes or endorsements of another student's question
- anonymous upvotes on positive feedback
- noise, profanity, spam, or bad vibes

AI should classify every message, filter/suppress bad content, group similar questions, and surface ranked question clusters to the teacher and students.

Prevailing question clusters should be easy to find:

- desktop/tablet: pinned near the top of the chat/question area
- mobile: separate questions pane/tab if the chat window is too constrained

Moderation display behavior:

- When a student submits a message, it can appear optimistically while the LLM validates it.
- The author continues to see their own moderated message, but crossed out/struck through if it is deemed in poor taste.
- Other students may briefly see the message during validation.
- If the LLM marks it as poor taste, profanity, abuse, spam, or bad vibes, the message is hidden from everyone except the author after validation.
- The teacher does not see rejected/problem messages during the live presentation.
- Rejected/problem messages are available only in an end-of-session moderation log.
- The moderation event should be recorded with category/reason and visibility outcome.
- Later, this can evolve into a “3 strikes and you are out” policy where repeated violations revoke the student's chat privileges.

The teacher should not have to manually inspect the full stream to find the important questions.

### AI authority

Decision: AI can hide messages from the shared student view after validation when they are deemed inappropriate.

Behavior:

- Messages may appear optimistically while validation is pending.
- If approved, message remains visible normally.
- If rejected, message is hidden from other students.
- The author still sees their own rejected message, displayed struck through.
- Moderation decisions are recorded as events.
- The teacher does not see rejected/moderated problem messages during the live presentation.
- During the live session, the teacher view should stay focused on positive participation and surfaced question clusters.
- Rejected/moderated messages are available to the teacher only in an end-of-session moderation log.
- Future escalation can track strikes and revoke chat access after repeated violations.

Rationale: the AI exists to remove this burden from the teacher during live instruction. The teacher should not be forced into disciplinary triage mid-presentation.

### Replay depth

What is enough replay for hackathon?

Possible minimum:

- show chronological event log
- reconstruct active resource changes
- show question timeline
- show cursor-voting prompt summary

Not required for hackathon:

- full video replay
- audio replay
- full pointer-stream playback
- transcript replay

## 10. Suggested 2-Week Hackathon Plan

### Days 1–2: Technical spike

Goals:

- Validate InstantDB auth/realtime fit in AstroJS.
- Validate `Timothyjoh/astro-kickstart` as the base project.
- Validate resource rendering in a web-first, mobile-responsive client.
- Validate cursor overlay over an embedded/controlled URL.
- Confirm teacher dashboard and student views can both work cleanly in browser.

Outputs:

- minimal session object
- one teacher view
- one student view
- active resource sync proof
- known-good demo resource URLs

### Days 3–5: Session lifecycle and resource queue

Build:

- create session
- queue resources
- join link
- start/end session
- activate resource
- student view updates live
- append session events

### Days 6–7: Student auth and identity

Build:

- email magic link/code join
- derived username
- participant list
- reconnect handling if feasible

### Days 8–9: Questions

Build:

- question submission
- teacher question dashboard
- question status transitions
- event logging

### Days 10–11: Cursor-voting

Build:

- teacher starts cursor-vote prompt
- student translucent cursor overlay
- normalized pointer tracking
- teacher sees live cursor positions or aggregate
- summary event emitted when prompt ends

### Days 12–13: AI question assistant and replay

Build:

- simple AI cluster/review pipeline
- likely already-answered detection from textual context
- student “still unresolved” action
- basic replay/event timeline view

### Day 14: Demo polish

Polish:

- scripted demo session
- seeded resources
- clean landing/join flow
- explain event-sourced replay clearly
- prepare fallback if external URL embedding fails

## 11. Demo Narrative

The demo should make the value obvious in under three minutes.

Suggested pitch:

> Teachers are overwhelmed by managing slides, chat, questions, and student confusion at the same time. Blended turns a live classroom session into an event-sourced learning timeline. The teacher controls the lesson resources, students participate without taking over the session, and AI helps keep questions from getting lost.

Demo beats:

1. Teacher creates “Biology Review.”
2. Teacher queues slides, article, and form.
3. Students join through magic-code email auth.
4. Teacher activates first resource.
5. Students ask similar questions.
6. AI clusters them.
7. Teacher enables cursor-vote: “Show me where this is confusing.”
8. Cursors cluster around one diagram area.
9. Teacher answers and marks question addressed.
10. Student sees their question addressed.
11. Session replay shows resources, question timeline, and cursor-vote summary.

## 12. Next Spec Work

Next documents likely needed:

1. `blended-technical-architecture.md`
   - exact InstantDB schema
   - auth flow
   - event model
   - client views
   - AI pipeline

2. `blended-hackathon-plan.md`
   - day-by-day build plan
   - concrete tasks
   - demo script
   - risk fallbacks

3. `blended-demo-script.md`
   - seed data
   - teacher/student actions
   - narration
   - fallback paths

4. `blended-event-model.md`
   - canonical event names
   - event payload schemas
   - replay reducer notes

## 13. Current North Star

Build the smallest believable version of:

> A synchronous learning session where the teacher controls resources, students participate through questions and cursor-voting, AI keeps the teacher from drowning, and every meaningful action becomes replayable.

That is the product. Everything else is garnish until the hackathon demo survives contact with oxygen.
