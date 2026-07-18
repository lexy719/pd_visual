/** Plan step: a one-line brief → a mood/tag profile + an ordered section list. */

import { completeReasoning, extractJson } from '../llm/llm.js'
import { queryKnowledge, retrievePlanningEvidence, type PlanningEvidence } from '../retrieval/query.js'
import { MOODS, type Emphasis, type Mood, type Plan, type SectionPlan } from './types.js'
import { COMPOSITIONS, REGISTERS, type Composition, type Register } from '../types.js'
import { parseCreativeBrief } from './brief.js'

const SYSTEM = `You are the planning step of a web-design agent. Given a one-line brief, decide the
brand feel, the underlying story architecture, and the page structure. Respond with ONLY JSON, no prose, in this exact shape:

{
  "brand": "<short brand/product name inferred from the brief>",
  "register": "<the page's genre>",
  "mood": ["<1-3 moods>"],
  "layoutPatterns": ["<pattern name>", "<pattern name>"],
  "avoidances": ["<3-6 concrete things this site must not do>"],
  "sections": [ { "name": "<invent a section name that fits the story>", "intent": "<what this section says for THIS brief>", "composition": "<composition>", "emphasis": "sm|md|lg|xl", "media": "<one-line media direction>", "motion": "<optional one-line motion note>" } ]
}

RULES:
- "register" MUST be one of: saas-product | editorial-story | local-service-business | portfolio-showcase | agency-studio | ecommerce-product | developer-tool | event-launch.
  It is the GENRE of the page and it binds real structure downstream: saas-product / developer-tool /
  ecommerce-product run DENSE and carry a sticky nav with one call to action; local-service-business
  leads with practical trust (who, what it costs, where, how to reach them); editorial-story runs
  SPARSE and sequential with little or no chrome; portfolio-showcase and agency-studio put evidence
  first. Choose from the BRIEF's actual purpose, not from its mood. See the RETRIEVED PATTERN
  GUIDANCE for each register's required furniture, and make the section list satisfy it.
- "mood" MUST be chosen only from: ${MOODS.join(', ')}. Pick the 1-3 that fit best; do not invent moods.
- INVENT the section structure freely — there is NO fixed section vocabulary. Name sections for the story
  they tell ("manifesto", "process-atlas", "the-ritual", "field-notes"). Do NOT default to a
  nav/hero/features/pricing/cta/footer skeleton; let the brief's narrative dictate the sequence.
- Each section commits to ONE "composition" (design language, not a component): ${COMPOSITIONS.join(' | ')}.
  cinematic = full-bleed oversized media; editorial = stacked columns + split + whitespace; gallery =
  grid/masonry; narrative = alternating left/right rhythm; asymmetric = offset unequal split; modular =
  bento cards; immersive = full-viewport pinned; timeline = vertical sequence. VARY composition across the
  page — never make every section the same shape.
- "emphasis" is the section's proportional height: sm | md | lg | xl.
- "media" is a one-line art direction for this section's imagery/visual (or "" if text-only).
- First choose the narrative and visual design patterns that best fit the brief from the RETRIEVED PATTERN GUIDANCE below. Use those to decide how the story unfolds before naming sections.
- 5-8 sections. Every "intent" must be specific to the brief, not generic.
- "avoidances" are HARD constraints. Use the explicit user avoidances plus retrieved anti-patterns; never invent arbitrary restrictions. They must be concrete (for example: "do not use autoplay video on mobile"), not vague ("do not be bad").
- If a "PAST REJECTIONS" list is provided, it is structural feedback from a human on similar briefs. Treat it as hard constraints — do NOT repeat the rejected structure; address each reason.`

/**
 * Retrieve the layout patterns / page archetypes that best fit the brief, as a short digest to
 * condition the section list on. Same machinery as retrieveForSection, filtered to layout-tagged
 * guidelines. Retrieval uses the brief alone (mood isn't known until the plan call produces it).
 */
function evidenceDigest(hits: PlanningEvidence['layout']): Array<{ heading: string; digest: string }> {
  return hits
    // 6 to match the layout lane's own width in query.ts — capping at 4 here would silently undo
    // the widening. Keep these two numbers in sync.
    .slice(0, 6)
    .map((h) => {
      const p = h.payload as { heading?: string; body?: string }
      return {
        heading: p.heading ?? h.name,
        digest: (p.body ?? h.embed_text).replace(/\s+/g, ' ').trim().slice(0, 320)
      }
    })
}

