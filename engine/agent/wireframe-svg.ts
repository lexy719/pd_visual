/**
 * SVG wireframe renderer — the visual half of the wireframe-approval step.
 *
 * Renders the SAME `Wireframe` model that `renderWireframe` prints as ASCII, but as a page-shaped
 * diagram: one proportional band per section, each drawn in the box arrangement its COMPOSITION
 * implies, annotated with the intent/media/motion that generation will actually act on.
 *
 * Deliberately LOW-FIDELITY and palette-free. A wireframe answers "is this the right structure?" —
 * showing brand colour here would invite the reader to review the styling instead, and the model
 * carries only a palette *name* anyway. The real palette is presented on the moodboard (moodboard.ts).
 *
 * Pure + deterministic: no LLM, no retrieval, no I/O. Same wireframe in ⇒ same string out.
 */

import type { Composition } from '../types.js'
import type { Wireframe, WireframeSection } from './wireframe.js'

/* ---------------------------------------------------------------------------------------------- *
 * Geometry
 * ---------------------------------------------------------------------------------------------- */

const PAGE_X = 24
const PAGE_W = 360
const GUTTER = 28
const ANNO_X = PAGE_X + PAGE_W + GUTTER
const ANNO_W = 470
const WIDTH = ANNO_X + ANNO_W + PAGE_X
const HEADER_H = 62
const BAND_GAP = 10
const PAD = 10

/**
 * Vertical scale. `rows` already encodes emphasis (sm 2 → xl 5) in wireframe.ts, so the SVG reuses it
 * rather than introducing a second emphasis→size mapping that could drift out of sync.
 */
const ROW_UNIT = 34
/** Annotation block needs room for up to 4 lines regardless of how short the band is. */
const MIN_BAND_H = 76

const bandHeight = (s: WireframeSection): number => Math.max(MIN_BAND_H, s.rows * ROW_UNIT)

/* ---------------------------------------------------------------------------------------------- *
 * Ink
 * ---------------------------------------------------------------------------------------------- */

const INK = {
  page: '#ffffff',
  band: '#f4f4f5',
  bandStroke: '#d4d4d8',
  block: '#d4d4d8',
  media: '#a1a1aa',
  text: '#71717a',
  label: '#18181b',
  dim: '#a1a1aa',
  motion: '#7c3aed',
  rule: '#e4e4e7'
} as const

const esc = (s: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Truncate to a character budget so a long intent can't overflow the annotation column. */
const clip = (s: string, n: number): string => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…'
}

const rect = (x: number, y: number, w: number, h: number, fill: string, rx = 2, extra = ''): string =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(Math.max(0, w))}" height="${r(Math.max(0, h))}" rx="${rx}" fill="${fill}"${extra}/>`

/** Round to 2dp — keeps the output stable and diffable rather than full of float noise. */
const r = (n: number): number => Math.round(n * 100) / 100

/** Stand-in text lines. */
function textLines(x: number, y: number, w: number, count: number, gap = 9): string {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const lw = i === 0 ? w * 0.62 : i === count - 1 ? w * 0.44 : w * (0.82 + ((i * 7) % 12) / 100)
    out.push(rect(x, y + i * gap, Math.min(w, lw), 4, INK.block, 2))
  }
  return out.join('')
}

/** Diagonal-hatched block = media. Distinguishes "an image goes here" from "text goes here". */
function mediaBlock(x: number, y: number, w: number, h: number): string {
  return (
    rect(x, y, w, h, 'url(#hatch)', 2) +
    `<rect x="${r(x)}" y="${r(y)}" width="${r(Math.max(0, w))}" height="${r(Math.max(0, h))}" rx="2" fill="none" stroke="${INK.media}" stroke-width="1"/>`
  )
}

/* ---------------------------------------------------------------------------------------------- *
 * Composition → box arrangement
 *
 * The one table that matters: each composition draws the shape it actually means. `i` is the section
 * index, used only by `narrative` (alternation is a property of the sequence, not the section).
 * ---------------------------------------------------------------------------------------------- */

type Arrange = (x: number, y: number, w: number, h: number, i: number) => string

