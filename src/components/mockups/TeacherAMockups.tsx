import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Eye,
  Link2,
  ListChecks,
  MousePointer2,
  Play,
  Radio,
  Sparkles,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

const resources = [
  { title: 'Photosynthesis Review Deck', type: 'Google Slides', state: 'Live', time: '09:04' },
  { title: 'Leaf Anatomy Article', type: 'Web article', state: 'Next', time: '09:13' },
  { title: 'Chloroplast Checkpoint', type: 'Google Form', state: 'Queued', time: '09:22' },
]

const questions = [
  { text: 'Where does the oxygen actually come from?', count: 18, priority: 98, status: 'surface now' },
  { text: 'Is ATP made in the light reactions or Calvin cycle?', count: 11, priority: 86, status: 'clustered' },
  { text: 'What does carbon fixation mean in plain English?', count: 8, priority: 74, status: 'upvoted' },
]

const events = [
  ['09:00', 'SessionStarted', '34 students joined from magic link'],
  ['09:04', 'ResourceActivated', 'Photosynthesis Review Deck / slide 9'],
  ['09:06', 'QuestionClusterCreated', 'Oxygen-source confusion merged from 12 messages'],
  ['09:08', 'CursorVoteStarted', 'Hover where the diagram gets confusing'],
  ['09:10', 'TeacherMarkedAnswered', 'Oxygen-source cluster addressed live'],
]

