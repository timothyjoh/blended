import { c as createComponent } from './astro-component_dP7T5GyB.mjs';
import 'piccolore';
import { f as renderHead, r as renderTemplate } from './entrypoint_BV0A0AU2.mjs';
import 'clsx';
import { r as renderScript } from './script_C4bdxVXR.mjs';

const $$Pitch = createComponent(($$result, $$props, $$slots) => {
  return renderTemplate`<html lang="en"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Blended Pitch</title><meta name="description" content="Blended pitch deck: an event-sourced live classroom session system for teachers and students.">${renderHead()}</head> <body> <div class="reveal blended-pitch"> <img class="brand-bug" src="/assets/blendly-logo.jpeg" alt="Blendly logo"> <div class="slides"> <section class="title-slide" data-background-gradient="linear-gradient(135deg, #05070b 0%, #07111f 45%, #172554 100%)"> <div class="title-grid"> <div> <p class="eyebrow">Blendly · learn together</p> <h1>Live classrooms deserve a memory.</h1> <p class="lede">
Blended turns synchronous teaching into a replayable, AI-assisted learning timeline.
</p> <p class="footnote">Teacher-controlled resources · Natural student participation · Event-sourced replay</p> </div> <div class="logo-card"> <img src="/assets/blendly-logo.jpeg" alt="Blendly learn together logo"> </div> </div> </section> <section> <p class="eyebrow">The problem</p> <h2>Teachers are running three rooms at once.</h2> <div class="three-grid"> <article> <strong>Presenting</strong> <span>Slides, links, forms, demos, and pacing.</span> </article> <article> <strong>Reading the room</strong> <span>Who is lost? What question keeps repeating?</span> </article> <article> <strong>Recovering the lesson</strong> <span>What happened, what was answered, and who needs help next?</span> </article> </div> <p class="callout">The live moment disappears. The learning signal does too.</p> </section> <section> <p class="eyebrow">The answer</p> <h2>Not chat. Not Zoom. A live learning session.</h2> <p class="lede compact">
A teacher creates a bounded session, queues web resources, invites students, switches the active resource, and gets AI help surfacing the questions that matter.
</p> <div class="signal-row"> <span>Session</span> <span>Resource queue</span> <span>Question triage</span> <span>Cursor voting</span> <span>Replay</span> </div> </section> <section> <p class="eyebrow">Product spine</p> <h2>The event stream is the product.</h2> <pre><code data-trim>
SessionStarted
ResourceActivated
ChatMessageSubmitted
AIMessageClassified
QuestionClusterCreated
CursorVoteStarted
CursorVoteSummaryCreated
TeacherMarkedQuestionAnswered
SessionEnded
          </code></pre> <p class="callout">Every meaningful classroom action becomes evidence the app can replay, summarize, and learn from.</p> </section> <section> <p class="eyebrow">Teacher flow</p> <h2>Before class: queue the lesson.</h2> <ol class="steps"> <li>Create “Photosynthesis Review.”</li> <li>Add slides, an article, and a checkpoint form.</li> <li>Check embedding and fallback behavior.</li> <li>Share the magic-link join URL.</li> </ol> </section> <section> <p class="eyebrow">Live class</p> <h2>The teacher controls the active resource.</h2> <div class="device-frame teacher-frame"> <div class="rail"> <b>Run of show</b> <span class="active">1 · Deck</span> <span>2 · Article</span> <span>3 · Checkpoint</span> </div> <div class="stage"> <span>Active resource</span> <h3>Light reactions split water.</h3> </div> <div class="rail right"> <b>AI triage</b> <span>18 votes · “Why quarter?”</span> <span>11 votes · “What is ATP?”</span> </div> </div> </section> <section> <p class="eyebrow">Student flow</p> <h2>Students participate naturally.</h2> <p class="lede compact">They join from a link, authenticate by email magic code, and type like humans. The system classifies the stream.</p> <div class="two-col"> <div> <h3>Students can</h3> <ul> <li>Scroll locally</li> <li>Ask questions</li> <li>Upvote anonymous clusters</li> <li>Use cursor-voting prompts</li> </ul> </div> <div> <h3>Students cannot</h3> <ul> <li>Take over the active URL</li> <li>Rename themselves in MVP</li> <li>Free-draw on the shared screen</li> </ul> </div> </div> </section> <section> <p class="eyebrow">AI assistant</p> <h2>AI keeps teachers out of the chat swamp.</h2> <div class="cards"> <article><b>Classify</b><span>question, response, feedback, confusion, noise</span></article> <article><b>Cluster</b><span>group similar questions and rank by demand</span></article> <article><b>Moderate</b><span>hide bad vibes from peers; keep an audit log</span></article> <article><b>Later</b><span>match spoken answers from transcription</span></article> </div> </section> <section> <p class="eyebrow">Interaction</p> <h2>Cursor-voting beats freehand drawing for MVP.</h2> <div class="heatmap-demo"> <div class="blob one"></div> <div class="blob two"></div> <div class="blob three"></div> <h3>“Hover over the part you don’t understand.”</h3> <p>Normalized positions become a lightweight confusion map.</p> </div> </section> <section> <p class="eyebrow">Replay</p> <h2>The session does not vanish when the bell rings.</h2> <ul class="big-list"> <li>Resource switches reconstruct the lesson path.</li> <li>Open and answered questions stay reviewable.</li> <li>Cursor-vote summaries show where confusion clustered.</li> <li>Future transcript segments make spoken answers searchable.</li> </ul> </section> <section> <p class="eyebrow">Hackathon scope</p> <h2>Build the smallest convincing vertical slice.</h2> <div class="timeline"> <span>Days 1–2<br><b>Realtime spike</b></span> <span>3–5<br><b>Session + queue</b></span> <span>6–7<br><b>Auth + identity</b></span> <span>8–11<br><b>Questions + cursors</b></span> <span>12–14<br><b>AI + replay + polish</b></span> </div> </section> <section> <p class="eyebrow">Risks</p> <h2>The traps are known. Good. We can avoid them.</h2> <div class="two-col risks"> <div> <h3>Embedding</h3> <p>Some sites block iframes. Detect failure, show fallback, and demo known-good resources.</p> </div> <div> <h3>Scope creep</h3> <p>This is not Zoom + Miro + Canvas + Otter. Start with sessions, resources, questions, cursor voting, and replay.</p> </div> </div> </section> <section data-background-gradient="linear-gradient(135deg, #020617 0%, #0f172a 55%, #164e63 100%)"> <p class="eyebrow">North star</p> <h2>A synchronous learning session where every meaningful action becomes replayable.</h2> <p class="lede compact">Teacher controls the lesson. Students participate without taking over. AI keeps questions from getting lost. The class leaves behind a learning artifact.</p> <p class="footnote"><a href="/mockups">View mockups</a> · <a href="https://github.com/timothyjoh/blended/blob/main/docs/SPEC.md">Read spec in repo</a></p> </section> </div> </div> ${renderScript($$result, "C:/Users/butters/wrk/blended/src/pages/pitch.astro?astro&type=script&index=0&lang.ts")} </body> </html>`;
}, "C:/Users/butters/wrk/blended/src/pages/pitch.astro", void 0);

const $$file = "C:/Users/butters/wrk/blended/src/pages/pitch.astro";
const $$url = "/pitch";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Pitch,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
