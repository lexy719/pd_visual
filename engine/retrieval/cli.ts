/**
 * query-knowledge CLI — the phase-1 deliverable. Verify retrieval quality before
 * any generation agent exists.
 *
 *   npm run query -- "hero section, motorsport, dark, video background"
 *   npm run query -- "pricing table" --kind component --k 5
 *   npm run query -- "hero with video" --grouped --mood "motorsport, aggressive, dark"
 *   npm run query -- "aggressive color scheme" --full
 *
 * --grouped + --mood is exactly what the agent loop retrieves for one section:
 * components matched on structure, guidelines/critiques matched on mood.
 */

import { existsSync } from 'node:fs'
import { queryKnowledge, retrieveForSection } from './query.js'
import { DB_PATH } from './store.js'
import type { DocKind, Framework, SearchHit } from '../types.js'

const KINDS: DocKind[] = ['component', 'guideline', 'critique', 'media-ref']
const FRAMEWORKS: Framework[] = ['react', 'html']

function parseArgs(argv: string[]): {
  q: string
  kind?: DocKind
  framework?: Framework
  k: number
  grouped: boolean
  full: boolean
  mood?: string
  maxPerSource?: number
} {
  const words: string[] = []
  let kind: DocKind | undefined
  let framework: Framework | undefined
  let k = 5
  let grouped = false
  let full = false
  let mood: string | undefined
  let maxPerSource: number | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--kind') {
      const v = argv[++i] as DocKind
      if (!KINDS.includes(v)) throw new Error(`--kind must be one of: ${KINDS.join(', ')}`)
      kind = v
    } else if (a === '--framework') {
      const v = argv[++i] as Framework
      if (!FRAMEWORKS.includes(v)) throw new Error(`--framework must be one of: ${FRAMEWORKS.join(', ')}`)
      framework = v
    } else if (a === '--k') {
      k = Number(argv[++i])
      if (!Number.isFinite(k) || k < 1) throw new Error('--k must be a positive number')
    } else if (a === '--mood') {
      mood = argv[++i]
      if (!mood) throw new Error('--mood needs a value, e.g. --mood "motorsport, dark"')
    } else if (a === '--max-per-source') {
      maxPerSource = Number(argv[++i])
      if (!Number.isInteger(maxPerSource) || maxPerSource < 1) throw new Error('--max-per-source must be a positive integer')
    } else if (a === '--grouped') grouped = true
    else if (a === '--full') full = true
    else words.push(a)
  }
  return { q: words.join(' ').trim(), kind, framework, k, grouped, full, mood, maxPerSource }
}

/** Colour-free score bar so results are scannable in any terminal. */
const bar = (score: number): string => '█'.repeat(Math.max(0, Math.round(score * 10))).padEnd(10, '·')

function printHit(h: SearchHit, full: boolean): void {
  const tags = h.tags.length ? `  [${h.tags.join(', ')}]` : ''
  const fw = h.framework ? `<${h.framework}> ` : ''
  console.log(`  ${bar(h.score)} ${h.score.toFixed(3)}  ${h.kind.padEnd(9)} ${fw}${h.name}${tags}`)
  console.log(`  ${' '.repeat(10)}          ${h.source_path}`)
  if (full) {
    const preview = h.embed_text.replace(/\s+/g, ' ').slice(0, 240)
    console.log(`  ${' '.repeat(10)}          "${preview}${h.embed_text.length > 240 ? '…' : ''}"`)
  }
}

async function main(): Promise<void> {
  const { q, kind, framework, k, grouped, full, mood, maxPerSource } = parseArgs(process.argv.slice(2))
  if (!q) {
    console.error(
      'Usage: npm run query -- "<query>" [--kind component|guideline|critique|media-ref] [--framework react|html] [--k N] [--grouped] [--mood "tags"] [--full]'
    )
    process.exit(1)
  }
  if (!existsSync(DB_PATH)) {
    console.error(`No knowledge DB yet. Populate /knowledge then run:  npm run ingest`)
    process.exit(1)
  }

  const filters = [kind && `kind=${kind}`, framework && `framework=${framework}`].filter(Boolean).join(' ')
  console.log(`\nquery: "${q}"${mood ? `  mood: "${mood}"` : ''}${filters ? `  (${filters})` : ''}\n`)

  if (grouped) {
    // Exactly what the agent loop will retrieve for one section.
    const { guidelines, critiques, motionPrimitives } = await retrieveForSection(q, { mood, framework })
    for (const [label, hits] of [
      ['GUIDELINES', guidelines],
      ['CRITIQUES', critiques],
      ['MOTION-PRIMITIVES', motionPrimitives]
    ] as const) {
      console.log(`${label}`)
      if (!hits.length) console.log('  (none)')
      hits.forEach((h) => printHit(h, full))
      console.log('')
    }
    return
  }

  const hits = await queryKnowledge(q, { k, kind, framework, maxPerSource })
  if (!hits.length) {
    console.log('  no results')
    return
  }
  hits.forEach((h) => printHit(h, full))
  console.log('')
}

main().catch((err) => {
  console.error(`\nQuery failed: ${(err as Error).message}`)
  process.exit(1)
})
