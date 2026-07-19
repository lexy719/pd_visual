/**
 * THE SKETCH — the page's composition, decided once, with reasons.
 *
 * WHAT WAS MISSING
 *
 * A section used to be handed a name, an intent ("show the ownership feature"), a one-word
 * composition ("modular") and an emphasis — then asked to produce finished code. Nothing recorded
 * where the mass sits, what the eye should hit first, or why the arrangement is this one rather than
 * the obvious alternative. Seven sections then invented seven arrangements independently, each
 * reasonable on its own and with no knowledge of its neighbours.
 *
 * That is the difference between a page and a stack. A designer sketches the whole thing before
 * building any of it, precisely so that section four can be quiet because section three was loud.
 * No section can make that decision from inside itself.
 *
 * WHY THE REASON MUST BE CHECKABLE
 *
 * "This creates a bold, modern feel" is what a model writes when it has not actually decided
 * anything. A usable reason names something real: the subject faces left, the list is long, this
 * follows a dense section, the numbers are the proof. So `why` is validated — reasons made only of
 * adjectives are rejected and the beat is repaired rather than shipped with decoration attached.
 *
 * WHAT THIS REPLACES
 *
 * The arrangement also DECIDES the section's device. Previously the model chose one from retrieved
 * suggestions, per section, with no page-level view — which is how a page ended up using dev-overlap
 * four times. Now the arrangement is a page-level decision and the device follows from it.
 */
import { completeReasoning, extractJson } from '../llm/llm.js'
import type { Plan, SectionPlan } from './types.js'
import type { DeviceName } from './devices.js'

/**
 * How a section's mass is organised. A closed vocabulary, each entry mapping to real geometry the
 * page already owns — so a sketch decision is buildable by construction.
 */
export const ARRANGEMENTS = [
  'full-bleed-media',   // one image running edge to edge; the section IS the image
  'media-beside-text',  // image and text share the row, occluding for depth
  'centred-statement',  // type alone, centred; no media competing
  'anchored-statement', // type alone, hung off one edge against deliberate emptiness
  'side-rail',          // a sticky orientation column beside long content
  'grid',               // three or more sibling items
  'staggered-grid',     // the same, with rhythm instead of a uniform row
  'quote-break',        // a pull-quote breaking the measure
  'stat-row',           // oversized numerals as the page's scale jump
  'compare',            // an aligned comparison — alignment carries the meaning
  'disclosure-list',    // questions/answers as a typographic list
  'tier-choice',        // priced options with one emphasised
  'proof-wall'          // logos or names as unified wordmarks
] as const
export type Arrangement = (typeof ARRANGEMENTS)[number]

/** Which edge the composition hangs from. Emptiness only reads as intentional when hung off an edge. */
export const ANCHORS = ['top-left', 'bottom-left', 'centre', 'top-right', 'bottom-right', 'full'] as const
export type Anchor = (typeof ANCHORS)[number]

/** The arrangement decides the device. This is the sketch's grip on what actually gets built. */
export const ARRANGEMENT_DEVICE: Record<Arrangement, DeviceName | null> = {
  // A full-bleed media beat is a FRAME, not a wide band. dev-bleed only released the container;
  // dev-stage composes inside the frame — media covering it, type anchored to the corner this beat
  // already committed to, and a scrim guaranteeing the type stays readable over an unknown image.
  'full-bleed-media': 'dev-stage',
  'media-beside-text': 'dev-overlap',
  'centred-statement': null, // type alone: a device here would add furniture the section does not want
  'anchored-statement': null,
  'side-rail': 'dev-side-rail',
  grid: 'dev-feature-grid',
  'staggered-grid': 'dev-offset-grid',
  'quote-break': 'dev-quote-break',
  'stat-row': 'dev-stat-row',
  compare: 'dev-compare',
  'disclosure-list': 'dev-faq',
  'tier-choice': 'dev-price-table',
  'proof-wall': 'dev-logo-wall'
}

/** The stage modifier for a beat's anchor — this is what finally consumes the committed anchor. */
export const ANCHOR_STAGE_CLASS: Record<Anchor, string> = {
  'top-left': 'dev-stage-tl',
  'bottom-left': 'dev-stage-bl',
  'top-right': 'dev-stage-tr',
  'bottom-right': 'dev-stage-br',
  centre: 'dev-stage-c',
  full: 'dev-stage-bl'
}

export interface SketchBeat {
  arrangement: Arrangement
  anchor: Anchor
  /** the ONE thing the eye should hit first in this section */
  focal: string
  /** why THIS arrangement and not the obvious alternative — must name something real */
  why: string
}

export interface SketchPlan {
  /** aligned by index with plan.sections */
  beats: SketchBeat[]
  /** the section that owns the page's single strongest composition */
  focalIndex: number
}

/**
 * Reasons made of adjectives. A `why` that is only this is not a decision, it is a caption, and it
 * gives the section generator nothing to act on.
 */
const WHY_FILLER =
  /\b(bold|modern|clean|sleek|engaging|dynamic|eye-?catching|visually appealing|striking|stunning|beautiful|professional|creates? a sense|adds? visual interest|makes? it pop|draws? the eye|elevates?)\b/gi

