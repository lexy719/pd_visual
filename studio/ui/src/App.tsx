import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Leaf } from './Card'
import { API, type FeedItem, type StudioEvent, type StudioSession } from './types'

const SUGGESTIONS = [
  'A recipe journal with seasonal filters',
  'A minimalist habit tracker for readers',
  'A landing page for a ceramics studio',
  'A dashboard for a community garden'
]
const BUILD_INTRO =
  "Sketching a first pass now. I'll set up the layout, wire the primary flow, and drop in earthy tones. Preview updates on the right as I go."

type QOption = { label: string; description: string }
type Question = { id: string; question: string; options: QOption[] }
type Phase = 'idle' | 'asking' | 'building'

function composeBrief(brief: string, questions: Question[], answers: Record<string, string>): string {
  const qa = questions.filter((q) => answers[q.id]).map((q) => `${q.question} → ${answers[q.id]}`).join('; ')
  return qa ? `${brief}\n\nClarifications: ${qa}. Use these as creative constraints; you still decide the sections and layout — the structure is not a fixed template.` : brief
}

export function App() {
  const [sessions, setSessions] = useState<StudioSession[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [liveStatus, setLiveStatus] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewNonce, setPreviewNonce] = useState(0)
  const [tab, setTab] = useState<'preview' | 'code' | 'design'>('preview')
  const [lastArt, setLastArt] = useState<Extract<StudioEvent, { type: 'art-direction' }> | null>(null)
  // inline project-specific question flow
  const [phase, setPhase] = useState<Phase>('idle')
  const [projectBrief, setProjectBrief] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [qLoading, setQLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => { void refreshSessions() }, [])
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [feed, liveStatus, phase, qLoading])

  async function refreshSessions() {
    try { setSessions(await (await fetch(`${API}/sessions`)).json() as StudioSession[]) } catch { /* API may boot after UI */ }
  }

  function handleEvent(ev: StudioEvent) {
    if (ev.type === 'log') { setLiveStatus(ev.text); return }
    if (ev.type === 'art-direction') setLastArt(ev)
    setFeed((f) => [...f, { kind: 'event', ev }])
    if (ev.type === 'done') {
      setPreviewUrl(ev.previewUrl); setPreviewNonce((n) => n + 1); setLiveStatus(''); setRunning(false); setTab('preview'); void refreshSessions()
    } else if (ev.type === 'error') { setLiveStatus(''); setRunning(false) }
  }

  async function run(sendText: string, isEdit: boolean, choices: Record<string, string>) {
    if (running) return
    setFeed((f) => [...f, { kind: 'assistant', text: BUILD_INTRO, iterate: isEdit }])
    setInput(''); setRunning(true); setLiveStatus('Starting…'); setPhase('building')
    try {
      const r = await fetch(`${API}/${isEdit ? 'iterate' : 'generate'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: sendText, choices, sessionId: activeId ?? undefined })
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      setActiveId(data.sessionId)
      esRef.current?.close()
      const es = new EventSource(`${API}/generate/${data.runId}/stream`); esRef.current = es
      es.onmessage = (m) => { const ev = JSON.parse(m.data) as StudioEvent; handleEvent(ev); if (ev.type === 'done' || ev.type === 'error') es.close() }
      es.onerror = () => { es.close(); setRunning(false); setLiveStatus('') }
    } catch (e) { handleEvent({ type: 'error', message: (e as Error).message }) }
  }

  // Home "Build": enter the workspace and ask project-specific questions inline in the chat.
  async function startProject(brief: string) {
    const b = brief.trim(); if (!b) return
    setActiveId(null); setPreviewUrl(null); setLastArt(null)
    setProjectBrief(b); setTitle(b)
    setFeed([{ kind: 'user', text: b }])
    setPhase('asking'); setQuestions([]); setQLoading(true)
    try {
      const r = await fetch(`${API}/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: b }) })
      const data = await r.json()
      const qs: Question[] = Array.isArray(data.questions) ? data.questions : []
      setFeed((f) => [...f, { kind: 'assistant', text: (data.intro || "I'd love to build this. A few quick questions so I create exactly what you need:") }])
      setQuestions(qs)
      if (qs.length === 0) void run(b, false, {})
    } catch {
      void run(b, false, {})
    } finally { setQLoading(false) }
  }

  function finishQuestions(answers: Record<string, string>, skip: boolean) {
    setQuestions([])
    void run(skip ? projectBrief : composeBrief(projectBrief, questions, answers), false, skip ? {} : answers)
  }
  function sendFollowUp() { const t = input.trim(); if (t) void run(t, true, {}) }

  function openSession(s: StudioSession) {
    esRef.current?.close()
    setActiveId(s.id); setTitle(s.brief); setFeed([]); setLastArt(null); setQuestions([]); setPhase('idle')
    setPreviewUrl(s.previewUrl ?? null); setPreviewNonce((n) => n + 1); setTab('preview'); setRunning(false); setLiveStatus('')
  }
  function newSession() {
    esRef.current?.close()
    setActiveId(null); setTitle(''); setFeed([]); setInput(''); setLastArt(null); setPreviewUrl(null); setRunning(false); setLiveStatus(''); setQuestions([]); setPhase('idle')
  }

  const inWorkspace = activeId !== null || phase !== 'idle' || feed.length > 0

  const Sidebar = (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo"><Leaf size={22} /></div>
        <div><div className="brand-name">Loam</div><div className="brand-tag">prompt · build · grow</div></div>
      </div>
      <button className="new-session" onClick={newSession}>＋ New session</button>
      <div className="sessions-label">Sessions</div>
      <div className="session-list">
        {sessions.map((s) => (
          <button key={s.id} className={`session-item ${s.id === activeId ? 'active' : ''}`} onClick={() => openSession(s)}>
            <span className="st">{s.brief.split('\n')[0]}</span>
            <span className="sd">{new Date(s.updatedAt).toLocaleDateString()}</span>
          </button>
        ))}
        {sessions.length === 0 && <div className="sessions-empty">No sessions yet.</div>}
      </div>
    </aside>
  )

  if (!inWorkspace) {
    return (
      <div className="app">
        {Sidebar}
        <div className="home">
          <div className="home-inner">
            <div className="ready">✦ Ready when you are</div>
            <h1 className="home-title serif">What would you like to build today?</h1>
            <p className="home-sub">Describe an app, a page, or an idea. We’ll ask a couple of questions tailored to your project, right here in the chat, then build it live on the right.</p>
            <div className="prompt-card">
              <textarea className="prompt-input" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void startProject(input) } }}
                placeholder="A calm reading tracker with an earthy palette…" autoFocus />
              <div className="prompt-foot">
                <span className="kbd">⌘/Ctrl + Enter</span>
                <button className="btn-brown" disabled={!input.trim()} onClick={() => void startProject(input)}>Build ↑</button>
              </div>
            </div>
            <div className="chips">
              {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => void startProject(s)}>{s}</button>)}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {Sidebar}
      <div className="workspace">
        <section className="chat">
          <div className="chat-head">
            <div className="eyebrow">Session</div>
            <div className="chat-title">{title.split('\n')[0]}</div>
          </div>
          <div className="chat-scroll" ref={scrollRef}>
            {feed.map((item, i) => <Card key={i} item={item} />)}
            {phase === 'asking' && qLoading && <div className="live"><span className="spinner" /> Tailoring questions to your project…</div>}
            {phase === 'asking' && !qLoading && questions.length > 0 && (
              <QuestionsCard questions={questions} onDone={finishQuestions} />
            )}
            {running && liveStatus && <div className="live"><span className="spinner" /> {liveStatus}</div>}
          </div>
          <div className="composer">
            <div className="composer-card">
              <textarea className="composer-input" value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendFollowUp() } }}
                placeholder={phase === 'asking' ? 'Answer the questions above to start building…' : 'Ask for changes, add features, refine the look…'}
                disabled={running || phase === 'asking'} />
              <div className="composer-foot">
                <span className="kbd">⌘/Ctrl + Enter</span>
                <button className="btn-brown" disabled={running || phase === 'asking' || !input.trim()} onClick={sendFollowUp}>{running ? 'Building…' : 'Send ↑'}</button>
              </div>
            </div>
          </div>
        </section>

        <section className="preview">
          <div className="preview-tabs">
            <button className={`tab ${tab === 'preview' ? 'active' : ''}`} onClick={() => setTab('preview')}>👁 Preview</button>
            <button className={`tab ${tab === 'code' ? 'active' : ''}`} onClick={() => setTab('code')}>{'</>'} Code</button>
            <button className={`tab ${tab === 'design' ? 'active' : ''}`} onClick={() => setTab('design')}>🎨 Design</button>
            <div className="tab-spacer" />
            <button className="tab ghost" disabled={!previewUrl} onClick={() => setPreviewNonce((n) => n + 1)}>⟳ Reload</button>
            {previewUrl && <a className="tab ghost" href={previewUrl} target="_blank" rel="noreferrer">↗ Open</a>}
          </div>
          <div className="browser">
            <div className="browser-bar">
              <div className="dots"><span className="dot r" /><span className="dot y" /><span className="dot g" /></div>
              <span className="url-pill">loam.app/{(activeId ?? '').slice(0, 8) || 'session'}</span>
            </div>
            {tab === 'preview' && (
              <div className="browser-body">
                {previewUrl ? <iframe key={previewNonce} src={previewUrl} title="live preview" /> : (
                  <div className="preview-empty"><div>
                    <div className="serif">{phase === 'asking' ? 'Answer a few questions →' : 'Building your first pass…'}</div>
                    <div>{phase === 'asking' ? 'Then I’ll build it and the live preview appears here.' : 'The live preview appears here once this version finishes building.'}</div>
                  </div></div>
                )}
              </div>
            )}
            {tab === 'design' && <DesignPanel art={lastArt} />}
            {tab === 'code' && (
              <div className="code-note"><div>
                <div className="serif" style={{ fontSize: 20, marginBottom: 6 }}>Code view</div>
                Source browsing isn’t wired yet — use <b>Preview</b> for the live build and <b>Design</b> for the locked palette &amp; motion.
              </div></div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function QuestionsCard({ questions, onDone }: { questions: Question[]; onDone: (answers: Record<string, string>, skip: boolean) => void }) {
  const [step, setStep] = useState(0)
  const [choice, setChoice] = useState<Record<string, string>>({}) // label chosen (or '__other__')
  const [other, setOther] = useState<Record<string, string>>({})
  const q = questions[step]
  const last = step === questions.length - 1
  const isOther = choice[q.id] === '__other__'
  const answered = isOther ? Boolean(other[q.id]?.trim()) : Boolean(choice[q.id])

  function resolve(): Record<string, string> {
    const out: Record<string, string> = {}
    for (const qq of questions) {
      const c = choice[qq.id]
      if (!c) continue
      out[qq.id] = c === '__other__' ? (other[qq.id]?.trim() || '') : c
    }
    return out
  }

  return (
    <div className="qcard">
      <div className="qcard-head">Questions</div>
      <div className="qcard-q">{q.question}</div>
      <div className="qcard-options">
        {q.options.map((o) => (
          <button key={o.label} className={`qopt ${choice[q.id] === o.label ? 'sel' : ''}`} onClick={() => setChoice((c) => ({ ...c, [q.id]: o.label }))}>
            <span className="qradio" />
            <span className="qopt-text"><span className="qopt-label">{o.label}</span>{o.description && <span className="qopt-desc">{o.description}</span>}</span>
          </button>
        ))}
        <div className={`qopt qopt-other ${isOther ? 'sel' : ''}`} onClick={() => setChoice((c) => ({ ...c, [q.id]: '__other__' }))}>
          <span className="qradio" />
          <input className="qother-input" placeholder="Other…" value={other[q.id] ?? ''}
            onChange={(e) => { setOther((o) => ({ ...o, [q.id]: e.target.value })); setChoice((c) => ({ ...c, [q.id]: '__other__' })) }} />
        </div>
      </div>
      <div className="qcard-foot">
        <div className="qcard-left">
          <button className="qbtn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>Back</button>
          <button className="qskip" onClick={() => onDone(resolve(), true)}>Skip</button>
        </div>
        <div className="qdots">{questions.map((_, i) => <span key={i} className={`qdot ${i === step ? 'on' : ''}`} />)}</div>
        <button className="qbtn primary" disabled={!answered} onClick={() => (last ? onDone(resolve(), false) : setStep((s) => s + 1))}>{last ? 'Build ↑' : 'Next'}</button>
      </div>
    </div>
  )
}

function DesignPanel({ art }: { art: Extract<StudioEvent, { type: 'art-direction' }> | null }) {
  const entries = useMemo(() => (art ? Object.entries(art.palette) : []), [art])
  if (!art) return <div className="code-note"><div>The palette and motion appear here once art direction is locked.</div></div>
  return (
    <div className="design-body">
      <h3 className="design-h serif">Design — {art.paletteName}</h3>
      <div className="design-sub">{art.rationale}</div>
      <div className="design-grid">
        <div className="design-card">
          <h4>Palette</h4>
          <div className="swatches" style={{ flexWrap: 'wrap' }}>
            {entries.map(([k, v]) => (
              <div className="swatch" key={k} title={`${k}: ${v}`}>
                <span className="swatch-chip" style={{ background: v }} /><span className="swatch-label">{k}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="design-card"><h4>Motion</h4><div className="tokens"><span className="token token-motion">{art.motion}</span></div></div>
      </div>
    </div>
  )
}
