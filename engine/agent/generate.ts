/**
 * Generate step. For each planned section:
 *   1. retrieveForSection() — guidelines + critiques + motion-primitives, mood/motion-weighted.
 *   2. If the run's locked motion language offers a primitive whose fitsCompositions includes this
 *      section's composition, back the section with it (the model adapts its usage example).
 *   3. Otherwise generate the section FROM SCRATCH, conditioned on retrieved structural guidelines,
 *      critiques and anti-patterns.
 *
 * There is NO component library — every section is generated. The only pre-built code that can ride
 * a section is a motion primitive (scroll choreography), and even that is content-fit-gated.
 */

import { completeBulk, completeReasoning, extractCode } from '../llm/llm.js'
import { parseError } from './writer.js'
import { queryKnowledge, retrieveForSection } from '../retrieval/query.js'
import type { Composition, ComponentDoc, MotionPrimitiveDoc, SearchHit } from '../types.js'
import { SCALE_ASPECT } from './art-direction.js'
import { DEFAULT_DEVICE, DEVICE_NAMES, DEVICE_RE, unknownDeviceClasses } from './devices.js'
import { lintReveal } from './reveal.js'
import { lintVoice, voiceFor, voicePromptBlock } from './voice.js'
import type { ArtDirection, InteractionSpec, ShotBeat, ShotPlan, ShotScale, ShotWorld } from './art-direction.js'
import type { Plan, SectionPlan, SectionResult } from './types.js'

/** The locked micro-interaction contract, expressed for a section prompt. Concrete committed values +
 *  the utility classes globals.css already defines — so every section shares one hover/press feel. */
function interactionDirective(mi: InteractionSpec): string {
  return `MICRO-INTERACTIONS — LOCKED for the whole site. Use these EXACT values; do NOT invent your own:
- globals.css already defines utility classes carrying the committed values (duration ${mi.durationMs}ms,
  easing ${mi.easing}, hover transform ${mi.hoverTransform}, reduced-motion fallback baked in). Apply them:
  add "mi" to any element that reacts, "mi-lift" to cards/links/buttons that lift on hover, "mi-press" to
  clickable controls. You do NOT re-declare their duration/easing/transform — the class carries them.
- Any additional HOVER / PRESS / STATE-CHANGE transition you write MUST use duration ${mi.durationMs}ms and easing ${mi.easing}.
- ENTRANCE / SCROLL-REVEAL: do not write one. The page already has a locked reveal, applied to every
  section automatically. Do NOT add opacity-0 with a JS/IntersectionObserver toggle, and do NOT use
  transition-all — it animates layout properties and is the usual source of jank. If one specific
  block inside the section should arrive on its own, add the class "reveal" to it; the timing,
  easing and reduced-motion fallback are already committed.
- Cursor: ${mi.cursor} (pointer only on genuinely actionable elements).
- Do NOT add hover scales/bounces/glows that contradict the committed transform "${mi.hoverTransform}".`
}

/**
 * Which model tier does a codegen call. First attempt = 'bulk' (cheap, high-volume). When a section
 * fails its import/parse check and needs a repair retry, we escalate to 'reasoning' rather than
 * retrying blind on the weak model — that retry is recorded as 'bulk→escalated' in the run summary.
 */
type GenTier = 'bulk' | 'reasoning'
const runTier = (t: GenTier) => (t === 'reasoning' ? completeReasoning : completeBulk)

/**
 * Output budget per section. Kept generous because (a) rich sections (a gallery grid, a timeline)
 * are large, and (b) reasoning models (e.g. gpt-oss-120b) spend part of the completion on internal
 * reasoning — too low a cap truncates the code mid-file ("Unexpected end of file"), which then gets
 * quarantined. This is per-section output, not the whole page.
 */
const MAX_SECTION_TOKENS = 5000

const THEME_CLASSES =
  'Theme (shadcn-style) Tailwind classes, dark mode default: bg-background, bg-card, text-foreground, ' +
  'text-muted-foreground, text-card-foreground, text-primary, bg-primary, text-primary-foreground, ' +
  'border-border, ring-ring. Use ONLY these for themed colors so it matches the rest of the page.'

const IMAGE_RULE =
  'For any photo use https://picsum.photos/seed/<keyword>/<width>/<height> (real, always loads). ' +
  'Never invent an Unsplash URL — they 404.'

const LAYOUT_SYSTEM =
  'LAYOUT SYSTEM — LOCKED for the whole page (globals.css defines these; every section shares them):\n' +
  '- The root <section> takes className "section-pad" for its vertical padding (the hero may use ' +
  '"section-pad-hero"). NEVER put py-*/pt-*/pb-* on the root section — the padding rhythm is decided once per page.\n' +
  '- The content wrapper inside the section takes className "container-page". NEVER hand-roll max-w-* + mx-auto ' +
  'for the outermost wrapper — the container width is decided once per page.\n' +
  '- HEADINGS: the page has exactly ONE <h1>, in the dominant section only — this section uses <h2>/<h3> unless ' +
  'told it is dominant. Heading font/size/weight/tracking are locked in CSS; do NOT fight them with ' +
  'text-*/font-*/tracking-* classes on h1/h2 (they will lose). Style paragraphs and small text freely.\n' +
  '- GRID: compose on a disciplined column grid of your choice (the pre-built "grid-page" + ' +
  '"col-main/col-side/col-wide/col-narrow/col-full" utilities exist if useful, or roll your own 12-col). ' +
  'The INVARIANTS are what matter: every element stays inside container-page (nothing may exceed the ' +
  'viewport width — no fixed pixel widths wider than a column, no percentage soup), and body-copy blocks ' +
  'get className "measure" (readable line length). Item grids inside a column (cards, thumbnails) are free.\n' +
  '- IMAGES: every image is shaped by a locked aspect class (shot-establishing 21:9 / shot-wide 16:9 / ' +
  'shot-medium 4:3 / shot-detail 4:5 / shot-macro 1:1, object-fit cover — STAMPED AUTOMATICALLY on the ' +
  '<img>). Do NOT write a shot-* class yourself, and never put one on a wrapper around an image — a ' +
  'wrapper aspect fighting the image aspect clips the picture. Do NOT set your own h-*/aspect-* on ' +
  'images either; size them by COLUMN width and let the locked aspect set the height.\n' +
  '- DENSITY: never min-h-screen/h-screen outside the hero — the locked section-pad provides the air. ' +
  'A section is as tall as its content.\n' +
  '- FILL THE WIDTH (this is the #1 quality failure): a content block must CENTER or EXPAND to its ' +
  'container — never pin a max-w-* column to one edge and leave a tall empty band on the other side. ' +
  'If a section is one column, center it (max-w-* with mx-auto). If it is two columns, BOTH must carry ' +
  'real content of comparable height (text + an on-brief image / pull-quote / stat / list) — a column ' +
  'that would be empty or near-empty means you should use a single centered column instead. Every ' +
  'section should read as deliberately composed to fill its space, not as a narrow strip floating in a wide void.'

/** Moods for which stock photos read as random/cheap — steer scratch to non-photo imagery instead. */
const NON_PHOTO_MOODS = ['technical', 'minimal', 'brutalist']

/** Per-brief image instruction for SCRATCH sections. Technical/minimal → no photos (they look random). */
function imageRule(plan: Plan): string {
  if (plan.mood.some((m) => NON_PHOTO_MOODS.includes(m))) {
    return (
      'IMAGERY — this is a technical/minimal brand, so DO NOT use stock photos (they look random and cheap here). ' +
      'Instead build visuals from code: a code block or terminal snippet (monospace, bg-card, rounded-lg, p-4, a REAL ' +
      'on-brief command/output). ' +
      'ICONS: if a feature/item needs an icon, use a COMPLETE inline <svg> with a visible <path> ' +
      '(viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2", class "h-6 w-6 text-primary"). ' +
      'NEVER use an empty <div> or a bare gradient box as an icon — an empty box reads as a broken image. ' +
      'If one item gets an icon, give EVERY sibling item an icon of the same style (be consistent). ' +
      'Gradient panels (bg-gradient-to-br …) are allowed ONLY as a large decorative banner/background, never as a small icon slot. ' +
      'For a "logos"/trusted-by row use styled TEXT wordmarks (font-semibold text-muted-foreground), NEVER <img>. ' +
      'Do not emit any picsum.photos or other <img> photo URLs.'
    )
  }
  return (
    'IMAGERY — for a photo use https://picsum.photos/seed/<distinct-keyword>/<w>/<h> (always loads). Use a DIFFERENT, ' +
    'specific keyword for every image. Every src must be a LITERAL string — never a template literal with a variable ' +
    '(no src={`…${x}…`}); a dynamic src bypasses the page-wide art direction and ships an unstaged placeholder. ' +
    'Never invent Unsplash URLs — they 404.'
  )
}

/** Composition → a STRUCTURAL query, so spacing/layout rules are retrieved by SHAPE, not buried by mood. */
const STRUCTURE_QUERY: Record<Composition, string> = {
  cinematic: 'full-bleed hero, oversized media, vertical rhythm, generous spacing',
  editorial: 'stacked columns, editorial layout, whitespace, container max-width, spacing rhythm',
  gallery: 'grid gallery, masonry, gap between items, alignment, spacing rhythm',
  narrative: 'alternating media and text rows, container max-width, section spacing',
  asymmetric: 'asymmetric split layout, offset unequal columns, spacing',
  modular: 'bento grid, card modules, gap between cards, equal-height columns',
  immersive: 'full-viewport pinned section, vertical padding, spacing',
  timeline: 'vertical timeline sequence, consistent rhythm, spacing between steps'
}

/** Structural guidelines live only in these files — retrieve by section shape, then keep only these. */
const STRUCT_FILES = new Set(['knowledge/guidelines/spacing.md', 'knowledge/guidelines/layout-patterns.md'])

/** Compositional CRAFT gets its own lane. Riding the structural lane would make it compete with
 *  spacing/layout rules for the same 3 slots — and the craft devices (occlusion, scale jump, grid
 *  break, bleed) are exactly what the pages have been missing, so they must never lose that race. */
const CRAFT_FILE = 'knowledge/guidelines/composition-craft.md'
const DEVICE_FILE = 'knowledge/guidelines/devices.md'

// DEFAULT_DEVICE (the device each composition falls back to) and DEVICE_RE live in devices.ts,
// alongside the CSS they describe, so adding a device is a one-file change.

/**
 * Retrieve 2 compositional DEVICES for this section. Rules tell a section what not to do; these tell
 * it how to build depth, hierarchy and tension — the difference between correct and designed.
 */
export async function retrieveCraft(composition: Composition, intent: string): Promise<SearchHit[]> {
  const hits = await queryKnowledge(`${COMPOSITION_HINT[composition]} — ${intent}. depth, layering, hierarchy, contrast, composition craft`, {
    kind: 'guideline',
    k: 14
  })
  return hits.filter((h) => h.source_path === CRAFT_FILE).slice(0, 2)
}

