/**
 * Self-critique step. Runs BEFORE showing output. Two passes:
 *   - mechanical: cheap, deterministic checks (known-bad components, illegal imports, missing padding)
 *   - guideline: an LLM review of each section's code against the guideline rules it was given
 * Produces a flat list of findings. It flags; it does not rewrite (phase 1).
 */

import { completeBulk, extractJson } from '../llm/llm.js'
import type { ComponentDoc, SearchHit } from '../types.js'
import type { GenerateResult } from './generate.js'
import type { SectionResult } from './types.js'

export interface Finding {
  section: string
  severity: 'warn' | 'flag'
  issue: string
}

const importsOf = (code: string): string[] =>
  [...code.matchAll(/import\s+[^'"]*['"]([^'"]+)['"]/g)].map((m) => m[1])

/** Cheap checks that never need the model. */
function mechanical(gen: GenerateResult): Finding[] {
  const out: Finding[] = []
  for (const s of gen.sections) {
    const label = `${s.index}:${s.name}`

    if (s.strategy === 'motion-primitive' && s.motionPrimitiveId) {
      const comp = gen.usedComponents.get(s.motionPrimitiveId)
      const notes = comp?.notes ?? ''
      if (/WARNING|scroll-jack|reduced-motion|invisible/i.test(notes)) {
        out.push({
          section: label,
          severity: 'flag',
          issue: `uses ${s.motionPrimitiveId}, which carries a known caveat: "${notes.replace(/\s+/g, ' ').slice(0, 140)}"`
        })
      }
    }

    if (s.strategy === 'scratch') {
      const bad = importsOf(s.code).filter((m) => m !== 'react' && m !== 'react-dom')
      if (bad.length) {
        out.push({
          section: label,
          severity: 'warn',
          issue: `scratch section imports ${bad.join(', ')} — those imports are stripped at write time (pure Tailwind expected); check nothing relied on them.`
        })
      }
      if (!/\bp[ytb]?-\d|padding/.test(s.code)) {
        out.push({ section: label, severity: 'warn', issue: 'no obvious vertical padding — guideline wants 96-140px section padding.' })
      }
    }
  }
  return out
}

function ruleDigest(hits: SearchHit[]): string {
  return hits
    .map((h) => {
      const p = h.payload as { heading?: string; body?: string }
      return `${p.heading ?? h.name}: ${(p.body ?? h.embed_text).replace(/\s+/g, ' ').slice(0, 220)}`
    })
    .join('\n')
}

const SYSTEM = `You are a design QA reviewer. You are given ONE page section's React/Tailwind code and the
specific design rules it was supposed to follow. List concrete violations only — contrast, spacing scale,
type hierarchy, too many accents, generic copy, accessibility. Be terse and specific. If it's fine, return [].
Respond with ONLY JSON: [ { "issue": "<one specific violation>" } ]`

async function guidelineReview(section: SectionResult): Promise<Finding[]> {
  const rules = ruleDigest(section.retrieved.guidelines)
  if (!rules) return []
  const user = `Section: ${section.name} (${section.composition})\n\nRules it should follow:\n${rules}\n\n--- code ---\n${section.code.slice(0, 4000)}\n--- end ---`
  try {
    const arr = extractJson<Array<{ issue?: string }>>(await completeBulk(SYSTEM, user, { temperature: 0.2, maxTokens: 500 }))
    return arr
      .filter((x) => x?.issue)
      .slice(0, 4)
      .map((x) => ({ section: `${section.index}:${section.name}`, severity: 'warn' as const, issue: String(x.issue) }))
  } catch {
    return [] // a malformed critique reply shouldn't sink the run
  }
}

export async function critique(gen: GenerateResult, log: (m: string) => void = () => {}): Promise<Finding[]> {
  const findings = mechanical(gen)
  for (const s of gen.sections) {
    log(`  reviewing [${s.index}] ${s.name}…`)
    findings.push(...(await guidelineReview(s)))
  }
  return findings
}

export type { ComponentDoc }
