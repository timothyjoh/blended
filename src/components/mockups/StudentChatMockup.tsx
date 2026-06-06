import {
  BookOpen,
  CheckCircle2,
  ChevronUp,
  Clock3,
  Eye,
  Hand,
  Highlighter,
  MessageCircle,
  MousePointer2,
  PlayCircle,
  Send,
  Sparkles,
  Users,
} from 'lucide-react'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type Variant = '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10'

type ChatMessage = {
  who: string
  role?: string
  text: string
  time: string
  mine?: boolean
  answer?: boolean
}

const messages: ChatMessage[] = [
  { who: 'maria', text: 'Is the independent variable the lamp distance or the brightness reading?', time: '10:12' },
  { who: 'teacher', role: 'Teacher', text: 'Distance is what we change. Brightness is what we measure.', time: '10:13', answer: true },
  { who: 'eli', text: 'So the graph should curve down, not be a straight line?', time: '10:14' },
  { who: 'jordan', text: 'I got stuck on why doubling distance quarters the light.', time: '10:15', mine: true },
]

const questionClusters = [
  { title: 'Which axis gets distance?', votes: 18, tag: 'graph setup', answered: true },
  { title: 'Why inverse-square instead of linear?', votes: 14, tag: 'concept' },
  { title: 'Do we average all three trials first?', votes: 9, tag: 'data table' },
]

const answered = [
  { q: 'What counts as the control variable?', a: 'Keep the bulb, room lighting, and sensor angle constant.' },
  { q: 'Can I zoom the resource?', a: 'Yes — your zoom and scroll are local and do not affect classmates.' },
]

const resourceRows = [
  ['10 cm', '820 lux', '801 lux', '811 lux'],
  ['20 cm', '215 lux', '204 lux', '210 lux'],
  ['40 cm', '58 lux', '54 lux', '56 lux'],
]

const peers = ['AL', 'MJ', 'ET', 'SK', 'NP']

function Shell({ children, variant }: { children: React.ReactNode; variant: Variant }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,.28),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(168,85,247,.24),transparent_32%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-3 py-3 sm:px-5 lg:px-6">
        <header className="mb-3 flex items-center justify-between rounded-3xl border border-white/10 bg-white/10 px-4 py-3 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20">
              <BookOpen className="size-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Blended live session</p>
              <h1 className="m-0 p-0 font-sans text-base font-semibold leading-tight text-white sm:text-lg">Physics Lab: Light Intensity</h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Badge className="border-emerald-300/30 bg-emerald-300/15 text-emerald-100">Signed in as jordan</Badge>
            <Badge variant="outline" className="border-white/20 text-slate-200">Mockup {variant}</Badge>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}

