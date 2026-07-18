/**
 * Concept-selection step — the "thinks, then plans, then asks" layer. Runs BETWEEN the clarifying
 * questions and plan(): it reasons over the brief + answers + retrieved design evidence and proposes
 * 2-3 genuinely distinct, NAMED creative directions for the human to choose between, each a BLEND of
 * qualities drawn from several retrieved references. The chosen concept then binds plan() as a hard constraint (its
 * mood is locked, not suggested) — an approved concept the plan could quietly ignore would be the
 * same class of bug as question answers that never reached generation.
 *
 * Grounding discipline: every quality must cite a reference that was ACTUALLY retrieved (repaired to
 * the nearest real one, else dropped), and no two qualities of a concept may share a source — a
 * concept grounded in one reference is an impression of that site, not a direction of its own.
 */

import { completeReasoning, extractJson } from '../llm/llm.js'
import { retrievePlanningEvidence } from '../retrieval/query.js'
import { MOODS, type Mood } from './types.js'

/**
 * A QUALITY this concept borrows, and where it was learned.
 *
 * This replaced a single `anchor` naming one retrieved chunk, which was the structural cause of a
 * real complaint: the options came out as "based on this critique / based on that critique", so a
 * concept was a whole reference site wearing a new brief. One anchor can only ever be copied.
 *
 * Taste is not a reference; it is a set of qualities, and qualities MIX. A concept now carries two
 * or three of them from DIFFERENT sources, so the direction is a blend that belongs to this brief
 * rather than an impression of somebody else's page. `from` is kept only for grounding — it proves
 * the quality came from real retrieved evidence rather than being invented, and it is never shown as
 * the identity of the concept.
 */
export interface ConceptQuality {
  /** the quality in plain design words — NEVER a site name, never a specification */
  quality: string
  /** the EXACT name of the retrieved chunk it was learned from (grounding only) */
  from: string
}

export interface Concept {
  /** evocative 2-4 word name, e.g. "The Silent Reveal" — never a generic label */
  name: string
  /** 1-3 moods from the closed vocabulary; mood[0] is the PRIMARY and must be unique per concept */
  mood: Mood[]
  /** one concrete line: the visual idea, not marketing copy */
  premise: string
  /** 2-3 qualities borrowed from DIFFERENT sources — a blend, never a single reference */
  qualities: ConceptQuality[]
  /**
   * TRUE when the premise implies a structurally SPARSE layout — floating/pinned/scattered items,
   * lots of negative space, noticeboard/gallery-of-fragments framing. Such concepts reliably produce
   * void-heavy pages (diagnosed on the Fenwick "noticeboard" run), so the downstream fill-the-width
   * rule gets extra weight when this is set. Detected from the premise text, not model-declared.
   */
  sparseRisk: boolean
}

/** Premise language that predicts a void-prone layout — pinned/floating/scattered/sparse framing. */
const SPARSE_PREMISE = /\b(noticeboard|notice board|pinned|pin(?:ned|s)? up|sticky note|scattered|floating|fragments?|clippings?|postcards?|index cards?|scraps?|constellation|archipelago|sparse|minimal white space|lots of (?:negative|white) space|breathing room|pockets? of)\b/i

export interface ConceptResult {
  concepts: Concept[]
  /** how many evidence hits grounded the synthesis (UI shows thin grounding, never masks it) */
  groundCount: number
  /** deterministic repairs applied to the model output — surfaced, never hidden */
  adjustments: string[]
}

