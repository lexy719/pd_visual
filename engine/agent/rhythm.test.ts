/**
 * Page-rhythm invariants.
 *
 * The rhythm exists to break a uniform pulse, so the assertions that matter are about the SEQUENCE,
 * not any single section. The degenerate input — a page whose sections are all identical — is the
 * real test: if the planner returns a flat rhythm there, it has done nothing, because that is
 * precisely the page that most needs contrast imposed on it.
 */
import { planRhythm, rhythmCss, DENSITY_PAD, VOLUME_SCALE, DENSITIES, VOLUMES } from './rhythm.js'
import { stampRhythm } from './writer.js'
import type { SectionPlan, Emphasis } from './types.js'
import type { Composition } from '../types.js'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failed++
}
const S = (c: Composition, e: Emphasis): SectionPlan => ({ name: 'x', intent: 'x', composition: c, emphasis: e })
const longestRun = (xs: string[]): number => {
  let max = 1
  let cur = 1
  for (let i = 1; i < xs.length; i++) {
    cur = xs[i] === xs[i - 1] ? cur + 1 : 1
    if (cur > max) max = cur
  }
  return xs.length ? max : 0
}

console.log('\npage rhythm\n')

// The degenerate case: identical sections must NOT produce an identical rhythm.
const flat = Array.from({ length: 8 }, () => S('editorial', 'md'))
const fr = planRhythm(flat)
check('uniform input does not yield a uniform page', new Set(fr.beats.map((b) => b.density)).size > 1)
check('no run of three identical densities', longestRun(fr.beats.map((b) => b.density)) < 3, `run of ${longestRun(fr.beats.map((b) => b.density))}`)

// Exactly one peak, always — a page with three climaxes has none.
for (const n of [1, 3, 5, 8, 12]) {
  const p = planRhythm(Array.from({ length: n }, (_, i) => S('editorial', i === 2 ? 'xl' : 'md')))
  check(`${n} sections -> exactly one loud peak`, p.beats.filter((b) => b.volume === 'loud').length === 1)
  check(`${n} sections -> peakIndex is the loud one`, p.beats[p.peakIndex]?.volume === 'loud')
  check(`${n} sections -> a beat per section`, p.beats.length === n)
}

// Highest emphasis wins the peak.
const emph = [S('editorial', 'sm'), S('editorial', 'md'), S('editorial', 'xl'), S('editorial', 'lg')]
check('peak goes to the highest-emphasis section', planRhythm(emph).peakIndex === 2)

// Composition fit, checked away from the peak so the peak rule doesn't mask it.
const fit = planRhythm([S('editorial', 'md'), S('modular', 'xl'), S('modular', 'md'), S('cinematic', 'md')])
check('a modular section leans tight', fit.beats[2]!.density === 'tight')
check('a cinematic section leans open', fit.beats[3]!.density === 'open')

// Volume must not shout next to the peak.
const near = planRhythm([S('gallery', 'lg'), S('editorial', 'xl'), S('gallery', 'lg')])
check('no second loud section adjacent to the peak', near.beats.filter((b) => b.volume === 'loud').length === 1)

// REGRESSION — the real Kettle v3 plan shipped TWO loud headings. Every earlier fixture used 'md'
// for non-peak sections, so nothing exercised a page with several high-emphasis sections, which is
// exactly the shape a planner produces in practice. A page with two scale jumps has none.
const kettleV3 = [
  S('cinematic', 'lg'), S('narrative', 'md'), S('timeline', 'xl'), S('modular', 'lg'),
  S('editorial', 'md'), S('editorial', 'sm'), S('asymmetric', 'md')
]
const v3 = planRhythm(kettleV3)
check('the real v3 plan yields exactly one loud section', v3.beats.filter((b) => b.volume === 'loud').length === 1, `got ${v3.beats.filter((b) => b.volume === 'loud').length}`)
check('the loud one IS the peak', v3.beats[v3.peakIndex]!.volume === 'loud')

// Stress: many high-emphasis sections must still yield exactly one loud.
for (const n of [4, 7, 10]) {
  const loud = planRhythm(Array.from({ length: n }, (_, i) => S(i % 2 ? 'gallery' : 'cinematic', i === 1 ? 'xl' : 'lg')))
    .beats.filter((b) => b.volume === 'loud').length
  check(`${n} all-high-emphasis sections -> still exactly one loud`, loud === 1, `got ${loud}`)
}

// Empty and single-section pages must not throw or produce nonsense.
check('empty plan is safe', planRhythm([]).beats.length === 0)
check('single section is its own peak', planRhythm([S('editorial', 'md')]).peakIndex === 0)

console.log('\nemitted css\n')
const css = rhythmCss()
for (const d of DENSITIES) check(`.rhythm-${d} multiplies --section-pad`, css.includes(`.rhythm-${d}`) && css.includes(`* ${DENSITY_PAD[d]}`))
for (const v of VOLUMES) check(`.vol-${v} rescales --h2`, css.includes(`.vol-${v}`) && css.includes(`* ${VOLUME_SCALE[v]}`))
check('volume drives the h2 custom property, not a competing font-size', css.includes('--h2: calc(var(--h2-base)'))

console.log('\nstamping\n')
const src = '<section className="section-pad"><div className="container-page"><h2>Title</h2></div></section>'
const stamped = stampRhythm(src, { density: 'tight', volume: 'quiet' })
// The stamp carries all three page-level decisions: density, volume, and the locked entrance.
check('adds density, volume and reveal to the root section', /className="section-pad rhythm-tight vol-quiet reveal"/.test(stamped), stamped.slice(0, 100))
check('every stamped section gets the locked reveal', stamped.includes(' reveal'))
check('keeps the existing section-pad', stamped.includes('section-pad'))
check('never double-stamps', stampRhythm(stamped, { density: 'open', volume: 'loud' }) === stamped)
check('handles a template-literal className', /rhythm-open/.test(stampRhythm('<section className={`section-pad ${x}`}><p/></section>', { density: 'open', volume: 'loud' })))
check('no beat leaves code untouched', stampRhythm(src, undefined) === src)
check('only the ROOT section is stamped', (stampRhythm('<section className="a"><section className="b"/></section>', { density: 'open', volume: 'loud' }).match(/rhythm-/g) ?? []).length === 1)

console.log(failed ? `\nFAIL — ${failed} check(s)\n` : '\nPASS — rhythm invariants hold\n')
process.exit(failed ? 1 : 0)
