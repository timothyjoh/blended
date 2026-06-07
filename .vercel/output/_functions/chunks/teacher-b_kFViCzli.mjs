import { jsx, jsxs } from 'react/jsx-runtime';
import { Command, Wand2, Radio, Users, Sparkles, Pause, ChevronRight, MousePointer2, Maximize2, Activity, Play, MessageSquare, Vote, ShieldCheck, CheckCircle2, Flag, XCircle, Eye, Hand, Circle } from 'lucide-react';
import { c as cn, C as Card, d as CardHeader, e as CardTitle, a as CardContent, B as Badge, b as Button, P as Progress } from './progress_CjnhqaAD.mjs';
import { S as Separator } from './separator_BxIR5kTc.mjs';
import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

const Tabs = TabsPrimitive.Root;
const TabsList = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.List,
  {
    ref,
    className: cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    ),
    ...props
  }
));
TabsList.displayName = TabsPrimitive.List.displayName;
const TabsTrigger = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.Trigger,
  {
    ref,
    className: cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    ),
    ...props
  }
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;
const TabsContent = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  TabsPrimitive.Content,
  {
    ref,
    className: cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    ),
    ...props
  }
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

const resources = [
  { title: "Opening poll: ecosystems", kind: "Poll", status: "Done", time: "08:58" },
  { title: "Slide 12 — Energy transfer", kind: "Slide", status: "Live", time: "09:04" },
  { title: "PhET food-web simulation", kind: "Web", status: "Queued", time: "09:11" },
  { title: "Exit ticket: claim/evidence", kind: "Form", status: "Queued", time: "09:24" }
];
const clusters = [
  { topic: "Why does only 10% of energy move up?", count: 14, priority: 96, tone: "confused" },
  { topic: "Can decomposers be on every trophic level?", count: 9, priority: 84, tone: "curious" },
  { topic: "Difference between biomass and energy pyramid", count: 7, priority: 78, tone: "needs example" }
];
const moderation = [
  { name: "Maya", text: "I think the fox gets all the rabbit energy?", action: "pin to discuss" },
  { name: "Jon", text: "Off-topic meme in chat thread", action: "hide" },
  { name: "Ari", text: "Can you zoom in on the arrows?", action: "answer live" }
];
const events = [
  { t: "09:04:12", icon: Play, label: "Teacher advanced to Slide 12", color: "text-emerald-400" },
  { t: "09:05:03", icon: Users, label: "31 participants synced to active resource", color: "text-cyan-400" },
  { t: "09:06:48", icon: MessageSquare, label: "AI merged 8 similar questions", color: "text-violet-400" },
  { t: "09:07:20", icon: Vote, label: "Cursor-voting heatmap opened for 90 seconds", color: "text-amber-400" },
  { t: "09:08:55", icon: ShieldCheck, label: "2 chat items triaged by moderation rules", color: "text-rose-400" }
];
const students = ["AL", "MK", "JS", "PN", "RB", "ZT", "LO", "CN"];
function TopBar({ title, subtitle, dark = true }) {
  return /* @__PURE__ */ jsxs("div", { className: `flex items-center justify-between gap-4 ${dark ? "text-white" : "text-slate-950"}`, children: [
    /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-xs uppercase tracking-[0.28em] opacity-65", children: [
        /* @__PURE__ */ jsx(Radio, { className: "h-4 w-4" }),
        " Live session · BIO-204"
      ] }),
      /* @__PURE__ */ jsx("h1", { className: "m-0 py-1 font-sans text-3xl font-black tracking-tight md:text-5xl", children: title }),
      /* @__PURE__ */ jsx("p", { className: "font-sans text-sm opacity-70", children: subtitle })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 font-sans text-sm backdrop-blur", children: [
      /* @__PURE__ */ jsx(Users, { className: "h-4 w-4" }),
      " 31 live · 4 catching up"
    ] })
  ] });
}
function ResourceQueue({ compact = false }) {
  return /* @__PURE__ */ jsx("div", { className: "space-y-3", children: resources.map((item, index) => /* @__PURE__ */ jsx("div", { className: `rounded-2xl border p-3 font-sans ${item.status === "Live" ? "border-emerald-400 bg-emerald-400/15" : "border-white/10 bg-white/5"}`, children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ jsx("div", { className: "grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-xs font-bold", children: index + 1 }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "text-sm font-bold", children: item.title }),
        !compact && /* @__PURE__ */ jsxs("div", { className: "text-xs opacity-60", children: [
          item.kind,
          " · ",
          item.time
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx(Badge, { className: "border-white/10 bg-white/10 text-current", children: item.status })
  ] }) }, item.title)) });
}
function QuestionClusters() {
  return /* @__PURE__ */ jsx("div", { className: "space-y-3", children: clusters.map((cluster) => /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-white/10 bg-white/[0.06] p-4 font-sans", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { className: "text-sm font-bold", children: cluster.topic }),
        /* @__PURE__ */ jsxs("div", { className: "mt-1 text-xs opacity-60", children: [
          cluster.count,
          " students · ",
          cluster.tone
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Badge, { className: "bg-violet-500 text-white", children: [
        "AI ",
        cluster.priority
      ] })
    ] }),
    /* @__PURE__ */ jsx(Progress, { value: cluster.priority, className: "mt-3 h-2 bg-white/10 [&>div]:bg-violet-400" })
  ] }, cluster.topic)) });
}
function ActiveSlide({ stage = "dark" }) {
  const shell = stage === "light" ? "bg-white text-slate-950" : stage === "neon" ? "bg-slate-950 text-white" : "bg-[#101827] text-white";
  return /* @__PURE__ */ jsxs("div", { className: `relative overflow-hidden rounded-[2rem] border ${stage === "light" ? "border-slate-200" : "border-white/10"} ${shell} shadow-2xl`, children: [
    /* @__PURE__ */ jsx("div", { className: "absolute right-8 top-8 rounded-full bg-emerald-400 px-3 py-1 font-sans text-xs font-black text-emerald-950", children: "LIVE ON STUDENT DEVICES" }),
    /* @__PURE__ */ jsx("div", { className: "grid min-h-[460px] place-items-center p-10", children: /* @__PURE__ */ jsxs("div", { className: "max-w-3xl text-center font-sans", children: [
      /* @__PURE__ */ jsx("div", { className: "mx-auto mb-8 grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-cyan-400 text-slate-950 shadow-xl", children: /* @__PURE__ */ jsx(Sparkles, { className: "h-12 w-12" }) }),
      /* @__PURE__ */ jsx("div", { className: "text-sm uppercase tracking-[0.4em] opacity-50", children: "Slide 12 / Energy flow" }),
      /* @__PURE__ */ jsx("h2", { className: "mt-4 text-5xl font-black leading-tight md:text-7xl", children: "Only a small fraction of energy moves upward." }),
      /* @__PURE__ */ jsx("p", { className: "mx-auto mt-6 max-w-2xl text-lg opacity-70", children: "Students are highlighting where the model stops matching their intuition. Cursor votes are collecting on the transfer arrows." })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-t border-white/10 p-4 font-sans text-sm", children: [
      /* @__PURE__ */ jsx("span", { children: "https://blended.app/session/bio-204/resources/energy-pyramid" }),
      /* @__PURE__ */ jsxs("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", children: [
          /* @__PURE__ */ jsx(Pause, { className: "h-4 w-4" }),
          " Pause sync"
        ] }),
        /* @__PURE__ */ jsxs(Button, { size: "sm", children: [
          /* @__PURE__ */ jsx(ChevronRight, { className: "h-4 w-4" }),
          " Next"
        ] })
      ] })
    ] })
  ] });
}
function ModerationList() {
  return /* @__PURE__ */ jsx("div", { className: "space-y-3", children: moderation.map((item) => /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-slate-200 bg-white p-3 font-sans shadow-sm", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx("strong", { children: item.name }),
      /* @__PURE__ */ jsx(Badge, { variant: "outline", children: item.action })
    ] }),
    /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-slate-600", children: item.text })
  ] }, item.text)) });
}
function TeacherMockup06() {
  return /* @__PURE__ */ jsxs("main", { className: "min-h-screen bg-slate-950 p-5 font-sans text-white md:p-8", children: [
    /* @__PURE__ */ jsx(TopBar, { title: "Teacher command center", subtitle: "Dense presenter control surface for keeping the session moving while AI surfaces teachable moments." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-6 grid gap-5 xl:grid-cols-[280px_1fr_360px]", children: [
      /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2 text-lg", children: [
          /* @__PURE__ */ jsx(Command, {}),
          " Run of show"
        ] }) }),
        /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx(ResourceQueue, {}) })
      ] }),
      /* @__PURE__ */ jsx(ActiveSlide, {}),
      /* @__PURE__ */ jsxs("div", { className: "space-y-5", children: [
        /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: [
          /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2 text-lg", children: [
            /* @__PURE__ */ jsx(Wand2, {}),
            " AI-ranked questions"
          ] }) }),
          /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx(QuestionClusters, {}) })
        ] }),
        /* @__PURE__ */ jsx(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: /* @__PURE__ */ jsxs(CardContent, { className: "grid grid-cols-3 gap-3 p-4 text-center", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "text-3xl font-black", children: "87%" }),
            /* @__PURE__ */ jsx("div", { className: "text-xs opacity-60", children: "focused" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "text-3xl font-black", children: "42" }),
            /* @__PURE__ */ jsx("div", { className: "text-xs opacity-60", children: "votes" })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "text-3xl font-black", children: "3" }),
            /* @__PURE__ */ jsx("div", { className: "text-xs opacity-60", children: "flags" })
          ] })
        ] }) })
      ] })
    ] })
  ] });
}
function TeacherMockup07() {
  return /* @__PURE__ */ jsxs("main", { className: "min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe,transparent_35%),#f8fafc] p-6 font-sans text-slate-950 md:p-10", children: [
    /* @__PURE__ */ jsx(TopBar, { dark: false, title: "Slide-first stage", subtitle: "Minimal chrome around the active resource, with contextual queues tucked into glassy side rails." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-8 grid gap-6 lg:grid-cols-[1fr_310px]", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(ActiveSlide, { stage: "light" }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 flex flex-wrap items-center gap-3 rounded-3xl bg-slate-950 p-4 text-white", children: [
          /* @__PURE__ */ jsxs(Button, { children: [
            /* @__PURE__ */ jsx(MousePointer2, {}),
            " Start cursor vote"
          ] }),
          /* @__PURE__ */ jsxs(Button, { variant: "secondary", children: [
            /* @__PURE__ */ jsx(Maximize2, {}),
            " Present full screen"
          ] }),
          /* @__PURE__ */ jsx(Badge, { className: "ml-auto bg-cyan-500", children: "Heatmap: arrows cluster" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("aside", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxs(Card, { className: "rounded-3xl border-slate-200 bg-white/80 backdrop-blur", children: [
          /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "text-lg", children: "Up next" }) }),
          /* @__PURE__ */ jsx(CardContent, { className: "text-slate-950", children: /* @__PURE__ */ jsx(ResourceQueue, { compact: true }) })
        ] }),
        /* @__PURE__ */ jsxs(Card, { className: "rounded-3xl border-slate-200 bg-white/80", children: [
          /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "text-lg", children: "Participant pulse" }) }),
          /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx("div", { className: "grid grid-cols-4 gap-2", children: students.map((s) => /* @__PURE__ */ jsx("div", { className: "grid h-12 place-items-center rounded-2xl bg-slate-100 text-xs font-black", children: s }, s)) }) })
        ] })
      ] })
    ] })
  ] });
}
function TeacherMockup08() {
  return /* @__PURE__ */ jsxs("main", { className: "min-h-screen bg-zinc-950 p-6 font-sans text-white md:p-10", children: [
    /* @__PURE__ */ jsx(TopBar, { title: "Replay and event timeline", subtitle: "A forensic presenter view for reviewing the event-sourced session stream and jumping back to teachable moments." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-8 grid gap-6 lg:grid-cols-[360px_1fr]", children: [
      /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(Activity, {}),
          " Session event log"
        ] }) }),
        /* @__PURE__ */ jsx(CardContent, { className: "space-y-5", children: events.map((event) => {
          const Icon = event.icon;
          return /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[80px_32px_1fr] items-start gap-3", children: [
            /* @__PURE__ */ jsx("div", { className: "text-xs opacity-50", children: event.t }),
            /* @__PURE__ */ jsx("div", { className: `grid h-8 w-8 place-items-center rounded-full bg-white/10 ${event.color}`, children: /* @__PURE__ */ jsx(Icon, { className: "h-4 w-4" }) }),
            /* @__PURE__ */ jsx("div", { className: "text-sm", children: event.label })
          ] }, event.t);
        }) })
      ] }),
      /* @__PURE__ */ jsxs("section", { className: "space-y-5", children: [
        /* @__PURE__ */ jsxs("div", { className: "rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-900 to-slate-900 p-6", children: [
          /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center justify-between", children: [
            /* @__PURE__ */ jsx(Badge, { className: "bg-amber-400 text-amber-950", children: "Replay cursor · 09:07:20" }),
            /* @__PURE__ */ jsxs(Button, { variant: "secondary", children: [
              /* @__PURE__ */ jsx(Play, {}),
              " Resume live"
            ] })
          ] }),
          /* @__PURE__ */ jsx(ActiveSlide, { stage: "neon" })
        ] }),
        /* @__PURE__ */ jsx(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: /* @__PURE__ */ jsx(CardContent, { className: "grid gap-4 p-5 md:grid-cols-4", children: ["Active resource set", "Question cluster created", "Moderation action", "Student sync ack"].map((m, i) => /* @__PURE__ */ jsxs("div", { className: "rounded-2xl bg-white/5 p-4", children: [
          /* @__PURE__ */ jsx("div", { className: "text-2xl font-black", children: [18, 11, 5, 124][i] }),
          /* @__PURE__ */ jsx("div", { className: "text-xs opacity-60", children: m })
        ] }, m)) }) })
      ] })
    ] })
  ] });
}
function TeacherMockup09() {
  return /* @__PURE__ */ jsxs("main", { className: "min-h-screen bg-[#0f172a] p-6 font-sans text-white md:p-10", children: [
    /* @__PURE__ */ jsx(TopBar, { title: "Question cockpit", subtitle: "Optimized for seminar-style teaching where the presenter navigates from AI clusters into moderation and answers." }),
    /* @__PURE__ */ jsxs("div", { className: "mt-8 grid gap-6 xl:grid-cols-[1fr_420px]", children: [
      /* @__PURE__ */ jsxs("section", { className: "space-y-5", children: [
        /* @__PURE__ */ jsxs(Tabs, { defaultValue: "clusters", className: "w-full", children: [
          /* @__PURE__ */ jsxs(TabsList, { className: "bg-white/10 text-white", children: [
            /* @__PURE__ */ jsx(TabsTrigger, { value: "clusters", children: "AI clusters" }),
            /* @__PURE__ */ jsx(TabsTrigger, { value: "moderation", children: "Moderation" }),
            /* @__PURE__ */ jsx(TabsTrigger, { value: "draft", children: "Answer draft" })
          ] }),
          /* @__PURE__ */ jsx(TabsContent, { value: "clusters", children: /* @__PURE__ */ jsx(QuestionClusters, {}) }),
          /* @__PURE__ */ jsx(TabsContent, { value: "moderation", children: /* @__PURE__ */ jsx(ModerationList, {}) }),
          /* @__PURE__ */ jsx(TabsContent, { value: "draft", children: /* @__PURE__ */ jsxs(Card, { className: "bg-white text-slate-950", children: [
            /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { children: "Suggested live explanation" }) }),
            /* @__PURE__ */ jsx(CardContent, { className: "text-sm leading-7 text-slate-600", children: "Use the money analogy: each transfer spends most energy on movement, heat, and life processes. Ask students to predict what happens if producers decrease by half." })
          ] }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid gap-4 md:grid-cols-3", children: [
          /* @__PURE__ */ jsxs(Button, { className: "h-20 bg-emerald-500 text-base text-emerald-950 hover:bg-emerald-400", children: [
            /* @__PURE__ */ jsx(CheckCircle2, {}),
            " Answer live"
          ] }),
          /* @__PURE__ */ jsxs(Button, { className: "h-20 bg-amber-400 text-base text-amber-950 hover:bg-amber-300", children: [
            /* @__PURE__ */ jsx(Flag, {}),
            " Save for later"
          ] }),
          /* @__PURE__ */ jsxs(Button, { className: "h-20 bg-rose-500 text-base text-white hover:bg-rose-400", children: [
            /* @__PURE__ */ jsx(XCircle, {}),
            " Hide thread"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("aside", { className: "space-y-5", children: [
        /* @__PURE__ */ jsx(ActiveSlide, {}),
        /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.06] text-white", children: [
          /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { children: "Queue stays teacher-controlled" }) }),
          /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsx(ResourceQueue, { compact: true }) })
        ] })
      ] })
    ] })
  ] });
}
function TeacherMockup10() {
  return /* @__PURE__ */ jsx("main", { className: "min-h-screen bg-black font-sans text-white", children: /* @__PURE__ */ jsxs("div", { className: "grid min-h-screen grid-rows-[1fr_auto]", children: [
    /* @__PURE__ */ jsxs("section", { className: "relative grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_30%,rgba(34,211,238,.24),transparent_35%),linear-gradient(135deg,#020617,#111827)] p-8", children: [
      /* @__PURE__ */ jsx("div", { className: "absolute left-6 top-6 rounded-full bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.28em] backdrop-blur", children: "BIO-204 · Session live · 31" }),
      /* @__PURE__ */ jsxs("div", { className: "absolute right-6 top-6 flex gap-2", children: [
        /* @__PURE__ */ jsxs(Button, { size: "sm", variant: "secondary", children: [
          /* @__PURE__ */ jsx(Eye, {}),
          " Student view"
        ] }),
        /* @__PURE__ */ jsxs(Button, { size: "sm", children: [
          /* @__PURE__ */ jsx(Hand, {}),
          " Lock activity"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "max-w-5xl text-center", children: [
        /* @__PURE__ */ jsx("div", { className: "text-sm uppercase tracking-[0.5em] text-cyan-200/60", children: "Minimal presentation mode" }),
        /* @__PURE__ */ jsx("h1", { className: "mt-6 text-6xl font-black tracking-tight md:text-8xl", children: "Energy transfer is inefficient." }),
        /* @__PURE__ */ jsx("p", { className: "mx-auto mt-8 max-w-3xl text-xl leading-8 text-white/65", children: "Tap space to advance. Hidden presenter rail still tracks queue, questions, votes, and replay events without distracting from the active resource." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-full border border-white/10 bg-black/40 px-5 py-3 backdrop-blur", children: [
        /* @__PURE__ */ jsx(Circle, { className: "h-3 w-3 fill-emerald-400 text-emerald-400" }),
        " Slide 12 active ",
        /* @__PURE__ */ jsx(Separator, { orientation: "vertical", className: "h-5 bg-white/20" }),
        " 42 cursor votes ",
        /* @__PURE__ */ jsx(Separator, { orientation: "vertical", className: "h-5 bg-white/20" }),
        " 3 urgent questions"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "grid gap-px bg-white/10 md:grid-cols-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "bg-zinc-950 p-4", children: [
        /* @__PURE__ */ jsx("div", { className: "text-xs text-white/40", children: "Next resource" }),
        /* @__PURE__ */ jsx("div", { className: "font-bold", children: "PhET food-web simulation" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-zinc-950 p-4", children: [
        /* @__PURE__ */ jsx("div", { className: "text-xs text-white/40", children: "AI top cluster" }),
        /* @__PURE__ */ jsx("div", { className: "font-bold", children: "10% energy transfer confusion" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-zinc-950 p-4", children: [
        /* @__PURE__ */ jsx("div", { className: "text-xs text-white/40", children: "Moderation" }),
        /* @__PURE__ */ jsx("div", { className: "font-bold text-amber-300", children: "2 need review" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "bg-zinc-950 p-4", children: [
        /* @__PURE__ */ jsx("div", { className: "text-xs text-white/40", children: "Replay marker" }),
        /* @__PURE__ */ jsx("div", { className: "font-bold", children: "09:07 cursor vote opened" })
      ] })
    ] })
  ] }) });
}

export { TeacherMockup06 as T, TeacherMockup07 as a, TeacherMockup08 as b, TeacherMockup09 as c, TeacherMockup10 as d };
