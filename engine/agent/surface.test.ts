/**
 * The surface + light language.
 *
 * The property that matters most is one a type system cannot express: two different commitments must
 * produce pages that do not look related. Before this existed, the only surface properties the system
 * owned were `border` and `border-radius`, so varying the component grammar produced four
 * near-identical pages — measured, and the reason this module exists.
 *
 * The second property is that every emitted shadow must be COMPOSABLE. `box-shadow: none, X` is
 * invalid CSS and the browser drops the whole declaration; three of four commitments silently lost
 * their elevation that way before it was caught in a browser.
 */
import { clampSurface, surfaceCss, surfacePromptBlock, lintSurface, describeSurface, SURFACES, ELEVATIONS, LIGHTS, BLENDS, EDGE_FADES, TEXTURES } from './surface.js'
import type { Mood } from './types.js'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failed++
}

console.log('\nsurface grammar\n')

const good = clampSurface({ surface: 'inset-ring', elevation: 'hairline', light: 'radial-glow', blend: 'overlay', edgeFade: 'none', texture: 'noise', rationale: 'screen-native' }, ['technical'])
check('accepts a valid commitment unchanged', good.surface.surface === 'inset-ring' && good.surface.light === 'radial-glow')
check('no adjustments on a valid commitment', good.adjustments.length === 0, good.adjustments.join(' | '))

const bad = clampSurface({ surface: 'neumorphic', elevation: 'floaty', light: 'lens-flare', blend: 'screen', edgeFade: 'vignette', texture: 'paper' }, ['brutalist'])
check('repairs every out-of-grammar axis', bad.adjustments.length >= 6, `${bad.adjustments.length}`)
check('a repaired surface is still valid', (SURFACES as readonly string[]).includes(bad.surface.surface) && (LIGHTS as readonly string[]).includes(bad.surface.light))

// Incoherent combinations resolved rather than emitted as committed no-ops.
check('blend with no light is dropped', clampSurface({ light: 'none', blend: 'multiply' }, []).surface.blend === 'none')
check('glass with no elevation gains one', clampSurface({ surface: 'glass', elevation: 'none' }, []).surface.elevation !== 'none')

console.log('\ncomposable shadows — the invalid-css trap\n')

// EVERY combination must emit shadows that survive being comma-joined.
for (const surface of SURFACES) {
  for (const elevation of ELEVATIONS) {
    const css = surfaceCss(clampSurface({ surface, elevation, light: 'none', blend: 'none', edgeFade: 'none', texture: 'none' }, []).surface)
    const ring = /--s-surface-ring:\s*([^;]+);/.exec(css)?.[1]?.trim() ?? ''
    const shadow = /--s-shadow:\s*([^;]+);/.exec(css)?.[1]?.trim() ?? ''
    check(`${surface}/${elevation}: ring token is composable (never "none")`, ring !== 'none' && ring.length > 0, ring)
    check(`${surface}/${elevation}: shadow token is composable`, shadow !== 'none' && shadow.length > 0, shadow)
  }
}

console.log('\nvariety — two commitments must not look related\n')

const a = surfaceCss(clampSurface({ surface: 'inset-ring', elevation: 'hairline', light: 'radial-glow', blend: 'overlay', edgeFade: 'none', texture: 'noise' }, []).surface)
const b = surfaceCss(clampSurface({ surface: 'shadow-stack', elevation: 'soft', light: 'gradient-mesh', blend: 'none', edgeFade: 'fade-bottom', texture: 'none' }, []).surface)
check('different commitments emit different css', a !== b)
check('inset-ring emits an inset ring', a.includes('inset 0 0 0 1px'))
check('shadow-stack does not', !b.includes('--s-surface-ring: inset'))
check('radial-glow emits one gradient', (a.match(/radial-gradient/g) ?? []).length === 1)
check('gradient-mesh emits several', (b.match(/radial-gradient/g) ?? []).length >= 3)
check('fade-bottom emits a mask', b.includes('mask-image'))
check('a commitment with no fade emits none', !a.includes('mask-image'))

const combos = SURFACES.length * ELEVATIONS.length * LIGHTS.length * BLENDS.length * EDGE_FADES.length * TEXTURES.length
check(`grammar is wide (${combos} combinations)`, combos >= 1000)

// Fallbacks must diverge by mood, or every failed commitment lands on one look.
const moods: Mood[][] = [['brutalist'], ['technical'], ['calm'], ['playful']]
check('mood fallbacks diverge', new Set(moods.map((m) => describeSurface(clampSurface({}, m).surface))).size >= 3)

console.log('\nsafety\n')

const withLight = surfaceCss(clampSurface({ light: 'radial-glow' }, []).surface)
check('the light layer never intercepts clicks', withLight.includes('pointer-events: none'))
check('the light layer sits behind content', withLight.includes('z-index: -1') && withLight.includes('isolation: isolate'))
check('texture is decorative only', surfaceCss(clampSurface({ texture: 'noise' }, []).surface).includes('pointer-events: none'))

console.log('\nlint — hand-rolled surfaces\n')
check('flags a shadow utility', lintSurface('<div className="shadow-lg p-6">x</div>').some((w) => w.includes('s-raised')))
check('flags a hand-built card', lintSurface('<div className="bg-white border border-gray-200">x</div>').some((w) => w.includes('one way of making a surface')))
check('quiet when the language is used', lintSurface('<div className="s-raised p-6">x</div>').length === 0)
check('quiet on ordinary layout', lintSurface('<div className="grid gap-6">x</div>').length === 0)
check('prompt block names s-raised', surfacePromptBlock(good.surface).includes('s-raised'))

console.log(failed ? `\nFAIL — ${failed} check(s)\n` : '\nPASS — surface language holds\n')
process.exit(failed ? 1 : 0)
