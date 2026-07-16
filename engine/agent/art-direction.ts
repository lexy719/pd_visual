/**
 * Art-direction step — runs ONCE per generation, between plan and generate.
 *
 * It synthesizes a committed brand PALETTE (real hex, not vague adjectives) grounded in the
 * retrieved color-theory rules for the mood and the *method* of real-site critiques. The palette
 * is then applied DETERMINISTICALLY by the writer (it rewrites globals.css), so no per-section
 * model compliance is needed — every section already consumes the theme tokens.
 *
 * Now covers PALETTE (→ globals.css) + the locked MOTION LANGUAGE (→ gates the motion-primitive
 * tier in retrieval) + the locked INTERACTION and TYPOGRAPHY specs. All are applied deterministically
 * downstream, not by model compliance. Voice is a later phase.
 */

import { completeReasoning, extractJson } from '../llm/llm.js'
import { queryKnowledge } from '../retrieval/query.js'
import type { MotionLanguage, SearchHit } from '../types.js'
import type { Mood, Plan } from './types.js'
import { ensureContrast, hslToHex, isHex, mixHex, readableOn, saturation } from './color.js'

/** The 7 committed values the model synthesizes. The rest are derived deterministically. */
interface RawPalette {
  background: string
  foreground: string
  card: string
  primary: string
  mutedForeground: string
  border: string
  accent: string
}

/** Full palette written into globals.css. */
export interface Palette {
  background: string
  foreground: string
  card: string
  cardForeground: string
  primary: string
  primaryForeground: string
  secondary: string
  mutedForeground: string
  border: string
  accent: string
  accentForeground: string
}

/**
 * The committed hover / cursor / transition contract, locked ONCE per run (like the palette) so every
 * section shares one interaction feel instead of re-interpreting the brief's words. Applied
 * deterministically: the writer emits these values as CSS custom properties + `.mi*` utility classes in
 * globals.css, and sections are told to apply those classes rather than invent their own timings.
 */
export interface InteractionSpec {
  /** hover/press feedback duration in ms (feedback must feel instant: ~120–260) */
  durationMs: number
  /** literal easing — a cubic-bezier(...) or a CSS keyword (never left to the browser default) */
  easing: string
  /** literal hover transform, restricted to translate/scale/rotate/none for safety */
  hoverTransform: string
  /** literal hover box-shadow, or 'none' */
  hoverShadow: string
  /** active/press scale, 0.9–1 */
  tapScale: number
  /** 'default' | 'pointer' | 'not-allowed' */
  cursor: string
}

/**
 * The four font stacks the type lock may choose between. Deliberately a CLOSED set of SYSTEM stacks:
 * nothing is downloaded, so there is no webfont loading step, no licensing question, and no way for a
 * model-proposed family to silently fail to load and degrade to an unintended fallback. The model
 * commits the *character* (ratio / weight / tracking); the family resolves deterministically.
 */
const FONT_STACKS = {
  grotesque: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  condensed: "'Arial Narrow', 'Helvetica Neue', system-ui, sans-serif",
  serif: "Georgia, 'Iowan Old Style', 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
} as const
export type FontStack = keyof typeof FONT_STACKS

/**
 * The committed type pairing, locked ONCE per run like the palette and the interaction spec. Numbers
 * come from knowledge/guidelines/typography.md ("Type scale ratios by mood" / "Line length and rhythm")
 * so the moodboard presents real grounded values rather than adjectives.
 */
export interface TypographySpec {
  displayStack: FontStack
  /** resolved CSS font-family for headings */
  displayFamily: string
  bodyStack: FontStack
  /** resolved CSS font-family for body copy */
  bodyFamily: string
  /** modular step ratio between adjacent type sizes (1.2 quiet → 1.618 extreme) */
  scaleRatio: number
  displayWeight: number
  /** never below 400 — typography.md, "Line length and rhythm" */
  bodyWeight: number
  /** display letter-spacing, e.g. '-0.02em' */
  displayTracking: string
  /** display leading: 0.95–1.2 (as size goes up, leading comes down) */
  displayLineHeight: number
  /** body leading: 1.5–1.65 */
  bodyLineHeight: number
  /** one line: why this display+body pairing fits the brand */
  pairing: string
}

/** How far the camera stands — the vocabulary of the page's visual tempo (image-sequencing.md). */
export const SHOT_SCALES = ['establishing', 'wide', 'medium', 'detail', 'macro'] as const
export type ShotScale = (typeof SHOT_SCALES)[number]

/** The job an image does — media-direction.md's three jobs, reused verbatim rather than re-invented. */
export const SHOT_ROLES = ['establish', 'prove', 'humanize'] as const
export type ShotRole = (typeof SHOT_ROLES)[number]

/**
 * Part A of the shot plan: the ONE visual world every image on the page lives in. This replaces the
 * old imageStyle() suffix as the single source of truth for image prompting — light/lens/texture are
 * committed here once instead of a global "photorealistic" suffix silently fighting per-section
 * media direction.
 */
export interface ShotWorld {
  /**
   * Where images come from. 'generated' = Flux, prompted from the shot plan. 'stock' = keyword
   * search (Unsplash) with Flux fallback — legitimate ONLY for illustrative pages. A page with a
   * recurring subject is FORCED to 'generated': keyword search cannot return the same bottle twice,
   * so stock is disqualified for subject-led pages (image-sequencing.md, subject continuity).
   */
  source: 'generated' | 'stock'
  /**
   * The ONE recurring physical subject, described concretely enough to re-render identically
   * ("a squat amber glass bottle with a cream paper label"), or '' when the brand has none.
   * This exact phrase is reused VERBATIM in every subject-bearing image prompt.
   */
  subject: string
  /** one committed light quality/direction for every image, e.g. "low warm side-light, late afternoon" */
  light: string
  /** one committed lens/perspective language, e.g. "50mm natural perspective, shallow depth" */
  lens: string
  /** one committed finish/grain, e.g. "matte finish, fine film grain" */
  texture: string
  /** things NO image may contain; 'text' and 'watermark' are always enforced */
  forbid: string[]
}

