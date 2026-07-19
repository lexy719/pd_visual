/**
 * THE SURFACE + LIGHT LANGUAGE — how this project makes a surface, and where its light comes from.
 *
 * WHY THIS EXISTS
 *
 * Measured on real work: Linear's page carries inset 1px rings (not borders), hairline shadows at
 * 0.03 alpha, radial glows at 3-4%, spotlight and fade masks, and mix-blend overlay/lighten. Stripe
 * carries coloured radial gradients at 0.8 alpha under multiply/hard-light/exclusion, plus layered
 * elevation (0 20px 40px -20px). Both ship ~185 SVGs and a real typeface.
 *
 * Our entire surface vocabulary was `1px solid border` and `border-radius`. Nothing else. No glow, no
 * gradient, no blend mode, no mask, no elevation stack, anywhere in the emitted CSS.
 *
 * That is why varying corner radius and button form produced four near-identical component panes:
 * those were the only two properties the system owned. The look of a page is decided far more by how
 * its surfaces are MADE and where the light falls than by the shape of its buttons.
 *
 * Same contract as the kit and the palette: a CLOSED grammar, committed once per run by the model,
 * validated here, emitted as real CSS. Variety between projects, one surface language within a page.
 *
 * Everything downstream — the kit's atoms, the device library's cards and tiles — consumes these
 * tokens instead of hardcoding a border, so committing to a different surface language changes the
 * whole page at once rather than one component.
 */
import type { Mood } from './types.js'

/** How a raised element is separated from its ground. The single most identity-defining choice. */
export const SURFACES = ['inset-ring', 'hairline', 'shadow-stack', 'tint', 'glass', 'flat'] as const
/** The elevation character — how (and whether) things sit above the page. */
export const ELEVATIONS = ['none', 'hairline', 'soft', 'deep'] as const
/** Where light comes from, if anywhere. */
export const LIGHTS = ['none', 'radial-glow', 'gradient-mesh', 'top-sheen'] as const
/** How the light layer blends with what is under it. */
export const BLENDS = ['none', 'overlay', 'multiply', 'lighten', 'hard-light'] as const
/** Masked edges — the vocabulary that makes a section dissolve rather than stop. */
export const EDGE_FADES = ['none', 'fade-bottom', 'fade-both', 'spotlight'] as const
/** Surface texture, at very low strength. */
export const TEXTURES = ['none', 'noise', 'scanline'] as const

export type Surface = (typeof SURFACES)[number]
export type Elevation = (typeof ELEVATIONS)[number]
export type Light = (typeof LIGHTS)[number]
export type Blend = (typeof BLENDS)[number]
export type EdgeFade = (typeof EDGE_FADES)[number]
export type Texture = (typeof TEXTURES)[number]

export interface SurfaceSpec {
  surface: Surface
  elevation: Elevation
  light: Light
  blend: Blend
  edgeFade: EdgeFade
  texture: Texture
  /** one line: why this surface language suits this brief — shown in the moodboard, never used as code */
  rationale: string
}

export function clampSurface(raw: unknown, mood: Mood[]): { surface: SurfaceSpec; adjustments: string[] } {
  const adjustments: string[] = []
  const r = (raw ?? {}) as Record<string, unknown>
  const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T, axis: string): T => {
    const s = String(v ?? '').toLowerCase().trim() as T
    if (allowed.includes(s)) return s
    adjustments.push(`surface.${axis} "${String(v ?? '')}" is not in the grammar → ${fallback}`)
    return fallback
  }

  const hard = mood.includes('brutalist') || mood.includes('aggressive')
  const technical = mood.includes('technical')
  const quiet = mood.includes('calm') || mood.includes('minimal') || mood.includes('premium')

  const spec: SurfaceSpec = {
    // Accepts `construction` (the JSON key) or `surface`; the nested surface.surface key was left
    // empty by the model on two consecutive runs, which is a prompt-shape problem, not a model failure.
    surface: pick(r.construction ?? r.surface, SURFACES, hard ? 'flat' : technical ? 'inset-ring' : quiet ? 'hairline' : 'shadow-stack', 'surface'),
    elevation: pick(r.elevation, ELEVATIONS, hard ? 'none' : quiet ? 'hairline' : 'soft', 'elevation'),
    light: pick(r.light, LIGHTS, technical ? 'radial-glow' : hard ? 'none' : 'top-sheen', 'light'),
    blend: pick(r.blend, BLENDS, 'none', 'blend'),
    edgeFade: pick(r.edgeFade, EDGE_FADES, 'none', 'edgeFade'),
    texture: pick(r.texture, TEXTURES, 'none', 'texture'),
    rationale: String(r.rationale ?? '').replace(/\s+/g, ' ').trim().slice(0, 180) || '(no rationale given)'
  }

  // A blend mode with no light layer blends nothing — it is a committed no-op that reads as a
  // decision in the moodboard while doing nothing on the page.
  if (spec.light === 'none' && spec.blend !== 'none') {
    adjustments.push('surface: blend has no light layer to blend → blend none')
    spec.blend = 'none'
  }
  // Glass without any blur budget is just a tint; keep the honest name.
  if (spec.surface === 'glass' && spec.elevation === 'none') {
    adjustments.push('surface: glass with no elevation reads as a flat tint → elevation hairline')
    spec.elevation = 'hairline'
  }
  return { surface: spec, adjustments }
}

