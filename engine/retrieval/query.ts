/** Query layer — framework-agnostic. The generation agent will import THIS, not the CLI. */

import { embedQuery } from './embed.js'
import { openDb, search, type SearchOpts } from './store.js'
import type { Framework, MotionLanguage, MotionPrimitiveDoc, SearchHit } from '../types.js'

/** One-shot search (opens + closes the db). Fine for CLI use. */
export async function queryKnowledge(q: string, opts: SearchOpts = {}): Promise<SearchHit[]> {
  const db = openDb()
  try {
    return search(db, await embedQuery(q), opts)
  } finally {
    db.close()
  }
}

export interface SectionRetrieval {
  guidelines: SearchHit[]
  critiques: SearchHit[]
  /** Counterexamples and anti-patterns relevant to this section/mood. Must be given to generation. */
  avoidances: SearchHit[]
  /** motion-primitive tier, already filtered to the run's locked motion language (empty when 'none') */
  motionPrimitives: SearchHit[]
}

/** The planner's evidence receipt. Each lane answers a different design question; callers must
 * not flatten this into one generic list, because structure, aesthetics and counterevidence are
 * all useful for different reasons. */
export interface PlanningEvidence {
  layout: SearchHit[]
  visual: SearchHit[]
  motionMedia: SearchHit[]
  critiques: SearchHit[]
  avoidances: SearchHit[]
}

/**
 * Retrieve a deliberate planning bundle for a creative brief. This is intentionally more
 * structured than `queryKnowledge`: a high-scoring motion example must not displace the layout
 * rule that decides the whole page architecture, and anti-patterns always receive their own lane.
 */
export async function retrievePlanningEvidence(brief: string): Promise<PlanningEvidence> {
  const db = openDb()
  try {
    const query = await embedQuery(brief)
    const guidelines = search(db, query, { kind: 'guideline', k: 36 })
    const has = (h: SearchHit, ...tags: string[]) => tags.some((tag) => h.tags.includes(tag))
    return {
      // 6, not 4: the layout lane is the most contested one — the page-archetype/layout-pattern
      // incumbents reliably hold ranks 1-4, so a 4-wide lane never reached the newer
      // knowledge/*-patterns entries. 6 is the measured knee (reach 1/7 → 4/7 across realistic
      // briefs; 7 adds nothing). Widening only appends, so the incumbents keep their slots.
      // NOTE: plan.ts's evidenceDigest caps this again — the two must stay in sync.
      layout: guidelines.filter((h) => has(h, 'layout', 'narrative')).slice(0, 6),
      visual: guidelines.filter((h) => has(h, 'color', 'typography', 'spacing')).slice(0, 4),
      motionMedia: guidelines.filter((h) => has(h, 'motion', 'media', 'video')).slice(0, 4),
      avoidances: guidelines.filter((h) => has(h, 'avoid')).slice(0, 4),
      critiques: search(db, query, { kind: 'critique', k: 4, maxPerSource: 1 })
    }
  } finally {
    db.close()
  }
}

export interface SectionOpts {
  /**
   * The mood/tag profile for the page, e.g. "premium, dark, motorsport-adjacent".
   * Measured: structural words ("hero", "video background") drown out mood signal, so
   * guidelines + critiques are matched on MOOD, while components are matched on
   * structure conditioned by mood. Without this split, a motorsport hero query
   * retrieves the SaaS colour rules.
   */
  mood?: string
  /**
   * The generation target. Defaults to 'react' — the project's target. Only components are
   * filtered by it (guidelines and critiques are framework-agnostic). Never omit this in the
   * agent: retrieving a plain-HTML component while generating React yields a hybrid page.
   */
  framework?: Framework
  /**
   * The run's LOCKED motion language (from art-direction). Motion primitives are retrieved ONLY when
   * their `motion_language` includes this. Omitted or 'none' ⇒ the motion tier returns nothing, so
   * choreography can never leak in per-section — coherence is enforced here, not by the model.
   */
  motion?: MotionLanguage
  components?: number
  guidelines?: number
  critiques?: number
  /**
   * Diversity cap on critiques: max observations from any one site. Defaults to 1, so the
   * critique slots pull from different sites rather than letting one richly-critiqued site
   * (Bucks Sauce has 9 chunks) monopolise them.
   */
  critiquesPerSite?: number
}

/**
 * What the agent loop calls per section: the best components, guidelines and critiques.
 * Each kind is retrieved independently so a flood of components can't crowd out the
 * design judgment in the critiques.
 */
export async function retrieveForSection(section: string, opts: SectionOpts = {}): Promise<SectionRetrieval> {
  const db = openDb()
  try {
    const componentQ = opts.mood ? `${section}. Style: ${opts.mood}` : section
    const moodQ = opts.mood || section

    const [cVec, mVec] = await Promise.all([embedQuery(componentQ), embedQuery(moodQ)])
    const avoidances = search(db, mVec, { kind: 'guideline', k: 16 }).filter((h) => h.tags.includes('avoid')).slice(0, 3)
    return {
      guidelines: search(db, mVec, { kind: 'guideline', k: opts.guidelines ?? 3 }),
      critiques: search(db, mVec, {
        kind: 'critique',
        k: opts.critiques ?? 2,
        maxPerSource: opts.critiquesPerSite ?? 1
      }),
      avoidances,
      motionPrimitives: motionEligible(opts.motion)
        ? search(db, cVec, { kind: 'motion-primitive', framework: opts.framework ?? 'react', k: 12 }).filter((h) =>
            ((h.payload as MotionPrimitiveDoc).motion_language ?? []).includes(opts.motion as MotionLanguage)
          )
        : []
    }
  } finally {
    db.close()
  }
}

/** The motion tier is off entirely when there's no lock or the lock is 'none' (static). */
function motionEligible(motion?: MotionLanguage): boolean {
  return !!motion && motion !== 'none'
}
