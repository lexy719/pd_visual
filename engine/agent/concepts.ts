/**
 * Concept-selection step — the "thinks, then plans, then asks" layer. Runs BETWEEN the clarifying
 * questions and plan(): it reasons over the brief + answers + retrieved design evidence and proposes
 * 2-3 genuinely distinct, NAMED creative directions for the human to choose between, each anchored
 * in a specific retrieved reference. The chosen concept then binds plan() as a hard constraint (its
 * mood is locked, not suggested) — an approved concept the plan could quietly ignore would be the
 * same class of bug as question answers that never reached generation.
 *
 * Grounding discipline: an anchor citing a reference that was NOT actually retrieved is repaired to
 * the nearest real one or the concept is dropped — a concept "grounded" in an invented source is
 * decoration, not reasoning.
 */

import { completeReasoning, extractJson } from '../llm/llm.js'
import { retrievePlanningEvidence } from '../retrieval/query.js'
import { MOODS, type Mood } from './types.js'

export interface ConceptAnchor {
  /** the EXACT name of a retrieved critique/guideline chunk this concept is grounded in */
  source: string
  /** one line: how that reference grounds this direction */
  why: string
}

export interface Concept {
  /** evocative 2-4 word name, e.g. "The Silent Reveal" — never a generic label */
  name: string
  /** 1-3 moods from the closed vocabulary; mood[0] is the PRIMARY and must be unique per concept */
  mood: Mood[]
  /** one concrete line: the visual idea, not marketing copy */
  premise: string
  anchor: ConceptAnchor
}

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
      "anchor": { "source": "<copied EXACTLY from the RETRIEVED REFERENCES list>", "why": "<one line: how that reference grounds this direction>" }
    }
  ]
}

RULES:
- The concepts must be genuinely different DIRECTIONS — different primary mood, different visual strategy —
  not three adjectives on the same idea. If you cannot make a third genuinely distinct, return two.
- "anchor.source" MUST be the exact name of one entry from the RETRIEVED REFERENCES below. Do not invent,
  paraphrase or abbreviate a source — an anchor that is not in the list will be rejected.
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
    const c = rawC as { name?: unknown; mood?: unknown; premise?: unknown; anchor?: { source?: unknown; why?: unknown } }
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

    // Anchor must be a reference that was ACTUALLY retrieved. Exact match wins; else fuzzy-snap
    // (models paraphrase names — "the Bucks Sauce critique" for "bucks-sauce#3"); else drop.
    const cited = String(c?.anchor?.source ?? '').trim()
    const why = String(c?.anchor?.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
    let source = validNames.get(cited.toLowerCase())
    if (!source && cited) {
      const citedTokens = tokensOf(cited)
      const match = retrievedNames.find((n) => {
        const nt = tokensOf(n)
        for (const t of citedTokens) if (nt.has(t)) return true
        return false
      })
      if (match) {
        adjustments.push(`concept "${name}" anchor "${cited}" → "${match}" (snapped to the real retrieved name)`)
        source = match
      }
    }
    if (!source) {
      adjustments.push(`concept "${name}" REJECTED — anchor "${cited || '(none)'}" is not a retrieved reference`)
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

    out.push({ name, mood, premise, anchor: { source, why: why || 'grounds this direction' } })
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

RETRIEVED REFERENCES (anchor each concept to EXACTLY one of these, citing its [name] verbatim):
${refs || '(none retrieved — you may not fabricate an anchor; return your 2 best directions with anchor.source "" and they will be rejected, or ground them if you can)'}

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
- Grounded in: ${c.anchor.source} — ${c.anchor.why}`
}