/**
 * Retrieve past wireframe REJECTIONS for briefs like this one, so the Plan avoids re-proposing a
 * structure the user already turned down. Same retrieval machinery; filtered to plan-preferences.
 */
async function retrievePlanPreferences(brief: string): Promise<string[]> {
  const hits = await queryKnowledge(brief, { kind: 'plan-preference', k: 3 })
  return hits.map((h) => {
    const p = h.payload as { rejectedSections?: string[]; reason?: string }
    const seq = p.rejectedSections?.length ? ` (rejected: ${p.rejectedSections.join(' → ')})` : ''
    return `- ${p.reason ?? h.name}${seq}`
  })
}

const toRule = (h: PlanningEvidence['layout'][number]): string =>
  `${h.name}: ${(h.payload as { body?: string }).body?.replace(/\s+/g, ' ').slice(0, 260) ?? h.embed_text}`

const toCritique = (h: PlanningEvidence['critiques'][number]): string => {
  const p = h.payload as { site?: string; observation?: { what?: string; why?: string }; throughline?: string }
  return `${p.site ?? h.name}: ${p.observation?.why ?? p.observation?.what ?? p.throughline ?? h.embed_text.slice(0, 220)}`
}

const clampMood = (m: unknown): Mood[] => {
  const arr = Array.isArray(m) ? m : []
  const valid = arr.map((x) => String(x).toLowerCase().trim()).filter((x): x is Mood => (MOODS as readonly string[]).includes(x))
  return valid.length ? [...new Set(valid)].slice(0, 3) : ['minimal']
}

/**
 * Deterministic register fallback from the brief's own words, used when the model returns something
 * outside the vocabulary. Ordered most-specific first — a "shop" that is also a "studio" is a shop.
 */
