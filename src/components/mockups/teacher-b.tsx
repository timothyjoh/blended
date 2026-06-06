import { Activity, CheckCircle2, ChevronRight, Circle, Command, Eye, Flag, Hand, Maximize2, MessageSquare, MousePointer2, Pause, Play, Radio, ShieldCheck, Sparkles, Users, Vote, Wand2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const resources = [
  { title: 'Opening poll: ecosystems', kind: 'Poll', status: 'Done', time: '08:58' },
  { title: 'Slide 12 — Energy transfer', kind: 'Slide', status: 'Live', time: '09:04' },
  { title: 'PhET food-web simulation', kind: 'Web', status: 'Queued', time: '09:11' },
  { title: 'Exit ticket: claim/evidence', kind: 'Form', status: 'Queued', time: '09:24' },
]

const clusters = [
  { topic: 'Why does only 10% of energy move up?', count: 14, priority: 96, tone: 'confused' },
  { topic: 'Can decomposers be on every trophic level?', count: 9, priority: 84, tone: 'curious' },
  { topic: 'Difference between biomass and energy pyramid', count: 7, priority: 78, tone: 'needs example' },
]

const moderation = [
  { name: 'Maya', text: 'I think the fox gets all the rabbit energy?', action: 'pin to discuss' },
  { name: 'Jon', text: 'Off-topic meme in chat thread', action: 'hide' },
  { name: 'Ari', text: 'Can you zoom in on the arrows?', action: 'answer live' },
]

const events = [
  { t: '09:04:12', icon: Play, label: 'Teacher advanced to Slide 12', color: 'text-emerald-400' },
  { t: '09:05:03', icon: Users, label: '31 participants synced to active resource', color: 'text-cyan-400' },
  { t: '09:06:48', icon: MessageSquare, label: 'AI merged 8 similar questions', color: 'text-violet-400' },
  { t: '09:07:20', icon: Vote, label: 'Cursor-voting heatmap opened for 90 seconds', color: 'text-amber-400' },
  { t: '09:08:55', icon: ShieldCheck, label: '2 chat items triaged by moderation rules', color: 'text-rose-400' },
]

const students = ['AL', 'MK', 'JS', 'PN', 'RB', 'ZT', 'LO', 'CN']

function TopBar({ title, subtitle, dark = true }: { title: string; subtitle: string; dark?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 ${dark ? 'text-white' : 'text-slate-950'}`}>
      <div>
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] opacity-65">
          <Radio className="h-4 w-4" /> Live session · BIO-204
        </div>
        <h1 className="m-0 py-1 font-sans text-3xl font-black tracking-tight md:text-5xl">{title}</h1>
        <p className="font-sans text-sm opacity-70">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 font-sans text-sm backdrop-blur">
        <Users className="h-4 w-4" /> 31 live · 4 catching up
      </div>
    </div>
  )
}

function ResourceQueue({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-3">
      {resources.map((item, index) => (
        <div key={item.title} className={`rounded-2xl border p-3 font-sans ${item.status === 'Live' ? 'border-emerald-400 bg-emerald-400/15' : 'border-white/10 bg-white/5'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-xs font-bold">{index + 1}</div>
              <div>
                <div className="text-sm font-bold">{item.title}</div>
                {!compact && <div className="text-xs opacity-60">{item.kind} · {item.time}</div>}
              </div>
            </div>
            <Badge className="border-white/10 bg-white/10 text-current">{item.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

function QuestionClusters() {
  return (
    <div className="space-y-3">
      {clusters.map((cluster) => (
        <div key={cluster.topic} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 font-sans">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold">{cluster.topic}</div>
              <div className="mt-1 text-xs opacity-60">{cluster.count} students · {cluster.tone}</div>
            </div>
            <Badge className="bg-violet-500 text-white">AI {cluster.priority}</Badge>
          </div>
          <Progress value={cluster.priority} className="mt-3 h-2 bg-white/10 [&>div]:bg-violet-400" />
        </div>
      ))}
    </div>
  )
}

function ActiveSlide({ stage = 'dark' }: { stage?: 'dark' | 'light' | 'neon' }) {
  const shell = stage === 'light' ? 'bg-white text-slate-950' : stage === 'neon' ? 'bg-slate-950 text-white' : 'bg-[#101827] text-white'
  return (
    <div className={`relative overflow-hidden rounded-[2rem] border ${stage === 'light' ? 'border-slate-200' : 'border-white/10'} ${shell} shadow-2xl`}>
      <div className="absolute right-8 top-8 rounded-full bg-emerald-400 px-3 py-1 font-sans text-xs font-black text-emerald-950">LIVE ON STUDENT DEVICES</div>
      <div className="grid min-h-[460px] place-items-center p-10">
        <div className="max-w-3xl text-center font-sans">
          <div className="mx-auto mb-8 grid h-28 w-28 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-cyan-400 text-slate-950 shadow-xl">
            <Sparkles className="h-12 w-12" />
          </div>
          <div className="text-sm uppercase tracking-[0.4em] opacity-50">Slide 12 / Energy flow</div>
          <h2 className="mt-4 text-5xl font-black leading-tight md:text-7xl">Only a small fraction of energy moves upward.</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg opacity-70">Students are highlighting where the model stops matching their intuition. Cursor votes are collecting on the transfer arrows.</p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 p-4 font-sans text-sm">
        <span>https://blended.app/session/bio-204/resources/energy-pyramid</span>
        <div className="flex gap-2"><Button size="sm" variant="secondary"><Pause className="h-4 w-4" /> Pause sync</Button><Button size="sm"><ChevronRight className="h-4 w-4" /> Next</Button></div>
      </div>
    </div>
  )
}

function ModerationList() {
  return (
    <div className="space-y-3">
      {moderation.map((item) => (
        <div key={item.text} className="rounded-2xl border border-slate-200 bg-white p-3 font-sans shadow-sm">
          <div className="flex items-center justify-between"><strong>{item.name}</strong><Badge variant="outline">{item.action}</Badge></div>
          <p className="mt-2 text-sm text-slate-600">{item.text}</p>
        </div>
      ))}
    </div>
  )
}

export function TeacherMockup06() {
  return (
    <main className="min-h-screen bg-slate-950 p-5 font-sans text-white md:p-8">
      <TopBar title="Teacher command center" subtitle="Dense presenter control surface for keeping the session moving while AI surfaces teachable moments." />
      <div className="mt-6 grid gap-5 xl:grid-cols-[280px_1fr_360px]">
        <Card className="border-white/10 bg-white/[0.06] text-white"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Command /> Run of show</CardTitle></CardHeader><CardContent><ResourceQueue /></CardContent></Card>
        <ActiveSlide />
        <div className="space-y-5"><Card className="border-white/10 bg-white/[0.06] text-white"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Wand2 /> AI-ranked questions</CardTitle></CardHeader><CardContent><QuestionClusters /></CardContent></Card><Card className="border-white/10 bg-white/[0.06] text-white"><CardContent className="grid grid-cols-3 gap-3 p-4 text-center"><div><div className="text-3xl font-black">87%</div><div className="text-xs opacity-60">focused</div></div><div><div className="text-3xl font-black">42</div><div className="text-xs opacity-60">votes</div></div><div><div className="text-3xl font-black">3</div><div className="text-xs opacity-60">flags</div></div></CardContent></Card></div>
      </div>
    </main>
  )
}

export function TeacherMockup07() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe,transparent_35%),#f8fafc] p-6 font-sans text-slate-950 md:p-10">
      <TopBar dark={false} title="Slide-first stage" subtitle="Minimal chrome around the active resource, with contextual queues tucked into glassy side rails." />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_310px]">
        <div><ActiveSlide stage="light" /><div className="mt-4 flex flex-wrap items-center gap-3 rounded-3xl bg-slate-950 p-4 text-white"><Button><MousePointer2 /> Start cursor vote</Button><Button variant="secondary"><Maximize2 /> Present full screen</Button><Badge className="ml-auto bg-cyan-500">Heatmap: arrows cluster</Badge></div></div>
        <aside className="space-y-4"><Card className="rounded-3xl border-slate-200 bg-white/80 backdrop-blur"><CardHeader><CardTitle className="text-lg">Up next</CardTitle></CardHeader><CardContent className="text-slate-950"><ResourceQueue compact /></CardContent></Card><Card className="rounded-3xl border-slate-200 bg-white/80"><CardHeader><CardTitle className="text-lg">Participant pulse</CardTitle></CardHeader><CardContent><div className="grid grid-cols-4 gap-2">{students.map((s) => <div key={s} className="grid h-12 place-items-center rounded-2xl bg-slate-100 text-xs font-black">{s}</div>)}</div></CardContent></Card></aside>
      </div>
    </main>
  )
}

export function TeacherMockup08() {
  return (
    <main className="min-h-screen bg-zinc-950 p-6 font-sans text-white md:p-10">
      <TopBar title="Replay and event timeline" subtitle="A forensic presenter view for reviewing the event-sourced session stream and jumping back to teachable moments." />
      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="border-white/10 bg-white/[0.06] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Activity /> Session event log</CardTitle></CardHeader><CardContent className="space-y-5">{events.map((event) => { const Icon = event.icon; return <div key={event.t} className="grid grid-cols-[80px_32px_1fr] items-start gap-3"><div className="text-xs opacity-50">{event.t}</div><div className={`grid h-8 w-8 place-items-center rounded-full bg-white/10 ${event.color}`}><Icon className="h-4 w-4" /></div><div className="text-sm">{event.label}</div></div> })}</CardContent></Card>
        <section className="space-y-5"><div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-zinc-900 to-slate-900 p-6"><div className="mb-4 flex items-center justify-between"><Badge className="bg-amber-400 text-amber-950">Replay cursor · 09:07:20</Badge><Button variant="secondary"><Play /> Resume live</Button></div><ActiveSlide stage="neon" /></div><Card className="border-white/10 bg-white/[0.06] text-white"><CardContent className="grid gap-4 p-5 md:grid-cols-4">{['Active resource set', 'Question cluster created', 'Moderation action', 'Student sync ack'].map((m, i) => <div key={m} className="rounded-2xl bg-white/5 p-4"><div className="text-2xl font-black">{[18, 11, 5, 124][i]}</div><div className="text-xs opacity-60">{m}</div></div>)}</CardContent></Card></section>
      </div>
    </main>
  )
}

export function TeacherMockup09() {
  return (
    <main className="min-h-screen bg-[#0f172a] p-6 font-sans text-white md:p-10">
      <TopBar title="Question cockpit" subtitle="Optimized for seminar-style teaching where the presenter navigates from AI clusters into moderation and answers." />
      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="space-y-5"><Tabs defaultValue="clusters" className="w-full"><TabsList className="bg-white/10 text-white"><TabsTrigger value="clusters">AI clusters</TabsTrigger><TabsTrigger value="moderation">Moderation</TabsTrigger><TabsTrigger value="draft">Answer draft</TabsTrigger></TabsList><TabsContent value="clusters"><QuestionClusters /></TabsContent><TabsContent value="moderation"><ModerationList /></TabsContent><TabsContent value="draft"><Card className="bg-white text-slate-950"><CardHeader><CardTitle>Suggested live explanation</CardTitle></CardHeader><CardContent className="text-sm leading-7 text-slate-600">Use the money analogy: each transfer spends most energy on movement, heat, and life processes. Ask students to predict what happens if producers decrease by half.</CardContent></Card></TabsContent></Tabs><div className="grid gap-4 md:grid-cols-3"><Button className="h-20 bg-emerald-500 text-base text-emerald-950 hover:bg-emerald-400"><CheckCircle2 /> Answer live</Button><Button className="h-20 bg-amber-400 text-base text-amber-950 hover:bg-amber-300"><Flag /> Save for later</Button><Button className="h-20 bg-rose-500 text-base text-white hover:bg-rose-400"><XCircle /> Hide thread</Button></div></section>
        <aside className="space-y-5"><ActiveSlide /><Card className="border-white/10 bg-white/[0.06] text-white"><CardHeader><CardTitle>Queue stays teacher-controlled</CardTitle></CardHeader><CardContent><ResourceQueue compact /></CardContent></Card></aside>
      </div>
    </main>
  )
}

export function TeacherMockup10() {
  return (
    <main className="min-h-screen bg-black font-sans text-white">
      <div className="grid min-h-screen grid-rows-[1fr_auto]">
        <section className="relative grid place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_30%,rgba(34,211,238,.24),transparent_35%),linear-gradient(135deg,#020617,#111827)] p-8">
          <div className="absolute left-6 top-6 rounded-full bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.28em] backdrop-blur">BIO-204 · Session live · 31</div>
          <div className="absolute right-6 top-6 flex gap-2"><Button size="sm" variant="secondary"><Eye /> Student view</Button><Button size="sm"><Hand /> Lock activity</Button></div>
          <div className="max-w-5xl text-center"><div className="text-sm uppercase tracking-[0.5em] text-cyan-200/60">Minimal presentation mode</div><h1 className="mt-6 text-6xl font-black tracking-tight md:text-8xl">Energy transfer is inefficient.</h1><p className="mx-auto mt-8 max-w-3xl text-xl leading-8 text-white/65">Tap space to advance. Hidden presenter rail still tracks queue, questions, votes, and replay events without distracting from the active resource.</p></div>
          <div className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-full border border-white/10 bg-black/40 px-5 py-3 backdrop-blur"><Circle className="h-3 w-3 fill-emerald-400 text-emerald-400" /> Slide 12 active <Separator orientation="vertical" className="h-5 bg-white/20" /> 42 cursor votes <Separator orientation="vertical" className="h-5 bg-white/20" /> 3 urgent questions</div>
        </section>
        <section className="grid gap-px bg-white/10 md:grid-cols-4"><div className="bg-zinc-950 p-4"><div className="text-xs text-white/40">Next resource</div><div className="font-bold">PhET food-web simulation</div></div><div className="bg-zinc-950 p-4"><div className="text-xs text-white/40">AI top cluster</div><div className="font-bold">10% energy transfer confusion</div></div><div className="bg-zinc-950 p-4"><div className="text-xs text-white/40">Moderation</div><div className="font-bold text-amber-300">2 need review</div></div><div className="bg-zinc-950 p-4"><div className="text-xs text-white/40">Replay marker</div><div className="font-bold">09:07 cursor vote opened</div></div></section>
      </div>
    </main>
  )
}
