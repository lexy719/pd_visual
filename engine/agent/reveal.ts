/**
 * The locked REVEAL — one entrance behaviour for the whole page, in CSS.
 *
 * THE PROBLEM THIS REPLACES
 *
 * Reveal was the last piece of motion left to per-section improvisation, and every section duly
 * invented its own. A real run shipped `transition-all duration-700 ease-out` with a JS effect
 * setting inline opacity, while the run's own locked InteractionSpec committed to 200ms with a
 * specific easing. So the page ran two unrelated motion languages at once, drifting section by
 * section — the motion equivalent of every section re-deciding its own padding.
 *
 * Three concrete defects came out of that one pattern:
 *   - `transition-all` animates EVERY property, layout included, which is where the jank comes from
 *   - each section's JS reveal fires on its own observer, so nothing is in step
 *   - the visual pass photographed a 700ms fade mid-flight and reported "faded overlapping text"
 *     as a collision defect — a real defect report caused purely by improvised motion
 *
 * WHY NATIVE SCROLL-DRIVEN ANIMATION
 *
 * `animation-timeline: view()` ties the animation to the element's own progress through the
 * viewport, in CSS. For this system specifically that matters more than elegance:
 *
 *   - NO requestAnimationFrame. This repo has lost a full session to rAF not firing when
 *     `document.hidden` is true (CLAUDE.md), and the Lenis work needed four guards for the same
 *     reason. A CSS timeline is structurally immune to it.
 *   - NO JavaScript, no observer, no per-section effect, nothing to hydrate.
 *   - It is CSS, so the writer STAMPS it. That is the same enforcement that took device adoption
 *     from 1 section in 8 to 6 in 8. Knowledge is worth what it is enforced at.
 *   - Scroll position determines state deterministically, so a screenshot at a given scroll offset
 *     is reproducible instead of catching a timer mid-fade.
 *
 * FAILING SAFE IS NON-NEGOTIABLE
 *
 * A reveal that hides content and then fails to un-hide it is catastrophic — an invisible page. So
 * the hiding half lives ENTIRELY inside `@supports (animation-timeline: view())`. A browser without
 * support never applies `opacity: 0` in the first place; it simply shows the content. Same for
 * reduced motion. There is no code path where content can be hidden with no mechanism to reveal it.
 */
import type { InteractionSpec } from './art-direction.js'
import type { Composition, MotionLanguage } from '../types.js'

/** How much the element travels on entry, per motion language intensity. */
export interface RevealSpec {
  /** vertical offset in px at the start of the reveal */
  rise: number
  /** viewport range over which the reveal plays, as CSS animation-range */
  range: string
}

export const REVEAL_BY_INTENSITY: Record<'calm' | 'standard' | 'sharp', RevealSpec> = {
  // Long, gentle travel — the reveal is felt rather than noticed.
  calm: { rise: 18, range: 'entry 5% cover 32%' },
  standard: { rise: 14, range: 'entry 10% cover 26%' },
  // Short and quick: arrives almost as soon as it enters, suiting aggressive/kinetic languages.
  sharp: { rise: 10, range: 'entry 15% cover 20%' }
}

/**
 * The KIND of entrance, bound to a section's composition.
 *
 * One fade applied to every section is consistent but flat — nine sections arriving identically
 * reads as a template, which is the fair criticism of a single locked reveal. Different kinds of
 * content want different arrivals: a cinematic frame should settle INTO place like a shot landing,
 * body copy should barely move because a reader's eye is already there, and a grid of items should
 * arrive as items rather than as one slab.
 *
 * Still one decision per section, made deterministically from what the section already is — variety
 * without improvisation, which is the same bargain as the rhythm plan.
 */
export const REVEAL_KINDS = ['rise', 'lift', 'settle', 'stagger'] as const
export type RevealKind = (typeof REVEAL_KINDS)[number]

export const KIND_BY_COMPOSITION: Record<Composition, RevealKind> = {
  cinematic: 'lift', // a held frame arriving: scale settling out, no vertical jump
  immersive: 'lift',
  editorial: 'settle', // prose: fade with almost no travel — moving text the eye is already reading is worse than still text
  narrative: 'settle',
  gallery: 'stagger', // items arrive as items, each on its own position in the viewport
  modular: 'stagger',
  timeline: 'rise',
  asymmetric: 'rise'
}

export const revealKind = (c: Composition): RevealKind => KIND_BY_COMPOSITION[c] ?? 'rise'

/**
 * Reveal intensity from the run's locked motion language, so the entrance agrees with the motion
 * character already committed to rather than being a second, unrelated decision. Intensity sets HOW
 * FAR and HOW LONG; the kind above sets WHICH movement.
 */