/** Part B: one beat per planned section — the scale and job of that section's imagery. */
export interface ShotBeat {
  scale: ShotScale
  role: ShotRole
}

/**
 * The page-level visual staging lock — the colour-script equivalent: the whole image sequence is
 * decided as ONE artefact, once, and every individual image request derives from it. Locked in
 * artDirect beside palette/motion/interactions/typography and applied deterministically downstream.
 */
export interface ShotPlan {
  world: ShotWorld
  /** aligned by index with plan.sections; text-only sections simply never consume their beat */
  beats: ShotBeat[]
  /** which section carries the page's ONE dominant image (editorial rule: exactly one) */
  dominantIndex: number
}

export interface ArtDirection {
  palette: Palette
  /** the ONE locked motion language for the whole run — gates the motion-primitive tier. */
  motion: MotionLanguage
  /** the ONE locked micro-interaction spec — hover/cursor/transition, applied via globals.css .mi classes. */
  interactions: InteractionSpec
  /** the ONE locked type pairing — presented on the moodboard; system stacks only. */
  typography: TypographySpec
  /** the ONE locked visual staging plan — how the page's images relate as a sequence. */
  shotPlan: ShotPlan
  rationale: string
  /** deterministic adjustments applied to the model output — surfaced in the run summary */
  adjustments: string[]
  /** which guideline/critique names anchored the synthesis (for the receipt) */
  anchors: string[]
}

/** The named easing curves from knowledge/guidelines/micro-interactions.md (kept in sync). */
const EASE = {
  standardOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
  entrance: 'cubic-bezier(0.16, 1, 0.3, 1)',
  mechanical: 'cubic-bezier(0.2, 0, 0, 1)',
  overshoot: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  linear: 'linear'
} as const

/** Per-mood committed defaults — the deterministic fallback + validation anchor for the lock. */
const INTERACTION_BY_MOOD: Record<string, InteractionSpec> = {
  premium: { durationMs: 260, easing: EASE.standardOut, hoverTransform: 'translateY(-2px)', hoverShadow: '0 8px 24px rgba(0,0,0,0.08)', tapScale: 0.99, cursor: 'default' },
  calm: { durationMs: 260, easing: EASE.standardOut, hoverTransform: 'translateY(-2px)', hoverShadow: '0 8px 24px rgba(0,0,0,0.08)', tapScale: 0.99, cursor: 'default' },
  aggressive: { durationMs: 140, easing: EASE.mechanical, hoverTransform: 'translateY(-3px) scale(1.03)', hoverShadow: '0 10px 30px rgba(0,0,0,0.18)', tapScale: 0.97, cursor: 'pointer' },
  playful: { durationMs: 240, easing: EASE.overshoot, hoverTransform: 'scale(1.05)', hoverShadow: '0 10px 28px rgba(0,0,0,0.12)', tapScale: 0.95, cursor: 'pointer' },
  minimal: { durationMs: 160, easing: EASE.standardOut, hoverTransform: 'translateY(-1px)', hoverShadow: 'none', tapScale: 0.99, cursor: 'pointer' },
  technical: { durationMs: 120, easing: EASE.mechanical, hoverTransform: 'none', hoverShadow: 'none', tapScale: 0.99, cursor: 'pointer' },
  brutalist: { durationMs: 60, easing: EASE.linear, hoverTransform: 'none', hoverShadow: 'none', tapScale: 1, cursor: 'default' },
  trustworthy: { durationMs: 200, easing: EASE.standardOut, hoverTransform: 'translateY(-1px)', hoverShadow: '0 6px 18px rgba(0,0,0,0.08)', tapScale: 0.99, cursor: 'pointer' }
}

/** Deterministic committed spec for the plan mood — first matching mood wins, else minimal. */
function interactionForMood(mood: Mood[]): InteractionSpec {
  for (const m of mood) if (INTERACTION_BY_MOOD[m]) return INTERACTION_BY_MOOD[m]
  return INTERACTION_BY_MOOD.minimal
}

