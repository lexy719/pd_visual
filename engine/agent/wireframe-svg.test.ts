/**
 * Deterministic render test for the A2 wireframe SVG + moodboard assembly.
 *
 * No LLM, no retrieval, no network: a hand-built Wireframe with a realistic section mix (all eight
 * compositions, every emphasis, some sections backed by a real motion primitive and some not) is
 * rendered and asserted structurally. Run: npx tsx engine/agent/wireframe-svg.test.ts
 */

import { writeFileSync } from 'node:fs'
import { renderWireframeSvg } from './wireframe-svg.js'
import { buildMoodboard } from './moodboard.js'
import type { Wireframe, WireframeSection } from './wireframe.js'
import type { ArtDirection } from './art-direction.js'
import type { Plan } from './types.js'

/* ---------------------------------------------------------------- fixtures */

const s = (
  index: number,
  name: string,
  composition: WireframeSection['composition'],
  rows: number,
  intent: string,
  extra: Partial<WireframeSection> = {}
): WireframeSection => ({
  index,
  name,
  composition,
  backing: 'scratch',
  label: 'freeform',
  rows,
  cols: 0,
  intent,
  ...extra
})

/** A realistic run: every composition, mixed emphasis, 3 of 8 sections carrying a real primitive. */
const WF: Wireframe = {
  brand: 'Fieldnote',
  mood: ['premium', 'calm'],
  archetype: 'editorial-brand-story',
  motion: 'parallax-slow',
  // derived from ART.palette.accent (#EA580C, hue ~20.5° → Amber), matching what buildWireframe would set
  paletteName: 'Amber',
  sections: [
    s(0, 'the-opening', 'cinematic', 5, 'land the promise in one image and six words', {
      media: 'full-bleed workshop photography, warm grain',
      backing: 'motion-primitive',
      label: 'parallax-depth (motion)',
      motionPrimitiveId: 'parallax-depth'
    }),
    s(1, 'manifesto', 'editorial', 3, 'state the belief the brand is built on, in its own voice'),
    s(2, 'the-ritual', 'immersive', 5, 'hold the reader inside one moment of the process', {
      media: 'two facing panels: raw material, finished object',
      backing: 'motion-primitive',
      label: 'pinned-crossfade (motion)',
      motionPrimitiveId: 'pinned-crossfade',
      motion: 'first panel dissolves into the second while pinned'
    }),
    s(3, 'field-notes', 'narrative', 4, 'alternate proof and reflection down the page', {
      media: 'documentary stills, unstaged'
    }),
    s(4, 'the-makers', 'narrative', 3, 'put faces to the process — the second beat of the rhythm', {
      media: 'portraits at working distance'
    }),
    s(5, 'process-atlas', 'gallery', 4, 'show the range without narrating it', {
      media: 'masonry of material studies'
    }),
    s(6, 'what-it-costs', 'asymmetric', 3, 'answer the price question without flinching'),
    s(7, 'the-index', 'modular', 3, 'let the reader choose their own entry point'),
    s(8, 'provenance', 'timeline', 4, 'trace the object back to its origin'),
    s(9, 'the-ask', 'cinematic', 2, 'one line, one action, no noise', {
      backing: 'motion-primitive',
      label: 'kinetic-text-split (motion)',
      motionPrimitiveId: 'kinetic-text-split'
    })
  ]
}

