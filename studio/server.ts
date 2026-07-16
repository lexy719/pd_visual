/**
 * PD Studio API — a thin, standalone HTTP/SSE layer over the existing generation engine.
 * Decoupled from Jarvis/Electron. Wraps plan → artDirect → generateSections → writePage and
 * streams typed progress events (the "Added X" cards) to the browser UI over Server-Sent Events.
 *
 *   POST /generate { brief }        -> { runId }        (kicks the pipeline off async)
 *   GET  /generate/:runId/stream    -> text/event-stream (buffered replay + live events)
 *   POST /iterate  { brief }        -> { runId }        (edit mode not built yet — fresh regen)
 *
 * The engine is imported READ-ONLY; nothing here modifies it. Per-section cards come from parsing
 * the engine's existing log-callback strings; milestone cards come from the functions' return values.
 */

import express from 'express'
import cors from 'cors'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { plan } from '../engine/agent/plan.js'
import { artDirect } from '../engine/agent/art-direction.js'
import { generateSections } from '../engine/agent/generate.js'
import { writePage, APP } from '../engine/agent/writer.js'
import { hexToRgb, rgbToHsl } from '../engine/agent/color.js'
import { retrievePlanningEvidence } from '../engine/retrieval/query.js'
import { completeReasoning, extractJson } from '../engine/llm/llm.js'
import type { SearchHit } from '../engine/types.js'

const PORT = 3001
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const ROOT = join(process.cwd())
const PROJECTS = join(ROOT, 'projects')
const SESSIONS_FILE = join(PROJECTS, 'sessions.json')

interface Session {
  id: string
  brief: string
  choices: Record<string, string>
  createdAt: string
  updatedAt: string
  previewUrl?: string
}

function loadSessions(): Session[] {
  try { return JSON.parse(readFileSync(SESSIONS_FILE, 'utf8')) as Session[] } catch { return [] }
}
let sessions = loadSessions()
function saveSessions(): void {
  mkdirSync(PROJECTS, { recursive: true })
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8')
}
function upsertSession(id: string, brief: string, choices: Record<string, string>): Session {
  const now = new Date().toISOString()
  let session = sessions.find((s) => s.id === id)
  if (!session) {
    session = { id, brief, choices, createdAt: now, updatedAt: now }
    sessions.unshift(session)
  } else {
    session.brief = brief
    session.choices = choices
    session.updatedAt = now
  }
  saveSessions()
  return session
}

// --- event types (mirrored in studio/ui/src/types.ts) ------------------------------------------
type StudioEvent =
  | { type: 'run-start'; runId: string; brief: string; isEdit: boolean }
  | { type: 'plan'; brand: string; mood: string[]; sections: string[]; layout: string[] }
  | { type: 'art-direction'; paletteName: string; palette: Record<string, string>; motion: string; rationale: string }
  | { type: 'section'; index: number; sectionType: string; strategy: string; backing: string; motion: string }
  | { type: 'notice'; level: 'info' | 'warn'; text: string }
  | { type: 'log'; text: string }
  | { type: 'done'; previewUrl: string; fileCount: number }
  | { type: 'error'; message: string }

interface Run {
  id: string
  brief: string
  /** the answers the user picked in the questions step — threaded into what plan() sees */
  choices: Record<string, string>
  isEdit: boolean
  sessionId: string
  buffer: StudioEvent[]
  clients: Set<express.Response>
  done: boolean
}
const runs = new Map<string, Run>()
let inFlight = false // the preview app is a single shared workspace — one run at a time

const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '').trim()

function emit(run: Run, ev: StudioEvent): void {
  run.buffer.push(ev)
  const payload = `data: ${JSON.stringify(ev)}\n\n`
  for (const res of run.clients) {
    // A client that navigated away / crashed leaves a dead socket; writing to it throws EPIPE /
    // "write after end". Never let a disconnected UI take the whole server down — drop that client.
    try {
      res.write(payload)
    } catch {
      run.clients.delete(res)
    }
  }
  if (ev.type === 'done' || ev.type === 'error') run.done = true
}

/** A friendly, human name for a palette, derived from the accent hue (labelled as derived, not stored). */
function paletteName(accentHex: string): string {
  const rgb = hexToRgb(accentHex)
  if (!rgb) return 'Custom'
  const [h, s] = rgbToHsl(rgb)
  if (s < 0.15) return 'Slate'
  const names: Array<[number, string]> = [
    [15, 'Ember'], [40, 'Amber'], [65, 'Citron'], [150, 'Fern'], [190, 'Tide'],
    [215, 'Cobalt'], [260, 'Indigo'], [290, 'Violet'], [330, 'Fuchsia'], [360, 'Ember']
  ]
  return names.find(([deg]) => h <= deg)?.[1] ?? 'Ember'
}

