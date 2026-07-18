/** Shared types for the knowledge base. Framework-agnostic on purpose — the retrieval
 *  layer must not know anything about the generation agent. */

export type DocKind = 'component' | 'guideline' | 'critique' | 'media-ref' | 'motion-primitive' | 'plan-preference'

/**
 * The page's ONE locked motion language, synthesized once by the art-direction step. Every section
 * inherits it; motion primitives are retrieved only when their `motion_language` includes the lock.
 * `none` = static (reduced-motion / somber briefs) — no primitives eligible at all.
 */
export type MotionLanguage = 'none' | 'subtle' | 'aggressive' | 'parallax-slow' | 'brutalist-cut' | 'kinetic'

/**
 * A section's COMPOSITION — design language, not layout implementation. The Plan invents free section
 * NAMES ("manifesto", "process-atlas"), but each section commits to one of these compositions; the
 * wireframe/generation renderer maps composition down to actual box arrangement (see wireframe.ts).
 */
export const COMPOSITIONS = ['cinematic', 'editorial', 'gallery', 'narrative', 'asymmetric', 'modular', 'immersive', 'timeline'] as const
export type Composition = (typeof COMPOSITIONS)[number]

/**
 * The page's REGISTER — what genre of website this is. Decided once per run (see plan.ts) and it
 * binds real structure: whether the page carries chrome (a sticky nav + footer, or none), how dense
 * it runs, and what furniture the section list must include. Knowledge for each lives in
 * knowledge/guidelines/registers.md.
 *
 * This exists because the system had exactly ONE gear: every brief — a law firm, a bookbindery, a
 * vet clinic, a mezcal brand — came out as a chrome-less editorial scroll document. A register is
 * NOT a template (that would make every SaaS page identical); it is the genre's conventions, inside
 * which composition stays free.
 */
export const REGISTERS = [
  'saas-product',
  'editorial-story',
  'local-service-business',
  'portfolio-showcase',
  'agency-studio',
  'ecommerce-product',
  'developer-tool',
  'event-launch'
] as const
export type Register = (typeof REGISTERS)[number]

/** What page furniture a register requires. Applied deterministically by the writer, never left to
 *  model compliance — the model has never once produced a nav on its own. */
export interface ChromeSpec {
  /** a sticky top navigation with the brand + links; 'none' for immersive/editorial registers */
  nav: 'sticky-cta' | 'minimal-masthead' | 'none'
  /** a full site-map footer, a single quiet line, or nothing */
  footer: 'sitemap' | 'minimal' | 'none'
}

/** Per-register chrome + density conventions — the genre's known-good shape. */
export const REGISTER_CHROME: Record<Register, ChromeSpec> = {
  'saas-product': { nav: 'sticky-cta', footer: 'sitemap' },
  'developer-tool': { nav: 'sticky-cta', footer: 'sitemap' },
  'ecommerce-product': { nav: 'sticky-cta', footer: 'sitemap' },
  'local-service-business': { nav: 'sticky-cta', footer: 'minimal' },
  'agency-studio': { nav: 'minimal-masthead', footer: 'minimal' },
  'portfolio-showcase': { nav: 'minimal-masthead', footer: 'minimal' },
  'event-launch': { nav: 'minimal-masthead', footer: 'minimal' },
  'editorial-story': { nav: 'none', footer: 'minimal' }
}

/**
 * Generation target. `react` is the project's target (plain React + Vite, not Next.js).
 * `html` exists only so a legacy/plain component can be stored without lying about it —
 * the agent must never mix frameworks in one page, so this is a retrieval filter, not a hint.
 */
export type Framework = 'react' | 'html'

/** One customizable slot on a component — a closed set of pre-authored variants. */
export interface ComponentSlot {
  /** allowed values, in SELECTION-PRIORITY order (first option whose moods match the plan wins) */
  options: string[]
  /** value used when no option's moods match the plan */
  default: string
  /** how the chosen value reaches the component: a prop, or a data-* attribute on the root tag */
  apply: { prop?: string; attr?: string }
  /** option -> moods that favour it, for deterministic LLM-free selection. Omit ⇒ never auto-picked. */
  moodMap?: Record<string, string[]>
  /** human/agent-facing note on what the slot controls */
  describe?: string
}