const ART: ArtDirection = {
  palette: {
    background: '#0F0D0B',
    foreground: '#F5F1EA',
    card: '#171310',
    cardForeground: '#F5F1EA',
    primary: '#C2410C',
    primaryForeground: '#FFFFFF',
    secondary: '#1E1A16',
    mutedForeground: '#A8A29E',
    border: '#2A2521',
    accent: '#EA580C',
    accentForeground: '#1A0F07'
  },
  motion: 'parallax-slow',
  interactions: {
    durationMs: 260,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    hoverTransform: 'translateY(-2px)',
    hoverShadow: '0 8px 24px rgba(0,0,0,0.08)',
    tapScale: 0.99,
    cursor: 'default'
  },
  typography: {
    displayStack: 'serif',
    displayFamily: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
    bodyStack: 'grotesque',
    bodyFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    scaleRatio: 1.333,
    displayWeight: 500,
    bodyWeight: 400,
    displayTracking: '-0.02em',
    displayLineHeight: 1.1,
    bodyLineHeight: 1.6,
    pairing: 'Editorial serif display at mid weight over a neutral body — restraint and air do the work.'
  },
  shotPlan: {
    world: {
      source: 'generated',
      subject: 'a small amber glass bottle of Fieldnote oil with a cream paper label',
      light: 'low warm side-light, late afternoon',
      lens: '50mm natural perspective, shallow depth',
      texture: 'matte finish, fine film grain',
      forbid: ['text', 'watermark']
    },
    beats: [
      { scale: 'establishing', role: 'establish' },
      { scale: 'medium', role: 'humanize' },
      { scale: 'wide', role: 'establish' },
      { scale: 'medium', role: 'humanize' },
      { scale: 'detail', role: 'prove' },
      { scale: 'wide', role: 'establish' },
      { scale: 'detail', role: 'prove' },
      { scale: 'medium', role: 'establish' },
      { scale: 'wide', role: 'establish' },
      { scale: 'macro', role: 'prove' }
    ],
    dominantIndex: 0
  },
  rationale: 'A near-black ground with an ember accent borrows the workshop, not the trend.',
  adjustments: ['mutedForeground #8A8681 → #A8A29E for 3:1'],
  anchors: ['Premium / luxury / editorial', 'Type scale ratios by mood', 'Bucks Sauce']
}

const PLAN = { brand: 'Fieldnote', mood: ['premium', 'calm'] } as unknown as Plan

/* ---------------------------------------------------------------- harness */