export const describeSurface = (s: SurfaceSpec): string =>
  `${s.surface}/${s.elevation} elevation/${s.light} light${s.blend !== 'none' ? ` (${s.blend})` : ''}/${s.edgeFade} edges${s.texture !== 'none' ? `/${s.texture}` : ''}`

/**
 * Emit the surface language.
 *
 * The important part is the TOKENS: --s-surface-bg, --s-surface-ring, --s-surface-shadow. Every card,
 * tile and panel downstream consumes those instead of writing its own border, so one committed change
 * re-skins the entire page. `.s-raised` is the class an element applies to become a surface.
 */
export function surfaceCss(s: SurfaceSpec): string {
  // NOTE: every shadow token must be a REAL shadow, never the keyword `none`. `box-shadow: none, X`
  // is invalid CSS and the browser drops the WHOLE declaration — measured live, three of four
  // surface commitments silently lost their elevation because their ring token was `none`. A fully
  // transparent shadow fills the slot without drawing anything.
  // Each surface is a genuinely different construction, not a restyle. The inset ring in particular
  // is what gives a crisp "screen-native" edge that a 1px border cannot: it sits INSIDE the box, so
  // it never adds to the element's size and never doubles up against a neighbour's border.
  const surfaceTokens: Record<Surface, string> = {
    'inset-ring': `
  --s-surface-bg: color-mix(in srgb, var(--foreground) 4%, var(--background));
  --s-surface-ring: inset 0 0 0 1px color-mix(in srgb, var(--foreground) 12%, transparent);
  --s-surface-border: 0;`,
    hairline: `
  --s-surface-bg: var(--card);
  --s-surface-ring: 0 0 0 0 transparent;
  --s-surface-border: 1px solid var(--border);`,
    'shadow-stack': `
  --s-surface-bg: var(--card);
  --s-surface-ring: 0 0 0 0 transparent;
  --s-surface-border: 0;`,
    tint: `
  --s-surface-bg: color-mix(in srgb, var(--foreground) 6%, transparent);
  --s-surface-ring: 0 0 0 0 transparent;
  --s-surface-border: 0;`,
    glass: `
  --s-surface-bg: color-mix(in srgb, var(--background) 62%, transparent);
  --s-surface-ring: inset 0 0 0 1px color-mix(in srgb, var(--foreground) 10%, transparent);
  --s-surface-border: 0;`,
    flat: `
  --s-surface-bg: transparent;
  --s-surface-ring: 0 0 0 0 transparent;
  --s-surface-border: 0;`
  }

  // Elevation as a STACK, not one shadow. A single blurred shadow reads as a sticker; two layers —
  // a tight contact shadow plus a wide soft one — is what reads as an object above a surface.
  const elevationTokens: Record<Elevation, string> = {
    none: `  --s-shadow: 0 0 0 0 transparent;`,
    hairline: `  --s-shadow: 0 1px 0 0 color-mix(in srgb, var(--foreground) 5%, transparent);`,
    soft: `  --s-shadow: 0 1px 2px -1px color-mix(in srgb, var(--foreground) 12%, transparent), 0 12px 28px -8px color-mix(in srgb, var(--foreground) 14%, transparent);`,
    deep: `  --s-shadow: 0 2px 4px -2px color-mix(in srgb, var(--foreground) 18%, transparent), 0 24px 48px -16px color-mix(in srgb, var(--foreground) 26%, transparent);`
  }

  const glassBlur = s.surface === 'glass' ? '\n  backdrop-filter: blur(14px);\n  -webkit-backdrop-filter: blur(14px);' : ''

  // The light layer sits BEHIND content on ::before so it can never intercept a click, and it is
  // strictly decorative — removing it changes nothing about legibility.
  const lightLayer: Record<Light, string> = {
    none: '',
    'radial-glow': `
/* A single soft glow, positioned off-centre so it reads as a light source rather than a vignette. */
.s-light { position: relative; isolation: isolate; }
.s-light::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: -1;
  background: radial-gradient(60% 50% at 22% 0%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 70%);
  ${s.blend !== 'none' ? `mix-blend-mode: ${s.blend};` : ''}
}`,
    'gradient-mesh': `
/* Three offset colour fields that overlap into a mesh — the identity of the page comes from the
   overlaps, which is why they must blend rather than stack opaquely. */
.s-light { position: relative; isolation: isolate; }
.s-light::before {
  content: ''; position: absolute; inset: -10%; pointer-events: none; z-index: -1;
  background:
    radial-gradient(38% 44% at 18% 22%, color-mix(in srgb, var(--accent) 55%, transparent) 0%, transparent 100%),
    radial-gradient(34% 40% at 78% 30%, color-mix(in srgb, var(--primary) 45%, transparent) 0%, transparent 100%),
    radial-gradient(40% 46% at 50% 88%, color-mix(in srgb, var(--accent) 32%, transparent) 0%, transparent 100%);
  filter: blur(28px);
  ${s.blend !== 'none' ? `mix-blend-mode: ${s.blend};` : ''}
}`,
    'top-sheen': `
/* A shallow sheen along the top edge — the cheapest way to make a dark field feel lit rather than
   painted, and it never competes with content because it lives in the first 40% of the box. */
.s-light { position: relative; isolation: isolate; }
.s-light::before {
  content: ''; position: absolute; inset: 0 0 auto 0; height: 40%; pointer-events: none; z-index: -1;
  background: linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 6%, transparent) 0%, transparent 100%);
  ${s.blend !== 'none' ? `mix-blend-mode: ${s.blend};` : ''}
}`
  }

  // Masked edges. A section that fades out reads as continuous with the next one; a section that
  // stops reads as a slide. This is the CSS half of the "continuity, not transition" idea.
  const fadeLayer: Record<EdgeFade, string> = {
    none: '',
    'fade-bottom': `.s-fade { -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%); mask-image: linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%); }`,
    'fade-both': `.s-fade { -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%); mask-image: linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%); }`,
    spotlight: `.s-fade { -webkit-mask-image: radial-gradient(120% 90% at 50% 40%, #000 45%, transparent 100%); mask-image: radial-gradient(120% 90% at 50% 40%, #000 45%, transparent 100%); }`
  }

  // Texture at very low strength — visible as material, never as pattern. Inline SVG so there is no
  // asset to fetch and nothing to 404.
  const noise =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.42'/%3E%3C/svg%3E\")"
  const textureLayer: Record<Texture, string> = {
    none: '',
    noise: `.s-texture { position: relative; }
.s-texture::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.035;
  background-image: ${noise};
}`,
    scanline: `.s-texture { position: relative; }
.s-texture::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; opacity: 0.05;
  background-image: repeating-linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 100%, transparent) 0 1px, transparent 1px 3px);
}`
  }

  return `
/*
 * THE SURFACE + LIGHT LANGUAGE — committed once for this project (${describeSurface(s)}).
 *
 * Everything that needs to look like a surface consumes these TOKENS rather than writing its own
 * border, so the whole page re-skins from one decision. A page's identity comes far more from how
 * its surfaces are made and where its light falls than from the shape of its buttons.
 */
:root {
${surfaceTokens[s.surface]}
${elevationTokens[s.elevation]}
}

/* Any element that should read as a surface. Deliberately does NOT set padding or radius — those
   belong to the kit and the layout, so a surface can be applied to anything. */
.s-raised {
  background: var(--s-surface-bg);
  border: var(--s-surface-border);
  box-shadow: var(--s-surface-ring), var(--s-shadow);
  border-radius: var(--kit-radius, 0px);${glassBlur}
}
/* Inset counterpart — for wells, code blocks, and anything that should sit BELOW the page surface. */
.s-inset {
  background: color-mix(in srgb, var(--foreground) 5%, transparent);
  box-shadow: inset 0 1px 2px color-mix(in srgb, var(--foreground) 10%, transparent);
  border-radius: var(--kit-radius, 0px);
}
${lightLayer[s.light]}
${fadeLayer[s.edgeFade]}
${textureLayer[s.texture]}

@media (prefers-reduced-motion: reduce) { .s-light::before { transition: none; } }
`
}

