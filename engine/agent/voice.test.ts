/**
 * Voice lock.
 *
 * Two things are worth testing here and they pull in opposite directions:
 *
 *   - the lint must CATCH the failures that actually occurred (person drift measured on a real run,
 *     marketing filler, unquantified claims)
 *   - and it must stay QUIET on decent copy, because a lint that cries wolf gets ignored, and the
 *     genuine hits get ignored along with it
 *
 * The false-positive assertions below matter as much as the true-positive ones.
 */
import { lintVoice, voiceFor, visibleText, voicePromptBlock, BANNED_PHRASES } from './voice.js'
import { REGISTERS } from '../types.js'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failed++
}
const p = (s: string) => `<section><div><p>${s}</p></div></section>`

console.log('\nvoice spec\n')

for (const r of REGISTERS) {
  const v = voiceFor(r, [])
  check(`${r}: has a person`, ['second', 'first-plural', 'impersonal'].includes(v.person))
  check(`${r}: has an actionable address line`, v.address.length > 20)
  check(`${r}: has a sane sentence bound`, v.maxSentenceWords >= 12 && v.maxSentenceWords <= 30)
}

// Genre decides who is spoken to — the whole basis of the lock.
check('a product page addresses the reader', voiceFor('saas-product', []).person === 'second')
check('a studio speaks as itself', voiceFor('agency-studio', []).person === 'first-plural')
check('an editorial story addresses nobody', voiceFor('editorial-story', []).person === 'impersonal')

// Mood tightens rhythm without changing who is speaking.
const brut = voiceFor('saas-product', ['brutalist'])
check('brutalist mood shortens the sentence bound', brut.maxSentenceWords < voiceFor('saas-product', []).maxSentenceWords)
check('mood does not override the register person', brut.person === 'second')

console.log('\nlint — catches what actually went wrong\n')

const saas = voiceFor('saas-product', ['technical'])
const filler = p('Seamlessly empower your team to transform your workflow and take your deployments to the next level with our best-in-class platform.')
check('catches marketing filler', lintVoice(filler, saas).some((w) => w.includes('marketing filler')))
check('names the offending phrases', lintVoice(filler, saas).some((w) => w.includes('seamlessly')))

const vague = p('Our platform is dramatically faster and significantly more reliable than anything else your team has tried before now.')
check('catches unquantified intensifiers', lintVoice(vague, saas).some((w) => w.includes('unquantified')))
const quantified = p('Deploys resolve dramatically faster: median time to owner fell from 14 minutes to 40 seconds across 200 incidents.')
check('accepts an intensifier backed by numbers', !lintVoice(quantified, saas).some((w) => w.includes('unquantified')))

// The measured drift: an editorial page that starts addressing the reader.
const ed = voiceFor('editorial-story', ['premium'])
check('editorial rejects second-person copy', lintVoice(p('You will love this knife. Your kitchen deserves it. You deserve better tools for your cooking.'), ed).some((w) => w.includes('third person')))
check('editorial accepts third-person copy', !lintVoice(p('The blade is folded four times, then left to cool overnight before the edge is ground by hand.'), ed).some((w) => w.includes('third person')))

console.log('\nlint — stays quiet on decent copy\n')

// Real lines from a generated page that were genuinely good.
for (const good of [
  'What changed. What broke. Who to ask. Kettle answers all three before you open a dashboard.',
  'Blame is a fact, not an accusation. The deploy is on the record and the owner is already known.',
  'Free for up to three services. No card required, and nothing expires when you stop paying.'
]) {
  check(`quiet on: "${good.slice(0, 42)}…"`, lintVoice(p(good), saas).length === 0, lintVoice(p(good), saas).join(' | '))
}

check('ignores a section with almost no prose', lintVoice(p('Pricing'), saas).length === 0)
check('does not police code, only visible text', !visibleText('<div className="seamlessly-empower-grid" />').includes('seamlessly'))

console.log('\nprompt block\n')
const block = voicePromptBlock(saas, 'Kettle')
check('states the address', block.includes('Address:'))
check('names the brand', block.includes('Kettle'))
check('lists banned phrases', BANNED_PHRASES.slice(0, 5).every((b) => block.includes(b)))
check('forbids invented specifics', block.toLowerCase().includes('invented specifics'))

console.log(failed ? `\nFAIL — ${failed} check(s)\n` : '\nPASS — voice locked\n')
process.exit(failed ? 1 : 0)