const SYSTEM = `You are the CONCEPT step of a web-design agent. Before anything is planned or built, you propose
2-3 genuinely DISTINCT creative directions for this brief, so the human chooses the direction instead of
discovering it after the build. Respond with ONLY JSON:

{
  "concepts": [
    {
      "name": "<evocative 2-4 word name, e.g. 'The Silent Reveal' — NEVER generic ('Option A', 'Modern Clean')>",
      "mood": ["<1-3 from: ${MOODS.join(', ')}> — the FIRST is the primary and is LOCKED into the build if chosen"],
      "premise": "<ONE concrete visual sentence: what the page looks and behaves like in this direction>",
      "qualities": [
        { "quality": "<the QUALITY you are borrowing, in plain design words>", "from": "<copied EXACTLY from the RETRIEVED REFERENCES list>" },
        { "quality": "<a second quality, from a DIFFERENT reference>", "from": "<exact name>" }
      ]
    }
  ]
}

RULES:
- The concepts must be genuinely different DIRECTIONS — different primary mood, different visual strategy —
  not three adjectives on the same idea. If you cannot make a third genuinely distinct, return two.
- A concept is a BLEND, never an impression of one site. Give 2-3 "qualities", and they MUST come from
  DIFFERENT references. A concept whose qualities all come from one source is rejected.
- "quality" states a PROPERTY the new page should have — "authority that comes from removing things
  rather than adding them", "motion that depicts the subject instead of decorating it". It must be
  usable on a brief that has nothing in common with the reference.
  NEVER name the reference site in the quality, and NEVER copy specifics from it — no hex values, no
  typeface names, no exact sizes, no library names. Those belong to that site; the quality does not.
- "from" MUST be the exact name of one entry from the RETRIEVED REFERENCES below. Do not invent,
  paraphrase or abbreviate it — a source that is not in the list will be rejected.
- "premise" is a designer's sentence (composition, light, pacing, type attitude), not marketing copy.
- Honour the brief's own constraints and the user's clarifying answers; a concept that contradicts an
  explicit answer is invalid.`

/**
 * Validate + repair the model's concepts against the ACTUAL retrieved evidence — same discipline as
 * lockInteractions/lockShotPlan. Exported so the rejection/repair rules are directly testable with
 * forced bad cases rather than assumed to work.
 */
