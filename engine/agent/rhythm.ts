/**
 * The page RHYTHM plan — the vertical-pacing equivalent of the ShotPlan.
 *
 * WHY THIS EXISTS
 *
 * Sections are generated independently. Each one is handed its own intent, composition and evidence,
 * and each comes back individually reasonable — and the page still reads as parts glued together.
 * That is not a section-quality problem, it is a SEQUENCE problem: nothing in the system was ever
 * deciding that section 3 should be tight and busy so that section 4 can be quiet and enormous.
 * Every section defaulted to the same locked padding and the same heading scale, so the page had a
 * uniform pulse from top to bottom, and a uniform pulse reads as flat no matter how good the parts.
 *
 * Contrast cannot be discovered section-locally. A section has no idea what came before it, so it
 * cannot know whether the page needs it to breathe or to compress. Only a page-level decision can
 * know that. The ShotPlan already proved this shape works — imagery is the one thing we decide across
 * the whole page, and imagery is our most coherent output. This applies the same discipline to space.
 *
 * DERIVED, NOT PROMPTED
 *
 * The plan is computed from what the planner already committed to (emphasis, composition, position)
 * by pure functions, then stamped onto the section root as a class. No model is asked to comply,
 * because a rhythm the model can ignore is not a rhythm — that is the same lesson the device library
 * taught: knowledge is worth what it is enforced at.
 */
import type { Composition } from '../types.js'
import type { Emphasis, SectionPlan } from './types.js'

/** How much vertical room a section takes, relative to the locked section-pad. */
export const DENSITIES = ['tight', 'normal', 'open'] as const
export type Density = (typeof DENSITIES)[number]

/** How loudly a section's heading speaks, relative to the locked type scale. */
export const VOLUMES = ['quiet', 'normal', 'loud'] as const
export type Volume = (typeof VOLUMES)[number]

export interface RhythmBeat {
  density: Density
  volume: Volume
}

export interface RhythmPlan {
  /** aligned by index with plan.sections */
  beats: RhythmBeat[]
  /** the ONE section that gets the page's biggest moment of space and scale */
  peakIndex: number
}

/** Multipliers on the locked section padding. Bounded so rhythm bends the system, never breaks it. */
export const DENSITY_PAD: Record<Density, number> = { tight: 0.6, normal: 1, open: 1.5 }

/** Multipliers on the locked display scale for a section's own heading. */
export const VOLUME_SCALE: Record<Volume, number> = { quiet: 0.82, normal: 1, loud: 1.32 }

/** Compositions that inherently want room — forcing these tight fights what the section is doing. */
const WANTS_ROOM: ReadonlySet<Composition> = new Set(['cinematic', 'immersive', 'gallery'])
/** Compositions that inherently want compression — an information grid gains nothing from air. */
const WANTS_COMPRESSION: ReadonlySet<Composition> = new Set(['modular', 'timeline'])

const EMPHASIS_RANK: Record<Emphasis, number> = { sm: 0, md: 1, lg: 2, xl: 3 }

/**
 * Build the rhythm for a page.
 *
 * Three rules, in priority order:
 *
 *  1. ONE PEAK. The highest-emphasis section (earliest wins ties) becomes the page's biggest moment:
 *     open and loud. Exactly one, for the same reason there is exactly one dominant image — a page
 *     with three climaxes has none.
 *
 *  2. NO RUN OF THREE. Three consecutive sections at the same density is the uniform pulse this
 *     whole module exists to break, so the third is pushed the other way. This is the rule that
 *     actually creates contrast, and it is the one no section-local decision could ever make.
 *
 *  3. COMPOSITION FIT. Within those constraints, a cinematic section leans open and a modular one
 *     leans tight, so the rhythm agrees with what each section is already trying to do.
 *
 * Volume tracks density but never doubles it: a tight section is quiet, an open one is not
 * automatically loud. Loudness is reserved for the peak and for genuinely high-emphasis sections, so
 * the page has one clear scale jump rather than a shouting match.
 */
export function planRhythm(sections: SectionPlan[]): RhythmPlan {
  if (!sections.length) return { beats: [], peakIndex: 0 }

  // Rule 1 — find the single peak.
  let peakIndex = 0
  for (let i = 1; i < sections.length; i++) {
    if (EMPHASIS_RANK[sections[i]!.emphasis] > EMPHASIS_RANK[sections[peakIndex]!.emphasis]) peakIndex = i
  }

  const beats: RhythmBeat[] = []
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!

    if (i === peakIndex) {
      beats.push({ density: 'open', volume: 'loud' })
      continue
    }

    // Rule 3 — the section's own nature is the starting point.
    let density: Density = 'normal'
    if (WANTS_ROOM.has(s.composition)) density = 'open'
    else if (WANTS_COMPRESSION.has(s.composition)) density = 'tight'
    else if (EMPHASIS_RANK[s.emphasis] <= 0) density = 'tight'
    else if (EMPHASIS_RANK[s.emphasis] >= 2) density = 'open'

    // Rule 2 — break any run of three. Checked against what we have actually emitted, so the
    // correction cannot itself start a new run.
    const prev = beats[i - 1]?.density
    const prev2 = beats[i - 2]?.density
    if (prev && prev === prev2 && prev === density) {
      density = density === 'tight' ? 'normal' : density === 'open' ? 'normal' : 'open'
    }

    // Volume follows density, but 'loud' belongs to the PEAK ALONE.
    //
    // This previously also promoted any non-adjacent open section with lg/xl emphasis, and a real
    // run duly shipped two loud headings — which is the same failure as two dominant images: a page
    // with two scale jumps has none, because each one destroys the other's contrast. The peak is the
    // page's one moment of scale, so everything else tops out at normal.
    const volume: Volume = density === 'tight' ? 'quiet' : 'normal'

    beats.push({ density, volume })
  }

  return { beats, peakIndex }
}

/**
 * The rhythm CSS. Emitted once per run alongside the theme, so a beat is a class the writer stamps
 * rather than a number a section has to be trusted with.
 *
 * Padding multiplies the run's committed --section-pad, so rhythm scales WITH the register/mood
 * density rather than overriding it — a tight beat on an editorial page is still roomier than an
 * open beat on a developer tool, which is exactly right.
 */
export function rhythmCss(): string {
  // Padding is stamped directly. Volume works by rescaling the --h2 custom property on the section
  // root: h2's own rule is `font-size: var(--h2) !important`, so this is the ONLY thing that can
  // move a heading — a per-section utility class still cannot.
  const pad = (d: Density) => `.rhythm-${d} { padding-block: calc(var(--section-pad) * ${DENSITY_PAD[d]}); }`
  const vol = (v: Volume) => `.vol-${v} { --h2: calc(var(--h2-base) * ${VOLUME_SCALE[v]}); }`
  return `
/*
 * PAGE RHYTHM — per-section pacing decided once for the whole page (see rhythm.ts). Padding is a
 * multiplier on the committed --section-pad so the register's density still leads; this only sets
 * the CONTRAST between neighbours, which is the part no section could decide for itself.
 */
${DENSITIES.map(pad).join('\n')}
${VOLUMES.map(vol).join('\n')}
`
}

/** Human-readable one-liner for the run log, so the page's pulse is visible without opening it. */
export function describeRhythm(r: RhythmPlan): string {
  const glyph: Record<Density, string> = { tight: '▁', normal: '▄', open: '█' }
  return `${r.beats.map((b) => glyph[b.density]).join('')}  peak@${r.peakIndex}`
}
