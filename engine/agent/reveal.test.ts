/**
 * Reveal lock.
 *
 * The single most important property here is that content can NEVER be stranded invisible. A reveal
 * that hides content and then fails to un-hide it is worse than no reveal at all — it is a blank
 * page. Every assertion about @supports and reduced-motion exists to keep that guarantee, not for
 * tidiness.
 */
import { revealCss, revealIntensity, lintReveal, REVEAL_BY_INTENSITY, revealKind, REVEAL_KINDS } from './reveal.js'
import type { InteractionSpec } from './art-direction.js'
import { COMPOSITIONS } from '../types.js'
import type { MotionLanguage } from '../types.js'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failed++
}

const MI: InteractionSpec = {
  durationMs: 200,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  hoverTransform: 'translateY(-2px)',
  hoverShadow: 'none',
  tapScale: 0.98,
  cursor: 'pointer'
}

console.log('\nreveal\n')

const css = revealCss(MI, 'standard')

// FAIL-SAFE. The hidden state must exist only where a mechanism to reveal it also exists.
const supportsIdx = css.indexOf('@supports (animation-timeline: view())')
check('emits an @supports gate', supportsIdx >= 0)
check('opacity:0 appears ONLY inside @supports', css.indexOf('opacity: 0') > supportsIdx, 'a browser without support would hide content forever')
check('respects reduced motion', css.includes('prefers-reduced-motion: no-preference'))
check('uses a view timeline, not a scroll timeline', css.includes('animation-timeline: view()'))
check('uses fill mode both so the end state holds', /animation: reveal-rise both/.test(css))
check('borrows the locked easing rather than inventing one', css.includes(MI.easing))

// Ranges must be cover-based. Verified live: real sections are all taller than the viewport, and an
// entry-only range strands them at opacity 0.
for (const [name, spec] of Object.entries(REVEAL_BY_INTENSITY)) {
  check(`${name}: range is cover-based (entry-only strands tall sections)`, spec.range.includes('cover'), spec.range)
  check(`${name}: rise is subtle enough not to cause layout shock`, spec.rise > 0 && spec.rise <= 24)
}

// Intensity must follow the run's committed motion language.
const langs: MotionLanguage[] = ['none', 'subtle', 'aggressive', 'parallax-slow', 'brutalist-cut', 'kinetic']
for (const m of langs) check(`"${m}" resolves to an intensity`, ['calm', 'standard', 'sharp'].includes(revealIntensity(m)))
check('aggressive is sharp', revealIntensity('aggressive') === 'sharp')
check('parallax-slow is calm', revealIntensity('parallax-slow') === 'calm')

console.log('\nentrance kinds\n')

// One fade for every section is consistent but flat. Variety must still be DERIVED, never improvised.
for (const c of COMPOSITIONS) {
  check(`${c}: maps to a known kind (${revealKind(c)})`, (REVEAL_KINDS as readonly string[]).includes(revealKind(c)))
}
check('cinematic settles rather than slides — a big image sliding reads as a slide deck', revealKind('cinematic') === 'lift')
check('editorial barely moves — moving text mid-read is worse than still text', revealKind('editorial') === 'settle')
check('a grid staggers so items arrive as items', revealKind('modular') === 'stagger')
check('more than one kind is actually in use', new Set(COMPOSITIONS.map(revealKind)).size >= 3)

for (const k of ['rise', 'lift', 'settle']) check(`@keyframes reveal-${k} is emitted`, css.includes(`@keyframes reveal-${k}`))
check('stagger does not animate the section itself, only its children', /\.reveal-stagger \{ animation: none; \}/.test(css))
check('every kind still hides only inside @supports', css.indexOf('opacity: 0') > css.indexOf('@supports'))
// Scope to the reveal-lift block itself: an unbounded scan runs on into reveal-settle, which
// legitimately uses translateY, and reports a false failure.
const liftBlock = css.slice(css.indexOf('@keyframes reveal-lift'), css.indexOf('@keyframes reveal-settle'))
check('lift uses scale', /scale\(1\.04\)/.test(liftBlock), liftBlock.slice(0, 90))
check('lift has NO vertical travel — a big image sliding upward reads as a slide deck', !/translateY\(\s*[1-9]/.test(liftBlock))

console.log('\nlint — improvised entrances\n')

// The exact patterns a real run shipped.
const improvised = '<div className="opacity-0 transition-all duration-700 ease-out">x</div>'
const flags = lintReveal(improvised)
check('flags transition-all', flags.some((f) => f.includes('transition-all')))
check('flags a hand-rolled long duration', flags.some((f) => f.includes('duration-700')))
check('names the mechanism, not just the symptom', flags.some((f) => f.includes('opacity/transform') || f.includes('locked')))

const jsReveal = 'const [v,setV]=useState(false); return <div className="opacity-0">x</div>'
check('flags a JS-toggled opacity reveal', lintReveal(jsReveal).some((f) => f.includes('invisible if the effect never runs')))

// Must not fire on legitimate code.
check('does not flag the locked reveal class', lintReveal('<section className="section-pad reveal">x</section>').length === 0)
check('does not flag a short interaction duration', lintReveal('<a className="duration-200 transition-colors">x</a>').length === 0)
check('does not flag opacity-0 without a JS toggle', lintReveal('<div className="opacity-0">x</div>').length === 0)

console.log(failed ? `\nFAIL — ${failed} check(s)\n` : '\nPASS — reveal locked and fail-safe\n')
process.exit(failed ? 1 : 0)