const ARRANGE: Record<Composition, Arrange> = {
  // full-bleed oversized media, headline sitting over it
  cinematic: (x, y, w, h) =>
    mediaBlock(x, y, w, h) +
    rect(x + PAD, y + h - 26, w * 0.5, 7, INK.label, 2) +
    rect(x + PAD, y + h - 15, w * 0.3, 4, INK.text, 2),

  // stacked columns / split — two text columns with a heading above
  editorial: (x, y, w, h) => {
    const colW = (w - PAD * 3) / 2
    return (
      rect(x + PAD, y + PAD, w * 0.44, 8, INK.label, 2) +
      textLines(x + PAD, y + PAD + 20, colW, Math.max(2, Math.floor((h - 40) / 9))) +
      textLines(x + PAD * 2 + colW, y + PAD + 20, colW, Math.max(2, Math.floor((h - 40) / 9)))
    )
  },

  // masonry / grid — 4 columns, varied heights so it reads as masonry not a table
  gallery: (x, y, w, h) => {
    const cols = 4
    const gap = 6
    const cw = (w - PAD * 2 - gap * (cols - 1)) / cols
    const avail = h - PAD * 2
    const out: string[] = []
    for (let c = 0; c < cols; c++) {
      const cx = x + PAD + c * (cw + gap)
      const tall = c % 2 === 0
      const h1 = avail * (tall ? 0.58 : 0.4)
      const h2 = avail - h1 - gap
      out.push(mediaBlock(cx, y + PAD, cw, h1))
      if (h2 > 8) out.push(mediaBlock(cx, y + PAD + h1 + gap, cw, h2))
    }
    return out.join('')
  },

  // alternating rhythm — media and text swap sides on each successive narrative section
  narrative: (x, y, w, h, i) => {
    const half = (w - PAD * 3) / 2
    const mediaLeft = i % 2 === 0
    const mx = mediaLeft ? x + PAD : x + PAD * 2 + half
    const tx = mediaLeft ? x + PAD * 2 + half : x + PAD
    return (
      mediaBlock(mx, y + PAD, half, h - PAD * 2) +
      rect(tx, y + PAD + 4, half * 0.7, 8, INK.label, 2) +
      textLines(tx, y + PAD + 22, half, Math.max(2, Math.floor((h - 46) / 9)))
    )
  },

  // offset unequal split — 38/62 with a deliberate vertical offset on the narrow side
  asymmetric: (x, y, w, h) => {
    const narrow = (w - PAD * 3) * 0.38
    const wide = (w - PAD * 3) * 0.62
    const offset = 14
    return (
      rect(x + PAD, y + PAD + offset, narrow * 0.8, 8, INK.label, 2) +
      textLines(x + PAD, y + PAD + offset + 18, narrow, Math.max(1, Math.floor((h - 60) / 9))) +
      mediaBlock(x + PAD * 2 + narrow, y + PAD, wide, h - PAD * 2 - offset)
    )
  },

  // bento / card cluster — one lead card plus a cluster of smaller ones
  modular: (x, y, w, h) => {
    const gap = 6
    const inner = h - PAD * 2
    const leadW = (w - PAD * 2 - gap) * 0.46
    const restW = w - PAD * 2 - gap - leadW
    const smallH = (inner - gap) / 2
    const restColW = (restW - gap) / 2
    return (
      rect(x + PAD, y + PAD, leadW, inner, INK.block, 3) +
      rect(x + PAD * 1 + leadW + gap, y + PAD, restColW, smallH, INK.block, 3) +
      rect(x + PAD * 1 + leadW + gap * 2 + restColW, y + PAD, restColW, smallH, INK.block, 3) +
      rect(x + PAD * 1 + leadW + gap, y + PAD + smallH + gap, restW, smallH, INK.block, 3)
    )
  },

  // full-viewport pinned band — two stacked panels + a pin marker on the rail
  immersive: (x, y, w, h) => {
    const panelH = (h - PAD * 2 - 4) / 2
    return (
      mediaBlock(x + PAD, y + PAD, w - PAD * 2, panelH) +
      mediaBlock(x + PAD, y + PAD + panelH + 4, w - PAD * 2, panelH) +
      `<g stroke="${INK.motion}" stroke-width="1.5" fill="none">` +
      `<path d="M ${r(x + w - PAD - 12)} ${r(y + PAD + 6)} L ${r(x + w - PAD - 12)} ${r(y + h - PAD - 6)}" stroke-dasharray="3 3"/>` +
      `<circle cx="${r(x + w - PAD - 12)}" cy="${r(y + h / 2)}" r="3.5" fill="${INK.motion}" stroke="none"/>` +
      `</g>` +
      `<text x="${r(x + w - PAD - 20)}" y="${r(y + h / 2 - 8)}" text-anchor="end" font-size="7" fill="${INK.motion}" font-family="${FONT}">PINNED</text>`
    )
  },

  // vertical sequence with connectors — the rail IS the composition
  timeline: (x, y, w, h) => {
    const railX = x + PAD + 8
    const nodes = Math.max(3, Math.min(5, Math.floor(h / 26)))
    const step = (h - PAD * 2) / Math.max(1, nodes - 1)
    const out: string[] = [
      `<path d="M ${r(railX)} ${r(y + PAD)} L ${r(railX)} ${r(y + h - PAD)}" stroke="${INK.block}" stroke-width="1.5" fill="none"/>`
    ]
    for (let n = 0; n < nodes; n++) {
      const ny = y + PAD + n * step
      out.push(`<circle cx="${r(railX)}" cy="${r(ny)}" r="3.5" fill="${INK.media}"/>`)
      out.push(rect(railX + 12, ny - 5, w * 0.3, 5, INK.label, 2))
      out.push(rect(railX + 12, ny + 3, w * 0.52, 3.5, INK.block, 2))
    }
    return out.join('')
  }
}

const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

