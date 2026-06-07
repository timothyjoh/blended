import { jsx, jsxs } from 'react/jsx-runtime';
import { MousePointer2, Clock3, Sparkles, ChevronUp, PlayCircle, BookOpen, Eye, Highlighter, MessageCircle, CheckCircle2, Users, Send, Hand } from 'lucide-react';
import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { c as cn, C as Card, a as CardContent, B as Badge, P as Progress, b as Button, d as CardHeader, e as CardTitle } from './progress_C8VRBEN2.mjs';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { S as Separator } from './separator_Bo4-XVVU.mjs';

const Avatar = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AvatarPrimitive.Root,
  {
    ref,
    className: cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className
    ),
    ...props
  }
));
Avatar.displayName = AvatarPrimitive.Root.displayName;
const AvatarImage = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AvatarPrimitive.Image,
  {
    ref,
    className: cn("aspect-square h-full w-full", className),
    ...props
  }
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;
const AvatarFallback = React.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsx(
  AvatarPrimitive.Fallback,
  {
    ref,
    className: cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted",
      className
    ),
    ...props
  }
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

const ScrollArea = React.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ jsxs(
  ScrollAreaPrimitive.Root,
  {
    ref,
    className: cn("relative overflow-hidden", className),
    ...props,
    children: [
      /* @__PURE__ */ jsx(ScrollAreaPrimitive.Viewport, { className: "h-full w-full rounded-[inherit]", children }),
      /* @__PURE__ */ jsx(ScrollBar, {}),
      /* @__PURE__ */ jsx(ScrollAreaPrimitive.Corner, {})
    ]
  }
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;
const ScrollBar = React.forwardRef(({ className, orientation = "vertical", ...props }, ref) => /* @__PURE__ */ jsx(
  ScrollAreaPrimitive.ScrollAreaScrollbar,
  {
    ref,
    orientation,
    className: cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" && "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" && "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    ),
    ...props,
    children: /* @__PURE__ */ jsx(ScrollAreaPrimitive.ScrollAreaThumb, { className: "relative flex-1 rounded-full bg-border" })
  }
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ jsx(
    "textarea",
    {
      className: cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      ),
      ref,
      ...props
    }
  );
});
Textarea.displayName = "Textarea";

