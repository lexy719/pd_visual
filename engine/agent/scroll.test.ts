/**
 * Scroll-feel lock.
 *
 * The assertions that matter here are the GUARDS, not the feel. Lenis intercepts the wheel and
 * drives scrolling from requestAnimationFrame; in a context where rAF never fires — which this
 * repo's own preview demonstrably is (CLAUDE.md) — an unguarded install is not a degraded animation
 * but a page that cannot be scrolled at all. Every guard below has a live counterpart verified in a
 * browser; these tests keep them from being deleted as "unnecessary defensive code".
 */
import { feelForMotion, smoothScrollModule, scrollCss, FEEL_BY_MOTION, FEEL_PARAMS, SCROLL_FEELS } from './scroll.js'
import type { MotionLanguage } from '../types.js'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failed++
}

console.log('\nscroll feel\n')

const LANGUAGES: MotionLanguage[] = ['none', 'subtle', 'aggressive', 'parallax-slow', 'brutalist-cut', 'kinetic']
for (const m of LANGUAGES) {
  const f = feelForMotion(m)
  check(`"${m}" maps to a known feel (${f})`, (SCROLL_FEELS as readonly string[]).includes(f))
}

// A lock must not override the art direction it came from: unsmoothed scrolling IS the brutalist and
// no-motion position, so those must stay native.
check('"none" stays native', feelForMotion('none') === 'native')
check('"brutalist-cut" stays native — instant scroll is the point', feelForMotion('brutalist-cut') === 'native')
check('"parallax-slow" is the smoothest feel', feelForMotion('parallax-slow') === 'smooth')

// Native writes NO module — a page that chose native carries no scroll code, rather than shipping a
// disabled library.
check('native emits no module', smoothScrollModule('native') === null)
check('native emits no css', scrollCss('native') === '')

for (const feel of ['gentle', 'smooth', 'snappy'] as const) {
  const src = smoothScrollModule(feel)!
  check(`${feel}: emits a module`, !!src && src.includes('useSmoothScroll'))
  check(`${feel}: guards reduced motion`, src.includes('prefers-reduced-motion'))
  check(`${feel}: guards a hidden document (no rAF => unscrollable page)`, src.includes('document.hidden'))
  check(`${feel}: has the ?nosmooth escape hatch for headless capture`, src.includes('nosmooth'))
  check(`${feel}: leaves touch input native`, src.includes('pointer: coarse'))
  check(`${feel}: tears down if the tab becomes hidden`, src.includes('visibilitychange') && src.includes('destroy'))
  check(`${feel}: drives rAF itself rather than autoRaf`, src.includes('autoRaf: false'))
  check(`${feel}: keeps ScrollTrigger in step`, src.includes('ScrollTrigger'))
  check(`${feel}: cleans up on unmount`, src.includes('cancelAnimationFrame'))
  check(`${feel}: uses its own lerp`, src.includes(`lerp: ${FEEL_PARAMS[feel].lerp}`))
  // The lerp band: below ~0.06 the page feels detached from the input device, which reads as broken.
  check(`${feel}: lerp stays in the credible band`, FEEL_PARAMS[feel].lerp >= 0.06 && FEEL_PARAMS[feel].lerp <= 0.16)
  const css = scrollCss(feel)
  check(`${feel}: emits lenis support css`, css.includes('html.lenis') && css.includes('lenis-stopped'))
  // The page relies on `overflow-x: clip` so full-bleed devices cannot cause sideways scroll.
  // Lenis's suggested `html { overflow: hidden }` would break that contract.
  check(`${feel}: does not set overflow:hidden on the root`, !/^html\s*\{[^}]*overflow:\s*hidden/m.test(css))
}

// Every motion language must resolve — a missing entry would silently fall to native and quietly
// remove smooth scrolling from a whole class of pages.
check('every motion language has an explicit mapping', LANGUAGES.every((m) => FEEL_BY_MOTION[m] !== undefined))

console.log(failed ? `\nFAIL — ${failed} check(s)\n` : '\nPASS — scroll lock and guards intact\n')
process.exit(failed ? 1 : 0)