/** Turn a generateSections log line into a `section` card when it's a selection line, else a `log`. */
function parseGenLine(line: string, run: Run): void {
  const clean = stripAnsi(line)
  const m = clean.match(/\[(\d+)\]\s+(\w+)\s+→\s+(component|motion-primitive|scratch)\s*(.*)$/)
  if (m) {
    const [, idx, sectionType, strategy, rest] = m
    let backing = ''
    let motion = ''
    if (strategy === 'component') {
      backing = rest.match(/^(\S+)/)?.[1] ?? ''
      motion = rest.match(/slots:\s*motion=([a-z-]+)/)?.[1] ?? ''
    } else if (strategy === 'motion-primitive') {
      backing = rest.match(/^(\S+)/)?.[1] ?? ''
      motion = rest.match(/motion:([a-z-]+)/)?.[1] ?? ''
    }
    emit(run, { type: 'section', index: Number(idx), sectionType, strategy, backing, motion })
    return
  }
  if (clean) emit(run, { type: 'log', text: clean })
}

/** Fold the user's picked answers into the brief the plan actually sees — without this, the questions
 *  step is cosmetic (the answers never reach generation). */
function briefWithChoices(brief: string, choices: Record<string, string>): string {
  const picked = Object.entries(choices)
    .map(([q, a]) => `- ${q.trim()}: ${String(a).trim()}`)
    .filter((l) => l.length > 4)
  return picked.length ? `${brief}\n\nUser preferences (from the clarifying questions — honour these):\n${picked.join('\n')}` : brief
}

async function runPipeline(run: Run): Promise<void> {
  const origWarn = console.warn
  try {
    emit(run, { type: 'run-start', runId: run.id, brief: run.brief, isEdit: run.isEdit })

    const augmentedBrief = briefWithChoices(run.brief, run.choices)
    const p = await plan(augmentedBrief)
    emit(run, { type: 'plan', brand: p.brand, mood: p.mood, sections: p.sections.map((s) => `${s.name} · ${s.composition}`), layout: p.layoutPatterns ?? [] })

    const art = await artDirect(p, (l) => parseGenLine(l, run))
    emit(run, { type: 'art-direction', paletteName: paletteName(art.palette.accent), palette: art.palette as unknown as Record<string, string>, motion: art.motion, rationale: art.rationale })

    const gen = await generateSections(p, art, (l) => parseGenLine(l, run))
    if (gen.imagesResolved > 0) emit(run, { type: 'notice', level: 'info', text: `Upgraded ${gen.imagesResolved} images to keyword-matched photos` })

    // writePage warns (quarantine / no-default-export fixups) via console.warn — capture those.
    console.warn = (...a: unknown[]) => {
      const t = stripAnsi(a.map(String).join(' '))
      if (/QUARANTINE|fixup/i.test(t)) emit(run, { type: 'notice', level: 'warn', text: t })
      origWarn(...(a as []))
    }
    const w = writePage(p, gen, art)
    console.warn = origWarn

    // Quarantine is the most severe per-section outcome (the page is missing that content), so emit it
    // STRUCTURALLY from the result rather than relying on the console.warn scrape above — a stubbed
    // section must be impossible to miss in the UI.
    for (const s of gen.sections.filter((x) => x.quarantined)) {
      const q = s.quarantined!
      const who = q.tiersFailed.length ? `${q.tiersFailed.join(' + ')} failed to parse` : 'generation parsed OK — broken by a writer transform'
      emit(run, {
        type: 'notice',
        level: 'warn',
        text: `Section ${s.index}:${s.name} was QUARANTINED — it did not parse and was replaced with a visible stub. ${who}. ${q.error.slice(0, 90)}${q.evidence ? ` · evidence: ${q.evidence}` : ''}`
      })
    }

    // The generator still uses one safe working template, but every completed result is built
    // and copied to a session-owned static snapshot. Later runs cannot overwrite past sessions.
    await buildSessionSnapshot(run.sessionId)
    const previewUrl = `http://localhost:${PORT}/sessions/${run.sessionId}/site/`
    const session = sessions.find((s) => s.id === run.sessionId)
    if (session) { session.previewUrl = previewUrl; session.updatedAt = new Date().toISOString(); saveSessions() }
    emit(run, { type: 'done', previewUrl, fileCount: w.files.length })
  } catch (e) {
    console.warn = origWarn
    emit(run, { type: 'error', message: (e as Error).message })
  } finally {
    inFlight = false
  }
}

