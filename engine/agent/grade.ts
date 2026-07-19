/**
 * THE IMAGE GRADE — one look for every photograph on the page.
 *
 * WHY
 *
 * The page commits a visual WORLD (light, lens, texture) and, since imagery moved to stock-first,
 * none of it reaches the images. `world.light` / `.lens` / `.texture` only ever built Flux prompt
 * strings; `fetchUnsplash` never receives the world at all. So the one thing holding a page's
 * photographs together stopped applying to the photographs.
 *
 * Stock makes that worse by construction: search returns different photographers, and the dedupe
 * deliberately picks a DIFFERENT one for each slot, so every image on the page arrives with its own
 * colour temperature, contrast curve and grade.
 *
 * This is exactly the problem a colourist solves, and the solution is the same one film uses: pass
 * every frame through one grade. A committed grade cannot make a bad photograph good, but it makes
 * eight unrelated photographs read as one set — which is most of what "coherent imagery" means.
 *
 * Applied to EVERY image, not just staged ones, because a single ungraded photo is what breaks the
 * illusion. Deliberately restrained: this is a grade, not a filter — anything strong enough to be
 * noticed as an effect is too strong.
 */
import type { Palette } from './art-direction.js'

export const GRADES = ['none', 'warm', 'cool', 'bleach', 'contrast', 'duotone'] as const
export type Grade = (typeof GRADES)[number]

export interface GradeSpec {
  grade: Grade
  /** 0-1, how far the grade is pushed. Kept low by default; a visible filter reads as a preset. */
  strength: number
}

/**
 * Derive the grade from the world the page already committed to, rather than adding another
 * decision. The light phrase is the strongest signal a colourist would use, so it is what is read.
 */
export function gradeFor(light: string, texture: string, mood: string[]): GradeSpec {
  const l = `${light} ${texture}`.toLowerCase()
  const warm = /warm|golden|amber|sunset|firelight|candle|tungsten|late afternoon|dawn|dusk/.test(l)
  const cool = /cool|blue|overcast|shade|north light|fluorescent|moon|dusk blue|clinical/.test(l)
  const hard = /hard|harsh|direct|contrast|noon|spotlit|dramatic/.test(l)
  const soft = /soft|diffused|even|flat|muted|hazy|fog|mist/.test(l)

  if (warm) return { grade: 'warm', strength: soft ? 0.5 : 0.65 }
  if (cool) return { grade: 'cool', strength: soft ? 0.5 : 0.65 }
  if (hard) return { grade: 'contrast', strength: 0.6 }
  if (mood.includes('brutalist') || mood.includes('technical')) return { grade: 'bleach', strength: 0.55 }
  if (soft) return { grade: 'bleach', strength: 0.4 }
  return { grade: 'contrast', strength: 0.45 }
}

export const describeGrade = (g: GradeSpec): string =>
  g.grade === 'none' ? 'none' : `${g.grade} @ ${Math.round(g.strength * 100)}%`

/**
 * Emit the grade.
 *
 * Two selectors on purpose. `.shot-*` is the class the writer stamps on staged images, but it is
 * skipped when a section has no beat or when a wrapper already carries the aspect — so a bare `img`
 * rule closes the gap. One ungraded photograph among seven graded ones is more conspicuous than no
 * grade at all.
 *
 * Values are interpolated at low strength so the result reads as a house look rather than a filter.
 */
export function gradeCss(spec: GradeSpec, palette: Palette): string {
  if (spec.grade === 'none') return '\n/* image grade: none committed — photographs render untouched. */\n'
  const s = Math.max(0, Math.min(1, spec.strength))
  const mix = (from: number, to: number): string => (from + (to - from) * s).toFixed(3)

  // sepia+hue-rotate is how a warm/cool cast is applied without destroying skin tones the way a flat
  // tint does: sepia unifies the colour temperature, hue-rotate steers where it lands.
  const filters: Record<Exclude<Grade, 'none'>, string> = {
    warm: `saturate(${mix(1, 0.86)}) contrast(${mix(1, 1.06)}) sepia(${mix(0, 0.22)}) hue-rotate(-8deg) brightness(${mix(1, 0.985)})`,
    cool: `saturate(${mix(1, 0.82)}) contrast(${mix(1, 1.07)}) sepia(${mix(0, 0.14)}) hue-rotate(175deg) brightness(${mix(1, 1.01)})`,
    bleach: `saturate(${mix(1, 0.55)}) contrast(${mix(1, 1.1)}) brightness(${mix(1, 1.02)})`,
    contrast: `saturate(${mix(1, 0.94)}) contrast(${mix(1, 1.14)}) brightness(${mix(1, 0.98)})`,
    duotone: `grayscale(1) contrast(${mix(1, 1.12)})`
  }

  // A duotone needs a colour layer over the desaturated image; the accent is the only hue the page
  // has committed to, so it is the only defensible choice.
  const duotoneLayer =
    spec.grade === 'duotone'
      ? `
/* The accent tints the greyscale image. Sits on the wrapper so it never intercepts a click. */
.shot-establishing, .shot-wide, .shot-medium, .shot-detail, .shot-macro { position: relative; }
.grade-duotone-layer::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: ${palette.accent}; mix-blend-mode: color; opacity: ${(s * 0.55).toFixed(2)};
}`
      : ''

  return `
/*
 * IMAGE GRADE — committed once for this page (${describeGrade(spec)}).
 *
 * Every photograph passes through one grade, the way a film passes every frame through one. Stock
 * search returns a different photographer for each slot, so without this a page carries eight
 * unrelated colour temperatures. The grade cannot improve a photograph; it makes unrelated ones read
 * as a set.
 *
 * Applied to bare img as well as the staged .shot-* classes, because one ungraded photo among seven
 * graded ones is more conspicuous than no grade at all.
 */
img,
.shot-establishing, .shot-wide, .shot-medium, .shot-detail, .shot-macro,
.dev-stage-media {
  filter: ${filters[spec.grade]};
}
/* Never grade an inline SVG, an icon, or a logo wordmark — the grade is for photographs. */
svg, img[src$=".svg"], .c-tile img, .dev-logo-wall img { filter: none; }
${duotoneLayer}
`
}

/**
 * Style terms appended to a STOCK search query so the returned photographs already lean toward the
 * committed world before the grade touches them. Search is a blunt instrument, but a query that says
 * "soft overcast light" returns a visibly different set than one that does not, and the grade has
 * less work to do.
 */
export function stockStyleTerms(light: string, texture: string): string {
  const pick = (s: string, words: string[]): string[] => words.filter((w) => s.toLowerCase().includes(w))
  const l = `${light} ${texture}`
  const terms = [
    ...pick(l, ['warm', 'golden', 'soft', 'overcast', 'diffused', 'hazy', 'moody', 'dark', 'bright', 'natural']),
    ...pick(l, ['grain', 'matte', 'film'])
  ]
  return [...new Set(terms)].slice(0, 3).join(' ')
}
