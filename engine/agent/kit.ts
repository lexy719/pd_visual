/**
 * THE PROJECT KIT — this website's own asset library, emitted as real code before any section exists.
 *
 * WHY A KIT AND NOT A SPEC
 *
 * Everything in this system that actually works was the same move: turning an INSTRUCTION into an
 * ARTIFACT. Devices went from 1 section in 8 to 6 in 8 the moment they stopped being advice and
 * became CSS. Rhythm works because it is stamped. The reveal works because it is emitted. The palette
 * has never once misbehaved because it is committed values rather than guidance.
 *
 * An instruction can be ignored. An artifact constrains by existing. So the kit is not a description
 * of how buttons should look that sections are asked to follow — it is the buttons, written into
 * globals.css before the first section is generated. A section cannot invent a button, not because a
 * rule forbids it, but because the button it needs already exists.
 *
 * WHY NOT A PRESET LIBRARY
 *
 * Because that was tried and it failed. A fixed set of components gives consistency WITHIN a site and
 * sameness BETWEEN sites — every page built on one gets recognisable at a glance, which is the wrong
 * trade for a studio serving many clients. A lookup table keyed on mood/register is the same failure
 * wearing a different name: sixty-four presets is still presets.
 *
 * So the kit's FORM is synthesised per run, like the palette. The model commits to values from a
 * CLOSED grammar — six axes, about 1300 combinations — and those values are validated and emitted
 * deterministically. Two projects share no button; within one project there is exactly one.
 *
 * Variety between runs, consistency within a run. That is the same bargain as every other lock here.
 *
 * WHAT IS NOT THE MODEL'S TO CHOOSE
 *
 * Contrast, focus-visible, hit area and reduced-motion are correctness, not taste. They are derived,
 * never committed, because a model asked to "decide" them will eventually ship an invisible button.
 */
import type { Mood } from './types.js'
import type { Register } from '../types.js'
import type { InteractionSpec, TypographySpec } from './art-direction.js'

export const CORNERS = ['square', 'soft', 'pill'] as const
export const BUTTON_FORMS = ['solid', 'outline', 'split-cell', 'underline'] as const
export const ICONS = ['arrow', 'chevron', 'none'] as const
export const EDGES = ['rule', 'hairline', 'tint', 'none'] as const
export const EYEBROWS = ['mono-tracked', 'small-caps', 'none'] as const
export const ATOM_DENSITIES = ['tight', 'regular', 'generous'] as const

export type Corner = (typeof CORNERS)[number]
export type ButtonForm = (typeof BUTTON_FORMS)[number]
export type KitIcon = (typeof ICONS)[number]
export type Edge = (typeof EDGES)[number]
export type Eyebrow = (typeof EYEBROWS)[number]
export type AtomDensity = (typeof ATOM_DENSITIES)[number]

/**
 * The six axes. Deliberately few: too narrow and it is a preset library again, too wide and nothing
 * downstream can guarantee the combination is any good. Six is a starting judgement, to be widened
 * once there is evidence of what it actually produces.
 */
export interface KitSpec {
  /** corner language for every atom on the page — one decision, applied everywhere */
  corner: Corner
  /** how the primary action is constructed */
  button: ButtonForm
  /** the one icon shape used for direction/affordance, or none at all */
  icon: KitIcon
  /** how surfaces separate from each other: a rule, a hairline border, a tint, or nothing */
  edge: Edge
  /** the small label that sits above a heading */
  eyebrow: Eyebrow
  /** padding scale inside atoms (independent of the page's section rhythm) */
  density: AtomDensity
  /** one line: why this form suits this brief — surfaced in the moodboard, never used as code */
  rationale: string
}

const CORNER_PX: Record<Corner, string> = { square: '0px', soft: '6px', pill: '999px' }
const PAD: Record<AtomDensity, { y: string; x: string }> = {
  tight: { y: '8px', x: '14px' },
  regular: { y: '12px', x: '20px' },
  generous: { y: '16px', x: '28px' }
}

/**
 * Validate + repair a model-committed kit. Same discipline as the palette: the model chooses within
 * the grammar, the system guarantees the result is a real, buildable combination.
 *
 * The fallback is mood/register-informed rather than a fixed default, so a rejected commitment still
 * lands somewhere defensible instead of collapsing every failed run onto the same look.
 */