/** A usable reason points at something: content, sequence, subject, or a spatial fact. */
const WHY_SUBSTANCE =
  /\b(because|since|so that|so the|rather than|instead of|follows|after|before|previous|next|faces|left|right|long|short|dense|sparse|numbers?|list|quote|image|subject|reader|scroll|compare|choose|decide|first|last|only|three|four|several)\b/i

export function isSubstantiveWhy(why: string): boolean {
  const w = why.trim()
  if (w.length < 25) return false
  // Strip the adjective-mush and see whether anything load-bearing remains.
  const stripped = w.replace(WHY_FILLER, '').replace(/\s+/g, ' ').trim()
  if (stripped.length < 20) return false
  return WHY_SUBSTANCE.test(w)
}

const SYSTEM = `You are the SKETCH step of a web-design agent. The page's sections are already planned. Before
anything is built, you decide the COMPOSITION of the whole page at once — where the mass sits in each
section, what the eye hits first, and WHY that arrangement rather than the obvious alternative.

You are sketching, not writing copy and not choosing colours. Think like someone drawing thumbnails:
this one is a full-bleed image, so the next one must be quiet type; this list is long, so it needs a
rail to hold the reader's place.

Respond with ONLY JSON:
{
  "beats": [
    {
      "arrangement": "<one of: ${ARRANGEMENTS.join(' | ')}>",
      "anchor": "<one of: ${ANCHORS.join(' | ')}>",
      "focal": "<the ONE thing the eye should hit first in this section, concretely>",
      "why": "<why THIS arrangement and not the obvious alternative>"
    }
  ],
  "focalIndex": <index of the section that owns the page's single strongest composition>
}

RULES:
- One beat per section, in order. Do not skip or merge sections.
- "why" must name something REAL: the content, the sequence, the subject, a spatial fact.
  GOOD: "the subject faces left, so the type sits in the space it looks into"
  GOOD: "follows the densest section on the page, so it holds one sentence and nothing else"
  GOOD: "four options that must be compared, and alignment is what makes them comparable"
  BAD:  "creates a bold, modern feel" / "adds visual interest" / "draws the eye"
  A reason made of adjectives will be rejected.
- ADJACENT sections must not share an arrangement. A page whose sections all look the same shape is
  the failure this step exists to prevent.
- "full-bleed-media" at most twice on the page, "quote-break" at most once — they work by contrast,
  and repeating them spends the contrast.
- Pick the arrangement the CONTENT wants. A comparison wants "compare"; questions want
  "disclosure-list"; real numbers want "stat-row". Do not decorate content with a shape it resists.
- "anchor" decides where emptiness goes. Large empty areas read as composed when the content is hung
  off an edge, and as a mistake when it floats in the middle — prefer an edge over "centre" unless
  the section is a single short statement.`

/**
 * Validate + repair a sketch. Page-level rules that no single section could enforce from inside
 * itself — the whole reason this step exists.
 */