const REGISTER_HINTS: Array<[Register, RegExp]> = [
  ['developer-tool', /(api|sdk|cli|open.?source|library|framework|developer|package|npm)/i],
  ['ecommerce-product', /(shop|store|buy|cart|checkout|product page|for sale|ecommerce|e-commerce)/i],
  ['saas-product', /(saas|platform|dashboard|app for|software|subscription|b2b|tool for teams|pricing)/i],
  ['event-launch', /(conference|festival|event|summit|launch day|tickets|programme|lineup)/i],
  ['portfolio-showcase', /(portfolio|my work|selected works|photographer|designer's own)/i],
  ['agency-studio', /(agency|studio for|consultancy|we help brands|creative studio)/i],
  ['local-service-business', /(clinic|practice|salon|shop in|bakery|vet|dentist|lawyer|law firm|barber|garage|local)/i],
  ['editorial-story', /(story|manifesto|brand story|editorial|magazine|essay)/i]
]

function clampRegister(raw: unknown, brief: string, mood: Mood[]): Register {
  const r = String(raw ?? '').toLowerCase().trim()
  if ((REGISTERS as readonly string[]).includes(r)) return r as Register
  for (const [reg, re] of REGISTER_HINTS) if (re.test(brief)) return reg
  // last resort: a technical/minimal brief is usually a product; anything else tells a story
  return mood.includes('technical') ? 'saas-product' : 'editorial-story'
}

const EMPHASES: readonly Emphasis[] = ['sm', 'md', 'lg', 'xl']

const clampSections = (s: unknown): SectionPlan[] => {
  const arr = Array.isArray(s) ? s : []
  const out: SectionPlan[] = []
  for (const raw of arr) {
    const r = raw as { name?: string; intent?: string; composition?: string; emphasis?: string; media?: string; motion?: string }
    const name = String(r?.name ?? '').trim()
    if (!name) continue
    const comp = String(r?.composition ?? '').toLowerCase().trim()
    const composition: Composition = (COMPOSITIONS as readonly string[]).includes(comp) ? (comp as Composition) : 'editorial'
    const emp = String(r?.emphasis ?? '').toLowerCase().trim()
    const emphasis: Emphasis = (EMPHASES as readonly string[]).includes(emp) ? (emp as Emphasis) : 'md'
    const media = String(r?.media ?? '').trim()
    const motion = String(r?.motion ?? '').trim()
    out.push({ name, intent: String(r?.intent ?? '').trim() || name, composition, emphasis, media: media || undefined, motion: motion || undefined })
  }
  return out.length ? out : [{ name: 'opening', intent: 'introduce the product', composition: 'cinematic', emphasis: 'xl' }]
}

/** Constraints an approved concept imposes on the plan. Mood is BOUND, not suggested. */
export interface PlanLock {
  mood?: Mood[]
}

export async function plan(brief: string, lock?: PlanLock): Promise<Plan> {
  const creativeBrief = parseCreativeBrief(brief)
  const evidenceQuery = [
    creativeBrief.product,
    creativeBrief.visualDirection,
    creativeBrief.palettePreference,
    creativeBrief.motionPreference
  ].filter(Boolean).join('. ')
  const [evidence, rejections] = await Promise.all([retrievePlanningEvidence(evidenceQuery), retrievePlanPreferences(brief)])
  const patterns = evidenceDigest(evidence.layout)
  const patternDigest = patterns.length
    ? patterns.map((p) => `- ${p.heading}: ${p.digest}`).join('\n')
    : '(none retrieved — apply general good taste for the brief)'
  const avoidBlock = rejections.length
    ? `\n\nPAST REJECTIONS (a human rejected these structures for similar briefs — do NOT repeat them):\n${rejections.join('\n')}`
    : ''
  const user = `Brief: ${creativeBrief.product}

CREATIVE BRIEF CONTRACT (honour these selections; they are not component templates):
- Visual direction: ${creativeBrief.visualDirection ?? 'open'}
- Palette preference: ${creativeBrief.palettePreference ?? 'open'}
- Motion preference: ${creativeBrief.motionPreference ?? 'open'}
- Explicit avoidances: ${creativeBrief.avoidances.join('; ') || '(none specified)'}

${lock?.mood?.length ? `LOCKED MOOD: ${lock.mood.join(', ')} — an approved creative concept fixed the mood. Emit exactly this mood; it is DECIDED, not yours to re-decide. Choose patterns and sections that serve it.\n\n` : ''}RETRIEVED PATTERN GUIDANCE (choose the narrative and visual patterns first, then build the section sequence from them):
${patternDigest}

RETRIEVED LAYOUT PATTERNS (pick the archetype that fits and build the section sequence from it):
${patternDigest}

RETRIEVED ANTI-PATTERNS (use as counterevidence, not decoration):
${evidence.avoidances.map((x) => `- ${toRule(x)}`).join('\n') || '(none retrieved)'}

RETRIEVED VISUAL LANGUAGE (palette, type, spacing — use as principles, not recipes):
${evidence.visual.map((x) => `- ${toRule(x)}`).join('\n') || '(none retrieved)'}

RETRIEVED MOTION / MEDIA DIRECTION (only use what the brief earns):
${evidence.motionMedia.map((x) => `- ${toRule(x)}`).join('\n') || '(none retrieved)'}

CRITIQUE METHODS (apply the reasoning, never copy a site):
${evidence.critiques.map((x) => `- ${toCritique(x)}`).join('\n') || '(none retrieved)'}${avoidBlock}`
  const raw = await completeReasoning(SYSTEM, user, { temperature: 0.3 })
  const parsed = extractJson<{ brand?: string; register?: unknown; mood?: unknown; layoutPatterns?: unknown; sections?: unknown; avoidances?: unknown }>(raw)
  // HARD CONSTRAINT: an approved concept's mood BINDS the plan — applied deterministically, so the
  // model cannot quietly deviate from what the user approved (the prompt line above is a courtesy;
  // this override is the guarantee). Same discipline as the question-answers fix.
  const mood = lock?.mood?.length ? clampMood(lock.mood) : clampMood(parsed.mood)
  return {
    brief,
    creativeBrief,
    brand: (parsed.brand ?? '').trim() || 'Brand',
    register: clampRegister(parsed.register, brief, mood),
    mood,
    moodProfile: mood.join(', '),
    designStrategy: 'scratch',
    layoutPatterns: Array.isArray(parsed.layoutPatterns) ? parsed.layoutPatterns.map(String).filter(Boolean).slice(0, 4) : patterns.map((p) => p.heading),
    avoidances: [...new Set([...(creativeBrief.avoidances ?? []), ...(Array.isArray(parsed.avoidances) ? parsed.avoidances.map(String) : [])])].slice(0, 8),
    sections: clampSections(parsed.sections)
  }
}