export function clampKit(raw: unknown, mood: Mood[], register: Register): { kit: KitSpec; adjustments: string[] } {
  const adjustments: string[] = []
  const r = (raw ?? {}) as Record<string, unknown>
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T, axis: string): T => {
    const s = String(v ?? '').toLowerCase().trim() as T
    if (allowed.includes(s)) return s
    adjustments.push(`kit.${axis} "${String(v ?? '')}" is not in the grammar → ${fallback}`)
    return fallback
  }

  // Mood-informed fallbacks. Not a lookup TABLE for the whole kit — only the landing spot when the
  // model fails an axis, so a bad commitment degrades sensibly rather than uniformly.
  const hard = mood.includes('brutalist') || mood.includes('technical') || mood.includes('aggressive')
  const soft = mood.includes('playful') || mood.includes('calm')
  const cornerFallback: Corner = hard ? 'square' : soft ? 'pill' : 'soft'
  const buttonFallback: ButtonForm = hard ? 'outline' : 'solid'
  const eyebrowFallback: Eyebrow = register === 'editorial-story' || register === 'portfolio-showcase' ? 'small-caps' : 'mono-tracked'

  const kit: KitSpec = {
    corner: pick(r.corner, CORNERS, cornerFallback, 'corner'),
    button: pick(r.button, BUTTON_FORMS, buttonFallback, 'button'),
    icon: pick(r.icon, ICONS, hard ? 'arrow' : 'none', 'icon'),
    edge: pick(r.edge, EDGES, hard ? 'hairline' : 'rule', 'edge'),
    eyebrow: pick(r.eyebrow, EYEBROWS, eyebrowFallback, 'eyebrow'),
    density: pick(r.density, ATOM_DENSITIES, mood.includes('brutalist') ? 'tight' : 'regular', 'density'),
    rationale: String(r.rationale ?? '').replace(/\s+/g, ' ').trim().slice(0, 180) || '(no rationale given)'
  }

  // A pill corner with an underline button is incoherent — the underline has no box to round.
  if (kit.corner === 'pill' && kit.button === 'underline') {
    adjustments.push('kit: underline button has no box to round → corner square')
    kit.corner = 'square'
  }
  return { kit, adjustments }
}

/** Short human-readable form for the run log and the moodboard. */
export const describeKit = (k: KitSpec): string =>
  `${k.button}/${k.corner} corners/${k.icon} icon/${k.edge} edges/${k.eyebrow} eyebrow/${k.density}`

/**
 * Emit the kit as real CSS.
 *
 * Components are written against the THEME tokens (--foreground, --muted-foreground, --border,
 * --card, --accent) directly, so a section that re-points them for its ground gets the same component
 * rendered correctly on it. An atom never names a colour, and never names an alias either — an alias
 * declared on :root is flattened once and stops following the ground.
 */
