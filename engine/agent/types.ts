import type { Composition, SearchHit } from '../types.js'
import type { CreativeBrief } from './brief.js'

/** The 8-tag mood vocabulary — the only moods the plan may emit. */
export const MOODS = [
  'aggressive',
  'calm',
  'premium',
  'playful',
  'minimal',
  'technical',
  'trustworthy',
  'brutalist'
] as const
export type Mood = (typeof MOODS)[number]

/** Proportional height a section occupies in the wireframe / page rhythm. */
export type Emphasis = 'sm' | 'md' | 'lg' | 'xl'

/**
 * A freely-invented section. There is NO fixed section vocabulary — `name` is whatever the Plan
 * decides ("manifesto", "process-atlas", "hero"). Structure is expressed through `composition`
 * (design language) + `emphasis` (size); annotations (`intent`/`media`/`motion`) are surfaced in the
 * wireframe so the human approves INTENT, not just proportions.
 */
export interface SectionPlan {
  /** free-invented section name */
  name: string
  /** what this section communicates for THIS brief — the wireframe "purpose" line */
  intent: string
  /** design-language composition; the renderer maps it to an actual box arrangement */
  composition: Composition
  /** proportional height */
  emphasis: Emphasis
  /** one-line media direction (e.g. "full-bleed workshop photography, warm grain") */
  media?: string
  /** one-line motion note for this section; inherits the page motion language when absent */
  motion?: string
}

export interface Plan {
  brief: string
  /** Deterministic extraction of the Studio choices and explicit "avoid" language. */
  creativeBrief: CreativeBrief
  brand: string
  mood: Mood[]
  /** comma-joined moods, the string handed to retrieveForSection({ mood }) */
  moodProfile: string
  /** headings of the layout patterns / page archetypes that conditioned the section list */
  layoutPatterns?: string[]
  /** whether to bypass library components in favor of bespoke generation */
  designStrategy?: 'scratch' | 'components'
  /** Concrete anti-patterns the rest of the run must not introduce. */
  avoidances: string[]
  sections: SectionPlan[]
}

/** How a section was realised (pure generation — no component library). */
export interface SectionResult {
  index: number
  /** the freely-invented section name */
  name: string
  /** the section's committed composition */
  composition: Composition
  /** 'motion-primitive' = a scroll-choreography primitive backs it; 'scratch' = freehand generated */
  strategy: 'motion-primitive' | 'scratch'
  /** which model tier produced the code: 'bulk' (first try) or 'bulk→escalated' (repaired on reasoning) */
  tier: 'bulk' | 'bulk→escalated'
  /** the motion primitive backing this section, if one was content-fit-selected */
  motionPrimitiveId?: string
  /** composition-contract + param-bounds warnings for a motion-primitive section (start<end, 0-100) */
  primitiveWarnings?: string[]
  /** static layout-lint warnings (flex/grid containers likely to collide — missing gap/wrap) */
  layoutWarnings?: string[]
  /** theme-conformance warnings: raw colors that bypass the run's committed palette tokens */
  themeWarnings?: string[]
  /** image-staging warnings: dynamic srcs the resolver could not rewrite — they bypass the shot plan */
  imageWarnings?: string[]
  /**
   * Every tier whose output failed to PARSE, with the code it produced. Recorded so a quarantine is
   * never a mystery: the writer dumps these to logs/quarantine/ as evidence. Populated only on
   * failure — a clean section carries nothing.
   */
  parseAttempts?: Array<{ tier: 'bulk' | 'reasoning'; error: string; code: string }>
  /**
   * Set by the WRITER when the section's code failed to parse and was replaced with a visible stub.
   * The decision happens at write time (post-transform), which is why generation can't set it. Carried
   * on the result — like themeWarnings — so the run summary and the Studio UI both show a section was
   * stubbed, rather than it living only in a console.warn that scrolls away.
   */
  quarantined?: {
    /** the esbuild parse error that triggered the stub */
    error: string
    /** which model tiers produced unparseable code, e.g. ['bulk', 'reasoning'] */
    tiersFailed: string[]
    /** repo-relative path of the dumped evidence file */
    evidence?: string
  }
  /** relative import path other files use, e.g. './generated/section-0-hero' */
  moduleName: string
  /** the section's own default-export component code */
  code: string
  /** retrieval that conditioned this section (for the critique + the receipt) */
  retrieved: {
    guidelines: SearchHit[]
    critiques: SearchHit[]
  }
}