export function lockSketch(raw: unknown, sections: SectionPlan[], adjustments: string[]): SketchPlan {
  const arr = Array.isArray((raw as { beats?: unknown })?.beats) ? ((raw as { beats: unknown[] }).beats) : []
  const beats: SketchBeat[] = []

  // Content-led fallback: when a beat is missing or unusable, choose from what the section IS rather
  // than dropping to one default for everything.
  const fallbackFor = (s: SectionPlan, i: number): Arrangement => {
    const t = `${s.name} ${s.intent}`.toLowerCase()
    if (/\bprice|pricing|plan|tier/.test(t)) return 'tier-choice'
    if (/\bfaq|question/.test(t)) return 'disclosure-list'
    if (/\bcompare|versus|vs\b/.test(t)) return 'compare'
    if (/\blogo|partner|trusted|client/.test(t)) return 'proof-wall'
    if (/\bstat|number|metric|result/.test(t)) return 'stat-row'
    if (/\bquote|testimonial/.test(t)) return 'quote-break'
    if (s.composition === 'cinematic' || s.composition === 'immersive') return 'full-bleed-media'
    if (s.composition === 'modular') return 'grid'
    if (s.composition === 'gallery' || s.composition === 'timeline') return 'staggered-grid'
    if (s.composition === 'editorial') return i % 2 ? 'anchored-statement' : 'media-beside-text'
    return 'media-beside-text'
  }

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]!
    const b = (arr[i] ?? {}) as { arrangement?: unknown; anchor?: unknown; focal?: unknown; why?: unknown }
    let arrangement = String(b.arrangement ?? '').toLowerCase().trim() as Arrangement
    if (!(ARRANGEMENTS as readonly string[]).includes(arrangement)) {
      arrangement = fallbackFor(s, i)
      adjustments.push(`sketch[${i}] arrangement "${String(b.arrangement ?? '')}" is not in the vocabulary → ${arrangement}`)
    }
    let anchor = String(b.anchor ?? '').toLowerCase().trim() as Anchor
    if (!(ANCHORS as readonly string[]).includes(anchor)) anchor = arrangement === 'full-bleed-media' ? 'full' : 'top-left'

    const focal = String(b.focal ?? '').replace(/\s+/g, ' ').trim().slice(0, 140)
    const why = String(b.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 220)
    beats.push({ arrangement, anchor, focal: focal || s.intent.slice(0, 100), why })
  }

  // RULE: adjacent sections must differ. Checked against what was actually emitted, so a repair
  // cannot itself create a new run of two.
  for (let i = 1; i < beats.length; i++) {
    if (beats[i]!.arrangement !== beats[i - 1]!.arrangement) continue
    const alt = fallbackFor(sections[i]!, i)
    const replacement =
      alt !== beats[i - 1]!.arrangement
        ? alt
        : ARRANGEMENTS.find((a) => a !== beats[i - 1]!.arrangement && a !== 'full-bleed-media') ?? 'anchored-statement'
    adjustments.push(`sketch[${i}] repeats "${beats[i]!.arrangement}" from the section above → ${replacement}`)
    beats[i]!.arrangement = replacement
  }

  // RULE: contrast devices are spent by repetition.
  const cap = (a: Arrangement, max: number) => {
    let seen = 0
    for (let i = 0; i < beats.length; i++) {
      if (beats[i]!.arrangement !== a) continue
      seen++
      if (seen <= max) continue
      const alt = a === 'full-bleed-media' ? 'media-beside-text' : 'anchored-statement'
      adjustments.push(`sketch[${i}] "${a}" used more than ${max}× — it works by contrast → ${alt}`)
      beats[i]!.arrangement = alt
    }
  }
  cap('full-bleed-media', 2)
  cap('quote-break', 1)

  // RULE: a reason made of adjectives is not a decision. Replace it with an honest note rather than
  // shipping decoration that the section generator would treat as guidance.
  for (let i = 0; i < beats.length; i++) {
    if (isSubstantiveWhy(beats[i]!.why)) continue
    adjustments.push(`sketch[${i}] reason was not substantive ("${beats[i]!.why.slice(0, 48)}") — replaced with the structural fact`)
    beats[i]!.why = `${beats[i]!.arrangement} suits this section's content; no specific reason was committed`
  }

  const rawFocal = Number((raw as { focalIndex?: unknown })?.focalIndex)
  const focalIndex = Number.isInteger(rawFocal) && rawFocal >= 0 && rawFocal < beats.length ? rawFocal : 0
  return { beats, focalIndex }
}

export async function sketch(plan: Plan, log?: (m: string) => void): Promise<{ sketch: SketchPlan; adjustments: string[] }> {
  const adjustments: string[] = []
  const user = `Brand: ${plan.brand}
Brief: ${plan.brief}
Register: ${plan.register}   Mood: ${plan.mood.join(', ')}

SECTIONS (one beat each, in this order):
${plan.sections.map((s, i) => `${i}. ${s.name} — ${s.intent} [composition hint: ${s.composition}, emphasis: ${s.emphasis}]`).join('\n')}`

  let raw: unknown = {}
  try {
    raw = extractJson(await completeReasoning(SYSTEM, user, { temperature: 0.4 }))
  } catch (e) {
    adjustments.push(`sketch step failed (${(e as Error).message.slice(0, 60)}) — composition fell back to content-led defaults`)
  }
  const out = lockSketch(raw, plan.sections, adjustments)
  log?.(`  composition sketched: ${describeSketch(out)}`)
  return { sketch: out, adjustments }
}

export const describeSketch = (s: SketchPlan): string =>
  `${s.beats.map((b) => b.arrangement.replace(/-.*/, '')).join(' → ')}  focal@${s.focalIndex}`

/** The composition brief handed to a section — where the mass goes, and why. */
export function sketchPromptBlock(beat: SketchBeat, isFocal: boolean): string {
  const device = ARRANGEMENT_DEVICE[beat.arrangement]
  return `COMPOSITION (decided for the whole page — this section's place in it):
- Arrangement: ${beat.arrangement}${
    device === 'dev-stage'
      ? ` → build a STAGE: <section class="dev-stage ${ANCHOR_STAGE_CLASS[beat.anchor]}"> containing exactly two children — an <img class="dev-stage-media"> that fills the frame, and a <div class="dev-stage-body"> holding a SHORT headline and at most one line. The image covers the frame and the text is anchored and kept readable for you; do NOT add your own overlay, gradient or text colour.`
      : device
        ? ` → apply the device "${device}"`
        : ' → type-led; do NOT add a card grid or media frame here'
  }.
- The mass hangs from: ${beat.anchor}${beat.anchor === 'centre' ? '' : '. Any empty area must sit AGAINST that edge, never around floating centred content'}.
- The eye should hit first: ${beat.focal}.
- Why this and not the obvious alternative: ${beat.why}
${isFocal ? '- THIS SECTION owns the page\'s strongest composition. It should be the one a reader remembers.\n' : ''}- Build the arrangement above. Do not substitute a different shape because it seems safer.`
}