export function kitCss(kit: KitSpec, mi: InteractionSpec, type: TypographySpec): string {
  const rad = CORNER_PX[kit.corner]
  const pad = PAD[kit.density]
  const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

  // The icon is drawn in CSS rather than shipped as SVG, so a section never has to find an icon file
  // and no two sections can end up with different arrows.
  const iconGlyph = kit.icon === 'arrow' ? '"\\2197"' : kit.icon === 'chevron' ? '"\\203A"' : 'none'
  const hasIcon = kit.icon !== 'none'

  // Each button form is a genuinely different construction, not a restyle. split-cell is the one that
  // reads most "made": the label and the icon occupy separate cells divided by a rule.
  const buttonBody = {
    solid: `
  background: var(--accent); color: var(--accent-foreground); border: 0;
  padding: ${pad.y} ${pad.x};`,
    outline: `
  background: transparent; color: var(--foreground); border: 1px solid var(--foreground);
  padding: calc(${pad.y} - 1px) calc(${pad.x} - 1px);`,
    'split-cell': `
  background: var(--card); color: var(--foreground); border: 1px solid var(--border);
  padding: 0; overflow: hidden;`,
    underline: `
  background: transparent; color: var(--foreground); border: 0; border-bottom: 2px solid var(--accent);
  padding: ${pad.y} 2px; border-radius: 0;`
  }[kit.button]

  const splitParts =
    kit.button === 'split-cell'
      ? `
/* split-cell: label and icon are separate cells divided by a rule — the detail that makes a button
   read as designed rather than as a rounded rectangle. */
.c-btn > span { display: block; padding: ${pad.y} ${pad.x}; }
.c-btn::after { border-left: 1px solid var(--border); display: grid; place-items: center; width: calc(${pad.x} + 12px); align-self: stretch; }
.c-btn:hover { background: var(--accent); color: var(--accent-foreground); border-color: var(--accent); }
.c-btn:hover::after { border-left-color: color-mix(in srgb, var(--accent-foreground) 35%, transparent); }`
      : ''

  return `
/*
 * THE PROJECT KIT — generated per run. These are this website's OWN components, not a preset
 * library: the form (${describeKit(kit)}) was committed once for this brief.
 * Sections APPLY these classes; they never build their own button, tag or label.
 *
 * Written against the live theme tokens, never raw palette colours and never a :root alias, so the same
 * component stays correct on any ground a section sits on.
 */
/*
 * NOTE: the atoms below use the theme tokens DIRECTLY (--foreground, --muted-foreground, --border,
 * --card, --accent) rather than aliasing them to kit-specific names.
 *
 * An alias layer was tried and was silently broken: :root declaring --ink-muted as var(--muted-foreground)
 * resolves ONCE on :root and inherits down as a literal colour, so a section that re-points
 * --muted-foreground for its ground had no effect on it. Measured live: a c-eyebrow on an accent
 * field and another on an inverse field both rendered the BASE muted colour, failing contrast on
 * both. The claim that atoms adapt to any ground because they name roles was false — they named an
 * alias that had already been flattened.
 */
:root {
  --kit-radius: ${rad};
}

/* PRIMARY ACTION — one construction, used for every meaningful action on the page. */
.c-btn {
  display: inline-flex; align-items: stretch; gap: 0;
  font: inherit; font-weight: ${Math.min(700, type.displayWeight + 100)};
  line-height: 1; text-decoration: none; cursor: ${mi.cursor};
  border-radius: var(--kit-radius);
  transition: background-color var(--mi-dur) var(--mi-ease), color var(--mi-dur) var(--mi-ease), border-color var(--mi-dur) var(--mi-ease), transform var(--mi-dur) var(--mi-ease);${buttonBody}
}
${hasIcon ? `.c-btn::after { content: ${iconGlyph}; font-size: 1.05em; line-height: 1; }` : ''}
${kit.button !== 'split-cell' && hasIcon ? `.c-btn::after { margin-left: 0.6em; align-self: center; }` : ''}
${kit.button !== 'split-cell' ? `.c-btn > span { display: inline-block; }` : ''}
${splitParts}
.c-btn:active { transform: scale(${mi.tapScale}); }
/* Focus is DERIVED, never chosen: a committed form must not be able to remove the focus ring. */
.c-btn:focus-visible, .c-link:focus-visible, .c-field:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px;
}

/* SECONDARY ACTION — same geometry, lower weight, so the pair reads as one family. */
.c-btn-ghost {
  display: inline-flex; align-items: center; font: inherit; line-height: 1;
  padding: ${pad.y} ${pad.x}; border-radius: var(--kit-radius);
  background: transparent; color: var(--foreground); border: 1px solid var(--border);
  text-decoration: none; cursor: ${mi.cursor};
  transition: border-color var(--mi-dur) var(--mi-ease), color var(--mi-dur) var(--mi-ease);
}
.c-btn-ghost:hover { border-color: var(--foreground); }

/* EYEBROW — the small label above a heading. Sets the section's register in two words. */
${
  kit.eyebrow === 'none'
    ? `.c-eyebrow { display: block; font-size: 13px; color: var(--muted-foreground); margin-bottom: 10px; }`
    : kit.eyebrow === 'mono-tracked'
      ? `.c-eyebrow { display: block; font-family: ${mono}; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted-foreground); margin-bottom: 14px; }`
      : `.c-eyebrow { display: block; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; color: var(--muted-foreground); margin-bottom: 12px; }`
}

/* TAG — metadata, never an action. Visually quieter than any button so the two never compete. */
.c-tag {
  display: inline-block; font-size: 12px; line-height: 1; padding: 6px 10px;
  border-radius: ${kit.corner === 'pill' ? '999px' : rad};
  color: var(--muted-foreground); border: 1px solid var(--border); background: transparent;
}

/* INLINE LINK — the arrow shifts on hover, which is the whole affordance. */
.c-link {
  color: var(--foreground); text-decoration: none; border-bottom: 1px solid var(--border);
  transition: border-color var(--mi-dur) var(--mi-ease);
}
.c-link:hover { border-bottom-color: var(--foreground); }
${hasIcon ? `.c-link::after { content: ${iconGlyph}; display: inline-block; margin-left: 0.35em; transition: transform var(--mi-dur) var(--mi-ease); }
.c-link:hover::after { transform: translate(2px, -2px); }` : ''}

/* FIELD — a rule beneath, not a box around. A boxed input turns every form into a stack of cards. */
.c-field {
  width: 100%; font: inherit; color: var(--foreground); background: transparent;
  border: 0; border-bottom: 1px solid var(--border); border-radius: 0;
  padding: ${pad.y} 2px;
  transition: border-color var(--mi-dur) var(--mi-ease);
}
.c-field::placeholder { color: var(--muted-foreground); }
.c-field:focus { border-bottom-color: var(--accent); outline: none; }

/* TILE — the unified container for logos, partners, small proof items. Tinting every tile the same
   is what stops a logo wall looking like mismatched files pasted in a row. */
.c-tile {
  display: grid; place-items: center; padding: ${pad.x};
  border-radius: var(--kit-radius);
  /* Uses the run's committed surface language, so a tile is made the same way every other surface
     on the page is made — that consistency is what a unified logo wall depends on. */
  background: var(--s-surface-bg, color-mix(in srgb, var(--foreground) 6%, transparent));
  border: var(--s-surface-border, 0);
  box-shadow: var(--s-surface-ring, 0 0 0 0 transparent), var(--s-shadow, 0 0 0 0 transparent);
}

/* SURFACE EDGE — how any two areas separate, committed once. */
${
  kit.edge === 'rule'
    ? `.c-edge { border-top: 1px solid var(--border); }`
    : kit.edge === 'hairline'
      ? `.c-edge { border: 1px solid var(--border); }`
      : kit.edge === 'tint'
        ? `.c-edge { background: color-mix(in srgb, var(--foreground) 4%, transparent); }`
        : `.c-edge { }`
}

@media (prefers-reduced-motion: reduce) {
  .c-btn, .c-btn-ghost, .c-link, .c-link::after, .c-field { transition: none; }
  .c-btn:active { transform: none; }
}
`
}

