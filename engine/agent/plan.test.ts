/**
 * Register classification and the register structural floor.
 *
 * Both halves of this file exist because of silent failures, not hypotheticals:
 *
 *  - Every REGISTER_HINTS fallback in clampRegister was dead from the day it was written (a regex
 *    \b that had been corrupted into a literal backspace byte), so any brief whose register the
 *    model returned off-vocabulary collapsed to saas-product or editorial-story. Nothing failed;
 *    the pages just quietly all came out the same shape. These assertions are the alarm.
 *
 *  - The structural floor must stay a FLOOR. If it ever starts padding plans that already answer
 *    their register's obligations, every page in a genre converges on one skeleton — the exact
 *    "based entirely on one reference" failure the system is meant to avoid.
 */
import { clampRegister, applyRegisterBeats } from './plan.js'
import { REGISTERS } from '../types.js'
import type { SectionPlan } from './types.js'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failed++
}
const S = (name: string, intent: string): SectionPlan => ({ name, intent, composition: 'editorial', emphasis: 'md' })

console.log('\nregister classification\n')

// In-vocabulary values pass through untouched.
for (const r of REGISTERS) {
  check(`"${r}" passes through`, clampRegister(r, 'anything', []) === r)
}

// The keyword fallback — every one of these was dead.
const briefs: Array<[string, string]> = [
  ['a vet clinic in Bristol offering wellness plans and dental care', 'local-service-business'],
  ['open source CLI for managing kubernetes clusters', 'developer-tool'],
  ['B2B SaaS dashboard with subscription pricing', 'saas-product'],
  ['online shop selling handmade ceramics, cart and checkout', 'ecommerce-product'],
  ['a three-day design conference, tickets and lineup', 'event-launch'],
  ['my portfolio of selected works as a photographer', 'portfolio-showcase'],
  ['a creative studio helping brands find their voice', 'agency-studio'],
  ['a brand manifesto, an essay on slowness', 'editorial-story']
]
for (const [brief, want] of briefs) {
  const got = clampRegister('not-a-real-register', brief, [])
  check(`keyword fallback: "${brief.slice(0, 38)}…"`, got === want, `wanted ${want}, got ${got}`)
}

// Last resort when the brief says nothing recognisable.
check('last resort with technical mood is a product', clampRegister('x', 'zzz qqq', ['technical']) === 'saas-product')
check('last resort otherwise tells a story', clampRegister('x', 'zzz qqq', []) === 'editorial-story')

console.log('\nregister structural floor\n')

// A plan that already answers its obligations must be returned UNCHANGED.
const completeSaas = [
  S('hero', 'introduce the product'),
  S('features', 'capabilities'),
  S('customers', 'logos and results from real customers'),
  S('pricing', 'three plans'),
  S('get started', 'sign up free')
]
const untouched = applyRegisterBeats(completeSaas, 'saas-product')
check('complete plan is not padded', untouched.added.length === 0, `added ${untouched.added.join(', ')}`)
check('complete plan keeps its length', untouched.sections.length === completeSaas.length)

const completeVet = [
  S('hero', 'intro'),
  S('what we do', 'services'),
  S('our team', 'qualified vets, 20 years'),
  S('find us', 'opening hours and address'),
  S('book a visit', 'appointment')
]
check('synonyms count as answers', applyRegisterBeats(completeVet, 'local-service-business').added.length === 0)

// A thin plan gets exactly the missing jobs, appended, with the model's own order preserved.
const thin = [S('hero', 'introduce the product'), S('features', 'capabilities')]
const repaired = applyRegisterBeats(thin, 'saas-product')
check('thin plan gains the missing beats', repaired.added.length > 0)
check('original sections keep their order', repaired.sections.slice(0, 2).map((s) => s.name).join(',') === 'hero,features')
check('every added section has a real intent', repaired.sections.every((s) => s.intent.trim().length > 10))
check('additions are reported, not silent', repaired.added.length === repaired.sections.length - thin.length)

// The floor must differ by register, or it is a template wearing a floor's clothes.
const asSaas = applyRegisterBeats(thin, 'saas-product').added.join(',')
const asStory = applyRegisterBeats(thin, 'editorial-story').added.join(',')
const asLocal = applyRegisterBeats(thin, 'local-service-business').added.join(',')
check('different registers impose different obligations', new Set([asSaas, asStory, asLocal]).size === 3, `${asSaas} / ${asStory} / ${asLocal}`)

// Every register must be able to repair an empty plan — a missing table would silently do nothing.
for (const r of REGISTERS) {
  const out = applyRegisterBeats([], r)
  check(`"${r}" defines obligations`, out.added.length >= 3, `only ${out.added.length}`)
}

console.log(failed ? `\nFAIL — ${failed} check(s)\n` : '\nPASS — register classification and floor correct\n')
process.exit(failed ? 1 : 0)