function buildSessionSnapshot(sessionId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, ['run', 'build'], { cwd: APP, shell: true, stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0) return reject(new Error(`preview build failed (exit ${code ?? 'unknown'})`))
      const dest = join(PROJECTS, sessionId, 'site')
      rmSync(dest, { recursive: true, force: true })
      mkdirSync(join(PROJECTS, sessionId), { recursive: true })
      cpSync(join(APP, 'dist'), dest, { recursive: true })
      resolve()
    })
  })
}

function startRun(brief: string, isEdit: boolean, sessionId: string, choices: Record<string, string>): string {
  const id = randomUUID()
  const run: Run = { id, brief, choices, isEdit, sessionId, buffer: [], clients: new Set(), done: false }
  runs.set(id, run)
  inFlight = true
  void runPipeline(run)
  return id
}

const app = express()
app.use(cors())
app.use(express.json())
app.use('/sessions', express.static(PROJECTS))

app.get('/health', (_req, res) => res.json({ ok: true }))
app.get('/sessions', (_req, res) => res.json(sessions))

const QSYS = `You are the clarifying-questions step of a web-design agent. Given a brief AND retrieved design
evidence (real critique insights + layout/narrative patterns for briefs like this one), produce a friendly
one-sentence lead-in, then 3 (max 4) project-SPECIFIC multiple-choice questions that RESOLVE the real design
decisions this kind of site turns on — grounded in the evidence, never generic.

HARD REQUIREMENT: exactly ONE question MUST be about LAYOUT / COMPOSITION preference — how the page should be
structured and feel visually. Phrase it in plain language, with options that map to distinct compositions, e.g.
full-bleed cinematic imagery · editorial columns + whitespace · a grid/gallery of items · bento modular cards ·
alternating narrative rows · a vertical timeline. The other questions cover audience, primary goal/action, tone,
or key content — informed by the evidence's known failure modes for this brief type.

Each question has 2-4 options; each option has a short "label" (2-4 words) AND a one-line "description".
Respond with ONLY JSON in this exact shape:
{ "intro": "<one friendly sentence>", "questions": [ { "question": "<specific question>", "options": [ { "label": "<short>", "description": "<one line>" } ] } ] }`

type QOption = { label: string; description: string }
type Q = { id: string; question: string; options: QOption[] }

// The guaranteed layout/composition question — injected if the model didn't produce one, and part of the
// fallback set. Options map to the composition vocabulary the plan step understands.
const COMPOSITION_QUESTION: Omit<Q, 'id'> = {
  question: 'How should the page be laid out — what composition fits your vision?',
  options: [
    { label: 'Cinematic & full-bleed', description: 'Big edge-to-edge imagery, oversized type, dramatic' },
    { label: 'Editorial columns', description: 'Magazine-style stacked sections with generous whitespace' },
    { label: 'Grid / gallery', description: 'A visual grid or gallery of items, evenly arranged' },
    { label: 'Modular bento cards', description: 'Cards of varied sizes in a tight modular grid' }
  ]
}

/**
 * Does any question already cover layout/composition? Match the question TEXT on structural words, OR —
 * to catch phrasings like "how should the page feel as you scroll?" whose OPTIONS are compositions —
 * when ≥2 of its options map to composition vocabulary. The ≥2 rule avoids a false positive from a
 * single stray "editorial"/"grid" option on an unrelated (e.g. tone) question, so the guarantee holds.
 */
const COMPOSITION_RE = /layout|composition|structure|arrange|grid|full[- ]?bleed|column|bento|masonry|visual style|how.*(look|laid)/i
const COMPOSITION_VOCAB_RE = /full[- ]?bleed|cinematic|editorial|column|grid|gallery|masonry|bento|modular|narrative|timeline|asymmetric|immersive/i
const isCompositionQuestion = (q: Q): boolean => {
  if (COMPOSITION_RE.test(q.question)) return true
  const optHits = q.options.filter((o) => COMPOSITION_VOCAB_RE.test(o.label) || COMPOSITION_VOCAB_RE.test(o.description)).length
  return optHits >= 2
}

