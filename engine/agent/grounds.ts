/**
 * GROUNDS — the colour fields sections sit on.
 *
 * WHY THIS IS THE BIGGEST REMAINING GAP
 *
 * Every page this system has ever produced ran on ONE background, top to bottom. Measured on the
 * work we studied, that is the opposite of what the good pages do: Cantor8 runs blue → near-black →
 * blue → white → white, and the change of ground IS the structure — which is exactly why it needs no
 * divider lines, no container outlines and no carded sections. Linear alternates dark fields with
 * lifted panels. A page with one ground has to invent furniture to show where it is; a page with
 * several just changes the floor.
 *
 * WHY IT ALSO FIXES CONTRAST
 *
 * A ground is not a colour, it is a TOKEN SET — background, foreground, muted, border, card. A
 * section on a dark ground has light foreground tokens, so the kit's atoms, the surface language and
 * the devices all adapt automatically, because every one of them names a role rather than a colour.
 *
 * That matters because of a real failure: a section hand-built a tinted "active" row and chose green
 * text on it, ratio 1.0, invisible. It picked a colour because nothing gave it one. With grounds it
 * is not picking — the failure stops being caught after the fact and starts being unauthorable.
 *
 * DERIVED, NOT PROMPTED
 *
 * The palette is already committed, so the grounds derive from it deterministically. What the model
 * commits is the STRATEGY — how much the page changes ground at all — which is a genuine stylistic
 * decision (a quiet editorial page and a cinematic one want different answers) without handing the
 * model an opportunity to author an unreadable pairing.
 */
import type { Palette } from './art-direction.js'
import type { Mood } from './types.js'
import type { RhythmPlan } from './rhythm.js'
import type { SketchPlan } from './sketch.js'

/** The four fields a page can stand on. Deliberately few — a page with six grounds has none. */
export const GROUNDS = ['base', 'raised', 'inverse', 'accent'] as const
export type Ground = (typeof GROUNDS)[number]

/**
 * How much the page changes ground.
 *   mono        one field throughout — correct for quiet editorial work, and honest about it
 *   alternating base/raised in a steady rhythm — the classic product-page pulse
 *   punctuated  mostly base, with one or two inverse/accent fields that land like a cut
 */
export const GROUND_STRATEGIES = ['mono', 'alternating', 'punctuated'] as const
export type GroundStrategy = (typeof GROUND_STRATEGIES)[number]

export interface GroundPlan {
  /** aligned by index with plan.sections */
  grounds: Ground[]
  strategy: GroundStrategy
}

export function clampGroundStrategy(raw: unknown, mood: Mood[]): GroundStrategy {
  const s = String(raw ?? '').toLowerCase().trim() as GroundStrategy
  if ((GROUND_STRATEGIES as readonly string[]).includes(s)) return s
  // Fallback by mood rather than a fixed default, so a missing commitment still suits the brief.
  if (mood.includes('brutalist') || mood.includes('aggressive')) return 'punctuated'
  if (mood.includes('calm') || mood.includes('premium')) return 'mono'
  return 'alternating'
}

/**
 * Assign a ground to every section.
 *
 * The rules are page-level, which is the whole point — no section can know whether the page needs it
 * to be the one dark field.
 */
