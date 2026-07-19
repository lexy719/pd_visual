/**
 * The composition device library — ONE source of truth.
 *
 * A device is verified geometry the page already owns. A section chooses WHICH device fits its
 * content and applies the class; it never rebuilds the layout by hand. This is what separates a
 * correct page from a designed one: depth, tension and hierarchy arrive as a decision, not as a
 * hopeful pile of Tailwind utilities.
 *
 * Everything about a device lives here — its CSS, its default composition, and its name. Before
 * this module the names were duplicated across writer.ts (CSS), generate.ts (the flatness lint and
 * DEFAULT_DEVICE) and knowledge/guidelines/devices.md, so a device could exist in CSS while staying
 * invisible to the lint that is supposed to demand it. devices.test.ts asserts the three stay in
 * sync, which is the only reason adding a device is now a one-file change.
 */
import type { Composition } from '../types.js'

/** Every device name. The flatness lint and the section prompt derive from this list. */
export const DEVICE_NAMES = [
  'dev-overlap',
  'dev-offset-grid',
  'dev-quote-break',
  'dev-bleed',
  'dev-stat-row',
  'dev-feature-grid',
  'dev-logo-wall',
  'dev-frame',
  'dev-side-rail',
  'dev-compare',
  'dev-faq',
  'dev-price-table',
  'dev-stage'
] as const

export type DeviceName = (typeof DEVICE_NAMES)[number]

/** Matches any device class in generated code. Built from DEVICE_NAMES so it can never drift. */
export const DEVICE_RE = new RegExp(`\\b(${DEVICE_NAMES.join('|')})\\b`)

/**
 * Valid `dev-*` classes that are NOT devices themselves — modifiers and inner parts a device styles.
 * Listed here so the hallucination lint can tell "a real part of a device" from "a class the model
 * made up".
 */
export const DEVICE_MODIFIERS = [
  'dev-stage-tl',
  'dev-stage-bl',
  'dev-stage-tr',
  'dev-stage-br',
  'dev-stage-c',
  'dev-stage-media',
  'dev-stage-body',
  'dev-overlap-left',
  'dev-stat-n',
  'dev-stat-l',
  'dev-price-n',
  'dev-price-p',
  'dev-price-featured',
  'dev-compare-yes',
  'dev-compare-no'
] as const

/** Every legitimate `dev-*` class: devices plus their modifiers. */
export const ALL_DEVICE_CLASSES: ReadonlySet<string> = new Set([...DEVICE_NAMES, ...DEVICE_MODIFIERS])

/**
 * Find `dev-*` classes in generated code that DO NOT EXIST.
 *
 * A model that invents `dev-feature-min` produces a class with no CSS behind it: completely inert,
 * no error, no warning, and the section silently falls back to unstyled stacked blocks while looking
 * — to every other check — as though it applied a device. Observed live on a real run. The flatness
 * lint cannot catch it either, because the section genuinely "has a dev- class".
 */
export function unknownDeviceClasses(code: string): string[] {
  const found = code.match(/\bdev-[a-z0-9-]+/g) ?? []
  return [...new Set(found.filter((c) => !ALL_DEVICE_CLASSES.has(c)))]
}

/**
 * The device a composition reaches for when the model picks none. Not a ceiling — a floor, so a
 * section is never *just* stacked rectangles. Chosen to match what each composition is already
 * trying to do, so the default rarely fights the content.
 */
export const DEFAULT_DEVICE: Record<Composition, DeviceName> = {
  cinematic: 'dev-bleed',
  editorial: 'dev-quote-break',
  gallery: 'dev-offset-grid',
  narrative: 'dev-overlap',
  asymmetric: 'dev-overlap',
  modular: 'dev-feature-grid',
  immersive: 'dev-bleed',
  timeline: 'dev-offset-grid'
}

/**
 * The device CSS, emitted verbatim into the page theme. Every device is responsive and
 * container-safe by construction, so none of them can produce the overflow or void defects the
 * visual pass measures.
 */