function ResourceCard({ dense = false, withCursors = false }: { dense?: boolean; withCursors?: boolean }) {
  return (
    <Card className="relative overflow-hidden border-white/10 bg-white/[0.08] text-slate-100 shadow-2xl backdrop-blur">
      <CardHeader className={cn('pb-3', dense && 'p-4 pb-2')}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="font-sans text-lg text-white">Teacher-selected resource</CardTitle>
            <p className="mt-1 text-sm text-slate-300">Slide 4 · Inverse-square lab handout</p>
          </div>
          <Badge className="bg-cyan-300 text-slate-950">Active now</Badge>
        </div>
      </CardHeader>
      <CardContent className={cn('space-y-4', dense && 'p-4 pt-0')}>
        <div className="relative rounded-3xl border border-white/10 bg-slate-900/80 p-4">
          {withCursors && <CursorLayer />}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">Experiment notes</p>
              <h2 className="font-sans text-2xl font-bold text-white">How light fades with distance</h2>
            </div>
            <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">Local scroll: 68%</div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
            <div className="space-y-3 text-sm leading-6 text-slate-300">
              <p><span className="rounded bg-yellow-300/25 px-1 text-yellow-100">Prediction:</span> as distance doubles, light spreads over four times the area.</p>
              <p>Use the sensor readings to compare ratios, then decide which graph best represents the relationship.</p>
              <div className="rounded-2xl border border-cyan-300/25 bg-cyan-300/10 p-3 text-cyan-50">Focus prompt: where would you place the independent variable?</div>
            </div>
            <table className="w-full overflow-hidden rounded-2xl text-left text-sm">
              <thead className="bg-white/10 text-slate-200"><tr>{['Distance', 'Trial A', 'Trial B', 'Avg'].map((h) => <th key={h} className="px-3 py-2 font-sans">{h}</th>)}</tr></thead>
              <tbody>{resourceRows.map((row) => <tr key={row[0]} className="border-t border-white/10">{row.map((cell) => <td key={cell} className="px-3 py-2 text-slate-300">{cell}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <Badge variant="outline" className="border-white/20 text-slate-200"><Eye className="mr-1 size-3" /> 24 viewing</Badge>
          <Badge variant="outline" className="border-white/20 text-slate-200"><Highlighter className="mr-1 size-3" /> 6 highlights</Badge>
          <Badge variant="outline" className="border-white/20 text-slate-200"><MessageCircle className="mr-1 size-3" /> 41 chat notes</Badge>
        </div>
      </CardContent>
    </Card>
  )
}

function ChatPanel({ compact = false }: { compact?: boolean }) {
  return (
    <Card className="flex min-h-0 flex-col border-white/10 bg-white/[0.09] text-slate-100 shadow-2xl backdrop-blur">
      <CardHeader className={cn('pb-3', compact && 'p-4 pb-2')}>
        <div className="flex items-center justify-between">
          <CardTitle className="font-sans text-lg text-white">Class chat</CardTitle>
          <Badge className="bg-violet-300 text-slate-950">Natural Q&A</Badge>
        </div>
      </CardHeader>
      <CardContent className={cn('flex min-h-0 flex-1 flex-col gap-3', compact && 'p-4 pt-0')}>
        <ScrollArea className="min-h-[260px] flex-1 rounded-2xl border border-white/10 bg-slate-950/45 p-3">
          <div className="space-y-3 pr-3">
            {messages.map((message) => <ChatBubble key={`${message.who}-${message.time}`} message={message} />)}
          </div>
        </ScrollArea>
        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-2 text-xs text-cyan-100">Similar question detected: “Why does doubling distance quarter the light?”</div>
        <div className="flex items-end gap-2">
          <Textarea className="min-h-12 flex-1 border-white/10 bg-slate-950/70 text-slate-100 placeholder:text-slate-500" placeholder="Ask the class or respond naturally…" defaultValue={compact ? '' : 'Could someone explain the ratio step?'} />
          <Button className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"><Send className="size-4" /></Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  return (
    <div className={cn('flex gap-2', message.mine && 'justify-end')}>
      {!message.mine && <Avatar className="size-8 border border-white/10"><AvatarFallback className="bg-slate-800 text-xs text-slate-200">{message.who.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>}
      <div className={cn('max-w-[82%] rounded-2xl px-3 py-2 text-sm', message.mine ? 'bg-cyan-300 text-slate-950' : message.answer ? 'bg-emerald-300/15 text-emerald-50 ring-1 ring-emerald-300/25' : 'bg-white/10 text-slate-100')}>
        <div className="mb-1 flex items-center gap-2 text-[11px] opacity-75"><span className="font-semibold">{message.who}</span>{message.role && <span>{message.role}</span>}<span>{message.time}</span></div>
        <p>{message.text}</p>
      </div>
    </div>
  )
}

function QuestionStack({ board = false }: { board?: boolean }) {
  return (
    <Card className="border-white/10 bg-white/[0.08] text-slate-100 shadow-2xl backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-sans text-lg text-white"><Sparkles className="size-5 text-yellow-200" /> Surfaced questions</CardTitle>
      </CardHeader>
      <CardContent className={cn('grid gap-3', board && 'md:grid-cols-3')}>
        {questionClusters.map((q) => (
          <div key={q.title} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-sans font-semibold text-white">{q.title}</p>
                <p className="mt-1 text-xs text-slate-400">Cluster · {q.tag}</p>
              </div>
              {q.answered && <CheckCircle2 className="size-5 text-emerald-300" />}
            </div>
            <Button variant="outline" className="w-full border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"><ChevronUp className="size-4" /> Upvote anonymously · {q.votes}</Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function CursorLayer() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute left-[58%] top-[24%] rounded-full bg-fuchsia-400/20 p-8 ring-2 ring-fuchsia-300/50"><MousePointer2 className="size-6 -translate-x-2 -translate-y-2 fill-fuchsia-300 text-fuchsia-100" /><span className="absolute left-10 top-9 rounded-full bg-fuchsia-300 px-2 py-0.5 text-xs font-bold text-slate-950">7 votes</span></div>
      <div className="absolute left-[18%] top-[52%] rounded-full bg-cyan-400/20 p-6 ring-2 ring-cyan-300/40"><Hand className="size-5 text-cyan-100" /><span className="absolute left-8 top-7 rounded-full bg-cyan-300 px-2 py-0.5 text-xs font-bold text-slate-950">you</span></div>
    </div>
  )
}

function AnsweredReplay() {
  return (
    <Card className="border-white/10 bg-white/[0.08] text-slate-100 shadow-2xl backdrop-blur">
      <CardHeader><CardTitle className="flex items-center gap-2 font-sans text-lg text-white"><PlayCircle className="size-5 text-emerald-300" /> Answered & replay</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {answered.map((item) => (
          <div key={item.q} className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3">
            <p className="font-sans text-sm font-semibold text-emerald-50">{item.q}</p>
            <p className="mt-1 text-sm text-slate-300">{item.a}</p>
          </div>
        ))}
        <Separator className="bg-white/10" />
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400"><span>Session replay</span><span>12:40 / 45:00</span></div>
          <Progress value={28} className="bg-slate-800" />
        </div>
      </CardContent>
    </Card>
  )
}

function PresenceRail() {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] p-2 text-xs text-slate-300">
      <Users className="size-4 text-cyan-200" />
      {peers.map((peer) => <Avatar key={peer} className="size-7 border border-white/10"><AvatarFallback className="bg-slate-800 text-[10px] text-slate-200">{peer}</AvatarFallback></Avatar>)}
      <span className="ml-auto">24 here</span>
    </div>
  )
}

function MobileChatFirst() {
  return <Shell variant="01"><main className="grid flex-1 gap-3 lg:grid-cols-[0.85fr_1.15fr]"><div className="order-2 space-y-3 lg:order-1"><ResourceCard dense /><QuestionStack /></div><div className="order-1 flex min-h-[78vh] flex-col gap-3 lg:order-2"><PresenceRail /><ChatPanel /></div></main></Shell>
}

function ResourceFirst() {
  return <Shell variant="02"><main className="grid flex-1 gap-4 lg:grid-cols-[1fr_380px]"><div className="space-y-3"><ResourceCard withCursors /><PresenceRail /></div><aside className="grid gap-3"><ChatPanel compact /><QuestionStack /></aside></main></Shell>
}

function QuestionBoard() {
  return <Shell variant="03"><main className="grid flex-1 gap-4"><QuestionStack board /><div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]"><ChatPanel compact /><ResourceCard dense /></div></main></Shell>
}

function CursorVoteActive() {
  return <Shell variant="04"><main className="grid flex-1 gap-4 lg:grid-cols-[1.4fr_0.8fr]"><div className="space-y-3"><div className="rounded-3xl border border-fuchsia-300/30 bg-fuchsia-300/15 p-3 text-sm text-fuchsia-50"><MousePointer2 className="mr-2 inline size-4" /> Cursor-voting is active: tap the confusing spot on your local resource view.</div><ResourceCard withCursors /></div><div className="space-y-3"><Card className="border-white/10 bg-white/[0.08] text-slate-100"><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between"><span className="font-sans font-semibold">Attention markers</span><Badge className="bg-fuchsia-300 text-slate-950">Live</Badge></div><Progress value={72} /><p className="text-sm text-slate-300">Most students are pointing at the highlighted prediction sentence.</p></CardContent></Card><ChatPanel compact /><QuestionStack /></div></main></Shell>
}

function AnsweredAware() {
  return <Shell variant="05"><main className="grid flex-1 gap-4 lg:grid-cols-[360px_1fr_360px]"><div className="space-y-3"><AnsweredReplay /><QuestionStack /></div><ResourceCard dense /><div className="space-y-3"><div className="rounded-3xl border border-white/10 bg-white/[0.08] p-3 text-sm text-slate-300"><Clock3 className="mr-2 inline size-4 text-emerald-300" /> You joined from the magic link 4 minutes ago. Username locked to <span className="text-white">jordan</span>.</div><ChatPanel compact /></div></main></Shell>
}

function TabletSplitDesk() {
  return (
    <Shell variant="06">
      <main className="grid flex-1 gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="grid min-h-[78vh] grid-rows-[auto_1fr_auto] gap-3 rounded-[2rem] border border-white/10 bg-white/[0.07] p-3 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-3xl bg-slate-950/55 px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-200">Tablet split learning desk</p>
              <h2 className="font-sans text-xl font-bold text-white">Handout and chat stay side-by-side</h2>
            </div>
            <Badge className="bg-emerald-300 text-slate-950">Synced by Ms. Rivera</Badge>
          </div>
          <ResourceCard withCursors />
          <div className="grid gap-3 md:grid-cols-3">
            {['Magic-link joined · jordan', 'Teacher controls resource', 'Anonymous upvotes only'].map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300">{item}</div>)}
          </div>
        </section>
        <aside className="grid min-h-[78vh] gap-3 lg:grid-rows-[auto_1fr_auto]">
          <PresenceRail />
          <ChatPanel />
          <AnsweredReplay />
        </aside>
      </main>
    </Shell>
  )
}

function PhoneResourceMode() {
  return (
    <Shell variant="07">
      <main className="mx-auto grid w-full max-w-[430px] flex-1 content-start gap-3 rounded-[2.4rem] border border-white/15 bg-slate-900 p-3 shadow-2xl sm:my-3">
        <div className="flex items-center justify-between rounded-[1.8rem] bg-black/35 px-4 py-3">
          <div><p className="text-[10px] uppercase tracking-[0.24em] text-cyan-200">Phone focus mode</p><h2 className="font-sans text-lg font-bold text-white">Slide 4 is active</h2></div>
          <Badge className="bg-cyan-300 text-slate-950">Live</Badge>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-4">
          <CursorLayer />
          <div className="mb-5 rounded-2xl bg-gradient-to-br from-cyan-300/20 to-violet-400/20 p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-100">Teacher resource</p>
            <h3 className="mt-2 font-sans text-3xl font-black text-white">Light fades fast as distance doubles.</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">Compare the average lux readings and choose the graph shape that fits.</p>
          </div>
          <div className="space-y-2 text-sm">{resourceRows.map((row) => <div key={row[0]} className="grid grid-cols-[70px_1fr] rounded-2xl border border-white/10 bg-white/5 px-3 py-2"><span className="text-cyan-100">{row[0]}</span><span className="text-slate-300">Avg {row[3]}</span></div>)}</div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.08] p-3"><ChatBubble message={{ who: 'teacher', role: 'Teacher', text: 'Stay in the resource view. I will open cursor voting next.', time: '10:18', answer: true }} /></div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-slate-300"><Button variant="outline" className="border-white/15 bg-white/5 text-slate-100">Chat</Button><Button className="bg-cyan-300 text-slate-950">Ask</Button><Button variant="outline" className="border-white/15 bg-white/5 text-slate-100">Vote</Button></div>
      </main>
    </Shell>
  )
}

function QuestionClusterFirst() {
  return (
    <Shell variant="08">
      <main className="grid flex-1 gap-4 xl:grid-cols-[420px_1fr]">
        <section className="space-y-3">
          <div className="rounded-3xl border border-yellow-300/25 bg-yellow-300/10 p-4 text-yellow-50"><Sparkles className="mr-2 inline size-5" /> Questions are grouped automatically; your upvote is anonymous.</div>
          <QuestionStack />
          <Card className="border-white/10 bg-white/[0.08] text-slate-100"><CardHeader><CardTitle className="font-sans text-lg text-white">Top cluster detail</CardTitle></CardHeader><CardContent className="space-y-3"><div className="rounded-2xl bg-slate-950/55 p-4"><p className="font-sans text-xl font-bold text-white">Why inverse-square instead of linear?</p><p className="mt-2 text-sm text-slate-300">Merged from 14 natural chat messages, including “why is 20 cm not half as bright?”</p></div><Button className="w-full bg-yellow-300 text-slate-950 hover:bg-yellow-200"><ChevronUp className="size-4" /> Add my anonymous upvote</Button></CardContent></Card>
        </section>
        <section className="grid gap-3 lg:grid-rows-[1fr_auto]"><div className="grid gap-3 lg:grid-cols-[1fr_360px]"><ResourceCard dense /><ChatPanel compact /></div><AnsweredReplay /></section>
      </main>
    </Shell>
  )
}

function CursorVotePromptActive() {
  return (
    <Shell variant="09">
      <main className="grid flex-1 gap-4 lg:grid-cols-[1fr_390px]">
        <section className="space-y-3">
          <div className="rounded-[2rem] border border-fuchsia-300/35 bg-fuchsia-300/15 p-5 text-fuchsia-50 shadow-2xl"><div className="flex items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.28em]">Cursor vote active · 42s left</p><h2 className="mt-1 font-sans text-2xl font-black text-white">Tap the exact spot that is confusing.</h2></div><MousePointer2 className="size-10" /></div></div>
          <ResourceCard withCursors />
        </section>
        <aside className="space-y-3">
          <Card className="border-fuchsia-300/25 bg-fuchsia-300/10 text-slate-100"><CardHeader><CardTitle className="font-sans text-lg text-white">Vote heat</CardTitle></CardHeader><CardContent className="space-y-4"><div><div className="mb-1 flex justify-between text-sm"><span>Prediction sentence</span><span>18</span></div><Progress value={82} /></div><div><div className="mb-1 flex justify-between text-sm"><span>Data table averages</span><span>9</span></div><Progress value={41} /></div><p className="text-sm text-slate-300">Your marker is private; Ms. Rivera sees the class cluster only.</p></CardContent></Card>
          <ChatPanel compact />
          <QuestionStack />
        </aside>
      </main>
    </Shell>
  )
}

function ReplayAnsweredCatchUp() {
  return (
    <Shell variant="10">
      <main className="grid flex-1 gap-4 xl:grid-cols-[360px_1fr_390px]">
        <aside className="space-y-3"><div className="rounded-3xl border border-emerald-300/25 bg-emerald-300/10 p-4 text-sm text-emerald-50"><PlayCircle className="mr-2 inline size-5" /> Catch-up mode: you joined 7 minutes late from the magic link as <strong>jordan</strong>.</div><AnsweredReplay /></aside>
        <section className="space-y-3"><Card className="overflow-hidden border-white/10 bg-white/[0.08] text-slate-100 shadow-2xl"><CardHeader><div className="flex items-center justify-between"><CardTitle className="font-sans text-lg text-white">Replay-aware resource</CardTitle><Badge className="bg-amber-300 text-slate-950">Replaying · 10:14</Badge></div></CardHeader><CardContent><ResourceCard dense /><div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3"><div className="flex items-center justify-between text-xs text-slate-400"><span>Replay catches up to live in 2:10</span><span>33%</span></div><Progress value={33} className="mt-2" /></div></CardContent></Card></section>
        <aside className="space-y-3"><ChatPanel compact /><Card className="border-white/10 bg-white/[0.08] text-slate-100"><CardHeader><CardTitle className="font-sans text-lg text-white">Preserved answers</CardTitle></CardHeader><CardContent className="space-y-2">{answered.map((item) => <div key={item.q} className="rounded-2xl bg-slate-950/55 p-3 text-sm"><p className="font-semibold text-white">{item.q}</p><p className="mt-1 text-slate-300">{item.a}</p></div>)}</CardContent></Card></aside>
      </main>
    </Shell>
  )
}

export default function StudentChatMockup({ variant }: { variant: Variant }) {
  if (variant === '01') return <MobileChatFirst />
  if (variant === '02') return <ResourceFirst />
  if (variant === '03') return <QuestionBoard />
  if (variant === '04') return <CursorVoteActive />
  if (variant === '05') return <AnsweredAware />
  if (variant === '06') return <TabletSplitDesk />
  if (variant === '07') return <PhoneResourceMode />
  if (variant === '08') return <QuestionClusterFirst />
  if (variant === '09') return <CursorVotePromptActive />
  return <ReplayAnsweredCatchUp />
}
