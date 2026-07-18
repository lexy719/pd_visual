/**
 * The locked VOICE — one way of speaking for the whole page.
 *
 * WHY THIS EXISTS
 *
 * Every other layer of this system is locked: palette, type, spacing, motion, scroll, reveal,
 * imagery, structure. Words were the last thing running on pure model default, and because sections
 * are generated independently, the page drifts. Measured on a real run: one section used "you/your"
 * eleven times and "we/our" four, while every other section used them once or not at all, and
 * another was written entirely in third person. Three voices on one page. A reader will not name
 * that, but they feel the page change personality halfway down.
 *
 * It is also the most audible layer. A reader forgives imperfect spacing and instantly clocks
 * "empower your team to seamlessly transform deployments". Perfect composition does not survive
 * generated-sounding words.
 *
 * WHAT THIS CAN AND CANNOT DO — stated plainly, because the limit is real
 *
 * Voice is less deterministic than CSS. A padding value can be stamped; good writing cannot. What is
 * enforceable is the FLOOR and the CONSISTENCY: banned phrases are a hard check, person-drift is
 * measurable, and unquantified superlatives are detectable. Expect this to stop bad writing and hold
 * one register across seven sections. It will not manufacture brilliance.
 */
import type { Register } from '../types.js'
import type { Mood } from './types.js'

/** Who the page speaks as. Mixing these within a page is the drift this lock prevents. */
export type Person = 'second' | 'first-plural' | 'impersonal'

export interface VoiceSpec {
  person: Person
  /** how the prompt should describe the address, in words the model can act on */
  address: string
  /** upper bound for a typical sentence; a rhythm, not a hard cap on every line */
  maxSentenceWords: number
  /** the sentence character this page commits to */
  rhythm: string
  /** whether the page may assert quality, or must show the thing instead */
  evidence: 'show' | 'claim-ok'
}

/**
 * Register decides person, because genre decides who is being spoken to. A product page addresses a
 * reader deciding something ("you"); a studio speaks as itself ("we"); an editorial story speaks
 * about its subject and putting "you" in it breaks the spell.
 */
const VOICE_BY_REGISTER: Record<Register, VoiceSpec> = {
  'saas-product': { person: 'second', address: 'address the reader directly as "you"; never "we" except in a named guarantee', maxSentenceWords: 18, rhythm: 'short declaratives; the shortest sentence carries the most important idea', evidence: 'show' },
  'developer-tool': { person: 'second', address: 'address the developer as "you"; never marketing-plural "we"', maxSentenceWords: 16, rhythm: 'terse and technical; no sentence that a README would not print', evidence: 'show' },
  'ecommerce-product': { person: 'second', address: 'address the buyer as "you"', maxSentenceWords: 18, rhythm: 'concrete and sensory; name materials and dimensions, not feelings about them', evidence: 'show' },
  'local-service-business': { person: 'first-plural', address: 'speak as the business, "we", to a reader addressed as "you"', maxSentenceWords: 20, rhythm: 'plain and warm; the way a competent person explains something in the room', evidence: 'claim-ok' },
  'agency-studio': { person: 'first-plural', address: 'speak as the studio, "we"; the reader is "you" only in the invitation to talk', maxSentenceWords: 22, rhythm: 'confident, unpadded; the work carries the claim', evidence: 'show' },
  'portfolio-showcase': { person: 'first-plural', address: 'speak as the maker, "I" or "we", sparingly; mostly let the work speak', maxSentenceWords: 24, rhythm: 'quiet and specific; captions rather than pitches', evidence: 'show' },
  'event-launch': { person: 'second', address: 'address the prospective attendee as "you"', maxSentenceWords: 18, rhythm: 'immediate and dated; facts before atmosphere', evidence: 'claim-ok' },
  'editorial-story': { person: 'impersonal', address: 'do NOT address the reader as "you"; write about the subject in third person', maxSentenceWords: 28, rhythm: 'varied sentence length; long sentences that earn their length, broken by short ones', evidence: 'show' }
}

/** Mood nudges rhythm without overriding the register's person. */
export function voiceFor(register: Register, mood: Mood[]): VoiceSpec {
  const base = { ...VOICE_BY_REGISTER[register] }
  if (mood.includes('brutalist') || mood.includes('aggressive')) {
    base.maxSentenceWords = Math.min(base.maxSentenceWords, 14)
    base.rhythm = 'blunt and short; no subordinate clauses'
  } else if (mood.includes('technical')) {
    base.evidence = 'show'
    base.maxSentenceWords = Math.min(base.maxSentenceWords, 18)
  }
  return base
}