/** The block injected into every section prompt: the kit EXISTS, so do not build these. */
export function kitPromptBlock(kit: KitSpec): string {
  return `THE PROJECT KIT — this site's own components already exist in globals.css. APPLY them; never rebuild them:
- "c-btn" primary action. Put the label in a <span>: <a class="c-btn"><span>Get in touch</span></a>${kit.icon !== 'none' ? ` (the ${kit.icon} is added automatically — do NOT add your own icon or emoji)` : ''}
- "c-btn-ghost" secondary action.
- "c-eyebrow" the small label above a section heading.
- "c-tag" metadata (never an action). "c-link" an inline link. "c-field" a form input. "c-tile" a logo/proof tile.
- Do NOT write your own button, tag, eyebrow, input or tile styling — no bg-primary + px-* + rounded-* buttons,
  no hand-rolled borders on inputs. This page has ONE button; fourteen slightly different ones is the failure
  this kit exists to prevent.
- The kit already carries the run's committed corner, padding, icon, focus ring and reduced-motion behaviour.`
}

/**
 * Flag hand-rolled atoms — the same warn→fix escalation as the device and voice lints.
 *
 * Only fires on the shapes that clearly duplicate a kit component, because a lint that fires on
 * legitimate layout classes would be ignored, and the real hits would be ignored with it.
 */
export function lintKit(code: string): string[] {
  const warns: string[] = []
  const usesKit = /\bc-(btn|tag|eyebrow|link|field|tile)\b/.test(code)

  // A hand-built button: a padded, coloured, rounded inline element that is clearly an action.
  const handBuiltButton =
    /className="[^"]*\b(?:bg-primary|bg-accent|bg-foreground)\b[^"]*\bpx-\d/.test(code) ||
    /className="[^"]*\bpx-\d[^"]*\b(?:rounded|border)[^"]*"[^>]*>\s*(?:Get|Start|Book|Contact|Read|Learn|Buy|Shop|Reserve|Try|Request|Explore)/i.test(code)
  if (handBuiltButton) {
    warns.push(
      'hand-built button (padded/coloured/rounded action) instead of the project kit — apply "c-btn" (or "c-btn-ghost"); the kit already carries this run\'s committed corner, padding, icon and focus ring'
    )
  }

  // A boxed input: the kit's field is a rule beneath, deliberately.
  if (/<input[^>]*className="[^"]*\b(?:border|rounded)\b/.test(code)) {
    warns.push('hand-styled form input instead of "c-field" — a boxed input turns a form into a stack of cards')
  }

  // An uppercase micro-label rebuilt by hand is an eyebrow.
  if (!usesKit && /className="[^"]*\buppercase\b[^"]*\btracking-(?:wide|wider|widest)\b/.test(code)) {
    warns.push('hand-rolled uppercase micro-label instead of "c-eyebrow"')
  }

  return warns
}