// Sensible default questions used whenever the model is unavailable/rate-limited/too slow, so the
// user ALWAYS gets a question step instead of the build starting silently. Includes the composition question.
const FALLBACK_QUESTIONS: Q[] = [
  { id: 'q0', question: COMPOSITION_QUESTION.question, options: COMPOSITION_QUESTION.options },
  { id: 'q1', question: 'Who is the primary audience?', options: [
    { label: 'General public', description: 'Broad, first-time visitors' },
    { label: 'Customers / users', description: 'People ready to act or buy' },
    { label: 'Professionals', description: 'An industry or business audience' } ] },
  { id: 'q2', question: 'What tone should it strike?', options: [
    { label: 'Warm & inviting', description: 'Friendly, human, approachable' },
    { label: 'Bold & energetic', description: 'Punchy, high-contrast, confident' },
    { label: 'Calm & premium', description: 'Refined, spacious, understated' } ] }
]

/** Digest retrieved evidence into a short block for the questions prompt. */
function evidenceDigest(hits: SearchHit[], max = 4): string {
  return hits.slice(0, max).map((h) => {
    const p = h.payload as { heading?: string; body?: string; site?: string; observation?: { what?: string; why?: string }; throughline?: string }
    if (p.observation?.what) return `- ${p.site ?? h.name}: ${p.observation.what}${p.observation.why ? ` — ${p.observation.why}` : ''}`
    if (p.throughline) return `- ${p.site ?? h.name}: ${p.throughline}`
    return `- ${p.heading ?? h.name}: ${(p.body ?? h.embed_text).replace(/\s+/g, ' ').slice(0, 200)}`
  }).join('\n')
}

function parseQuestions(raw: string): { intro: string; questions: Q[] } {
  const parsed = extractJson<{ intro?: string; questions?: Array<{ question?: string; options?: unknown[] }> }>(raw)
  const questions = (parsed.questions ?? [])
    .slice(0, 4)
    .map((q, i) => ({
      id: `q${i}`,
      question: String(q.question ?? '').trim(),
      options: (Array.isArray(q.options) ? q.options : [])
        .map((o): QOption => (typeof o === 'string'
          ? { label: o.trim(), description: '' }
          : { label: String((o as QOption)?.label ?? '').trim(), description: String((o as QOption)?.description ?? '').trim() }))
        .filter((o) => o.label)
        .slice(0, 4)
    }))
    .filter((q) => q.question && q.options.length >= 2)
  return { intro: String(parsed.intro ?? '').trim(), questions }
}

/** Guarantee a layout/composition question — inject the canned one if the model didn't produce one. */
function ensureComposition(questions: Q[]): { questions: Q[]; injected: boolean } {
  if (questions.some(isCompositionQuestion)) return { questions, injected: false }
  const kept = questions.slice(0, 3)
  kept.push({ id: 'q', question: COMPOSITION_QUESTION.question, options: COMPOSITION_QUESTION.options })
  return { questions: kept.map((q, i) => ({ ...q, id: `q${i}` })), injected: true }
}

// Grounded project-specific questions. ALWAYS returns a set that INCLUDES a layout/composition question.
// Grounding (critiques + layout/narrative patterns) is retrieved first; if it comes back thin OR the model
// call fails/times out, that is LOGGED loudly (never silently masked) and the composition-bearing fallback
// is used. A 20s race keeps a rate-limit wait from hanging the request.
app.post('/questions', async (req, res) => {
  const brief = String(req.body?.brief ?? '').trim()
  if (!brief) return res.status(400).json({ error: 'brief is required' })

  // 1. Retrieve grounding. If retrieval itself fails (e.g. embedder offline), that is visible, not hidden.
  let grounding = ''
  let groundCount = 0
  try {
    const ev = await retrievePlanningEvidence(brief)
    const critiques = ev.critiques ?? []
    const patterns = [...(ev.layout ?? []), ...(ev.visual ?? []), ...(ev.motionMedia ?? [])]
    groundCount = critiques.length + patterns.length
    grounding =
      `CRITIQUE INSIGHTS (real failure/success modes for sites like this — ask questions that resolve these):\n` +
      `${evidenceDigest(critiques, 4) || '- (none retrieved)'}\n\n` +
      `LAYOUT / PATTERN EVIDENCE (structures that fit this brief type):\n` +
      `${evidenceDigest(patterns, 4) || '- (none retrieved)'}`
    if (groundCount < 3) {
      console.warn(`  \x1b[33m⚠ questions grounding THIN (${groundCount} evidence hits) for "${brief.slice(0, 60)}" — proceeding, not masking.\x1b[0m`)
    } else {
      console.log(`  \x1b[2mquestions grounded on ${groundCount} evidence hits.\x1b[0m`)
    }
  } catch (e) {
    console.warn(`  \x1b[33m⚠ questions grounding retrieval FAILED (${(e as Error).message}) — proceeding ungrounded.\x1b[0m`)
    grounding = '(design evidence retrieval unavailable — ask sharp questions from the brief alone)'
  }

  // 2. Ask the model, grounded. Enforce the composition question on whatever comes back.
  try {
    const user = `Brief: ${brief}\n\n${grounding}`
    const raw = await Promise.race([
      completeReasoning(QSYS, user, { temperature: 0.5, maxTokens: 1600 }),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('questions timed out')), 20000))
    ])
    const parsed = parseQuestions(raw)
    if (parsed.questions.length >= 2) {
      const { questions, injected } = ensureComposition(parsed.questions)
      if (injected) console.warn(`  \x1b[33m⚠ model omitted a layout/composition question — injected the canned one.\x1b[0m`)
      return res.json({ intro: parsed.intro || 'A few quick questions so I build exactly what you need:', questions, grounded: groundCount >= 3 })
    }
    console.warn(`  \x1b[33m⚠ questions model returned <2 valid questions — using fallback set.\x1b[0m`)
  } catch (e) {
    console.warn(`  \x1b[33m⚠ questions model call failed (${(e as Error).message}) — using fallback set.\x1b[0m`)
  }
  res.json({ intro: 'A few quick questions so I build exactly what you need:', questions: FALLBACK_QUESTIONS, grounded: false })
})