/**
 * A verbatim library code module. The dedicated component tier has been removed (pure generation
 * now), so this type survives only as the shape a MOTION PRIMITIVE is adapted into (see
 * generate.ts `asComponent`) so it can ride the writer's verbatim-file + dependency rails.
 * `slots` is unused by the motion path and left here for the writer's structural compatibility.
 */
export interface ComponentDoc {
  id: string
  name: string
  category: string
  /** which generation target this code belongs to. Declared, never sniffed from the code. */
  framework: Framework
  tags: string[]
  code: string
  /** npm packages this component needs, EXCLUDING react itself. e.g. ["motion", "clsx"] */
  dependencies: string[]
  /** supporting files that must exist in the project, e.g. ["lib/utils.ts"] */
  registry_files: string[]
  /** needs the "use client" directive (a React Server Components boundary) */
  client_component: boolean
  /**
   * TRUE when the component ships hardcoded demo content and exposes no prop/children seam to
   * inject brief-specific data (e.g. a self-contained *Demo wrapper). Such a component always
   * renders the SAME content regardless of brief — the agent flags any section that uses one.
   * These are low-quality library entries; prefer prop-driven primitives.
   */
  demo_data?: boolean
  /**
   * A minimal, self-contained example of how to import and render this component with
   * representative props/data. Import path is the placeholder `./component`.
   * Used by BOTH the generation agent (the model adapts this instead of re-reading the full
   * source — critical for large components) and the preview layer (auto-derives a mount).
   */
  usage_example?: string
  /**
   * Pre-authored, enumerated variants the agent SELECTS from (never freehand-edits). Each slot
   * lists its `options` in selection-priority order, a `default`, how to `apply` the choice
   * (a prop or a data-attribute on the component's root tag), and an optional `moodMap`
   * (option -> moods that favour it) used for deterministic, LLM-free selection from the plan mood.
   * The chosen option is forced onto the rendered tag authoritatively — the model's own value,
   * if any, is overridden. See engine/agent/generate.ts (selectSlots / applySlots).
   */
  slots?: Record<string, ComponentSlot>
  source_url?: string
  license?: string
  /** DESIGN notes only. Dependencies live in the structured fields above, never in prose. */
  notes?: string
}

/** One configurable knob on a motion primitive — bounded + typed so the pipeline can validate it. */
export interface MotionParam {
  /** prop name the agent fills, e.g. "start", "end", "intensity", "from" */
  name: string
  /** percent = 0..100 scroll position; state = a from/to CSS object; enum/number as named */
  type: 'percent' | 'number' | 'enum' | 'state'
  default: number | string | Record<string, unknown>
  min?: number
  max?: number
  options?: string[]
  /** the param this must stay strictly below (e.g. start.lessThan = "end") — a deterministic check */
  lessThan?: string
  describe: string
}

/**
 * /knowledge/motion-primitives/*.json — the motion tier. A pre-built scroll-choreography unit
 * (declarative GSAP ScrollTrigger via @bsmnt/scrollytelling) that the agent SELECTS and CONFIGURES,
 * never writes scroll physics for. Rides the same generation rails as a component (usage_example +
 * genUse + import-check), but gated by the run's locked motion language and validated on its params.
 */
