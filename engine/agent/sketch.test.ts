/**
 * The sketch.
 *
 * The assertions that matter are the PAGE-LEVEL ones, because those are the decisions no section can
 * make from inside itself — and their absence is why seven individually-reasonable sections used to
 * stack into a page with no argument.
 *
 * The second half is about the REASON. A `why` made of adjectives ("creates a bold, modern feel") is
 * what a model writes when it has not decided anything, and passing that to the section generator as
 * guidance is worse than passing nothing: it looks like intent and carries none.
 */
import { lockSketch, isSubstantiveWhy, sketchPromptBlock, ARRANGEMENT_DEVICE, ARRANGEMENTS } from './sketch.js'
import { DEVICE_NAMES } from './devices.js'
import type { SectionPlan, Emphasis } from './types.js'
import type { Composition } from '../types.js'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failed++
}
const S = (name: string, intent: string, c: Composition = 'editorial', e: Emphasis = 'md'): SectionPlan => ({ name, intent, composition: c, emphasis: e })

console.log('\narrangement → device mapping\n')

for (const a of ARRANGEMENTS) {
  const d = ARRANGEMENT_DEVICE[a]
  check(`${a} maps to a real device or to none`, d === null || (DEVICE_NAMES as readonly string[]).includes(d), String(d))
}
check('type-led arrangements deliberately map to NO device', ARRANGEMENT_DEVICE['centred-statement'] === null && ARRANGEMENT_DEVICE['anchored-statement'] === null)
check('a comparison maps to the comparison device', ARRANGEMENT_DEVICE.compare === 'dev-compare')

console.log('\npage-level rules — what no section could decide alone\n')

const sections = [
  S('hero', 'open the story', 'cinematic', 'lg'),
  S('features', 'the capability set', 'modular'),
  S('more features', 'more capabilities', 'modular'),
  S('proof', 'customers', 'editorial'),
  S('pricing', 'three plans', 'editorial'),
  S('close', 'the ask', 'editorial')
]

// A model that returns the SAME arrangement for everything is the failure this step prevents.
const allSame = { beats: sections.map(() => ({ arrangement: 'grid', anchor: 'top-left', focal: 'the cards', why: 'because there are several items to compare side by side' })), focalIndex: 0 }
const adjA: string[] = []
const fixedA = lockSketch(allSame, sections, adjA)
const runs = (xs: string[]) => { let m = 1, c = 1; for (let i = 1; i < xs.length; i++) { c = xs[i] === xs[i-1] ? c+1 : 1; if (c>m) m=c } return xs.length ? m : 0 }
check('no two ADJACENT sections share an arrangement', runs(fixedA.beats.map((b) => b.arrangement)) === 1, fixedA.beats.map((b)=>b.arrangement).join(' → '))
check('the repair is reported, never silent', adjA.some((a) => a.includes('repeats')))

// Contrast devices are spent by repetition.
const allBleed = { beats: sections.map(() => ({ arrangement: 'full-bleed-media', anchor: 'full', focal: 'the image', why: 'the subject faces left so the type sits in the space it looks into' })), focalIndex: 0 }
const adjB: string[] = []
const fixedB = lockSketch(allBleed, sections, adjB)
check('full-bleed is capped at 2', fixedB.beats.filter((b) => b.arrangement === 'full-bleed-media').length <= 2)
const manyQuotes = { beats: sections.map(() => ({ arrangement: 'quote-break', anchor: 'top-left', focal: 'the quote', why: 'follows a dense section so it holds one sentence and nothing else' })), focalIndex: 0 }
const fixedC = lockSketch(manyQuotes, sections, [])
check('quote-break is capped at 1', fixedC.beats.filter((b) => b.arrangement === 'quote-break').length <= 1)

// Missing/garbage input must still yield a complete, content-led composition.
const adjD: string[] = []
const fromNothing = lockSketch({}, sections, adjD)
check('a failed model call still produces a full sketch', fromNothing.beats.length === sections.length)
check('fallbacks are content-led, not one default', new Set(fromNothing.beats.map((b) => b.arrangement)).size >= 3, fromNothing.beats.map((b)=>b.arrangement).join(' → '))
check('pricing content finds the pricing arrangement', fromNothing.beats[4]!.arrangement === 'tier-choice')
check('every beat has a focal', fromNothing.beats.every((b) => b.focal.length > 0))
check('focalIndex is always in range', fromNothing.focalIndex >= 0 && fromNothing.focalIndex < sections.length)

console.log('\nthe reason must be checkable\n')

for (const bad of [
  'creates a bold, modern feel',
  'adds visual interest and draws the eye',
  'this is striking and professional',
  'makes it pop',
  'clean'
]) check(`rejects adjective-mush: "${bad}"`, !isSubstantiveWhy(bad))

for (const good of [
  'the subject faces left, so the type sits in the space it looks into',
  'follows the densest section on the page, so it holds one sentence and nothing else',
  'four options that must be compared, and alignment is what makes them comparable',
  'the list is long, so a rail holds the reader\'s place while it scrolls'
]) check(`accepts a real reason: "${good.slice(0, 40)}…"`, isSubstantiveWhy(good))

const adjE: string[] = []
lockSketch({ beats: [{ arrangement: 'grid', anchor: 'top-left', focal: 'cards', why: 'creates a bold, modern feel' }], focalIndex: 0 }, [sections[0]!], adjE)
check('an unsubstantive reason is replaced and reported', adjE.some((a) => a.includes('not substantive')))

console.log('\nthe brief handed to a section\n')

const beat = fromNothing.beats[0]!
const block = sketchPromptBlock(beat, true)
check('states the arrangement', block.includes(beat.arrangement))
check('names the device to apply', block.includes('dev-') || block.includes('type-led'))
check('states where the mass hangs', block.includes(beat.anchor))
check('carries the reason through to the builder', block.includes(beat.why.slice(0, 20)))
check('tells the focal section it is the focal section', block.includes("page's strongest"))
check('a non-focal section is not told that', !sketchPromptBlock(beat, false).includes("page's strongest"))

console.log(failed ? `\nFAIL — ${failed} check(s)\n` : '\nPASS — the page composes before it builds\n')
process.exit(failed ? 1 : 0)