/* ---------------------------------------------------------------------------------------------- *
 * Annotations
 * ---------------------------------------------------------------------------------------------- */

/**
 * The motion annotation. Cites the ACTUAL selected primitive by id when one backs the section —
 * "pinned-crossfade", not "a nice scroll effect" — because the whole point of the wireframe gate is
 * that what you approve is what generation will run.
 */
function motionLine(s: WireframeSection, pageMotion: string): { text: string; primitive: boolean } {
  if (s.backing === 'motion-primitive' && s.motionPrimitiveId) {
    return { text: `${s.motionPrimitiveId} — ${s.motion ? clip(s.motion, 58) : `${pageMotion} (page lock)`}`, primitive: true }
  }
  if (s.motion) return { text: clip(s.motion, 76), primitive: false }
  return { text: `${pageMotion} (page lock, no primitive)`, primitive: false }
}

function annotations(s: WireframeSection, x: number, y: number, pageMotion: string): string {
  const out: string[] = []
  const label = (ly: number, k: string, v: string, color: string, mono = false): void => {
    out.push(
      `<text x="${r(x)}" y="${r(ly)}" font-size="8" font-family="${MONO}" fill="${INK.dim}" letter-spacing="0.06em">${esc(k)}</text>`
    )
    out.push(
      `<text x="${r(x + 46)}" y="${r(ly)}" font-size="10.5" font-family="${mono ? MONO : FONT}" fill="${color}">${esc(v)}</text>`
    )
  }

  // title row: name · composition · what backs it
  out.push(
    `<text x="${r(x)}" y="${r(y + 11)}" font-size="12.5" font-family="${FONT}" font-weight="600" fill="${INK.label}">${esc(s.name)}</text>`
  )
  out.push(
    `<text x="${r(x)}" y="${r(y + 25)}" font-size="9.5" font-family="${MONO}" fill="${INK.dim}">${esc(s.composition)} · ${esc(s.label)}</text>`
  )

  let ly = y + 42
  label(ly, 'PURPOSE', clip(s.intent, 74), INK.text)
  ly += 14
  if (s.media) {
    label(ly, 'MEDIA', clip(s.media, 74), INK.text)
    ly += 14
  }
  const m = motionLine(s, pageMotion)
  label(ly, 'MOTION', m.text, m.primitive ? INK.motion : INK.text, m.primitive)
  return out.join('')
}

/* ---------------------------------------------------------------------------------------------- *
 * Render
 * ---------------------------------------------------------------------------------------------- */

/**
 * Render the wireframe as a standalone SVG string.
 *
 * NOTE ON MOOD: mood is a PAGE-level property in the model (`Wireframe.mood`), not a per-section one.
 * It is rendered once in the header rather than repeated on every band — stamping it per section would
 * either duplicate the same tags N times or imply a per-section mood the plan never decided.
 */
export function renderWireframeSvg(wf: Wireframe): string {
  const bands = wf.sections.map(bandHeight)
  const pageH = bands.reduce((a, b) => a + b + BAND_GAP, 0) - BAND_GAP
  const height = HEADER_H + pageH + PAGE_X

  const out: string[] = []
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${r(height)}" viewBox="0 0 ${WIDTH} ${r(height)}" role="img" aria-label="Wireframe for ${esc(wf.brand)}">`
  )
  out.push(
    `<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<rect width="6" height="6" fill="${INK.band}"/>` +
      `<line x1="0" y1="0" x2="0" y2="6" stroke="${INK.media}" stroke-width="1" opacity="0.45"/>` +
      `</pattern></defs>`
  )
  out.push(rect(0, 0, WIDTH, height, INK.page, 0))

  // header
  out.push(
    `<text x="${PAGE_X}" y="24" font-size="14" font-family="${FONT}" font-weight="700" fill="${INK.label}">${esc(wf.brand)}</text>`
  )
  out.push(
    `<text x="${PAGE_X}" y="40" font-size="10" font-family="${MONO}" fill="${INK.dim}">` +
      `${esc(wf.mood.join(' / '))} · ${esc(wf.archetype)} · motion: ${esc(wf.motion)} · palette: ${esc(wf.paletteName)}` +
      `</text>`
  )
  out.push(
    `<line x1="${PAGE_X}" y1="${HEADER_H - 12}" x2="${WIDTH - PAGE_X}" y2="${HEADER_H - 12}" stroke="${INK.rule}" stroke-width="1"/>`
  )

  // bands
  let y = HEADER_H
  wf.sections.forEach((s, i) => {
    const h = bands[i]
    out.push(rect(PAGE_X, y, PAGE_W, h, INK.band, 3, ` stroke="${INK.bandStroke}" stroke-width="1"`))
    const arrange = ARRANGE[s.composition] ?? ARRANGE.editorial
    out.push(arrange(PAGE_X, y, PAGE_W, h, i))
    out.push(annotations(s, ANNO_X, y, wf.motion))
    y += h + BAND_GAP
  })

  out.push('</svg>')
  return out.join('\n')
}
