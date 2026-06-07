import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { ListChecks, Sparkles, Radio, Users, Eye, ArrowRight, CheckCircle2, MousePointer2, Link2, Play, Activity, BarChart3 } from 'lucide-react';
import { C as Card, d as CardHeader, e as CardTitle, a as CardContent, B as Badge, b as Button, P as Progress } from './progress_CV5MPcCN.mjs';

const resources = [
  { title: "Photosynthesis Review Deck", type: "Google Slides", state: "Live", time: "09:04" },
  { title: "Leaf Anatomy Article", type: "Web article", state: "Next", time: "09:13" },
  { title: "Chloroplast Checkpoint", type: "Google Form", state: "Queued", time: "09:22" }
];
const questions = [
  { text: "Where does the oxygen actually come from?", count: 18, priority: 98, status: "surface now" },
  { text: "Is ATP made in the light reactions or Calvin cycle?", count: 11, priority: 86, status: "clustered" },
  { text: "What does carbon fixation mean in plain English?", count: 8, priority: 74, status: "upvoted" }
];
const events = [
  ["09:00", "SessionStarted", "34 students joined from magic link"],
  ["09:04", "ResourceActivated", "Photosynthesis Review Deck / slide 9"],
  ["09:06", "QuestionClusterCreated", "Oxygen-source confusion merged from 12 messages"],
  ["09:08", "CursorVoteStarted", "Hover where the diagram gets confusing"],
  ["09:10", "TeacherMarkedAnswered", "Oxygen-source cluster addressed live"]
];
function MiniResourceQueue({ light = false }) {
  return /* @__PURE__ */ jsx("div", { className: "space-y-3", children: resources.map((resource, index) => /* @__PURE__ */ jsx(
    "div",
    {
      className: `rounded-2xl border p-3 font-sans ${resource.state === "Live" ? light ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-emerald-400/50 bg-emerald-400/15 text-white" : light ? "border-slate-200 bg-white text-slate-700" : "border-white/10 bg-white/[0.06] text-white/80"}`,
      children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "grid h-9 w-9 place-items-center rounded-xl bg-current/10 text-sm font-black", children: index + 1 }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "text-sm font-bold", children: resource.title }),
            /* @__PURE__ */ jsxs("div", { className: "text-xs opacity-60", children: [
              resource.type,
              " · ",
              resource.time
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx(Badge, { variant: resource.state === "Live" ? "default" : "outline", children: resource.state })
      ] })
    },
    resource.title
  )) });
}
function QuestionStack({ light = false }) {
  return /* @__PURE__ */ jsx("div", { className: "space-y-3", children: questions.map((question) => /* @__PURE__ */ jsxs("div", { className: `rounded-2xl border p-4 font-sans ${light ? "border-slate-200 bg-white" : "border-white/10 bg-white/[0.06]"}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "text-sm font-black", children: question.text }),
        /* @__PURE__ */ jsxs("div", { className: "mt-1 text-xs opacity-60", children: [
          question.count,
          " students · ",
          question.status
        ] })
      ] }),
      /* @__PURE__ */ jsx(Badge, { className: "bg-violet-500 text-white", children: question.priority })
    ] }),
    /* @__PURE__ */ jsx(Progress, { value: question.priority, className: "mt-3 h-2" })
  ] }, question.text)) });
}
function ResourceStage({ heatmap = false, light = false }) {
  return /* @__PURE__ */ jsxs("div", { className: `relative overflow-hidden rounded-[2rem] border shadow-2xl ${light ? "border-slate-200 bg-white text-slate-950" : "border-white/10 bg-slate-950 text-white"}`, children: [
    /* @__PURE__ */ jsxs("div", { className: "absolute left-6 top-6 z-10 flex items-center gap-2 rounded-full bg-emerald-400 px-3 py-1 font-sans text-xs font-black text-emerald-950", children: [
      /* @__PURE__ */ jsx(Radio, { className: "h-3 w-3" }),
      " synced to students"
    ] }),
    heatmap && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: "absolute left-[57%] top-[42%] h-40 w-40 rounded-full bg-amber-300/35 blur-2xl" }),
      /* @__PURE__ */ jsx("div", { className: "absolute left-[62%] top-[48%] h-20 w-20 rounded-full border-4 border-amber-300/70 bg-amber-300/20" }),
      /* @__PURE__ */ jsx("div", { className: "absolute left-[49%] top-[35%] h-16 w-16 rounded-full bg-cyan-300/25" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "grid min-h-[430px] place-items-center p-10", children: /* @__PURE__ */ jsxs("div", { className: "max-w-3xl text-center font-sans", children: [
      /* @__PURE__ */ jsx("div", { className: "mx-auto grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-500 text-emerald-950 shadow-xl", children: /* @__PURE__ */ jsx(Sparkles, { className: "h-11 w-11" }) }),
      /* @__PURE__ */ jsx("div", { className: "mt-8 text-xs uppercase tracking-[0.45em] opacity-50", children: "Slide 09 · Chloroplast diagram" }),
      /* @__PURE__ */ jsx("h2", { className: "mt-4 text-5xl font-black tracking-tight md:text-7xl", children: "Light reactions split water." }),
      /* @__PURE__ */ jsx("p", { className: "mx-auto mt-5 max-w-2xl text-lg opacity-65", children: "The active resource is teacher-controlled. Student devices can scroll locally, but the session spine remains synchronized." })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: `flex items-center justify-between border-t p-4 font-sans text-sm ${light ? "border-slate-200" : "border-white/10"}`, children: [
      /* @__PURE__ */ jsx("span", { className: "opacity-65", children: "resource://photosynthesis-review/slide-09" }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", children: [
          /* @__PURE__ */ jsx(Eye, {}),
          " Student view"
        ] }),
        /* @__PURE__ */ jsxs(Button, { size: "sm", children: [
          /* @__PURE__ */ jsx(ArrowRight, {}),
          " Activate next"
        ] })
      ] })
    ] })
  ] });
}
function TeacherHeader({ eyebrow, title, subtitle, light = false }) {
  return /* @__PURE__ */ jsxs("header", { className: `flex flex-col justify-between gap-4 md:flex-row md:items-end ${light ? "text-slate-950" : "text-white"}`, children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 font-sans text-xs uppercase tracking-[0.32em] opacity-60", children: [
        /* @__PURE__ */ jsx(Radio, { className: "h-4 w-4" }),
        " ",
        eyebrow
      ] }),
      /* @__PURE__ */ jsx("h1", { className: "m-0 py-2 font-sans text-4xl font-black tracking-tight md:text-6xl", children: title }),
      /* @__PURE__ */ jsx("p", { className: "max-w-2xl font-sans text-sm opacity-70", children: subtitle })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: `rounded-full border px-4 py-2 font-sans text-sm ${light ? "border-slate-200 bg-white" : "border-white/10 bg-white/10"}`, children: [
      /* @__PURE__ */ jsx(Users, { className: "mr-2 inline h-4 w-4" }),
      "34 live · 6 questions clustered"
    ] })
  ] });
}
function TeacherMockup01() {
  return /* @__PURE__ */ jsxs("main", { className: "min-h-screen bg-[#07111f] p-6 font-sans text-white md:p-10", children: [
    /* @__PURE__ */ jsx(TeacherHeader, { eyebrow: "Teacher · live session", title: "Resource command deck", subtitle: "A balanced presenter cockpit: active web resource in the center, pacing controls on the left, AI question pressure on the right." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-8 grid gap-5 xl:grid-cols-[310px_1fr_360px]", children: [
      /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(ListChecks, {}),
          " Run of show"
        ] }) }),
        /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx(MiniResourceQueue, {}) })
      ] }),
      /* @__PURE__ */ jsx(ResourceStage, {}),
      /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Sparkles, {}),
          " AI triage"
        ] }) }),
        /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx(QuestionStack, {}) })
      ] })
    ] })
  ] });
}
function TeacherMockup02() {
  return /* @__PURE__ */ jsxs("main", { className: "min-h-screen bg-[radial-gradient(circle_at_top_left,#ede9fe,transparent_35%),#f8fafc] p-6 font-sans text-slate-950 md:p-10", children: [
    /* @__PURE__ */ jsx(TeacherHeader, { light: true, eyebrow: "Teacher · question mode", title: "Question triage board", subtitle: "For the moment when the teacher needs to stop reading chat and answer the themes that actually matter." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-8 grid gap-6 lg:grid-cols-[1fr_390px]", children: [
      /* @__PURE__ */ jsx("section", { className: "grid gap-4 md:grid-cols-3", children: questions.map((q, index) => /* @__PURE__ */ jsxs(Card, { className: "rounded-3xl border-slate-200 bg-white shadow-sm", children: [
        /* @__PURE__ */ jsxs(CardHeader, { children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxs(Badge, { children: [
              "Priority ",
              index + 1
            ] }),
            /* @__PURE__ */ jsxs(Badge, { variant: "outline", children: [
              q.count,
              " students"
            ] })
          ] }),
          /* @__PURE__ */ jsx(CardTitle, { className: "mt-3 text-2xl leading-tight", children: q.text })
        ] }),
        /* @__PURE__ */ jsxs(CardContent, { children: [
          /* @__PURE__ */ jsx(Progress, { value: q.priority }),
          /* @__PURE__ */ jsxs("div", { className: "mt-4 flex gap-2", children: [
            /* @__PURE__ */ jsxs(Button, { size: "sm", children: [
              /* @__PURE__ */ jsx(CheckCircle2, {}),
              " Answered"
            ] }),
            /* @__PURE__ */ jsx(Button, { size: "sm", variant: "outline", children: "Pin" })
          ] })
        ] })
      ] }, q.text)) }),
      /* @__PURE__ */ jsxs("aside", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxs(Card, { className: "rounded-3xl", children: [
          /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { children: "Raw stream classification" }) }),
          /* @__PURE__ */ jsxs(CardContent, { className: "space-y-3 text-sm", children: [
            /* @__PURE__ */ jsx("div", { className: "rounded-2xl bg-violet-50 p-3", children: "Question · “Where did the oxygen come from?”" }),
            /* @__PURE__ */ jsx("div", { className: "rounded-2xl bg-emerald-50 p-3", children: "Positive signal · “Ohhh the water part helps”" }),
            /* @__PURE__ */ jsx("div", { className: "rounded-2xl bg-rose-50 p-3", children: "Hidden · off-topic spam" })
          ] })
        ] }),
        /* @__PURE__ */ jsx(ResourceStage, { light: true })
      ] })
    ] })
  ] });
}
function TeacherMockup03() {
  return /* @__PURE__ */ jsxs("main", { className: "min-h-screen bg-black p-5 font-sans text-white md:p-8", children: [
    /* @__PURE__ */ jsx(TeacherHeader, { eyebrow: "Teacher · cursor voting active", title: "Heatmap presenter", subtitle: "A stage-first screen for running the prompt: “Hover over the part of the diagram that is confusing.”" }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 grid gap-5 lg:grid-cols-[1fr_330px]", children: [
      /* @__PURE__ */ jsx(ResourceStage, { heatmap: true }),
      /* @__PURE__ */ jsxs("aside", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxs(Card, { className: "border-amber-300/30 bg-amber-300/10 text-white", children: [
          /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(MousePointer2, {}),
            " Cursor vote"
          ] }) }),
          /* @__PURE__ */ jsxs(CardContent, { children: [
            /* @__PURE__ */ jsx("div", { className: "text-5xl font-black", children: "42" }),
            /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-white/65", children: "active markers, strongest cluster on water-splitting arrow." }),
            /* @__PURE__ */ jsx(Progress, { value: 82, className: "mt-4" }),
            /* @__PURE__ */ jsx(Button, { className: "mt-4 w-full bg-amber-300 text-amber-950 hover:bg-amber-200", children: "End vote and save summary" })
          ] })
        ] }),
        /* @__PURE__ */ jsx(QuestionStack, {})
      ] })
    ] })
  ] });
}
function TeacherMockup04() {
  return /* @__PURE__ */ jsxs("main", { className: "min-h-screen bg-slate-100 p-6 font-sans text-slate-950 md:p-10", children: [
    /* @__PURE__ */ jsx(TeacherHeader, { light: true, eyebrow: "Teacher · prep/control", title: "Resource queue rehearsal", subtitle: "Pre-class and live pacing in one: verify embeds, reorder resources, and launch the next session event deliberately." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-8 grid gap-6 xl:grid-cols-[430px_1fr]", children: [
      /* @__PURE__ */ jsxs(Card, { className: "rounded-[2rem] border-slate-200 bg-white", children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Link2, {}),
          " Queued resources"
        ] }) }),
        /* @__PURE__ */ jsxs(CardContent, { children: [
          /* @__PURE__ */ jsx(MiniResourceQueue, { light: true }),
          /* @__PURE__ */ jsxs(Button, { className: "mt-4 w-full", children: [
            /* @__PURE__ */ jsx(Play, {}),
            " Start session from queue"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "grid gap-5 md:grid-cols-2", children: [
        /* @__PURE__ */ jsxs(Card, { className: "rounded-[2rem]", children: [
          /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { children: "Embed readiness" }) }),
          /* @__PURE__ */ jsx(CardContent, { className: "space-y-4", children: resources.map((r) => /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between rounded-2xl bg-slate-50 p-4", children: [
            /* @__PURE__ */ jsx("span", { children: r.title }),
            /* @__PURE__ */ jsx(Badge, { className: "bg-emerald-600", children: "verified" })
          ] }, r.title)) })
        ] }),
        /* @__PURE__ */ jsxs(Card, { className: "rounded-[2rem]", children: [
          /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { children: "Session launch checklist" }) }),
          /* @__PURE__ */ jsx(CardContent, { className: "space-y-3 text-sm", children: ["Magic link ready", "AI triage enabled", "Cursor-vote overlay calibrated", "Replay event stream recording"].map((item) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm", children: [
            /* @__PURE__ */ jsx(CheckCircle2, { className: "h-5 w-5 text-emerald-600" }),
            item
          ] }, item)) })
        ] })
      ] })
    ] })
  ] });
}
function TeacherMockup05() {
  return /* @__PURE__ */ jsxs("main", { className: "min-h-screen bg-zinc-950 p-6 font-sans text-white md:p-10", children: [
    /* @__PURE__ */ jsx(TeacherHeader, { eyebrow: "Teacher · session ended", title: "Replay artifact review", subtitle: "The live class becomes a durable learning artifact: resource switches, clustered questions, answers, and cursor-vote summaries." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-8 grid gap-6 lg:grid-cols-[360px_1fr]", children: [
      /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Activity, {}),
          " Event stream"
        ] }) }),
        /* @__PURE__ */ jsx(CardContent, { className: "space-y-4", children: events.map(([time, type, label]) => /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[56px_1fr] gap-3 rounded-2xl bg-white/[0.05] p-3", children: [
          /* @__PURE__ */ jsx("div", { className: "text-xs text-white/45", children: time }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(Badge, { variant: "outline", className: "border-white/20 text-white", children: type }),
            /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-white/70", children: label })
          ] })
        ] }, time)) })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "space-y-5", children: [
        /* @__PURE__ */ jsx("div", { className: "grid gap-4 md:grid-cols-4", children: [["34", "participants"], ["18", "question events"], ["3", "resources"], ["1", "heatmap saved"]].map(([n, l]) => /* @__PURE__ */ jsx(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: /* @__PURE__ */ jsxs(CardContent, { className: "p-5", children: [
          /* @__PURE__ */ jsx("div", { className: "text-4xl font-black", children: n }),
          /* @__PURE__ */ jsx("div", { className: "text-xs uppercase tracking-[0.2em] text-white/45", children: l })
        ] }) }, l)) }),
        /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: [
          /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(BarChart3, {}),
            " Answered clusters"
          ] }) }),
          /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx(QuestionStack, {}) })
        ] })
      ] })
    ] })
  ] });
}

export { TeacherMockup01 as T, TeacherMockup02 as a, TeacherMockup03 as b, TeacherMockup04 as c, TeacherMockup05 as d };