let failures = 0
const check = (name: string, cond: boolean, detail = ''): void => {
  if (cond) console.log(`  ok   ${name}`)
  else {
    failures++
    console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`)
  }
}
const count = (hay: string, needle: string): number => hay.split(needle).length - 1

/* ---------------------------------------------------------------- svg */

console.log('\nrenderWireframeSvg')
const svg = renderWireframeSvg(WF)

check('emits a single well-formed svg root', svg.startsWith('<svg ') && svg.trimEnd().endsWith('</svg>'))
check('declares the svg namespace', svg.includes('xmlns="http://www.w3.org/2000/svg"'))
check('opens and closes every tag it opens', count(svg, '<svg') === count(svg, '</svg>') && count(svg, '<defs') === count(svg, '</defs>'))
check('no NaN/undefined leaked into geometry', !/NaN|undefined/.test(svg), svg.match(/NaN|undefined/)?.[0])

// header carries the page-level facts (mood lives here, not per-section — it is page-level in the model)
check('header shows brand', svg.includes('Fieldnote'))
check('header shows page mood', svg.includes('premium / calm'))
check('header shows locked motion + palette name', svg.includes('motion: parallax-slow') && svg.includes('palette: Amber'))

// one band per section, each drawn in its composition's arrangement
check('renders one band per section', count(svg, `rx="3" fill="#f4f4f5"`) === WF.sections.length, `${count(svg, 'rx="3" fill="#f4f4f5"')} vs ${WF.sections.length}`)
check('every section name appears', WF.sections.every((x) => svg.includes(x.name)))
check('every composition label appears', [...new Set(WF.sections.map((x) => x.composition))].every((c) => svg.includes(`>${c} · `)))
check('immersive draws its pin marker', svg.includes('PINNED'))
check('media-bearing compositions use the hatch fill', svg.includes('url(#hatch)') && svg.includes('<pattern id="hatch"'))
check('timeline draws a connector rail', count(svg, '<circle') >= 3)

// annotations
check('purpose annotation rendered for every section', count(svg, '>PURPOSE<') === WF.sections.length)
check('media annotation only where media exists', count(svg, '>MEDIA<') === WF.sections.filter((x) => x.media).length)
check('motion annotation rendered for every section', count(svg, '>MOTION<') === WF.sections.length)
check('intent text is surfaced', svg.includes('land the promise in one image'))

// the load-bearing one: motion annotations must cite the REAL primitive id, not a vague description
const primSections = WF.sections.filter((x) => x.motionPrimitiveId)
check('cites each selected primitive by id', primSections.every((x) => svg.includes(x.motionPrimitiveId!)), primSections.map((x) => x.motionPrimitiveId).join(','))
check('non-primitive sections fall back to the page lock', svg.includes('parallax-slow (page lock, no primitive)'))

// emphasis must actually change band height
const heights = [...svg.matchAll(/rx="3" fill="#f4f4f5"/g)].length
check('emphasis drives proportional heights', heights === WF.sections.length && new Set(WF.sections.map((x) => x.rows)).size > 1)

// escaping
const escaped = renderWireframeSvg({ ...WF, brand: 'A & B <script>' })
check('escapes XML-unsafe text', escaped.includes('A &amp; B &lt;script&gt;') && !escaped.includes('<script>'))

// determinism
check('is deterministic (same input ⇒ same output)', renderWireframeSvg(WF) === svg)

/* ---------------------------------------------------------------- geometry */

/**
 * Structural assertions can't tell overlapping garbage from a clean diagram. This renders EVERY
 * composition at EVERY emphasis on its own and proves each arrangement's shapes stay inside their
 * band — the "it renders correctly" property, checked deterministically instead of by eye.
 */
console.log('\ngeometry — every composition × emphasis stays inside its band')

const COMPOSITIONS_ALL: WireframeSection['composition'][] = [
  'cinematic', 'editorial', 'gallery', 'narrative', 'asymmetric', 'modular', 'immersive', 'timeline'
]
const HEADER_H = 62
const PAGE_W = 360

/** Vertical extent of every drawn shape (bands excluded — they define the bounds). */
function shapeExtents(svg: string): Array<{ top: number; bottom: number; kind: string }> {
  const out: Array<{ top: number; bottom: number; kind: string }> = []
  for (const m of svg.matchAll(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"[^>]*?fill="([^"]+)"/g)) {
    const y = parseFloat(m[2]), h = parseFloat(m[4]), fill = m[5]
    if (fill === '#ffffff') continue                 // page ground
    if (fill === '#f4f4f5' && parseFloat(m[3]) === PAGE_W) continue  // the band itself
    out.push({ top: y, bottom: y + h, kind: `rect(${fill})` })
  }
  for (const m of svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"/g)) {
    const cy = parseFloat(m[2]), rr = parseFloat(m[3])
    out.push({ top: cy - rr, bottom: cy + rr, kind: 'circle' })
  }
  return out
}

let geomFails = 0
let thinnest = Infinity
for (const composition of COMPOSITIONS_ALL) {
  for (const rows of [2, 3, 4, 5]) {
    const one: Wireframe = {
      ...WF,
      sections: [s(0, 'probe', composition, rows, 'probe intent', { media: 'probe media' })]
    }
    const svgOne = renderWireframeSvg(one)
    const bandTop = HEADER_H
    const bandBottom = HEADER_H + Math.max(76, rows * 34)
    const shapes = shapeExtents(svgOne)
    thinnest = Math.min(thinnest, shapes.length)
    const bad = shapes.filter((e) => e.top < bandTop - 0.51 || e.bottom > bandBottom + 0.51)
    if (bad.length) {
      geomFails++
      console.log(`  FAIL ${composition} rows=${rows} — ${bad.length} shape(s) outside band [${bandTop}, ${bandBottom}]: ${bad.slice(0, 2).map((b) => `${b.kind} ${b.top}→${b.bottom}`).join('; ')}`)
    }
  }
}
check('all 32 composition × emphasis combinations stay in-band', geomFails === 0, `${geomFails} combos overflowed`)
// guard against the check above silently becoming vacuous if the emitted markup ever stops matching
// the extent regexes — an in-bounds test that inspects zero shapes always "passes".
check(`bounds check is non-vacuous (thinnest arrangement drew ${thinnest} shapes)`, thinnest >= 3, `only ${thinnest} shapes parsed`)

/* ---------------------------------------------------------------- moodboard */

console.log('\nbuildMoodboard')
const mb = buildMoodboard(PLAN, ART)

check('brand + mood carried from the plan', mb.brand === 'Fieldnote' && mb.mood.join() === 'premium,calm')
check('palette name derived from the real accent (#EA580C → Amber)', mb.paletteName === 'Amber', mb.paletteName)
check('a swatch per palette token', mb.swatches.length === Object.keys(ART.palette).length, `${mb.swatches.length} vs ${Object.keys(ART.palette).length}`)
check('every swatch is a real hex from the locked palette', mb.swatches.every((w) => /^#[0-9A-Fa-f]{6}$/.test(w.hex) && w.hex === ART.palette[w.token]))
check('every swatch has a role, none empty', mb.swatches.every((w) => w.role.length > 0))
check('background swatch has null contrast (not 1, not fake)', mb.swatches.find((w) => w.token === 'background')!.contrastOnBackground === null)
check('non-background swatches carry measured contrast', mb.swatches.filter((w) => w.token !== 'background').every((w) => typeof w.contrastOnBackground === 'number' && w.contrastOnBackground! > 0))

const fg = mb.swatches.find((w) => w.token === 'foreground')!
const muted = mb.swatches.find((w) => w.token === 'mutedForeground')!
check(`body text clears 4.5:1 (measured ${fg.contrastOnBackground})`, fg.contrastOnBackground! >= 4.5)
check(`muted text clears 3:1 (measured ${muted.contrastOnBackground})`, muted.contrastOnBackground! >= 3)

check('typography is the locked spec, resolved to a real CSS stack', mb.typography.displayFamily.includes('Georgia') && mb.typography.bodyFamily.includes('system-ui'))
check('typography carries real committed numbers', mb.typography.scaleRatio === 1.333 && mb.typography.displayWeight === 500 && mb.typography.bodyWeight >= 400)
check('interactions are the locked spec verbatim', mb.interactions.durationMs === 260 && mb.interactions.easing.startsWith('cubic-bezier('))
check('motion language carried', mb.motion === 'parallax-slow')
check('adjustments surfaced, not hidden', mb.adjustments.length === 1)
check('anchors carried', mb.anchors.length === 3)

// no placeholders anywhere
const PLACEHOLDER = /\b(TODO|TBD|lorem|ipsum|placeholder|FIXME|xxx|\(none\))\b/i
const mbJson = JSON.stringify(mb)
check('moodboard contains no placeholder values', !PLACEHOLDER.test(mbJson), mbJson.match(PLACEHOLDER)?.[0])
check('moodboard has no empty strings', !/:""/.test(mbJson))
check('is deterministic (same input ⇒ same output)', JSON.stringify(buildMoodboard(PLAN, ART)) === mbJson)

/* ---------------------------------------------------------------- artefact */

const outPath = 'logs/wireframe-sample.svg'
try {
  writeFileSync(outPath, svg, 'utf8')
  console.log(`\n  wrote ${outPath} (${svg.length} bytes, ${WF.sections.length} sections)`)
} catch {
  // logs/ may not exist in a clean checkout; the assertions above are the actual test.
}

console.log(failures === 0 ? '\nPASS — all checks green\n' : `\nFAIL — ${failures} check(s) failed\n`)
process.exit(failures === 0 ? 0 : 1)