/**
 * Phrases that mark text as machine-written.
 *
 * Kept to expressions that are almost never the right choice in real copy. Anything defensible in
 * context is left out on purpose — a lint that cries wolf gets ignored, and then the genuine hits
 * get ignored with it.
 */
export const BANNED_PHRASES = [
  'seamlessly', 'effortlessly', 'game-chang', 'cutting-edge', 'best-in-class', 'world-class',
  'revolutioniz', 'revolutionis', 'take your', 'to the next level', 'unlock the power',
  'in today\'s fast-paced', 'in the digital age', 'empower', 'leverage', 'harness the power',
  'elevate your', 'transform your', 'supercharge', 'unparalleled', 'state-of-the-art',
  'one-stop shop', 'look no further', 'we\'ve got you covered', 'the future of'
] as const

/** Superlatives that mean nothing without a number attached. */
const VAGUE_INTENSIFIERS = ['dramatically', 'incredibly', 'significantly', 'massively', 'exponentially', 'lightning-fast', 'blazing']

/** Extract the visible prose from a section: JSX text nodes and string literals, not code. */
export function visibleText(code: string): string {
  const between = [...code.matchAll(/>([^<>{}]{4,})</g)].map((m) => m[1]!)
  return between.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Lint a section's copy against the locked voice.
 *
 * Reports mechanisms, not vibes: which phrase, which pronoun, which unquantified claim — so the
 * escalation prompt can act on it rather than rewriting cosmetically.
 */
export function lintVoice(code: string, spec: VoiceSpec): string[] {
  const warns: string[] = []
  const text = visibleText(code)
  if (text.length < 40) return warns // a section with almost no prose has no voice to police
  const lower = text.toLowerCase()

  const hits = BANNED_PHRASES.filter((p) => lower.includes(p))
  if (hits.length) {
    warns.push(`marketing filler in the copy: ${hits.map((h) => `"${h}"`).join(', ')} — say the specific thing instead`)
  }

  const vague = VAGUE_INTENSIFIERS.filter((v) => lower.includes(v))
  // Only a problem when nothing numeric backs it up.
  if (vague.length && !/\d/.test(text)) {
    warns.push(`unquantified intensifier${vague.length > 1 ? 's' : ''} ${vague.map((v) => `"${v}"`).join(', ')} with no number anywhere in the section — give the figure or drop the claim`)
  }

  // Person drift: the measured failure. Counts are compared, not merely detected, because one
  // stray pronoun is fine and a section built around the wrong one is not.
  const you = (lower.match(/\byou\b|\byour\b/g) ?? []).length
  const we = (lower.match(/\bwe\b|\bour\b|\bwe're\b/g) ?? []).length
  if (spec.person === 'impersonal' && you >= 3) {
    warns.push(`this page speaks about its subject, not to the reader, but the section uses "you/your" ${you} times — rewrite in third person`)
  }
  if (spec.person === 'second' && we >= 4 && we > you) {
    warns.push(`the page addresses the reader as "you", but this section is written as "we" (${we} vs ${you}) — turn the claims around to face the reader`)
  }
  if (spec.person === 'first-plural' && you > 0 && we === 0 && you >= 4) {
    warns.push(`the page speaks as the business ("we"), but this section only uses "you" (${you}) — the brand should be present`)
  }

  // Sentence rhythm — flag only a clear breach of the committed register, not every long line.
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length > 2)
  const overlong = sentences.filter((s) => s.split(/\s+/).length > spec.maxSentenceWords + 10)
  if (overlong.length >= 2) {
    warns.push(`${overlong.length} sentences run well past the page's committed rhythm (~${spec.maxSentenceWords} words) — break them or cut them`)
  }

  return warns
}

/** The voice block injected into every section prompt, so the lock is upstream as well as downstream. */
export function voicePromptBlock(spec: VoiceSpec, brand: string): string {
  return `VOICE (locked for the whole page — every section shares it):
- Address: ${spec.address}.
- Rhythm: ${spec.rhythm}. Aim under ~${spec.maxSentenceWords} words per sentence.
- ${spec.evidence === 'show' ? 'SHOW, do not claim. Replace any adjective about quality with the concrete fact that earned it — a number, a material, a name, a duration.' : 'Claims are allowed but must stay specific and checkable.'}
- Never write: ${BANNED_PHRASES.slice(0, 12).join(', ')}, or anything in that register.
- Write about ${brand} as a real thing with real details. Invented specifics are worse than none: if you do not have a number, write a sentence that does not need one.`
}