export function revealIntensity(m: MotionLanguage): 'calm' | 'standard' | 'sharp' {
  if (m === 'aggressive' || m === 'kinetic' || m === 'brutalist-cut') return 'sharp'
  if (m === 'parallax-slow' || m === 'none') return 'calm'
  return 'standard'
}

/**
 * Emit the reveal CSS.
 *
 * `easing` is taken from the run's locked InteractionSpec so the entrance shares the page's
 * committed motion character instead of inventing a second one — the whole point of a lock.
 */
export function revealCss(mi: InteractionSpec, intensity: 'calm' | 'standard' | 'sharp' = 'standard'): string {
  const r = REVEAL_BY_INTENSITY[intensity]
  return `
/*
 * GENERATED PER RUN — the locked entrance. Scroll-driven and CSS-only: no observer, no rAF, nothing
 * to hydrate. Sections carry .reveal; nothing else may hand-roll an entrance.
 *
 * The hidden state exists ONLY inside @supports, so a browser without scroll-driven animation shows
 * the content outright rather than hiding it with no way to bring it back.
 */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    @keyframes reveal-rise {
      from { opacity: 0; transform: translateY(${r.rise}px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    /* A held frame landing: the scale settles out and there is no vertical jump, because a large
       image sliding upward reads as a slide deck rather than as photography. */
    @keyframes reveal-lift {
      from { opacity: 0; transform: scale(1.04); }
      to   { opacity: 1; transform: scale(1); }
    }
    /* Prose. Almost no travel on purpose — moving text the eye has already started reading is more
       irritating than text that simply appears. */
    @keyframes reveal-settle {
      from { opacity: 0; transform: translateY(${Math.round(r.rise / 3)}px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .reveal, .reveal-children > * {
      animation: reveal-rise both ${mi.easing};
      animation-timeline: view();
      animation-range: ${r.range};
    }
    .reveal-lift { animation-name: reveal-lift; }
    .reveal-settle { animation-name: reveal-settle; }

    /* STAGGER — the section itself does NOT animate; its children each run on their own view
       timeline, so the offset between them comes from real position on screen rather than an
       invented per-child delay. That is why it survives any number of items and any reflow. */
    .reveal-stagger { animation: none; }
    .reveal-stagger .container-page > *,
    .reveal-stagger [class*="dev-"] > * {
      animation: reveal-rise both ${mi.easing};
      animation-timeline: view();
      animation-range: ${r.range};
    }
  }
}
`
}

/**
 * Hand-rolled entrance patterns a section must not use, with the reason stated in the message.
 *
 * Named mechanisms, not symptoms: the escalation prompt has to tell the model WHAT to remove and
 * what to use instead, or it rewrites cosmetically and reintroduces the same thing.
 */
export function lintReveal(code: string): string[] {
  const warns: string[] = []

  if (/\btransition-all\b/.test(code)) {
    warns.push(
      'transition-all animates every property including layout, which is the usual source of jank — transition only the properties that change (opacity/transform), or use the locked .reveal'
    )
  }

  // A long hand-rolled duration is the tell of an invented entrance; the locked spec owns timing.
  const longDur = code.match(/\bduration-(\d{3,})\b/)
  if (longDur && Number(longDur[1]) > 400) {
    warns.push(
      `duration-${longDur[1]} is a hand-rolled entrance timing — the page's motion is locked; apply "reveal" to the block instead of choosing your own duration`
    )
  }

  // opacity-0 plus a JS toggle is the improvised observer reveal. Dangerous as well as inconsistent:
  // if the effect fails to run, the content stays invisible with no fallback.
  if (/\bopacity-0\b/.test(code) && /IntersectionObserver|useState|useEffect/.test(code)) {
    warns.push(
      'hand-rolled scroll reveal (opacity-0 toggled from JS) — content is invisible if the effect never runs. Use the locked "reveal" class, which is CSS-only and cannot strand content'
    )
  }

  return warns
}

/**
 * NOTE ON RANGES — why every range here is `cover`-based, not `entry`-based.
 *
 * Measured on a real generated page: all 8 sections were TALLER than the viewport (1232–2699px
 * against 966px). That is the normal case, not an edge case, and it decides the range syntax. An
 * element taller than the viewport never completes its `entry` phase in normal scrolling, so a range
 * like `entry 0% entry 60%` leaves whole sections stuck at opacity 0 — verified live, it returned
 * zeros for five of eight sections. `cover`-based ranges complete for elements of any height.
 *
 * Do not "simplify" these to entry-only ranges. It reads cleaner and strands content.
 */