/**
 * Retrieve 2 DEVICES this section can actually apply. Craft chunks say what good composition is;
 * devices are the verified, ready-made CSS that builds it — the model picks a class, never the
 * geometry. Own lane for the same reason craft has one: it must not lose slots to spacing rules.
 */
export async function retrieveDevices(composition: Composition, intent: string): Promise<SearchHit[]> {
  // k is generous (30) on purpose: the filter keeps only device-file hits, and at k=16 the pool was
  // crowded out by other guidelines — editorial sections were retrieving ZERO devices, which is the
  // most common composition on the site. Cost is unchanged; only the filtered survivors are used.
  const hits = await queryKnowledge(`${COMPOSITION_HINT[composition]} — ${intent}. apply a composition device: overlap occlusion, offset grid, pull-quote breaking the measure, full-bleed band, oversized stat numerals, feature cards, wordmark row, matted frame, sticky side rail, comparison table, FAQ list, pricing tiers`, {
    kind: 'guideline',
    k: 30
  })
  return hits.filter((h) => h.source_path === DEVICE_FILE).slice(0, 2)
}

/** Retrieve spacing + layout rules for a section's COMPOSITION (structure-matched, not mood-matched). */
export async function retrieveStructural(composition: Composition, intent: string): Promise<SearchHit[]> {
  const hits = await queryKnowledge(`${STRUCTURE_QUERY[composition]} — ${intent}`, { kind: 'guideline', k: 14 })
  return hits.filter((h) => STRUCT_FILES.has(h.source_path)).slice(0, 3)
}

/** Render retrieved critiques as actionable design judgement (the `why` is the valuable half). */
function critiqueDigest(hits: SearchHit[]): string {
  return hits
    .map((h) => {
      const p = h.payload as { site?: string; observation?: { what?: string; why?: string }; throughline?: string }
      const o = p.observation
      if (o?.what) return `- ${p.site ?? h.name}: ${o.what}${o.why ? ` — WHY: ${o.why}` : ''}`
      if (p.throughline) return `- ${p.site ?? h.name}: ${p.throughline}`
      return `- ${h.name}: ${h.embed_text.replace(/\s+/g, ' ').slice(0, 200)}`
    })
    .join('\n')
}

/**
 * Cheap static layout lint (no LLM): flag flex/grid containers that will visually collide because
 * they lack a gap or wrap — the exact failure that shipped as "terminal commands on one line".
 * Flags only; rewriting Tailwind classes automatically is the kind of silent edit that breaks things.
 */
export function lintLayout(code: string): string[] {
  const warns: string[] = []
  const classes = [...code.matchAll(/className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g)].map(
    (m) => m[1] || m[2] || m[3] || ''
  )
  for (const cls of classes) {
    const hasGap = /\bgap-|\bspace-x-|\bspace-y-/.test(cls)
    if (/\bgrid-cols-/.test(cls) && !hasGap) warns.push(`grid without gap: "${cls.slice(0, 64)}"`)
    // multi-item flex rows: distribution or wrapping strongly implies >1 child needing separation
    const isRow = /\bflex\b/.test(cls) && !/\bflex-col\b/.test(cls)
    const distributes = /\bjustify-(between|around|evenly)\b/.test(cls) || /\bflex-wrap\b/.test(cls)
    if (isRow && distributes && !hasGap) warns.push(`flex row without gap: "${cls.slice(0, 64)}"`)
  }
  // Empty gradient box used as an icon: a small sized div with a gradient and NO children reads as a
  // broken image (the exact "empty box under Real-time Monitoring" failure).
  for (const m of code.matchAll(/<div\b[^>]*className=(?:"([^"]*)"|'([^']*)')[^>]*>\s*<\/div>/g)) {
    const cls = m[1] || m[2] || ''
    if (/bg-gradient/.test(cls) && /\b[hw]-(6|8|10|12|14|16|20)\b/.test(cls)) {
      warns.push(`empty gradient box used as icon (add an inline <svg> or content): "${cls.slice(0, 64)}"`)
    }
  }
  return [...new Set(warns)]
}

/**
 * Theme-conformance lint (scratch only): flag raw colors that bypass the locked theme tokens, so a
 * section can't silently ignore the run's committed palette. The analog of the import-check — it
 * catches "this section went rogue with bg-neutral-900 / text-blue-500 / #hex" instead of the
 * bg-background / text-primary / text-accent tokens that art-direction actually controls.
 */
