/**
 * Moodboard assembly — the presentation half of the approval checkpoint.
 *
 * This step SYNTHESIZES NOTHING. Every value here was already committed and validated upstream by
 * artDirect: the palette (repaired for contrast), the locked motion language, the locked interaction
 * spec, and the locked type pairing. Assembling rather than re-deciding is the point — if the
 * moodboard could invent a value, the thing you approve would no longer be the thing that ships.
 *
 * Pure + deterministic: no LLM, no retrieval, no I/O.
 */

import { contrastRatio } from './color.js'
import { paletteName } from './wireframe.js'
import type { ArtDirection, InteractionSpec, Palette, TypographySpec } from './art-direction.js'
import type { MotionLanguage } from '../types.js'
import type { Mood, Plan } from './types.js'

/** One palette entry, with the role it plays and its measured contrast against the background. */
export interface Swatch {
  /** the token name as it appears in globals.css, e.g. 'mutedForeground' */
  token: keyof Palette
  hex: string
  /** what this colour is for — why it exists, not what it looks like */
  role: string
  /**
   * Measured contrast against the page background, to 2dp. `null` for the background itself (a colour
   * has no meaningful contrast with itself). These are the REAL post-repair numbers — artDirect
   * already forced text tokens above their floors, so this is a receipt, not a promise.
   */
  contrastOnBackground: number | null
}

export interface Moodboard {
  brand: string
  mood: Mood[]
  /** cosmetic palette name derived from the accent hue, e.g. 'Ember' */
  paletteName: string
  swatches: Swatch[]
  typography: TypographySpec
  interactions: InteractionSpec
  /** the ONE locked motion language governing every section */
  motion: MotionLanguage
  /** artDirect's one-line reasoning for the palette/motion/interaction logic */
  rationale: string
  /** deterministic repairs artDirect applied to the model's output — surfaced, never hidden */
  adjustments: string[]
  /** the guideline/critique names that anchored the synthesis */
  anchors: string[]
}

/**
 * Role copy per token. Ordered so the moodboard reads as a hierarchy (surfaces → text → brand),
 * not as an alphabetical dump of a TypeScript interface.
 */
const ROLES: Array<[keyof Palette, string]> = [
  ['background', 'page surface — everything sits on this'],
  ['card', 'raised surface for grouped content'],
  ['secondary', 'subtle fill for quiet blocks'],
  ['border', 'hairline separation, never structure'],
  ['foreground', 'primary body + heading text'],
  ['mutedForeground', 'secondary text and captions'],
  ['cardForeground', 'text on a raised surface'],
  ['accent', "the brand's signature colour"],
  ['accentForeground', 'text on the accent'],
  ['primary', 'primary action / emphasis'],
  ['primaryForeground', 'text on primary']
]

/** Swatches in presentation order, each carrying its real measured contrast on the background. */
export function paletteSwatches(palette: Palette): Swatch[] {
  return ROLES.map(([token, role]) => ({
    token,
    hex: palette[token],
    role,
    contrastOnBackground:
      token === 'background' ? null : Math.round(contrastRatio(palette[token], palette.background) * 100) / 100
  }))
}

/**
 * Assemble the moodboard from the locked art direction. Pure presentation — every field is copied
 * from data that was already committed and repaired upstream.
 */
export function buildMoodboard(plan: Plan, art: ArtDirection): Moodboard {
  return {
    brand: plan.brand,
    mood: plan.mood,
    paletteName: paletteName(art.palette.accent),
    swatches: paletteSwatches(art.palette),
    typography: art.typography,
    interactions: art.interactions,
    motion: art.motion,
    rationale: art.rationale,
    adjustments: art.adjustments,
    anchors: art.anchors
  }
}