export interface MotionPrimitiveDoc {
  id: string
  name: string
  /** the choreography family — used for the no-mixing check and retrieval */
  effect: 'kinetic-text-split' | 'card-stack-deal' | 'pinned-crossfade' | 'skew-on-velocity' | 'parallax-depth' | 'horizontal-pan'
  framework: Framework
  tags: string[]
  /** verbatim primitive. MUST ship its own prefers-reduced-motion fallback + sane defaults so a bad
   *  param degrades rather than breaks — the authoritative-safety principle, baked into the code. */
  code: string
  dependencies: string[]
  registry_files: string[]
  client_component: boolean
  /** the bounded knobs the agent fills (validated: percent 0..100, start<end) */
  params: MotionParam[]
  /** the composition contract — WHAT content nests inside (drives the agent + the wraps check) */
  wraps: 'headline' | 'card-list' | 'media' | 'section-block'
  /**
   * The MULTI-CHILD contract, valid only when `wraps: 'card-list'`. A card-list primitive takes an
   * ARRAY of N children rather than one tweened node, so its failure modes are different in kind: too
   * few cards (the choreography doesn't read), too many (the stagger window collapses and the fan
   * becomes unreadable), or a hand-written ordering that isn't monotonic.
   *
   * Declared here rather than sniffed out of the code — same discipline as ComponentDoc.framework.
   * `validatePrimitive` enforces it against the section the model actually wrote.
   */
  cardList?: {
    /** the prop carrying the array, e.g. 'cards' */
    prop: string
    /** fewest cards for the choreography to read as a deal */
    min: number
    /** most cards before the stagger window collapses */
    max: number
  }
  /**
   * Content-fit gating (replaces the old fixed-section `backs`): which COMPOSITIONS this primitive
   * suits. A primitive is eligible when the run's motion lock matches AND the section's composition
   * is in this list — capability-based, not tied to a fixed section vocabulary.
   */
  fitsCompositions: Composition[]
  /** locked motion languages this suits — the retrieval filter. */
  motion_language: MotionLanguage[]
  usage_example?: string
  source_url?: string
  license?: string
  notes?: string
}

/**
 * /knowledge/plan-preferences/*.json — a logged REJECTION of a proposed section structure at the
 * wireframe-approval gate. Embeddable/retrievable like critiques: before the Plan step synthesizes a
 * new section list, past rejections matching this brief's mood/archetype are pulled in as "avoid this"
 * grounding. The `reason` (free text the user gave) is the valuable half.
 */
export interface PlanPreferenceDoc {
  brief: string
  mood: string[]
  archetype: string
  /** the section-type sequence that was rejected */
  rejectedSections: string[]
  /** free-text reason the user gave for rejecting the structure */
  reason: string
  tags: string[]
}

/** One pointable thing on a site, paired with the principle behind it. */
export interface CritiqueObservation {
  /** the concrete, pointable thing — what you can see */
  what: string
  /**
   * the principle behind it — the valuable half, the part a model can't derive.
   * OPTIONAL on purpose: not every observation earns a principle, and inventing one is worse
   * than leaving it out.
   */
  why?: string
  /** A concrete failure mode: when this technique becomes inappropriate or starts feeling generic. */
  avoid?: string
}

/**
 * /knowledge/critiques/*.json — the highest-value data: structured design judgment.
 *
 * Chunked PER OBSERVATION at ingest, exactly as guidelines are chunked per rule. A whole
 * critique in one vector averages a dozen distinct claims into one point in space, so the
 * more carefully you critique a site the less findable each insight becomes. Measured:
 * a 13-observation critique lost to a 10-observation one on its own verbatim sentence.
 */
export interface CritiqueDoc {
  site: string
  url?: string
  screenshot?: string
  observations: CritiqueObservation[]
  /** the overarching insight that doesn't map to any single technique. Its own chunk. */
  throughline?: string
  tags: string[]
}

/** A single retrievable unit stored in SQLite + the vector index. */
export interface KnowledgeRow {
  id: number
  kind: DocKind
  doc_id: string
  name: string
  category: string
  /** '' for anything that isn't a component */
  framework: string
  tags: string[]
  source_path: string
  /** the text that was embedded (never the raw component code — that pollutes vectors) */
  embed_text: string
  /** the full original object, for the agent to consume later */
  payload: unknown
}

export interface SearchHit extends KnowledgeRow {
  /** cosine similarity, 1.0 = identical */
  score: number
}