const OFF_THEME_UTIL =
  /\b(?:bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|placeholder|caret|shadow)-(?:neutral|gray|zinc|slate|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/g
const RAW_BW_UTIL = /\b(?:bg|text|border|ring|fill|stroke)-(?:black|white)\b/g

export function lintTheme(code: string): string[] {
  const hits = new Set<string>()
  for (const m of code.match(OFF_THEME_UTIL) ?? []) hits.add(m)
  for (const m of code.match(RAW_BW_UTIL) ?? []) hits.add(m)
  if (/#[0-9a-fA-F]{6}\b/.test(code)) hits.add('raw #hex color (use theme tokens)')
  return [...hits].slice(0, 8)
}

/**
 * How many distinct off-theme utilities it takes to escalate a section to the reasoning tier.
 * Deliberately NOT 1: a stray utility (one gradient stop, one divider) is tolerable and the lint
 * already surfaces it, whereas escalating on any single violation would retry most sections and
 * erase the bulk tier's cost saving. 3+ distinct violations means the section ignored the palette
 * rather than slipped once — that's worth one reasoning retry.
 *
 * DESIGN_OFF_THEME_ESCALATE_AT overrides it (same deterministic-testing affordance as DESIGN_MOTION
 * in art-direction.ts): set it to 1 to force the escalation path on a real run.
 */
const OFF_THEME_ESCALATE_AT = Number(process.env.DESIGN_OFF_THEME_ESCALATE_AT) || 3

/**
 * The corrective block for an off-theme retry. Names the committed theme TOKENS explicitly (never
 * the raw hex — hardcoded hex is itself a lint violation) and quotes back what the bulk attempt did
 * wrong, so the reasoning tier fixes the specific failure instead of re-rolling blind.
 */
function themeCorrection(violations: string[]): string {
  return `CRITICAL — your previous attempt BYPASSED the run's committed brand palette. It used: ${violations.join(', ')}.
This run has ONE locked palette, exposed ONLY as these theme tokens. Use these and nothing else:
  backgrounds: bg-background, bg-card, bg-secondary, bg-muted, bg-primary, bg-accent
  text:        text-foreground, text-muted-foreground, text-card-foreground, text-primary, text-primary-foreground, text-accent-foreground
  lines:       border-border, ring-ring
Do NOT use Tailwind's default color palette (amber-*, slate-*, neutral-*, gray-*, blue-*, …), do NOT use
raw #hex values, and do NOT use text-white / bg-black. For a gradient, compose it FROM the tokens
(e.g. from-primary via-accent to-background) — never from amber-*/slate-*. Rewrite the section now,
keeping the same structure and copy, with every colour coming from the tokens above.`
}

/**
 * Deterministic-testing affordance, same convention as DESIGN_MOTION / DESIGN_OFF_THEME_ESCALATE_AT:
 * force the parse-error escalation path on a REAL run, which otherwise only fires when a model happens
 * to emit broken syntax and so can't be exercised on demand.
 *   DESIGN_FORCE_PARSE_FAIL=bulk  → corrupt the bulk output only  (the reasoning retry should repair it)
 *   DESIGN_FORCE_PARSE_FAIL=both  → corrupt both tiers            (→ explicit double failure + quarantine)
 * Unset in normal use; corrupts nothing.
 */
const FORCE_PARSE_FAIL = (process.env.DESIGN_FORCE_PARSE_FAIL ?? '').trim().toLowerCase()
/** Append an unterminated object literal — a guaranteed, unambiguous "Expected }" from esbuild. */
const corruptSyntax = (code: string): string => `${code}\nconst __forcedParseFailure = {`

/**
 * The corrective block for a PARSE-error retry. The off-theme retry has always been told what it did
 * wrong; the parse retry used to be fired blind, which asks the reasoning tier to re-roll the same
 * dice rather than fix a specific defect. Quote the compiler back at it, same as themeCorrection.
 */
function parseCorrection(err: string): string {
  return `CRITICAL — your previous attempt did NOT COMPILE. The bundler reported:
  ${err}
Rewrite the section so it parses as valid TypeScript/TSX. Keep the same structure, copy and classes —
this is a SYNTAX repair, not a redesign. Check especially: every JSX expression brace { } is balanced and
closed; every tag is closed; template literals and quotes are terminated; apostrophes inside JSX text are
escaped or the text is wrapped in {'…'}; no stray characters between attributes. Output the COMPLETE
corrected file — imports plus one \`export default function\` — and nothing else.`
}

/**
 * Fetch ONE real, keyword-relevant Unsplash photo URL sized to w×h. Picks an as-yet-unused photo
 * (so repeats across the page differ) and sizes via Unsplash's raw-URL params. Returns null on any
 * failure (no key, rate limit, no match) so the caller can fall back to keyless Flux generation.
 */
async function fetchUnsplash(kw: string, w: number, h: number, key: string, usedIds: Set<string>): Promise<string | null> {
  try {
    const q = encodeURIComponent(kw.replace(/[-_]+/g, ' ').trim())
    const res = await fetch(`https://api.unsplash.com/search/photos?query=${q}&per_page=8&orientation=landscape&content_filter=high`, {
      headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' }
    })
    if (!res.ok) return null
    const json = (await res.json()) as { results?: Array<{ id: string; urls?: { raw?: string; regular?: string } }> }
    const results = json.results ?? []
    const pick = results.find((r) => !usedIds.has(r.id)) ?? results[0]
    if (!pick?.urls) return null
    usedIds.add(pick.id)
    return pick.urls.raw ? `${pick.urls.raw}&w=${w}&h=${h}&fit=crop&q=80` : pick.urls.regular ?? null
  } catch {
    return null
  }
}

/** How each shot scale reads as a camera instruction — the beat's contribution to the prompt. */
const SCALE_PHRASE: Record<ShotScale, string> = {
  establishing: 'wide establishing shot placing the whole scene',
  wide: 'wide shot',
  medium: 'medium shot at natural distance',
  detail: 'close-up detail shot',
  macro: 'extreme close-up, macro detail'
}

/** Deterministic seed from brand+subject — the subject's fixed identity across every render. */
function subjectSeed(text: string): number {
  let hash = 0
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return (hash % 90000) + 1
}

/**
 * The locked subject's HEAD NOUN — "a squat hand-blown amber-glass mezcal bottle with a cream…"
 * → "bottle". The first clause of a concrete subject description ends on the object's name; the
 * "with…" tail is modifier. Used to recognise which image keywords actually show the subject.
 */
export function subjectHead(subject: string): string {
  const first = (subject.split(/,|\bwith\b|\bon\b|\bin\b/)[0] ?? '').trim()
  const words = first.split(/\s+/).filter(Boolean)
  const head = (words[words.length - 1] ?? '').toLowerCase().replace(/[^a-z]/g, '')
  return head.length >= 3 ? head : ''
}

/**
 * Does this image keyword reference the locked subject? Continuity is keyed on THIS, not on the
 * beat's role: a "prove" beat can be a process detail (an agave cut, a weld) that must NOT inherit
 * the product's identity phrase, and the product routinely reappears outside prove beats (a closing
 * CTA). Both misfires were observed on a real run before this replaced the role trigger.
 */
export function isSubjectKw(kw: string, head: string): boolean {
  return !!head && new RegExp(`(^|[-_ ])${head}s?([-_ ]|$)`, 'i').test(kw)
}

/** The shot plan's world+beat suffix for one image — every stylistic term an image prompt carries. */
function worldSuffix(world: ShotWorld, beat: ShotBeat | undefined): string {
  return [
    beat ? SCALE_PHRASE[beat.scale] : 'medium shot at natural distance',
    'editorial photography',
    world.light,
    world.lens,
    world.texture,
    ...world.forbid.map((f) => `no ${f}`)
  ].join(', ')
}

/**
 * Build ONE image's Flux prompt from the locked shot plan — the world (light/lens/texture, committed
 * once) + this section's beat (scale) + the model's subject keyword. Replaces the old imageStyle()
 * global suffix: there is no longer a page-wide "photorealistic, cinematic lighting" blanket that
 * silently fights per-section media direction — every stylistic term now comes from the lock.
 * Subject shots carry the identity phrase VERBATIM — continuity lives in that repetition.
 */
/**
 * Disambiguate the two subjects free Flux renders worst. A terse keyword like "vet helen portrait"
 * makes Flux fill a clinic context with a golden retriever; "grandmother founder" gives a vague
 * blob. Detecting a person or animal keyword and prepending an explicit, framed noun phrase is the
 * single biggest quality lever for those categories (diagnosed on the Fenwick vet run).
 */
const PERSON_HINTS = /\b(portrait|founder|owner|team|staff|vet|doctor|nurse|lawyer|barista|maker|artisan|baker|chef|sister|brother|grandmother|grandfather|woman|man|people|headshot|person|host|guide|worker)\b/i
const ANIMAL_HINTS = /\b(dog|cat|puppy|kitten|pet|horse|animal|retriever|spaniel|terrier|bird|rabbit)\b/i

function disambiguateSubject(content: string): string {
  if (ANIMAL_HINTS.test(content)) {
    // keep the animal but demand a real photograph of it, not a stylised/cartoon render
    return `a real photograph of ${content}, natural fur detail, candid, documentary`
  }
  if (PERSON_HINTS.test(content)) {
    // force a HUMAN with explicit framing; strip the ambiguous role-name so Flux doesn't free-associate
    const framed = content.replace(/\bportrait\b/i, '').replace(/\s+/g, ' ').trim()
    return `a real candid photograph of a person — ${framed} — a real human, natural skin and features, environmental portrait, absolutely not an animal`
  }
  return content
}

function shotPrompt(world: ShotWorld, beat: ShotBeat | undefined, kw: string, subjectShot: boolean): string {
  const raw = kw.replace(/-\d+$/, '').replace(/[-_]+/g, ' ').trim() || 'abstract composition'
  const content = disambiguateSubject(raw)
  return `${subjectShot && world.subject ? `${world.subject}, ${content}` : content}, ${worldSuffix(world, beat)}`
}

function fluxUrl(prompt: string, w: number, h: number, seed: number): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=flux&seed=${seed}`
}

/**
 * Replace keyword-BLIND picsum URLs with imagery STAGED by the locked shot plan. The model still
 * emits the familiar `picsum.photos/seed/<keyword>/<w>/<h>` pattern; this deterministically upgrades
 * every one, but the upgrade now answers to the page-level sequence instead of resolving each image
 * in isolation:
 *   - source 'generated' (forced whenever a recurring subject exists): every image is Flux, prompted
 *     from ONE world (light/lens/texture) + this section's beat — no stock/generated register mixing.
 *   - source 'stock' (illustrative pages only): Unsplash keyword search with Flux fallback.
 *   - subject continuity: every prove-role image reuses the subject phrase verbatim AND a stable
 *     brand+subject seed, so the same bottle stays the same bottle across shots.
 * Returns how many were upgraded.
 */
export async function resolveImages(sections: SectionResult[], shot: ShotPlan, log: (m: string) => void = () => {}): Promise<number> {
  const re = /https:\/\/picsum\.photos\/seed\/([A-Za-z0-9_-]+)\/(\d+)\/(\d+)/g
  // TEMPLATE form: the seed segment carries ≥1 `${…}` interpolation (a mapped/dynamic src). These
  // bypass the literal pass entirely — observed live shipping unstaged founder portraits — so they
  // get their own deterministic rewrite below. Trailing query (e.g. ?grayscale) is captured to drop.
  const tplRe = /https:\/\/picsum\.photos\/seed\/((?:\$\{[^}]*\}|[^/"'`\s])+)\/(\d+)\/(\d+)((?:\?[^"'`\s]*)?)/g
  const world = shot.world
  const key = process.env.UNSPLASH_ACCESS_KEY
  const useStock = world.source === 'stock' && !!key
  const head = subjectHead(world.subject)
  const baseSeed = subjectSeed(`${world.subject || 'page'}:${world.light}`)

  // Pass 1 — rewrite TEMPLATE-LITERAL srcs into staged Flux URL templates. The dynamic expression is
  // kept verbatim and folded into the prompt at runtime via encodeURIComponent (template literals
  // nest legally inside an interpolation), so even model-authored dynamic srcs answer to the lock.
  // Cannot go through Unsplash: the keyword only exists at runtime.
  let templated = 0
  for (const s of sections) {
    const beat = shot.beats[s.index]
    s.code = s.code.replace(tplRe, (full, seg: string, w: string, h: string) => {
      if (!seg.includes('${')) return full // literal — the main pass owns it
      templated++
      const subjectShot = isSubjectKw(seg, head)
      const seed = subjectShot ? baseSeed : baseSeed + 5000 + templated * 13
      const runtimePrompt = '${encodeURIComponent(`' + seg.replace(/-/g, ' ') + ', ' + worldSuffix(world, beat) + '`)}'
      const shape = beat ? SCALE_ASPECT[beat.scale] : { w: Number(w), h: Number(h) }
      return `https://image.pollinations.ai/prompt/${runtimePrompt}?width=${shape.w}&height=${shape.h}&nologo=true&model=flux&seed=${seed}`
    })
  }

  // Pass 1b — same rewrite for STRING-CONCATENATION srcs ('https://…/seed/' + expr + '/900/1100').
  // The model produced this shape on the very next run after the template form was handled — direct
  // proof that prompt rules alone cannot hold this line; every dynamic shape needs a deterministic
  // rewrite. The expression is restricted to a conservative identifier/property chain.
  const catRe = /(["'])(https:\/\/picsum\.photos\/seed\/[^"'`]*?)\1\s*\+\s*([A-Za-z_$][\w$.]*(?:\[[^\]]*\])?)\s*\+\s*(["'])\/(\d+)\/(\d+)((?:\?[^"'`]*)?)\4/g
  for (const s of sections) {
    const beat = shot.beats[s.index]
    s.code = s.code.replace(catRe, (_full, _q1, prefix: string, expr: string, _q2, w: string, h: string) => {
      templated++
      const staticSeg = prefix.replace(/^https:\/\/picsum\.photos\/seed\//, '').replace(/-/g, ' ')
      const subjectShot = isSubjectKw(staticSeg, head) // the dynamic half is unknowable statically
      const seed = subjectShot ? baseSeed : baseSeed + 5000 + templated * 13
      const runtimePrompt = '${encodeURIComponent(`' + staticSeg + '${' + expr + '}, ' + worldSuffix(world, beat) + '`)}'
      const shape = beat ? SCALE_ASPECT[beat.scale] : { w: Number(w), h: Number(h) }
      return '`https://image.pollinations.ai/prompt/' + runtimePrompt + `?width=${shape.w}&height=${shape.h}&nologo=true&model=flux&seed=${seed}` + '`'
    })
  }

  // Pass 2 — literal srcs. Collect requests WITH their section, so each resolves under its own beat.
  const reqs: Array<{ section: SectionResult; token: string; kw: string; w: number; h: number }> = []
  for (const s of sections) {
    for (const m of s.code.matchAll(re)) {
      reqs.push({ section: s, token: m[0], kw: m[1], w: Number(m[2]), h: Number(m[3]) })
    }
  }
  if (!reqs.length && !templated) return 0

  const usedIds = new Set<string>()
  const resolved = new Map<string, string>() // per-section token → url
  let variant = 0
  let unsplashCount = 0
  let fluxCount = 0
  for (const r of reqs) {
    const beat = shot.beats[r.section.index]
    const mapKey = `${r.section.index}:${r.token}`
    if (resolved.has(mapKey)) continue
    // SOURCE ROUTING BY SLOT SIZE, not by page-level source alone.
    //
    // Measured, repeatedly: image.pollinations.ai caps EVERY response at ~0.59 megapixels whatever
    // is requested — 1680x720 comes back 1173x502, and even 2048x878 returns 1172x502, across flux,
    // turbo and the default model. So a generated image tops out around 1173px wide at 21:9. That is
    // effectively sharp at container width (~1216px) and hopeless full-bleed, where the slot is
    // 1440-2560px and the browser upscales 1.2x-2.5x. That is the softness on every run so far.
    //
    // A wide/establishing beat therefore prefers STOCK, which returns multi-thousand-pixel files —
    // but only when the shot is not carrying the page's recurring subject, because keyword search
    // cannot return the same subject twice and continuity outranks sharpness.
    const subjectForRouting = !!world.subject && isSubjectKw(r.kw, head)
    const bigSlot = beat ? beat.scale === 'establishing' || beat.scale === 'wide' : r.w >= 1400
    const preferStock = !!key && !subjectForRouting && (useStock || bigSlot)
    let url = preferStock ? await fetchUnsplash(r.kw, r.w, r.h, key!, usedIds) : null
    if (url) unsplashCount++
    else {
      // Continuity is keyed on the KEYWORD showing the subject, not on the beat's role — a prove
      // beat can be a non-subject detail, and the subject reappears outside prove beats (closing
      // CTAs). Subject shots share ONE stable seed + the verbatim identity phrase.
      const subjectShot = !!world.subject && isSubjectKw(r.kw, head)
      const seed = subjectShot ? baseSeed : baseSeed + 101 + variant++ * 7
      // the LOCKED shape: the beat's aspect overrides whatever box the model improvised
      const shape = beat ? SCALE_ASPECT[beat.scale] : { w: r.w, h: r.h }
      url = fluxUrl(shotPrompt(world, beat, r.kw, subjectShot), shape.w, shape.h, seed)
      fluxCount++
    }
    resolved.set(mapKey, url)
  }
  for (const s of sections) {
    s.code = s.code.replace(re, (full) => resolved.get(`${s.index}:${full}`) ?? full)
  }
  // Residual check — any picsum reference that survived every pass is a dynamic shape we do not
  // recognise. It CANNOT be allowed to ship silently: it bypasses the entire shot plan. Flagged on
  // the section (surfaced in the run summary like the other lints).
  for (const s of sections) {
    if (/picsum\.photos/.test(s.code)) {
      s.imageWarnings = [...(s.imageWarnings ?? []), 'unstaged dynamic image src (unrecognised shape) — bypasses the shot plan']
    }
    // A GENERATED image inside a full-bleed band is soft by arithmetic, not by bad luck: the source
    // caps at ~1173px wide and dev-bleed stretches it across the whole viewport. Contained is sharp,
    // bleeding is not — so this pairing is always wrong and is worth naming precisely.
    if (/image\.pollinations\.ai/.test(s.code) && /\bdev-bleed\b/.test(s.code)) {
      s.imageWarnings = [
        ...(s.imageWarnings ?? []),
        'generated image inside dev-bleed — the image source caps at ~1173px wide, so a full-viewport band upscales it and it reads soft. Keep generated imagery inside container-page, or reserve dev-bleed for a colour field or stock photography'
      ]
    }
  }

  const parts = [
    unsplashCount ? `${unsplashCount} Unsplash` : '',
    fluxCount ? `${fluxCount} Flux (staged)` : '',
    templated ? `${templated} dynamic src(s) rewritten to staged templates` : ''
  ].filter(Boolean)
  log(`       ↳ shot plan [${world.source}${world.subject ? `, subject-locked` : ''}]: upgraded ${resolved.size + templated} image(s) → ${parts.join(' + ')}`)
  return resolved.size + templated
}

/**
 * ONE <h1> per page — enforced deterministically, not warned about. The dominant section keeps its
 * h1 (falling back to the first section that has one); every other h1 is demoted to h2. This is the
 * KB's own one-anchor / von-Restorff rule, which a real run retrieved, cited in its plan, and then
 * violated with three h1s — proof that heading discipline cannot be left to model compliance.
 * Returns how many headings were demoted.
 */
export function enforceSingleH1(sections: SectionResult[], dominantIndex: number): number {
  const hasH1 = (s: SectionResult): boolean => /<h1[\s>]/.test(s.code)

  // ZERO h1s is as wrong as three (no page anchor, broken document outline): promote the dominant
  // section's first h2 to h1. Observed live — a primitive-backed dominant section is generated by
  // genUse, and when nothing claims the h1 every section defaults to h2.
  if (!sections.some(hasH1)) {
    const dom = sections.find((s) => s.index === dominantIndex && /<h2[\s>]/.test(s.code)) ?? sections.find((s) => /<h2[\s>]/.test(s.code))
    if (dom) {
      let done = 0
      dom.code = dom.code.replace(/<h2(\s|>)/, (_m, tail) => { done = 1; return `<h1${tail}` })
      if (done) dom.code = dom.code.replace(/<\/h2>/, '</h1>')
      return done ? -1 : 0 // -1 = one promotion (callers log it distinctly from demotions)
    }
    return 0
  }

  const owner = sections.find((s) => s.index === dominantIndex && hasH1(s)) ?? sections.find(hasH1)
  let demoted = 0
  for (const s of sections) {
    if (s === owner) {
      // even the owner keeps only its FIRST h1; later ones in the same section demote too
      let seen = 0
      s.code = s.code
        .replace(/<h1(\s|>)/g, (m, tail) => (seen++ === 0 ? m : `<h2${tail}`))
      if (seen > 1) {
        let closes = 0
        s.code = s.code.replace(/<\/h1>/g, () => (closes++ === 0 ? '</h1>' : '</h2>'))
        demoted += seen - 1
      }
      continue
    }
    const count = (s.code.match(/<h1[\s>]/g) ?? []).length
    if (count) {
      s.code = s.code.replace(/<h1(\s|>)/g, '<h2$1').replace(/<\/h1>/g, '</h2>')
      demoted += count
    }
  }
  return demoted
}

/**
 * Design-system conformance lint: does the section actually USE the locked layout utilities, or did
 * it re-decide padding/container per-section? Root-section checks only — inner cards/rows may pad
 * themselves freely. Feeds the same warn→fix escalation as lintTheme.
 */
export function lintDesign(code: string): string[] {
  const warns: string[] = []
  const root = code.match(/<section\b[^>]*?className=(?:"([^"]*)"|\{`([^`]*)`\})/s)
  const cls = root ? (root[1] ?? root[2] ?? '') : ''
  if (root) {
    if (!/\bsection-pad(-hero)?\b/.test(cls)) {
      const py = cls.match(/\b(?:py|pt|pb)-(\d+|\[[^\]]+\])/)
      warns.push(
        py
          ? `root section uses ${py[0]} instead of the locked section-pad rhythm`
          : 'root section missing section-pad (locked padding rhythm)'
      )
    }
  }
  if (!/\bcontainer-page\b/.test(code) && /max-w-(?:xl|2xl|3xl|4xl|5xl|6xl|7xl)[^"]*"?[^>]*mx-auto|mx-auto[^>]*max-w-/.test(code)) {
    warns.push('hand-rolled max-w container instead of the locked container-page')
  }
  // FLATNESS — repeating structure arranged by hand instead of with a device is the stacked-
  // rectangles failure. There are two ways a section reveals it, and counting card literals only
  // catches the first:
  //
  //   1. blocks written out one by one  -> several card classNames in the source
  //   2. blocks rendered from an array  -> ONE className literal inside a .map(), however many
  //      items render
  //
  // Only (1) was detected, so every mapped feature grid — the most common shape on a product page,
  // and the one that most needs a device — sailed through. Observed live: a "modular" section built
  // a hand-rolled md:grid-cols-4 from a .map() and the lint stayed silent.
  //
  // The robust tell is the CONTAINER, not the children: a multi-column grid or a wrapping flex row
  // is a section arranging siblings itself. If it does that with no device, it is hand-rolling
  // geometry the page already owns.
  // A hallucinated device is worse than no device: the class is inert, nothing errors, and the
  // section looks compliant to every other check while rendering as unstyled blocks.
  const invented = unknownDeviceClasses(code)
  if (invented.length) {
    warns.push(
      `invented device class${invented.length > 1 ? 'es' : ''} ${invented.join(', ')} — no such class exists, so it does nothing. Use one of: ${DEVICE_NAMES.join(', ')}`
    )
  }

  const hasDevice = DEVICE_RE.test(code)
  const cardLiterals = (code.match(/className="[^"]*\b(rounded-|border |bg-card)/g) ?? []).length
  const handRolledGrid = /className="[^"]*\bgrid-cols-(?:[2-9]|1[0-2])\b/.test(code) || /className="[^"]*\b(?:sm|md|lg|xl):grid-cols-(?:[2-9]|1[0-2])\b/.test(code)
  const wrappingRow = /className="[^"]*\bflex\b[^"]*\bflex-wrap\b/.test(code)
  const rendersList = /\.map\(/.test(code)

  if (!hasDevice) {
    if (handRolledGrid) {
      warns.push(
        `multi-column grid built by hand (grid-cols-*) with no composition device — apply a dev-* class instead of arranging the columns yourself${rendersList ? ' (the items come from a .map, so a device applies to the container once)' : ''}`
      )
    } else if (wrappingRow) {
      warns.push('wrapping flex row of siblings with no composition device — the page already owns this geometry')
    } else if (cardLiterals >= 3) {
      warns.push(`${cardLiterals} sibling blocks arranged with no composition device (stacked rectangles)`)
    }
  }

  // Improvised entrances — the last piece of motion sections were still inventing for themselves.
  warns.push(...lintReveal(code))

  // Interior escapes — content that breaks OUT of the locked container (observed live: text flush
  // against the viewport edge, a numeral clipped in half at the right edge).
  if (/\bw-screen\b/.test(code)) warns.push('w-screen escapes the locked container (content touches/clips at viewport edges)')
  if (/(?:^|[\s"'])-m[xlr]-(?:\d|\[)/.test(code)) warns.push('negative horizontal margin escapes the locked container')
  if (/\bmax-w-none\b/.test(code)) warns.push('max-w-none defeats the locked container width')
  return warns
}

/**
 * DENSITY FLOOR — a section with two lines of copy must not occupy a full viewport of void. Only the
 * dominant (hero) section may claim viewport height; everywhere else min-h-screen / h-screen and
 * near-viewport min-heights are stripped deterministically (observed live: an entire 800px viewport
 * holding one heading and two lines). The locked section-pad rhythm already provides the air.
 */
export function enforceDensity(sections: SectionResult[], dominantIndex: number): number {
  let stripped = 0
  // no trailing \b — `]` and the following quote are both non-word chars, so a boundary never exists
  // there and the bracket variants would silently survive (caught by the fixture test)
  const re = /(?:\b(?:min-h-screen|h-screen)\b|min-h-\[(?:100|9\d|8\d)[sd]?vh\]) ?/g
  for (const s of sections) {
    if (s.index === dominantIndex) continue
    const n = (s.code.match(re) ?? []).length
    if (n) {
      s.code = s.code.replace(re, '')
      stripped += n
    }
  }
  return stripped
}

/** The corrective block for a design-system retry — names the exact utilities, same as themeCorrection. */
function designCorrection(violations: string[], composition?: Composition): string {
  const deviceHint = composition
    ? `
- If the violation mentions "stacked rectangles": apply the composition device "${DEFAULT_DEVICE[composition]}" (defined in globals.css) to the repeating blocks, or another dev-* device that fits better. Do not hand-roll the arrangement.`
    : ''
  return `CRITICAL — your previous attempt IGNORED the page's locked layout system. Violations: ${violations.join('; ')}.${deviceHint}
globals.css already defines the system; use it exactly:
- root <section> className includes "section-pad" (hero: "section-pad-hero") — remove any py-*/pt-*/pb-* from the root section
- the outermost content wrapper is className "container-page" — remove hand-rolled max-w-*/mx-auto from it
Keep the same structure and copy; this is a conformance fix, not a redesign.`
}

/** Pull an image URL's intrinsic dimensions out of the URL itself (all three source shapes carry them). */
function urlDims(src: string): { w: number; h: number } | null {
  const m =
    src.match(/[?&]width=(\d+)&height=(\d+)/) ?? // pollinations
    src.match(/[?&]w=(\d+)&h=(\d+)/) ??          // unsplash raw params
    // unresolved placeholder — seed class deliberately loose so a template-literal seed
    // (`${gen.imageKey}`) still yields its static /w/h segment
    src.match(/picsum\.photos\/seed\/[^/\s"'`]+\/(\d+)\/(\d+)/)
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null
}

/**
 * Enforce media-direction.md's own rule — "explicit dimensions to avoid layout shift" — which nothing
 * enforced until now (0 of 8 imgs carried them on a real run). Generated images arrive seconds late
 * (Flux renders on demand); without an intrinsic ratio the browser reserves zero height, and the late
 * arrival shifts layout — which also leaves scroll-driven primitives holding stale positions. Every
 * <img> without explicit dimensions gets width/height derived from its own URL, and below-the-fold
 * sections get loading="lazy" (the opener stays eager — it IS the fold). Deterministic, per the
 * palette/interaction discipline: applied in code, never left to model compliance.
 */
/**
 * End of the JSX tag opening at `start` (the '<'). Brace/quote-aware ON PURPOSE: a `>` inside an
 * attribute expression — `onLoad={() => setLoaded(true)}` — is NOT the tag end. The naive [^>]*
 * version spliced attributes into the middle of exactly such handlers, breaking VALID model output
 * at write time (caught live via a quarantine evidence dump: "broken by a writer transform").
 */
function jsxTagEnd(code: string, start: number): { end: number; selfClosing: boolean } | null {
  let depth = 0
  let quote: string | null = null
  for (let i = start + 1; i < code.length; i++) {
    const ch = code[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '{') { depth++; continue }
    if (ch === '}') { depth--; continue }
    if (ch === '>' && depth === 0) return { end: i, selfClosing: code[i - 1] === '/' }
  }
  return null
}

export function hardenImages(sections: SectionResult[], beats?: ShotBeat[]): number {
  let changed = 0
  for (const s of sections) {
    // collect tag starts first, then edit back-to-front so earlier indices stay valid
    const starts: number[] = []
    const re = /<img\b/g
    for (let m = re.exec(s.code); m; m = re.exec(s.code)) starts.push(m.index)
    for (let k = starts.length - 1; k >= 0; k--) {
      const tag = jsxTagEnd(s.code, starts[k])
      if (!tag) continue
      const insertAt = tag.selfClosing ? tag.end - 1 : tag.end
      const attrs = s.code.slice(starts[k] + 4, insertAt)
      // capture terminates on quote/backtick/whitespace ONLY — `}` must stay legal inside the URL,
      // or a template-literal src truncates at `${expr}` and its /w/h segment is lost
      const srcM = attrs.match(/src=\{?["'`]?(https?:\/\/[^"'`\s]+)/)
      // Fallback to the whole attr string: a staged template src nests a backtick
      // (encodeURIComponent(`…`)) that terminates the capture before ?width=…&height=…. Safe —
      // every dims pattern requires a [?&] or path prefix that a JSX attribute cannot have.
      const dims = (srcM ? urlDims(srcM[1]) : null) ?? urlDims(attrs)
      // Attribute presence must be checked at a token boundary — every Flux URL contains
      // "width=1600&height=900" INSIDE the src string, and \bwidth= matches there, which silently
      // skipped exactly the images that need hardening most (found by the fixture test).
      const hasAttr = (name: string): boolean => new RegExp(`(^|\\s)${name}\\s*=`).test(attrs)
      let add = ''
      if (dims && !hasAttr('width')) add += ` width={${dims.w}} height={${dims.h}}`
      if (!hasAttr('loading') && s.index > 0) add += ` loading="lazy"`
      if (!hasAttr('decoding')) add += ` decoding="async"`
      // the LOCKED shape class — aspect-ratio + object-fit: cover from globals.css; stamped
      // deterministically so an image can never be stretched into an improvised box
      const beat = beats?.[s.index]
      // NEVER stamp a shape class when a WRAPPER already carries one: the model sometimes puts
      // shot-* on the image's frame, and a second, different aspect on the <img> inside it fights
      // the frame — the image is forced past its box and clipped (observed live: a shot-wide card
      // holding a shot-detail image). One aspect per image, wherever it is declared.
      const wrapperHasShot = /\bshot-(establishing|wide|medium|detail|macro)\b/.test(
        s.code.slice(Math.max(0, starts[k] - 400), starts[k])
      )
      const shotClass =
        beat && !wrapperHasShot && /pollinations|picsum|unsplash|data:image/.test(attrs) ? `shot-${beat.scale}` : null
      let classInsert: { at: number; text: string } | null = null
      if (shotClass && !attrs.includes('shot-')) {
        const cm = /className="/.exec(attrs)
        if (cm) classInsert = { at: starts[k] + 4 + cm.index + cm[0].length, text: `${shotClass} ` }
        else add += ` className="${shotClass}"`
      }
      if (!add && !classInsert) continue
      changed++
      s.code = s.code.slice(0, insertAt) + add + (tag.selfClosing ? ' ' : '') + s.code.slice(insertAt)
      if (classInsert) s.code = s.code.slice(0, classInsert.at) + classInsert.text + s.code.slice(classInsert.at)
    }
  }
  return changed
}

/** On-palette SVG fallback for an image that genuinely failed — never a bare gray box. */
function fallbackSvg(palette: { background: string; card: string; accent: string }, w: number, h: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${palette.card}"/><stop offset="1" stop-color="${palette.background}"/></linearGradient><radialGradient id="r" cx="0.7" cy="0.3" r="0.9"><stop offset="0" stop-color="${palette.accent}" stop-opacity="0.18"/><stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#r)"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/**
 * One fetch, classified. 'ok' = a real image (content-type + weight — Pollinations returns HTTP 200
 * HTML error pages, so status alone lies). 'ratelimited' = 429/5xx/timeout — the image is fine, the
 * server said WAIT (measured: 11 of 12 concurrent requests get an instant 429; treating that as a
 * failure would fall back perfectly healthy images). 'bad' = a real content failure worth a seed change.
 */
type FetchVerdict = 'ok' | 'ratelimited' | 'bad'

/**
 * Real pixel dimensions from a PNG/JPEG header. Cheap: reads the header bytes we already hold, no
 * decoding and no dependency. Needed because the provider's response says nothing about how much it
 * downscaled the request.
 */
export function imageDimensions(b: Buffer): { w: number; h: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2
    while (o < b.length - 9) {
      if (b[o] !== 0xff) {
        o++
        continue
      }
      const m = b[o + 1]!
      // SOF markers carry the frame size; skip DHT/DAC/DRI which share the c0-cf range.
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { w: b.readUInt16BE(o + 7), h: b.readUInt16BE(o + 5) }
      }
      o += 2 + b.readUInt16BE(o + 2)
    }
  }
  return null
}

/** Last observed resolution shortfall, reported once per run rather than per image. */
let lastShortfall: { url: string; asked: number; got: number } | null = null
export const takeShortfall = (): typeof lastShortfall => {
  const s = lastShortfall
  lastShortfall = null
  return s
}
async function fetchImageVerdict(url: string, timeoutMs: number): Promise<FetchVerdict> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (res.status === 429 || res.status === 503 || res.status === 529 || res.status === 502) return 'ratelimited'
    if (!res.ok) return 'bad'
    if (!(res.headers.get('content-type') ?? '').startsWith('image/')) return 'bad'
    const buf = await res.arrayBuffer()
    if (buf.byteLength <= 5120) return 'bad'
    // Record what the provider ACTUALLY returned. It silently ignores the requested size and caps
    // every response near 0.59MP, so "the file exists" was never evidence the image is usable —
    // which is exactly how soft imagery shipped on three consecutive runs without one warning.
    const got = imageDimensions(Buffer.from(buf))
    const want = url.match(/[?&]width=(\d+)/)
    if (got && want) {
      const asked = Number(want[1])
      if (got.w < asked * 0.8) lastShortfall = { url, asked, got: got.w }
    }
    return 'ok'
  } catch {
    return 'ratelimited' // timeout/network — the render may just be slow; retrying is cheap, falling back isn't
  } finally {
    clearTimeout(timer)
  }
}

/** Verify one URL with patience for rate limits: up to 5 attempts with growing waits. */
async function verifyImage(url: string, log: (m: string) => void): Promise<'ok' | 'bad'> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const v = await fetchImageVerdict(url, 60000)
    if (v !== 'ratelimited') return v
    if (attempt < 5) {
      const wait = 4000 * attempt
      log(`       ↳ pre-warm: rate-limited — waiting ${wait / 1000}s (attempt ${attempt}/4)`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  return 'bad'
}

/**
 * PRE-WARM every generated-image URL before the page ships — the "no eyes" fix for imagery.
 * Flux renders on demand (5-30s cold) and Pollinations drops/queues bursts, so a page firing 7+
 * simultaneous requests from the browser shows empty boxes for some of them, sometimes forever.
 * Server-side, with bounded concurrency: fetch each URL fully (which also populates Pollinations'
 * cache, so the user's first view is instant), VERIFY it is a real image (content-type + size —
 * status alone lies), retry failures once on a shifted seed, and replace a second failure with an
 * on-palette SVG fallback — never a bare gray box. Gated by DESIGN_PREWARM ('off' disables),
 * independent of the visual-critique gate.
 */
export async function prewarmImages(
  sections: SectionResult[],
  palette: { background: string; card: string; accent: string },
  log: (m: string) => void = () => {}
): Promise<{ verified: number; retried: number; fallbacks: number; skippedDynamic: number }> {
  const out = { verified: 0, retried: 0, fallbacks: 0, skippedDynamic: 0 }
  if ((process.env.DESIGN_PREWARM ?? 'on').toLowerCase() === 'off') return out

  const re = /https:\/\/image\.pollinations\.ai\/prompt\/[^"'`\s]+/g
  const urls = new Set<string>()
  for (const s of sections) {
    for (const m of s.code.matchAll(re)) {
      if (m[0].includes('${')) out.skippedDynamic++ // runtime-composed — cannot be pre-warmed
      else urls.add(m[0])
    }
  }
  if (!urls.size) return out

  const replaceEverywhere = (from: string, to: string): void => {
    for (const s of sections) s.code = s.code.split(from).join(to)
  }
  const shiftSeed = (url: string): string =>
    url.replace(/([?&]seed=)(\d+)/, (_m, p, n) => `${p}${Number(n) + 7777}`)
  const dims = (url: string): { w: number; h: number } => {
    const m = url.match(/[?&]width=(\d+)&height=(\d+)/)
    return { w: m ? Number(m[1]) : 1200, h: m ? Number(m[2]) : 800 }
  }

  // SERIAL on purpose: Pollinations rate-limits concurrency per IP (measured: 11 of 12 parallel
  // requests → instant 429). One at a time with a courtesy gap is the fastest reliable shape.
  // Progress is logged PER IMAGE — a healthy pre-warm is minutes of network silence otherwise,
  // which reads as a hang in the studio (it did, to a real user).
  let done = 0
  const total = urls.size
  for (const url of urls) {
    const t0 = Date.now()
    if ((await verifyImage(url, log)) === 'ok') {
      out.verified++
      log(`       ↳ pre-warm ${++done}/${total} ok (${Math.round((Date.now() - t0) / 1000)}s — generating fresh imagery, ~1min each)`)
    } else {
      const retryUrl = shiftSeed(url)
      if (retryUrl !== url && (await verifyImage(retryUrl, log)) === 'ok') {
        replaceEverywhere(url, retryUrl)
        out.retried++
        out.verified++
        log(`       ↳ pre-warm ${++done}/${total} ok on a retried seed`)
      } else {
        const { w, h } = dims(url)
        replaceEverywhere(url, fallbackSvg(palette, w, h))
        out.fallbacks++
        log(`       ↳ pre-warm ${++done}/${total} failed twice (content, not rate limit) → on-palette fallback (${w}x${h})`)
      }
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  log(`       ↳ pre-warm: ${out.verified}/${urls.size} image(s) verified real${out.retried ? ` (${out.retried} on retried seeds)` : ''}${out.fallbacks ? `, ${out.fallbacks} → fallback` : ''}${out.skippedDynamic ? `, ${out.skippedDynamic} dynamic skipped` : ''}`)
  // Surface the provider's silent downscaling once per run. Without this the page just looks soft
  // and nothing anywhere says why.
  const short = takeShortfall()
  if (short) {
    log(
      `       ↳ \x1b[33mimage resolution\x1b[0m: provider returned ${short.got}px wide for a ${short.asked}px request (it caps near 0.59MP). Generated imagery is only sharp inside container-page, never full-bleed.`
    )
  }
  return out
}

/**
 * Deduplicate image seeds across the whole page: the same picsum seed+size renders the SAME photo,
 * so repeats look like a bug. Rewrites later collisions to a distinct seed. Returns how many changed.
 */
export function dedupeImages(sections: SectionResult[]): number {
  const seen = new Set<string>()
  let changed = 0
  const re = /picsum\.photos\/seed\/([A-Za-z0-9_-]+)(\/\d+\/\d+)/g
  for (const s of sections) {
    s.code = s.code.replace(re, (full, seed: string, dims: string) => {
      if (!seen.has(`${seed}${dims}`)) {
        seen.add(`${seed}${dims}`)
        return full
      }
      let n = 2
      while (seen.has(`${seed}-${n}${dims}`)) n++
      seen.add(`${seed}-${n}${dims}`)
      changed++
      return `picsum.photos/seed/${seed}-${n}${dims}`
    })
  }
  return changed
}

function parseExports(code: string): { named: string[]; hasDefault: boolean } {
  const named = [...code.matchAll(/export\s+(?:const|function|class)\s+([A-Za-z0-9_]+)/g)].map((m) => m[1])
  return { named: [...new Set(named)], hasDefault: /export\s+default/.test(code) }
}

/**
 * Pick a motion primitive that fits this section. `hits` are ALREADY filtered to the run's locked
 * motion language by retrieval — here we only match content-fit: the primitive's fitsCompositions
 * must include this section's composition. Capability-gated, not tied to a fixed section vocabulary.
 */
export function selectMotionPrimitive(composition: Composition, hits: SearchHit[]): MotionPrimitiveDoc | null {
  for (const h of hits) {
    const p = h.payload as MotionPrimitiveDoc
    if ((p.fitsCompositions ?? []).includes(composition)) return p
  }
  return null
}

/** Adapt a motion primitive to the ComponentDoc shape so it rides the proven generation rails
 *  (genUse, usesComponent, usedComponents, the writer). */
function asComponent(p: MotionPrimitiveDoc): ComponentDoc {
  return {
    id: p.id,
    name: p.name,
    category: p.effect,
    framework: p.framework,
    tags: p.tags,
    code: p.code,
    dependencies: p.dependencies,
    registry_files: p.registry_files,
    client_component: p.client_component,
    usage_example: p.usage_example,
    source_url: p.source_url,
    license: p.license,
    notes: p.notes
  }
}

/**
 * Read a JS/JSX array literal starting at the `[` at `open`, returning its TOP-LEVEL element count and
 * source text. Bracket-balanced, string-aware AND JSX-aware on purpose: card content is prose, and
 * prose has commas. `<article>Sourced, pressed, aged</article>` sits at bracket-depth 1, so tracking
 * only [ { ( would read those two commas as card separators and report 7 cards where there are 3.
 * JSX element nesting is therefore counted separately — commas only separate cards when we are
 * outside every tag.
 */
function readArrayLiteral(code: string, open: number): { count: number; text: string } | null {
  if (code[open] !== '[') return null
  let depth = 0
  let jsx = 0 // open JSX elements — commas inside a tag's children are content, not separators
  let items = 0
  let seg = false // does the current top-level segment have any content? (handles trailing commas)
  let quote: string | null = null
  for (let i = open; i < code.length; i++) {
    const ch = code[i]
    const next = code[i + 1]
    if (quote) {
      if (ch === '\\') { i++; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; seg = true; continue }
    // JSX: <Tag …  |  </Tag>  |  … />
    if (ch === '<' && next === '/') { jsx--; seg = true; i++; continue }
    if (ch === '<' && /[A-Za-z]/.test(next ?? '')) { jsx++; seg = true; continue }
    if (ch === '/' && next === '>') { jsx--; seg = true; i++; continue }
    if (ch === '[' || ch === '{' || ch === '(') { depth++; if (depth > 1) seg = true; continue }
    if (ch === ']' || ch === '}' || ch === ')') {
      depth--
      if (depth === 0) return { count: seg ? items + 1 : items, text: code.slice(open, i + 1) }
      seg = true
      continue
    }
    if (ch === ',' && depth === 1 && jsx === 0) { if (seg) items++; seg = false; continue }
    if (depth === 1 && !/\s/.test(ch)) seg = true
  }
  return null // unbalanced — the parse check upstream would already have rejected this
}

/**
 * Locate the array passed to `prop`. Handles both the inline form (`cards={[…]}`) and the extracted
 * form (`cards={items}` + `const items = […]`), which the model uses about as often.
 */
function findPropArray(code: string, prop: string): { count: number; text: string } | null {
  const at = code.search(new RegExp(`\\b${prop}\\s*=\\s*\\{`))
  if (at === -1) return null
  let i = code.indexOf('{', at) + 1
  while (i < code.length && /\s/.test(code[i])) i++
  if (code[i] === '[') return readArrayLiteral(code, i)
  // identifier → find its declaration
  const id = code.slice(i).match(/^[A-Za-z_$][\w$]*/)?.[0]
  if (!id) return null
  const decl = code.search(new RegExp(`\\b(?:const|let|var)\\s+${id}\\b[^=]*=\\s*\\[`))
  if (decl === -1) return null
  return readArrayLiteral(code, code.indexOf('[', decl))
}

/**
 * Validate a motion-primitive-backed section: (1) the composition contract — the section must render
 * the primitive (usesComponent covers the import; here we confirm the JSX tag), (2) any tween params
 * the model wrote are in-bounds: start/end within 0..100 and start < end, and (3) for a `wraps:
 * 'card-list'` primitive, the multi-child contract: an array is actually passed, its length is within
 * the declared bounds, and any hand-written ordering is strictly increasing. Flags only.
 */
export function validatePrimitive(code: string, importPath: string, prim: MotionPrimitiveDoc): string[] {
  const warns: string[] = []
  const local = importedLocalName(code, importPath, asComponent(prim))
  if (!local || !new RegExp(`<${local}\\b`).test(code)) {
    warns.push(`does not render <${prim.name}> (wraps:${prim.wraps} contract unmet)`)
  }
  for (const m of code.matchAll(/start:\s*(-?\d+(?:\.\d+)?)[\s\S]{0,80}?end:\s*(-?\d+(?:\.\d+)?)/g)) {
    const s = Number(m[1])
    const e = Number(m[2])
    if (s < 0 || s > 100 || e < 0 || e > 100) warns.push(`tween start/end out of 0-100 (${s}/${e})`)
    else if (s >= e) warns.push(`tween start >= end (${s} >= ${e})`)
  }

  // Multi-child card-list contract — a different failure class from single-tween params.
  if (prim.wraps === 'card-list' && prim.cardList) {
    const { prop, min, max } = prim.cardList
    const arr = findPropArray(code, prop)
    if (!arr) {
      warns.push(`card-list contract: no ${prop}={[...]} array found (expects ${min}-${max} cards)`)
    } else {
      if (arr.count < min) warns.push(`card-list ${prop} has ${arr.count} card(s), below the ${min} the choreography needs`)
      else if (arr.count > max) warns.push(`card-list ${prop} has ${arr.count} cards, above the ${max} the stagger window supports`)

      // If the model hand-wrote per-card ordering, it must be strictly increasing — a dealt hand that
      // deals out of order reads as a bug, and the primitive's own stagger assumes array order.
      const order = [...arr.text.matchAll(/\b(?:index|order|step|seq)\s*:\s*(-?\d+)/g)].map((m) => Number(m[1]))
      if (order.length > 1 && !order.every((v, i) => i === 0 || v > order[i - 1])) {
        warns.push(`card-list explicit ordering is not strictly increasing (${order.join(', ')})`)
      }
      if (order.length > 0 && order.length !== arr.count) {
        warns.push(`card-list ordering is partial: ${order.length} of ${arr.count} cards carry an explicit index`)
      }
    }
  }
  return warns
}

function guidelineDigest(hits: SearchHit[], maxLen = 320): string {
  return hits
    .map((h) => {
      const p = h.payload as { heading?: string; body?: string }
      return `- ${p.heading ?? h.name}: ${(p.body ?? h.embed_text).replace(/\s+/g, ' ').slice(0, maxLen)}`
    })
    .join('\n')
}

const SYSTEM_USE = `You write ONE React section as a single default-export function component, in TypeScript/TSX.
You are given a pre-built motion primitive and a short USAGE EXAMPLE showing how to import and render it.
Adapt that example to the brief. Rules:
- Start from the usage example. Keep the same imports and the same prop/data SHAPE.
- Import the primitive from the exact path given (replace './component' in the example with it).
- Do NOT rewrite or reimplement the primitive, and do NOT invent props that aren't in the example.
- Plain HTML only for anything you add: use <img> and <a>, NEVER next/image's <Image> or next/link's <Link>, and do not import next/*.
- This runs in the BROWSER: never use Node.js globals — no process / process.env, require, module, __dirname, __filename.
- Output ONLY the code (imports + one \`export default function\`). No prose, no markdown fences.
- Replace the example's placeholder copy/data with concrete, on-brief content — never lorem ipsum.
- ${IMAGE_RULE}
- ${THEME_CLASSES}
- ${LAYOUT_SYSTEM}`

const SYSTEM_SCRATCH = `You write ONE React landing-page section as a single default-export function component, in TypeScript/TSX.
There is no pre-made component for this section, so build it from scratch. Rules:
- Pure React + Tailwind only. The ONLY import allowed is React itself — \`import React, { useState, useEffect, useRef } from 'react'\`
  (needed for hooks). Do NOT import any other package or file (no framer-motion, gsap, anime.js, next/*, no './...').
- Plain HTML elements only: use <img> and <a>, NEVER next/image's <Image> or next/link's <Link>.
- This runs in the BROWSER: never use Node.js globals — no process / process.env, require, module, __dirname, __filename.
- MOTION is allowed but CSS-ONLY (no libraries). For HOVER/PRESS feedback, apply the committed "mi" / "mi-lift" /
  "mi-press" utility classes (see the MICRO-INTERACTIONS block) rather than hand-rolling durations — they carry the
  run's locked timing + reduced-motion fallback. SCROLL REVEALS ARE ALREADY DONE FOR YOU: every section receives the
  locked "reveal" (CSS scroll-driven, reduced-motion safe). Do NOT write an IntersectionObserver, do NOT toggle
  opacity from state, and do NOT use transition-all. Add the class "reveal" to an inner block only if it genuinely
  needs to arrive separately. Animate ONLY transform and opacity, and gate any other effect behind
  @media (prefers-reduced-motion: reduce). Motion is optional polish, never required to read the content.
- LAYOUT (hard rules — a broken grid is worse than a plain one): every flex row or grid MUST set an explicit gap (gap-4/gap-8)
  so children never collide, and multi-item flex rows MUST include flex-wrap. Wrap content in a centered container
  (max-w-6xl mx-auto px-6). Section vertical padding py-20 to py-28 — NOT more, and NEVER min-h-screen on a non-hero section.
- Output ONLY the code (one \`export default function\`). No prose, no markdown fences.
- Follow the COMPOSITION, STRUCTURE RULES and DESIGN JUDGEMENT provided below. One accent color. Real, on-brief copy — never lorem ipsum.
- ${THEME_CLASSES}
- ${LAYOUT_SYSTEM}`

/** Did the generated section actually import its assigned primitive? Cheap, no LLM. */
function usesComponent(code: string, importPath: string): boolean {
  const esc = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`from\\s+['"]${esc}['"]`).test(code)
}

/** The local identifier that `importPath` is bound to in `code` (default or named/aliased import). */
function importedLocalName(code: string, importPath: string, comp: ComponentDoc): string | null {
  const esc = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const def = code.match(new RegExp(`import\\s+([A-Za-z0-9_]+)\\s+from\\s+['"]${esc}['"]`))
  if (def) return def[1]
  const named = code.match(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s+['"]${esc}['"]`))
  if (named) {
    const bindings = named[1]
      .split(',')
      .map((p) => p.trim().match(/^([A-Za-z0-9_]+)(?:\s+as\s+([A-Za-z0-9_]+))?$/))
      .filter((m): m is RegExpMatchArray => !!m)
    const exports = parseExports(comp.code).named
    const chosen = bindings.find((m) => exports.includes(m[1])) ?? bindings[0]
    if (chosen) return chosen[2] ?? chosen[1]
  }
  return null
}

/** Adapt a motion primitive's usage example to the brief (its import path is bound to importPath). */
async function genUse(
  plan: Plan,
  section: SectionPlan,
  comp: ComponentDoc,
  importPath: string,
  mi: InteractionSpec,
  tier: GenTier,
  /** dominance (h1 ownership) + image beat — primitive-backed sections need this too, or a
   *  primitive-backed dominant section is never told it owns the page's single h1 (observed live) */
  shot?: { beat?: ShotBeat; dominant: boolean; subjectHead?: string },
  strict = false
): Promise<string> {
  const { named, hasDefault } = parseExports(comp.code)
  const exportsLine = hasDefault
    ? `default export (import as \`import Comp from '${importPath}'\`)`
    : `named exports: ${named.join(', ')}`
  // The usage example is the whole point — the model adapts a short skeleton instead of drowning in
  // the primitive's full source. Fall back to a source excerpt only if there's no usage_example yet.
  const skeleton = comp.usage_example
    ? comp.usage_example.replace(/'\.\/component'/g, `'${importPath}'`)
    : `// no usage example on file; source excerpt:\n${comp.code.slice(0, 1500)}`
  const user = `Brand: ${plan.brand}
Brief: ${plan.brief}
Mood: ${plan.moodProfile}
Must avoid: ${plan.avoidances.join('; ') || '(no additional constraints)'}
Section: ${section.name} — ${section.intent}
Composition: ${section.composition}${section.media ? ` · media: ${section.media}` : ''}${section.motion ? ` · motion: ${section.motion}` : ''}
Narrative patterns: ${plan.layoutPatterns?.length ? plan.layoutPatterns.join(', ') : '(none selected)'}

Motion primitive "${comp.name}" (${comp.id}) — ${exportsLine}. Import from '${importPath}'.
Notes: ${comp.notes ?? '(none)'}

USAGE EXAMPLE (adapt the copy/data to the brief; keep the imports + prop shape):
${skeleton}

${interactionDirective(mi)}${shotDirective(shot)}
${
  strict
    ? `\nCRITICAL: your previous attempt did NOT import the primitive and was rejected. The FIRST line\n` +
      `must be an import from '${importPath}', and ${comp.name} must be the root element you render.\n` +
      `Do NOT write your own component. Only adapt the usage example above.`
    : ''
}
Write the section now.`
  return extractCode(await runTier(tier)(SYSTEM_USE, user, { temperature: strict ? 0.2 : 0.5, maxTokens: MAX_SECTION_TOKENS }))
}

/**
 * This section's slice of the locked shot plan, expressed for its prompt: which scale beat its image
 * is, and whether it carries the page's ONE dominant image. Composition guidance only — the actual
 * image prompt/source is applied deterministically later by resolveImages.
 */
function shotDirective(shot?: { beat?: ShotBeat; dominant: boolean; subjectHead?: string }): string {
  if (!shot) return ''
  const h1 = shot.dominant
    ? `\nHEADINGS — this IS the page's dominant section: it carries the page's single <h1>. Every other section uses <h2>/<h3>.`
    : `\nHEADINGS — this is NOT the dominant section: use <h2>/<h3> only, never <h1>.`
  if (!shot.beat) return h1
  return `${h1}\nIMAGE STAGING — this section's image is the page's "${shot.beat.scale}" beat (job: ${shot.beat.role}). Size and crop the image slot for that scale.${
    shot.dominant
      ? ' This section carries the page\'s ONE dominant image — give it clearly the largest visual presence on the page; every other section\'s imagery is subordinate.'
      : ' This is NOT the dominant image — keep it subordinate in size to the dominant section.'
  }${
    shot.subjectHead
      ? ` If an image shows the product itself, include the word "${shot.subjectHead}" in its picsum keyword — that is how it inherits the page's locked product identity.`
      : ''
  }`
}

async function genScratch(
  plan: Plan,
  section: SectionPlan,
  moodGuidelines: SearchHit[],
  structural: SearchHit[],
  critiques: SearchHit[],
  avoidances: SearchHit[],
  /** 2 compositional CRAFT principles — how to build depth/hierarchy, not what to avoid */
  craft: SearchHit[],
  /** 2 ready-made DEVICES (verified CSS classes) this section can apply directly */
  devices: SearchHit[],
  mi: InteractionSpec,
  tier: GenTier,
  /** this section's beat in the locked shot plan (omitted for non-photo moods) */
  shot?: { beat?: ShotBeat; dominant: boolean; subjectHead?: string },
  /** corrective block appended on an escalated retry (e.g. themeCorrection) — omitted on first pass */
  push?: string
): Promise<string> {
  const user = `Brand: ${plan.brand}
Brief: ${plan.brief}
Mood: ${plan.moodProfile}
Section: ${section.name} — ${section.intent}
Composition: ${section.composition} (${COMPOSITION_HINT[section.composition]})${section.media ? `\nMedia direction: ${section.media}` : ''}${section.motion ? `\nMotion note: ${section.motion}` : ''}
Emphasis (proportional height): ${section.emphasis}
Narrative patterns: ${plan.layoutPatterns?.length ? plan.layoutPatterns.join(', ') : '(none selected)'}

STRUCTURE RULES (spacing + layout for THIS composition — follow these precisely):
${guidelineDigest(structural, 600) || '- (none retrieved; use a centered max-w container, an even grid with gap, generous but not excessive padding)'}

COMPOSITION CRAFT (the principle to apply — how this section earns depth and hierarchy instead of stacked rectangles):
${guidelineDigest(craft, 520) || '- (none retrieved; at minimum give the section one clear focal element and one scale contrast)'}

READY-MADE DEVICES (globals.css already defines these; their geometry is correct and responsive — apply the CLASS, never rebuild the layout by hand):
${guidelineDigest(devices, 460) || '- (none retrieved)'}
The full set of classes available to you: ${DEVICE_NAMES.join(', ')}. Retrieval showed the two most relevant above, but any of these is defined and safe to use.
DEFAULT for a "${section.composition}" section: ${DEFAULT_DEVICE[section.composition]}. Apply it, or another device above that genuinely fits this content better. Only skip devices entirely if this section is a single short statement with no repeating items, no media, and no quotation — a section of stacked text blocks and plain rectangles is a FAILURE this library exists to prevent.

${voicePromptBlock(voiceFor(plan.register, plan.mood), plan.brand)}

DESIGN JUDGEMENT (from critiques of real sites — apply the underlying principle, don't copy):
${critiqueDigest(critiques) || '- (none retrieved)'}

Mood / style rules:
${guidelineDigest(moodGuidelines, 260) || '- (apply general good taste for the mood)'}

ANTI-PATTERNS (hard counterevidence for this section; do not reproduce these failure modes):
${guidelineDigest(avoidances, 260) || '- honour the plan avoidances above'}

${imageRule(plan)}${shotDirective(shot)}

${interactionDirective(mi)}

CRITICAL: The Brief above contains your primary architectural and design philosophy instructions. You MUST follow them exactly. If they contradict any retrieved STRUCTURE RULES or DESIGN JUDGEMENT below, the Brief OVERRIDES them completely. Honour the section's COMPOSITION — do not collapse every section into the same generic grid.
${push ? `\n${push}\n` : ''}
Write the section now.`
  // An escalated retry gets a lower temperature: it is a correction, not another creative roll.
  return extractCode(await runTier(tier)(SYSTEM_SCRATCH, user, { temperature: push ? 0.25 : 0.5, maxTokens: MAX_SECTION_TOKENS }))
}

/** One-line rendering hint per composition, injected into the scratch prompt. */
const COMPOSITION_HINT: Record<Composition, string> = {
  cinematic: 'full-bleed oversized media, minimal chrome, one dominant focal element',
  editorial: 'stacked columns, generous whitespace, strong type hierarchy, magazine-like',
  gallery: 'a grid or masonry of visual items, even gaps, uniform rhythm',
  narrative: 'alternating left/right rows of media and text as the eye travels down',
  asymmetric: 'an offset, unequal split — one side dominant, deliberate imbalance',
  modular: 'a bento arrangement of cards of varied sizes, tight consistent gaps',
  immersive: 'a full-viewport panel that fills the screen, sparse and atmospheric',
  timeline: 'a vertical sequence of steps/milestones with a consistent connective rhythm'
}

export interface GenerateResult {
  sections: SectionResult[]
  /** unique motion primitives used, id -> doc (for writing files + deps + registry) */
  usedComponents: Map<string, ComponentDoc>
  /** how many duplicate image seeds were rewritten across the page */
  imageDedupes: number
  /** how many picsum URLs were swapped for real keyword-matched Unsplash photos */
  imagesResolved: number
}

/** Filesystem-safe slug of a free section name, for the generated module filename. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section'
}

export async function generateSections(
  plan: Plan,
  art: ArtDirection,
  log: (msg: string) => void = () => {}
): Promise<GenerateResult> {
  const sections: SectionResult[] = []
  const usedComponents = new Map<string, ComponentDoc>()
  const motion = art.motion
  const mi = art.interactions

  for (let i = 0; i < plan.sections.length; i++) {
    const section = plan.sections[i]
    const retrieved = await retrieveForSection(`${section.name} section (${section.composition}) — ${section.intent}`, {
      mood: plan.moodProfile,
      framework: 'react',
      motion // gates the motion-primitive tier to the locked language (empty when 'none')
    })
    const moduleName = `./generated/section-${i}-${slugify(section.name)}`
    const label = `${section.name}/${section.composition}`.padEnd(22)

    // This section's slice of the locked shot plan — computed BEFORE the primitive/scratch fork so
    // BOTH generation paths know their dominance (h1 ownership) and image beat.
    const sectionShot = plan.mood.some((m) => NON_PHOTO_MOODS.includes(m))
      ? { dominant: art.shotPlan.dominantIndex === i }
      : {
          beat: art.shotPlan.beats[i] ?? { scale: 'medium' as ShotScale, role: 'establish' as const },
          dominant: art.shotPlan.dominantIndex === i,
          subjectHead: subjectHead(art.shotPlan.world.subject) || undefined
        }

    // MOTION TIER: the locked motion language may offer a primitive whose composition-fit includes this
    // section's composition (already language-filtered by retrieval). Rides the generation rails via genUse.
    const prim = motion === 'none' ? null : selectMotionPrimitive(section.composition, retrieved.motionPrimitives)
    if (prim) {
      const comp = asComponent(prim)
      usedComponents.set(comp.id, comp)
      const importPath = `./lib-${comp.id}`
      log(`  [${i}] ${label} → motion-primitive ${prim.id} (wraps:${prim.wraps}, motion:${motion})`)

      // First pass on BULK; escalate the import-repair retry to REASONING (not a blind bulk retry).
      let code = await genUse(plan, section, comp, importPath, mi, 'bulk', sectionShot)
      let tier: SectionResult['tier'] = 'bulk'
      if (!usesComponent(code, importPath)) {
        log(`       ↳ did not import ${prim.id}; escalating repair to reasoning tier…`)
        tier = 'bulk→escalated'
        code = await genUse(plan, section, comp, importPath, mi, 'reasoning', sectionShot, true)
        if (!usesComponent(code, importPath) && comp.usage_example) {
          log(`       ↳ still ignored it; falling back to the stored usage_example.`)
          code = comp.usage_example.replace(/'\.\/component'/g, `'${importPath}'`)
        }
      }
      log(`       ↳ [${tier}]`)
      sections.push({
        index: i,
        name: section.name,
        composition: section.composition,
        strategy: 'motion-primitive',
        tier,
        motionPrimitiveId: prim.id,
        moduleName,
        code,
        layoutWarnings: lintLayout(code),
        primitiveWarnings: validatePrimitive(code, importPath, prim),
        retrieved
      })
      continue
    }

    {
      // Scratch: retrieve STRUCTURAL rules (spacing/layout) by composition — not buried by mood —
      // and feed critiques in as design judgement, not just mood-matched typography snippets.
      const [structural, craft, devices] = await Promise.all([
        retrieveStructural(section.composition, section.intent),
        retrieveCraft(section.composition, section.intent),
        retrieveDevices(section.composition, section.intent)
      ])
      log(
        `  [${i}] ${label} → scratch` +
          `  [structure: ${structural.map((h) => h.name).join(', ') || 'none'}]`
      )
      // First pass on BULK, then AT MOST ONE escalation to REASONING — either because the section
      // won't parse (it would be quarantined at write time), or because it ignored the committed
      // palette. Capped at one retry so a section never costs three LLM calls.
      let code = await genScratch(plan, section, retrieved.guidelines, structural, retrieved.critiques, retrieved.avoidances, craft, devices, mi, 'bulk', sectionShot)
      if (FORCE_PARSE_FAIL === 'bulk' || FORCE_PARSE_FAIL === 'both') code = corruptSyntax(code)
      let tier: SectionResult['tier'] = 'bulk'
      const retry = async (push?: string) => {
        const out = await genScratch(plan, section, retrieved.guidelines, structural, retrieved.critiques, retrieved.avoidances, craft, devices, mi, 'reasoning', sectionShot, push)
        return FORCE_PARSE_FAIL === 'both' ? corruptSyntax(out) : out
      }

      const bulkErr = parseError(code)
      let parseAttempts: SectionResult['parseAttempts']
      if (bulkErr) {
        log(`       ↳ parse error on bulk output (${bulkErr.slice(0, 60)}); escalating one retry to reasoning tier…`)
        tier = 'bulk→escalated'
        // Tell the retry WHAT broke — a blind re-roll just rolls the same dice again.
        const fixed = await retry(parseCorrection(bulkErr))
        const retryErr = parseError(fixed)
        if (!retryErr) {
          log(`       ↳ reasoning retry parses; accepted`)
          code = fixed
        } else {
          // BOTH tiers produced unparseable code. Make that an explicit, visible state rather than
          // silently handing broken code to the writer and letting a lone console.warn explain it.
          // Neither output is "better" — keep the bulk one (same rule as the off-theme branch: never
          // accept a retry that isn't an improvement) and carry both for the quarantine evidence dump.
          log(`       ↳ BOTH tiers failed to parse — section will be quarantined. bulk: ${bulkErr.slice(0, 50)} | reasoning: ${retryErr.slice(0, 50)}`)
          parseAttempts = [
            { tier: 'bulk', error: bulkErr, code },
            { tier: 'reasoning', error: retryErr, code: fixed }
          ]
        }
      } else {
        const offTheme = lintTheme(code)
        if (offTheme.length >= OFF_THEME_ESCALATE_AT) {
          log(`       ↳ ${offTheme.length} off-theme utilities (${offTheme.slice(0, 3).join(', ')}${offTheme.length > 3 ? ', …' : ''}); escalating one retry to reasoning tier…`)
          tier = 'bulk→escalated'
          const fixed = await retry(themeCorrection(offTheme))
          // Only accept the retry if it is parseable AND actually less off-theme — never trade a
          // working section for a broken or equally off-brand one.
          const after = lintTheme(fixed)
          if (!parseError(fixed) && after.length < offTheme.length) {
            log(`       ↳ off-theme ${offTheme.length} → ${after.length} after escalation`)
            code = fixed
          } else {
            log(`       ↳ escalated retry did not improve (${after.length} off-theme, parses:${!parseError(fixed)}); keeping the bulk output`)
            tier = 'bulk'
          }
        } else {
          // Design-system conformance — same warn→fix loop as off-theme (the warnings used to fire
          // and get ignored). Only when the run hasn't already spent its ONE escalation retry.
          // Voice violations join the same escalation queue as layout ones. Copy is judged by the
          // same standard as CSS: a page that drifts between three ways of speaking is as broken as
          // one that drifts between three spacing systems, and neither is visible without a check.
          const design = [...lintDesign(code), ...lintVoice(code, voiceFor(plan.register, plan.mood))]
          if (design.length >= 1) {
            log(`       ↳ design-system violation(s): ${design.join('; ')} — escalating one retry to reasoning tier…`)
            tier = 'bulk→escalated'
            const fixed = await retry(designCorrection(design, section.composition))
            const after = lintDesign(fixed)
            if (!parseError(fixed) && after.length < design.length) {
              log(`       ↳ design violations ${design.length} → ${after.length} after escalation`)
              code = fixed
            } else {
              log(`       ↳ escalated retry did not improve (${after.length} design, parses:${!parseError(fixed)}); keeping the bulk output`)
              tier = 'bulk'
            }
          }
        }
      }
      log(`       ↳ [${tier}]`)
      sections.push({
        index: i,
        name: section.name,
        composition: section.composition,
        strategy: 'scratch',
        tier,
        moduleName,
        code,
        layoutWarnings: lintLayout(code),
        themeWarnings: lintTheme(code),
        designWarnings: lintDesign(code),
        parseAttempts,
        retrieved
      })
    }
  }

  // Cross-section image passes: FIRST make picsum seeds unique (so identical placeholders don't
  // collapse to one photo), THEN upgrade every one to on-theme imagery (Unsplash photo or Flux generation).
  // ONE h1 per page — the dominant section owns it; every other h1 demotes to h2. Deterministic:
  // the one-anchor rule stopped being a suggestion the day a run cited it and shipped three h1s.
  const voidStripped = enforceDensity(sections, art.shotPlan.dominantIndex)
  if (voidStripped) log(`       ↳ stripped ${voidStripped} viewport-height claim(s) outside the hero (density floor)`)
  const h1Delta = enforceSingleH1(sections, art.shotPlan.dominantIndex)
  if (h1Delta > 0) log(`       ↳ demoted ${h1Delta} extra <h1> heading(s) to <h2> (one h1 per page, owned by the dominant section)`)
  if (h1Delta === -1) log(`       ↳ page had NO <h1> — promoted the dominant section's first <h2> (a page needs exactly one anchor)`)

  const imageDedupes = dedupeImages(sections)
  const imagesResolved = await resolveImages(sections, art.shotPlan, log)
  // AFTER resolution, so dimensions come from the final URLs. Kills the late-image layout shift that
  // both collides content and leaves scroll primitives holding stale positions.
  const hardened = hardenImages(sections, art.shotPlan.beats)
  if (hardened) log(`       ↳ hardened ${hardened} <img> tag(s): explicit width/height + lazy below the fold`)

  // Every image is fetched, VERIFIED real, and cached server-side before the page ships — a browser
  // firing 7+ simultaneous Flux requests gets some dropped, and a page must never show empty boxes.
  await prewarmImages(sections, art.palette, log)

  return { sections, usedComponents, imageDedupes, imagesResolved }
}