export function lockConcepts(
  raw: unknown,
  retrievedNames: string[],
  adjustments: string[]
): Concept[] {
  const arr = Array.isArray((raw as { concepts?: unknown })?.concepts) ? ((raw as { concepts: unknown[] }).concepts) : []
  const validNames = new Map(retrievedNames.map((n) => [n.toLowerCase(), n]))
  const tokensOf = (s: string): Set<string> =>
    new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4))

  const out: Concept[] = []
  const usedPrimaries = new Set<Mood>()
  for (const rawC of arr) {
    const c = rawC as { name?: unknown; mood?: unknown; premise?: unknown; qualities?: unknown }
    const name = String(c?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
    // clamp long premises at a WORD boundary — a card ending mid-word ("…the gla") reads broken
    const rawPremise = String(c?.premise ?? '').replace(/\s+/g, ' ').trim()
    const premise = rawPremise.length <= 260 ? rawPremise : rawPremise.slice(0, 260).replace(/\s+\S*$/, '') + '…'
    let mood = (Array.isArray(c?.mood) ? c.mood : [])
      .map((m) => String(m).toLowerCase().trim())
      .filter((m): m is Mood => (MOODS as readonly string[]).includes(m))
      .slice(0, 3)
    if (!name || !premise || !mood.length) {
      adjustments.push(`concept "${name || '(unnamed)'}" dropped — missing name/premise/mood`)
      continue
    }

    // Each quality must be grounded in a reference that was ACTUALLY retrieved. Exact match wins;
    // else fuzzy-snap (models paraphrase names — "the Bucks Sauce critique" for "bucks-sauce#3").
    const rawQs = Array.isArray(c?.qualities) ? c.qualities : []
    const qualities: ConceptQuality[] = []
    const usedSources = new Set<string>()
    for (const rq of rawQs) {
      const q = rq as { quality?: unknown; from?: unknown }
      const quality = String(q?.quality ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
      const cited = String(q?.from ?? '').trim()
      if (!quality) continue
      let source = validNames.get(cited.toLowerCase())
      if (!source && cited) {
        const citedTokens = tokensOf(cited)
        const match = retrievedNames.find((n) => {
          const nt = tokensOf(n)
          for (const t of citedTokens) if (nt.has(t)) return true
          return false
        })
        if (match) source = match
      }
      if (!source) {
        adjustments.push(`concept "${name}" dropped a quality — "${cited || '(none)'}" is not a retrieved reference`)
        continue
      }
      // One quality per source. Two qualities from the same chunk is an impression of that one
      // reference wearing the language of a blend, which is exactly what this replaced.
      if (usedSources.has(source)) {
        adjustments.push(`concept "${name}" dropped a second quality from "${source}" — a concept must blend DIFFERENT sources`)
        continue
      }
      usedSources.add(source)
      qualities.push({ quality, from: source })
    }
    if (qualities.length < 2) {
      adjustments.push(
        `concept "${name}" REJECTED — only ${qualities.length} grounded quality from a distinct source; a concept must blend at least 2`
      )
      continue
    }

    // Distinct-direction rule: primary moods must differ. Try promoting a non-duplicate mood to
    // primary before dropping — the model may have ordered them badly rather than converged.
    if (usedPrimaries.has(mood[0])) {
      const alt = mood.find((m) => !usedPrimaries.has(m))
      if (alt) {
        adjustments.push(`concept "${name}" primary mood ${mood[0]} duplicates an earlier concept → promoted ${alt}`)
        mood = [alt, ...mood.filter((m) => m !== alt)]
      } else {
        adjustments.push(`concept "${name}" REJECTED — primary mood ${mood[0]} duplicates an earlier concept and it offers no alternative`)
        continue
      }
    }
    usedPrimaries.add(mood[0])

    const sparseRisk = SPARSE_PREMISE.test(premise) || SPARSE_PREMISE.test(name)
    if (sparseRisk) adjustments.push(`concept "${name}" flagged sparse-risk (void-prone premise) — fill-the-width rule weighted up if chosen`)
    out.push({ name, mood, premise, qualities, sparseRisk })
    if (out.length === 3) break
  }
  return out
}

const digest = (name: string, body: string): string => `[${name}] ${body.replace(/\s+/g, ' ').trim().slice(0, 240)}`

/**
 * Synthesize 2-3 grounded concepts for a brief (already augmented with the question answers).
 * Returns null when the step cannot produce ≥2 valid concepts — the caller SKIPS the gate and
 * proceeds as today, loudly, rather than blocking generation on a failed reasoning call.
 */
export async function synthesizeConcepts(brief: string): Promise<ConceptResult | null> {
  const ev = await retrievePlanningEvidence(brief)
  const hits = [...(ev.critiques ?? []), ...(ev.layout ?? []), ...(ev.visual ?? []), ...(ev.motionMedia ?? [])]
  const names = hits.map((h) => h.name)
  const groundCount = hits.length

  const refs = hits
    .map((h) => {
      const p = h.payload as { heading?: string; body?: string; site?: string; observation?: { what?: string; why?: string }; throughline?: string }
      const body = p.observation?.what ?? p.throughline ?? p.body ?? h.embed_text
      return digest(h.name, `${p.site ? p.site + ' — ' : ''}${body}`)
    })
    .join('\n')

  const user = `Brief (including the user's clarifying answers — honour them):
${brief}

RETRIEVED REFERENCES (draw each concept's qualities from these, citing the [name] verbatim in "from").
BLEND them: a concept's qualities must come from DIFFERENT entries, and the quality itself must be a
property a brand-new brief could have, never a description of the reference:
${refs || '(none retrieved — you may not fabricate a source; ground your directions if you can)'}

Propose the concepts now.`

  const adjustments: string[] = []
  try {
    const raw = await Promise.race([
      completeReasoning(SYSTEM, user, { temperature: 0.6, maxTokens: 1400 }),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('concepts timed out')), 25000))
    ])
    const parsed = extractJson<{ concepts?: unknown[] }>(raw)
    const concepts = lockConcepts(parsed, names, adjustments)
    if (concepts.length < 2) {
      console.warn(`  \x1b[33m⚠ concepts step produced ${concepts.length} valid concept(s) — skipping the gate.\x1b[0m ${adjustments.join(' | ')}`)
      return null
    }
    return { concepts, groundCount, adjustments }
  } catch (e) {
    console.warn(`  \x1b[33m⚠ concepts call failed (${(e as Error).message}) — skipping the gate.\x1b[0m`)
    return null
  }
}

/**
 * The lock block appended to the brief when a concept is chosen — same rail as briefWithChoices.
 * plan() ALSO receives the mood as a hard constraint; this block carries the narrative intent.
 */
export function briefWithConcept(brief: string, c: Concept): string {
  return `${brief}

CREATIVE CONCEPT (chosen by the user — this is the LOCKED direction; build THIS, do not re-decide it):
- Name: ${c.name}
- Mood (locked): ${c.mood.join(', ')}
- Visual premise: ${c.premise}
- Qualities: ${c.qualities.map((q) => q.quality).join(' + ')}${
    c.sparseRisk
      ? `\n\nCRITICAL for THIS concept: its premise leans sparse/pinned/floating, which reliably produces void-heavy pages. Honour the FEELING of the concept, but every section must still FILL or CENTER its width — a "pinned note" or "scattered" motif is a treatment applied to content that fills its container, NEVER a licence to leave tall empty bands. If a section would be a small element floating in a wide void, center it or give it a real companion element. Do not repeat the same pinned-note motif on more than one section.`
      : ''
  }`
}