app.post('/generate', (req, res) => {
  const brief = String(req.body?.brief ?? '').trim()
  const choices = (req.body?.choices && typeof req.body.choices === 'object' ? req.body.choices : {}) as Record<string, string>
  const sessionId = String(req.body?.sessionId ?? '').trim() || randomUUID()
  if (!brief) return res.status(400).json({ error: 'brief is required' })
  if (inFlight) return res.status(409).json({ error: 'a generation is already running (single shared preview)' })
  upsertSession(sessionId, brief, choices)
  res.json({ runId: startRun(brief, false, sessionId, choices), sessionId })
})

// Edit mode isn't built yet — a follow-up runs a FRESH generation. The UI shows a loud banner.
app.post('/iterate', (req, res) => {
  const brief = String(req.body?.brief ?? '').trim()
  const choices = (req.body?.choices && typeof req.body.choices === 'object' ? req.body.choices : {}) as Record<string, string>
  const sessionId = String(req.body?.sessionId ?? '').trim()
  if (!brief) return res.status(400).json({ error: 'brief is required' })
  if (!sessionId || !sessions.some((s) => s.id === sessionId)) return res.status(404).json({ error: 'session not found' })
  if (inFlight) return res.status(409).json({ error: 'a generation is already running' })
  upsertSession(sessionId, brief, choices)
  res.json({ runId: startRun(brief, true, sessionId, choices), sessionId })
})

app.get('/generate/:id/stream', (req, res) => {
  const run = runs.get(req.params.id)
  if (!run) return res.status(404).end()
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  ;(res as express.Response & { flushHeaders?: () => void }).flushHeaders?.()
  for (const ev of run.buffer) res.write(`data: ${JSON.stringify(ev)}\n\n`) // replay
  if (run.done) return res.end()
  run.clients.add(res)
  req.on('close', () => run.clients.delete(res))
})

// Never die with a raw, concurrently-swallowed stack. Log the real cause, then exit cleanly.
process.on('uncaughtException', (err) => {
  console.error(`\n  \x1b[31m✗ uncaught exception:\x1b[0m ${(err as Error).message}\n${(err as Error).stack ?? ''}`)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error(`\n  \x1b[31m✗ unhandled rejection:\x1b[0m ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`)
  process.exit(1)
})

const server = app.listen(PORT, () => {
  console.log(`\n  PD Studio API   →  http://localhost:${PORT}`)
  console.log(`  Session previews →  http://localhost:${PORT}/sessions/<id>/site/`)
  console.log(`  UI              →  http://localhost:5200\n`)
})
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n  \x1b[31m✗ Port ${PORT} is already in use.\x1b[0m A previous studio server is still running.\n` +
        `    Free it, then retry:  \x1b[36mnpx kill-port ${PORT} 5200\x1b[0m  (or kill the stray node process)\n`
    )
  } else {
    console.error(`\n  \x1b[31m✗ server error:\x1b[0m ${err.message}\n`)
  }
  process.exit(1)
})
