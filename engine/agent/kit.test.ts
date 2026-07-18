/**
 * The project kit.
 *
 * Two properties matter here and they pull against each other:
 *
 *   - VARIETY BETWEEN RUNS. If the grammar collapses onto the same combination, this is a preset
 *     library with extra steps — the exact failure that made a previous attempt at shared components
 *     unusable, where every site built on them became recognisable at a glance.
 *   - CONSISTENCY WITHIN A RUN. One committed form, emitted once, so a page cannot end up with
 *     fourteen slightly different buttons (measured on a real page before this existed).
 *
 * Plus one non-negotiable: correctness properties (focus ring, reduced motion, contrast-by-token) are
 * DERIVED, never chosen. A model that can commit to a form must not be able to commit away the focus
 * ring or hardcode a colour.
 */
import { clampKit, kitCss, kitPromptBlock, lintKit, describeKit, CORNERS, BUTTON_FORMS, ICONS, EDGES, EYEBROWS, ATOM_DENSITIES } from './kit.js'
import type { InteractionSpec, TypographySpec } from './art-direction.js'
import type { Mood } from './types.js'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failed++
}

const MI: InteractionSpec = { durationMs: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', hoverTransform: 'translateY(-2px)', hoverShadow: 'none', tapScale: 0.98, cursor: 'pointer' }
const TYPE: TypographySpec = {
  displayStack: 'grotesque', displayFamily: 'system-ui', bodyStack: 'grotesque', bodyFamily: 'system-ui',
  scaleRatio: 1.33, displayWeight: 500, bodyWeight: 400, displayTracking: '-0.01em',
  displayLineHeight: 1.1, bodyLineHeight: 1.6, pairing: 'test'
}

console.log('\nkit grammar\n')

// The model chooses within a closed vocabulary; anything outside it is repaired, never accepted.
const good = clampKit({ corner: 'square', button: 'split-cell', icon: 'arrow', edge: 'hairline', eyebrow: 'mono-tracked', density: 'regular', rationale: 'instrument-like' }, ['technical'], 'developer-tool')
check('accepts a valid commitment unchanged', good.kit.button === 'split-cell' && good.kit.corner === 'square')
check('no adjustments on a valid commitment', good.adjustments.length === 0, good.adjustments.join(' | '))
check('keeps the rationale', good.kit.rationale.includes('instrument'))

const bad = clampKit({ corner: 'rounded-xl', button: 'gradient', icon: 'sparkle', edge: 'shadow', eyebrow: 'fancy', density: 'huge' }, ['brutalist'], 'saas-product')
check('repairs every out-of-grammar axis', bad.adjustments.length === 6, `${bad.adjustments.length} adjustments`)
check('repairs are mood-informed, not a fixed default', bad.kit.corner === 'square' && bad.kit.density === 'tight', describeKit(bad.kit))
check('a repaired kit is still fully valid', (CORNERS as readonly string[]).includes(bad.kit.corner) && (BUTTON_FORMS as readonly string[]).includes(bad.kit.button))

// Incoherent combinations are resolved rather than emitted.
const incoherent = clampKit({ corner: 'pill', button: 'underline', icon: 'none', edge: 'none', eyebrow: 'none', density: 'tight' }, [], 'editorial-story')
check('resolves pill + underline (no box to round)', incoherent.kit.corner === 'square')

console.log('\nvariety between runs — the preset-library failure\n')

// Different briefs must be ABLE to land on genuinely different forms.
const moods: Mood[][] = [['brutalist'], ['calm'], ['technical'], ['playful'], ['premium']]
const fallbacks = new Set(moods.map((m) => describeKit(clampKit({}, m, 'saas-product').kit)))
check('mood-based fallbacks are not all identical', fallbacks.size >= 3, `${fallbacks.size} distinct from ${moods.length} moods`)

const combos = CORNERS.length * BUTTON_FORMS.length * ICONS.length * EDGES.length * EYEBROWS.length * ATOM_DENSITIES.length
check(`grammar is wide enough to not be a preset set (${combos} combinations)`, combos >= 500)

// Two different valid commitments must produce genuinely different CSS.
const a = kitCss(clampKit({ corner: 'square', button: 'underline', icon: 'none', edge: 'none', eyebrow: 'small-caps', density: 'tight' }, [], 'editorial-story').kit, MI, TYPE)
const b = kitCss(clampKit({ corner: 'pill', button: 'solid', icon: 'chevron', edge: 'tint', eyebrow: 'mono-tracked', density: 'generous' }, [], 'ecommerce-product').kit, MI, TYPE)
check('different commitments emit different css', a !== b)
check('a square/underline run has no pill radius', !a.includes('999px'))
check('a pill/solid run does', b.includes('999px'))

console.log('\nconsistency within a run\n')

const css = kitCss(good.kit, MI, TYPE)
for (const cls of ['.c-btn', '.c-btn-ghost', '.c-eyebrow', '.c-tag', '.c-link', '.c-field', '.c-tile']) {
  check(`emits ${cls}`, css.includes(cls))
}
check('exactly one .c-btn construction is emitted', (css.match(/^\.c-btn \{/gm) ?? []).length === 1)

console.log('\ncorrectness is derived, never chosen\n')

// Every valid combination must keep these, whatever the model committed to.
for (const form of BUTTON_FORMS) {
  const k = clampKit({ corner: 'square', button: form, icon: 'none', edge: 'rule', eyebrow: 'none', density: 'regular' }, [], 'saas-product').kit
  const c = kitCss(k, MI, TYPE)
  check(`${form}: keeps a focus-visible ring`, c.includes(':focus-visible') && c.includes('outline:'))
  check(`${form}: respects reduced motion`, c.includes('prefers-reduced-motion: reduce'))
  // Atoms name ROLES, not colours — that is what makes them correct on any ground.
  check(`${form}: hardcodes no hex colour`, !/#[0-9a-f]{3,6}/i.test(c), (c.match(/#[0-9a-f]{3,6}/i) ?? [])[0] ?? '')
}

console.log('\nlint — hand-rolled atoms\n')

check('flags a hand-built button', lintKit('<a className="bg-primary px-6 py-3 rounded-md">Get started</a>').some((w) => w.includes('hand-built button')))
check('flags a boxed input', lintKit('<input className="border rounded px-3" />').some((w) => w.includes('c-field')))
check('flags a hand-rolled eyebrow', lintKit('<span className="uppercase tracking-widest text-xs">Origin</span>').some((w) => w.includes('c-eyebrow')))
check('quiet when the kit is used', lintKit('<a className="c-btn"><span>Get in touch</span></a>').length === 0)
check('quiet on ordinary layout classes', lintKit('<div className="grid gap-6 px-6"><p>text</p></div>').length === 0)

const block = kitPromptBlock(good.kit)
check('prompt block names the classes', block.includes('c-btn') && block.includes('c-eyebrow'))
check('prompt block forbids rebuilding them', /never rebuild|Do NOT write your own/i.test(block))

console.log(failed ? `\nFAIL — ${failed} check(s)\n` : '\nPASS — kit grammar, variety and invariants hold\n')
process.exit(failed ? 1 : 0)