function MiniResourceQueue({ light = false }: { light?: boolean }) {
  return (
    <div className="space-y-3">
      {resources.map((resource, index) => (
        <div
          key={resource.title}
          className={`rounded-2xl border p-3 font-sans ${
            resource.state === 'Live'
              ? light
                ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                : 'border-emerald-400/50 bg-emerald-400/15 text-white'
              : light
                ? 'border-slate-200 bg-white text-slate-700'
                : 'border-white/10 bg-white/[0.06] text-white/80'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-current/10 text-sm font-black">{index + 1}</div>
              <div>
                <div className="text-sm font-bold">{resource.title}</div>
                <div className="text-xs opacity-60">{resource.type} · {resource.time}</div>
              </div>
            </div>
            <Badge variant={resource.state === 'Live' ? 'default' : 'outline'}>{resource.state}</Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

function QuestionStack({ light = false }: { light?: boolean }) {
  return (
    <div className="space-y-3">
      {questions.map((question) => (
        <div key={question.text} className={`rounded-2xl border p-4 font-sans ${light ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/[0.06]'}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-black">{question.text}</div>
              <div className="mt-1 text-xs opacity-60">{question.count} students · {question.status}</div>
            </div>
            <Badge className="bg-violet-500 text-white">{question.priority}</Badge>
          </div>
          <Progress value={question.priority} className="mt-3 h-2" />
        </div>
      ))}
    </div>
  )
}

function ResourceStage({ heatmap = false, light = false }: { heatmap?: boolean; light?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-[2rem] border shadow-2xl ${light ? 'border-slate-200 bg-white text-slate-950' : 'border-white/10 bg-slate-950 text-white'}`}>
      <div className="absolute left-6 top-6 z-10 flex items-center gap-2 rounded-full bg-emerald-400 px-3 py-1 font-sans text-xs font-black text-emerald-950">
        <Radio className="h-3 w-3" /> synced to students
      </div>
      {heatmap && (
        <>
          <div className="absolute left-[57%] top-[42%] h-40 w-40 rounded-full bg-amber-300/35 blur-2xl" />
          <div className="absolute left-[62%] top-[48%] h-20 w-20 rounded-full border-4 border-amber-300/70 bg-amber-300/20" />
          <div className="absolute left-[49%] top-[35%] h-16 w-16 rounded-full bg-cyan-300/25" />
        </>
      )}
      <div className="grid min-h-[430px] place-items-center p-10">
        <div className="max-w-3xl text-center font-sans">
          <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-lime-300 to-emerald-500 text-emerald-950 shadow-xl">
            <Sparkles className="h-11 w-11" />
          </div>
          <div className="mt-8 text-xs uppercase tracking-[0.45em] opacity-50">Slide 09 · Chloroplast diagram</div>
          <h2 className="mt-4 text-5xl font-black tracking-tight md:text-7xl">Light reactions split water.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg opacity-65">The active resource is teacher-controlled. Student devices can scroll locally, but the session spine remains synchronized.</p>
        </div>
      </div>
      <div className={`flex items-center justify-between border-t p-4 font-sans text-sm ${light ? 'border-slate-200' : 'border-white/10'}`}>
        <span className="opacity-65">resource://photosynthesis-review/slide-09</span>
        <div className="flex gap-2"><Button size="sm" variant="secondary"><Eye /> Student view</Button><Button size="sm"><ArrowRight /> Activate next</Button></div>
      </div>
    </div>
  )
}

function TeacherHeader({ eyebrow, title, subtitle, light = false }: { eyebrow: string; title: string; subtitle: string; light?: boolean }) {
  return (
    <header className={`flex flex-col justify-between gap-4 md:flex-row md:items-end ${light ? 'text-slate-950' : 'text-white'}`}>
      <div>
        <div className="flex items-center gap-2 font-sans text-xs uppercase tracking-[0.32em] opacity-60"><Radio className="h-4 w-4" /> {eyebrow}</div>
        <h1 className="m-0 py-2 font-sans text-4xl font-black tracking-tight md:text-6xl">{title}</h1>
        <p className="max-w-2xl font-sans text-sm opacity-70">{subtitle}</p>
      </div>
      <div className={`rounded-full border px-4 py-2 font-sans text-sm ${light ? 'border-slate-200 bg-white' : 'border-white/10 bg-white/10'}`}><Users className="mr-2 inline h-4 w-4" />34 live · 6 questions clustered</div>
    </header>
  )
}

export function TeacherMockup01() {
  return (
    <main className="min-h-screen bg-[#07111f] p-6 font-sans text-white md:p-10">
      <TeacherHeader eyebrow="Teacher · live session" title="Resource command deck" subtitle="A balanced presenter cockpit: active web resource in the center, pacing controls on the left, AI question pressure on the right." />
      <div className="mt-8 grid gap-5 xl:grid-cols-[310px_1fr_360px]">
        <Card className="border-white/10 bg-white/[0.06] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><ListChecks /> Run of show</CardTitle></CardHeader><CardContent><MiniResourceQueue /></CardContent></Card>
        <ResourceStage />
        <Card className="border-white/10 bg-white/[0.06] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles /> AI triage</CardTitle></CardHeader><CardContent><QuestionStack /></CardContent></Card>
      </div>
    </main>
  )
}

export function TeacherMockup02() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ede9fe,transparent_35%),#f8fafc] p-6 font-sans text-slate-950 md:p-10">
      <TeacherHeader light eyebrow="Teacher · question mode" title="Question triage board" subtitle="For the moment when the teacher needs to stop reading chat and answer the themes that actually matter." />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_390px]">
        <section className="grid gap-4 md:grid-cols-3">
          {questions.map((q, index) => (
            <Card key={q.text} className="rounded-3xl border-slate-200 bg-white shadow-sm">
              <CardHeader><div className="flex items-center justify-between"><Badge>Priority {index + 1}</Badge><Badge variant="outline">{q.count} students</Badge></div><CardTitle className="mt-3 text-2xl leading-tight">{q.text}</CardTitle></CardHeader>
              <CardContent><Progress value={q.priority} /><div className="mt-4 flex gap-2"><Button size="sm"><CheckCircle2 /> Answered</Button><Button size="sm" variant="outline">Pin</Button></div></CardContent>
            </Card>
          ))}
        </section>
        <aside className="space-y-4"><Card className="rounded-3xl"><CardHeader><CardTitle>Raw stream classification</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div className="rounded-2xl bg-violet-50 p-3">Question · “Where did the oxygen come from?”</div><div className="rounded-2xl bg-emerald-50 p-3">Positive signal · “Ohhh the water part helps”</div><div className="rounded-2xl bg-rose-50 p-3">Hidden · off-topic spam</div></CardContent></Card><ResourceStage light /></aside>
      </div>
    </main>
  )
}

export function TeacherMockup03() {
  return (
    <main className="min-h-screen bg-black p-5 font-sans text-white md:p-8">
      <TeacherHeader eyebrow="Teacher · cursor voting active" title="Heatmap presenter" subtitle="A stage-first screen for running the prompt: “Hover over the part of the diagram that is confusing.”" />
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_330px]">
        <ResourceStage heatmap />
        <aside className="space-y-4"><Card className="border-amber-300/30 bg-amber-300/10 text-white"><CardHeader><CardTitle className="flex items-center gap-2"><MousePointer2 /> Cursor vote</CardTitle></CardHeader><CardContent><div className="text-5xl font-black">42</div><p className="mt-2 text-sm text-white/65">active markers, strongest cluster on water-splitting arrow.</p><Progress value={82} className="mt-4" /><Button className="mt-4 w-full bg-amber-300 text-amber-950 hover:bg-amber-200">End vote and save summary</Button></CardContent></Card><QuestionStack /></aside>
      </div>
    </main>
  )
}

export function TeacherMockup04() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 font-sans text-slate-950 md:p-10">
      <TeacherHeader light eyebrow="Teacher · prep/control" title="Resource queue rehearsal" subtitle="Pre-class and live pacing in one: verify embeds, reorder resources, and launch the next session event deliberately." />
      <div className="mt-8 grid gap-6 xl:grid-cols-[430px_1fr]">
        <Card className="rounded-[2rem] border-slate-200 bg-white"><CardHeader><CardTitle className="flex items-center gap-2"><Link2 /> Queued resources</CardTitle></CardHeader><CardContent><MiniResourceQueue light /><Button className="mt-4 w-full"><Play /> Start session from queue</Button></CardContent></Card>
        <section className="grid gap-5 md:grid-cols-2"><Card className="rounded-[2rem]"><CardHeader><CardTitle>Embed readiness</CardTitle></CardHeader><CardContent className="space-y-4">{resources.map((r) => <div key={r.title} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"><span>{r.title}</span><Badge className="bg-emerald-600">verified</Badge></div>)}</CardContent></Card><Card className="rounded-[2rem]"><CardHeader><CardTitle>Session launch checklist</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">{['Magic link ready', 'AI triage enabled', 'Cursor-vote overlay calibrated', 'Replay event stream recording'].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm"><CheckCircle2 className="h-5 w-5 text-emerald-600" />{item}</div>)}</CardContent></Card></section>
      </div>
    </main>
  )
}

export function TeacherMockup05() {
  return (
    <main className="min-h-screen bg-zinc-950 p-6 font-sans text-white md:p-10">
      <TeacherHeader eyebrow="Teacher · session ended" title="Replay artifact review" subtitle="The live class becomes a durable learning artifact: resource switches, clustered questions, answers, and cursor-vote summaries." />
      <div className="mt-8 grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card className="border-white/10 bg-white/[0.06] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><Activity /> Event stream</CardTitle></CardHeader><CardContent className="space-y-4">{events.map(([time, type, label]) => <div key={time} className="grid grid-cols-[56px_1fr] gap-3 rounded-2xl bg-white/[0.05] p-3"><div className="text-xs text-white/45">{time}</div><div><Badge variant="outline" className="border-white/20 text-white">{type}</Badge><p className="mt-2 text-sm text-white/70">{label}</p></div></div>)}</CardContent></Card>
        <section className="space-y-5"><div className="grid gap-4 md:grid-cols-4">{[['34','participants'],['18','question events'],['3','resources'],['1','heatmap saved']].map(([n,l]) => <Card key={l} className="border-white/10 bg-white/[0.06] text-white"><CardContent className="p-5"><div className="text-4xl font-black">{n}</div><div className="text-xs uppercase tracking-[0.2em] text-white/45">{l}</div></CardContent></Card>)}</div><Card className="border-white/10 bg-white/[0.06] text-white"><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 /> Answered clusters</CardTitle></CardHeader><CardContent><QuestionStack /></CardContent></Card></section>
      </div>
    </main>
  )
}