export function planGrounds(
  sectionCount: number,
  strategy: GroundStrategy,
  sketch: SketchPlan,
  rhythm: RhythmPlan
): GroundPlan {
  const grounds: Ground[] = new Array(sectionCount).fill('base')
  if (sectionCount === 0) return { grounds, strategy }

  if (strategy === 'alternating') {
    // A steady pulse, but never alternating so regularly that it reads as a chequerboard: two base
    // sections then a raised one gives a rhythm rather than a stripe.
    for (let i = 0; i < sectionCount; i++) grounds[i] = i % 3 === 2 ? 'raised' : 'base'
  }

  if (strategy === 'punctuated') {
    // The page's focal section gets the strong field. A cut only reads as a cut if it is rare, so at
    // most two across the page, and never adjacent to each other.
    const focal = Math.min(sketch.focalIndex, sectionCount - 1)
    grounds[focal] = 'inverse'
    // A second punctuation, placed as far from the first as possible, on a section the rhythm
    // already marks as open — a strong field wants room, not a cramped one.
    if (sectionCount >= 6) {
      let best = -1
      let bestDist = 0
      for (let i = 0; i < sectionCount; i++) {
        if (Math.abs(i - focal) < 2) continue
        if (rhythm.beats[i]?.density === 'tight') continue
        const d = Math.abs(i - focal)
        if (d > bestDist) {
          bestDist = d
          best = i
        }
      }
      if (best >= 0) grounds[best] = 'accent'
    }
  }

  // MONO MEANS MONO. Observed on a real run: a committed "mono" page came out with four different
  // fields, because the two rules below each overrode it for defensible individual reasons. A
  // commitment that the system quietly edits is not a commitment — a page that deliberately chose one
  // field is allowed to have one field, and the anti-monotony rule does not apply to a decision whose
  // whole point is monotony.
  if (strategy === 'mono') return { grounds, strategy }

  // A full-bleed image section is better on a dark field: a photograph sitting on white has a hard
  // edge at the top and bottom of the page, and on a dark ground it does not.
  for (let i = 0; i < sectionCount; i++) {
    if (sketch.beats[i]?.arrangement === 'full-bleed-media' && grounds[i] === 'base') grounds[i] = 'inverse'
  }

  // No three consecutive identical grounds — the same anti-monotony rule the rhythm plan uses.
  for (let i = 2; i < sectionCount; i++) {
    if (grounds[i] !== grounds[i - 1] || grounds[i] !== grounds[i - 2]) continue
    grounds[i] = grounds[i] === 'base' ? 'raised' : 'base'
  }
  return { grounds, strategy }
}

export const describeGrounds = (g: GroundPlan): string =>
  `${g.strategy}: ${g.grounds.map((x) => ({ base: '·', raised: '▒', inverse: '█', accent: '◆' })[x]).join('')}`

/**
 * Emit the grounds as CSS.
 *
 * Each class RE-POINTS the theme tokens rather than setting colours on the section, so every atom,
 * device and surface inside it adapts without knowing anything about grounds. `color-scheme` is set
 * too, so native controls and scrollbars inside a dark field stop looking pasted on.
 */
export function groundsCss(p: Palette): string {
  return `
/*
 * GROUNDS — the fields sections stand on. Each re-points the theme TOKENS, so the kit, the surface
 * language and the device library all adapt automatically: they name roles, never colours.
 * This is why text on a dark field cannot be authored unreadable — nothing inside is choosing a
 * colour at all.
 */
.ground-base {
  background: var(--background);
  color: var(--foreground);
}
.ground-raised {
  --background: ${p.card};
  --card: ${p.secondary};
  background: var(--background);
  color: var(--foreground);
}
.ground-inverse {
  --background: ${p.foreground};
  --foreground: ${p.background};
  --muted-foreground: color-mix(in srgb, ${p.background} 62%, ${p.foreground});
  --border: color-mix(in srgb, ${p.background} 22%, ${p.foreground});
  --card: color-mix(in srgb, ${p.background} 8%, ${p.foreground});
  --secondary: color-mix(in srgb, ${p.background} 14%, ${p.foreground});
  color-scheme: dark;
  background: var(--background);
  color: var(--foreground);
}
.ground-accent {
  --background: ${p.accent};
  --foreground: ${p.accentForeground};
  --muted-foreground: color-mix(in srgb, ${p.accentForeground} 68%, ${p.accent});
  --border: color-mix(in srgb, ${p.accentForeground} 26%, ${p.accent});
  --card: color-mix(in srgb, ${p.accentForeground} 10%, ${p.accent});
  --secondary: color-mix(in srgb, ${p.accentForeground} 16%, ${p.accent});
  --accent: ${p.accentForeground};
  --accent-foreground: ${p.accent};
  background: var(--background);
  color: var(--foreground);
}
`
}

/** Told to the section so its copy and imagery suit the field it will sit on. */
export function groundPromptBlock(ground: Ground): string {
  if (ground === 'base') return ''
  const what = {
    raised: 'a slightly lifted field, one step away from the page background',
    inverse: 'a DARK field — the page inverts here',
    accent: 'the brand colour as a full field'
  }[ground]
  return `GROUND — this section sits on ${what}. It is applied for you; do NOT set your own background.
- Every colour token (text, muted text, borders, cards) has already flipped to suit it. Use the theme
  classes exactly as elsewhere — text-foreground, text-muted-foreground, border-border — and they will
  be correct. NEVER hardcode a colour like text-white or text-black to "match" this field: that is how
  a section ends up unreadable when the ground changes.${
    ground === 'inverse' || ground === 'accent'
      ? '\n- Imagery on this field should be dark-friendly (no white-background product shots pasted onto it).'
      : ''
  }`
}