/** The block injected into every section prompt. */
export function surfacePromptBlock(s: SurfaceSpec): string {
  return `SURFACE LANGUAGE — how surfaces are made on THIS project (${describeSurface(s)}). Already in globals.css:
- "s-raised" — anything that should read as a raised surface (cards, panels, tiles). It carries this run's
  committed background, ring/border and elevation. Do NOT write your own bg-card + border + shadow.
${s.light !== 'none' ? `- "s-light" — adds the page's committed light source behind an element's content (decorative, never clickable).\n` : ''}${s.edgeFade !== 'none' ? `- "s-fade" — masks the element's edges so it dissolves into what follows instead of stopping.\n` : ''}${s.texture !== 'none' ? `- "s-texture" — the committed surface texture at low strength.\n` : ''}- NEVER hand-roll a surface: no "bg-white border border-gray-200 shadow-lg", no invented shadow values.
  One page has ONE way of making a surface.`
}

/** Flag hand-rolled surfaces — same warn→fix escalation as the kit and device lints. */
export function lintSurface(code: string): string[] {
  const warns: string[] = []
  // An invented elevation: Tailwind's shadow scale used directly rather than the committed stack.
  if (/\bshadow-(sm|md|lg|xl|2xl)\b/.test(code)) {
    warns.push(
      'hand-rolled elevation (shadow-* utility) instead of the committed surface language — apply "s-raised", which carries this run\'s elevation stack'
    )
  }
  // A hand-built card: background + border together is the shape the surface language owns.
  if (/className="[^"]*\bbg-(white|card|background)\b[^"]*\bborder\b/.test(code)) {
    warns.push('hand-built card surface (bg-* + border) instead of "s-raised" — a page must have one way of making a surface')
  }
  return warns
}