const CUBIC_BEZIER = /^cubic-bezier\(\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*,\s*-?\d*\.?\d+\s*\)$/
const EASING_KEYWORDS = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'steps(1, end)', 'steps(1,end)'])
/** hover transform limited to translate/scale/rotate/none — no arbitrary CSS reaches globals.css. */
const SAFE_TRANSFORM = /^(none|(?:(?:translate[XY]?\([-0-9.a-z%]+\)|scale\([0-9.]+\)|rotate\(-?[0-9.]+deg\))\s*)+)$/
const SAFE_SHADOW = /^(none|[-0-9a-z.,()#%/ ]+)$/i

/**
 * Validate + repair the model's interaction spec against the per-mood committed defaults — the same
 * discipline as the palette (never ship a vague or unsafe interaction contract). Each repair is recorded.
 */
function lockInteractions(raw: Partial<InteractionSpec> | undefined, mood: Mood[], adjustments: string[]): InteractionSpec {
  const def = interactionForMood(mood)
  const r = raw ?? {}

  let durationMs = Number(r.durationMs)
  if (!Number.isFinite(durationMs)) { durationMs = def.durationMs }
  else if (durationMs < 40 || durationMs > 600) {
    const clamped = Math.min(600, Math.max(40, Math.round(durationMs)))
    adjustments.push(`interaction duration ${durationMs}ms → ${clamped}ms (clamped)`)
    durationMs = clamped
  } else durationMs = Math.round(durationMs)

  let easing = String(r.easing ?? '').trim()
  if (!(CUBIC_BEZIER.test(easing) || EASING_KEYWORDS.has(easing))) {
    if (easing) adjustments.push(`interaction easing "${easing}" invalid → ${def.easing}`)
    easing = def.easing
  }

  let hoverTransform = String(r.hoverTransform ?? '').trim()
  if (!SAFE_TRANSFORM.test(hoverTransform)) {
    if (hoverTransform) adjustments.push(`interaction hoverTransform "${hoverTransform}" unsafe → ${def.hoverTransform}`)
    hoverTransform = def.hoverTransform
  }

  let hoverShadow = String(r.hoverShadow ?? '').trim()
  if (!hoverShadow || hoverShadow.length > 80 || !SAFE_SHADOW.test(hoverShadow)) hoverShadow = def.hoverShadow

  let tapScale = Number(r.tapScale)
  if (!Number.isFinite(tapScale) || tapScale < 0.9 || tapScale > 1) tapScale = def.tapScale

  const cursorRaw = String(r.cursor ?? '').trim().toLowerCase()
  const cursor = ['default', 'pointer', 'not-allowed'].includes(cursorRaw) ? cursorRaw : def.cursor

  return { durationMs, easing, hoverTransform, hoverShadow, tapScale, cursor }
}

/**
 * Per-mood committed type defaults — the deterministic fallback + validation anchor for the type lock.
 * Every number is lifted from knowledge/guidelines/typography.md ("Type scale ratios by mood" table and
 * the per-mood sections), so the two stay in sync. Notably premium sits at 500 weight, not 800:
 * "restraint reads as expensive; heaviness reads as loud".
 */
const TYPOGRAPHY_BY_MOOD: Record<string, Omit<TypographySpec, 'displayFamily' | 'bodyFamily'>> = {
  aggressive: { displayStack: 'condensed', bodyStack: 'grotesque', scaleRatio: 1.5, displayWeight: 800, bodyWeight: 400, displayTracking: '-0.04em', displayLineHeight: 0.95, bodyLineHeight: 1.5, pairing: 'Condensed sans at extreme weight against a neutral body — violent size jumps, nothing in between.' },
  brutalist: { displayStack: 'grotesque', bodyStack: 'grotesque', scaleRatio: 1.618, displayWeight: 900, bodyWeight: 400, displayTracking: '-0.02em', displayLineHeight: 1.0, bodyLineHeight: 1.5, pairing: 'One grotesque at extreme weights only — deliberately uncomfortable, no second family.' },
  premium: { displayStack: 'serif', bodyStack: 'grotesque', scaleRatio: 1.333, displayWeight: 500, bodyWeight: 400, displayTracking: '-0.02em', displayLineHeight: 1.1, bodyLineHeight: 1.6, pairing: 'Editorial serif display at mid weight over a neutral body — restraint and air do the work.' },
  playful: { displayStack: 'grotesque', bodyStack: 'grotesque', scaleRatio: 1.25, displayWeight: 700, bodyWeight: 400, displayTracking: '-0.01em', displayLineHeight: 1.1, bodyLineHeight: 1.6, pairing: 'One rounded grotesque, bouncy but always readable.' },
  minimal: { displayStack: 'grotesque', bodyStack: 'grotesque', scaleRatio: 1.25, displayWeight: 600, bodyWeight: 400, displayTracking: '-0.03em', displayLineHeight: 1.1, bodyLineHeight: 1.6, pairing: 'One neutral grotesque, disciplined scale, nothing else.' },
  technical: { displayStack: 'mono', bodyStack: 'grotesque', scaleRatio: 1.2, displayWeight: 600, bodyWeight: 400, displayTracking: '-0.02em', displayLineHeight: 1.15, bodyLineHeight: 1.6, pairing: 'Mono display against a neutral body — information density read as a feature.' },
  trustworthy: { displayStack: 'grotesque', bodyStack: 'grotesque', scaleRatio: 1.2, displayWeight: 600, bodyWeight: 400, displayTracking: '-0.01em', displayLineHeight: 1.15, bodyLineHeight: 1.6, pairing: 'A quiet grotesque at a narrow scale — nothing shouts.' },
  calm: { displayStack: 'serif', bodyStack: 'grotesque', scaleRatio: 1.2, displayWeight: 500, bodyWeight: 400, displayTracking: '0em', displayLineHeight: 1.2, bodyLineHeight: 1.65, pairing: 'Soft serif display, sentence case, no tracking games — nothing should jolt.' }
}

function typographyForMood(mood: Mood[]): Omit<TypographySpec, 'displayFamily' | 'bodyFamily'> {
  for (const m of mood) if (TYPOGRAPHY_BY_MOOD[m]) return TYPOGRAPHY_BY_MOOD[m]
  return TYPOGRAPHY_BY_MOOD.minimal
}

const TRACKING = /^-?\d*\.?\d+(em|px)$|^0$/
const isStack = (v: unknown): v is FontStack => typeof v === 'string' && v in FONT_STACKS

/**
 * Validate + repair the model's type pairing against the per-mood committed defaults — same discipline
 * as the palette and the interaction spec. Families come from the closed stack set only, so an
 * unavailable/invented font can never reach the page. Each repair is recorded.
 */
function lockTypography(raw: Partial<TypographySpec> | undefined, mood: Mood[], adjustments: string[]): TypographySpec {
  const def = typographyForMood(mood)
  const r = raw ?? {}

  const displayStack = isStack(r.displayStack) ? r.displayStack : def.displayStack
  if (r.displayStack && !isStack(r.displayStack)) adjustments.push(`type displayStack "${String(r.displayStack)}" not in set → ${def.displayStack}`)
  // body is never condensed — condensed at body size fails the measure/readability rule.
  let bodyStack = isStack(r.bodyStack) ? r.bodyStack : def.bodyStack
  if (bodyStack === 'condensed') {
    adjustments.push('type bodyStack condensed → grotesque (condensed body fails readability)')
    bodyStack = 'grotesque'
  }

  let scaleRatio = Number(r.scaleRatio)
  if (!Number.isFinite(scaleRatio)) scaleRatio = def.scaleRatio
  else if (scaleRatio < 1.1 || scaleRatio > 1.8) {
    const clamped = Math.min(1.8, Math.max(1.1, scaleRatio))
    adjustments.push(`type scaleRatio ${scaleRatio} → ${clamped} (clamped)`)
    scaleRatio = clamped
  }
  scaleRatio = Math.round(scaleRatio * 1000) / 1000

  let displayWeight = Number(r.displayWeight)
  if (!Number.isFinite(displayWeight) || displayWeight < 100 || displayWeight > 900) displayWeight = def.displayWeight
  else displayWeight = Math.min(900, Math.max(100, Math.round(displayWeight / 100) * 100))

  // body weight is a hard floor, not a preference — typography.md: never below 400.
  let bodyWeight = Number(r.bodyWeight)
  if (!Number.isFinite(bodyWeight) || bodyWeight < 400 || bodyWeight > 700) bodyWeight = def.bodyWeight
  else bodyWeight = Math.round(bodyWeight / 100) * 100

  let displayTracking = String(r.displayTracking ?? '').trim()
  if (!TRACKING.test(displayTracking)) {
    if (displayTracking) adjustments.push(`type displayTracking "${displayTracking}" invalid → ${def.displayTracking}`)
    displayTracking = def.displayTracking
  }

  let displayLineHeight = Number(r.displayLineHeight)
  if (!Number.isFinite(displayLineHeight) || displayLineHeight < 0.8 || displayLineHeight > 1.4) displayLineHeight = def.displayLineHeight

  let bodyLineHeight = Number(r.bodyLineHeight)
  if (!Number.isFinite(bodyLineHeight) || bodyLineHeight < 1.3 || bodyLineHeight > 2) bodyLineHeight = def.bodyLineHeight

  const pairing = String(r.pairing ?? '').trim() || def.pairing

  return {
    displayStack,
    displayFamily: FONT_STACKS[displayStack],
    bodyStack,
    bodyFamily: FONT_STACKS[bodyStack],
    scaleRatio,
    displayWeight,
    bodyWeight,
    displayTracking,
    displayLineHeight,
    bodyLineHeight,
    pairing
  }
}

/**
 * Per-mood committed world defaults — the deterministic fallback + validation anchor for the shot
 * lock, same discipline as INTERACTION_BY_MOOD / TYPOGRAPHY_BY_MOOD. One light, one lens, one finish
 * per mood (image-sequencing.md: aesthetic constancy — unpredictable content, one constant world).
 */
const SHOT_WORLD_BY_MOOD: Record<string, Pick<ShotWorld, 'light' | 'lens' | 'texture'>> = {
  premium: { light: 'low warm side-light, late afternoon', lens: '50mm natural perspective, shallow depth', texture: 'matte finish, fine film grain' },
  calm: { light: 'soft diffused daylight', lens: '50mm natural perspective', texture: 'matte, gentle grain' },
  aggressive: { light: 'hard directional light, deep shadows', lens: '35mm close perspective', texture: 'high contrast, crisp' },
  playful: { light: 'bright soft daylight', lens: '35mm approachable perspective', texture: 'clean, lightly saturated' },
  minimal: { light: 'soft even studio light', lens: '50mm neutral perspective', texture: 'clean matte' },
  technical: { light: 'cool even studio light', lens: '50mm neutral perspective', texture: 'clean, precise' },
  trustworthy: { light: 'soft natural window light', lens: '50mm honest perspective', texture: 'neutral, true-to-life' },
  brutalist: { light: 'harsh flat on-camera flash', lens: '28mm wide, confrontational', texture: 'raw, unretouched' }
}

function shotWorldForMood(mood: Mood[]): Pick<ShotWorld, 'light' | 'lens' | 'texture'> {
  for (const m of mood) if (SHOT_WORLD_BY_MOOD[m]) return SHOT_WORLD_BY_MOOD[m]
  return SHOT_WORLD_BY_MOOD.minimal
}

/** Fallback beat scale per composition — used only when the model's beat is missing or invalid. */
const SCALE_BY_COMPOSITION: Record<string, ShotScale> = {
  cinematic: 'wide', editorial: 'medium', gallery: 'medium', narrative: 'medium',
  asymmetric: 'detail', modular: 'detail', immersive: 'wide', timeline: 'medium'
}

const isScale = (v: unknown): v is ShotScale => typeof v === 'string' && (SHOT_SCALES as readonly string[]).includes(v)
const isRole = (v: unknown): v is ShotRole => typeof v === 'string' && (SHOT_ROLES as readonly string[]).includes(v)
/** short free-text world fields: non-empty, single-line, bounded */
const worldField = (v: unknown, fallback: string): string => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim()
  return s && s.length <= 90 ? s : fallback
}

/**
 * Validate + repair the model's shot plan into a committed, rule-conforming ShotPlan — same
 * discipline as the palette: never ship a vague or rule-breaking staging plan. Part C lives here:
 * every rule is enforced deterministically, never left to model compliance. Each repair is recorded.
 */
function lockShotPlan(raw: Partial<ShotPlan> | undefined, plan: Plan, adjustments: string[]): ShotPlan {
  const def = shotWorldForMood(plan.mood)
  // The SYSTEM contract asks for a FLAT shotPlan ({subject, source, light, …, beats}); the internal
  // type nests the world. Accept both, nested winning — reading only raw.world silently dropped every
  // model-committed world field to mood defaults (found on a live run; the beats survived only
  // because they are top-level in both shapes).
  const rw = { ...(raw as Partial<ShotWorld> | undefined), ...(raw?.world ?? {}) } as Partial<ShotWorld>

  const subject = String(rw.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)
  // Rule: a recurring subject disqualifies stock — keyword search cannot return the same object twice.
  let source: ShotWorld['source'] = rw.source === 'stock' || rw.source === 'generated' ? rw.source : 'generated'
  if (subject && source !== 'generated') {
    adjustments.push(`shot source 'stock' → 'generated' (recurring subject "${subject.slice(0, 40)}…" requires a fixed identity)`)
    source = 'generated'
  }

  const forbidRaw = Array.isArray(rw.forbid) ? rw.forbid.map((f) => String(f).trim().toLowerCase()).filter((f) => f && f.length <= 40) : []
  const forbid = [...new Set(['text', 'watermark', ...forbidRaw])].slice(0, 8)

  const world: ShotWorld = {
    source,
    subject,
    light: worldField(rw.light, def.light),
    lens: worldField(rw.lens, def.lens),
    texture: worldField(rw.texture, def.texture),
    forbid
  }

  // Part B: one beat per section, aligned by index.
  const rawBeats = Array.isArray(raw?.beats) ? raw.beats : []
  const beats: ShotBeat[] = plan.sections.map((sec, i) => {
    const rb = (rawBeats[i] ?? {}) as Partial<ShotBeat>
    const scale = isScale(rb.scale) ? rb.scale : (SCALE_BY_COMPOSITION[sec.composition] ?? 'medium')
    const role = isRole(rb.role) ? rb.role : scale === 'detail' || scale === 'macro' ? 'prove' : 'establish'
    return { scale, role }
  })
  if (rawBeats.length !== plan.sections.length) {
    adjustments.push(`shot beats ${rawBeats.length} → ${plan.sections.length} (aligned to section count)`)
  }

  // Part C, rule 1: exactly ONE establishing shot, and it opens the page.
  if (beats.length) {
    if (beats[0].scale !== 'establishing') {
      adjustments.push(`shot beat[0] ${beats[0].scale} → establishing (the page opens the world once)`)
      beats[0] = { scale: 'establishing', role: 'establish' }
    }
    for (let i = 1; i < beats.length; i++) {
      if (beats[i].scale === 'establishing') {
        adjustments.push(`shot beat[${i}] establishing → wide (only the opener establishes)`)
        beats[i] = { ...beats[i], scale: 'wide' }
      }
    }
  }

  // Part C, rule 2: no two adjacent beats share a scale — scale alternation IS the visual tempo.
  for (let i = 1; i < beats.length; i++) {
    if (beats[i].scale === beats[i - 1].scale) {
      const next = beats[i + 1]?.scale
      const pick = (['medium', 'detail', 'wide', 'macro'] as ShotScale[]).find((s) => s !== beats[i - 1].scale && s !== next) ?? 'medium'
      adjustments.push(`shot beat[${i}] ${beats[i].scale} → ${pick} (no two adjacent same-scale shots)`)
      beats[i] = { ...beats[i], scale: pick }
    }
  }

  // Part C, rule 3: exactly one dominant image; default to the first xl-emphasis section.
  const rawDom = Number(raw?.dominantIndex)
  const xl = plan.sections.findIndex((s) => s.emphasis === 'xl')
  const dominantIndex = Number.isInteger(rawDom) && rawDom >= 0 && rawDom < beats.length ? rawDom : Math.max(0, xl)

  return { world, beats, dominantIndex }
}

/** The closed set the model may lock. `none` = static. */
const MOTION_LANGUAGES: MotionLanguage[] = ['none', 'subtle', 'aggressive', 'parallax-slow', 'brutalist-cut', 'kinetic']

/** Deterministic fallback if the model returns an out-of-set motion — inferred from the plan mood. */
function motionForMood(mood: Mood[]): MotionLanguage {
  const m = new Set<string>(mood)
  if (m.has('brutalist')) return 'brutalist-cut'
  if (m.has('aggressive')) return 'aggressive'
  if (m.has('playful')) return 'kinetic'
  if (m.has('premium') || m.has('calm')) return 'parallax-slow'
  return 'subtle'
}

/** An accent this un-saturated reads as gray — reject and re-synthesize. */
const MIN_ACCENT_SAT = 0.35
/** Body-text contrast floor (accessibility.md). */
const TEXT_CONTRAST = 4.5
/** Secondary/muted text can sit at the large-text floor. */
const MUTED_CONTRAST = 3.0

const COLOR_FILE = 'knowledge/guidelines/color-theory.md'

const SYSTEM = `You are the ART-DIRECTION step of a web-design agent. Given a brief and its mood, COMMIT to one
coherent brand color palette — specific hex values, not vague adjectives. This palette is LOCKED for the whole
site, so every section shares it.

Respond with ONLY JSON in this exact shape (every color a #rrggbb hex):
{
  "background": "#...",
  "foreground": "#...",
  "card": "#...",
  "primary": "#...",
  "mutedForeground": "#...",
  "border": "#...",
  "accent": "#...",
  "motion": "<one of: none | subtle | aggressive | parallax-slow | brutalist-cut | kinetic>",
  "interactions": {
    "durationMs": <hover/press feedback duration, 120-260>,
    "easing": "<a literal cubic-bezier(...) — NOT a keyword>",
    "hoverTransform": "<literal CSS transform: translateY/scale/rotate only, or 'none'>",
    "hoverShadow": "<literal box-shadow, or 'none'>",
    "tapScale": <active-state scale, 0.95-1>,
    "cursor": "<default | pointer>"
  },
  "typography": {
    "displayStack": "<one of: grotesque | condensed | serif | mono>",
    "bodyStack": "<one of: grotesque | serif | mono>",
    "scaleRatio": <modular step ratio between adjacent type sizes, 1.2-1.618>,
    "displayWeight": <100-900 in hundreds>,
    "bodyWeight": <400-700 in hundreds; never below 400>,
    "displayTracking": "<letter-spacing at display size, e.g. '-0.02em'>",
    "displayLineHeight": <display leading, 0.95-1.2>,
    "bodyLineHeight": <body leading, 1.5-1.65>,
    "pairing": "one line: why this display+body pairing fits THIS brand"
  },
  "shotPlan": {
    "subject": "<the ONE recurring physical subject if the brand has one, described concretely enough to re-render identically (e.g. 'a squat amber glass bottle with a cream paper label'), or \"\" if none>",
    "source": "<generated | stock>",
    "light": "<ONE committed light quality/direction for EVERY image>",
    "lens": "<ONE committed lens/perspective language>",
    "texture": "<ONE committed finish/grain>",
    "forbid": ["<things no image may contain>"],
    "beats": [ { "scale": "<establishing|wide|medium|detail|macro>", "role": "<establish|prove|humanize>" } ],
    "dominantIndex": <index of the ONE section that carries the page's dominant image>
  },
  "rationale": "one sentence: the palette + motion + interaction logic and which principle it applies"
}

RULES:
- "shotPlan" stages the page's images as ONE SEQUENCE (a colour script), not per-section picks. Commit ONE
  visual world — one light, one lens, one texture — that every image lives in; content varies, the aesthetic
  never does. "beats" has EXACTLY one entry per section in the SECTIONS list, in order: its "scale" is how
  close the camera stands, its "role" is the image's job (establish the world / prove a product detail /
  make a human outcome credible). Sequence rules: the FIRST beat is the only "establishing" shot; NEVER give
  two adjacent sections the same scale — alternation is the page's visual tempo. If the brand has one
  recurring physical object (a bottle, a garment, a machine), describe it ONCE in "subject" concretely and
  set source "generated" — keyword-searched stock cannot show the same object twice. Use "stock" only for
  purely illustrative pages with no recurring subject.
- "typography" is the LOCKED type pairing for the WHOLE site. Choose both stacks ONLY from the closed set
  above — these are system stacks, nothing is downloaded, so do NOT name a specific font (no "Inter",
  no "Neue Haas"). Commit the NUMBERS from the retrieved TYPE RULES for this mood: aggressive → ratio
  ~1.5, weight 800-900, tracking -0.04em, display line-height ~0.95. brutalist → ratio 1.618+, weight 900.
  premium/editorial → ratio 1.333-1.414, weight 500-600 (restraint reads as expensive; heaviness reads as
  loud — do NOT go heavy here). minimal → ratio 1.25, tracking -0.03em. technical/trustworthy/calm →
  ratio 1.2. Body weight is never below 400, body leading 1.5-1.65.
- "interactions" is the LOCKED hover/cursor/transition contract for the WHOLE site — commit ONE set of
  concrete values (durations in ms, easing as a literal cubic-bezier, hover transform as literal CSS),
  grounded in the retrieved MICRO-INTERACTION RULES for this mood. Do not hedge or describe; commit numbers.
  Premium/calm → restrained (~260ms, translateY(-2px), no scale). Aggressive → fast+physical (~140ms,
  translateY(-3px) scale(1.03)). Playful → overshoot easing + scale(1.05). Brutalist → ~60ms linear, no
  transform. Match the mood's committed values.
- COMMIT to a real, SATURATED accent hue that belongs to THIS brand — never a gray/neutral accent. A gray accent
  is the #1 failure mode; do not produce one. The accent is the brand's signature color.
- background ↔ foreground must have strong contrast for readable body text. card is the background or a hair off it.
  border is a subtle line color. mutedForeground is a mid-tone that is still legible on the background.
- "motion" = ONE motion language for the WHOLE site (locked): none (static/somber), subtle (gentle fades),
  aggressive (fast, punchy), parallax-slow (premium depth), brutalist-cut (hard, no easing), kinetic (energetic
  text/element motion). Pick the ONE that fits the brand — this governs every section, so do not hedge.
- Use the retrieved CRITIQUES for their METHOD only — palette-construction logic, restraint, contrast discipline.
  Do NOT copy any hex value from them; invent your own palette that fits THIS brief so two different briefs get
  visibly different brands.
- Apply the retrieved COLOR RULES and MOTION RULES for this mood.`

function digest(hits: SearchHit[], maxLen: number): string {
  return hits
    .map((h) => {
      const p = h.payload as { heading?: string; body?: string; site?: string; observation?: { what?: string; why?: string }; throughline?: string }
      if (p.observation?.what) return `- ${p.site ?? h.name}: ${p.observation.what}${p.observation.why ? ` — ${p.observation.why}` : ''}`
      if (p.throughline) return `- ${p.site ?? h.name}: ${p.throughline}`
      return `- ${p.heading ?? h.name}: ${(p.body ?? h.embed_text).replace(/\s+/g, ' ').slice(0, maxLen)}`
    })
    .join('\n')
}

async function synthesize(
  plan: Plan,
  colorRules: SearchHit[],
  motionRules: SearchHit[],
  microRules: SearchHit[],
  typeRules: SearchHit[],
  seqRules: SearchHit[],
  critiques: SearchHit[],
  push?: string
): Promise<{ raw: RawPalette; motion: string; interactions: Partial<InteractionSpec>; typography: Partial<TypographySpec>; shotPlan: Partial<ShotPlan>; rationale: string }> {
  const user = `Brand: ${plan.brand}
Brief: ${plan.brief}
Mood: ${plan.moodProfile}

SECTIONS (the shot plan's "beats" array must have exactly one entry per line below, in this order):
${plan.sections.map((s, i) => `${i}. ${s.name} (${s.composition}, ${s.emphasis}) — ${s.intent}${s.media ? ` · media: ${s.media}` : ''}`).join('\n')}

COLOR RULES for this mood (apply these):
${digest(colorRules, 340) || '- (none retrieved; apply general good taste for the mood)'}

MOTION RULES for this mood (pick ONE motion language that fits):
${digest(motionRules, 260) || '- (none retrieved; choose motion from the mood)'}

MICRO-INTERACTION RULES for this mood (commit ONE set of concrete hover/cursor/transition values from these):
${digest(microRules, 300) || '- (none retrieved; commit sensible restrained values for the mood)'}

TYPE RULES for this mood (commit the scale ratio / weight / tracking numbers from these):
${digest(typeRules, 300) || '- (none retrieved; commit sensible type values for the mood)'}

IMAGE-SEQUENCING RULES (stage the images as ONE sequence from these):
${digest(seqRules, 320) || '- (none retrieved; open establishing, alternate scales, one world, one dominant image)'}

CRITIQUE METHOD anchors (use the reasoning/discipline, NOT the literal colors):
${digest(critiques, 220) || '- (none retrieved)'}
${push ? `\n${push}` : ''}
Produce the palette + motion + interactions + typography + shotPlan now.`
  const parsed = extractJson<Partial<RawPalette> & { motion?: string; interactions?: Partial<InteractionSpec>; typography?: Partial<TypographySpec>; shotPlan?: Partial<ShotPlan>; rationale?: string }>(
    await completeReasoning(SYSTEM, user, { temperature: push ? 0.5 : 0.7 })
  )
  const raw: RawPalette = {
    background: String(parsed.background ?? ''),
    foreground: String(parsed.foreground ?? ''),
    card: String(parsed.card ?? ''),
    primary: String(parsed.primary ?? ''),
    mutedForeground: String(parsed.mutedForeground ?? ''),
    border: String(parsed.border ?? ''),
    accent: String(parsed.accent ?? '')
  }
  return {
    raw,
    motion: String(parsed.motion ?? '').trim().toLowerCase(),
    interactions: parsed.interactions ?? {},
    typography: parsed.typography ?? {},
    shotPlan: parsed.shotPlan ?? {},
    rationale: String(parsed.rationale ?? '').trim()
  }
}

/** A deterministic vivid accent, last resort if the model keeps returning gray. Hue from the brand name. */
function fallbackAccent(brand: string): string {
  let hash = 0
  for (const ch of brand) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hslToHex(hash % 360, 0.7, 0.55)
}

const MOTION_FILE = 'knowledge/guidelines/motion-patterns.md'
const MICRO_FILE = 'knowledge/guidelines/micro-interactions.md'
const TYPE_FILE = 'knowledge/guidelines/typography.md'
const SEQ_FILE = 'knowledge/guidelines/image-sequencing.md'
const MEDIA_FILE = 'knowledge/guidelines/media-direction.md'

export async function artDirect(plan: Plan, log: (m: string) => void = () => {}): Promise<ArtDirection> {
  const q = `${plan.brief}. Mood: ${plan.moodProfile}`
  const [guidelineHits, microHits, typeHits, seqHits, critiqueHits] = await Promise.all([
    queryKnowledge(q, { kind: 'guideline', k: 20 }),
    // dedicated query so the micro-interaction rules surface regardless of how color/motion rank
    queryKnowledge(`hover cursor transition duration easing micro-interaction. Mood: ${plan.moodProfile}`, { kind: 'guideline', k: 12 }),
    // same reasoning for type: a color-weighted brief query won't surface the scale-ratio table on its own
    queryKnowledge(`type scale ratio, display and body pairing, weight, tracking, leading. Mood: ${plan.moodProfile}`, { kind: 'guideline', k: 12 }),
    // and for the shot plan: image sequence, scale rhythm, subject continuity, dominant image
    queryKnowledge(`image sequence, shot scale rhythm, subject continuity, one visual world, dominant image. Mood: ${plan.moodProfile}`, { kind: 'guideline', k: 12 }),
    // diverse critiques (one per site) so one richly-critiqued site can't homogenize every palette
    queryKnowledge(q, { kind: 'critique', k: 4, maxPerSource: 1 })
  ])
  const colorRules = guidelineHits.filter((h) => h.source_path === COLOR_FILE).slice(0, 3)
  const motionRules = guidelineHits.filter((h) => h.source_path === MOTION_FILE).slice(0, 3)
  const microRules = microHits.filter((h) => h.source_path === MICRO_FILE).slice(0, 3)
  const typeRules = typeHits.filter((h) => h.source_path === TYPE_FILE).slice(0, 3)
  const seqRules = seqHits.filter((h) => h.source_path === SEQ_FILE || h.source_path === MEDIA_FILE).slice(0, 4)
  const critiques = critiqueHits.slice(0, 3)
  const anchors = [
    ...colorRules.map((h) => h.name),
    ...motionRules.map((h) => h.name),
    ...microRules.map((h) => h.name),
    ...typeRules.map((h) => h.name),
    ...seqRules.map((h) => h.name),
    ...critiques.map((h) => h.name)
  ]

  const adjustments: string[] = []

  // 1. Synthesize; if the accent comes back gray, re-synthesize ONCE with a stronger push.
  let { raw, motion: motionRaw, interactions: interactionsRaw, typography: typographyRaw, shotPlan: shotPlanRaw, rationale } = await synthesize(plan, colorRules, motionRules, microRules, typeRules, seqRules, critiques)
  if (!isHex(raw.accent) || saturation(raw.accent) < MIN_ACCENT_SAT) {
    log(`       ↳ accent ${raw.accent || '(missing)'} too gray (sat ${saturation(raw.accent).toFixed(2)}); re-synthesizing…`)
    const retry = await synthesize(
      plan,
      colorRules,
      motionRules,
      microRules,
      typeRules,
      seqRules,
      critiques,
      `Your previous accent "${raw.accent}" was too close to gray. Commit to a VIVIDLY saturated brand hue (HSL saturation ≥ 60%).`
    )
    if (isHex(retry.raw.accent) && saturation(retry.raw.accent) >= saturation(raw.accent)) {
      raw = retry.raw
      motionRaw = retry.motion
      interactionsRaw = retry.interactions
      typographyRaw = retry.typography
      shotPlanRaw = retry.shotPlan
      rationale = retry.rationale
    }
  }

  // Lock the micro-interaction spec (validate + repair against the per-mood committed defaults).
  const interactions = lockInteractions(interactionsRaw, plan.mood, adjustments)
  if (microRules.length === 0) adjustments.push('no micro-interaction rules retrieved → mood defaults used')

  // Lock the type pairing on the same discipline; families come from the closed system-stack set.
  const typography = lockTypography(typographyRaw, plan.mood, adjustments)
  if (typeRules.length === 0) adjustments.push('no type rules retrieved → mood defaults used')

  // Lock the shot plan — Part C's sequence rules are enforced here, never left to model compliance.
  const shotPlan = lockShotPlan(shotPlanRaw, plan, adjustments)
  if (seqRules.length === 0) adjustments.push('no image-sequencing rules retrieved → mood defaults used')
  log(`       ↳ shot plan: source=${shotPlan.world.source}${shotPlan.world.subject ? `, subject="${shotPlan.world.subject.slice(0, 50)}"` : ' (no recurring subject)'} · ${shotPlan.beats.map((b) => b.scale).join(' → ')}`)

  // Lock the motion language. DESIGN_MOTION env overrides (deterministic testing); else the model's
  // choice if in-set; else a mood-based default. Never model-compliance-dependent downstream.
  const override = (process.env.DESIGN_MOTION ?? '').trim().toLowerCase() as MotionLanguage
  let motion: MotionLanguage
  if (MOTION_LANGUAGES.includes(override)) {
    motion = override
    adjustments.push(`motion forced to '${override}' via DESIGN_MOTION`)
  } else if (MOTION_LANGUAGES.includes(motionRaw as MotionLanguage)) {
    motion = motionRaw as MotionLanguage
  } else {
    motion = motionForMood(plan.mood)
    adjustments.push(`motion '${motionRaw || '(missing)'}' not in set → '${motion}' from mood`)
  }

  // 2. Deterministic validation + repair (never ship a broken/gray/unreadable palette).
  const bg = isHex(raw.background) ? raw.background : '#0a0a0a'
  const fgRaw = isHex(raw.foreground) ? raw.foreground : readableOn(bg)
  const fg = ensureContrast(fgRaw, bg, TEXT_CONTRAST)
  if (fg !== fgRaw) adjustments.push(`foreground ${fgRaw} → ${fg} for ${TEXT_CONTRAST}:1 contrast`)

  const card = isHex(raw.card) ? raw.card : bg
  let accent = isHex(raw.accent) ? raw.accent : fallbackAccent(plan.brand)
  if (saturation(accent) < MIN_ACCENT_SAT) {
    const forced = fallbackAccent(plan.brand)
    adjustments.push(`accent ${accent} still gray → committed ${forced}`)
    accent = forced
  }

  const mutedRaw = isHex(raw.mutedForeground) ? raw.mutedForeground : mixHex(bg, fg, 0.55)
  const muted = ensureContrast(mutedRaw, bg, MUTED_CONTRAST)
  if (muted !== mutedRaw) adjustments.push(`mutedForeground ${mutedRaw} → ${muted} for ${MUTED_CONTRAST}:1`)

  const palette: Palette = {
    background: bg,
    foreground: fg,
    card,
    cardForeground: ensureContrast(readableOn(card), card, TEXT_CONTRAST),
    primary: isHex(raw.primary) ? raw.primary : accent,
    primaryForeground: ensureContrast(readableOn(isHex(raw.primary) ? raw.primary : accent), isHex(raw.primary) ? raw.primary : accent, TEXT_CONTRAST),
    secondary: mixHex(bg, fg, 0.08),
    mutedForeground: muted,
    border: isHex(raw.border) ? raw.border : mixHex(bg, fg, 0.16),
    accent,
    accentForeground: ensureContrast(readableOn(accent), accent, TEXT_CONTRAST)
  }

  return { palette, motion, interactions, typography, shotPlan, rationale: rationale || '(no rationale)', adjustments, anchors }
}
