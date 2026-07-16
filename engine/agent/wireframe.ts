/**
 * Wireframe-approval step — runs between art-direction and code generation.
 *
 * It builds a low-fidelity structural preview of the page WITHOUT any LLM codegen: for each planned
 * section it runs the SAME cheap retrieval/selection generation would (embeddings only) to learn what
 * will back it (component / motion-primitive / scratch pattern), then renders labelled proportional
 * boxes. This lets the user approve/reject the STRUCTURE before the expensive ~8-call codegen is spent.
 *
 * A rejection is logged to knowledge/plan-preferences/ (embeddable, retrievable) so the Plan step can
 * later avoid the same structure for similar briefs — the same feedback loop as critiques.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { retrieveForSection } from '../retrieval/query.js'
import { selectMotionPrimitive, retrieveStructural } from './generate.js'
import { openDb, ensureSchema, insertDoc, deleteBySourcePath } from '../retrieval/store.js'
import { embedDocument } from '../retrieval/embed.js'
import { buildDocsForFile, ROOT, rel } from '../ingest/build.js'
import { hexToRgb, rgbToHsl } from './color.js'
import type { Composition, MotionPrimitiveDoc, PlanPreferenceDoc } from '../types.js'
import type { ArtDirection } from './art-direction.js'
import type { Emphasis, Plan } from './types.js'

/** A friendly name for a palette, derived from the accent hue (cosmetic, for the wireframe header). */
export function paletteName(accentHex: string): string {
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

export interface WireframeSection {
  index: number
  /** free-invented section name */
  name: string
  /** design-language composition the renderer maps to a box arrangement */
  composition: Composition
  backing: 'motion-primitive' | 'scratch'
  /** e.g. "kinetic-text-split (motion)" | "bento-grid" — a DISPLAY string, never parsed */
  label: string
  /**
   * The id of the motion primitive backing this section, when one was content-fit-selected. Carried
   * structurally (not parsed back out of `label`) so the SVG renderer can cite the real primitive by
   * name — the wireframe gate is only meaningful if what you approve is what generation will run.
   */
  motionPrimitiveId?: string
  rows: number // proportional height (from emphasis)
  cols: number // sub-box grid hint (0 = solid band), from composition
  /** annotations surfaced so the human approves INTENT, not just proportions */
  intent: string
  media?: string
  motion?: string
}

export interface Wireframe {
  brand: string
  mood: string[]
  archetype: string
  motion: string
  paletteName: string
  sections: WireframeSection[]
}

/** Proportional box height per emphasis (low-fidelity, just for the diagram). */
const ROWS: Record<Emphasis, number> = { sm: 2, md: 3, lg: 4, xl: 5 }
/** Sub-box grid hint per composition (0 = solid band). */
const COLS: Record<Composition, number> = {
  cinematic: 0, editorial: 2, gallery: 4, narrative: 2, asymmetric: 2, modular: 3, immersive: 0, timeline: 0
}

/**
 * Build the wireframe model. Reuses generation's retrieval/selection (embeddings only — NO codegen),
 * so what you see is what generation will actually back each section with.
 */
export async function buildWireframe(plan: Plan, art: ArtDirection): Promise<Wireframe> {
  const sections: WireframeSection[] = []
  for (let i = 0; i < plan.sections.length; i++) {
    const sec = plan.sections[i]
    const r = await retrieveForSection(`${sec.name} section (${sec.composition}) — ${sec.intent}`, {
      mood: plan.moodProfile,
      framework: 'react',
      motion: art.motion
    })
    let backing: WireframeSection['backing']
    let label: string
    let motionPrimitiveId: string | undefined
    const prim = art.motion === 'none' ? null : selectMotionPrimitive(sec.composition, r.motionPrimitives)
    if (prim) {
      backing = 'motion-primitive'
      motionPrimitiveId = (prim as MotionPrimitiveDoc).id
      label = `${motionPrimitiveId} (motion)`
    } else {
      backing = 'scratch'
      const st = await retrieveStructural(sec.composition, sec.intent)
      label = st[0]?.name ?? 'freeform'
    }
    sections.push({
      index: i,
      name: sec.name,
      composition: sec.composition,
      backing,
      label,
      motionPrimitiveId,
      rows: ROWS[sec.emphasis] ?? 3,
      cols: COLS[sec.composition] ?? 0,
      intent: sec.intent,
      media: sec.media,
      motion: sec.motion
    })
  }
  return {
    brand: plan.brand,
    mood: plan.mood,
    archetype: plan.layoutPatterns?.[0] ?? 'custom',
    motion: art.motion,
    paletteName: paletteName(art.palette.accent),
    sections
  }
}

/** ASCII box diagram — labelled, roughly proportioned, no styling. The structured model above also
 *  drives an SVG renderer when the UI checkpoint lands. */
export function renderWireframe(wf: Wireframe): string {
  const W = 52
  const inner = W - 4
  const bar = (l: string, r: string): string => l + '─'.repeat(W - 2) + r
  const row = (s = ''): string => `│ ${s.slice(0, inner).padEnd(inner)} │`
  const out: string[] = []
  out.push('')
  out.push(`  ${wf.brand}  ·  ${wf.mood.join('/')}  ·  ${wf.archetype}`)
  out.push(`  motion: ${wf.motion}   palette: ${wf.paletteName}`)
  out.push(`  ${bar('┌', '┐')}`.slice(2))
  wf.sections.forEach((s, i) => {
    if (i > 0) out.push(bar('├', '┤'))
    out.push(row(`${s.name}  ·  ${s.composition}  ·  ${s.label}`))
    out.push(row(`  ↳ ${s.intent}`))
    if (s.media) out.push(row(`    media: ${s.media}`))
    if (s.cols > 0) out.push(row('  ' + Array(s.cols).fill('[--]').join(' ')))
    for (let k = 0; k < Math.max(0, s.rows - 1 - (s.cols > 0 ? 1 : 0)); k++) out.push(row())
  })
  out.push(bar('└', '┘'))
  return out.join('\n')
}

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'brief'

/**
 * Log a rejected structure to knowledge/plan-preferences/ and ingest it immediately so the Plan step
 * can retrieve it as "avoid this" grounding next time. Best-effort ingest — the file is written either way.
 */
export async function writePlanPreference(plan: Plan, art: ArtDirection, reason: string): Promise<string> {
  const doc: PlanPreferenceDoc = {
    brief: plan.brief,
    mood: plan.mood,
    archetype: plan.layoutPatterns?.[0] ?? '',
    rejectedSections: plan.sections.map((s) => `${s.name} (${s.composition})`),
    reason: reason.trim(),
    tags: [...new Set([...plan.mood, plan.layoutPatterns?.[0] ?? '', 'plan-preference'].filter(Boolean))]
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const relPath = `knowledge/plan-preferences/${slugify(plan.brand)}-${stamp}.json`
  const abs = join(ROOT, relPath)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, JSON.stringify(doc, null, 2) + '\n', 'utf8')

  try {
    const db = openDb()
    ensureSchema(db)
    deleteBySourcePath(db, rel(abs))
    for (const d of buildDocsForFile(abs)) insertDoc(db, d, await embedDocument(d.embed_text))
    db.close()
  } catch {
    // ingest is best-effort (e.g. embedder offline); the JSON is saved and picked up on next full ingest.
  }
  return relPath
}