export const DEVICE_CSS = `
/* html-level clip makes edge bleeds safe: a full-bleed child can never create a horizontal
   scrollbar, which is what normally makes designers avoid the device entirely. */
html { overflow-x: clip; }

/* dev-overlap — OCCLUSION depth. Two children; the second overlaps the first and sits above it.
   Occlusion is the only reliable depth signal (a shadow on a flat box reads as a sticker). */
.dev-overlap { position: relative; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); align-items: start; }
.dev-overlap > :first-child { grid-column: 1 / span 8; grid-row: 1; position: relative; z-index: 1; }
.dev-overlap > :nth-child(2) { grid-column: 7 / -1; grid-row: 1; position: relative; z-index: 2; margin-top: clamp(48px, 9vw, 120px); }
.dev-overlap.dev-overlap-left > :first-child { grid-column: 5 / -1; }
.dev-overlap.dev-overlap-left > :nth-child(2) { grid-column: 1 / span 6; }
@media (max-width: 820px) {
  .dev-overlap { display: flex; flex-direction: column; gap: 20px; }
  .dev-overlap > :first-child, .dev-overlap > :nth-child(2) { margin-top: 0; }
}

/* dev-offset-grid — a grid whose alternate columns sit lower, replacing the dead uniform row. */
.dev-offset-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: clamp(20px, 3vw, 40px); align-items: start; }
.dev-offset-grid > :nth-child(even) { margin-top: clamp(32px, 6vw, 88px); }
@media (max-width: 820px) { .dev-offset-grid > :nth-child(even) { margin-top: 0; } }

/* dev-quote-break — a pull-quote that breaks OUT of the text measure, the classic editorial tension
   device. Large enough to read as intentional (never a 4px near-miss). */
/* The escape is tied to the container's OWN padding and can never exceed it. Independent clamps
   were a latent overflow: -4vw can outgrow a 48px-capped padding, so on a wide viewport the quote
   punched out of the page. Measured live: scrollWidth 1331px against a 1280px viewport, reported as
   a blocking defect. Using the identical expression makes the two cancel exactly. */
.dev-quote-break { max-width: 46ch; position: relative; margin-inline: calc(-1 * clamp(20px, 4vw, 48px)); padding-inline: clamp(20px, 4vw, 48px); border-left: 2px solid var(--accent); }
@media (max-width: 820px) { .dev-quote-break { margin-inline: 0; padding-inline: 16px; } }

/* dev-bleed — escape the container to the full viewport width, safely (html clips the excess).
   One bleed per page: the device works by contrast with everything that respects the container. */
.dev-bleed { width: 100vw; margin-inline: calc(50% - 50vw); }

/* BLEED-MEDIA — stamped by the writer on any section whose sketch beat is "full-bleed-media".
   Asking a section to be full-bleed does not work: measured on a real cinematic run, the page's
   FOCAL full-bleed beat rendered as a 1082px contained panel because the primitive it used wrapped
   itself in container-page. The arrangement was communicated and ignored. So the container is
   released here instead of requested — the section spans the viewport whatever is inside it. */
.bleed-media > .container-page,
.bleed-media .container-page { max-width: none; padding-inline: 0; }
.bleed-media { padding-inline: 0; }

/* dev-stat-row — oversized numerals. The single scale jump, systematised. */
.dev-stat-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: clamp(24px, 4vw, 56px); }
.dev-stat-row .dev-stat-n { font-family: var(--font-display); font-size: clamp(44px, 6vw, 84px); line-height: 0.95; letter-spacing: -0.03em; color: var(--foreground); display: block; }
.dev-stat-row .dev-stat-l { font-size: 13px; color: var(--muted-foreground); margin-top: 6px; display: block; }

/* dev-feature-grid — uniform cards that COMPLETE their rows (auto-fit prevents the ragged trailing
   gap that reads as a broken layout). SaaS/product furniture. */
.dev-feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: clamp(16px, 2vw, 28px); }
/* Consumes the run's committed SURFACE LANGUAGE rather than hardcoding a bordered card, so changing
   the surface commitment re-skins every feature cell on the page at once. */
.dev-feature-grid > * { background: var(--s-surface-bg, var(--card)); border: var(--s-surface-border, 1px solid var(--border)); box-shadow: var(--s-surface-ring, 0 0 0 0 transparent), var(--s-shadow, 0 0 0 0 transparent); border-radius: var(--kit-radius, var(--radius)); padding: clamp(20px, 2.4vw, 32px); }

/* dev-logo-wall — evenly spaced wordmarks; text, never images (a row of mismatched logo files is
   the cheapest-looking element on the web). */
/* space-between, not a left-clustered flex row: at a wide container six wordmarks occupied ~1040px
   of 1448px and left the remainder hard against the right edge, which is the classic unfinished-at-
   fullscreen tell. */
.dev-logo-wall { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: clamp(24px, 5vw, 64px); opacity: 0.72; }
.dev-logo-wall > * { font-weight: 600; letter-spacing: 0.02em; color: var(--muted-foreground); }

/* dev-frame — a matted frame around media. Repeating one frame treatment is a craft signal. */
.dev-frame { padding: clamp(8px, 1vw, 14px); background: var(--s-surface-bg, var(--card)); border: var(--s-surface-border, 1px solid var(--border)); box-shadow: var(--s-surface-ring, 0 0 0 0 transparent), var(--s-shadow, 0 0 0 0 transparent); border-radius: var(--kit-radius, var(--radius)); }

/* dev-side-rail — a sticky label/nav column beside long content. The single most effective cure for
   a long scrolling section that loses the reader: the rail holds position while the content moves.
   First child is the rail, second is the content. Collapses to a normal stack on narrow screens,
   where sticky positioning in a short viewport would trap the reader instead of orienting them. */
.dev-side-rail { display: grid; grid-template-columns: minmax(180px, 22%) minmax(0, 1fr); gap: clamp(24px, 5vw, 72px); align-items: start; }
.dev-side-rail > :first-child { position: sticky; top: clamp(24px, 8vh, 96px); align-self: start; }
/* The content column beside the rail reached ~126 characters at a wide container; prose needs a
   measure whatever the container does. */
.dev-side-rail > :nth-child(2) p, .dev-side-rail > :nth-child(2) li { max-width: 68ch; }
@media (max-width: 900px) {
  .dev-side-rail { grid-template-columns: minmax(0, 1fr); gap: 20px; }
  .dev-side-rail > :first-child { position: static; }
}

/* dev-compare — an aligned comparison table. Deliberately NOT offset or staggered: when items are
   being compared, alignment IS the meaning, and any rhythm device would read as an error. Scrolls
   inside itself on narrow screens so it can never widen the page. */
.dev-compare { width: 100%; overflow-x: auto; }
/* Capped: at a 1448px container a 3-column table gave ~480px cells holding a single tick, so the eye
   had to cross the whole container to associate a row with its mark. */
.dev-compare table { width: 100%; max-width: 1100px; border-collapse: collapse; min-width: 520px; }
.dev-compare th, .dev-compare td { text-align: left; padding: clamp(12px, 1.6vw, 20px); border-bottom: 1px solid var(--border); vertical-align: top; }
.dev-compare thead th { font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted-foreground); font-weight: 600; }
.dev-compare tbody tr:last-child td { border-bottom: 0; }
.dev-compare .dev-compare-yes { color: var(--accent); font-weight: 600; }
.dev-compare .dev-compare-no { color: var(--muted-foreground); }

/* dev-faq — questions as a typographic list, not as a row of cards. Carding an FAQ is the classic
   tell of a generated page: the answers are prose and prose does not want a border. Uses <details>
   so it works with zero JS and stays keyboard-accessible. */
.dev-faq { border-top: 1px solid var(--border); }
.dev-faq > details { border-bottom: 1px solid var(--border); padding: clamp(16px, 2vw, 24px) 0; }
.dev-faq > details > summary { cursor: pointer; list-style: none; font-weight: 600; font-size: clamp(16px, 1.4vw, 19px); display: flex; justify-content: space-between; gap: 24px; align-items: baseline; }
.dev-faq > details > summary::-webkit-details-marker { display: none; }
.dev-faq > details > summary::after { content: '+'; color: var(--muted-foreground); font-weight: 400; }
.dev-faq > details[open] > summary::after { content: '\\2212'; }
.dev-faq > details > :not(summary) { margin-top: 12px; max-width: 68ch; color: var(--muted-foreground); line-height: 1.65; }

/* dev-stage — A FRAME, not a band.
 *
 * Every other device arranges content INSIDE a horizontal strip that the page then stacks. That is
 * why pages read as competent and never as cinematic: cinematic work composes within a frame — media
 * filling it edge to edge, type anchored hard to one corner, layers rather than flow.
 *
 * The stage is the page's one structure that is not a band. Media is absolutely positioned and
 * covers; the body sits above it and is placed against a corner by a modifier stamped FROM THE
 * SKETCH'S ANCHOR.
 *
 * DESCENDANT selectors, not child. These were child combinators and that silently broke every stage on a real run:
 * when the section adapts a motion primitive, the primitive wraps the body one level deeper, so
 * .dev-stage with a child combinator matched nothing. The anchor never applied (so the committed corner
 * was AGAIN not consumed), the white type colour never applied (so type sat over a covering photo in the
 * ground's own foreground colour), and the z-index never applied (so the body rendered UNDER the
 * scrim). Three guarantees, all silently absent, with no lint or test to notice — the sketch has been deciding an anchor per section all along and nothing
 * consumed it until now.
 *
 * The scrim is not decoration. Type over a photograph is the single most reliable way to ship
 * unreadable text, and it cannot be solved by choosing a colour because the photograph is unknown at
 * authoring time. A gradient scrim keyed to the anchor guarantees contrast under the type wherever it
 * sits, so the failure stops being possible rather than being caught later. */
.dev-stage {
  position: relative;
  min-height: 86vh;
  display: grid;
  overflow: clip;
  isolation: isolate;
  padding: clamp(28px, 5vw, 88px);
}
/* Media fills the frame. object-fit keeps a portrait photograph from distorting into a landscape box. */
.dev-stage .dev-stage-media,
.dev-stage .dev-stage-media img,
.dev-stage > img {
  position: absolute; inset: 0; z-index: 0;
  width: 100%; height: 100%; object-fit: cover;
}
/* The readability scrim — strongest at the anchored corner, gone at the opposite one. */
.dev-stage::before {
  content: ''; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: linear-gradient(to top, color-mix(in srgb, #000 72%, transparent) 0%, color-mix(in srgb, #000 28%, transparent) 42%, transparent 72%);
}
.dev-stage.dev-stage-tl::before, .dev-stage.dev-stage-tr::before {
  background: linear-gradient(to bottom, color-mix(in srgb, #000 72%, transparent) 0%, color-mix(in srgb, #000 28%, transparent) 42%, transparent 72%);
}
.dev-stage.dev-stage-c::before {
  background: radial-gradient(75% 65% at 50% 50%, color-mix(in srgb, #000 62%, transparent) 0%, color-mix(in srgb, #000 18%, transparent) 62%, transparent 100%);
}
/* The body layers above both, and hangs off the anchor the sketch committed to. */
.dev-stage .dev-stage-body {
  position: relative; z-index: 2;
  max-width: min(88%, 34em);
  /* Type on a stage is white-on-image by construction, so it takes its own tokens rather than the
     section's ground — the scrim above guarantees this stays readable whatever the photograph is. */
  color: #fff;
}
.dev-stage .dev-stage-body :is(h1, h2, h3) { color: #fff; }
.dev-stage-bl .dev-stage-body { place-self: end start; }
.dev-stage-br .dev-stage-body { place-self: end end; text-align: right; }
.dev-stage-tl .dev-stage-body { place-self: start start; }
.dev-stage-tr .dev-stage-body { place-self: start end; text-align: right; }
.dev-stage-c  .dev-stage-body { place-self: center; text-align: center; max-width: min(94%, 42ch); }
/* A stage is a frame, so it should not also carry the page's section padding. */
.dev-stage.section-pad, .section-pad > .dev-stage { padding-block: clamp(28px, 5vw, 88px); }
@media (max-width: 820px) {
  .dev-stage { min-height: 72vh; }
  .dev-stage .dev-stage-body { max-width: 100%; place-self: end start; text-align: left; }
}

/* dev-price-table — pricing tiers that stay aligned, with ONE emphasised plan. The emphasis is the
   whole point: an undifferentiated row of three prices makes the reader do the work, which is how a
   pricing section fails. Add dev-price-featured to exactly one child. */
.dev-price-table { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: clamp(16px, 2vw, 24px); align-items: stretch; }
.dev-price-table > * { display: flex; flex-direction: column; background: var(--s-surface-bg, var(--card)); border: var(--s-surface-border, 1px solid var(--border)); box-shadow: var(--s-surface-ring, 0 0 0 0 transparent), var(--s-shadow, 0 0 0 0 transparent); border-radius: var(--kit-radius, var(--radius)); padding: clamp(24px, 2.6vw, 36px); }
.dev-price-table > .dev-price-featured { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.dev-price-table .dev-price-n { font-family: var(--font-display); font-size: clamp(32px, 3.4vw, 48px); line-height: 1; letter-spacing: -0.02em; color: var(--foreground); display: block; }
.dev-price-table .dev-price-p { font-size: 13px; color: var(--muted-foreground); margin-top: 6px; display: block; }
.dev-price-table > * > :last-child { margin-top: auto; padding-top: clamp(16px, 2vw, 24px); }
`
