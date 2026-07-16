/**
 * Pure builders: a file on disk → the rows that represent it.
 * Shared by the full rebuild and the single-file (incremental) ingest, so the two
 * can never disagree about how a file is chunked or what text gets embedded.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { InsertDoc } from '../retrieval/store.js'
import type { ComponentDoc, CritiqueDoc, MotionPrimitiveDoc, PlanPreferenceDoc } from '../types.js'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const KNOWLEDGE = join(ROOT, 'knowledge')

/** Repo-relative, forward-slashed. This is the identity of a file in the DB. */
export const rel = (p: string): string => relative(ROOT, resolve(p)).replace(/\\/g, '/')

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

// --- embed-text builders -----------------------------------------------------
// What we embed is NOT what we return. Never embed raw component code — it swamps the
// vector with syntax tokens and destroys semantic matching.

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

/** Short, human-scannable label so CLI output distinguishes chunks from the same site. */
const short = (s: string, n = 56): string => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`
}

const componentText = (c: ComponentDoc): string =>
  [c.name, `Category: ${c.category}`, `Tags: ${c.tags.join(', ')}`, c.notes ? `Notes: ${c.notes}` : '']
    .filter(Boolean)
    .join('\n')

const motionPrimitiveText = (m: MotionPrimitiveDoc): string =>
  [
    m.name,
    `Effect: ${m.effect}`,
    `Wraps: ${m.wraps}`,
    `Fits compositions: ${(m.fitsCompositions ?? []).join(', ')}`,
    `Motion language: ${(m.motion_language ?? []).join(', ')}`,
    `Tags: ${(m.tags ?? []).join(', ')}`,
    m.notes ? `Notes: ${m.notes}` : ''
  ]
    .filter(Boolean)
    .join('\n')

/** Guidelines are rulebooks — split on `## ` so each rule is independently retrievable. */
function splitMarkdown(md: string): Array<{ heading: string; body: string }> {
  const parts = md.split(/^##\s+/m)
  const out: Array<{ heading: string; body: string }> = []
  const preamble = parts[0]?.trim()
  if (preamble && preamble.replace(/^#\s+.*/m, '').trim().length > 40) {
    out.push({ heading: preamble.match(/^#\s+(.*)/m)?.[1] ?? 'overview', body: preamble })
  }
  for (const p of parts.slice(1)) {
    const nl = p.indexOf('\n')
    if (nl === -1) continue
    const heading = p.slice(0, nl).trim()
    const body = p.slice(nl + 1).trim()
    if (heading && body) out.push({ heading, body })
  }
  return out
}

/** Pull `tags: a, b, c` out of a guideline section so tag-y queries still hit. */
function tagsFromBody(body: string): string[] {
  const m = body.match(/^tags:\s*(.+)$/im)
  return m ? m[1].split(',').map((t) => t.trim()).filter(Boolean) : []
}

export class SkipFile extends Error {}

/**
 * Build the rows for one knowledge file. Which builder runs is decided by the file's
 * directory, so `knowledge/components/x.json` is always a component.
 * Throws SkipFile for scaffolds/malformed files the caller should skip, not crash on.
 */
export function buildDocsForFile(absPath: string): InsertDoc[] {
  const p = resolve(absPath)
  const sourcePath = rel(p)
  const base = p.split(/[\\/]/).pop()!

  if (sourcePath.startsWith('knowledge/critiques/')) {
    const c = readJson<CritiqueDoc>(p)
    if (!c.site || !Array.isArray(c.observations)) {
      throw new SkipFile(`malformed critique (needs site, observations[{what, why?}])`)
    }
    const filled = c.observations.filter((o) => o?.what?.trim())
    // An unfilled scaffold has nothing to embed — refuse rather than poison the index.
    if (filled.length === 0) {
      throw new SkipFile(`critique scaffold not filled in yet (observations is empty)`)
    }

    const slug = slugify(c.site)
    const tagLine = `Tags: ${(c.tags ?? []).join(', ')}`

    // ONE CHUNK PER OBSERVATION. A whole critique in a single vector averages a dozen
    // distinct claims into one point, and the specific technique becomes unfindable.
    // Payload stays the full critique so the agent gets context on any hit.
    const docs: InsertDoc[] = filled.map((o, i) => ({
      kind: 'critique' as const,
      doc_id: `${slug}#${i + 1}`,
      name: `${c.site} — ${short(o.what)}`,
      category: 'critique',
      tags: c.tags ?? [],
      source_path: sourcePath,
      embed_text: [c.site, tagLine, `What works: ${o.what}`, o.why ? `Why it works: ${o.why}` : '', o.avoid ? `Avoid: ${o.avoid}` : '']
        .filter(Boolean)
        .join('\n'),
      payload: { ...c, observation: o, observation_index: i }
    }))

    // The throughline is a different KIND of claim — it earns its own vector.
    if (c.throughline?.trim()) {
      docs.push({
        kind: 'critique',
        doc_id: `${slug}#throughline`,
        name: `${c.site} — throughline`,
        category: 'critique',
        tags: c.tags ?? [],
        source_path: sourcePath,
        embed_text: [c.site, tagLine, `Throughline: ${c.throughline}`].join('\n'),
        payload: { ...c, throughline: c.throughline }
      })
    }
    return docs
  }

  if (sourcePath.startsWith('knowledge/components/')) {
    const c = readJson<ComponentDoc>(p)
    if (!c.id || !c.code) throw new SkipFile('malformed component (needs id, code)')
    // Framework is DECLARED, never sniffed. Sniffing it from the code silently misclassifies
    // (multiline imports defeat the obvious regex), and a misclassified component gets
    // retrieved mid-generation and produces a broken hybrid page.
    if (c.framework !== 'react' && c.framework !== 'html') {
      throw new SkipFile(`component "${c.id}" needs an explicit "framework": "react" | "html"`)
    }
    return [
      {
        kind: 'component',
        doc_id: c.id,
        name: c.name,
        category: c.category,
        framework: c.framework,
        tags: c.tags ?? [],
        source_path: sourcePath,
        embed_text: componentText(c),
        payload: c
      }
    ]
  }

  if (sourcePath.startsWith('knowledge/motion-primitives/')) {
    const m = readJson<MotionPrimitiveDoc>(p)
    if (!m.id || !m.code) throw new SkipFile('malformed motion-primitive (needs id, code)')
    if (m.framework !== 'react' && m.framework !== 'html') {
      throw new SkipFile(`motion-primitive "${m.id}" needs an explicit "framework": "react" | "html"`)
    }
    return [
      {
        kind: 'motion-primitive',
        doc_id: m.id,
        name: m.name,
        category: m.effect,
        framework: m.framework,
        tags: m.tags ?? [],
        source_path: sourcePath,
        embed_text: motionPrimitiveText(m),
        payload: m
      }
    ]
  }

  if (sourcePath.startsWith('knowledge/plan-preferences/')) {
    const pp = readJson<PlanPreferenceDoc>(p)
    if (!pp.reason?.trim() || !Array.isArray(pp.rejectedSections)) {
      throw new SkipFile('malformed plan-preference (needs reason, rejectedSections[])')
    }
    const file = base.replace('.json', '')
    return [
      {
        kind: 'plan-preference',
        doc_id: file,
        name: `rejected ${pp.archetype || 'structure'}: ${short(pp.reason)}`,
        category: 'plan-preference',
        tags: pp.tags ?? [],
        source_path: sourcePath,
        // embed the REASON + mood + archetype so it retrieves for similar future briefs
        embed_text: [
          `Rejected a ${pp.archetype || 'generic'} page structure for a ${(pp.mood ?? []).join('/')} brief.`,
          `Rejected section sequence: ${pp.rejectedSections.join(', ')}`,
          `Reason to avoid: ${pp.reason}`,
          `Tags: ${(pp.tags ?? []).join(', ')}`
        ].join('\n'),
        payload: pp
      }
    ]
  }

  if (sourcePath.startsWith('knowledge/guidelines/') || sourcePath.startsWith('knowledge/layout-patterns/') || sourcePath.startsWith('knowledge/storytelling-patterns/') || sourcePath.startsWith('knowledge/hierarchy-patterns/') || sourcePath.startsWith('knowledge/visual-rhythm/') || sourcePath.startsWith('knowledge/ux-psychology/')) {
    const file = base.replace('.md', '')
    return splitMarkdown(readFileSync(p, 'utf8')).map(({ heading, body }) => ({
      kind: 'guideline' as const,
      doc_id: `${file}#${heading.toLowerCase().replace(/\s+/g, '-')}`,
      name: heading,
      category: file,
      tags: tagsFromBody(body),
      source_path: sourcePath,
      embed_text: `${file} — ${heading}\n${body}`,
      payload: { file, heading, body }
    }))
  }

  if (sourcePath.startsWith('knowledge/media-refs/') && base.endsWith('.md')) {
    const file = base.replace('.md', '')
    const body = readFileSync(p, 'utf8')
    return [
      {
        kind: 'media-ref',
        doc_id: file,
        name: file,
        category: 'media-ref',
        tags: [],
        source_path: sourcePath,
        embed_text: body,
        payload: { file, body }
      }
    ]
  }

  throw new SkipFile(`not a knowledge file (expected knowledge/{components,critiques,guidelines,layout-patterns,storytelling-patterns,hierarchy-patterns,visual-rhythm,ux-psychology,media-refs}/…)`)
}