const messages = [
  { who: "maria", text: "Is the independent variable the lamp distance or the brightness reading?", time: "10:12" },
  { who: "teacher", role: "Teacher", text: "Distance is what we change. Brightness is what we measure.", time: "10:13", answer: true },
  { who: "eli", text: "So the graph should curve down, not be a straight line?", time: "10:14" },
  { who: "jordan", text: "I got stuck on why doubling distance quarters the light.", time: "10:15", mine: true }
];
const questionClusters = [
  { title: "Which axis gets distance?", votes: 18, tag: "graph setup", answered: true },
  { title: "Why inverse-square instead of linear?", votes: 14, tag: "concept" },
  { title: "Do we average all three trials first?", votes: 9, tag: "data table" }
];
const answered = [
  { q: "What counts as the control variable?", a: "Keep the bulb, room lighting, and sensor angle constant." },
  { q: "Can I zoom the resource?", a: "Yes — your zoom and scroll are local and do not affect classmates." }
];
const resourceRows = [
  ["10 cm", "820 lux", "801 lux", "811 lux"],
  ["20 cm", "215 lux", "204 lux", "210 lux"],
  ["40 cm", "58 lux", "54 lux", "56 lux"]
];
const peers = ["AL", "MJ", "ET", "SK", "NP"];
function Shell({ children, variant }) {
  return /* @__PURE__ */ jsxs("div", { className: "min-h-screen bg-slate-950 text-slate-100", children: [
    /* @__PURE__ */ jsx("div", { className: "pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,.28),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,.24),transparent_32%)]" }),
    /* @__PURE__ */ jsxs("div", { className: "relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-3 py-3 sm:px-5 lg:px-6", children: [
      /* @__PURE__ */ jsxs("header", { className: "mb-3 flex items-center justify-between rounded-3xl border border-white/10 bg-white/10 px-4 py-3 shadow-2xl backdrop-blur", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsx("div", { className: "flex size-10 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20", children: /* @__PURE__ */ jsx(BookOpen, { className: "size-5" }) }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.24em] text-cyan-200", children: "Blended live session" }),
            /* @__PURE__ */ jsx("h1", { className: "m-0 p-0 font-sans text-base font-semibold leading-tight text-white sm:text-lg", children: "Physics Lab: Light Intensity" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "hidden items-center gap-2 sm:flex", children: [
          /* @__PURE__ */ jsx(Badge, { className: "border-emerald-300/30 bg-emerald-300/15 text-emerald-100", children: "Signed in as jordan" }),
          /* @__PURE__ */ jsxs(Badge, { variant: "outline", className: "border-white/20 text-slate-200", children: [
            "Mockup ",
            variant
          ] })
        ] })
      ] }),
      children
    ] })
  ] });
}
function ResourceCard({ dense = false, withCursors = false }) {
  return /* @__PURE__ */ jsxs(Card, { className: "relative overflow-hidden border-white/10 bg-white/[0.08] text-slate-100 shadow-2xl backdrop-blur", children: [
    /* @__PURE__ */ jsx(CardHeader, { className: cn("pb-3", dense && "p-4 pb-2"), children: /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(CardTitle, { className: "font-sans text-lg text-white", children: "Teacher-selected resource" }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-slate-300", children: "Slide 4 · Inverse-square lab handout" })
      ] }),
      /* @__PURE__ */ jsx(Badge, { className: "bg-cyan-300 text-slate-950", children: "Active now" })
    ] }) }),
    /* @__PURE__ */ jsxs(CardContent, { className: cn("space-y-4", dense && "p-4 pt-0"), children: [
      /* @__PURE__ */ jsxs("div", { className: "relative rounded-3xl border border-white/10 bg-slate-900/80 p-4", children: [
        withCursors && /* @__PURE__ */ jsx(CursorLayer, {}),
        /* @__PURE__ */ jsxs("div", { className: "mb-4 flex items-center justify-between", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.22em] text-cyan-200", children: "Experiment notes" }),
            /* @__PURE__ */ jsx("h2", { className: "font-sans text-2xl font-bold text-white", children: "How light fades with distance" })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300", children: "Local scroll: 68%" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "grid gap-4 lg:grid-cols-[1fr_0.8fr]", children: [
          /* @__PURE__ */ jsxs("div", { className: "space-y-3 text-sm leading-6 text-slate-300", children: [
            /* @__PURE__ */ jsxs("p", { children: [
              /* @__PURE__ */ jsx("span", { className: "rounded bg-yellow-300/25 px-1 text-yellow-100", children: "Prediction:" }),
              " as distance doubles, light spreads over four times the area."
            ] }),
            /* @__PURE__ */ jsx("p", { children: "Use the sensor readings to compare ratios, then decide which graph best represents the relationship." }),
            /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-3 text-cyan-50", children: "Focus prompt: where would you place the independent variable?" })
          ] }),
          /* @__PURE__ */ jsxs("table", { className: "w-full overflow-hidden rounded-2xl text-left text-sm", children: [
            /* @__PURE__ */ jsx("thead", { className: "bg-white/10 text-slate-200", children: /* @__PURE__ */ jsx("tr", { children: ["Distance", "Trial A", "Trial B", "Avg"].map((h) => /* @__PURE__ */ jsx("th", { className: "px-3 py-2 font-sans", children: h }, h)) }) }),
            /* @__PURE__ */ jsx("tbody", { children: resourceRows.map((row) => /* @__PURE__ */ jsx("tr", { className: "border-t border-white/10", children: row.map((cell) => /* @__PURE__ */ jsx("td", { className: "px-3 py-2 text-slate-300", children: cell }, cell)) }, row[0])) })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2 text-xs text-slate-300", children: [
        /* @__PURE__ */ jsxs(Badge, { variant: "outline", className: "border-white/20 text-slate-200", children: [
          /* @__PURE__ */ jsx(Eye, { className: "mr-1 size-3" }),
          " 24 viewing"
        ] }),
        /* @__PURE__ */ jsxs(Badge, { variant: "outline", className: "border-white/20 text-slate-200", children: [
          /* @__PURE__ */ jsx(Highlighter, { className: "mr-1 size-3" }),
          " 6 highlights"
        ] }),
        /* @__PURE__ */ jsxs(Badge, { variant: "outline", className: "border-white/20 text-slate-200", children: [
          /* @__PURE__ */ jsx(MessageCircle, { className: "mr-1 size-3" }),
          " 41 chat notes"
        ] })
      ] })
    ] })
  ] });
}
function ChatPanel({ compact = false }) {
  return /* @__PURE__ */ jsxs(Card, { className: "flex min-h-0 flex-col border-white/10 bg-white/[0.09] text-slate-100 shadow-2xl backdrop-blur", children: [
    /* @__PURE__ */ jsx(CardHeader, { className: cn("pb-3", compact && "p-4 pb-2"), children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
      /* @__PURE__ */ jsx(CardTitle, { className: "font-sans text-lg text-white", children: "Class chat" }),
      /* @__PURE__ */ jsx(Badge, { className: "bg-violet-300 text-slate-950", children: "Natural Q&A" })
    ] }) }),
    /* @__PURE__ */ jsxs(CardContent, { className: cn("flex min-h-0 flex-1 flex-col gap-3", compact && "p-4 pt-0"), children: [
      /* @__PURE__ */ jsx(ScrollArea, { className: "min-h-[260px] flex-1 rounded-2xl border border-white/10 bg-slate-950/45 p-3", children: /* @__PURE__ */ jsx("div", { className: "space-y-3 pr-3", children: messages.map((message) => /* @__PURE__ */ jsx(ChatBubble, { message }, `${message.who}-${message.time}`)) }) }),
      /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-2 text-xs text-cyan-100", children: "Similar question detected: “Why does doubling distance quarter the light?”" }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-end gap-2", children: [
        /* @__PURE__ */ jsx(Textarea, { className: "min-h-12 flex-1 border-white/10 bg-slate-950/70 text-slate-100 placeholder:text-slate-500", placeholder: "Ask the class or respond naturally…", defaultValue: compact ? "" : "Could someone explain the ratio step?" }),
        /* @__PURE__ */ jsx(Button, { className: "bg-cyan-300 text-slate-950 hover:bg-cyan-200", children: /* @__PURE__ */ jsx(Send, { className: "size-4" }) })
      ] })
    ] })
  ] });
}
function ChatBubble({ message }) {
  return /* @__PURE__ */ jsxs("div", { className: cn("flex gap-2", message.mine && "justify-end"), children: [
    !message.mine && /* @__PURE__ */ jsx(Avatar, { className: "size-8 border border-white/10", children: /* @__PURE__ */ jsx(AvatarFallback, { className: "bg-slate-800 text-xs text-slate-200", children: message.who.slice(0, 2).toUpperCase() }) }),
    /* @__PURE__ */ jsxs("div", { className: cn("max-w-[82%] rounded-2xl px-3 py-2 text-sm", message.mine ? "bg-cyan-300 text-slate-950" : message.answer ? "bg-emerald-300/15 text-emerald-50 ring-1 ring-emerald-300/25" : "bg-white/10 text-slate-100"), children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-1 flex items-center gap-2 text-[11px] opacity-75", children: [
        /* @__PURE__ */ jsx("span", { className: "font-semibold", children: message.who }),
        message.role && /* @__PURE__ */ jsx("span", { children: message.role }),
        /* @__PURE__ */ jsx("span", { children: message.time })
      ] }),
      /* @__PURE__ */ jsx("p", { children: message.text })
    ] })
  ] });
}
function QuestionStack({ board = false }) {
  return /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.08] text-slate-100 shadow-2xl backdrop-blur", children: [
    /* @__PURE__ */ jsx(CardHeader, { className: "pb-3", children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2 font-sans text-lg text-white", children: [
      /* @__PURE__ */ jsx(Sparkles, { className: "size-5 text-yellow-200" }),
      " Surfaced questions"
    ] }) }),
    /* @__PURE__ */ jsx(CardContent, { className: cn("grid gap-3", board && "md:grid-cols-3"), children: questionClusters.map((q) => /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-white/10 bg-slate-950/50 p-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "mb-3 flex items-start justify-between gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "font-sans font-semibold text-white", children: q.title }),
          /* @__PURE__ */ jsxs("p", { className: "mt-1 text-xs text-slate-400", children: [
            "Cluster · ",
            q.tag
          ] })
        ] }),
        q.answered && /* @__PURE__ */ jsx(CheckCircle2, { className: "size-5 text-emerald-300" })
      ] }),
      /* @__PURE__ */ jsxs(Button, { variant: "outline", className: "w-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10", children: [
        /* @__PURE__ */ jsx(ChevronUp, { className: "size-4" }),
        " Upvote anonymously · ",
        q.votes
      ] })
    ] }, q.title)) })
  ] });
}
function CursorLayer() {
  return /* @__PURE__ */ jsxs("div", { className: "pointer-events-none absolute inset-0 z-10", children: [
    /* @__PURE__ */ jsxs("div", { className: "absolute left-[58%] top-[24%] rounded-full bg-fuchsia-400/20 p-8 ring-2 ring-fuchsia-300/50", children: [
      /* @__PURE__ */ jsx(MousePointer2, { className: "size-6 -translate-x-2 -translate-y-2 fill-fuchsia-300 text-fuchsia-100" }),
      /* @__PURE__ */ jsx("span", { className: "absolute left-10 top-9 rounded-full bg-fuchsia-300 px-2 py-0.5 text-xs font-bold text-slate-950", children: "7 votes" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "absolute left-[18%] top-[52%] rounded-full bg-cyan-400/20 p-6 ring-2 ring-cyan-300/40", children: [
      /* @__PURE__ */ jsx(Hand, { className: "size-5 text-cyan-100" }),
      /* @__PURE__ */ jsx("span", { className: "absolute left-8 top-7 rounded-full bg-cyan-300 px-2 py-0.5 text-xs font-bold text-slate-950", children: "you" })
    ] })
  ] });
}
function AnsweredReplay() {
  return /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.08] text-slate-100 shadow-2xl backdrop-blur", children: [
    /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs(CardTitle, { className: "flex items-center gap-2 font-sans text-lg text-white", children: [
      /* @__PURE__ */ jsx(PlayCircle, { className: "size-5 text-emerald-300" }),
      " Answered & replay"
    ] }) }),
    /* @__PURE__ */ jsxs(CardContent, { className: "space-y-3", children: [
      answered.map((item) => /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3", children: [
        /* @__PURE__ */ jsx("p", { className: "font-sans text-sm font-semibold text-emerald-50", children: item.q }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-sm text-slate-300", children: item.a })
      ] }, item.q)),
      /* @__PURE__ */ jsx(Separator, { className: "bg-white/10" }),
      /* @__PURE__ */ jsxs("div", { className: "space-y-2", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-xs text-slate-400", children: [
          /* @__PURE__ */ jsx("span", { children: "Session replay" }),
          /* @__PURE__ */ jsx("span", { children: "12:40 / 45:00" })
        ] }),
        /* @__PURE__ */ jsx(Progress, { value: 28, className: "bg-slate-800" })
      ] })
    ] })
  ] });
}
function PresenceRail() {
  return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] p-2 text-xs text-slate-300", children: [
    /* @__PURE__ */ jsx(Users, { className: "size-4 text-cyan-200" }),
    peers.map((peer) => /* @__PURE__ */ jsx(Avatar, { className: "size-7 border border-white/10", children: /* @__PURE__ */ jsx(AvatarFallback, { className: "bg-slate-800 text-[10px] text-slate-200", children: peer }) }, peer)),
    /* @__PURE__ */ jsx("span", { className: "ml-auto", children: "24 here" })
  ] });
}
function MobileChatFirst() {
  return /* @__PURE__ */ jsx(Shell, { variant: "01", children: /* @__PURE__ */ jsxs("main", { className: "grid flex-1 gap-3 lg:grid-cols-[0.85fr_1.15fr]", children: [
    /* @__PURE__ */ jsxs("div", { className: "order-2 space-y-3 lg:order-1", children: [
      /* @__PURE__ */ jsx(ResourceCard, { dense: true }),
      /* @__PURE__ */ jsx(QuestionStack, {})
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "order-1 flex min-h-[78vh] flex-col gap-3 lg:order-2", children: [
      /* @__PURE__ */ jsx(PresenceRail, {}),
      /* @__PURE__ */ jsx(ChatPanel, {})
    ] })
  ] }) });
}
function ResourceFirst() {
  return /* @__PURE__ */ jsx(Shell, { variant: "02", children: /* @__PURE__ */ jsxs("main", { className: "grid flex-1 gap-4 lg:grid-cols-[1fr_380px]", children: [
    /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx(ResourceCard, { withCursors: true }),
      /* @__PURE__ */ jsx(PresenceRail, {})
    ] }),
    /* @__PURE__ */ jsxs("aside", { className: "grid gap-3", children: [
      /* @__PURE__ */ jsx(ChatPanel, { compact: true }),
      /* @__PURE__ */ jsx(QuestionStack, {})
    ] })
  ] }) });
}
function QuestionBoard() {
  return /* @__PURE__ */ jsx(Shell, { variant: "03", children: /* @__PURE__ */ jsxs("main", { className: "grid flex-1 gap-4", children: [
    /* @__PURE__ */ jsx(QuestionStack, { board: true }),
    /* @__PURE__ */ jsxs("div", { className: "grid gap-4 lg:grid-cols-[0.9fr_1.1fr]", children: [
      /* @__PURE__ */ jsx(ChatPanel, { compact: true }),
      /* @__PURE__ */ jsx(ResourceCard, { dense: true })
    ] })
  ] }) });
}
function CursorVoteActive() {
  return /* @__PURE__ */ jsx(Shell, { variant: "04", children: /* @__PURE__ */ jsxs("main", { className: "grid flex-1 gap-4 lg:grid-cols-[1.4fr_0.8fr]", children: [
    /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-3xl border border-fuchsia-300/30 bg-fuchsia-300/15 p-3 text-sm text-fuchsia-50", children: [
        /* @__PURE__ */ jsx(MousePointer2, { className: "mr-2 inline size-4" }),
        " Cursor-voting is active: tap the confusing spot on your local resource view."
      ] }),
      /* @__PURE__ */ jsx(ResourceCard, { withCursors: true })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx(Card, { className: "border-white/10 bg-white/[0.08] text-slate-100", children: /* @__PURE__ */ jsxs(CardContent, { className: "space-y-3 p-4", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx("span", { className: "font-sans font-semibold", children: "Attention markers" }),
          /* @__PURE__ */ jsx(Badge, { className: "bg-fuchsia-300 text-slate-950", children: "Live" })
        ] }),
        /* @__PURE__ */ jsx(Progress, { value: 72 }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-300", children: "Most students are pointing at the highlighted prediction sentence." })
      ] }) }),
      /* @__PURE__ */ jsx(ChatPanel, { compact: true }),
      /* @__PURE__ */ jsx(QuestionStack, {})
    ] })
  ] }) });
}
function AnsweredAware() {
  return /* @__PURE__ */ jsx(Shell, { variant: "05", children: /* @__PURE__ */ jsxs("main", { className: "grid flex-1 gap-4 lg:grid-cols-[360px_1fr_360px]", children: [
    /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx(AnsweredReplay, {}),
      /* @__PURE__ */ jsx(QuestionStack, {})
    ] }),
    /* @__PURE__ */ jsx(ResourceCard, { dense: true }),
    /* @__PURE__ */ jsxs("div", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-3xl border border-white/10 bg-white/[0.08] p-3 text-sm text-slate-300", children: [
        /* @__PURE__ */ jsx(Clock3, { className: "mr-2 inline size-4 text-emerald-300" }),
        " You joined from the magic link 4 minutes ago. Username locked to ",
        /* @__PURE__ */ jsx("span", { className: "text-white", children: "jordan" }),
        "."
      ] }),
      /* @__PURE__ */ jsx(ChatPanel, { compact: true })
    ] })
  ] }) });
}
function TabletSplitDesk() {
  return /* @__PURE__ */ jsx(Shell, { variant: "06", children: /* @__PURE__ */ jsxs("main", { className: "grid flex-1 gap-4 xl:grid-cols-[1.08fr_0.92fr]", children: [
    /* @__PURE__ */ jsxs("section", { className: "grid min-h-[78vh] grid-rows-[auto_1fr_auto] gap-3 rounded-[2rem] border border-white/10 bg-white/[0.07] p-3 shadow-2xl backdrop-blur", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-slate-950/55 px-4 py-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.24em] text-cyan-200", children: "Tablet split learning desk" }),
          /* @__PURE__ */ jsx("h2", { className: "font-sans text-xl font-bold text-white", children: "Handout and chat stay side-by-side" })
        ] }),
        /* @__PURE__ */ jsx(Badge, { className: "bg-emerald-300 text-slate-950", children: "Synced by Ms. Rivera" })
      ] }),
      /* @__PURE__ */ jsx(ResourceCard, { withCursors: true }),
      /* @__PURE__ */ jsx("div", { className: "grid gap-3 md:grid-cols-3", children: ["Magic-link joined · jordan", "Teacher controls resource", "Anonymous upvotes only"].map((item) => /* @__PURE__ */ jsx("div", { className: "rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300", children: item }, item)) })
    ] }),
    /* @__PURE__ */ jsxs("aside", { className: "grid min-h-[78vh] gap-3 lg:grid-rows-[auto_1fr_auto]", children: [
      /* @__PURE__ */ jsx(PresenceRail, {}),
      /* @__PURE__ */ jsx(ChatPanel, {}),
      /* @__PURE__ */ jsx(AnsweredReplay, {})
    ] })
  ] }) });
}
function PhoneResourceMode() {
  return /* @__PURE__ */ jsx(Shell, { variant: "07", children: /* @__PURE__ */ jsxs("main", { className: "mx-auto grid w-full max-w-[430px] flex-1 content-start gap-3 rounded-[2.4rem] border border-white/15 bg-slate-900 p-3 shadow-2xl sm:my-3", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between rounded-[1.8rem] bg-black/35 px-4 py-3", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "text-[10px] uppercase tracking-[0.24em] text-cyan-200", children: "Phone focus mode" }),
        /* @__PURE__ */ jsx("h2", { className: "font-sans text-lg font-bold text-white", children: "Slide 4 is active" })
      ] }),
      /* @__PURE__ */ jsx(Badge, { className: "bg-cyan-300 text-slate-950", children: "Live" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-4", children: [
      /* @__PURE__ */ jsx(CursorLayer, {}),
      /* @__PURE__ */ jsxs("div", { className: "mb-5 rounded-2xl bg-gradient-to-br from-cyan-300/20 to-violet-400/20 p-4", children: [
        /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.24em] text-cyan-100", children: "Teacher resource" }),
        /* @__PURE__ */ jsx("h3", { className: "mt-2 font-sans text-3xl font-black text-white", children: "Light fades fast as distance doubles." }),
        /* @__PURE__ */ jsx("p", { className: "mt-3 text-sm leading-6 text-slate-300", children: "Compare the average lux readings and choose the graph shape that fits." })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "space-y-2 text-sm", children: resourceRows.map((row) => /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-[70px_1fr] rounded-2xl border border-white/10 bg-white/5 px-3 py-2", children: [
        /* @__PURE__ */ jsx("span", { className: "text-cyan-100", children: row[0] }),
        /* @__PURE__ */ jsxs("span", { className: "text-slate-300", children: [
          "Avg ",
          row[3]
        ] })
      ] }, row[0])) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "rounded-3xl border border-white/10 bg-white/[0.08] p-3", children: /* @__PURE__ */ jsx(ChatBubble, { message: { who: "teacher", role: "Teacher", text: "Stay in the resource view. I will open cursor voting next.", time: "10:18", answer: true } }) }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-3 gap-2 text-center text-xs text-slate-300", children: [
      /* @__PURE__ */ jsx(Button, { variant: "outline", className: "border-white/15 bg-white/5 text-slate-100", children: "Chat" }),
      /* @__PURE__ */ jsx(Button, { className: "bg-cyan-300 text-slate-950", children: "Ask" }),
      /* @__PURE__ */ jsx(Button, { variant: "outline", className: "border-white/15 bg-white/5 text-slate-100", children: "Vote" })
    ] })
  ] }) });
}
function QuestionClusterFirst() {
  return /* @__PURE__ */ jsx(Shell, { variant: "08", children: /* @__PURE__ */ jsxs("main", { className: "grid flex-1 gap-4 xl:grid-cols-[420px_1fr]", children: [
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-3xl border border-yellow-300/25 bg-yellow-300/10 p-4 text-yellow-50", children: [
        /* @__PURE__ */ jsx(Sparkles, { className: "mr-2 inline size-5" }),
        " Questions are grouped automatically; your upvote is anonymous."
      ] }),
      /* @__PURE__ */ jsx(QuestionStack, {}),
      /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.08] text-slate-100", children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "font-sans text-lg text-white", children: "Top cluster detail" }) }),
        /* @__PURE__ */ jsxs(CardContent, { className: "space-y-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "rounded-2xl bg-slate-950/55 p-4", children: [
            /* @__PURE__ */ jsx("p", { className: "font-sans text-xl font-bold text-white", children: "Why inverse-square instead of linear?" }),
            /* @__PURE__ */ jsx("p", { className: "mt-2 text-sm text-slate-300", children: "Merged from 14 natural chat messages, including “why is 20 cm not half as bright?”" })
          ] }),
          /* @__PURE__ */ jsxs(Button, { className: "w-full bg-yellow-300 text-slate-950 hover:bg-yellow-200", children: [
            /* @__PURE__ */ jsx(ChevronUp, { className: "size-4" }),
            " Add my anonymous upvote"
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("section", { className: "grid gap-3 lg:grid-rows-[1fr_auto]", children: [
      /* @__PURE__ */ jsxs("div", { className: "grid gap-3 lg:grid-cols-[1fr_360px]", children: [
        /* @__PURE__ */ jsx(ResourceCard, { dense: true }),
        /* @__PURE__ */ jsx(ChatPanel, { compact: true })
      ] }),
      /* @__PURE__ */ jsx(AnsweredReplay, {})
    ] })
  ] }) });
}
function CursorVotePromptActive() {
  return /* @__PURE__ */ jsx(Shell, { variant: "09", children: /* @__PURE__ */ jsxs("main", { className: "grid flex-1 gap-4 lg:grid-cols-[1fr_390px]", children: [
    /* @__PURE__ */ jsxs("section", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx("div", { className: "rounded-[2rem] border border-fuchsia-300/35 bg-fuchsia-300/15 p-5 text-fuchsia-50 shadow-2xl", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxs("div", { children: [
          /* @__PURE__ */ jsx("p", { className: "text-xs uppercase tracking-[0.28em]", children: "Cursor vote active · 42s left" }),
          /* @__PURE__ */ jsx("h2", { className: "mt-1 font-sans text-2xl font-black text-white", children: "Tap the exact spot that is confusing." })
        ] }),
        /* @__PURE__ */ jsx(MousePointer2, { className: "size-10" })
      ] }) }),
      /* @__PURE__ */ jsx(ResourceCard, { withCursors: true })
    ] }),
    /* @__PURE__ */ jsxs("aside", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs(Card, { className: "border-fuchsia-300/25 bg-fuchsia-300/10 text-slate-100", children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "font-sans text-lg text-white", children: "Vote heat" }) }),
        /* @__PURE__ */ jsxs(CardContent, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("div", { className: "mb-1 flex justify-between text-sm", children: [
              /* @__PURE__ */ jsx("span", { children: "Prediction sentence" }),
              /* @__PURE__ */ jsx("span", { children: "18" })
            ] }),
            /* @__PURE__ */ jsx(Progress, { value: 82 })
          ] }),
          /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsxs("div", { className: "mb-1 flex justify-between text-sm", children: [
              /* @__PURE__ */ jsx("span", { children: "Data table averages" }),
              /* @__PURE__ */ jsx("span", { children: "9" })
            ] }),
            /* @__PURE__ */ jsx(Progress, { value: 41 })
          ] }),
          /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-300", children: "Your marker is private; Ms. Rivera sees the class cluster only." })
        ] })
      ] }),
      /* @__PURE__ */ jsx(ChatPanel, { compact: true }),
      /* @__PURE__ */ jsx(QuestionStack, {})
    ] })
  ] }) });
}
function ReplayAnsweredCatchUp() {
  return /* @__PURE__ */ jsx(Shell, { variant: "10", children: /* @__PURE__ */ jsxs("main", { className: "grid flex-1 gap-4 xl:grid-cols-[360px_1fr_390px]", children: [
    /* @__PURE__ */ jsxs("aside", { className: "space-y-3", children: [
      /* @__PURE__ */ jsxs("div", { className: "rounded-3xl border border-emerald-300/25 bg-emerald-300/10 p-4 text-sm text-emerald-50", children: [
        /* @__PURE__ */ jsx(PlayCircle, { className: "mr-2 inline size-5" }),
        " Catch-up mode: you joined 7 minutes late from the magic link as ",
        /* @__PURE__ */ jsx("strong", { children: "jordan" }),
        "."
      ] }),
      /* @__PURE__ */ jsx(AnsweredReplay, {})
    ] }),
    /* @__PURE__ */ jsx("section", { className: "space-y-3", children: /* @__PURE__ */ jsxs(Card, { className: "overflow-hidden border-white/10 bg-white/[0.08] text-slate-100 shadow-2xl", children: [
      /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx(CardTitle, { className: "font-sans text-lg text-white", children: "Replay-aware resource" }),
        /* @__PURE__ */ jsx(Badge, { className: "bg-amber-300 text-slate-950", children: "Replaying · 10:14" })
      ] }) }),
      /* @__PURE__ */ jsxs(CardContent, { children: [
        /* @__PURE__ */ jsx(ResourceCard, { dense: true }),
        /* @__PURE__ */ jsxs("div", { className: "mt-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between text-xs text-slate-400", children: [
            /* @__PURE__ */ jsx("span", { children: "Replay catches up to live in 2:10" }),
            /* @__PURE__ */ jsx("span", { children: "33%" })
          ] }),
          /* @__PURE__ */ jsx(Progress, { value: 33, className: "mt-2" })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs("aside", { className: "space-y-3", children: [
      /* @__PURE__ */ jsx(ChatPanel, { compact: true }),
      /* @__PURE__ */ jsxs(Card, { className: "border-white/10 bg-white/[0.08] text-slate-100", children: [
        /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "font-sans text-lg text-white", children: "Preserved answers" }) }),
        /* @__PURE__ */ jsx(CardContent, { className: "space-y-2", children: answered.map((item) => /* @__PURE__ */ jsxs("div", { className: "rounded-2xl bg-slate-950/55 p-3 text-sm", children: [
          /* @__PURE__ */ jsx("p", { className: "font-semibold text-white", children: item.q }),
          /* @__PURE__ */ jsx("p", { className: "mt-1 text-slate-300", children: item.a })
        ] }, item.q)) })
      ] })
    ] })
  ] }) });
}
function StudentChatMockup({ variant }) {
  if (variant === "01") return /* @__PURE__ */ jsx(MobileChatFirst, {});
  if (variant === "02") return /* @__PURE__ */ jsx(ResourceFirst, {});
  if (variant === "03") return /* @__PURE__ */ jsx(QuestionBoard, {});
  if (variant === "04") return /* @__PURE__ */ jsx(CursorVoteActive, {});
  if (variant === "05") return /* @__PURE__ */ jsx(AnsweredAware, {});
  if (variant === "06") return /* @__PURE__ */ jsx(TabletSplitDesk, {});
  if (variant === "07") return /* @__PURE__ */ jsx(PhoneResourceMode, {});
  if (variant === "08") return /* @__PURE__ */ jsx(QuestionClusterFirst, {});
  if (variant === "09") return /* @__PURE__ */ jsx(CursorVotePromptActive, {});
  return /* @__PURE__ */ jsx(ReplayAnsweredCatchUp, {});
}

export { StudentChatMockup as S };
